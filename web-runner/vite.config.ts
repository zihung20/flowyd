import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    fs: { allow: ['..'] },
  },
  optimizeDeps: {
    include: ['flowyd', 'flowyd/visualization'],
  },
  esbuild: {
    target: 'es2024',
  },
  build: {
    target: 'es2024',
    // Monaco is intrinsically large: its editor core lands in its own lazy
    // `monaco` chunk (~3.9 MB) and the TypeScript language service ships as a
    // ~6 MB web worker (off the main thread, loaded only when editing). Neither
    // blocks initial render and neither can shrink without dropping IntelliSense,
    // so the advisory limit is raised past them. App/vendor chunks stay small
    // and remain easy to spot in the build output.
    chunkSizeWarningLimit: 7000,
    rollupOptions: {
      output: {
        // Split heavy vendors into their own long-lived, independently
        // cacheable chunks so app code changes don't bust the Monaco/reactflow
        // download, and the entry chunk stays small.
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }
          if (id.includes('monaco-editor')) {
            return 'monaco';
          }
          if (id.includes('@xyflow') || id.includes('d3-')) {
            return 'reactflow';
          }
          return 'vendor';
        },
      },
    },
  },
});
