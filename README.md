# Quiet for Substack

Hide the feed, plan your Notes, stay focused on writing. A Chrome extension for Substack creators.

> Not affiliated with Substack. Available in English and French: the extension follows your Chrome language.

![Substack home with the feed hidden and the switch next to the logo](store/screenshot-1.png)

## What it does

- **Hides the home feed.** A switch next to the Substack logo shows or hides it. The sidebar, the right column (search, subscriptions, recommendations), your posts and your publications stay accessible.
- **Adds sidebar shortcuts:** the Notes calendar, saved posts, your published posts and each of your publications.
- **Wider Note editor** with a schedule of your daily Note slots, showing the next free slot.
- **Three icons at the top of the editor** open a floating panel next to it:
  - **Post gallery:** Substack's own gallery, one click away.
  - **Notes gallery:** your Notes, the ones you liked and the ones you replied to. Click one to embed it in the Note you're writing.
  - **Quotes:** open one of your posts (or one you read, liked or saved), highlight a passage and add it to your Note as a quote, without leaving the editor.
- **Calendar settings** in one place ("Set up my calendar" under the orange button): show or hide weekends, add or remove daily slots, and your best hours, the hours of the day when your Notes get the most likes, restacks and replies, with a button to add them to your slots.
- **Replies stay simple:** replying to a Note keeps Substack's normal editor.
- **15-day Notes calendar** to move, edit, reschedule or delete your scheduled Notes.

![Note editor with the Post gallery and the daily Notes schedule](store/screenshot-2.png)

![Quote a passage of a post in your Note](store/screenshot-4.png)

![15-day Notes calendar](store/screenshot-3.png)

![Calendar settings with your best hours](store/screenshot-5.png)

Everything stays in your browser: the extension collects and sends no data. See the [privacy policy](PRIVACY.md).

## Install

1. Download this repository: green **Code** button → **Download ZIP**, then unzip it.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the unzipped `quiet-substack-main` folder.
5. Refresh your Substack tabs.

Pin the extension (puzzle icon → pin) to reach its settings in one click.

## Update

There are no automatic updates outside the Chrome Web Store. To get a new version:

1. Download the ZIP again and replace the old folder with the new one (same location).
2. In `chrome://extensions`, click the reload arrow on Quiet for Substack.
3. Refresh your Substack tabs.

To be notified of new versions: **Watch** → **Custom** → **Releases** at the top of this page.

## If something breaks

Substack changes its pages often, and the extension relies on their layout. If a feature stops working, first refresh the tab, then check for a newer version. Still broken? Open an issue with a screenshot.

---

## En français

**Installer :** bouton vert **Code** → **Download ZIP**, dézipper, ouvrir `chrome://extensions`, activer le **mode développeur**, cliquer sur **Charger l'extension non empaquetée** et choisir le dossier `quiet-substack-main`. Rafraîchir les onglets Substack.

**Mettre à jour :** retélécharger le ZIP, remplacer l'ancien dossier, cliquer sur la flèche de rechargement de l'extension dans `chrome://extensions`, puis rafraîchir Substack.

---

## Release (Chrome Web Store)

The store listing texts, privacy answers and images are in [`store/`](store/FICHE-STORE.md). To build the package to upload:

```bash
zip -r quiet-for-substack-$(node -p "require('./manifest.json').version").zip manifest.json _locales icons *.js *.css popup.html LICENSE
```

## License

[GPL-3.0](LICENSE). You can use, modify and share this extension, as long as your modified versions stay open source under the same license.
