# Manga Translator Chrome Extension

Chrome Extension (Manifest V3) for automatically detecting and translating manga speech bubbles.

## Features

- 🔍 **Automatic Detection**: Uses IntersectionObserver for lazy-loading image detection
- 🌐 **Multi-language Support**: Translate to 10+ languages
- 🎨 **Comic-style Overlays**: Beautiful translation bubbles that match manga aesthetics
- ⚡ **Performance Optimized**: Canvas-based cropping and state management to prevent re-processing

## Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

```bash
cd frontend
npm install
```

### Development Mode

```bash
npm run dev
```

This starts the Vite dev server with HMR support for the popup.

### Build for Production

```bash
npm run build
```

The built extension will be in the `dist/` folder.

### Load in Chrome

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist/` folder

## Project Structure

```
frontend/
├── manifest.json           # Chrome Extension Manifest V3
├── vite.config.ts          # Vite build config
├── src/
│   ├── popup/              # React settings UI
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── styles.css
│   ├── content/            # Content script (injected into pages)
│   │   ├── index.ts        # IntersectionObserver + OverlayManager
│   │   └── styles.css      # Bubble styling
│   └── background/         # Service worker
│       └── index.ts
└── fonts/                  # Web accessible fonts
    └── Bangers-Regular.ttf
```

## API Endpoints

The extension communicates with the backend at `http://localhost:8000`:

- `POST /detect` - Detect speech bubbles (returns bounding boxes)
- `POST /translate-bubble` - Translate a cropped bubble image

## Configuration

Settings are stored in Chrome sync storage:

- **enabled**: Toggle extension on/off
- **targetLang**: Target translation language
- **backendUrl**: Backend API URL
