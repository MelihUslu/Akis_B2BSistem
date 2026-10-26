import React, { useEffect, useState } from 'react';
import { CreditCard, ShieldCheck, Trash2, Copy, Check } from 'lucide-react';
import api, { errorMessage } from '../../services/api';

const PROVIDERS = {
  IYZICO: {
    name: 'iyzico',
    desc: 'Ödeme formu ile kartla tahsilat. Ödeme sonucu anında doğrulanır.',
    where: 'iyzico üye işyeri paneli → Ayarlar → Firma Ayarları',
    fields: [
      { key: 'apiKey', label: 'API Anahtarı', secret: false },
      { key: 'secretKey', label: 'Gizli Anahtar (Secret Key)', secret: true },
    ],
  },
  PAYTR: {
    name: 'PayTR',
    desc: 'PayTR güvenli ödeme sayfası ile kartla tahsilat. Sonuç PayTR bildirimiyle onaylanır.',
    where: 'PayTR mağaza paneli → Destek & Kurulum → Entegrasyon Bilgileri',
    fields: [
      { key: 'merchantId', label: 'Mağaza No (merchant_id)', secret: false },
      { key: 'merchantKey', label: 'Mağaza Parola (merchant_key)', secret: true },
      { key: 'merchantSalt', label: 'Mağaza Gizli Anahtar (merchant_salt)', secret: true },
    ],
  },
};

const emptyForm = (provider, mode = 'SANDBOX') => ({ provider, mode, apiKey: '', secretKey: '', merchantId: '', merchantKey: '', merchantSalt: '' });

const PosSettings = ({ showAlert, confirm }) => {
  const [pos, setPos] = useState(null);
  const [form, setForm] = useState(emptyForm('IYZICO'));
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get('/tenant/pos').then((r) => {
      setPos(r.data);
      setForm(emptyForm(r.data.provider || 'IYZICO', r.data.mode || 'SANDBOX'));
    }).catch(() => {});
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.put('/tenant/pos', form);
      setPos(res.data.pos);
      setForm(emptyForm(res.data.pos.provider, res.data.pos.mode));
      showAlert({ type: 'success', title: `${PROVIDERS[res.data.pos.provider].name} Bağlandı`, message: res.data.message });
    } catch (err) {
      showAlert({ type: 'error', title: 'Bağlanamadı', message: errorMessage(err, 'Anahtarlar doğrulanamadı.') });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: 'Sanal POS bağlantısı kaldırılsın mı?', message: 'Bayileriniz kartla ödeme yapamaz.', confirmText: 'Kaldır' }))) return;
    const res = await api.delete('/tenant/pos');
    setPos(res.data.pos);
  };

  const copyNotifyUrl = () => {
    navigator.clipboard?.writeText(pos.paytrNotifyUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!pos) return <p className="text-center text-gray-400 py-10">Yükleniyor...</p>;

  const provider = PROVIDERS[form.provider];
  const switching = pos.configured && form.provider !== pos.provider;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="card-premium p-6 space-y-3">
        <h3 className="font-black text-gray-900 flex items-center"><CreditCard className="h-5 w-5 mr-2 text-indigo-500" /> Bayilerden Kartla Tahsilat</h3>
        <p className="text-sm text-gray-600">Kendi sanal POS hesabınızı bağlayın; bayileriniz "Finansal Durum" sayfasından kartla cari ödeme yapsın.
          Ödeme onaylanınca carisine alacak yazılır ve risk limiti açılır. Para doğrudan sizin hesabınıza geçer.</p>
        {pos.configured ? (
          <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
            <p className="text-sm font-bold text-emerald-800 flex items-center"><ShieldCheck className="h-5 w-5 mr-2" /> {PROVIDERS[pos.provider]?.name} aktif · {pos.mode === 'LIVE' ? 'Canlı' : 'Test'} · {pos.apiKeyMasked}</p>
            <button onClick={remove} className="p-2 text-red-400 hover:text-red-600" title="Bağlantıyı kaldır"><Trash2 className="h-4 w-4" /></button>
          </div>
        ) : (
          <p className="text-sm font-bold text-amber-700 bg-amber-50 rounded-2xl p-4">Sanal POS bağlı değil. Bayileriniz şu an kartla ödeme yapamaz.</p>
        )}
        {pos.configured && pos.provider === 'PAYTR' && (
          <div className="bg-indigo-50 rounded-2xl p-4 space-y-2">
            <p className="text-xs font-black text-indigo-800">PayTR mağaza panelinde "Bildirim URL" olarak bu adresi girin (Destek & Kurulum → Ayarlar):</p>
            <div className="flex gap-2 items-center">
              <code className="flex-1 bg-white px-3 py-2 rounded-xl text-xs font-mono break-all">{pos.paytrNotifyUrl}</code>
              <button onClick={copyNotifyUrl} className="p-2.5 rounded-xl bg-white text-gray-600 hover:text-indigo-600">{copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}</button>
            </div>
            <p className="text-[11px] text-indigo-700">Bu adres girilmezse ödemeler alınır ama carinize otomatik işlenmez.</p>
          </div>
        )}
      </div>

      <form onSubmit={save} className="card-premium p-6 space-y-5">
        <div>
          <p className="premium-label">Ödeme Sağlayıcısı</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(PROVIDERS).map(([id, p]) => (
              <button type="button" key={id} onClick={() => setForm(emptyForm(id, form.mode))}
                className={`text-left p-4 rounded-2xl border-2 transition-all ${form.provider === id ? 'border-indigo-600 bg-indigo-50/50' : 'border-gray-100 hover:border-gray-200'}`}>
                <p className="font-black text-gray-900 flex items-center justify-between">{p.name}{pos.configured && pos.provider === id && <span className="text-[10px] font-black text-emerald-600 uppercase">Aktif</span>}</p>
                <p className="text-[11px] text-gray-500 mt-1">{p.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {switching && <p className="text-xs font-bold text-amber-700 bg-amber-50 rounded-xl p-3">Kaydederseniz aktif sağlayıcı {PROVIDERS[pos.provider].name} yerine {provider.name} olur.</p>}

        <div className="flex bg-gray-100 p-1 rounded-xl w-fit">
          {[['SANDBOX', 'Test'], ['LIVE', 'Canlı']].map(([v, l]) => (
            <button type="button" key={v} onClick={() => setForm({ ...form, mode: v })} className={`px-4 py-2 text-xs font-black rounded-lg ${form.mode === v ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}>{l}</button>
          ))}
        </div>
        <p className="text-[11px] text-gray-500">
          {form.provider === 'PAYTR'
            ? 'Test modunda PayTR gerçek tahsilat yapmaz (test kartlarıyla denenir); canlıya geçmek için Canlı seçip tekrar kaydedin.'
            : 'Test için iyzico sandbox anahtarlarını, canlı için canlı ortam anahtarlarını girin.'}
          {' '}Anahtarlar: {provider.where}. Gizli anahtarlar şifrelenerek saklanır, bir daha gösterilmez.
        </p>

        {provider.fields.map((f) => (
          <div key={f.key}>
            <label className="premium-label">{f.label}</label>
            <input required type={f.secret ? 'password' : 'text'} autoComplete="off" className="premium-input font-mono"
              value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
          </div>
        ))}

        <button type="submit" disabled={saving} className="btn-gradient disabled:opacity-60">{saving ? 'Doğrulanıyor...' : `${provider.name} Anahtarlarını Doğrula ve Aktif Et`}</button>
      </form>
    </div>
  );
};

export default PosSettings;
