// Kargo firmaları ve takip sayfası adresleri ({no} takip numarasıyla değiştirilir)
export const CARRIERS = {
  YURTICI: { name: 'Yurtiçi Kargo', url: 'https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code={no}' },
  ARAS: { name: 'Aras Kargo', url: 'https://kargotakip.araskargo.com.tr/mainpage.aspx?code={no}' },
  MNG: { name: 'MNG Kargo', url: 'https://www.mngkargo.com.tr/gonderi-takip/?code={no}' },
  SURAT: { name: 'Sürat Kargo', url: 'https://www.suratkargo.com.tr/KargoTakip/?kargotakipno={no}' },
  PTT: { name: 'PTT Kargo', url: 'https://gonderitakip.ptt.gov.tr/Track/Verify?q={no}' },
  UPS: { name: 'UPS', url: 'https://www.ups.com/track?tracknum={no}' },
  DHL: { name: 'DHL', url: 'https://www.dhl.com/tr-tr/home/tracking.html?tracking-id={no}' },
  DIGER: { name: 'Diğer / Kendi aracımız', url: null },
};

export const trackingUrl = (cargoCompany, trackingNumber) => {
  const carrier = CARRIERS[cargoCompany];
  return carrier?.url && trackingNumber ? carrier.url.replace('{no}', encodeURIComponent(trackingNumber)) : null;
};

export const carrierName = (code) => CARRIERS[code]?.name || code || '';
