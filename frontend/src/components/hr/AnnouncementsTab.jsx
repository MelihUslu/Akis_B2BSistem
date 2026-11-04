import { useEffect, useState } from 'react';
import { Megaphone, Plus, Trash2, Users } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import Modal from '../shared/Modal';
import EmptyState from '../shared/EmptyState';
import { Field } from '../form/FormKit';
import { formatDate } from '../../utils/format';
import { ListCard, Row } from './HrUi';

// Yeni duyuru: tüm personele ya da seçilen departmanlara; hesabı olan personele bildirim gider
const AnnouncementModal = ({ onClose, onSaved, showAlert }) => {
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState({ title: '', body: '', departments: [] });
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/hr/departments').then((r) => setDepartments(r.data)).catch(() => {}); }, []);
  const toggle = (name) => setForm({ ...form, departments: form.departments.includes(name) ? form.departments.filter((d) => d !== name) : [...form.departments, name] });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      onSaved((await api.post('/hr/announcements', form)).data.message);
    } catch (err) {
      showAlert({ type: 'error', title: 'Yayınlanamadı', message: errorMessage(err, 'Duyuru yayınlanamadı.') });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal as="form" onSubmit={submit} icon={Megaphone} size="max-w-xl" title="Yeni duyuru" subtitle="Personel Alanım'da görünür; hesabı olan personele bildirim gider." onClose={onClose}
      footer={<><button type="button" onClick={onClose} className="btn-secondary">Vazgeç</button><button disabled={busy} className="btn-gradient disabled:opacity-50">Yayınla</button></>}>
      <Field label="Başlık" required><input required minLength={3} maxLength={120} autoFocus className="premium-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-label="Başlık" /></Field>
      <Field label="Duyuru" required><textarea required minLength={3} maxLength={4000} rows={5} className="premium-input" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} aria-label="Duyuru metni" /></Field>
      <Field label="Kime" hint={form.departments.length ? `${form.departments.length} departman` : 'Hiçbiri seçilmezse tüm personele gider'}>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setForm({ ...form, departments: [] })}
            className={`h-9 px-3 rounded-xl text-xs font-bold ring-1 ${form.departments.length === 0 ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-gray-600 ring-gray-200 hover:bg-gray-50'}`}>Tüm personel</button>
          {departments.map((d) => (
            <button key={d.name} type="button" onClick={() => toggle(d.name)} aria-pressed={form.departments.includes(d.name)}
              className={`h-9 px-3 rounded-xl text-xs font-bold ring-1 ${form.departments.includes(d.name) ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-gray-600 ring-gray-200 hover:bg-gray-50'}`}>{d.name} <span className="opacity-70">({d.count})</span></button>
          ))}
        </div>
        {departments.length === 0 && <p className="text-[11px] text-gray-400 mt-1">Departman yok: personel kartlarına departman yazınca burada seçilebilir.</p>}
      </Field>
    </Modal>
  );
};

const AnnouncementsTab = ({ showAlert, confirm }) => {
  const [rows, setRows] = useState(null);
  const [adding, setAdding] = useState(false);
  const load = () => api.get('/hr/announcements').then((r) => setRows(r.data)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const remove = async (a) => {
    if (!(await confirm({ title: 'Duyuru silinsin mi?', message: a.title, confirmText: 'Sil' }))) return;
    api.delete(`/hr/announcements/${a.id}`).then(() => load()).catch((err) => showAlert({ type: 'error', title: 'Silinemedi', message: errorMessage(err, 'Duyuru silinemedi.') }));
  };

  return (
    <div className="space-y-4">
      {adding && <AnnouncementModal showAlert={showAlert} onClose={() => setAdding(false)} onSaved={(m) => { setAdding(false); load(); showAlert({ type: 'success', title: 'Yayınlandı', message: m }); }} />}
      <div className="flex justify-end"><button type="button" onClick={() => setAdding(true)} className="btn-gradient"><Plus className="h-4 w-4 mr-1.5" /> Yeni duyuru</button></div>
      {rows && rows.length === 0 ? <EmptyState icon={Megaphone}>Henüz şirket duyurusu yok.</EmptyState> : (
        <ListCard>
          {(rows || []).map((a) => (
            <Row key={a.id}>
              <div className="flex items-start gap-3">
                <span className="h-10 w-10 shrink-0 rounded-xl bg-brand-50 flex items-center justify-center"><Megaphone className="h-5 w-5 text-brand-600" /></span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900">{a.title}</p>
                  <p className="text-sm text-gray-600 whitespace-pre-line break-words mt-1">{a.body}</p>
                  <p className="text-xs text-gray-400 mt-2"><Users className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />{a.departments.length ? a.departments.join(', ') : 'Tüm personel'} · {a.createdByName} · {formatDate(a.createdAt, true)}</p>
                </div>
                <button type="button" onClick={() => remove(a)} className="h-9 w-9 shrink-0 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center" aria-label="Duyuruyu sil" title="Sil"><Trash2 className="h-4 w-4" /></button>
              </div>
            </Row>
          ))}
        </ListCard>
      )}
    </div>
  );
};

export default AnnouncementsTab;
