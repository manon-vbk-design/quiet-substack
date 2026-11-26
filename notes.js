// Éditeur de note : galeries et planning
// En haut de l'éditeur, à gauche de « Brouillons », trois icônes ouvrent un
// panneau flottant à droite de l'éditeur :
// - Galerie de posts : Post gallery de Substack (« Vos posts » / « Activité ») ;
// - Galerie de notes : tes notes, likées et répondues, à intégrer (gallery-notes.js) ;
// - Citations : citer un passage d'un post (gallery-notes.js).
// Les panneaux sont fermés par défaut ; un second clic sur l'icône referme.
// « Brouillons » s'ouvre au même endroit.
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

// Le menu « ⋯ » est soit un menu classique, soit (version « mobile » que
// Substack affiche parfois, même sur ordinateur) un panneau glissant du bas.
const MENU_ITEMS = '[role="menuitem"], [role="dialog"]:not([class*="composerModal-"]) button';
const openMenu = () =>
  document.querySelector('[role="menu"]') ||
  [...document.querySelectorAll('[role="dialog"]:not([class*="composerModal-"])')].find((d) => d.querySelector("button"));

// Ouvre Post gallery via le menu « ⋯ » de l'éditeur, puis rend le focus à l'éditeur.
async function openGallery(dialog) {
  const more = dialog.querySelector(MORE_BUTTON);
  if (!more) return;
  opening = true;
  const focused = document.activeElement;
  try {
    press(more);
    const item = await waitFor(
      () => [...document.querySelectorAll(MENU_ITEMS)].find((el) => GALLERY_LABELS.some((label) => el.textContent.includes(label))),
      1000
    );
    if (!item) {
      // Option absente (Substack a changé son menu) : on referme le menu en
      // recliquant sur « ⋯ » (surtout pas Échap, qui fermerait l'éditeur)
      // et on ne réessaie plus pour cet éditeur, sinon le menu s'ouvre en boucle.
      if (openMenu()) press(more);
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

// Week-ends masqués (paramètres du calendrier) : pas de créneau samedi et dimanche.
let showWeekends = true;
const isWeekend = (day) => day.getDay() === 0 || day.getDay() === 6;

chrome.storage.local.get(["slots", "weekends"], (data) => {
  if (data.slots?.length) slots = data.slots;
  showWeekends = data.weekends !== false;
  renderPlanning();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || (!changes.slots && !changes.weekends)) return;
  if (changes.slots) slots = changes.slots.newValue?.length ? changes.slots.newValue : DEFAULT_SLOTS;
  if (changes.weekends) showWeekends = changes.weekends.newValue !== false;
  renderPlanning();
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
  const daySlots = showWeekends || !isWeekend(day) ? slots : [];
  const rows = daySlots.map((time) => {
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

  // En haut : le calendrier et ses paramètres. Au milieu : les jours, où un
  // clic sur un créneau libre le choisit. En bas, aligné avec « Poster » :
  // le créneau retenu (crayon = autre date) et « Programmer et nouvelle note ».
  planning.innerHTML = `
    <h2>${t("planningTitle")}</h2>
    <div class="snw-next">
      <button type="button" class="snw-open-cal">${t("openCalendar")}</button>
      <button type="button" class="snw-setup">${t("setupCalendar")}</button>
      <p class="snw-msg"></p>
    </div>
    <ol class="snw-days"></ol>
    <div class="snw-foot">
      <span class="snw-label"></span>
      <div class="snw-when-row">
        <strong class="snw-when"></strong>
        <button type="button" class="snw-calendar" title="${t("pickOtherDate")}" aria-label="${t("pickOtherDate")}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
        </button>
      </div>
      <button type="button" class="snw-primary">${t("scheduleAndNew")}</button>
    </div>
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
  planning.querySelector(".snw-setup").addEventListener("click", () => openNotesCalendar("settings"));

  const list = planning.querySelector(".snw-days");
  const day = new Date();
  for (let i = 0; i < DAYS_SHOWN; i++, day.setDate(day.getDate() + 1)) {
    // Week-ends masqués : on ne garde un samedi ou un dimanche que s'il a déjà une note.
    if (!showWeekends && isWeekend(day) && !dayPlan(day).length) continue;
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
      // Un créneau libre à venir se choisit d'un clic.
      if (!row.note && row.at > now && !busy) {
        line.classList.add("snw-pickable");
        line.tabIndex = 0;
        line.setAttribute("role", "button");
        line.title = t("pickSlotHint");
        const pick = () => chooseSlot(row.at);
        line.addEventListener("click", pick);
        line.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            pick();
          }
        });
      }

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

// Réponse à une note : la note d'origine est affichée au-dessus de l'éditeur,
// en lecture seule. Dans ce cas on laisse l'éditeur de Substack tel quel
// (ni galerie qui se rouvre, ni planning) : tout ça ne sert qu'à tes propres notes.
// Une note intégrée ou citée, elle, s'affiche sous l'éditeur : on ne regarde
// donc que les textes en lecture seule placés avant le champ d'écriture.
function isReply(dialog) {
  const composer = views(dialog)[0];
  const editor = composer?.querySelector('.ProseMirror[contenteditable="true"]');
  if (!editor) return false;
  return [...composer.querySelectorAll('.ProseMirror:not([contenteditable="true"])')]
    .some((other) => other.compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_FOLLOWING);
}

function tick() {
  const found = document.querySelector(COMPOSER_DIALOG);
  const dialog = found && !isReply(found) ? found : null;
  document.documentElement.classList.toggle("snw-split", !!dialog);
  if (!dialog) {
    document.documentElement.classList.remove("snw-side-open");
    planning?.remove();
    planning = null;
    // Éditeur refermé sans programmer : on oublie le créneau choisi
    // (après un court délai, le temps que l'éditeur s'ouvre).
    if (chosenSlot && !busy && Date.now() - chosenSince > 3000) chosenSlot = null;
    return;
  }

  attachPlanning(dialog);
  unlock(dialog);
  attachPanelButtons(dialog);
  // Un seul bouton orange à l'écran (« Programmer et nouvelle note ») :
  // « Poster » passe en noir, comme « Citer ce passage ».
  submitButton(views(dialog)[0])?.classList.add("snw-send");
  // Un volet est ouvert à droite (« Ajouter à la Note » ou les brouillons) :
  // l'éditeur s'élargit en deux colonnes ; sinon il garde une largeur normale.
  // Le fond de la fenêtre de Substack, gardé pour nos cartes flottantes
  // (lu une fois, avant qu'on rende la fenêtre transparente).
  if (!dialog.style.getPropertyValue("--snw-card-bg")) {
    const bg = getComputedStyle(dialog).backgroundColor;
    if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) dialog.style.setProperty("--snw-card-bg", bg);
  }
  const side = sideView(dialog);
  document.documentElement.classList.toggle("snw-side-open", !!side);
  const mode = side && isGalleryView(side) ? currentGalleryMode() : null;
  for (const button of dialog.querySelectorAll("[data-snw-panel]")) {
    button.setAttribute("aria-pressed", String(button.dataset.snwPanel === mode));
  }
}

// ---------- Icônes des panneaux : posts, notes, citations ----------

function sideView(dialog) {
  return views(dialog).find((view, i) => i > 0 && isActive(view)) || null;
}

const isGalleryView = (view) => !!view.querySelector('[role="tablist"]');

// Le panneau affiché dans la galerie : "posts", "notes" ou "quote" (gallery-notes.js).
const currentGalleryMode = () => (typeof gn === "object" && gn.tab) || "posts";

// Icônes Lucide, la bibliothèque qu'utilise Substack : « square-stack » est
// celle de Galerie de posts dans le menu « ⋯ » de l'éditeur.
const LUCIDE = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const PANEL_BUTTONS = [
  {
    mode: "posts",
    label: () => t("panelPosts"),
    icon: LUCIDE('<path d="M4 10c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2"/><path d="M10 16c-1.1 0-2-.9-2-2v-4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2"/><rect width="8" height="8" x="14" y="14" rx="2"/>'),
  },
  {
    mode: "notes",
    label: () => t("panelNotes"),
    icon: LUCIDE('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M13 8H7"/><path d="M17 12H7"/>'),
  },
  {
    mode: "quote",
    label: () => t("panelQuotes"),
    icon: LUCIDE('<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>'),
  },
];

function attachPanelButtons(dialog) {
  const composer = views(dialog)[0];
  if (!composer || composer.querySelector("[data-snw-panels]")) return;
  const drafts = buttonByText(composer, "Brouillons", "Drafts");
  if (!drafts) return;
  const group = document.createElement("div");
  group.className = "snw-panels";
  group.dataset.snwPanels = "";
  for (const panel of PANEL_BUTTONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "snw-panel-button";
    button.dataset.snwPanel = panel.mode;
    button.title = panel.label();
    button.setAttribute("aria-label", panel.label());
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = panel.icon;
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePanel(dialog, panel.mode);
    });
    group.appendChild(button);
  }
  drafts.parentElement.insertBefore(group, drafts);
  // Les icônes et « Brouillons » sont posés en haut à droite, hors du flux,
  // pour que la zone de texte prenne toute la largeur. Les icônes se calent
  // à gauche de « Brouillons », dont la largeur change selon la langue.
  drafts.parentElement.classList.add("snw-head-row");
  drafts.classList.add("snw-drafts");
  new ResizeObserver(() => {
    if (drafts.offsetWidth) group.style.right = `${drafts.offsetWidth + 6}px`;
  }).observe(drafts);
}

// Ouvre le panneau demandé, passe d'un panneau à l'autre, ou referme si
// c'est celui qui est déjà affiché.
async function togglePanel(dialog, mode) {
  if (opening || busy) return;
  const side = sideView(dialog);
  const open = side && isGalleryView(side);
  if (open && currentGalleryMode() === mode) return toggleGallery(dialog);
  if (!open) {
    galleryMissing = null;
    await openGallery(dialog);
    if (galleryMissing === dialog) return toast(t("galleryMissing"));
  }
  gnShow?.(dialog, mode);
}

async function toggleGallery(dialog) {
  if (opening || busy) return;
  const side = sideView(dialog);
  if (side && isGalleryView(side)) {
    // Fermer : le bouton « Annuler » en bas du volet de Substack.
    const cancel = [...side.querySelectorAll("button")]
      .filter((b) => !b.closest("#snw-gallery-notes, #snw-gallery-footer"))
      .find((b) => /^(Annuler|Cancel)$/.test(b.textContent.trim()));
    cancel?.click();
    return;
  }
  galleryMissing = null;
  await openGallery(dialog);
  if (galleryMissing === dialog) toast(t("galleryMissing"));
}

setInterval(tick, 200);
