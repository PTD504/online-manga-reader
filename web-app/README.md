# Manga Reader Web App

Next.js web application for page-level manga translation with visual rendering and overlay management.

## Features

- **Page Upload & Processing**: Upload manga page images for detection, OCR, and translation
- **Real-time Canvas Rendering**: Polygon-aware text overlay system that preserves original artwork
- **Translation Review**: Visual interface for reviewing and adjusting translations before rendering
- **Responsive Design**: Mobile-friendly UI for all screen sizes
- **State Management**: Efficient request batching and caching to reduce API overhead

## Development

### Prerequisites

- Node.js 20+
- npm

### Setup

```bash
cd web-app
npm install
```

### Development Mode

```bash
npm run dev
```

Opens the development server at [http://localhost:3000](http://localhost:3000) with hot-reload support.

### Build for Production

```bash
npm run build
```

Generates optimized build output for deployment.

## Project Structure

```
web-app/
├── package.json            # Dependencies and scripts
├── next.config.ts          # Next.js configuration
├── tsconfig.json           # TypeScript configuration
├── postcss.config.mjs       # PostCSS configuration
├── eslint.config.mjs        # ESLint configuration
├── app/
│   ├── page.tsx            # Main application page component
│   ├── layout.tsx          # Root layout wrapper
│   ├── globals.css         # Global styles
│   ├── components/         # Reusable React components
│   ├── overlayRenderer.ts  # Canvas rendering pipeline for overlays
│   ├── overlayImageUtils.ts # Image preprocessing and cropping utilities
│   ├── overlayPolygonUtils.ts # Polygon coordinate transformation utilities
│   └── overlayTextLayout.ts # Text layout and positioning logic for overlays
├── hooks/
│   └── useTranslation.ts   # Custom hook for translation workflow management
├── lib/
│   └── api/                # API client utilities for backend communication
├── public/                 # Static assets
├── tests/                  # Test files
└── Dockerfile              # Container configuration for production deployment
```

## Canvas Overlay System

The web app uses HTML5 Canvas for efficient, polygon-aware text overlay rendering:

- **Polygon-based Layout**: Text is positioned within speech bubble polygons for seamless visual integration
- **Character Wrapping**: Automatic text wrapping respects polygon boundaries
- **Font Rendering**: Custom fonts and styling preserve manga aesthetic
- **Performance**: Canvas caching minimizes redraws and optimizes memory usage

## Configuration

Environment variables are managed via `.env.local`:

- **NEXT_PUBLIC_API_URL**: Backend API base URL (default: `http://localhost:8080`)

## Deployment

The web app is deployed to Vercel with automatic CI/CD on git pushes to the main branch.
