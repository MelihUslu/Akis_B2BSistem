import { trackExternal } from '../monitoring.js';
/**
 * Yurtiçi Kargo "ShippingOrderDispatcherServices" SOAP istemcisi.
 * createShipment: gönderi kaydı (kargoKey ile) · queryShipment: durum ve takip no · cancelShipment: iptal.
 * creds: { username, password, mode: 'TEST' | 'LIVE' }
 */
const URLS = {
  TEST: process.env.YURTICI_TEST_URL || 'https://testws.yurticikargo.com/KOPSWebServices/ShippingOrderDispatcherServices',
  LIVE: process.env.YURTICI_LIVE_URL || 'https://ws.yurticikargo.com/KOPSWebServices/ShippingOrderDispatcherServices'
};
const NS = 'http://yurticikargo.com.tr/ShippingOrderDispatcherServices';

export class YurticiError extends Error {}

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const tag = (name, value) => (value === undefined || value === null || value === '' ? '' : `<${name}>${esc(value)}</${name}>`);

// Yanıttaki ilk <ad>değer</ad> (namespace önekli de olabilir)
const pick = (xml, name) => {
  const m = new RegExp(`<(?:\\w+:)?${name}>([\\s\\S]*?)</(?:\\w+:)?${name}>`).exec(xml);
  return m ? m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim() : null;
};

const call = (creds, operation, inner) => trackExternal('Yurtiçi Kargo', operation, () => callRaw(creds, operation, inner));

const callRaw = async (creds, operation, inner) => {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ship="${NS}">
  <soapenv:Body><ship:${operation}>${inner}</ship:${operation}></soapenv:Body>
</soapenv:Envelope>`;
  const res = await fetch(URLS[creds.mode === 'LIVE' ? 'LIVE' : 'TEST'], {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
    body,
    signal: AbortSignal.timeout(30_000)
  });
  const xml = await res.text();
  const fault = pick(xml, 'faultstring');
  if (fault) throw new YurticiError(`Yurtiçi Kargo: ${fault}`);
  if (!res.ok) throw new YurticiError(`Yurtiçi Kargo: HTTP ${res.status}`);
  return xml;
};

const auth = (creds, langTag = 'userLanguage') => `${tag('wsUserName', creds.username)}${tag('wsPassword', creds.password)}${tag(langTag, 'TR')}`;

/**
 * shipment: { cargoKey, invoiceKey, receiverName, address, city, district, phone, email, taxNumber, taxOfficeName, cargoCount, description }
 * Başarılıysa { cargoKey, jobId } döner.
 */
export const createShipment = async (creds, shipment) => {
  const vo = [
    tag('cargoKey', shipment.cargoKey), tag('invoiceKey', shipment.invoiceKey || shipment.cargoKey),
    tag('receiverCustName', shipment.receiverName), tag('receiverAddress', shipment.address),
    tag('cityName', shipment.city), tag('townName', shipment.district), tag('receiverPhone1', shipment.phone),
    tag('emailAddress', shipment.email), tag('taxNumber', shipment.taxNumber), tag('taxOfficeName', shipment.taxOfficeName),
    tag('cargoCount', shipment.cargoCount || 1), tag('description', shipment.description)
  ].join('');
  const xml = await call(creds, 'createShipment', `${auth(creds)}<ShippingOrderVO>${vo}</ShippingOrderVO>`);
  const outFlag = pick(xml, 'outFlag');
  const detailErr = pick(xml, 'errMessage');
  if (outFlag !== '0') throw new YurticiError(`Yurtiçi Kargo: ${detailErr || pick(xml, 'outResult') || 'gönderi oluşturulamadı'}`);
  return { cargoKey: shipment.cargoKey, jobId: pick(xml, 'jobId') };
};

// Yurtiçi işlem durumu → sistemdeki gönderi durumu
const STATUS = { NOP: 'CREATED', IND: 'IN_TRANSIT', ISR: 'IN_TRANSIT', BI: 'IN_TRANSIT', DLV: 'DELIVERED', CNL: 'CANCELLED', ISC: 'CANCELLED' };

/**
 * Gönderinin son durumu. Kargo paketi teslim alıp işlem yapınca docId (takip numarası) oluşur.
 * → { status, statusText, trackingNumber, trackingUrl, deliveredAt }
 */
export const queryShipment = async (creds, cargoKey) => {
  const inner = `${tag('wsUserName', creds.username)}${tag('wsPassword', creds.password)}${tag('wsLanguage', 'TR')}`
    + `${tag('keys', cargoKey)}${tag('keyType', 0)}${tag('addHistoricalData', 'false')}${tag('onlyTracking', 'false')}`;
  const xml = await call(creds, 'queryShipment', inner);
  if (pick(xml, 'outFlag') !== '0') throw new YurticiError(`Yurtiçi Kargo: ${pick(xml, 'errMessage') || pick(xml, 'outResult') || 'sorgulanamadı'}`);
  const code = pick(xml, 'operationStatus');
  // İptal edilen ya da hiç oluşturulmamış anahtar için kayıt yerine hata kodu döner
  if (!code && pick(xml, 'errCode')) return { status: 'NOT_FOUND', rawStatus: null, statusText: pick(xml, 'errMessage') || 'Gönderi bulunamadı', trackingNumber: null, trackingUrl: null, deliveredAt: null };
  return {
    status: STATUS[code] || 'CREATED',
    rawStatus: code,
    statusText: pick(xml, 'operationMessage') || pick(xml, 'cargoEventExplanation') || '',
    trackingNumber: pick(xml, 'docId') || null,
    trackingUrl: pick(xml, 'trackingUrl') || null,
    deliveredAt: pick(xml, 'deliveryDate') || null
  };
};

export const cancelShipment = async (creds, cargoKey) => {
  const xml = await call(creds, 'cancelShipment', `${auth(creds)}${tag('cargoKeys', cargoKey)}`);
  if (pick(xml, 'outFlag') !== '0') throw new YurticiError(`Yurtiçi Kargo: ${pick(xml, 'errMessage') || pick(xml, 'outResult') || 'iptal edilemedi'}`);
  return true;
};
