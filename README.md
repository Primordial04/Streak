# Streakline 🎯

A private, offline-first habit tracker. Track daily routines, watch your streaks grow on a heatmap, and keep your data on your device.

## Try it now

Open the [Streakline web app](https://primordial04.github.io/Streak/). It works in modern desktop browsers and can be installed as a PWA where the browser supports installation.

For native computer installers, download the file for your platform from [GitHub Releases](https://github.com/Primordial04/Streak/releases/latest):

| Computer | Download |
| --- | --- |
| Windows | .exe installer or .msi package |
| macOS | .dmg for Intel or Apple Silicon |
| Linux | .AppImage, .deb, or .rpm |

macOS builds are not notarized, so macOS may ask you to confirm opening the app.

### PlayStation

The web app may work in the PS4 browser, but console use has not been tested. Sony says PS5 does not include a dedicated web browser, so Streakline is not directly supported on PS5. Streakline is not a PlayStation Store app.

## Features

- Track habits, streaks, consistency, and milestones.
- Review activity in monthly calendars and contribution heatmaps.
- Keep data locally, with JSON backup export and import.
- Use the app offline after it has loaded once.
- Customize light and dark theme colors with contrast checks.

## Run locally

Requires Node.js. Start the web app on port 3000:

~~~sh
npm install
npm start
~~~

Then open [http://localhost:3000](http://localhost:3000).

## Build and test

The release workflow builds installers for Windows, macOS, and Linux when a version tag is published. To build the static web bundle and run the logic tests:

~~~sh
npm run build:web
npm test
~~~

## Contributing

Bug reports and pull requests are welcome. The project is licensed under the [MIT License](LICENSE).
