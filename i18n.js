// Traductions. Le texte de l'extension suit la langue de Chrome :
// français si Chrome est en français, anglais sinon.
// Chargé avant les autres scripts : t(), hhmm() et DATE_LOCALE servent partout.

// Pour forcer une langue sur Substack (tests) : dans la console de la page,
// localStorage.setItem("quiet-substack-lang", "en") ou "fr", puis recharger.
var LANG_OVERRIDE = (() => {
  try {
    return localStorage.getItem("quiet-substack-lang");
  } catch {
    return null;
  }
})();
var UI_FR = LANG_OVERRIDE
  ? LANG_OVERRIDE === "fr"
  : (chrome.i18n?.getUILanguage?.() || navigator.language || "").toLowerCase().startsWith("fr");
var DATE_LOCALE = UI_FR ? "fr-FR" : "en-US";

var STRINGS = {
  fr: {
    // Fil d'accueil et barre latérale
    greeting: "Coucou {name}",
    greetingNoName: "Coucou 👋",
    writeNote: "Écrire une note",
    calendar: "Calendrier",
    savedPosts: "Posts enregistrés",
    myPosts: "Mes posts",
    toggleHelp: "Masquer ou afficher le fil d'accueil",
    feedHidden: "Fil masqué",
    feedVisible: "Fil visible",
    toggleToShow: "{state} · cliquer pour afficher le fil d'accueil",
    toggleToHide: "{state} · cliquer pour masquer le fil d'accueil",
    writeOrSchedule: "Écrire / programmer une note",

    // Planning à côté de l'éditeur
    notesLoadError: "Impossible de charger tes notes programmées.",
    planningTitle: "Planning des notes",
    scheduleAndNew: "Programmer et nouvelle note",
    pickOtherDate: "Choisir une autre date",
    openCalendar: "Voir le calendrier",
    chosenSlot: "Créneau choisi dans le calendrier",
    nextFreeSlot: "Prochain créneau libre",
    none: "Aucun",
    todayDay: "Aujourd'hui · {day}",
    free: "libre",
    writeFirst: "Écris ta note d'abord 🙂",
    scheduling: "Programmation…",
    errCalendarButton: "bouton calendrier introuvable",
    errPicker: "calendrier introuvable",
    errDay: "jour introuvable",
    errPickerOpen: "calendrier resté ouvert",
    errDate: "date non prise en compte",
    errNotScheduled: "la note n'a pas été programmée",
    scheduledFor: "Note programmée pour {when} ✓",
    clickForNext: "{done} Clique sur « Écrire une note » pour la suivante.",
    scheduleFailed: "Oups, ça n'a pas marché ({error}). Programme-la avec l'icône calendrier.",

    // Calendrier des notes
    untitled: "Sans titre",
    postsLoadError: "Impossible de charger les posts programmés.",
    loading: "Chargement…",
    httpError: "erreur {status}",
    slotPast: "Ce créneau est déjà passé.",
    rescheduling: "Reprogrammation…",
    swapped: "Notes échangées ✓",
    moved: "Note déplacée au {when} ✓",
    oops: "Oups, ça n'a pas marché ({error}).",
    pickFuture: "Choisis une date à venir.",
    rescheduled: "Note reprogrammée au {when} ✓",
    deleting: "Suppression…",
    deleted: "Note supprimée ✓",
    day: "Jour",
    time: "Heure",
    reschedule: "Reprogrammer",
    cancel: "Annuler",
    deleteConfirm: "Supprimer définitivement cette note ?",
    delete: "Supprimer",
    noText: "(note sans texte)",
    edit: "Modifier",
    editHelp: "Ouvrir la note dans l'éditeur de Substack",
    deleteHelp: "Supprimer la note",
    postHelp: "{title} — ouvrir dans l'éditeur",
    writeAtSlot: "Écrire une nouvelle note pour ce créneau",
    calendarTitle: "Calendrier des notes",
    earlier: "15 jours plus tôt",
    later: "15 jours plus tard",
    today: "Aujourd'hui",
    close: "Fermer",
    calendarHint:
      "Glisse une note vers un autre créneau pour la reprogrammer (sur un créneau pris, les deux notes échangent leur place), ou passe la souris dessus pour la modifier, la reprogrammer ou la supprimer. Clique sur une case libre pour écrire une nouvelle note à ce créneau. Les posts sont en lecture seule.",

    // Popup
    hideFeed: "Masquer le fil",
    hideFeedHint: "Aussi en haut à gauche de Substack, à côté du logo.",
    slotsTitle: "Créneaux des notes",
    slotsHelp: "Chaque jour. Le planning à côté de l'éditeur te montre le prochain créneau libre.",
    slot: "Créneau {n}",
    removeSlot: "Retirer ce créneau",
    addSlot: "+ Ajouter un créneau",
    openCalendarButton: "Ouvrir le calendrier",
    saved: "Enregistré ✓",
  },

  en: {
    greeting: "Hi {name}",
    greetingNoName: "Hi 👋",
    writeNote: "Write a note",
    calendar: "Calendar",
    savedPosts: "Saved posts",
    myPosts: "My posts",
    toggleHelp: "Hide or show the home feed",
    feedHidden: "Feed hidden",
    feedVisible: "Feed visible",
    toggleToShow: "{state} · click to show the home feed",
    toggleToHide: "{state} · click to hide the home feed",
    writeOrSchedule: "Write / schedule a note",

    notesLoadError: "Couldn't load your scheduled notes.",
    planningTitle: "Notes schedule",
    scheduleAndNew: "Schedule & new note",
    pickOtherDate: "Pick another date",
    openCalendar: "Open the calendar",
    chosenSlot: "Slot picked in the calendar",
    nextFreeSlot: "Next free slot",
    none: "None",
    todayDay: "Today · {day}",
    free: "free",
    writeFirst: "Write your note first 🙂",
    scheduling: "Scheduling…",
    errCalendarButton: "calendar button not found",
    errPicker: "date picker not found",
    errDay: "day not found",
    errPickerOpen: "date picker stayed open",
    errDate: "date not applied",
    errNotScheduled: "the note wasn't scheduled",
    scheduledFor: "Note scheduled for {when} ✓",
    clickForNext: "{done} Click “Write a note” for the next one.",
    scheduleFailed: "Oops, that didn't work ({error}). Schedule it with the calendar icon.",

    untitled: "Untitled",
    postsLoadError: "Couldn't load your scheduled posts.",
    loading: "Loading…",
    httpError: "error {status}",
    slotPast: "This slot is already past.",
    rescheduling: "Rescheduling…",
    swapped: "Notes swapped ✓",
    moved: "Note moved to {when} ✓",
    oops: "Oops, that didn't work ({error}).",
    pickFuture: "Pick a date in the future.",
    rescheduled: "Note rescheduled to {when} ✓",
    deleting: "Deleting…",
    deleted: "Note deleted ✓",
    day: "Day",
    time: "Time",
    reschedule: "Reschedule",
    cancel: "Cancel",
    deleteConfirm: "Delete this note for good?",
    delete: "Delete",
    noText: "(note without text)",
    edit: "Edit",
    editHelp: "Open the note in Substack's editor",
    deleteHelp: "Delete the note",
    postHelp: "{title} — open in the editor",
    writeAtSlot: "Write a new note for this slot",
    calendarTitle: "Notes calendar",
    earlier: "15 days earlier",
    later: "15 days later",
    today: "Today",
    close: "Close",
    calendarHint:
      "Drag a note to another slot to reschedule it (on a taken slot, the two notes swap places), or hover it to edit, reschedule or delete it. Click a free slot to write a new note for that time. Posts are read-only.",

    hideFeed: "Hide the feed",
    hideFeedHint: "Also at the top left of Substack, next to the logo.",
    slotsTitle: "Note slots",
    slotsHelp: "Every day. The schedule next to the editor shows your next free slot.",
    slot: "Slot {n}",
    removeSlot: "Remove this slot",
    addSlot: "+ Add a slot",
    openCalendarButton: "Open the calendar",
    saved: "Saved ✓",
  },
};

// t("moved", { when: "…" }) → texte dans la langue de Chrome, avec ses valeurs.
function t(key, values = {}) {
  const text = STRINGS[UI_FR ? "fr" : "en"][key] ?? STRINGS.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in values ? values[name] : match));
}

// Heure au format 24 h (« 08:05 ») pour les champs <input type="time">,
// quelle que soit la langue.
function hhmm(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
