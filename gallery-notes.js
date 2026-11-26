// Onglets « Notes » et « Citer » dans Post gallery
// À côté de « Vos posts » et « Activité » :
// - Notes liste tes notes (« Les miennes »), celles que tu as likées et celles
//   auxquelles tu as répondu. Un clic sur une note l'intègre dans celle que tu
//   écris : on colle son lien dans l'éditeur (Substack en fait une note
//   intégrée), puis on efface le lien pour ne garder que l'intégration.
//   Substack n'accepte qu'une note intégrée par note.
// - Citer liste tes posts et ceux que tu as lus, likés ou enregistrés. Un clic
//   ouvre le post dans le volet ; tu surlignes un passage et « Citer ce
//   passage » (en bas du volet, à la place de « Ajoutez des posts ») l'ajoute à ta note, comme le Restack d'un passage surligné.
//   Substack enregistre la sélection (PUT /api/v1/post_selection), puis on
//   colle le lien du post suivi de ?selection=<id> : Substack en fait la carte
//   de citation.
// Utilise COMPOSER_DIALOG, views(), sleep() et isReply() de notes.js.

const GN_FILTERS = [
  { id: "mine", label: () => t("notesMine"), types: "note" },
  { id: "liked", label: () => t("notesLiked"), types: "like" },
  { id: "replied", label: () => t("notesReplied"), types: "replies" },
];

const GQ_FILTERS = [
  { id: "authored", label: () => t("quoteMine") },
  { id: "recently_viewed", label: () => t("quoteViewed") },
  { id: "liked", label: () => t("quoteLiked") },
  { id: "saved", label: () => t("quoteSaved") },
];

const gn = {
  tab: null, // onglet affiché : null (ceux de Substack), "notes" ou "quote"
  filter: "mine",
  qFilter: "authored",
  qLists: {}, // filtre → { items, loading, error }
  reader: null, // post ouvert pour le citer : { id, title, loading, error, post, blocks }
  userId: null,
  lists: {}, // filtre → { items, cursor, loading, error, done }
  panel: null,
  savedSelection: null, // aria-selected des onglets de Substack, pour les remettre
  footer: null, // copie du bas du volet de Substack : « Retour » / « Citer ce passage »
  quote: null, // ce que fait « Citer ce passage » pour le post ouvert
};

async function gnUserId() {
  if (!gn.userId) {
    const profile = await fetch("/api/v1/user/profile/self", { credentials: "include" }).then((r) => r.json());
    gn.userId = profile.id;
  }
  return gn.userId;
}

// Une note du fil → { id, url, name, photo, date, body }
function gnNote(comment) {
  return {
    id: comment.id,
    url: `https://substack.com/@${comment.handle}/note/c-${comment.id}`,
    name: comment.name || comment.handle || "",
    photo: comment.photo_url || "",
    date: new Date(comment.date),
    body: comment.body || "",
  };
}

// « Les miennes » et « Likées » : la note elle-même. « Répondues » : la note
// à laquelle tu as répondu (le dernier parent), avec le début de ta réponse.
// Les réponses aux posts (pas des notes) sont ignorées.
function gnItems(filter, items) {
  const out = [];
  for (const item of items || []) {
    if (item.type !== "comment" || !item.comment) continue;
    if (filter === "replied") {
      const parent = item.parentComments?.at(-1);
      if (item.context?.type !== "note" || !parent) continue;
      out.push({ ...gnNote(parent), reply: item.comment.body || "" });
    } else {
      out.push(gnNote(item.comment));
    }
  }
  return out;
}

async function gnLoad(filter) {
  const list = (gn.lists[filter] ||= { items: [], cursor: null, loading: false, error: "", done: false });
  if (list.loading || list.done) return;
  list.loading = true;
  list.error = "";
  gnRender();
  try {
    const id = await gnUserId();
    const types = GN_FILTERS.find((f) => f.id === filter).types;
    let url = `/api/v1/reader/feed/profile/${id}?types%5B%5D=${types}`;
    if (list.cursor) url += `&cursor=${encodeURIComponent(list.cursor)}`;
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) throw new Error(t("httpError", { status: response.status }));
    const data = await response.json();
    const seen = new Set(list.items.map((note) => note.id));
    for (const note of gnItems(filter, data.items)) {
      if (!seen.has(note.id)) {
        seen.add(note.id);
        list.items.push(note);
      }
    }
    list.cursor = data.nextCursor || null;
    list.done = !list.cursor;
  } catch {
    list.error = t("notesLoadListError");
  } finally {
    list.loading = false;
    gnRender();
  }
}

// ---------- Intégrer une note dans celle qu'on écrit ----------

function gnEditor(dialog) {
  return views(dialog)[0]?.querySelector('.ProseMirror[contenteditable="true"]');
}

async function gnEmbed(note) {
  if (note.adding) return;
  note.adding = true;
  gnRender();
  if (await gnPasteLink(note.url)) note.added = true;
  note.adding = false;
  gnRender();
}

// Colle un lien à la fin de la note en cours ; Substack en fait une intégration
// (note ou citation), puis on efface le lien lui-même.
async function gnPasteLink(url) {
  const dialog = document.querySelector(COMPOSER_DIALOG);
  const editor = dialog && gnEditor(dialog);
  if (!editor) return false;

  // Curseur à la fin du texte, puis on colle le lien.
  editor.focus();
  const selection = getSelection();
  const end = document.createRange();
  end.selectNodeContents(editor);
  end.collapse(false);
  selection.removeAllRanges();
  selection.addRange(end);
  const data = new DataTransfer();
  data.setData("text/plain", url);
  editor.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));

  // Substack crée l'intégration en lisant le lien : on attend un peu, puis on efface le lien.
  await sleep(1500);
  // Le dernier exemplaire du lien est celui qu'on vient de coller : on ne
  // touche pas à un lien identique déjà écrit par l'utilisateur plus haut.
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let node = null;
  for (let n; (n = walker.nextNode()); ) if (n.data.includes(url)) node = n;
  if (node) {
    const start = node.data.lastIndexOf(url);
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + url.length);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("delete");
  }
  return true;
}

// ---------- Citer un passage d'un post ----------

async function gqLoad(filter) {
  const list = (gn.qLists[filter] = { items: [], loading: true, error: "" });
  gnRender();
  try {
    const url = filter === "authored"
      ? "/api/v1/comment/attachment_suggestions/posts/authored"
      : "/api/v1/comment/attachment_suggestions/posts";
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) throw new Error(t("httpError", { status: response.status }));
    const data = await response.json();
    const entries = filter === "authored"
      ? data.posts
      : data.suggestions?.find((group) => group.type === filter)?.posts;
    const pubs = new Map((data.publications || []).map((pub) => [pub.id, pub]));
    for (const entry of entries || []) {
      const post = entry.post || entry;
      if (!post?.id || list.items.some((item) => item.id === post.id)) continue;
      list.items.push({
        id: post.id,
        title: post.title || "",
        date: new Date(post.post_date),
        pub: pubs.get(post.publication_id)?.name || "",
        logo: pubs.get(post.publication_id)?.logo_url || "",
        cover: post.cover_image || "",
      });
    }
  } catch {
    list.error = t("notesLoadListError");
  } finally {
    list.loading = false;
    gnRender();
  }
}

// Les paragraphes du post, numérotés comme Substack : paragraphes et titres
// du corps du post, sans ceux des images, intégrations et boutons.
function gqBlocks(html) {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  const blocks = [];
  for (const el of doc.body.querySelectorAll("p, h1, h2, h3, h4, h5, h6, pre")) {
    let parent = el.parentElement;
    while (parent && parent !== doc.body && /^(BLOCKQUOTE|UL|OL|LI)$/.test(parent.tagName)) parent = parent.parentElement;
    if (parent !== doc.body) continue;
    blocks.push({
      tag: el.tagName,
      quote: !!el.closest("blockquote"),
      item: !!el.closest("li"),
      text: el.textContent,
    });
  }
  return blocks;
}

async function gqOpen(item) {
  gn.reader = { id: item.id, title: item.title, loading: true, error: "", post: null, blocks: [] };
  gnRender();
  try {
    const response = await fetch(`/api/v1/posts/by-id/${item.id}`, { credentials: "include" });
    if (!response.ok) throw new Error(t("httpError", { status: response.status }));
    const { post } = await response.json();
    if (gn.reader?.id !== item.id) return;
    gn.reader.post = post;
    gn.reader.blocks = gqBlocks(post.body_html);
    if (!gn.reader.blocks.length) gn.reader.error = t("quoteNoText");
  } catch {
    if (gn.reader?.id === item.id) gn.reader.error = t("quotePostError");
  } finally {
    if (gn.reader?.id === item.id) {
      gn.reader.loading = false;
      gnRender();
    }
  }
}

// La sélection dans le post affiché → ce qu'attend Substack, ou null.
function gqSelection(content) {
  const selection = getSelection();
  if (!selection.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!content.contains(range.commonAncestorContainer)) return null;
  const blockOf = (node) => (node.nodeType === 1 ? node : node.parentElement)?.closest("[data-idx]");
  const start = blockOf(range.startContainer);
  const end = blockOf(range.endContainer);
  if (!start || !end) return null;
  const offsetIn = (block, node, offset) => {
    const before = document.createRange();
    before.setStart(block, 0);
    before.setEnd(node, offset);
    return before.toString().length;
  };
  const text = selection.toString().trim();
  if (!text) return null;
  return {
    text,
    startParagraph: Number(start.dataset.idx),
    endParagraph: Number(end.dataset.idx),
    startOffset: offsetIn(start, range.startContainer, range.startOffset),
    endOffset: offsetIn(end, range.endContainer, range.endOffset),
  };
}

async function gqQuote(content, status) {
  const post = gn.reader?.post;
  const picked = gqSelection(content);
  if (!post || !picked) {
    status.textContent = t("quoteSelectHint");
    return;
  }
  if (gn.quoting) return;
  gn.quoting = true;
  gnRenderFooter();
  status.textContent = t("loading");
  try {
    const response = await fetch("/api/v1/post_selection", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: post.id, publication_id: post.publication_id, ...picked }),
    });
    if (!response.ok) throw new Error(t("httpError", { status: response.status }));
    const { selection } = await response.json();
    if (!selection?.id) throw new Error("no selection");
    const link = `${post.canonical_url.split("?")[0]}?selection=${selection.id}`;
    if (!(await gnPasteLink(link))) throw new Error("no editor");
    status.textContent = t("quoteDone");
  } catch {
    status.textContent = t("quoteError");
  } finally {
    gn.quoting = false;
    gnRenderFooter();
  }
}

// ---------- Affichage ----------

// Comme Substack : « 13 sept. » cette année, « 11 février 2025 » avant.
const gqDate = (date) =>
  date.getFullYear() === new Date().getFullYear()
    ? date.toLocaleDateString(DATE_LOCALE, { day: "numeric", month: "short" })
    : date.toLocaleDateString(DATE_LOCALE, { day: "numeric", month: "long", year: "numeric" });

const gnDate = (date) => date.toLocaleDateString(DATE_LOCALE, { day: "numeric", month: "short" });

function gnRow(note) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "snw-gn-note";
  row.title = t("notesEmbedHelp");
  if (note.added) row.classList.add("snw-gn-added");
  if (note.adding) row.classList.add("snw-gn-adding");
  row.innerHTML = `
    <span class="snw-gn-main">
      <span class="snw-gn-head"><img alt=""><strong></strong><span class="snw-gn-date"></span></span>
      <span class="snw-gn-body"></span>
    </span>
  `;
  const img = row.querySelector("img");
  if (note.photo) img.src = note.photo;
  else img.remove();
  row.querySelector("strong").textContent = note.name;
  row.querySelector(".snw-gn-date").textContent = gnDate(note.date);
  row.querySelector(".snw-gn-body").textContent = note.body.trim() || "…";
  if (note.reply) {
    const reply = document.createElement("span");
    reply.className = "snw-gn-reply";
    reply.textContent = t("notesYourReply", { text: note.reply.trim() });
    row.querySelector(".snw-gn-main").appendChild(reply);
  }
  row.addEventListener("click", () => gnEmbed(note));
  return row;
}

function gnRender() {
  const panel = gn.panel;
  if (!panel?.isConnected || !gn.tab) return;
  const scroll = gnScroller(panel);
  const top = scroll?.scrollTop;
  gn.quote = null;
  if (gn.tab === "quote") gqRender(panel);
  else gnRenderNotes(panel);
  if (scroll) scroll.scrollTop = top;
  gnRenderFooter();
}

// Le bas du volet, seulement quand un post est ouvert dans Citer : même place
// et même style que « Annuler / Ajoutez des posts » de Substack.
function gnRenderFooter() {
  const footer = gn.footer;
  if (!footer?.isConnected) return;
  const reading = gn.tab === "quote" && !!gn.reader;
  footer.closest('[class*="track-"] > [class*="view-"]')?.classList.toggle("snw-gq-reading", reading);
  const buttons = footer.querySelectorAll("button");
  const back = buttons[0];
  const primary = buttons[buttons.length - 1];
  if (!back || !primary || back === primary) return;
  gnSetLabel(back, t("quoteBackShort"));
  gnSetLabel(primary, t("quoteAction"));
  const enabled = reading && !!gn.quote && !gn.quoting;
  primary.disabled = !enabled;
  primary.classList.toggle("snw-gn-primary-on", enabled);
}

// Change le texte d'un bouton de Substack copié, sans casser sa mise en forme.
function gnSetLabel(button, text) {
  const label = [...button.querySelectorAll("*")].reverse().find((el) => !el.children.length && el.textContent.trim()) || button;
  if (label.textContent !== text) label.textContent = text;
}

// La zone qui défile autour de notre liste (pour garder la position quand on coche).
function gnScroller(el) {
  for (let node = el; node; node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight && /(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
  }
  return null;
}

function gnRenderNotes(panel) {
  const list = gn.lists[gn.filter] || { items: [], loading: true };
  panel.innerHTML = `
    <div class="snw-gn-filters"></div>
    <div class="snw-gn-list"></div>
  `;
  const filters = panel.querySelector(".snw-gn-filters");
  for (const filter of GN_FILTERS) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "snw-gn-chip";
    chip.textContent = filter.label();
    chip.setAttribute("aria-pressed", String(filter.id === gn.filter));
    chip.addEventListener("click", () => {
      gn.filter = filter.id;
      gnRender();
      if (!gn.lists[filter.id] || gn.lists[filter.id].error) gnLoad(filter.id);
    });
    filters.appendChild(chip);
  }

  const box = panel.querySelector(".snw-gn-list");
  for (const note of list.items) box.appendChild(gnRow(note));
  const status = document.createElement("p");
  status.className = "snw-gn-status";
  if (list.error) status.textContent = list.error;
  else if (list.loading) status.textContent = t("loading");
  else if (!list.items.length) status.textContent = t("notesEmpty");
  if (status.textContent) box.appendChild(status);
  if (!list.loading && !list.done && !list.error && list.items.length) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "snw-gn-more";
    more.textContent = t("notesMore");
    more.addEventListener("click", () => gnLoad(gn.filter));
    box.appendChild(more);
  }
}

function gqRender(panel) {
  panel.innerHTML = "";
  const reader = gn.reader;
  if (reader) {
    panel.innerHTML = `
      <h3 class="snw-gq-title"></h3>
      <p class="snw-gn-hint"></p>
      <p class="snw-gq-status"></p>
      <div class="snw-gq-content"></div>
    `;
    panel.querySelector(".snw-gq-title").textContent = reader.title;
    panel.querySelector(".snw-gn-hint").textContent = t("quoteSelectHint");
    const content = panel.querySelector(".snw-gq-content");
    const status = panel.querySelector(".snw-gq-status");
    if (reader.loading) status.textContent = t("loading");
    else if (reader.error) status.textContent = reader.error;
    reader.blocks.forEach((block, i) => {
      const el = document.createElement(/^H/.test(block.tag) ? "h4" : "p");
      el.dataset.idx = String(i);
      if (block.quote) el.classList.add("snw-gq-quote");
      if (block.item) el.classList.add("snw-gq-item");
      el.textContent = block.text;
      content.appendChild(el);
    });
    if (!reader.loading && !reader.error) gn.quote = () => gqQuote(content, status);
    return;
  }

  const list = gn.qLists[gn.qFilter] || { items: [], loading: true };
  panel.innerHTML = `
    <div class="snw-gn-filters"></div>
    <div class="snw-gn-list"></div>
  `;
  const filters = panel.querySelector(".snw-gn-filters");
  for (const filter of GQ_FILTERS) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "snw-gn-chip";
    chip.textContent = filter.label();
    chip.setAttribute("aria-pressed", String(filter.id === gn.qFilter));
    chip.addEventListener("click", () => {
      gn.qFilter = filter.id;
      if (!gn.qLists[filter.id] || gn.qLists[filter.id].error) gqLoad(filter.id);
      else gnRender();
    });
    filters.appendChild(chip);
  }
  const box = panel.querySelector(".snw-gn-list");
  for (const item of list.items) {
    // Même présentation que la galerie de posts de Substack : vignette,
    // titre sur une ligne, puis « Publication · date ».
    const row = document.createElement("button");
    row.type = "button";
    row.className = "snw-gq-post";
    row.innerHTML = `<img class="snw-gq-thumb" alt=""><span class="snw-gq-text"><span class="snw-gq-ptitle"></span><span class="snw-gq-meta"></span></span>`;
    const img = row.querySelector("img");
    if (item.cover || item.logo) img.src = item.cover || item.logo;
    else img.replaceWith(Object.assign(document.createElement("span"), { className: "snw-gq-thumb" }));
    row.querySelector(".snw-gq-ptitle").textContent = item.title || "…";
    row.querySelector(".snw-gq-meta").textContent = [item.pub, isNaN(item.date) ? "" : gqDate(item.date)].filter(Boolean).join(" · ");
    row.addEventListener("click", () => gqOpen(item));
    box.appendChild(row);
  }
  const status = document.createElement("p");
  status.className = "snw-gn-status";
  if (list.error) status.textContent = list.error;
  else if (list.loading) status.textContent = t("loading");
  else if (!list.items.length) status.textContent = t("quoteEmpty");
  if (status.textContent) box.appendChild(status);
}

// ---------- Panneaux dans Post gallery ----------
// La galerie de Substack sert de contenant aux trois panneaux. En « notes » ou
// « quote », la recherche, les onglets, la liste et le bas du volet de Substack
// sont masqués et notre liste prend leur place.


// Le volet Post gallery : celui qui contient les onglets « Vos posts » / « Activité ».
function gnGallery(dialog) {
  return views(dialog).find((view, i) => i > 0 && view.querySelector('[role="tablist"]'));
}

// Appelée par les icônes de l'éditeur (notes.js) : "posts", "notes" ou "quote".
function gnShow(dialog, mode) {
  const gallery = gnGallery(dialog);
  gn.shownAt = Date.now();
  if (gallery) gnSetActive(gallery, mode === "posts" ? null : mode);
}

// which : "notes", "quote" ou null pour la galerie de posts de Substack.
function gnSetActive(gallery, which) {
  const tablist = gallery.querySelector('[role="tablist"]');
  const theirs = [...tablist.querySelectorAll('[role="tab"]')];
  if (which && !gn.tab) gn.savedSelection = theirs.map((tab) => tab.getAttribute("aria-selected"));
  if (!which && gn.tab && gn.savedSelection) {
    theirs.forEach((tab, i) => tab.setAttribute("aria-selected", gn.savedSelection[i] ?? "false"));
  }
  gn.tab = which;
  if (which) theirs.forEach((tab) => tab.setAttribute("aria-selected", "false"));
  gallery.classList.toggle("snw-gn-on", !!which);
  gnTitle(gallery);
  if (which === "notes" && (!gn.lists[gn.filter] || gn.lists[gn.filter].error)) gnLoad(gn.filter);
  else if (which === "quote" && (!gn.qLists[gn.qFilter] || gn.qLists[gn.qFilter].error)) gqLoad(gn.qFilter);
  else gnRender();
}

function gnDecorate() {
  const found = document.querySelector(COMPOSER_DIALOG);
  const dialog = found && !isReply(found) ? found : null;
  if (!dialog) {
    // Éditeur fermé (ou réponse à une note) : les listes seront rechargées à la prochaine ouverture.
    gn.tab = null;
    gn.lists = {};
    gn.qLists = {};
    gn.reader = null;
    return;
  }
  const gallery = gnGallery(dialog);
  const tablist = gallery?.querySelector('[role="tablist"]');
  if (!tablist) return;

  // Galerie refermée : la prochaine ouverture (par exemple via le menu « ⋯ »
  // de Substack) repart sur la galerie de posts.
  if (gn.tab && !isActive(gallery) && Date.now() - (gn.shownAt || 0) > 1500) gnSetActive(gallery, null);
  gnTitle(gallery);

  // Une flèche « ‹ » en haut à gauche ferme le panneau, comme dans Brouillons :
  // on copie le bouton retour de Brouillons pour garder le même style.
  const header = gallery.firstElementChild;
  if (header && !header.querySelector("[data-snw-close]")) {
    const model = dialog.querySelector('button[aria-label="back"]');
    if (model) {
      const close = model.cloneNode(true);
      close.dataset.snwClose = "";
      close.setAttribute("aria-label", t("closePanel"));
      close.title = t("closePanel");
      close.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleGallery(dialog);
      });
      header.prepend(close);
    }
  }

  // Notre liste prend la place de celle de Substack : juste sous les onglets
  // (le premier bloc qui les contient et qui est suivi d'autre chose).
  if (!gn.panel || !gallery.contains(gn.panel)) {
    let header = tablist;
    while (header !== gallery && !header.nextElementSibling) header = header.parentElement;
    if (header === gallery) return;
    // La recherche et les onglets de Substack ne servent qu'à la galerie de posts.
    header.classList.add("snw-gn-tabsrow");
    gn.panel = document.createElement("div");
    gn.panel.id = "snw-gallery-notes";
    header.after(gn.panel);
    gnRender();
  }
  // Ce qui suit notre liste (la liste de Substack) est masqué quand nos onglets
  // sont affichés. Si on est directement dans le volet, seul le bloc suivant
  // est masqué : le dernier, ce sont les boutons Annuler / Ajoutez des posts.
  let next = gn.panel.nextElementSibling;
  while (next) {
    if (next.id !== "snw-gallery-footer") next.classList.add("snw-gn-under");
    if (gn.panel.parentElement === gallery) break;
    next = next.nextElementSibling;
  }
  // Le bas du volet de Substack (Annuler / Ajoutez des posts) ne sert qu'à
  // « Vos posts » et « Activité » : il est masqué dans Notes et Citer.
  const theirs = gnFooterRow(gallery);
  theirs?.classList.add("snw-gn-their-footer");
  // Quand un post est ouvert dans Citer, une copie de ce bas de volet propose
  // « Retour » et « Citer ce passage ».
  if (theirs && (!gn.footer || !gallery.contains(gn.footer))) {
    gn.footer = theirs.cloneNode(true);
    gn.footer.id = "snw-gallery-footer";
    gn.footer.classList.remove("snw-gn-their-footer", "snw-gn-under");
    // mousedown : garder le passage surligné au moment du clic.
    gn.footer.addEventListener("mousedown", (e) => e.preventDefault());
    gn.footer.addEventListener("click", (e) => {
      const button = e.target.closest("button");
      if (!button) return;
      e.preventDefault();
      e.stopPropagation();
      const buttons = gn.footer.querySelectorAll("button");
      if (button === buttons[0]) {
        gn.reader = null;
        gnRender();
      } else if (button === buttons[buttons.length - 1] && !button.disabled) {
        gn.quote?.();
      }
    }, true);
    theirs.after(gn.footer);
    gnRenderFooter();
  }
  gallery.classList.toggle("snw-gn-on", !!gn.tab);
  // Substack peut réécrire les classes du volet : on remet aussi celle du post ouvert.
  gallery.classList.toggle("snw-gq-reading", gn.tab === "quote" && !!gn.reader);
}

// Le titre du panneau : « Sélectionnez des posts » devient « Galerie de posts »,
// « Galerie de notes » ou « Citations » selon l'icône choisie.
function gnTitle(gallery) {
  let heading = gallery.querySelector("[data-snw-title]");
  if (!heading) {
    heading = [...gallery.querySelectorAll("h1, h2, h3, h4, div, span")]
      .find((el) => !el.children.length && /^(Sélectionnez des posts|Select posts)$/.test(el.textContent.trim()));
    if (!heading) return;
    heading.dataset.snwTitle = "";
  }
  const text = gn.tab === "notes" ? t("panelNotes") : gn.tab === "quote" ? t("panelQuotes") : t("panelPosts");
  if (heading.textContent !== text) heading.textContent = text;
  // Une bulle « i » à côté du titre explique comment se servir de Notes et Citations.
  let info = heading.nextElementSibling?.matches?.(".snw-info") ? heading.nextElementSibling : null;
  if (!info) {
    info = document.createElement("span");
    info.className = "snw-info";
    info.tabIndex = 0;
    info.setAttribute("role", "img");
    info.textContent = "i";
    heading.after(info);
  }
  const help = gn.tab === "notes" ? t("notesEmbedHelp") : gn.tab === "quote" ? t("quoteHelp") : "";
  info.hidden = !help;
  if (info.dataset.tip !== help) {
    info.dataset.tip = help;
    info.setAttribute("aria-label", help);
  }
}

// La rangée de boutons en bas du volet : celle du dernier bouton de Substack.
function gnFooterRow(gallery) {
  const buttons = [...gallery.querySelectorAll("button")].filter((b) => !b.closest("#snw-gallery-notes, #snw-gallery-footer"));
  let row = buttons[buttons.length - 1]?.parentElement;
  while (row && row !== gallery && row.querySelectorAll("button").length < 2) row = row.parentElement;
  return row && row !== gallery ? row : null;
}

setInterval(gnDecorate, 300);
