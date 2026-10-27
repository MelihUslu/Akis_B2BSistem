// Tema sayfa çizilmeden uygulanır (koyu temada beyaz yanıp sönme olmasın).
// Ayrı dosyadadır: içerik güvenlik politikası satır içi betiklere izin vermez.
try {
  var t = localStorage.getItem('akis_theme');
  if ((t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)) && location.pathname.indexOf('/print') !== 0) document.documentElement.classList.add('dark');
} catch { /* gizli sekme: varsayılan tema */ }
    
