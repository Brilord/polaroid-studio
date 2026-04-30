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

## Install

```bash
npm install
```

## Run Locally

```bash
npm run dev
```

This opens the Electron desktop app in development mode.

## Deploy As Web / PWA

```bash
npm run build:pwa
```

The deployable web app is created in:

```text
dist/
```

Upload the contents of `dist/` to any static host, such as Vercel, Netlify, GitHub Pages, Cloudflare Pages, or S3.

The PWA files are included automatically:

- `manifest.webmanifest`
- `sw.js`

## Build Desktop App

```bash
npm run dist
```

Output is created in:

```text
release/
```

Configured desktop targets:

- Windows: `.exe` installer
- macOS: `.dmg`
- Linux: `.AppImage`

Desktop packaging works best on the target operating system or in CI.

## Build Android App

First sync the web app into the Android project:

```bash
npm run android:sync
```

Open the Android project:

```bash
npm run android:open
```

Build from Android Studio, or run:

```bash
npm run android:build
```

Android project location:

```text
android/
```

## Build iOS App

First sync the web app into the iOS project:

```bash
npm run ios:sync
```

Open the iOS project:

```bash
npm run ios:open
```

Build and archive from Xcode, or run:

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
