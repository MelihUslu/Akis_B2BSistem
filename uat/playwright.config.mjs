import { defineConfig, devices } from '@playwright/test';
import { WEB, WEB_PORT } from './data.mjs';

// Tarayıcı (UAT_BROWSER): chrome (varsayılan, yüklü Google Chrome; indirme gerekmez) · chromium (Playwright'ın kendi
// Chromium'u) · webkit (Safari motoru; iPhone'daki bütün tarayıcılar bunu kullanır. Bir kez: npx --prefix uat playwright
// install webkit)
const BROWSER = process.env.UAT_BROWSER || 'chrome';
// UAT_DEVICE: bütün oturumlar o cihazın ekranı, dokunmatiği ve tarayıcı kimliğiyle (ör. "iPhone 15"; Playwright cihaz adları)
const device = process.env.UAT_DEVICE ? devices[process.env.UAT_DEVICE] : {};
if (!device) throw new Error(`Bilinmeyen cihaz: ${process.env.UAT_DEVICE}`);
const { defaultBrowserType, ...deviceUse } = device;

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
    ...(BROWSER === 'webkit' ? { browserName: 'webkit' } : { channel: BROWSER === 'chromium' ? undefined : 'chrome' }),
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    viewport: { width: 1440, height: 900 },
    ...deviceUse,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: `node serve.mjs .data/web ${WEB_PORT}`,
    url: `http://localhost:${WEB_PORT}`,
    reuseExistingServer: true
  }
});
