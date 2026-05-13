# Polaroid Studio

Polaroid Studio turns photos into Polaroid-style images. It can be built as:

- a web/PWA app
- a Windows/macOS/Linux desktop app
- an Android app
- an iOS app

All image processing happens locally on the device.

## Requirements

- Node.js 18 or newer
- npm 9 or newer

For mobile builds:

- Android: Android Studio with Android SDK and JDK
- iOS: macOS with Xcode and CocoaPods

## Quick Start

```bash
npm install
npm run dev
```

This starts the Electron desktop app in development mode.

## Build Guide

Install dependencies once before building:

```bash
npm install
```

Choose the build target you want, then run the matching command.

| Target | Command | Output |
| --- | --- | --- |
| Web / PWA | `npm run build:pwa` | `dist/` |
| Desktop installer | `npm run dist` | `release/` |
| Prepare Android project | `npm run android:sync` | `android/` |
| Prepare iOS project | `npm run ios:sync` | `ios/` |

The build scripts run TypeScript checks first. If a command fails, read the first error in the terminal, fix it, and run the command again.

## Run Locally

```bash
npm run dev
```

This opens the Electron desktop app in development mode.

## Build Web / PWA

Use this when you want a browser version that can be deployed to a static host.

```bash
npm run build:pwa
```

When the command finishes, the deployable app is in:

```text
dist/
```

Upload the contents of `dist/` to any static host, such as Vercel, Netlify, GitHub Pages, Cloudflare Pages, or S3.

The PWA files are included automatically:

- `manifest.webmanifest`
- `sw.js`

## Build Desktop App

Use this when you want an installable desktop app for Windows, macOS, or Linux.

```bash
npm run dist
```

When the command finishes, installers are in:

```text
release/
```

Configured desktop targets:

- Windows: `.exe` installer
- macOS: `.dmg`
- Linux: `.AppImage`

Desktop packaging works best on the target operating system or in CI.

## Build Android App

Use this when you want to build or publish the Android app.

1. Build the web app and sync it into the Android project:

   ```bash
   npm run android:sync
   ```

2. Open the Android project:

   ```bash
   npm run android:open
   ```

3. Build from Android Studio, or run:

   ```bash
   npm run android:build
   ```

Android project location:

```text
android/
```

## Build iOS App

Use this when you want to build or publish the iOS app.

1. Build the web app and sync it into the iOS project:

   ```bash
   npm run ios:sync
   ```

2. Open the iOS project:

   ```bash
   npm run ios:open
   ```

3. Build and archive from Xcode, or run:

   ```bash
   npm run ios:build
   ```

iOS project location:

```text
ios/
```

Note: iOS builds must be done on macOS with Xcode installed.

## Useful Commands

```bash
npm run dev          # local desktop development
npm run build:pwa    # web/PWA build
npm run build        # web + Electron build
npm run dist         # desktop installer build
npm run mobile:sync  # sync latest web build to Android and iOS
npm run android:open # open Android Studio
npm run ios:open     # open Xcode
```

## Project Paths

```text
src/                 React app
electron/            Electron desktop shell
public/              PWA assets
android/             Android Capacitor project
ios/                 iOS Capacitor project
dist/                built web/PWA output
release/             desktop installer output
```

## License

MIT
