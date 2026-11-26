// Fil d'accueil : tout le code est enfermé dans une fonction pour ne pas
// entrer en conflit avec notes.js et calendar.js, qui partagent la même page.
(() => {
// Un interrupteur en haut à gauche, à côté du logo Substack, masque ou
// affiche le fil d'accueil. Tout le reste du site reste accessible.
// Des raccourcis sont ajoutés dans la barre latérale (calendrier, posts
// enregistrés, puis chacune de tes publications). À la place du fil, la barre
// « Qu'avez-vous en tête ? » de Substack ouvre l'éditeur de note.

// Réglages : l'interrupteur (partagé avec le popup) et ton prénom,
// lu sur ton profil Substack (premier mot de ton nom).
const settings = { prenom: "", photo: "", enabled: true };

function greeting() {
  return settings.prenom ? t("greeting", { name: settings.prenom }) : t("greetingNoName");
}

// Seul le fil d'accueil est masqué (/, /home, /notes). Les articles ouverts
// depuis le fil (/home/post/…), Abonnements, Découvrir, Activité, le chat
// et les publications (*.substack.com) restent ouverts.
function isFeedPage() {
  return /^\/(home|notes)?\/?$/.test(location.pathname);
}

// Icônes (tracés SVG 24×24, style trait).
const ICONS = {
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  saved: '<path d="M6 3h12v18l-6-4.5L6 21z"/>',
  posts: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  website: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
};

// ---------- Barre latérale de Substack ----------

const LOGO_BUTTON = 'button[aria-label="Home"]';
// Lien « Chat » : sert à trouver la liste des liens de la barre, et il est
// copié pour que nos raccourcis gardent le style de Substack.
const MODEL_LINK = 'a[aria-label="Chat"]';
const CREATE_BUTTON = 'button[aria-label="Créer"], button[aria-label="Create"]';

// Raccourcis ajoutés à la fin de la liste, juste au-dessus du bouton « Créer ».
const SHORTCUTS = [
  { id: "calendar", label: t("calendar"), icon: "calendar", href: "https://substack.com/home#calendrier" },
  { id: "saved", label: t("savedPosts"), icon: "saved", href: "https://substack.com/saved" },
];

// Tes publications (celles liées à ton profil), lues une fois au chargement :
// un raccourci par publication, avec son logo, ta publication principale en premier.
let publications = [];
// « Mes posts » : la liste des posts publiés de ta publication principale.
let myPosts = [];

async function loadPublications() {
  try {
    const profile = await fetch("/api/v1/user/profile/self", { credentials: "include" }).then((r) => r.json());
    settings.prenom = (profile.name || "").trim().split(/\s+/)[0];
    settings.photo = profile.photo_url || "";
    const quote = overlay?.querySelector(".nfe-quote");
    if (quote) quote.textContent = greeting();
    if (overlay) setAvatar(overlay);
    const primaryId = profile.primaryPublication?.id;
    const primary = profile.primaryPublication?.subdomain;
    myPosts = primary
      ? [{ id: "posts", label: t("myPosts"), icon: "posts", href: `https://${primary}.substack.com/publish/posts/published` }]
      : [];
    const seen = new Set();
    publications = (profile.publicationUsers || [])
      .map((user) => user.publication)
      .concat(profile.primaryPublication || [])
      .filter((pub) => pub?.subdomain && !seen.has(pub.id) && seen.add(pub.id))
      .sort((a, b) => (b.id === primaryId) - (a.id === primaryId))
      .map((pub) => ({
        id: `pub-${pub.id}`,
        label: pub.name || pub.subdomain,
        icon: "website",
        logo: pub.logo_url || "",
        href: pub.custom_domain ? `https://${pub.custom_domain}/` : `https://${pub.subdomain}.substack.com/`,
      }));
  } catch {
    publications = [];
    myPosts = [];
  }
  resetShortcuts();
  update();
}

// Quand la fenêtre est étroite, Substack réduit sa barre à une colonne
// d'icônes : chaque lien est alors enveloppé dans un <span> (pour l'info-bulle)
// et n'a plus de texte. Un « élément » de la barre est ce span, ou le lien seul.
function sidebarItem(link) {
  const parent = link?.parentElement;
  return parent?.tagName === "SPAN" && parent.children.length === 1 ? parent : link;
}

function sidebarList() {
  return sidebarItem(document.querySelector(MODEL_LINK))?.parentElement || null;
}

function compactSidebar() {
  return sidebarItem(document.querySelector(MODEL_LINK))?.tagName === "SPAN";
}

// Élément de la liste qui contient le bouton « Créer » (null s'il n'y est pas).
function createItem(list) {
  return [...list.children].find((child) => child.querySelector(CREATE_BUTTON) || child.matches(CREATE_BUTTON)) || null;
}

function buildShortcut({ id, label, icon, href, logo }, model) {
  const item = model.cloneNode(true);
  const a = item.matches("a") ? item : item.querySelector("a");
  item.dataset.nfeShortcut = id;
  item.dataset.nfeCompact = String(compactSidebar());
  a.setAttribute("aria-label", label);
  a.title = label; // info-bulle, utile quand la barre n'affiche que les icônes
  a.removeAttribute("aria-current");
  a.querySelectorAll('[class*="badge-"]').forEach((badge) => badge.remove()); // pastille copiée du Chat
  const svg = a.querySelector("svg");
  svg.innerHTML = ICONS[icon];
  if (logo) {
    const img = document.createElement("img");
    img.className = "nfe-pub-logo";
    img.src = logo;
    img.alt = "";
    // Logo introuvable : on garde l'icône globe.
    img.addEventListener("error", () => img.replaceWith(svg));
    svg.replaceWith(img);
  }
  const text = [...a.querySelectorAll("div")].find((d) => !d.children.length);
  if (text) {
    text.textContent = label;
    text.classList.add("nfe-label");
  }

  if (href) {
    a.href = href;
    if (id === "calendar") {
      // Substack intercepte les clics sur les liens et change de page sans
      // recharger : le calendrier (calendar.js) ne verrait pas
      // le #calendrier. On change donc l'ancre nous-mêmes, sur la page actuelle.
      a.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (location.hash === "#calendrier") history.replaceState(null, "", location.pathname + location.search);
        location.hash = "calendrier";
      }, true);
    }
  }
  return item;
}

// Interrupteur « Fil » placé à droite du logo Substack.
function buildToggle() {
  const label = document.createElement("label");
  label.id = "nfe-toggle";
  label.title = t("toggleHelp");
  label.innerHTML = `
    <input type="checkbox">
    <span class="nfe-track" aria-hidden="true"></span>
    <span class="nfe-toggle-text"></span>
  `;
  label.querySelector("input").addEventListener("change", (e) => {
    chrome.storage.local.set({ enabled: e.target.checked });
  });
  return label;
}

function renderToggle(toggle) {
  toggle.querySelector("input").checked = settings.enabled;
  const state = settings.enabled ? t("feedHidden") : t("feedVisible");
  toggle.querySelector(".nfe-toggle-text").textContent = state;
  toggle.title = t(settings.enabled ? "toggleToShow" : "toggleToHide", { state });
}

// Substack redessine parfois sa barre (et la réduit en icônes quand la
// fenêtre rétrécit) : on vérifie à chaque passage.
function decorateSidebar() {
  const compact = compactSidebar();
  document.documentElement.classList.toggle("nfe-compact", compact);

  const logo = document.querySelector(LOGO_BUTTON);
  if (logo) {
    let toggle = document.getElementById("nfe-toggle");
    if (!toggle) toggle = buildToggle();
    if (logo.nextElementSibling !== toggle) logo.after(toggle);
    renderToggle(toggle);
  }

  const list = sidebarList();
  const model = sidebarItem(list?.querySelector(MODEL_LINK));
  if (!list || !model) return;
  // On place les raccourcis de bas en haut, chacun juste avant le suivant,
  // le dernier juste avant « Créer » (ou en fin de liste si « Créer » n'y est pas).
  let next = createItem(list);
  for (const shortcut of [...SHORTCUTS, ...myPosts, ...publications].reverse()) {
    let item = document.querySelector(`[data-nfe-shortcut="${shortcut.id}"]`);
    // Raccourci construit pour l'autre format de barre : on le refait.
    if (item && item.dataset.nfeCompact !== String(compact)) {
      item.remove();
      item = null;
    }
    if (!item) item = buildShortcut(shortcut, model);
    if (item.parentElement !== list || item.nextElementSibling !== next) list.insertBefore(item, next);
    next = item;
  }
}

// Les raccourcis des publications arrivent après le chargement : on les reconstruit.
function resetShortcuts() {
  document.querySelectorAll("[data-nfe-shortcut]").forEach((el) => el.remove());
}

// ---------- Éditeur de note ----------

// La barre « Qu'avez-vous en tête ? » ouvre l'éditeur de Substack. Tant qu'il est ouvert,
// le panneau s'efface et le fil reste caché derrière. La mise en page de
// l'éditeur (Post gallery à côté) est gérée par notes.js.
const COMPOSER_BUTTON = 'button[aria-label="Nouveau post"], button[aria-label="New post"]';
const COMPOSER_DIALOG = '[role="dialog"][class*="composerModal-"]';

let openingComposer = 0; // moment du clic, pour masquer le panneau en attendant l'éditeur

function composerOpen() {
  return !!document.querySelector(COMPOSER_DIALOG);
}

function openComposer() {
  const button = document.querySelector(COMPOSER_BUTTON);
  if (!button) {
    // Pas de bouton d'écriture sur cette page : on passe par l'accueil.
    location.href = "https://substack.com/home?action=compose";
    return;
  }
  openingComposer = Date.now();
  button.click();
  update();
}

// ---------- Panneau à la place du fil ----------

let overlay = null;

function buildOverlay() {
  const el = document.createElement("div");
  el.id = "nfe-overlay";
  el.innerHTML = `
    <div class="nfe-card">
      <p class="nfe-quote"></p>
      <button type="button" class="nfe-compose">
        <span class="nfe-avatar"></span>
        <span class="nfe-compose-text"></span>
      </button>
    </div>
  `;
  el.querySelector(".nfe-quote").textContent = greeting();
  el.querySelector(".nfe-compose-text").textContent = t("whatsOnYourMind");
  el.querySelector(".nfe-compose").addEventListener("click", openComposer);
  setAvatar(el);
  return el;
}

// Ta photo de profil à gauche de la barre, comme chez Substack.
function setAvatar(el) {
  const avatar = el.querySelector(".nfe-avatar");
  if (!avatar || !settings.photo || avatar.querySelector("img")) return;
  const img = document.createElement("img");
  img.src = settings.photo;
  img.alt = "";
  avatar.appendChild(img);
}

// Le panneau commence au bord droit de la barre latérale.
function sidebarWidth() {
  const sidebar = sidebarList()?.parentElement;
  return sidebar ? Math.round(sidebar.getBoundingClientRect().right) : 0;
}

// Colonne de droite (recherche, Abonnements, Recommandé pour vous) : un bloc
// fixe autour de la barre de recherche. Le panneau s'arrête à son bord gauche.
// Quand la fenêtre est étroite, Substack la masque : le panneau va jusqu'au bord.
const SEARCH_INPUT = 'input[placeholder*="Rechercher"], input[placeholder*="Search"]';

function rightColumnWidth() {
  let el = document.querySelector(SEARCH_INPUT);
  while (el && el !== document.body && getComputedStyle(el).position !== "fixed") el = el.parentElement;
  if (!el || el === document.body) return 0;
  const box = el.getBoundingClientRect();
  return box.width > 0 && box.left > sidebarWidth() ? Math.round(window.innerWidth - box.left) : 0;
}

function update() {
  if (Date.now() - openingComposer > 3000) openingComposer = 0;
  const hiding = settings.enabled && isFeedPage();
  const writing = hiding && (composerOpen() || openingComposer > 0);
  const shouldHide = hiding && !writing;
  document.documentElement.classList.toggle("nfe-writing", writing);

  if (shouldHide && !overlay) {
    overlay = buildOverlay();
    document.documentElement.appendChild(overlay);
  } else if (!shouldHide && overlay) {
    overlay.remove();
    overlay = null;
  }
  if (overlay) {
    overlay.style.setProperty("--nfe-left", `${sidebarWidth()}px`);
    overlay.style.setProperty("--nfe-right", `${rightColumnWidth()}px`);
  }
  document.documentElement.classList.toggle("nfe-active", shouldHide);

  decorateSidebar();
}

chrome.storage.local.get(["enabled"], (data) => {
  settings.enabled = data.enabled !== false;
  update();
});

loadPublications();

// Synchronise l'interrupteur entre tous les onglets et le popup.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.enabled) return;
  settings.enabled = changes.enabled.newValue !== false;
  update();
});

// Substack est une SPA : on surveille les changements d'URL,
// la barre latérale et l'ouverture / fermeture de l'éditeur de note.
setInterval(update, 300);
})();
