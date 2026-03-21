# Manga Translator Browser Extension

Browser Extension (Manifest V3) for in-context detection and translation of manga speech bubbles directly on reading websites.

## Features

- **In-context Translation**: Detect and translate speech bubbles directly on manga reading websites
- **Manifest V3 Architecture**: Separate content scripts, background service worker, and popup UI
- **Real-time Detection**: Uses YOLOv11n model via backend API for accurate speech bubble localization
- **Overlay Rendering**: Canvas-based polygon-aware text overlay system for seamless visual integration
- **State Management**: Efficient caching and batching to minimize API calls and reduce processing overhead

## Development

### Prerequisites

- Node.js 20+
- npm

### Setup

```bash
cd extension
npm install
```

### Development Mode

```bash
npm run dev
```

Starts the Vite dev server with HMR support for the extension UI components.

### Build for Production

```bash
npm run build
```

Generates optimized build output in the `dist/` folder.

### Load in Chrome

1. Open `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the `dist/` folder

## Project Structure

```
extension/
├── manifest.json           # Chrome Extension Manifest V3 configuration
├── vite.config.ts          # Vite build configuration
├── tsconfig.json           # TypeScript configuration
├── package.json            # Dependencies and build scripts
├── src/
│   ├── vite-env.d.ts       # Vite type definitions
│   ├── background/         # Service worker (Manifest V3)
│   │   ├── main.ts         # Lifecycle and message routing
│   │   └── proxy.ts        # API proxy and request handling
│   ├── content/            # Content script (injected into pages)
│   │   ├── main.ts         # Entry point
│   │   ├── network.ts      # Network communication with backend
│   │   ├── overlay.ts      # Overlay rendering logic
│   │   ├── processor.ts    # Image processing and polygon handling
│   │   ├── widget.tsx      # React widget component
│   │   ├── types.ts        # Type definitions
│   │   └── styles.css      # Content script styling
│   ├── popup/              # Extension popup UI (React)
│   ├── options/            # Extension options page
│   ├── dashboard/          # Dashboard interface (React)
│   │   ├── App.tsx
│   │   └── index.html
│   └── lib/                # Shared utilities and helpers
└── fonts/                  # Web accessible fonts
    └── Bangers-Regular.ttf
```

## Configuration

Settings are managed via Chrome Storage API:

- **extension.enabled**: Toggle extension on/off
- **extension.targetLanguage**: Target translation language
- **extension.backendUrl**: Backend API base URL
- **extension.confidence**: Detection confidence threshold
