// Popup : interrupteur du fil et accès au calendrier.
// Les créneaux, les week-ends et les meilleures heures se règlent dans
// l'onglet « Paramètres » du calendrier (calendar.js).
// Textes du popup dans la langue de Chrome (voir i18n.js).
document.documentElement.lang = UI_FR ? "fr" : "en";
document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));

// ---------- Fil d'accueil ----------

// Interrupteur du fil, partagé avec l'interrupteur placé dans Substack.
const enabledEl = document.getElementById("enabled");

chrome.storage.local.get("enabled", (data) => {
  enabledEl.checked = data.enabled !== false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.enabled) enabledEl.checked = changes.enabled.newValue !== false;
});

enabledEl.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: enabledEl.checked });
});

// ---------- Calendrier ----------

// Ouvre le calendrier des notes (ou ses paramètres) dans un nouvel onglet Substack.
document.getElementById("open-calendar").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://substack.com/home#calendrier" });
});
document.getElementById("setup-calendar").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://substack.com/home#calendrier-parametres" });
});
