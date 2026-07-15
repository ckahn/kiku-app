import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KIKU',
    short_name: 'KIKU',
    description: 'Japanese podcast study app',
    start_url: '/',
    display: 'standalone',
    // Washi paper canvas / torii vermillion — matches the design tokens in src/app/globals.css.
    background_color: '#f5f0e8',
    theme_color: '#c1412a',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
