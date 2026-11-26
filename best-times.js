// Meilleures heures pour publier
// Dans les paramètres du calendrier, « Tes meilleures heures » classe les heures de
// la journée selon l'engagement moyen de tes notes publiées à cette heure-là
// (likes + restacks ×2 + réponses ×2), d'après tes notes de plus de 48 h.
// Un bouton ajoute l'heure à tes créneaux quotidiens (les mêmes que dans la popup).
// Le résultat est gardé 24 h dans chrome.storage.local.
// Utilise slots de notes.js et renderCalendar() de calendar.js.

const BT_KEY = "bestTimes";
const BT_MAX_AGE = 24 * 60 * 60 * 1000;
const BT_MATURE = 48 * 60 * 60 * 1000; // une note plus récente n'a pas fini sa vie
const BT_PAGES = 15; // ~12 notes par page
const BT_PRIOR = 3; // lissage : une heure avec peu de notes est tirée vers la moyenne

const bt = { data: null, loading: false, error: "", open: false };

const btScore = (c) => (c.reaction_count || 0) + 2 * (c.restacks || 0) + 2 * (c.children_count || 0);

async function btCompute() {
  const profile = await btProfile();
  const notes = [];
  let cursor = null;
  for (let page = 0; page < BT_PAGES; page++) {
    let url = `/api/v1/reader/feed/profile/${profile.id}?types%5B%5D=note`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    for (const item of data.items || []) {
      if (item.comment && item.context?.type === "note") notes.push(item.comment);
    }
    cursor = data.nextCursor;
    if (!cursor) break;
  }
  const mature = notes.filter((c) => Date.now() - new Date(c.date) > BT_MATURE);
  const byHour = new Map();
  let total = 0;
  for (const c of mature) {
    const hour = new Date(c.date).getHours();
    const entry = byHour.get(hour) || { hour, n: 0, sum: 0 };
    entry.n++;
    entry.sum += btScore(c);
    total += btScore(c);
    byHour.set(hour, entry);
  }
  const mean = mature.length ? total / mature.length : 0;
  const hours = [...byHour.values()]
    .filter((e) => e.n >= 2)
    .map((e) => ({ hour: e.hour, n: e.n, avg: e.sum / e.n, score: (e.sum + BT_PRIOR * mean) / (e.n + BT_PRIOR) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const oldest = mature.reduce((min, c) => Math.min(min, new Date(c.date)), Date.now());
  return { at: Date.now(), userId: profile.id, count: mature.length, since: oldest, hours };
}

async function btProfile() {
  const response = await fetch("/api/v1/user/profile/self", { credentials: "include" });
  if (!response.ok) throw new Error(String(response.status));
  const profile = await response.json();
  if (!profile?.id) throw new Error("no profile");
  return profile;
}

async function btLoad() {
  // Après une erreur, on ne réessaie que si l'utilisateur rouvre la section.
  if (bt.loading || bt.data || bt.error) return;
  bt.loading = true;
  try {
    const stored = (await chrome.storage.local.get(BT_KEY))[BT_KEY];
    // Le cache vaut pour un seul compte : un autre compte refait le calcul.
    const { id } = await btProfile();
    if (stored && stored.userId === id && Date.now() - stored.at < BT_MAX_AGE) {
      bt.data = stored;
    } else {
      bt.data = await btCompute();
      chrome.storage.local.set({ [BT_KEY]: bt.data });
    }
  } catch {
    bt.error = t("bestError");
  } finally {
    bt.loading = false;
    if (typeof renderCalendar === "function") renderCalendar();
  }
}

const btHourLabel = (hour) => {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toLocaleTimeString(DATE_LOCALE, { hour: "numeric" });
};

const btHasSlot = (hour) => slots.some((time) => Number(time.split(":")[0]) === hour);

function btAddSlot(hour) {
  const time = `${String(hour).padStart(2, "0")}:00`;
  // La popup et le calendrier suivent chrome.storage : tout se met à jour.
  chrome.storage.local.set({ slots: [...new Set([...slots, time])].sort() });
}

// Appelée par l'onglet Paramètres du calendrier : le calcul se lance à l'affichage.
function renderBestTimes(box) {
  if (!box) return;
  box.innerHTML = `<div class="snw-best"><div class="snw-best-body"></div></div>`;
  btLoad();
  const body = box.querySelector(".snw-best-body");
  const note = (text) => {
    const p = document.createElement("p");
    p.className = "snw-best-note";
    p.textContent = text;
    body.appendChild(p);
  };
  if (bt.loading || (!bt.data && !bt.error)) return note(t("loading"));
  if (bt.error) return note(bt.error);
  if (!bt.data.hours.length) return note(t("bestTooFew"));
  for (const entry of bt.data.hours) {
    const line = document.createElement("div");
    line.className = "snw-best-row";
    const label = document.createElement("span");
    label.innerHTML = "<strong></strong> <small></small>";
    label.querySelector("strong").textContent = btHourLabel(entry.hour);
    label.querySelector("small").textContent = t("bestLine", {
      avg: entry.avg.toLocaleString(DATE_LOCALE, { maximumFractionDigits: 1 }),
      n: entry.n,
    });
    line.appendChild(label);
    if (btHasSlot(entry.hour)) {
      const done = document.createElement("span");
      done.className = "snw-best-have";
      done.textContent = t("bestHave");
      line.appendChild(done);
    } else {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "snw-best-add";
      add.textContent = t("bestAdd");
      add.addEventListener("click", () => btAddSlot(entry.hour));
      line.appendChild(add);
    }
    body.appendChild(line);
  }
  note(t("bestBasis", {
    n: bt.data.count,
    date: new Date(bt.data.since).toLocaleDateString(DATE_LOCALE, { day: "numeric", month: "short" }),
  }));
}
