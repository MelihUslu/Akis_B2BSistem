import http from 'http';

// Yurtiçi Kargo SOAP servisinin taklidi: gönderi oluşturulur; sorguda önce "işlem görmedi", sonra takip no, sonra teslim
export const startYurticiMock = () => new Promise((resolve) => {
  const shipments = new Map(); // cargoKey -> sorgu sayısı
  const wrap = (inner) => `<env:Envelope xmlns:env='http://schemas.xmlsoap.org/soap/envelope/'><env:Body>${inner}</env:Body></env:Envelope>`;
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const v = (n) => (new RegExp(`<${n}>([^<]*)</${n}>`).exec(raw) || [])[1];
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      if (v('wsPassword') !== 'YK') return res.end(wrap("<env:Fault><faultstring>Web servis kullanıcı ve parola bilgileri örtüşmüyor.</faultstring></env:Fault>"));
      if (raw.includes('createShipment')) {
        if ((v('receiverAddress') || '').length < 10) return res.end(wrap('<ns1:createShipmentResponse><ShippingOrderResultVO><outFlag>1</outFlag><outResult>Hata</outResult><shippingOrderDetailVO><errMessage>RECEIVER_ADDRESS parametresi min : 10</errMessage></shippingOrderDetailVO></ShippingOrderResultVO></ns1:createShipmentResponse>'));
        shipments.set(v('cargoKey'), 0);
        return res.end(wrap(`<ns1:createShipmentResponse><ShippingOrderResultVO><outFlag>0</outFlag><outResult>Başarılı</outResult><jobId>1</jobId></ShippingOrderResultVO></ns1:createShipmentResponse>`));
      }
      if (raw.includes('queryShipment')) {
        const key = v('keys');
        if (!shipments.has(key)) return res.end(wrap(`<ns1:queryShipmentResponse><ShippingDeliveryVO><outFlag>0</outFlag><shippingDeliveryDetailVO><errCode>82519</errCode><errMessage>${key} kargo anahtarı bulunmamaktadır.</errMessage></shippingDeliveryDetailVO></ShippingDeliveryVO></ns1:queryShipmentResponse>`));
        const n = shipments.get(key) + 1;
        shipments.set(key, n);
        const status = n === 1 ? 'NOP' : n === 2 ? 'IND' : 'DLV';
        const item = n === 1 ? '' : `<shippingDeliveryItemDetailVO><docId>YK${key}</docId><trackingUrl>https://yk/${key}</trackingUrl></shippingDeliveryItemDetailVO>`;
        return res.end(wrap(`<ns1:queryShipmentResponse><ShippingDeliveryVO><outFlag>0</outFlag><shippingDeliveryDetailVO><cargoKey>${key}</cargoKey><operationStatus>${status}</operationStatus><operationMessage>durum ${status}</operationMessage>${item}</shippingDeliveryDetailVO></ShippingDeliveryVO></ns1:queryShipmentResponse>`));
      }
      if (raw.includes('cancelShipment')) { shipments.delete(v('cargoKeys')); return res.end(wrap('<ns1:cancelShipmentResponse><ShippingCancelResultVO><outFlag>0</outFlag></ShippingCancelResultVO></ns1:cancelShipmentResponse>')); }
      res.end(wrap('<env:Fault><faultstring>bilinmeyen işlem</faultstring></env:Fault>'));
    });
  });
  server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
});
