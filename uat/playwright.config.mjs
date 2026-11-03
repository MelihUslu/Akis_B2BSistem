import { defineConfig } from '@playwright/test';
import { WEB, WEB_PORT } from './data.mjs';

// Senaryo dosyaları birbirinden bağımsız veriyle çalışır; dosyalar paralel, dosya içindeki adımlar sırayla koşar.
export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.mjs',
  globalSetup: './global-setup.mjs',
  outputDir: '.data/results',
  reporter: [['list'], ['html', { outputFolder: '.data/report', open: 'never' }]],
  workers: Number(process.env.UAT_WORKERS) || 3,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: WEB,
    // Yüklü Google Chrome kullanılır (indirme gerekmez). UAT_BROWSER=chromium: Playwright'ın kendi Chromium'u
    channel: process.env.UAT_BROWSER === 'chromium' ? undefined : 'chrome',
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: `node serve.mjs .data/web ${WEB_PORT}`,
    url: `http://localhost:${WEB_PORT}`,
    reuseExistingServer: true
  }
});
