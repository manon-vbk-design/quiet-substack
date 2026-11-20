// Éditeur de note : Post gallery et planning
// Dès que l'éditeur de note s'ouvre, l'élargit en deux colonnes :
// l'éditeur à gauche, et à droite Post gallery (rouverte automatiquement
// après chaque ajout) ou la liste des brouillons si tu cliques sur « Brouillons ».
// À côté, le planning des créneaux quotidiens avec le prochain créneau libre,
// et un bouton pour y programmer la note puis en ouvrir une nouvelle.

const COMPOSER_DIALOG = '[role="dialog"][class*="composerModal-"]';
const COMPOSER_BUTTON = 'button[aria-label="Nouveau post"], button[aria-label="New post"]';
const MORE_BUTTON = 'button[aria-label="Plus d\'options"], button[aria-label="More options"]';
const SCHEDULE_BUTTON = 'button[aria-label="Programme"], button[aria-label="Schedule"]';
const GALLERY_LABELS = ["Post gallery", "Galerie de posts"];

const DEFAULT_SLOTS = ["08:00", "12:30", "18:00"];
const DAYS_SHOWN = 7;

let opening = false;
let busy = false; // programmation en cours : on ne touche pas à la galerie
let composerIdleSince = 0;
let galleryMissing = null; // éditeur où l'option galerie est introuvable : on n'insiste pas

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(find, timeout = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const found = find();
    if (found) return found;
    await sleep(50);
  }
  return null;
}

function views(dialog) {
  return [...dialog.querySelectorAll('[class*="track-"] > [class*="view-"]')];
}

function isActive(view) {
  return /opacity-100/.test(view.className);
}

// Substack rend l'éditeur « inert » quand un autre volet est affiché :
// on le réactive pour pouvoir écrire pendant que la galerie est ouverte.
function unlock(dialog) {
  const [composer, ...others] = views(dialog);
  composer?.removeAttribute("inert");
  for (const view of others) if (isActive(view)) view.removeAttribute("inert");
}

// La confirmation « Note planifiée pour… » de Substack est un dialog,
// mais ce n'est qu'un message : elle ne doit rien bloquer.
function isSubstackToast(dialog) {
  return !dialog.querySelector("input, textarea") && /planifiée|scheduled/i.test(dialog.innerText);
}

// Un menu, le calendrier de programmation ou un autre popup est ouvert :
// on ne touche à rien pour ne pas le refermer.
function somethingElseOpen() {
  return (
    document.querySelector('[role="menu"], [data-radix-popper-content-wrapper]') ||
    [...document.querySelectorAll('[role="dialog"]')].some((d) => !d.matches(COMPOSER_DIALOG) && !isSubstackToast(d))
  );
}

// Clic complet (appui, relâche, clic), comme une vraie souris : le menu
// de Substack ne s'ouvre plus sur un simple « appui ».
function press(el) {
  const base = { bubbles: true, cancelable: true, pointerType: "mouse", button: 0, isPrimary: true, pointerId: 1 };
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    const Event = type.startsWith("pointer") ? PointerEvent : MouseEvent;
    el.dispatchEvent(new Event(type, { ...base, buttons: type.endsWith("down") ? 1 : 0 }));
  }
}

// Ouvre Post gallery via le menu « ⋯ » de l'éditeur, puis rend le focus à l'éditeur.
async function openGallery(dialog) {
  const more = dialog.querySelector(MORE_BUTTON);
  if (!more) return;
  opening = true;
  const focused = document.activeElement;
  try {
    press(more);
    const item = await waitFor(
      () => [...document.querySelectorAll('[role="menuitem"]')].find((el) => GALLERY_LABELS.some((label) => el.textContent.includes(label))),
      1000
    );
    if (!item) {
      // Option absente (Substack a changé son menu) : on referme le menu en
      // recliquant sur « ⋯ » (surtout pas Échap, qui fermerait l'éditeur)
      // et on ne réessaie plus pour cet éditeur, sinon le menu s'ouvre en boucle.
      if (document.querySelector('[role="menu"]')) press(more);
      galleryMissing = dialog;
      return;
    }
    item.click();
    await sleep(200);
    if (focused && dialog.contains(focused)) focused.focus();
  } finally {
    opening = false;
  }
}

// ---------- Planning des créneaux ----------

let slots = DEFAULT_SLOTS;
let scheduled = []; // notes déjà programmées : { at, text }
let planning = null;

// Créneau choisi en cliquant sur une case libre du calendrier : il remplace
// le prochain créneau libre jusqu'à ce que la note soit programmée.
// Gardé dans sessionStorage pour survivre à l'ouverture de l'éditeur sur /home.
const CHOSEN_KEY = "snw-chosen-slot";
let chosenSlot = null;
let chosenSince = 0;
try {
  const saved = sessionStorage.getItem(CHOSEN_KEY);
  sessionStorage.removeItem(CHOSEN_KEY);
  if (saved && new Date(saved) > new Date()) {
    chosenSlot = new Date(saved);
    chosenSince = Date.now();
  }
} catch {}

function chooseSlot(date) {
  chosenSlot = date;
  chosenSince = Date.now();
  renderPlanning();
}
let planningMessage = "";

chrome.storage.local.get(["slots"], (data) => {
  if (data.slots?.length) slots = data.slots;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.slots) {
    slots = changes.slots.newValue?.length ? changes.slots.newValue : DEFAULT_SLOTS;
    renderPlanning();
  }
});

async function loadScheduled() {
  try {
    const response = await fetch("/api/v1/feed/drafts?limit=100", { credentials: "include" });
    const data = await response.json();
    scheduled = (data.drafts || [])
      .filter((draft) => draft.trigger_at)
      .map((draft) => ({ at: new Date(draft.trigger_at), text: draft.body || "" }))
      .sort((a, b) => a.at - b.at);
  } catch {
    planningMessage = t("notesLoadError");
  }
  renderPlanning();
}

function slotDate(day, time) {
  const [h, m] = time.split(":").map(Number);
  const date = new Date(day);
  date.setHours(h, m, 0, 0);
  return date;
}

function sameDay(a, b) {
  return a.toDateString() === b.toDateString();
}

// Pour un jour donné : chaque créneau avec la note qui l'occupe (à une heure
// près), plus les notes programmées en dehors des créneaux.
function dayPlan(day) {
  const notes = scheduled.filter((note) => sameDay(note.at, day));
  const used = new Set();
  const rows = slots.map((time) => {
    const at = slotDate(day, time);
    const note = notes.find((n) => !used.has(n) && Math.abs(n.at - at) <= 60 * 60 * 1000);
    if (note) used.add(note);
    return { at, note, slot: true };
  });
  for (const note of notes) if (!used.has(note)) rows.push({ at: note.at, note, slot: false });
  return rows.sort((a, b) => a.at - b.at);
}

function nextFreeSlot() {
  const soon = Date.now() + 10 * 60 * 1000;
  const day = new Date();
  for (let i = 0; i < 90; i++) {
    const free = dayPlan(day).find((row) => row.slot && !row.note && row.at > soon);
    if (free) return free.at;
    day.setDate(day.getDate() + 1);
  }
  return null;
}

// Affichage dans la langue de l'extension (« 08:05 » en français, « 8:05 AM » en anglais).
const timeFormat = (date) => date.toLocaleTimeString(DATE_LOCALE, { hour: UI_FR ? "2-digit" : "numeric", minute: "2-digit" });
const dayFormat = (date) => date.toLocaleDateString(DATE_LOCALE, { weekday: "short", day: "numeric", month: "short" });

function excerpt(text) {
  const line = text.split("\n").find((l) => l.trim()) || "";
  return line.length > 48 ? line.slice(0, 47) + "…" : line;
}

function renderPlanning() {
  if (!planning) return;
  const chosen = chosenSlot && chosenSlot > new Date() ? chosenSlot : null;
  const next = chosen || nextFreeSlot();
  const now = new Date();

  planning.innerHTML = `
    <h2>${t("planningTitle")}</h2>
    <div class="snw-next">
      <span class="snw-label"></span>
      <strong class="snw-when"></strong>
      <div class="snw-actions">
        <button type="button" class="snw-primary">${t("scheduleAndNew")}</button>
        <button type="button" class="snw-calendar" title="${t("pickOtherDate")}" aria-label="${t("pickOtherDate")}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>
        </button>
      </div>
      <button type="button" class="snw-open-cal">${t("openCalendar")}</button>
      <p class="snw-msg"></p>
    </div>
    <ol class="snw-days"></ol>
  `;
  planning.querySelector(".snw-label").textContent = chosen ? t("chosenSlot") : t("nextFreeSlot");
  planning.querySelector(".snw-when").textContent = next ? `${dayFormat(next)} · ${timeFormat(next)}` : t("none");
  planning.querySelector(".snw-msg").textContent = planningMessage;
  const primary = planning.querySelector(".snw-primary");
  primary.disabled = !next || busy;
  primary.addEventListener("click", () => scheduleAt(next));
  const calendar = planning.querySelector(".snw-calendar");
  calendar.disabled = busy;
  calendar.addEventListener("click", openCalendar);
  planning.querySelector(".snw-open-cal").addEventListener("click", () => openNotesCalendar());

  const list = planning.querySelector(".snw-days");
  const day = new Date();
  for (let i = 0; i < DAYS_SHOWN; i++) {
    const li = document.createElement("li");
    const title = document.createElement("h3");
    title.textContent = i === 0 ? t("todayDay", { day: dayFormat(day) }) : dayFormat(day);
    li.appendChild(title);
    for (const row of dayPlan(day)) {
      const line = document.createElement("div");
      line.className = "snw-row";
      line.classList.add(row.note ? "snw-filled" : row.at < now ? "snw-past" : "snw-free");
      if (!row.slot) line.classList.add("snw-extra");
      if (next && row.at.getTime() === next.getTime()) line.classList.add("snw-is-next");

      const time = document.createElement("span");
      time.className = "snw-time";
      time.textContent = timeFormat(row.at);
      const text = document.createElement("span");
      text.className = "snw-text";
      text.textContent = row.note ? excerpt(row.note.text) : row.at < now ? "—" : t("free");
      line.append(time, text);
      li.appendChild(line);
    }
    list.appendChild(li);
    day.setDate(day.getDate() + 1);
  }
}

// Le planning est placé dans la fenêtre de l'éditeur (en débordant à droite),
// pour que les clics dessus ne soient pas pris pour un clic « en dehors ».
function attachPlanning(dialog) {
  if (planning && dialog.contains(planning)) return;
  planning = document.createElement("aside");
  planning.id = "snw-planning";
  planning.classList.toggle("snw-en", !UI_FR);
  dialog.appendChild(planning);
  planningMessage = "";
  renderPlanning();
  loadScheduled();
}

// ---------- Programmer au prochain créneau ----------

function buttonByText(root, ...texts) {
  return [...root.querySelectorAll("button")].find((b) => texts.includes(b.innerText.trim()));
}

// Le bouton d'envoi (« Poster » ou « Programme ») suit « Annuler » en bas de l'éditeur.
function submitButton(view) {
  const buttons = [...view.querySelectorAll("button")];
  const cancel = buttons.findIndex((b) => ["Annuler", "Cancel"].includes(b.innerText.trim()));
  return cancel >= 0 ? buttons[cancel + 1] : null;
}

function showMessage(text) {
  planningMessage = text;
  renderPlanning();
}

// Ouvre le calendrier normal de Substack (ou « Modifier » s'il y a déjà une date).
function calendarOpener(view) {
  return buttonByText(view, "Modifier", "Edit") || view.querySelector(SCHEDULE_BUTTON);
}

function openCalendar() {
  const dialog = document.querySelector(COMPOSER_DIALOG);
  if (dialog && !busy) calendarOpener(views(dialog)[0])?.click();
}

async function scheduleAt(date) {
  const dialog = document.querySelector(COMPOSER_DIALOG);
  if (!dialog || !date || busy) return;
  const view = views(dialog)[0];
  if (submitButton(view)?.disabled) {
    showMessage(t("writeFirst"));
    return;
  }

  busy = true;
  showMessage(t("scheduling"));
  try {
    // 1. Ouvre le calendrier de Substack (ou « Modifier » s'il y a déjà une date).
    const opener = calendarOpener(view);
    if (!opener) throw new Error(t("errCalendarButton"));
    opener.click();
    const picker = await waitFor(() =>
      [...document.querySelectorAll('[role="dialog"]')].find((d) => d !== dialog && d.querySelector('input[type="time"]'))
    );
    if (!picker) throw new Error(t("errPicker"));

    // 2. Choisit le jour, en passant au mois suivant si besoin. Le nom des jours
    // suit la langue de Substack (« lundi 26 octobre 2026 » ou « Monday, October 26, 2026 »).
    const dayOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric" };
    const labels = ["fr-FR", "en-US", "en-GB"].map((locale) => date.toLocaleDateString(locale, dayOptions));
    // Substack programme jusqu'à 90 jours : jusqu'à 3 mois après le mois affiché.
    let dayButton = null;
    for (let i = 0; i < 4 && !dayButton; i++) {
      dayButton = [...picker.querySelectorAll("button[aria-label]")].find((b) => labels.some((label) => b.getAttribute("aria-label").includes(label)));
      if (!dayButton && i < 3) {
        picker.querySelector('button[aria-label="Le mois prochain"], button[aria-label="Next month"]')?.click();
        await sleep(80);
      }
    }
    if (!dayButton) throw new Error(t("errDay"));
    dayButton.click();
    await sleep(50);

    // 3. Règle l'heure, puis enregistre.
    const timeInput = picker.querySelector('input[type="time"]');
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setValue.call(timeInput, hhmm(date));
    timeInput.dispatchEvent(new Event("input", { bubbles: true }));
    timeInput.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(50);
    buttonByText(picker, "Enregistrer", "Save")?.click();
    if (!(await waitFor(() => !picker.isConnected, 2000))) throw new Error(t("errPickerOpen"));

    // 4. Programme la note (dès que le bouton affiche « Programme »), puis en ouvre une nouvelle.
    const submit = await waitFor(() => {
      const button = submitButton(views(dialog)[0]);
      return button && /Programme|Schedule/.test(button.innerText) && !button.disabled && button;
    }, 2000);
    if (!submit) throw new Error(t("errDate"));
    submit.click();
    if (!(await waitFor(() => !document.querySelector(COMPOSER_DIALOG), 8000))) {
      throw new Error(t("errNotScheduled"));
    }
    chosenSlot = null;
    const done = t("scheduledFor", { when: `${dayFormat(date)} · ${timeFormat(date)}` });
    toast((await reopenComposer()) ? done : t("clickForNext", { done }));
  } catch (error) {
    showMessage(t("scheduleFailed", { error: error.message }));
  } finally {
    busy = false;
    renderPlanning();
  }
}

// Fond grisé de l'éditeur : il reste affiché un instant après la fermeture.
const COMPOSER_BACKDROP = '[class^="backdrop-"], [class*=" backdrop-"]';

// Rouvre une note vide. On ne teste pas somethingElseOpen() ici : la
// confirmation « Note planifiée pour… » de Substack est elle-même un dialog
// et bloquerait la réouverture tant qu'elle est affichée.
// On attend que la fermeture soit complètement finie (fond grisé parti) :
// un clic pendant l'animation laisse un fond grisé bloqué et plus rien ne s'ouvre.
async function reopenComposer() {
  await waitFor(() => !document.querySelector(COMPOSER_BACKDROP), 3000);
  for (let attempt = 0; attempt < 3; attempt++) {
    if (document.querySelector(COMPOSER_DIALOG)) return true;
    document.querySelector(COMPOSER_BUTTON)?.click();
    if (await waitFor(() => document.querySelector(COMPOSER_DIALOG), 1500)) return true;
  }
  return false;
}

// Petit message en bas de l'écran, visible même quand l'éditeur est fermé.
function toast(text) {
  document.getElementById("snw-toast")?.remove();
  const el = document.createElement("div");
  el.id = "snw-toast";
  el.textContent = text;
  document.documentElement.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ---------- Boucle principale ----------

function tick() {
  const dialog = document.querySelector(COMPOSER_DIALOG);
  document.documentElement.classList.toggle("snw-split", !!dialog);
  if (!dialog) {
    planning = null;
    // Éditeur refermé sans programmer : on oublie le créneau choisi
    // (après un court délai, le temps que l'éditeur s'ouvre).
    if (chosenSlot && !busy && Date.now() - chosenSince > 3000) chosenSlot = null;
    return;
  }

  attachPlanning(dialog);
  unlock(dialog);
  const [composer] = views(dialog);
  if (!composer || opening || busy || galleryMissing === dialog) return;

  // Rien n'est affiché à droite : on rouvre la galerie presque aussitôt.
  if (isActive(composer) && !somethingElseOpen()) {
    if (!composerIdleSince) composerIdleSince = Date.now();
    if (Date.now() - composerIdleSince > 150) {
      composerIdleSince = 0;
      openGallery(dialog);
    }
  } else {
    composerIdleSince = 0;
  }
}

setInterval(tick, 200);
