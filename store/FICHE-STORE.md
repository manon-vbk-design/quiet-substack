# Fiche Chrome Web Store : Quiet for Substack

Textes à copier-coller dans le tableau de bord développeur du Chrome Web Store
(https://chrome.google.com/webstore/devconsole), onglet par onglet.

---

## Onglet « Fiche Play Store » (Store listing)

**Langue par défaut :** English. Ajoute ensuite « Français » avec les textes FR plus bas.

**Titre et résumé :** repris automatiquement du manifeste (`_locales/en` et `_locales/fr`) :
- EN : Quiet for Substack · Hide the Substack feed and write your Notes calmly: daily slots, best hours, a calendar, quotes and note embeds.
- FR : Quiet for Substack · Masque le fil de Substack et écris tes notes au calme : créneaux, meilleures heures, calendrier, citations.

**Catégorie :** Productivité → Outils (Productivity → Tools)

### Description (EN)

```
Substack is a great place to write, and a very easy place to scroll. Quiet for Substack keeps the tools and hides the noise, so you open Substack to write and not to lose an hour in the feed.

HIDE THE FEED
• A switch next to the Substack logo hides or shows the home feed.
• The sidebar, search, your subscriptions, your posts and your publications stay one click away.
• New sidebar shortcuts: the Notes calendar, saved posts, your published posts and each of your publications.

WRITE YOUR NOTES CALMLY
• A wider Note editor with three icons at the top, each opening a floating panel next to it.
• Post gallery: Substack's own gallery, one click away.
• Notes gallery: your Notes, the ones you liked and the ones you replied to. One click embeds a Note in the one you're writing.
• Quotes: open one of your posts (or one you read, liked or saved), highlight a passage and add it to your Note as a quote, without leaving the editor.
• Replies to a Note keep Substack's normal editor.

PLAN THEM
• Your daily Note slots, with the next free slot and a "Schedule and new note" button.
• Calendar settings in one place: show or hide weekends, your daily slots, and your best hours (the hours when your Notes get the most likes, restacks and replies), with a button to add them to your slots.
• A 15-day calendar to see, move, edit or reschedule your scheduled Notes and posts.

PRIVATE BY DESIGN
No account, no server, no tracking. Everything stays in your browser; the extension only talks to Substack, with your own login.

Available in English and French (it follows your Chrome language).
Free and open source (GPL-3.0): github.com/manon-vbk-design/quiet-substack

Not affiliated with Substack.
```

### Description (FR)

```
Substack est un super endroit pour écrire, et un endroit très facile pour scroller. Quiet for Substack garde les outils et cache le bruit : tu ouvres Substack pour écrire, pas pour perdre une heure dans le fil.

MASQUE LE FIL
• Un interrupteur à côté du logo Substack masque ou affiche le fil d'accueil.
• La barre latérale, la recherche, tes abonnements, tes posts et tes publications restent à un clic.
• De nouveaux raccourcis dans la barre latérale : le calendrier des notes, les posts enregistrés, tes posts publiés et chacune de tes publications.

ÉCRIS TES NOTES AU CALME
• Un éditeur de note plus large, avec trois icônes en haut qui ouvrent chacune un panneau flottant à côté.
• Galerie de posts : la galerie de Substack, en un clic.
• Galerie de notes : tes notes, celles que tu as likées et celles auxquelles tu as répondu. Un clic intègre une note dans celle que tu écris.
• Citations : ouvre un de tes posts (ou un post lu, liké ou enregistré), surligne un passage et ajoute-le à ta note en citation, sans quitter l'éditeur.
• Les réponses à une note gardent l'éditeur normal de Substack.

ORGANISE-LES
• Tes créneaux quotidiens, avec le prochain créneau libre et un bouton « Programmer et nouvelle note ».
• Les paramètres du calendrier au même endroit : afficher ou non les week-ends, tes créneaux quotidiens et tes meilleures heures (celles où tes notes récoltent le plus de likes, restacks et réponses), avec un bouton pour les ajouter à tes créneaux.
• Un calendrier sur 15 jours pour voir, déplacer, modifier ou reprogrammer tes notes et posts programmés.

RESPECTE TA VIE PRIVÉE
Pas de compte, pas de serveur, pas de pistage. Tout reste dans ton navigateur ; l'extension ne parle qu'à Substack, avec ta propre connexion.

Disponible en français et en anglais (elle suit la langue de Chrome).
Gratuite et open source (GPL-3.0) : github.com/manon-vbk-design/quiet-substack

Sans lien avec Substack.
```

### Images

| Champ | Fichier | Taille |
|---|---|---|
| Icône | `icons/icon128.png` | 128 × 128 |
| Captures d'écran (1 à 5) | `store/screenshot-1.png` … | 1280 × 800 |
| Petite vignette promotionnelle | `store/promo-440x280.png` | 440 × 280 |

**Site web :** https://github.com/manon-vbk-design/quiet-substack
**Assistance :** https://github.com/manon-vbk-design/quiet-substack/issues

---

## Onglet « Pratiques de confidentialité » (Privacy practices)

**Objectif unique (single purpose) :**
```
Make Substack calmer for writers: hide the home feed and add tools to write, schedule and plan Substack Notes on substack.com.
```

**Justification de « storage » :**
```
Saves the user's settings locally: whether the home feed is hidden, their daily Note slots, whether weekends are shown, and a cached "best hours" calculation. Nothing leaves the browser.
```

**Justification de l'autorisation d'hôte (https://*.substack.com/*) :**
```
The extension only works on Substack. It changes substack.com pages (hides the feed, widens the Note editor) and reads the user's own Notes, posts and scheduled posts from Substack's API with their existing login. It needs the publication subdomain (yourname.substack.com) to list scheduled posts in the calendar.
```

**Code distant (remote code) :** Non, je n'utilise pas de code distant. *(No, I am not using remote code.)*

**Utilisation des données :** ne coche **aucune** catégorie de données collectées. Coche les trois certifications :
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**URL de la politique de confidentialité :**
```
https://github.com/manon-vbk-design/quiet-substack/blob/main/PRIVACY.md
```

---

## Onglet « Distribution »

- **Paiement :** gratuit.
- **Visibilité :** Public (ou « Non répertorié » si tu veux d'abord la partager seulement par lien).
- **Régions :** toutes.

---

## Mettre à jour plus tard

1. Augmente `version` dans `manifest.json` (ex. 1.4.0 → 1.4.1).
2. Refais le zip (voir le README, section « Release »).
3. Tableau de bord → ton extension → **Package** → **Upload new package**, puis **Submit for review**.
Les personnes qui l'ont installée la reçoivent automatiquement après validation.
