import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import api, { errorMessage } from '../../services/api';
import PrintLayout from './PrintLayout';
import QuoteDocument from '../../components/quotes/QuoteDocument';
import { formatDate } from '../../utils/format';
import { t } from '../../i18n';

// Teklif PDF'i: gönderilmiş sürüm (?revision=) ya da personel için taslak önizlemesi
const PrintQuote = () => {
  const { id } = useParams();
  const [params] = useSearchParams();
  const revision = params.get('revision');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/quotes/${id}/document`, { params: revision ? { revision } : {} })
      .then((r) => setData(r.data))
      .catch((e) => setError(errorMessage(e, t('Teklif bulunamadı.'))));
  }, [id, revision]);

  if (error) return <p className="p-10 text-center text-gray-500">{error}</p>;
  if (!data) return <p className="p-10 text-center text-gray-400">{t('Yükleniyor...')}</p>;
  const doc = data.document;

  return (
    <PrintLayout ready seller={doc.seller} title={t('Fiyat Teklifi')}
      subtitle={<>{t('No')}: <b>{doc.code}</b>{doc.revision > 1 && ` · Rev. ${doc.revision}`}<br />{t('Tarih')}: {formatDate(doc.issuedAt)}</>}>
      {data.preview && (
        <p className="mb-5 rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 p-2 text-center text-[11px] font-black uppercase tracking-widest text-amber-700">
          Taslak önizleme — henüz müşteriye gönderilmedi
        </p>
      )}
      <QuoteDocument doc={doc} />
    </PrintLayout>
  );
};

export default PrintQuote;
