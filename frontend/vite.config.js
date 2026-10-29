import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Bağlantı paylaşım önizlemesi (WhatsApp, LinkedIn, Facebook): sayfa açıklaması ve görseli.
// Görsel adresi tam adres olmalı; canlı derlemede VITE_ROOT_DOMAIN'den üretilir.
const shareMeta = (env) => ({
  name: 'share-meta',
  transformIndexHtml(html) {
    const name = env.VITE_PLATFORM_NAME || 'Akis B2B'
    const desc = 'Bayileriniz kendi fiyatlarıyla 7/24 sipariş versin; onay, stok, cari hesap ve tahsilatı tek yerden yönetin. Ücretsiz deneyin.'
    const domain = env.VITE_ROOT_DOMAIN && env.VITE_ROOT_DOMAIN !== 'localhost' ? `https://${env.VITE_ROOT_DOMAIN}` : ''
    const tags = [
      `<meta name="description" content="${desc}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="${name}" />`,
      `<meta property="og:title" content="${name} · Bayileriniz için B2B sipariş portalı" />`,
      `<meta property="og:description" content="${desc}" />`,
      `<meta property="og:image" content="${domain}/og.png" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
    ]
    return html.replace('</head>', `    ${tags.join('\n    ')}\n  </head>`)
  },
})

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return { plugins: [react(), tailwindcss(), shareMeta({ ...env, ...process.env })] }
})
