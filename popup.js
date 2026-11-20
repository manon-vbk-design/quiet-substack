// Popup : interrupteur du fil, créneaux des notes et accès au calendrier.
// Tout est enregistré dans chrome.storage.local et lu par les scripts de la page.
const savedEl = document.getElementById("saved");
let savedTimer = null;

function showSaved() {
  savedEl.textContent = "Enregistré ✓";
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => (savedEl.textContent = ""), 1500);
}

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

// ---------- Créneaux des notes ----------

// On peut en ajouter ou en retirer ; il en reste toujours au moins un.
const DEFAULT_SLOTS = ["08:00", "12:30", "18:00"];
const slotsEl = document.getElementById("slots");
let slots = [];

function saveSlots() {
  chrome.storage.local.set({ slots: slots.filter(Boolean).sort() });
  showSaved();
}

// Une ligne par créneau : « Créneau N », l'heure, et « × » pour le retirer.
function renderSlots() {
  slotsEl.innerHTML = "";
  slots.forEach((time, i) => {
    const label = document.createElement("label");
    label.className = "slot";
    label.append(`Créneau ${i + 1}`);

    const input = document.createElement("input");
    input.type = "time";
    input.value = time;
    input.addEventListener("change", () => {
      slots[i] = input.value;
      saveSlots();
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove";
    remove.textContent = "×";
    remove.title = "Retirer ce créneau";
    remove.disabled = slots.length === 1; // il faut garder au moins un créneau
    remove.addEventListener("click", () => {
      slots.splice(i, 1);
      saveSlots();
      renderSlots();
    });

    label.append(input, remove);
    slotsEl.appendChild(label);
  });
}

// Le nouveau créneau arrive une heure après le dernier (sans dépasser 23:00).
function nextSlot() {
  const last = [...slots].filter(Boolean).sort().pop();
  if (!last) return "09:00";
  const [h, m] = last.split(":").map(Number);
  return `${String(Math.min(h + 1, 23)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

document.getElementById("add-slot").addEventListener("click", () => {
  slots = [...slots.filter(Boolean).sort(), nextSlot()];
  saveSlots();
  renderSlots();
  slotsEl.querySelector("label:last-child input").focus();
});

chrome.storage.local.get(["slots"], (data) => {
  slots = data.slots?.length ? [...data.slots] : [...DEFAULT_SLOTS];
  renderSlots();
});

// Ouvre le calendrier des notes dans un nouvel onglet Substack.
document.getElementById("open-calendar").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://substack.com/home#calendrier" });
});
