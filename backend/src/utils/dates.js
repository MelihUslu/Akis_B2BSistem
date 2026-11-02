// Takvim günü firmanın saat diliminde (TZ, varsayılan Europe/Istanbul) hesaplanır.
// toISOString().slice(0, 10) UTC günü verir: Türkiye'de 00:00–03:00 arası bir önceki güne düşer.
export const localDay = (d = new Date()) => new Date(d).toLocaleDateString('sv-SE', { timeZone: process.env.TZ || 'Europe/Istanbul' });
export const localMonth = (d = new Date()) => localDay(d).slice(0, 7);
