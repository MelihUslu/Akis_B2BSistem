import { useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import Modal from '../shared/Modal';
import { downloadFile } from '../../utils/download';

const ACTION = {
  create: { label: 'Yeni', className: 'bg-emerald-50 text-emerald-700' },
  update: { label: 'Güncelle', className: 'bg-brand-50 text-brand-700' },
  skip: { label: 'Atla', className: 'bg-gray-100 text-gray-500' },
  error: { label: 'Hata', className: 'bg-red-50 text-red-600' },
};

/**
 * Excel'den müşteri / tedarikçi aktarımı: önce önizleme (hiçbir şey kaydedilmez), onaylayınca aktarım.
 * Cari kodu ya da vergi no ile eşleşen kart güncellenir; açılış bakiyesi yalnızca yeni karta yazılır.
 */
const ImportModal = ({ onClose, onDone }) => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const send = async (dryRun) => {
    const data = new FormData();
    data.append('file', file);
    setBusy(true);
    setError(null);
    try {
      const res = await api.post(`/partners/import${dryRun ? '?dryRun=1' : ''}`, data);
      if (dryRun) setPreview(res.data); else { setResult(res.data); onDone(); }
    } catch (err) {
      setError(errorMessage(err, 'Dosya işlenemedi.'));
    } finally {
      setBusy(false);
    }
  };

  const shown = result || preview;
  const s = shown?.summary;
  const actionable = s && s.create + s.update > 0;

  return (
    <Modal icon={FileSpreadsheet} title="Excel'den cari aktar" onClose={onClose} size="max-w-3xl"
      footer={<>
        <button type="button" onClick={onClose} className="px-4 h-11 rounded-xl text-sm font-black text-gray-600 bg-gray-100">{result ? 'Kapat' : 'Vazgeç'}</button>
        {!result && (preview
          ? <button disabled={busy || !actionable} onClick={() => send(false)} className="btn-gradient disabled:opacity-50">{busy ? 'Aktarılıyor...' : `Aktarımı Onayla (${s.create + s.update})`}</button>
          : <button disabled={busy || !file} onClick={() => send(true)} className="btn-gradient disabled:opacity-50">{busy ? 'Kontrol ediliyor...' : 'Önizle'}</button>)}
      </>}>
      {!shown && (
        <>
          <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside">
            <li>Şablonu indirip doldurun (Tür: Müşteri / Tedarikçi, Unvan zorunlu).</li>
            <li>Cari kodu veya vergi no eşleşen kart güncellenir, diğerleri yeni açılır.</li>
            <li>“Açılış Borcu” (cari bize borçlu) veya “Açılış Alacağı” yalnızca yeni kartta açılış hareketi olarak yazılır.</li>
            <li>Bayiler Bayi Yönetimi'nden yönetildiği için atlanır.</li>
          </ol>
          <button type="button" onClick={() => downloadFile('/partners/import/template', {}, 'cari-aktarim-sablonu.xlsx')} className="flex items-center px-3 h-9 rounded-xl text-xs font-black text-emerald-700 bg-emerald-50"><FileSpreadsheet className="h-4 w-4 mr-1" /> Şablonu indir</button>
          <label className="flex items-center justify-center gap-2 h-20 rounded-xl border-2 border-dashed border-gray-200 text-sm font-bold text-gray-500 cursor-pointer hover:border-brand-300">
            <Upload className="h-5 w-5" /> {file ? file.name : 'Excel dosyası seçin (.xlsx)'}
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => setFile(e.target.files[0] || null)} />
          </label>
        </>
      )}
      {shown && (
        <>
          <div className={`flex items-center gap-2 rounded-xl p-3 text-sm font-bold ${result ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-50 text-brand-700'}`}>
            {result ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            {result ? 'Aktarım tamamlandı' : 'Önizleme — henüz hiçbir şey kaydedilmedi'}: {s.create} yeni, {s.update} güncelleme, {s.skip} atlandı, {s.error} hatalı satır.
          </div>
          <div className="max-h-80 overflow-auto rounded-xl ring-1 ring-gray-100">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-[11px] font-black text-gray-500 uppercase sticky top-0"><tr><th className="px-3 py-2 text-left">Satır</th><th className="px-3 py-2 text-left">İşlem</th><th className="px-3 py-2 text-left">Unvan</th><th className="px-3 py-2 text-left">Not</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {shown.results.map((r) => (
                  <tr key={r.line}>
                    <td className="px-3 py-2 text-gray-400">{r.line}</td>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded font-black ${ACTION[r.action].className}`}>{ACTION[r.action].label}</span></td>
                    <td className="px-3 py-2 font-semibold text-gray-800">{r.name}</td>
                    <td className={`px-3 py-2 ${r.action === 'error' ? 'text-red-600 font-bold' : 'text-gray-500'}`}>{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {s.error > 0 && !result && <p className="text-[11px] text-gray-500">Hatalı satırlar aktarılmaz; düzeltip dosyayı yeniden yükleyebilirsiniz.</p>}
        </>
      )}
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
    </Modal>
  );
};

export default ImportModal;
