import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx, defineManifest } from '@crxjs/vite-plugin';
import manifestJson from './manifest.json';

// Use defineManifest and type assertion to resolve the 'string' vs '"module"' conflict
const manifest = defineManifest(manifestJson as any);

export default defineConfig({
    plugins: [
        react(),
        crx({ manifest }),
    ],
    build: {
        emptyOutDir: true,
        outDir: 'dist',
        manifest: true,
        rollupOptions: {
            // CRXJS handles most paths automatically from the manifest.
            // We explicitly include the dashboard here as it is a custom page.
            input: {
                dashboard: 'src/dashboard/index.html',
            },
        },
    },
    server: {
        port: 5173,
        strictPort: true,
        hmr: {
            port: 5173,
        },
    },
});