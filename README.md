# Italiano

Italian language learning app for iPhone and desktop.

Open https://magzhanov.github.io/italiano/ in your browser.

## Install on iPhone

Open the site in Safari, tap Share, then Add to Home Screen. If Safari offers Open as Web App, leave it enabled.

## Automatic progress sync

Open Progress & sync and connect each device using the same fine-grained GitHub token. The token must be limited to the private magzhanov/italiano-progress repository, with Contents: read and write. Paste it only into the app's Sync key field; never commit it or use your GitHub password. It is stored in this browser, excluded from backups, and sent only to api.github.com to access the progress repository.

Progress is saved locally first. When connected, the app merges answer history, covered items, mastered verb forms, reading, translation, and dialogue progress. It uploads about 15 seconds after a change and checks for remote updates every minute while open, as well as when the app returns to the foreground or the connection comes back. Voice settings stay device-specific. If writing differs on two devices, the newer response is shown and earlier versions remain in the exact progress backup.

GitHub tokens expire. If sync requests a new key, create a replacement with the same limited access and reconnect each device. Disconnecting keeps local progress. The automatic merge preserves existing evidence; importing an older backup while connected does not erase newer cloud progress.

## Backups and offline use

Use Download progress file to keep an exact backup, or import one from an older device. The original manual transfer controls remain available. After the first successful online visit, the service worker caches the application for offline use. Private API responses are excluded from that cache. Italian speech playback depends on the voices installed on your device.

## Hosting and validation

GitHub Pages serves static files from main at the repository root, without a build step. Keep index.html, cloud-sync.js, sw.js, manifest.webmanifest and the three icons together. The private progress repository is separate and has no Pages site.

The local test suite is outside the published folder: node --test tests/cloud-sync.test.cjs. It covers two-device merging, simultaneous writes, offline edits, in-flight saves, written response conflicts, private repository enforcement, and cache exclusions.
