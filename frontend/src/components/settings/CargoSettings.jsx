import { useEffect, useState } from 'react';
import { Truck, User, Lock, PlugZap, Save, CheckCircle2, Info } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { Section, Field, IconInput, Segmented } from '../form/FormKit';

// Kargo firması entegrasyonu: siparişten gönderi oluşturma ve takip numarasının otomatik gelmesi
const CargoSettings = ({ showAlert }) => {
  const [form, setForm] = useState({ provider: '', mode: 'TEST', username: '', password: '' });
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/cargo-settings').then((r) => { setSaved(r.data); setForm({ provider: r.data.provider || '', mode: r.data.mode, username: r.data.username, password: '' }); }).catch(() => {});
  useEffect(() => { load(); }, []);

  const call = async (fn, title) => {
    setBusy(true);
    try {
      const res = await fn();
      showAlert({ type: 'success', title, message: res.data.message });
      return true;
    } catch (err) {
      showAlert({ type: 'error', title: 'Olmadı', message: errorMessage(err, 'İşlem başarısız.') });
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!saved) return null;
  const on = form.provider === 'YURTICI';

  return (
    <div className="space-y-5 max-w-4xl">
      <Section icon={Truck} title="Kargo entegrasyonu" description="Bağlıysa sipariş ekranından tek tıkla gönderi oluşturulur, barkodlu etiket basılır; kargo paketi teslim alınca takip numarası otomatik gelir ve bayiye bildirilir."
        aside={<Segmented size="sm" value={form.provider} onChange={(v) => setForm({ ...form, provider: v })} options={[{ value: '', label: 'Kapalı' }, { value: 'YURTICI', label: 'Yurtiçi Kargo' }]} />}>
        {!on && <p className="text-xs text-gray-500 flex items-start gap-2"><Info className="h-4 w-4 shrink-0" /> Kapalıyken takip numarası sipariş ekranından elle girilir (tüm kargo firmaları).</p>}
      </Section>

      {on && (
        <Section icon={PlugZap} title="Yurtiçi Kargo web servis bilgileri" color="violet"
          description="Kurumsal müşteri temsilcinizden “web servis kullanıcı adı ve şifresi” isteyin. Denemek için Test ortamında YKTEST / YK kullanılabilir."
          aside={saved.configured ? <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Bağlı</span> : null}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Kullanıcı adı" required><IconInput icon={User} className="font-mono" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
            <Field label="Şifre" required hint={saved.hasPassword ? 'Kayıtlı; değiştirmek için yazın' : undefined}>
              <IconInput icon={Lock} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={saved.hasPassword ? '••••••••' : ''} />
            </Field>
            <Field label="Ortam">
              <Segmented size="sm" value={form.mode} onChange={(v) => setForm({ ...form, mode: v })}
                options={[{ value: 'TEST', label: 'Test' }, { value: 'LIVE', label: 'Canlı', activeClass: 'bg-emerald-600 border-emerald-600 text-white shadow-md' }]} />
            </Field>
            <div className="flex items-end">
              <button type="button" disabled={busy} onClick={() => call(() => api.post('/cargo-settings/test', form), 'Bağlantı başarılı')} className="btn-secondary w-full"><PlugZap className="h-4 w-4 mr-1.5" /> Bağlantıyı test et</button>
            </div>
          </div>
        </Section>
      )}

      <div className="flex justify-end">
        <button disabled={busy} onClick={async () => { if (await call(() => api.put('/cargo-settings', form), 'Kaydedildi')) load(); }} className="btn-gradient h-12 px-8 py-0 disabled:opacity-50"><Save className="h-4 w-4 mr-2" /> Kaydet</button>
      </div>
    </div>
  );
};

export default CargoSettings;
