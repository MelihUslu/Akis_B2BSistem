import { useState, useEffect } from 'react';
import api, { errorMessage } from '../../services/api';
import { CreditCard, Wallet, ArrowUpRight, ArrowDownLeft, Info, CheckCircle2, X, CalendarClock, Lock } from 'lucide-react';
import useAlert from '../../hooks/useAlert';
import { Link, useSearchParams } from 'react-router-dom';
import { FileSpreadsheet, Printer } from 'lucide-react';
import { downloadFile } from '../../utils/download';

// Firmanın sanal POS'u (iyzico / PayTR): tutar alınır, sağlayıcının güvenli ödeme sayfasına yönlendirilir
const CardPayModal = ({ suggested, provider, onClose }) => {
  const [amount, setAmount] = useState(suggested > 0 ? suggested.toFixed(2) : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const start = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/payments/pos/checkout', { amount });
      window.location.href = res.data.paymentPageUrl;
    } catch (err) {
      setError(errorMessage(err, t('Ödeme başlatılamadı.')));
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-backdrop" onClick={onClose} />
      <form onSubmit={start} className="modal-panel w-full max-w-sm p-6 space-y-4">
        <ModalHeader icon={CreditCard} title={t('Kartla Ödeme')} onClose={onClose} closeLabel={t('Kapat')} className="!px-0 !pt-0 !pb-4" />
        <div>
          <label className="premium-label">{t('Ödeme Tutarı (₺)')}</label>
          <input required type="number" step="0.01" min="1" className="premium-input text-lg" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        {error && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
        <button type="submit" disabled={loading} className="w-full btn-gradient py-4 disabled:opacity-60"><Lock className="h-4 w-4 mr-2" /> {loading ? t('Yönlendiriliyor...') : t('Güvenli Ödeme Sayfasına Git')}</button>
        <p className="text-[10px] text-center text-gray-400">{t('Kart bilgileriniz')} {provider === 'PAYTR' ? 'PayTR' : 'iyzico'} güvenli ödeme sayfasında işlenir, firmamızda saklanmaz.</p>
      </form>
    </div>
  );
};
import { formatTRY, formatMoney, formatDate } from '../../utils/format';
import { t } from '../../i18n';
import PageHeader from '../../components/shared/PageHeader';
import ModalHeader from '../../components/shared/ModalHeader';

const formatCard = (v) => v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
const formatExpiry = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

const PosModal = ({ suggested, onClose, onPaid }) => {
  const [form, setForm] = useState({ amount: suggested > 0 ? suggested.toFixed(2) : '', cardHolder: '', cardNumber: '', expiry: '', cvc: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post('/payments/pos', form);
      onPaid(res.data);
    } catch (err) {
      setError(errorMessage(err, t('Ödeme alınamadı.')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-backdrop" onClick={onClose} />
      <form onSubmit={submit} className="modal-panel w-full max-w-md">
        <div className="p-6 bg-gradient-to-br from-indigo-600 to-purple-700 text-white">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200">{t('Sanal POS · Demo')}</p>
              <h3 className="text-xl font-black mt-1">{t('Kartla Ödeme')}</h3>
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-white/10"><X className="h-5 w-5" /></button>
          </div>
          <p className="mt-6 font-mono text-lg tracking-widest">{form.cardNumber || '•••• •••• •••• ••••'}</p>
          <div className="flex justify-between mt-3 text-xs font-bold text-indigo-100">
            <span>{form.cardHolder || 'AD SOYAD'}</span>
            <span>{form.expiry || 'AA/YY'}</span>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="premium-label">{t('Ödeme Tutarı (₺)')}</label>
            <input required type="number" step="0.01" min="1" className="premium-input text-lg" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <label className="premium-label">{t('Kart Üzerindeki İsim')}</label>
            <input required className="premium-input" value={form.cardHolder} onChange={(e) => setForm({ ...form, cardHolder: e.target.value.toUpperCase() })} />
          </div>
          <div>
            <label className="premium-label">{t('Kart Numarası')}</label>
            <input required inputMode="numeric" autoComplete="cc-number" className="premium-input font-mono" placeholder="4111 1111 1111 1111" value={form.cardNumber} onChange={(e) => setForm({ ...form, cardNumber: formatCard(e.target.value) })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="premium-label">{t('Son Kullanma')}</label>
              <input required inputMode="numeric" autoComplete="cc-exp" className="premium-input font-mono" placeholder={t('AA/YY')} value={form.expiry} onChange={(e) => setForm({ ...form, expiry: formatExpiry(e.target.value) })} />
            </div>
            <div>
              <label className="premium-label">{t('CVC')}</label>
              <input required inputMode="numeric" autoComplete="cc-csc" className="premium-input font-mono" placeholder="•••" value={form.cvc} onChange={(e) => setForm({ ...form, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
            </div>
          </div>

          {error && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}

          <button type="submit" disabled={submitting} className="w-full btn-gradient py-4 disabled:opacity-60">
            <Lock className="h-4 w-4 mr-2" /> {submitting ? t('İşleniyor...') : t('{amount} Öde', { amount: formatTRY(form.amount) })}
          </button>
          <p className="text-[10px] text-center text-gray-400 font-semibold">{t('Demo ortamıdır, gerçek tahsilat yapılmaz. Kart bilgileriniz saklanmaz (sadece son 4 hane).')}</p>
        </div>
      </form>
    </div>
  );
};

const BayiFinance = () => {
  const [statement, setStatement] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPosOpen, setIsPosOpen] = useState(false);
  const [posMode, setPosMode] = useState(null); // IYZICO | PAYTR | DEMO | NONE
  const [params, setParams] = useSearchParams();
  const { alertElement, showAlert, confirm } = useAlert();

  const fetchStatement = () =>
    api.get('/finance/my-statement')
      .then((response) => setStatement(response.data))
      .catch(() => console.error('Finansal bilgiler yüklenemedi'))
      .finally(() => setIsLoading(false));

  useEffect(() => {
    fetchStatement();
    api.get('/payments/pos-info').then((r) => setPosMode(r.data.mode)).catch(() => setPosMode('NONE'));
    // iyzico ödeme sayfasından dönüş
    const result = params.get('pos');
    if (result) {
      showAlert({
        success: { type: 'success', title: t('Ödemeniz Alındı'), message: t('Ödemeniz carinize işlendi, risk limitiniz güncellendi. Teşekkür ederiz.') },
        // PayTR: onay sunucuya ayrıca bildirilir, birkaç saniye içinde ekstreye yansır
        pending: { type: 'info', title: t('Ödemeniz Alındı'), message: t('Ödemeniz onaylanınca birkaç saniye içinde carinize işlenir. Ekstreyi yenileyerek kontrol edebilirsiniz.') },
        failed: { type: 'error', title: t('Ödeme Tamamlanamadı'), message: params.get('message') || t('Lütfen tekrar deneyin.') }
      }[result] || { type: 'info', title: t('Ödeme'), message: t('Ödeme sonucu alınamadı.') });
      if (result === 'pending') setTimeout(fetchStatement, 4000);
      setParams({}, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReconcile = async () => {
    const ok = await confirm({
      type: 'info',
      title: t('Mutabakat Onayı'),
      message: t('Cari hesabınızın {date} itibarıyla {amount} bakiye ile doğru olduğunu onaylıyor musunuz?', { date: formatDate(new Date()), amount: formatMoney(statement.company.currentBalance, statement.company.currency) }),
      confirmText: t('Mutabıkım'),
    });
    if (!ok) return;
    try {
      const res = await api.post('/finance/reconcile');
      showAlert({ type: 'success', title: t('Teşekkürler'), message: res.data.message });
      fetchStatement();
    } catch (error) {
      showAlert({ type: 'error', title: t('Hata'), message: errorMessage(error, t('Mutabakat kaydedilemedi.')) });
    }
  };

  if (isLoading) return <div className="p-8 text-center text-gray-400">{t('Yükleniyor...')}</div>;
  if (!statement) return <div className="p-8 text-center text-gray-400">{t('Finansal bilgiler yüklenemedi.')}</div>;

  const { company, credit, transactions, lastReconciliation, upcomingDue } = statement;
  const balance = company.currentBalance;
  const riskLimit = company.riskLimit;
  const debt = Math.max(0, -balance);
  const usage = riskLimit > 0 ? Math.min(100, (debt / riskLimit) * 100) : 0;
  // Cari para birimi (TL / USD / EUR); kartla ödemeler TL alınır, dövizli cariye günün kuruyla çevrilir
  const cur = company.currency || 'TRY';
  const money = (v) => formatMoney(v, cur);
  const debtTRY = Math.round(debt * (credit.rate || 1) * 100) / 100;

  return (
    <div className="space-y-6 md:space-y-8">
      {alertElement}
      {isPosOpen && ['IYZICO', 'PAYTR'].includes(posMode) && <CardPayModal provider={posMode} suggested={debtTRY} onClose={() => setIsPosOpen(false)} />}
      {isPosOpen && posMode === 'DEMO' && (
        <PosModal
          suggested={debtTRY}
          onClose={() => setIsPosOpen(false)}
          onPaid={(data) => {
            setIsPosOpen(false);
            showAlert({ type: 'success', title: t('Ödeme Alındı'), message: `${data.message} ${t('Kullanılabilir limitiniz: {amount}', { amount: money(Math.max(0, data.credit.available)) })}` });
            fetchStatement();
          }}
        />
      )}

      <PageHeader icon={CreditCard} tone="blue" title={t('Finansal Durum')} subtitle={t('Cari bakiye, risk limiti ve hesap ekstrenizi inceleyin.')}
        actions={<>
          <button onClick={() => downloadFile('/finance/my-statement/export', {}, 'ekstre.xlsx')} className="flex items-center h-11 px-4 rounded-2xl bg-white border border-gray-100 shadow-sm text-xs font-bold text-gray-600 hover:text-emerald-700 hover:border-emerald-200"><FileSpreadsheet className="h-4 w-4 mr-1.5" /> {t("Excel'e Aktar")}</button>
          <Link to="/print/statement" className="flex items-center h-11 px-4 rounded-2xl bg-white border border-gray-100 shadow-sm text-xs font-bold text-gray-600 hover:text-gray-900"><Printer className="h-4 w-4 mr-1.5" /> {t('Yazdır / PDF')}</Link>
          {posMode && posMode !== 'NONE' && (
            <button onClick={() => setIsPosOpen(true)} className="btn-gradient">
              <CreditCard className="h-4 w-4 mr-2" /> {posMode === 'DEMO' ? t('Sanal POS ile Öde (Demo)') : t('Kartla Öde')}
            </button>
          )}
        </>} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-5 md:p-6 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">{t('Güncel Bakiyeniz')}</p>
            <h2 className={`text-3xl font-black ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {money(Math.abs(balance))}
            </h2>
            <p className="text-xs text-gray-400 mt-2 font-bold uppercase tracking-wider">
              {balance >= 0 ? t('ALACAKLI DURUMDASINIZ') : t('TOPLAM BORÇ TUTARI')}{cur !== 'TRY' && ` · ${cur}`}
            </p>
            {cur !== 'TRY' && <p className="text-[11px] text-gray-400 mt-2">{t('Cari hesabınız {cur} olarak tutulur. Kartla ödemeler TL alınır ve günün kuruyla {cur} olarak işlenir.', { cur })}</p>}
          </div>
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <Wallet className="h-20 w-20 text-indigo-600" />
          </div>
        </div>

        <div className="bg-white p-5 md:p-6 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">{t('Risk Limitiniz')}</p>
          <h2 className="text-3xl font-black text-gray-900">{money(riskLimit)}</h2>
          <div className="mt-4 w-full bg-gray-100 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${usage >= 85 ? 'bg-red-500' : usage >= 70 ? 'bg-amber-500' : 'bg-indigo-600'}`}
              style={{ width: `${usage}%` }}
            ></div>
          </div>
          <p className="text-[10px] text-gray-400 mt-2 font-bold uppercase">
            {t('LİMİT KULLANIMI: %{pct} · KULLANILABİLİR: {amount}', { pct: usage.toFixed(1), amount: money(Math.max(0, credit.available)) })}
          </p>
          {credit.reserved > 0 && <p className="text-[10px] text-amber-600 mt-1 font-bold uppercase">{t('Onay bekleyen siparişler:')} {money(credit.reserved)}</p>}
        </div>

        <div className="bg-white p-5 md:p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">{t('Cari Mutabakat')}</p>
            {lastReconciliation ? (
              <p className="text-sm font-bold text-gray-700">
                {t('Son onay:')} {formatDate(lastReconciliation.createdAt)}<br />
                <span className="text-gray-400 text-xs">{money(lastReconciliation.balance)} bakiye · {lastReconciliation.user?.name}</span>
              </p>
            ) : (
              <p className="text-sm font-bold text-gray-500">{t('Henüz mutabakat onayı vermediniz.')}</p>
            )}
          </div>
          <button onClick={handleReconcile} className="mt-4 w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black uppercase tracking-widest flex items-center justify-center shadow-lg shadow-emerald-500/20 transition-all">
            <CheckCircle2 className="h-4 w-4 mr-2" /> {t('Mutabıkım')}
          </button>
        </div>
      </div>

      {upcomingDue && (
        <div className={`${new Date(upcomingDue.dueDate) < new Date() ? 'bg-red-50 border-red-100 text-red-800' : 'bg-amber-50 border-amber-100 text-amber-800'} border p-5 rounded-2xl flex items-center space-x-4`}>
          <CalendarClock className="h-6 w-6 flex-shrink-0" />
          <p className="text-sm font-bold">
            {t('En yakın vade')}: #AK-{upcomingDue.id} · {formatDate(upcomingDue.dueDate)} · {formatTRY(upcomingDue.totalAmount)}
            {new Date(upcomingDue.dueDate) < new Date() && t(' (vadesi geçti)')}
          </p>
        </div>
      )}

      <div className="card-premium">
        <div className="p-6 border-b border-gray-50 flex justify-between items-center">
          <h3 className="font-black text-gray-900">{t('Cari Hesap Ekstresi')}</h3>
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{transactions.length} hareket</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="list-head">
              <tr className="text-left text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] whitespace-nowrap">
                <th className="px-6 py-4">{t('Tarih')}</th>
                <th className="px-6 py-4">{t('Açıklama')}</th>
                <th className="px-6 py-4 text-right">{t('Borç')}</th>
                <th className="px-6 py-4 text-right">{t('Alacak')}</th>
                <th className="px-6 py-4 text-right">{t('Bakiye')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/70">
              {transactions.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-gray-400 font-bold">{t('Henüz cari hareket yok.')}</td></tr>
              ) : transactions.map((tx) => (
                <tr key={tx.id} className="transition-colors hover:bg-slate-50/80 hover:shadow-[inset_3px_0_0_0_#3b82f6]">
                  <td className="px-6 py-4 text-gray-500 font-semibold whitespace-nowrap">{formatDate(tx.date, true)}</td>
                  <td className="px-6 py-4 font-semibold text-gray-800">
                    <span className="inline-flex items-center">
                      {tx.type === 'DEBT' ? <ArrowUpRight className="h-4 w-4 mr-2 text-red-500" /> : <ArrowDownLeft className="h-4 w-4 mr-2 text-emerald-500" />}
                      {tx.description || (tx.type === 'DEBT' ? t('Borç') : t('Alacak'))}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-red-600">{tx.type === 'DEBT' ? money(tx.amount) : ''}</td>
                  <td className="px-6 py-4 text-right font-bold text-emerald-600">{tx.type === 'CREDIT' ? money(tx.amount) : ''}</td>
                  <td className={`px-6 py-4 text-right font-black ${tx.balanceAfter >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{money(tx.balanceAfter)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50/60">
                <td className="px-6 py-4 text-gray-400 font-bold" colSpan={4}>{t('Açılış Bakiyesi')}</td>
                <td className="px-6 py-4 text-right font-black text-gray-700">{money(statement.openingBalance)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-3xl flex items-start space-x-4">
        <div className="bg-indigo-600 p-2 rounded-xl text-white">
          <Info className="h-5 w-5" />
        </div>
        <div>
          <h4 className="font-bold text-indigo-800">{t('Bilgilendirme')}</h4>
          <p className="text-sm text-indigo-800/80 mt-1 leading-relaxed">
            {t('Sanal POS ödemeleri anında bakiyenize yansır ve risk limitiniz otomatik olarak tekrar açılır. Havale bildirimleri için {contact} ile iletişime geçin. Vade süreniz: {days} gün.', {
              contact: company.plasiyer ? t('müşteri temsilciniz {name} ({email})', { name: company.plasiyer.name, email: company.plasiyer.email }) : t('finans birimimiz'),
              days: company.paymentTermDays
            })}
          </p>
        </div>
      </div>
    </div>
  );
};

export default BayiFinance;
