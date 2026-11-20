// Service de fond
// Va chercher les posts programmés sur le domaine de ta publication
// (ex. tanewsletter.substack.com), que la page substack.com ne peut pas lire.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "scheduledPosts") return;
  const host = String(message.host || "");
  if (!/^[a-z0-9-]+\.substack\.com$/i.test(host)) {
    sendResponse({ error: "adresse de publication invalide" });
    return;
  }
  fetch(`https://${host}/api/v1/post_management/scheduled?offset=0&limit=50&order_by=trigger_at&order_direction=asc`, {
    credentials: "include",
  })
    .then((response) => {
      if (!response.ok) throw new Error(`erreur ${response.status}`);
      return response.json();
    })
    .then((data) =>
      sendResponse({
        posts: (data.posts || [])
          .filter((post) => post.trigger_at)
          .map((post) => ({ id: post.id, title: post.draft_title || post.title, trigger_at: post.trigger_at })),
      })
    )
    .catch((error) => sendResponse({ error: error.message }));
  return true; // réponse asynchrone
});
