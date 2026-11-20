import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/');
          if (
            normalized.includes('/src/data/') ||
            normalized.includes('/public/assets/sprites_atlas.json')
          ) {
            return 'game-data';
          }
          if (normalized.includes('/src/render/')) {
            return 'render-engine';
          }
          if (normalized.includes('/src/vfx/')) {
            return 'vfx-engine';
          }
          if (
            normalized.includes('/src/ui/panels/') ||
            normalized.includes('/src/ui/hudTemplate') ||
            normalized.includes('/src/ui/TutorialOverlay') ||
            normalized.includes('/src/ui/uiShared')
          ) {
            return 'ui-panels';
          }
          if (
            normalized.includes('/src/core/Simulation') ||
            normalized.includes('/src/core/relicFormulas') ||
            normalized.includes('/src/skills/') ||
            normalized.includes('/src/world/') ||
            normalized.includes('/src/craft/') ||
            normalized.includes('/src/platform/')
          ) {
            return 'sim-core';
          }
          return undefined;
        },
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: '운빨무림전 : 구파일방 vs 사파 vs 마교',
        short_name: '운빨무림전',
        description: '구파일방 vs 사파 vs 마교 — 도트 무협 합공 랜덤 디펜스',
        lang: 'ko',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0d3632',
        theme_color: '#0d3632',
        icons: [
          { src: 'icons/icon-192.png?v=4', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png?v=4', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png?v=4',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,png,webp,json,m4a}'],
      },
    }),
  ],
});
