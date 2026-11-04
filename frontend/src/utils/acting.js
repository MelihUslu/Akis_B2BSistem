/**
 * Bayi adına işlem modu: yönetici ya da plasiyer bir bayi seçer ve bayi portalını o bayinin fiyat, limit ve
 * adresleriyle kullanır. Seçim sekmeye özeldir (sessionStorage): aynı tarayıcının başka sekmesindeki yönetim paneli
 * etkilenmez. İstekler "X-Act-As-Company" başlığıyla gider; sunucu yetkiyi ayrıca doğrular.
 */
const KEY = 'akis_act';
export const ACTING_EVENT = 'akis-acting'; // sepet gibi bayiye bağlı durumlar dinler
const changed = () => window.dispatchEvent(new Event(ACTING_EVENT));

export const getActing = () => {
  try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; }
};

// acting: { companyId, name, by: 'ADMIN' | 'PLASIYER', back: dönülecek sayfa }
export const startActing = (acting) => {
  try { sessionStorage.setItem(KEY, JSON.stringify(acting)); } catch { /* gizli sekme */ }
  changed();
};

export const stopActing = () => {
  try { sessionStorage.removeItem(KEY); } catch { /* gizli sekme */ }
  changed();
};

// Başlık yalnızca bayi portalı ve çıktı sayfalarında eklenir (yönetim ekranları kendi kimliğiyle çalışır)
export const actingHeader = () => {
  const acting = getActing();
  const path = window.location.pathname;
  return acting && (path.startsWith('/bayi') || path.startsWith('/print')) ? { 'X-Act-As-Company': String(acting.companyId) } : {};
};
