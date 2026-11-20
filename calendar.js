// Calendrier des notes
// Tes notes programmées sur 15 jours, rangées dans tes créneaux quotidiens.
// Glisse une note vers un autre créneau pour la reprogrammer (si le créneau
// est pris, les deux notes échangent leur place), ou utilise ses boutons
// « Modifier » (ouvre la note dans l'éditeur), « Reprogrammer » (choisir une
// autre date) et « Supprimer ». Les posts
// programmés de ta publication s'affichent aussi, en lecture seule.
// S'ouvre depuis le planning de l'éditeur, le popup de l'extension, ou toute
// adresse substack.com se terminant par #calendrier.

const CAL_HASH = "#calendrier";
const CAL_DEFAULT_SLOTS = ["08:00", "12:30", "18:00"];
const CAL_SLOT_MARGIN = 60 * 60 * 1000; // une note à une heure près occupe le créneau
const CAL_DAYS = 15;
const CAL_MAX_DAYS_AHEAD = 90; // Substack refuse de programmer plus loin

const cal = {
  el: null,
  start: null, // premier des 15 jours affichés
  slots: CAL_DEFAULT_SLOTS,
  notes: [], // { id, at, text, draft }
  posts: [], // { id, at, title, url }
  postsError: "",
  message: "",
  saving: false,
  editing: null, // { id, mode: "move" | "delete" } : carte ouverte sur ses actions
};

chrome.storage.local.get(["slots"], (data) => {
  if (data.slots?.length) cal.slots = data.slots;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.slots) {
    cal.slots = changes.slots.newValue?.length ? changes.slots.newValue : CAL_DEFAULT_SLOTS;
    renderCalendar();
  }
});

// ---------- Données ----------

async function loadNotes() {
  const response = await fetch("/api/v1/feed/drafts?limit=100", { credentials: "include" });
  const data = await response.json();
  cal.notes = (data.drafts || [])
    .filter((draft) => draft.trigger_at)
    .map((draft) => ({ id: draft.id, at: new Date(draft.trigger_at), text: draft.body || "", draft }));
}

// Les posts sont sur le domaine de la publication : c'est le service de fond
// de l'extension qui va les chercher (le site substack.com n'y a pas accès).
async function loadPosts() {
  cal.postsError = "";
  try {
    const profile = await fetch("/api/v1/user/profile/self", { credentials: "include" }).then((r) => r.json());
    const subdomain = profile.primaryPublication?.subdomain;
    if (!subdomain) {
      cal.posts = [];
      return;
    }
    const host = `${subdomain}.substack.com`;
    const result = await chrome.runtime.sendMessage({ type: "scheduledPosts", host });
    if (result?.error) throw new Error(result.error);
    cal.posts = (result?.posts || []).map((post) => ({
      id: post.id,
      at: new Date(post.trigger_at),
      title: post.title || "Sans titre",
      url: `https://${host}/publish/post/${post.id}`,
    }));
  } catch {
    cal.posts = [];
    cal.postsError = "Impossible de charger les posts programmés.";
  }
}

async function loadCalendar() {
  cal.message = "Chargement…";
  renderCalendar();
  try {
    await Promise.all([loadNotes(), loadPosts()]);
    cal.message = "";
  } catch {
    cal.message = "Impossible de charger tes notes programmées.";
  }
  renderCalendar();
}

// Change la date d'une note. Substack demande de renvoyer la note entière
// (texte et pièces jointes) avec la nouvelle date.
async function rescheduleNote(note, date) {
  const { draft } = note;
  const response = await fetch(`/api/v1/feed/comment/${note.id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      bodyJson: draft.body_json,
      attachmentIds: (draft.attachments || []).map((attachment) => attachment.id),
      replyMinimumRole: draft.reply_minimum_role || "everyone",
      trigger_at: date.toISOString(),
    }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `erreur ${response.status}`);
  }
  note.at = date;
  note.draft = { ...draft, trigger_at: date.toISOString() };
}

// Supprime définitivement la note (même requête que le bouton de Substack).
async function deleteNote(note) {
  const response = await fetch(`/api/v1/comment/${note.id}`, { method: "DELETE", credentials: "include" });
  if (!response.ok) throw new Error(`erreur ${response.status}`);
  cal.notes = cal.notes.filter((n) => n !== note);
}

// ---------- Dates ----------


function addDays(date, days) {
  const day = new Date(date);
  day.setDate(day.getDate() + days);
  return day;
}

function atTime(day, time) {
  const [h, m] = time.split(":").map(Number);
  const date = new Date(day);
  date.setHours(h, m, 0, 0);
  return date;
}

const calSameDay = (a, b) => a.toDateString() === b.toDateString();
const calTime = (date) => date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const calDay = (date) => date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

// Chaque créneau du jour avec la note qui l'occupe, plus les notes hors créneau.
function calDayRows(day) {
  const notes = cal.notes.filter((note) => calSameDay(note.at, day)).sort((a, b) => a.at - b.at);
  const used = new Set();
  const rows = cal.slots.map((time) => {
    const at = atTime(day, time);
    const note = notes.find((n) => !used.has(n) && Math.abs(n.at - at) <= CAL_SLOT_MARGIN);
    if (note) used.add(note);
    return { at, note, slot: true };
  });
  for (const note of notes) if (!used.has(note)) rows.push({ at: note.at, note, slot: false });
  return rows.sort((a, b) => a.at - b.at);
}

// ---------- Glisser-déposer ----------

let dragged = null;

async function dropOn(row) {
  const note = dragged;
  dragged = null;
  if (!note || cal.saving || row.note === note) return;
  if (row.at < new Date()) {
    flash("Ce créneau est déjà passé.");
    return;
  }

  // Créneau occupé : les deux notes échangent leur place.
  const other = row.note;
  const from = note.at;
  cal.saving = true;
  flash("Reprogrammation…");
  try {
    await rescheduleNote(note, row.at);
    if (other) await rescheduleNote(other, from);
    flash(other ? "Notes échangées ✓" : `Note déplacée au ${calDay(row.at)} · ${calTime(row.at)} ✓`);
  } catch (error) {
    flash(`Oups, ça n'a pas marché (${error.message}).`);
    await loadNotes().catch(() => {});
  } finally {
    cal.saving = false;
    renderCalendar();
    refreshPlanning();
  }
}

// Le planning à côté de l'éditeur (content.js) se met à jour s'il est ouvert.
function refreshPlanning() {
  if (typeof loadScheduled === "function" && typeof planning !== "undefined" && planning) loadScheduled();
}

// ---------- Nouvelle note sur un créneau libre ----------

// Un clic sur une case libre ferme le calendrier et ouvre l'éditeur, avec ce
// créneau déjà choisi dans le planning (bouton « Programmer et nouvelle note »).
function composeAt(date) {
  closeNotesCalendar();
  chooseSlot(date);
  const button = document.querySelector(COMPOSER_BUTTON);
  if (button) {
    button.click();
  } else {
    // Pas de bouton d'écriture sur cette page : on passe par l'accueil.
    try {
      sessionStorage.setItem(CHOSEN_KEY, date.toISOString());
    } catch {}
    location.href = "https://substack.com/home?action=compose";
  }
}

// ---------- Modifier / Reprogrammer / Supprimer ----------

async function moveNoteTo(note, date) {
  if (!(date > new Date())) {
    flash("Choisis une date à venir.");
    return;
  }
  cal.saving = true;
  flash("Reprogrammation…");
  try {
    await rescheduleNote(note, date);
    cal.editing = null;
    flash(`Note reprogrammée au ${calDay(date)} · ${calTime(date)} ✓`);
  } catch (error) {
    flash(`Oups, ça n'a pas marché (${error.message}).`);
  } finally {
    cal.saving = false;
    renderCalendar();
    refreshPlanning();
  }
}

async function removeNote(note) {
  cal.saving = true;
  flash("Suppression…");
  try {
    await deleteNote(note);
    cal.editing = null;
    flash("Note supprimée ✓");
  } catch (error) {
    flash(`Oups, ça n'a pas marché (${error.message}).`);
  } finally {
    cal.saving = false;
    renderCalendar();
    refreshPlanning();
  }
}

function editNote(note, mode) {
  cal.editing = mode ? { id: note.id, mode } : null;
  renderCalendar();
}

const dateValue = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// Petit formulaire dans la carte : nouvelle date, puis un créneau ou une heure libre.
function moveForm(note) {
  const form = document.createElement("form");
  form.className = "snc-form";
  const today = new Date();
  form.innerHTML = `
    <label>Jour <input type="date" name="day" required></label>
    <label>Heure <input type="time" name="time" required></label>
    <div class="snc-form-slots"></div>
    <div class="snc-form-actions">
      <button type="submit" class="snc-primary">Reprogrammer</button>
      <button type="button" class="snc-cancel">Annuler</button>
    </div>
  `;
  const day = form.elements.day;
  const time = form.elements.time;
  day.min = dateValue(today);
  day.max = dateValue(addDays(today, CAL_MAX_DAYS_AHEAD));
  day.value = dateValue(note.at);
  time.value = calTime(note.at);
  const slotsEl = form.querySelector(".snc-form-slots");
  for (const slot of cal.slots) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "snc-chip";
    chip.textContent = slot;
    chip.addEventListener("click", () => (time.value = slot));
    slotsEl.appendChild(chip);
  }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const [y, m, d] = day.value.split("-").map(Number);
    moveNoteTo(note, atTime(new Date(y, m - 1, d), time.value));
  });
  form.querySelector(".snc-cancel").addEventListener("click", () => editNote(note, null));
  return form;
}

function deleteConfirm(note) {
  const box = document.createElement("div");
  box.className = "snc-form";
  box.innerHTML = `
    <p class="snc-warn">Supprimer définitivement cette note ?</p>
    <div class="snc-form-actions">
      <button type="button" class="snc-danger">Supprimer</button>
      <button type="button" class="snc-cancel">Annuler</button>
    </div>
  `;
  box.querySelector(".snc-danger").addEventListener("click", () => removeNote(note));
  box.querySelector(".snc-cancel").addEventListener("click", () => editNote(note, null));
  return box;
}

let flashTimer = null;
function flash(text) {
  cal.message = text;
  renderCalendar();
  clearTimeout(flashTimer);
  if (!/…$/.test(text)) flashTimer = setTimeout(() => ((cal.message = ""), renderCalendar()), 4000);
}

// ---------- Affichage ----------

function noteCard(note) {
  const card = document.createElement("div");
  card.className = "snc-note";
  card.draggable = note.at > new Date() && !cal.saving;
  card.title = note.text;
  const time = document.createElement("span");
  time.className = "snc-card-time";
  time.textContent = calTime(note.at);
  const text = document.createElement("span");
  text.className = "snc-card-text";
  text.textContent = note.text.trim() || "(note sans texte)";
  card.append(time, text);
  if (note.draft.attachments?.length) {
    const clip = document.createElement("span");
    clip.className = "snc-card-attach";
    clip.textContent = `📎 ${note.draft.attachments.length}`;
    card.appendChild(clip);
  }
  const editing = cal.editing?.id === note.id ? cal.editing.mode : null;
  if (editing) {
    card.draggable = false;
    card.classList.add("snc-editing");
    card.appendChild(editing === "move" ? moveForm(note) : deleteConfirm(note));
  } else if (!cal.saving) {
    const actions = document.createElement("div");
    actions.className = "snc-actions";
    actions.innerHTML = `
      <a class="snc-act snc-act-edit" title="Ouvrir la note dans l'éditeur de Substack">Modifier</a>
      <button type="button" class="snc-act snc-act-move" title="Choisir une autre date">Reprogrammer</button>
      <button type="button" class="snc-act snc-act-delete" title="Supprimer la note">Supprimer</button>
    `;
    // L'éditeur de Substack s'ouvre sur un brouillon avec ?action=compose&draftId= dans l'adresse.
    actions.querySelector(".snc-act-edit").href = `https://substack.com/home?action=compose&draftId=${note.id}`;
    actions.querySelector(".snc-act-move").addEventListener("click", () => editNote(note, "move"));
    actions.querySelector(".snc-act-delete").addEventListener("click", () => editNote(note, "delete"));
    card.appendChild(actions);
  }
  card.addEventListener("dragstart", (e) => {
    dragged = note;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(note.id));
    requestAnimationFrame(() => card.classList.add("snc-dragging"));
  });
  card.addEventListener("dragend", () => {
    card.classList.remove("snc-dragging");
    cal.el?.querySelectorAll(".snc-over").forEach((el) => el.classList.remove("snc-over"));
  });
  return card;
}

function postCard(post) {
  const card = document.createElement("a");
  card.className = "snc-post";
  card.href = post.url;
  card.target = "_blank";
  card.rel = "noopener";
  card.title = `${post.title} — ouvrir dans l'éditeur`;
  const time = document.createElement("span");
  time.className = "snc-card-time";
  time.textContent = `Post · ${calTime(post.at)}`;
  const text = document.createElement("span");
  text.className = "snc-card-text";
  text.textContent = post.title;
  card.append(time, text);
  return card;
}

function slotCell(row) {
  const cell = document.createElement("div");
  cell.className = "snc-slot";
  const past = row.at < new Date();
  if (past) cell.classList.add("snc-past");
  if (!row.slot) cell.classList.add("snc-extra");
  if (row.note) {
    cell.appendChild(noteCard(row.note));
  } else {
    const empty = document.createElement(past ? "span" : "button");
    empty.className = "snc-empty";
    empty.textContent = `${calTime(row.at)} · ${past ? "—" : "libre"}`;
    if (!past) {
      empty.type = "button";
      empty.title = "Écrire une nouvelle note pour ce créneau";
      empty.addEventListener("click", () => composeAt(row.at));
    }
    cell.appendChild(empty);
  }
  if (!past) {
    cell.addEventListener("dragover", (e) => {
      if (!dragged) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      cell.classList.add("snc-over");
    });
    cell.addEventListener("dragleave", () => cell.classList.remove("snc-over"));
    cell.addEventListener("drop", (e) => {
      e.preventDefault();
      cell.classList.remove("snc-over");
      dropOn(row);
    });
  }
  return cell;
}

function renderCalendar() {
  if (!cal.el) return;
  const today = new Date();
  const end = addDays(cal.start, CAL_DAYS - 1);
  const range = `${cal.start.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} – ${end.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`;

  cal.el.innerHTML = `
    <div class="snc-panel" role="dialog" aria-label="Calendrier des notes">
      <header class="snc-head">
        <h2>Calendrier des notes</h2>
        <div class="snc-nav">
          <button type="button" class="snc-prev" aria-label="15 jours plus tôt">‹</button>
          <button type="button" class="snc-today">Aujourd'hui</button>
          <button type="button" class="snc-next" aria-label="15 jours plus tard">›</button>
          <span class="snc-range"></span>
        </div>
        <p class="snc-msg" aria-live="polite"></p>
        <button type="button" class="snc-close" aria-label="Fermer">×</button>
      </header>
      <p class="snc-hint">Glisse une note vers un autre créneau pour la reprogrammer (sur un créneau pris, les deux notes échangent leur place), ou passe la souris dessus pour la modifier, la reprogrammer ou la supprimer. Clique sur une case libre pour écrire une nouvelle note à ce créneau. Les posts sont en lecture seule.</p>
      <div class="snc-week"></div>
    </div>
  `;
  cal.el.querySelector(".snc-range").textContent = range;
  cal.el.querySelector(".snc-msg").textContent = cal.message || cal.postsError;
  cal.el.querySelector(".snc-prev").addEventListener("click", () => shiftDays(-CAL_DAYS));
  cal.el.querySelector(".snc-next").addEventListener("click", () => shiftDays(CAL_DAYS));
  cal.el.querySelector(".snc-today").addEventListener("click", () => {
    cal.start = startOfDay(new Date());
    renderCalendar();
  });
  cal.el.querySelector(".snc-close").addEventListener("click", closeNotesCalendar);
  cal.el.querySelector(".snc-panel").classList.toggle("snc-saving", cal.saving);

  const week = cal.el.querySelector(".snc-week");
  for (let i = 0; i < CAL_DAYS; i++) {
    const day = addDays(cal.start, i);
    const column = document.createElement("section");
    column.className = "snc-day";
    if (calSameDay(day, today)) column.classList.add("snc-is-today");
    if (day < startOfDay(today)) column.classList.add("snc-day-past");
    const title = document.createElement("h3");
    title.textContent = calDay(day);
    column.appendChild(title);
    for (const post of cal.posts.filter((p) => calSameDay(p.at, day))) column.appendChild(postCard(post));
    for (const row of calDayRows(day)) column.appendChild(slotCell(row));
    week.appendChild(column);
  }
}

function startOfDay(date) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

function shiftDays(days) {
  cal.start = addDays(cal.start, days);
  cal.editing = null;
  renderCalendar();
}

// ---------- Ouverture / fermeture ----------

function openNotesCalendar() {
  if (!cal.el) {
    cal.el = document.createElement("div");
    cal.el.id = "snc-calendar";
    cal.el.addEventListener("click", (e) => {
      if (e.target === cal.el) closeNotesCalendar();
    });
    document.documentElement.appendChild(cal.el);
    document.addEventListener("keydown", calKeydown, true);
  }
  cal.start = startOfDay(new Date());
  cal.editing = null;
  loadCalendar();
}

function closeNotesCalendar() {
  cal.el?.remove();
  cal.el = null;
  document.removeEventListener("keydown", calKeydown, true);
  if (location.hash === CAL_HASH) history.replaceState(null, "", location.pathname + location.search);
}

function calKeydown(e) {
  if (e.key === "Escape") {
    e.stopPropagation();
    if (cal.editing) editNote({ id: null }, null);
    else closeNotesCalendar();
  }
}

function checkHash() {
  if (location.hash === CAL_HASH && !cal.el) openNotesCalendar();
}

window.addEventListener("hashchange", checkHash);
// Substack change parfois d'adresse sans déclencher hashchange : on vérifie aussi régulièrement.
setInterval(checkHash, 500);
checkHash();
