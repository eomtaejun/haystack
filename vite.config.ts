import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths work on both / and /<repository>/ GitHub Pages URLs.
  base: './',
  optimizeDeps: {
    noDiscovery: true,
    exclude: ['three'],
  },
});
