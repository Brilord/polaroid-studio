# Polaroid Studio

Polaroid Studio is a cross-platform desktop app built with Electron, React, TypeScript, Vite, and Tailwind CSS. It turns imported images into realistic Polaroid-style photos with a live preview, analog-inspired controls, presets, and local export to PNG or JPG.

## Features

- Drag-and-drop image import
- File picker and native system picker upload
- Supported formats: PNG, JPG, JPEG, WEBP
- Live original image preview
- Real-time Polaroid rendering with:
  - White instant-photo frame
  - Larger bottom border
  - Off-white paper texture
  - Soft drop shadow
  - Slight rotation
  - Square crop
  - Warm vintage tone
  - Faded contrast and softer color response
  - Film grain
  - Blur/softness
  - Vignette
  - Optional caption text
- Editing controls for:
  - Brightness
  - Contrast
  - Saturation
  - Warmth
  - Fade
  - Grain
  - Vignette
  - Border size
  - Shadow intensity
  - Rotation
  - Caption text
  - Caption font size
- Built-in presets:
  - Classic Polaroid
  - 90s Warm Film
  - Faded Vintage
  - High Flash Instant
  - Soft Pastel
- Export to PNG or JPG
- Native save dialog
- High-resolution local rendering
- Electron Builder packaging for Windows, macOS, and Linux

## Tech Stack

- Electron
- React
- TypeScript
- Vite
- Tailwind CSS
- HTML Canvas for preview and export rendering

## Project Structure

```text
polaroid studio/
├─ electron/
│  ├─ main.ts
│  └─ preload.ts
├─ src/
│  ├─ components/
│  ├─ data/
│  ├─ lib/
│  ├─ App.tsx
│  ├─ main.tsx
│  ├─ styles.css
│  ├─ types.ts
│  └─ vite-env.d.ts
├─ index.html
├─ package.json
├─ postcss.config.js
├─ tailwind.config.js
├─ tsconfig.json
├─ tsconfig.electron.json
├─ tsconfig.node.json
└─ vite.config.ts
```

## Development

### Requirements

- Node.js 18 or newer
- npm 9 or newer

### Install

```bash
npm install
```

### Run in development

```bash
npm run dev
```

This starts:

- the Vite renderer dev server
- the Electron TypeScript watcher
- the Electron desktop app

## Build

### Production build

```bash
npm run build
```

This generates:

- `dist/` for the React renderer
- `dist-electron/` for the Electron main and preload scripts

### Package desktop app

```bash
npm run dist
```

Configured targets:

- Windows: NSIS installer (`.exe`)
- macOS: DMG (`.dmg`)
- Linux: AppImage (`.AppImage`)

Note: packaging each platform usually works best on that platform or in a CI environment configured for cross-compilation/signing.

## How It Works

Polaroid Studio uses a shared canvas rendering pipeline for both the live preview and final export. The selected image is center-cropped to a square, color-processed with analog-style adjustments, then composited into a Polaroid frame with paper texture, caption area, rotation, and shadow.

### Rendering pipeline

1. Load the imported image locally.
2. Crop it to a square composition.
3. Apply brightness, contrast, saturation, blur, warmth, fade, grain, and vignette effects.
4. Draw the processed image into a textured instant-photo frame.
5. Add caption text if provided.
6. Render a rotated card with soft shadow.
7. Export the final image as PNG or JPG through the Electron save dialog.

## Export Behavior

- PNG preserves transparent space around the floating Polaroid card and shadow.
- JPG is flattened onto a warm paper-colored background so it exports cleanly without dark transparency artifacts.

## Scripts

- `npm run dev` - start the renderer, Electron compiler, and desktop app in development mode
- `npm run build` - build the renderer and Electron process files
- `npm run dist` - package the application with Electron Builder
- `npm run preview` - preview the Vite production build in a browser

## Main Files

- [electron/main.ts](./electron/main.ts) - Electron main process, app window, native open/save dialogs
- [electron/preload.ts](./electron/preload.ts) - secure renderer bridge for file open/save actions
- [src/App.tsx](./src/App.tsx) - main desktop UI and control logic
- [src/lib/polaroidRenderer.ts](./src/lib/polaroidRenderer.ts) - shared canvas renderer for preview and export
- [src/lib/image.ts](./src/lib/image.ts) - file validation and image loading helpers
- [src/data/presets.ts](./src/data/presets.ts) - default settings and preset definitions

## Local-Only Processing

All image processing is performed locally on the user’s machine. No images are uploaded to any server.

## Current MVP Notes

- The app uses canvas-based rendering rather than `sharp`.
- The exported result matches the live visual style closely because both use the same renderer.
- No external image APIs or cloud services are required.

## Future Improvements

- Freeform crop and reposition controls
- More caption fonts
- Custom paper/frame color themes
- Batch export
- Undo/redo history
- Preset save/load
- Metadata-aware date caption options
- App icons and code signing for release builds

## License

MIT
