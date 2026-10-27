// Canlıya çıkmadan önce ortam ayarlarını kontrol eder:  npm run check:config
// Canlı ortamı denetlemek için:  NODE_ENV=production npm run check:config
import dotenv from 'dotenv';
import { checkConfig } from '../src/services/configCheck.js';

dotenv.config({ quiet: true });
const { production, errors, warnings, items } = checkConfig();

console.log(`\nOrtam: ${production ? 'CANLI (production)' : 'geliştirme'}\n`);
for (const i of items) console.log(`  ${i.ok ? '✓' : '✗'} ${i.label}${i.note ? `  — ${i.note}` : ''}`);
if (warnings.length) { console.log('\nUyarılar:'); warnings.forEach((w) => console.log(`  ! ${w}`)); }
if (errors.length) { console.log('\nHatalar (canlıda sunucu açılmaz):'); errors.forEach((e) => console.log(`  ✗ ${e}`)); }
console.log(errors.length ? '\nSonuç: canlıya hazır DEĞİL.\n' : '\nSonuç: zorunlu ayarlar tamam.\n');
process.exit(errors.length && production ? 1 : 0);
