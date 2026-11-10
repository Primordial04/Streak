# Streakline 🎯

A clean, high-contrast, offline-first personal habit and streak tracker.

![Streakline Icon](icon.svg)

## ✨ Features
- **Streak & Habit Tracking**: Track daily habits, consistency scores, and milestone badges.
- **Calendar & Contribution Heatmaps**: Visual GitHub-style heatmap (26 and 53 weeks) and monthly calendar views.
- **Personal Profile**: Add your name and a custom profile picture or animated GIF with automatic canvas compression.
- **History Preservation**: Archive habits instead of destructive deletion so past streaks are never lost.
- **Interactive Tour & User Manual**: Built-in 8-step walkthrough and an on-demand guide to habits, deadlines, heatmaps, badges, and archives.
- **Offline & Private**: 100% offline-first PWA with Service Worker caching and local JSON backup export/import.
- **Accessible Colors**: Default accent colors meet at least 4.5:1 contrast for text; custom accent colors with insufficient contrast are rejected. Status also uses icons and outlines, and the app follows the system dark-mode preference.
- **Theme Colors**: Choose separate dark and light accent colors with a color picker or hex code; low-contrast colors are rejected and each mode can be reset to its default.
- **Motion**: Optional badge confetti, smooth hover and keyboard-focus dock labels, and button ripples; motion is reduced when `prefers-reduced-motion` is enabled.
- **Resilient**: Safe state normalization, attribute injection protection, and input focus preservation across redraws.

## 🚀 Running Locally

Start the app on port 3000 with:

```bash
npm start
```

Or use Python:

```bash
# macOS / Linux
python3 -m http.server 3000

# On Windows:
python -m http.server 3000
```

Open [http://localhost:3000](http://localhost:3000) (or the port shown by your server) in your browser.

## 🧪 Unit Tests

Run the pure logic test suite using Node.js's built-in test runner:

```bash
npm test
```

## 📦 PWA & Desktop .exe Packaging
Streakline is built as a Progressive Web App (PWA) with a manifest and service worker:
- **Android / Chrome / Edge**: Click **Install** in your browser's address bar to install as a native-like desktop or mobile application.
- **Desktop `.exe`**: Easily wrap the repository with [Tauri](https://tauri.app/) (`tauri build`) or Electron for a standalone Windows `.exe`.

## 📄 License
[MIT](LICENSE)
