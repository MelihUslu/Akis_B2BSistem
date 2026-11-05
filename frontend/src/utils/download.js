import api from '../services/api';

// Oturumlu bir uçtan dosya (Excel) indirir. Hata yanıtı da dosya (blob) olarak gelir; sunucunun mesajı
// (ör. "başka bir dışa aktarım hazırlanıyor") gösterilebilsin diye JSON'a çevrilir.
export const downloadFile = async (url, params, fallbackName, client = api) => {
  let res;
  try {
    res = await client.get(url, { params, responseType: 'blob' });
  } catch (error) {
    const data = error.response?.data;
    if (data instanceof Blob) {
      try { error.response.data = JSON.parse(await data.text()); } catch { /* JSON değil: genel mesaj */ }
    }
    throw error;
  }
  const disposition = res.headers['content-disposition'] || '';
  const match = disposition.match(/filename\*=UTF-8''([^;]+)/) || disposition.match(/filename="?([^";]+)"?/);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
};
