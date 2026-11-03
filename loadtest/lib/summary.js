// Sonuç: ekrana özet + results/<test>-<zaman>.json (karşılaştırma için saklanır, git'e girmez)
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

export function handleSummary(data) {
  const name = (__ENV.TEST_NAME || 'test').replace(/[^a-z0-9-]/gi, '');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    [`results/${name}-${stamp}.json`]: JSON.stringify(data, null, 2)
  };
}
