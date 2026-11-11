# Streakline 🎯

A clean, high-contrast, offline-first personal habit and streak tracker.

![Streakline Icon](icon.svg)

## Download and use

Visit the [Streakline web app](https://primordial04.github.io/Streak/) to use it in a browser. Your data stays on your device.

For native installers, open [Releases](https://github.com/Primordial04/Streak/releases/latest) and choose the file for your device:

| Platform | Download |
| --- | --- |
| Windows | .exe installer |
| macOS | .dmg disk image |
| Linux | .AppImage or .deb package |
| Android | Signed .apk installer |

The release workflow creates these downloads when a v* version tag is published. macOS builds are not notarized, so macOS may ask you to confirm opening the downloaded app. Android releases require the repository owner to configure a persistent signing key using the GitHub Actions secrets ANDROID_KEY_BASE64, ANDROID_KEY_ALIAS, and ANDROID_KEY_PASSWORD. Keep that key private and backed up; future Android updates must use the same key. Publishing through Google Play requires a signed .aab and a Play Console account.

## Features

- **Streak & Habit Tracking**: Track daily habits, consistency scores, and milestone badges.
- **Calendar & Contribution Heatmaps**: Visual GitHub-style heatmap (26 and 53 weeks) and monthly calendar views.
- **Personal Profile**: Add your name and a custom profile picture or animated GIF with automatic canvas compression.
- **History Preservation**: Archive habits instead of destructive deletion so past streaks are never lost.
- **Interactive Tour & User Manual**: Built-in walkthrough and on-demand guide.
- **Offline & Private**: Offline-first PWA with Service Worker caching and local JSON backup export/import.
- **Accessible Colors**: Default accent colors meet at least 4.5:1 contrast for text; custom accent colors with insufficient contrast are rejected.
- **Theme Colors**: Choose separate dark and light accent colors with a color picker or hex code.
- **Motion**: Smooth hover and keyboard-focus labels, button ripples, and reduced-motion support.

## Run locally

Start the browser version on port 3000:

```bash
npm start
```

Then open [http://localhost:3000](http://localhost:3000).

To run the desktop app during development, install the prerequisites for [Tauri](https://v2.tauri.app/start/prerequisites/), then run:

```bash
npm install
npm run tauri dev
```

## Build

The v* GitHub Actions release workflow builds Windows .exe, macOS .dmg, Linux .AppImage and .deb, and a signed Android .apk, then attaches them to the GitHub release. Build the static web bundle locally with:

```bash
npm run build:web
```

The Pages workflow publishes the web app at [primordial04.github.io/Streak](https://primordial04.github.io/Streak/).

## Tests

```bash
npm test
```

## License

[MIT](LICENSE)
