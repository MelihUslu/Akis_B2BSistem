import { formatTRY, formatDate } from '../../utils/format';
import { t } from '../../i18n';

/**
 * Müşteriye gönderilen teklif sürümü (değişmez kopya). PDF, paylaşım bağlantısı, bayi portalı ve personel
 * önizlemesinde aynı görünüm kullanılır. Maliyet, iç not ve yapay zekâ değerlendirmesi kopyada zaten yoktur.
 * Ekranda dar genişlikte kalemler kart olarak, yazdırırken her zaman tablo olarak gösterilir.
 */
const pct = (n) => `%${Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;

const QuoteDocument = ({ doc }) => {
  const c = doc.customer || {};
  const totals = doc.totals || {};
  const hasDiscount = doc.items.some((i) => i.discountRate > 0);

  return (
    <div className="space-y-6 text-gray-900">
      <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-6">
        <div className="min-w-0">
          <p className="text-[11px] font-black text-gray-500 uppercase mb-1">{t('Sayın')}</p>
          <p className="font-bold break-words">{c.name}</p>
          <p className="text-gray-600 leading-snug break-words">
            {c.authorizedPerson && <>{c.authorizedPerson}<br /></>}
            {c.address && <>{c.address}<br /></>}
            {[c.taxOffice, c.taxNumber].filter(Boolean).join(' V.D. / ')}{(c.taxOffice || c.taxNumber) && <br />}
            {c.phone}
          </p>
        </div>
        <div className="sm:text-right print:text-right space-y-0.5">
          <p><span className="text-gray-500">{t('Teklif No')}:</span> <b>{doc.code}</b>{doc.revision > 1 && <> · {t('Revizyon')} {doc.revision}</>}</p>
          <p><span className="text-gray-500">{t('Tarih')}:</span> {formatDate(doc.issuedAt)}</p>
          {doc.validUntil && <p><span className="text-gray-500">{t('Geçerlilik')}:</span> <b>{formatDate(doc.validUntil)}</b></p>}
          <p><span className="text-gray-500">{t('Para birimi')}:</span> {doc.currency === 'TRY' ? 'TL (₺)' : doc.currency}</p>
          {doc.preparedBy && <p><span className="text-gray-500">{t('Hazırlayan')}:</span> {doc.preparedBy}</p>}
        </div>
      </div>

      {doc.title && <p className="text-sm font-black border-l-4 border-gray-900 pl-3 break-words">{doc.title}</p>}

      {/* Dar ekran: kart görünümü */}
      <div className="sm:hidden print:hidden divide-y divide-gray-100 border-y border-gray-200">
        {doc.items.map((i, idx) => (
          <div key={idx} className="py-3 space-y-1">
            <p className="font-bold break-words">{idx + 1}. {i.name}</p>
            <p className="text-[11px] text-gray-500 break-words">{[i.variantLabel, i.sku, i.packInfo].filter(Boolean).join(' · ')}</p>
            <div className="flex justify-between text-xs">
              <span>{i.quantity.toLocaleString('tr-TR')} {i.unit} × {formatTRY(i.unitPrice)}{i.discountRate > 0 && <span className="text-gray-500"> ({t('isk.')} {pct(i.discountRate)})</span>}</span>
              <b>{formatTRY(i.lineTotal)}</b>
            </div>
            <p className="text-[11px] text-gray-400">{t('KDV')} {pct(i.vatRate)}</p>
          </div>
        ))}
      </div>

      {/* Geniş ekran ve baskı: tablo (başlık her sayfada tekrar eder) */}
      <table className="hidden sm:table print:table w-full border-collapse table-fixed">
        <colgroup>
          <col className="w-7" /><col /><col className="w-24" /><col className="w-24" />{hasDiscount && <col className="w-14" />}<col className="w-24" /><col className="w-12" /><col className="w-28" />
        </colgroup>
        <thead>
          <tr className="border-y border-gray-900 text-[11px] uppercase">
            <th className="py-2 text-left">#</th>
            <th className="py-2 text-left">{t('Ürün')}</th>
            <th className="py-2 text-right">{t('Miktar')}</th>
            <th className="py-2 text-right">{t('Birim Fiyat')}</th>
            {hasDiscount && <th className="py-2 text-right">{t('İsk.')}</th>}
            <th className="py-2 text-right">{t('Net Birim')}</th>
            <th className="py-2 text-right">{t('KDV')}</th>
            <th className="py-2 text-right">{t('Tutar')}</th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((i, idx) => (
            <tr key={idx} className="border-b border-gray-200 align-top">
              <td className="py-2">{idx + 1}</td>
              <td className="py-2 pr-2 break-words">
                {i.name}
                <div className="text-[11px] text-gray-500 break-words">{[i.variantLabel, i.sku, i.packInfo].filter(Boolean).join(' · ')}</div>
              </td>
              <td className="py-2 text-right">{i.quantity.toLocaleString('tr-TR')} {i.unit}</td>
              <td className="py-2 text-right">{formatTRY(i.listPrice)}</td>
              {hasDiscount && <td className="py-2 text-right">{i.discountRate > 0 ? pct(i.discountRate) : '—'}</td>}
              <td className="py-2 text-right">{formatTRY(i.unitPrice)}</td>
              <td className="py-2 text-right">{pct(i.vatRate)}</td>
              <td className="py-2 text-right font-semibold">{formatTRY(i.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end break-inside-avoid">
        <table className="w-full sm:w-80 print:w-80">
          <tbody>
            {totals.discountTotal > 0 && <>
              <tr><td className="py-1 text-gray-600">{t('Liste toplamı')}</td><td className="py-1 text-right">{formatTRY(totals.listTotal)}</td></tr>
              <tr><td className="py-1 text-gray-600">{t('Teklif iskontosu')}</td><td className="py-1 text-right">−{formatTRY(totals.discountTotal)}</td></tr>
            </>}
            <tr><td className="py-1 text-gray-600">{t('Ara toplam (KDV hariç)')}</td><td className="py-1 text-right">{formatTRY(totals.subtotal)}</td></tr>
            <tr><td className="py-1 text-gray-600">{t('KDV')}</td><td className="py-1 text-right">{formatTRY(totals.vatAmount)}</td></tr>
            <tr className="border-t-2 border-gray-900 font-black text-sm"><td className="py-2">{t('Genel Toplam')}</td><td className="py-2 text-right">{formatTRY(totals.total)}</td></tr>
          </tbody>
        </table>
      </div>

      {(doc.paymentTerms || doc.deliveryTerms || doc.note) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-4 break-inside-avoid">
          {doc.paymentTerms && <div><p className="text-[11px] font-black text-gray-500 uppercase mb-1">{t('Ödeme koşulları')}</p><p className="whitespace-pre-line break-words">{doc.paymentTerms}</p></div>}
          {doc.deliveryTerms && <div><p className="text-[11px] font-black text-gray-500 uppercase mb-1">{t('Teslimat koşulları')}</p><p className="whitespace-pre-line break-words">{doc.deliveryTerms}</p></div>}
          {doc.note && <div className="sm:col-span-2 print:col-span-2"><p className="text-[11px] font-black text-gray-500 uppercase mb-1">{t('Açıklama')}</p><p className="whitespace-pre-line break-words">{doc.note}</p></div>}
        </div>
      )}

      <p className="text-[11px] text-gray-500 break-inside-avoid">
        {doc.validUntil
          ? t('Bu teklif {date} tarihine kadar geçerlidir. Fiyatlar KDV hariç birim fiyatlardır; KDV ayrıca gösterilmiştir. Teklif stok ayırması içermez.', { date: formatDate(doc.validUntil) })
          : t('Fiyatlar KDV hariç birim fiyatlardır; KDV ayrıca gösterilmiştir. Teklif stok ayırması içermez.')}
      </p>
    </div>
  );
};

export default QuoteDocument;
