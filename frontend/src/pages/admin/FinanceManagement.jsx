import { useState, useEffect } from 'react';
import api, { errorMessage } from '../../services/api';
import { CreditCard, Plus, ArrowUpRight, ArrowDownLeft, Award, Search, CheckCircle2, X, Building2, Banknote, Save, ReceiptText, ArrowRight } from 'lucide-react';
import { Field, IconInput, TextArea } from '../../components/form/FormKit';
import useAlert from '../../hooks/useAlert';
import { Link } from 'react-router-dom';
import { FileSpreadsheet, Printer } from 'lucide-react';
import { downloadFile } from '../../utils/download';
import { formatTRY, formatDate } from '../../utils/format';

const FinanceManagement = () => {
  const [dealers, setDealers] = useState([]);
  const [plasiyerPoints, setPlasiyerPoints] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reconciliations, setReconciliations] = useState([]);
  const [search, setSearch] = useState('');
  const [statement, setStatement] = useState(null);
  const { alertElement, showAlert } = useAlert();
  const [triedSave, setTriedSave] = useState(false); // kaydet'e basılınca eksik alanlar kırmızı gösterilir

  const [formData, setFormData] = useState({
    companyId: '',
    type: 'DEBT',
    amount: '',
    description: ''
  });

  const fetchData = () =>
    Promise.all([api.get('/companies'), api.get('/finance/plasiyer-points'), api.get('/finance/reconciliations')])
      .then(([dealersRes, pointsRes, recRes]) => {
        setDealers(dealersRes.data);
        setPlasiyerPoints(pointsRes.data);
        setReconciliations(recRes.data);
      })
      .catch(() => console.error('Veriler yüklenemedi'));

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.companyId || !(Number(formData.amount) > 0)) { setTriedSave(true); return; }
    try {
      await api.post('/finance/transaction', formData);
      showAlert({ type: 'success', title: 'Kaydedildi', message: 'Cari işlem kaydedildi ve bayiye bildirildi.' });
      setIsModalOpen(false);
      fetchData();
      setFormData({ companyId: '', type: 'DEBT', amount: '', description: '' });
    } catch (error) {
      showAlert({ type: 'error', title: 'İşlem Başarısız', message: errorMessage(error, 'İşlem kaydedilemedi.') });
    }
  };

  const openStatement = async (dealer) => {
    try {
      const res = await api.get(`/finance/statement/${dealer.id}`);
      setStatement(res.data);
    } catch (error) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(error, 'Ekstre getirilemedi.') });
    }
  };

  const filteredDealers = dealers.filter((d) =>
    !search || d.name.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR')) || d.taxNumber?.includes(search)
  );

  return (
    <div className="space-y-8">
      {alertElement}
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-blue-500 to-blue-700 p-3.5 rounded-2xl shadow-lg shadow-blue-500/25 shrink-0"><CreditCard className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Finans ve Prim Yönetimi</h1>
            <p className="text-gray-500 text-sm mt-1">Cari ekstre girişleri ve plasiyer prim takibi.</p>
          </div>
        </div>
        </div>
        <button 
          onClick={() => { setTriedSave(false); setIsModalOpen(true); }}
          className="btn-gradient h-12 px-5 py-0 whitespace-nowrap shrink-0"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          MANUEL İŞLEM
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Bayi Bakiyeleri ve Manuel Giriş Özeti */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-50 flex justify-between items-center">
            <h3 className="font-bold text-gray-900">Bayi Bakiyeleri</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
              <input type="text" placeholder="Bayi ara..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>
          <div className="divide-y divide-gray-50 max-h-[400px] overflow-auto">
            {filteredDealers.map((dealer) => (
              <button key={dealer.id} onClick={() => openStatement(dealer)} className="w-full text-left p-4 flex justify-between items-center hover:bg-gray-50 transition-colors">
                <div>
                  <p className="text-sm font-bold text-gray-800">{dealer.name}</p>
                  <p className="text-xs text-gray-500">Risk: {formatTRY(dealer.riskLimit)}
                    {dealer.reconciliations?.[0] && <span className="ml-2 text-emerald-600 font-bold">· Mutabık {formatDate(dealer.reconciliations[0].createdAt)}</span>}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-black ${dealer.currentBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatTRY(dealer.currentBalance)}
                  </p>
                  <p className="text-[10px] text-gray-400 uppercase font-bold">{dealer.currentBalance >= 0 ? 'Alacaklı' : 'Borçlu'}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Plasiyer Prim Sistemi */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-50 flex items-center space-x-2">
            <Award className="h-5 w-5 text-orange-500" />
            <h3 className="font-bold text-gray-900">Plasiyer Prim Sistemi</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {plasiyerPoints.length === 0 ? (
                <p className="text-center py-8 text-gray-400 text-sm italic">Henüz prim puanı bulunmuyor.</p>
              ) : plasiyerPoints.map((point) => (
                <div key={point.id} className="flex items-center justify-between p-4 bg-orange-50/50 rounded-2xl border border-orange-100/50">
                  <div className="flex items-center space-x-4">
                    <div className="bg-orange-500 text-white p-2 rounded-xl">
                      <Award className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800">{point.user?.name}</p>
                      <p className="text-[10px] text-orange-600 font-black uppercase">Sipariş #AK-{point.orderId} · {point.order?.company?.name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-orange-600">+{point.points.toFixed(2)}</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Puan</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bayi Mutabakatları */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-50 flex items-center space-x-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          <h3 className="font-bold text-gray-900">Cari Mutabakat Onayları</h3>
        </div>
        <div className="divide-y divide-gray-50 max-h-[320px] overflow-auto">
          {reconciliations.length === 0 ? (
            <p className="text-center py-8 text-gray-400 text-sm italic">Henüz mutabakat onayı yok.</p>
          ) : reconciliations.map((r) => (
            <div key={r.id} className="p-4 flex justify-between items-center">
              <div>
                <p className="text-sm font-bold text-gray-800">{r.company?.name}</p>
                <p className="text-xs text-gray-500">{r.user?.name} · {formatDate(r.createdAt, true)}</p>
              </div>
              <p className={`text-sm font-black ${r.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatTRY(r.balance)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Bayi Ekstresi */}
      {statement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="modal-backdrop" onClick={() => setStatement(null)} />
          <div className="modal-panel w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="modal-header items-start">
              <div>
                <h3 className="modal-title">{statement.company.name} · Cari Ekstre</h3>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => downloadFile(`/finance/statement/${statement.company.id}/export`, {}, 'ekstre.xlsx')} className="flex items-center px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-black"><FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Excel</button>
                  <Link to={`/print/statement/${statement.company.id}`} className="flex items-center px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-[11px] font-black"><Printer className="h-3.5 w-3.5 mr-1" /> Yazdır / PDF</Link>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Bakiye: <b className={statement.company.currentBalance >= 0 ? 'text-green-600' : 'text-red-600'}>{formatTRY(statement.company.currentBalance)}</b>
                  {' · '}Kullanılabilir limit: <b>{formatTRY(Math.max(0, statement.credit.available))}</b>
                  {statement.lastReconciliation && <> · Son mutabakat: {formatDate(statement.lastReconciliation.createdAt)}</>}
                </p>
              </div>
              <button onClick={() => setStatement(null)} className="modal-close" aria-label="Kapat"><X className="h-5 w-5" /></button>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="list-head">
                  <tr className="text-left text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] whitespace-nowrap">
                    <th className="px-6 py-3">Tarih</th><th className="px-6 py-3">Açıklama</th>
                    <th className="px-6 py-3 text-right">Borç</th><th className="px-6 py-3 text-right">Alacak</th><th className="px-6 py-3 text-right">Bakiye</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100/70">
                  {statement.transactions.map((t) => (
                    <tr key={t.id} className="transition-colors hover:bg-slate-50/80 hover:shadow-[inset_3px_0_0_0_#3b82f6]">
                      <td className="px-6 py-3 text-gray-500 whitespace-nowrap">{formatDate(t.date, true)}</td>
                      <td className="px-6 py-3 font-semibold text-gray-800">{t.description}</td>
                      <td className="px-6 py-3 text-right font-bold text-red-600">{t.type === 'DEBT' ? formatTRY(t.amount) : ''}</td>
                      <td className="px-6 py-3 text-right font-bold text-green-600">{t.type === 'CREDIT' ? formatTRY(t.amount) : ''}</td>
                      <td className="px-6 py-3 text-right font-black">{formatTRY(t.balanceAfter)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50">
                    <td className="px-6 py-3 text-gray-400 font-bold" colSpan={4}>Açılış Bakiyesi</td>
                    <td className="px-6 py-3 text-right font-black">{formatTRY(statement.openingBalance)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Standardized Centered Modal - Restored Rich Content */}
      {/* Manuel cari işlem */}
      {isModalOpen && (() => {
        const dealer = dealers.find((d) => String(d.id) === String(formData.companyId));
        const amount = Number(formData.amount) || 0;
        // Borç bakiyeyi azaltır (eksi = bayi borçlu), alacak artırır
        const after = dealer ? (dealer.currentBalance || 0) + (formData.type === 'CREDIT' ? amount : -amount) : null;
        const balanceText = (v) => `${formatTRY(Math.abs(v))} ${v < 0 ? 'borç' : v > 0 ? 'alacak' : ''}`;
        const types = [
          { id: 'DEBT', label: 'Borç', desc: 'Bayiye borç yaz (fatura, masraf…)', icon: ArrowUpRight, on: 'ring-2 ring-red-400 bg-red-50/60', tile: 'bg-red-500 text-white' },
          { id: 'CREDIT', label: 'Alacak', desc: 'Bayi lehine yaz (ödeme, iade…)', icon: ArrowDownLeft, on: 'ring-2 ring-emerald-400 bg-emerald-50/60', tile: 'bg-emerald-500 text-white' },
        ];
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="modal-backdrop" onClick={() => setIsModalOpen(false)} />
          <form onSubmit={handleSubmit} className="modal-panel w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="modal-header items-center">
              <div className="flex items-center gap-3.5">
                <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-500/25 flex items-center justify-center shrink-0">
                  <ReceiptText className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="modal-title text-xl">Manuel Cari İşlem</h3>
                  <p className="modal-subtitle">Bayinin carisine borç veya alacak kaydı girin; bayiye bildirim gider.</p>
                </div>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} className="modal-close" aria-label="Kapat"><X className="h-5 w-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
              <Field label="Bayi" required error={triedSave && !formData.companyId && 'Bayi seçin.'}>
                <IconInput as="select" icon={Building2} invalid={triedSave && !formData.companyId} value={formData.companyId} onChange={e => setFormData({ ...formData, companyId: e.target.value })}>
                  <option value="">Bayi seçin…</option>
                  {dealers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </IconInput>
              </Field>

              <Field label="İşlem Türü">
                <div className="grid grid-cols-2 gap-2">
                  {types.map((t) => {
                    const active = formData.type === t.id;
                    return (
                      <button key={t.id} type="button" onClick={() => setFormData({ ...formData, type: t.id })}
                        className={`text-left flex items-start gap-2.5 p-3 rounded-xl ring-1 transition-all ${active ? t.on : 'ring-gray-100 hover:ring-gray-200 hover:bg-gray-50'}`}>
                        <span className={`p-1.5 rounded-lg shrink-0 ${active ? t.tile : 'bg-gray-100 text-gray-400'}`}><t.icon className="h-4 w-4" /></span>
                        <span>
                          <span className="block text-sm font-bold text-gray-900">{t.label}</span>
                          <span className="block text-[11px] text-gray-400 leading-snug">{t.desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="Tutar" required error={triedSave && !(amount > 0) && 'Tutar 0’dan büyük olmalı.'}>
                <IconInput type="number" step="0.01" min="0" icon={Banknote} suffix="₺" className="text-base font-black" invalid={triedSave && !(amount > 0)}
                  value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} placeholder="0,00" />
              </Field>

              {dealer && (
                <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3 text-sm">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Mevcut bakiye</p>
                    <p className={`font-black tabular-nums ${dealer.currentBalance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{balanceText(dealer.currentBalance || 0)}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-300 mx-auto" />
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">İşlemden sonra</p>
                    <p className={`font-black tabular-nums ${after < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{balanceText(after)}</p>
                  </div>
                </div>
              )}

              <Field label="Açıklama" hint="Bayi ekstresinde bu metin görünür.">
                <TextArea className="h-24" placeholder="Örn: Mart ayı nakliye bedeli, 12.03 tarihli havale…" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
              </Field>
            </div>

            <div className="modal-footer items-center">
              <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary px-6">VAZGEÇ</button>
              <button type="submit" className="btn-gradient h-12 py-0 flex-1">
                <Save className="h-4 w-4 mr-2" /> İŞLEMİ KAYDET
              </button>
            </div>
          </form>
        </div>
        );
      })()}
    </div>
  );
};

export default FinanceManagement;
