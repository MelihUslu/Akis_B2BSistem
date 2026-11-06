import { useEffect, useState } from 'react';
import { BellRing, Mail, MessageSquareText, Smartphone, Save } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { Toggle } from '../form/FormKit';
import { t } from '../../i18n';

// 5321234567 → 532 123 45 67
const formatPhone = (p) => (p ? `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6, 8)} ${p.slice(8)}` : '');

// Hangi bildirimlerin e-postayla (ve firmada SMS açıksa SMS ile) de gelsin? Panel içindeki zil bildirimleri her zaman oluşur.
const NotificationPrefs = ({ showAlert }) => {
  const [data, setData] = useState(null);
  const [phone, setPhone] = useState('');

  useEffect(() => {
    api.get('/auth/notification-prefs').then((r) => { setData(r.data); setPhone(formatPhone(r.data.phone)); }).catch(() => {});
  }, []);

  const save = async (patch, optimistic) => {
    const before = data;
    if (optimistic) setData({ ...data, ...optimistic });
    try {
      const res = await api.put('/auth/notification-prefs', patch);
      setData((d) => ({ ...d, prefs: res.data.prefs, phone: res.data.phone, sms: res.data.sms }));
      return res;
    } catch (err) {
      setData(before);
      showAlert?.({ type: 'error', title: t('Kaydedilemedi'), message: errorMessage(err, t('Tercih kaydedilemedi.')) });
      return null;
    }
  };
  const toggleEmail = (id, value) => save({ prefs: { ...data.prefs, [id]: value } }, { prefs: { ...data.prefs, [id]: value } });
  const toggleSms = (id, value) => save({ smsPrefs: { [id]: value } }, { sms: { ...data.sms, prefs: { ...data.sms.prefs, [id]: value } } });
  const savePhone = async () => {
    const res = await save({ phone });
    if (res) {
      setPhone(formatPhone(res.data.phone));
      showAlert?.({ type: 'success', title: t('Kaydedildi'), message: res.data.phone ? t('SMS bildirimleri bu numaraya gelecek.') : t('Cep telefonu silindi; SMS gelmez.') });
    }
  };

  if (!data) return null;
  const sms = data.sms?.available ? data.sms : null;
  const smsTypes = new Set((sms?.types || []).map((x) => x.id));
  return (
    <div className="card-premium p-5 md:p-6 space-y-4">
      <div>
        <h3 className="font-black text-gray-900 flex items-center"><BellRing className="h-5 w-5 mr-2 text-brand-500" /> {t('Bildirim tercihleri')}</h3>
        <p className="text-xs text-gray-500 mt-1">{sms
          ? t('Panel içindeki bildirimler her zaman gelir. Aşağıdakileri açarsanız aynı bildirim e-postanıza ya da SMS olarak telefonunuza da gönderilir.')
          : t('Panel içindeki bildirimler her zaman gelir. Aşağıdakileri açarsanız aynı bildirim e-postanıza da gönderilir.')}</p>
      </div>
      {sms && (
        <div className="flex flex-col sm:flex-row sm:items-end gap-2">
          <label className="flex-1">
            <span className="block text-xs font-bold text-gray-600 mb-1">{t('Cep telefonu (SMS bildirimleri için)')}</span>
            <span className="relative block">
              <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input type="tel" inputMode="tel" autoComplete="tel" className="premium-input !pl-9" placeholder="5XX XXX XX XX" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </span>
          </label>
          <button type="button" onClick={savePhone} disabled={phone === formatPhone(data.phone)} className="btn-secondary shrink-0 disabled:opacity-50"><Save className="h-4 w-4 mr-1.5" /> {t('Kaydet')}</button>
        </div>
      )}
      <div className="divide-y divide-gray-100 rounded-xl ring-1 ring-gray-100 overflow-hidden">
        {sms && (
          <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 text-[11px] font-black text-gray-500 uppercase tracking-wide">
            <span className="flex-1" />
            <span className="w-[4.25rem] text-center">SMS</span>
            <span className="w-[4.25rem] text-center">{t('E-posta')}</span>
          </div>
        )}
        {data.types.map((type, i) => (
          <div key={type.id} className={`flex items-center gap-3 px-4 py-3 ${i % 2 ? 'bg-slate-50/70' : 'bg-white'}`}>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-gray-800">{type.label}</span>
              <span className="block text-[11px] text-gray-400">{type.description}</span>
            </span>
            {sms && (
              <span className="flex items-center justify-center gap-1.5 w-[4.25rem]" title={smsTypes.has(type.id) ? undefined : t('Firmanız bu bildirimi SMS ile göndermiyor')}>
                <MessageSquareText className={`h-4 w-4 shrink-0 ${smsTypes.has(type.id) && sms.prefs[type.id] && data.phone ? 'text-brand-500' : 'text-gray-300'}`} aria-hidden="true" />
                {smsTypes.has(type.id)
                  ? <Toggle checked={Boolean(sms.prefs[type.id])} onChange={(v) => toggleSms(type.id, v)} label={`${type.label} · SMS`} />
                  : <span className="w-11 text-center text-xs text-gray-300">—</span>}
              </span>
            )}
            <span className={`flex items-center gap-1.5 ${sms ? 'justify-center w-[4.25rem]' : ''}`}>
              <Mail className={`h-4 w-4 shrink-0 ${data.prefs[type.id] ? 'text-brand-500' : 'text-gray-300'}`} aria-hidden="true" />
              <Toggle checked={Boolean(data.prefs[type.id])} onChange={(v) => toggleEmail(type.id, v)} label={`${type.label} · ${t('E-posta')}`} />
            </span>
          </div>
        ))}
      </div>
      {sms && !data.phone && <p className="text-[11px] text-amber-700">{t('SMS almak için cep telefonunuzu girin.')}</p>}
    </div>
  );
};

export default NotificationPrefs;
