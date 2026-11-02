// Talep formunun içeriği: hem müşterinin gördüğü /talep sayfasında hem de paneldeki önizlemede kullanılır.
// form: { title, description, buttonText, fields: [{ key, label, type, required, placeholder, options }] }
const LeadFormBody = ({ form, values, set, companyName, sending = false, preview = false }) => (
  <>
    <div>
      <h1 className="text-2xl font-black text-slate-900">{form.title}</h1>
      {form.description && <p className="mt-1.5 text-sm text-slate-500 whitespace-pre-line">{form.description}</p>}
    </div>
    {form.fields.map((f) => {
      const label = <label className="premium-label">{f.label}{!f.required && <span className="normal-case tracking-normal font-semibold text-slate-400"> (isteğe bağlı)</span>}</label>;
      const common = { required: f.required && !preview, className: 'premium-input', value: values[f.key] ?? '', onChange: set(f.key), placeholder: f.placeholder || undefined, readOnly: preview };
      if (f.type === 'textarea') return <div key={f.key}>{label}<textarea {...common} className="premium-input h-24 resize-none" /></div>;
      if (f.type === 'select') {
        return (
          <div key={f.key}>{label}
            <select {...common} disabled={preview}>
              <option value="">Seçin</option>
              {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        );
      }
      const auto = { name: 'name', phone: 'tel', email: 'email', city: 'address-level1' }[f.key];
      return (
        <div key={f.key}>{label}
          <input {...common} type={f.type === 'number' ? 'text' : f.type} inputMode={f.type === 'number' ? 'decimal' : f.type === 'tel' ? 'tel' : undefined} autoComplete={auto || 'off'} />
        </div>
      );
    })}
    <label className="flex items-start gap-3 text-xs text-slate-600">
      <input type="checkbox" className="mt-0.5 h-4 w-4" checked={Boolean(values.kvkkConsent)} onChange={set('kvkkConsent')} disabled={preview} />
      <span>Talebime dönüş yapılması için paylaştığım bilgilerin {companyName || 'firma'} tarafından 6698 sayılı KVKK kapsamında işlenmesini kabul ediyorum.</span>
    </label>
    <button type={preview ? 'button' : 'submit'} disabled={sending || (!preview && !values.kvkkConsent)} className="w-full btn-gradient py-4 disabled:opacity-50">
      {sending ? 'Gönderiliyor…' : form.buttonText}
    </button>
  </>
);

export default LeadFormBody;
