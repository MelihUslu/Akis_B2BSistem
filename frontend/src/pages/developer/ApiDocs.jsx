import { useEffect, useMemo, useState } from 'react';
import { Code2, KeyRound, Copy, Check, Webhook, Download, ChevronRight, ShieldCheck } from 'lucide-react';
import { useTenant } from '../../context/TenantContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
const METHOD = {
  get: 'bg-emerald-100 text-emerald-700', post: 'bg-blue-100 text-blue-700',
  put: 'bg-amber-100 text-amber-700', patch: 'bg-violet-100 text-violet-700', delete: 'bg-red-100 text-red-700'
};

const CopyButton = ({ text }) => {
  const [done, setDone] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}
      className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/10 text-slate-300 hover:text-white" aria-label="Kopyala">
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
};

const CodeBlock = ({ children }) => (
  <div className="relative">
    <pre className="text-[12px] leading-relaxed bg-slate-900 text-slate-100 rounded-xl p-4 overflow-x-auto"><code>{children}</code></pre>
    <CopyButton text={children} />
  </div>
);

// `kod` ve **kalın** işaretlerini gösterir (açıklamalar OpenAPI'den gelir)
const Text = ({ children }) => (
  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
    {String(children || '').split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('`') ? <code key={i} className="font-mono text-[12px] bg-gray-100 px-1 py-0.5 rounded">{part.slice(1, -1)}</code>
        : part.startsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : part)}
  </p>
);

const schemaOf = (spec, s) => (s?.$ref ? spec.components.schemas[s.$ref.split('/').pop()] : s);

const Fields = ({ spec, schema }) => {
  const s = schemaOf(spec, schema);
  const item = s?.oneOf ? schemaOf(spec, s.oneOf[0].items) : s?.type === 'array' ? schemaOf(spec, s.items) : s;
  if (!item?.properties) return null;
  return (
    <table className="w-full text-xs">
      <tbody className="divide-y divide-gray-100">
        {Object.entries(item.properties).map(([name, p]) => (
          <tr key={name}>
            <td className="py-1.5 pr-3 font-mono font-bold text-gray-800 whitespace-nowrap">{name}{item.required?.includes(name) && <span className="text-red-500">*</span>}</td>
            <td className="py-1.5 pr-3 text-gray-400 whitespace-nowrap">{[].concat(p.type || (p.$ref ? 'object' : '')).join(' | ')}{p.enum && `: ${p.enum.join(', ')}`}</td>
            <td className="py-1.5 text-gray-500">{p.description || ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const Operation = ({ spec, path, method, op, base }) => {
  const [open, setOpen] = useState(false);
  const body = op.requestBody?.content?.['application/json'];
  const query = (op.parameters || []).filter((p) => p.in === 'query');
  const example = body?.example ? JSON.stringify(body.example, null, 2) : null;
  const curl = [
    `curl -X ${method.toUpperCase()} "${base}${path.replace('{id}', '1024')}${method === 'get' && query.length ? `?${query[0].name}=${query[0].schema?.example || query[0].schema?.default || '…'}` : ''}"`,
    '  -H "X-API-Key: akb2b_…"',
    ...(example ? ['  -H "Content-Type: application/json"', `  -d '${JSON.stringify(body.example)}'`] : [])
  ].join(' \\\n');
  return (
    <div id={op.operationId} className="rounded-2xl ring-1 ring-gray-100 bg-white overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
        <span className={`w-16 text-center px-2 py-1 rounded-lg text-[11px] font-black uppercase ${METHOD[method]}`}>{method}</span>
        <code className="font-mono text-sm font-bold text-gray-900">{path}</code>
        <span className="text-sm text-gray-500 truncate hidden md:inline">{op.summary}</span>
        <ChevronRight className={`h-4 w-4 ml-auto text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-5 pt-1 space-y-4 border-t border-gray-100">
          <h4 className="text-base font-black text-gray-900 md:hidden">{op.summary}</h4>
          {op.description && <Text>{op.description}</Text>}
          {query.length > 0 && (
            <div>
              <p className="text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1">Sorgu parametreleri</p>
              <table className="w-full text-xs"><tbody className="divide-y divide-gray-100">
                {query.map((p) => <tr key={p.name}><td className="py-1.5 pr-3 font-mono font-bold">{p.name}</td><td className="py-1.5 pr-3 text-gray-400">{p.schema?.type}{p.schema?.enum && `: ${p.schema.enum.join(', ')}`}</td><td className="py-1.5 text-gray-500">{p.description || (p.schema?.default !== undefined ? `varsayılan ${p.schema.default}` : '')}</td></tr>)}
              </tbody></table>
            </div>
          )}
          {body && <div><p className="text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1">Gövde alanları</p><Fields spec={spec} schema={body.schema} /></div>}
          <div><p className="text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1">Örnek</p><CodeBlock>{curl}</CodeBlock></div>
          {Object.entries(op.responses || {}).map(([code, r]) => (
            <div key={code} className="text-xs"><span className={`font-mono font-black ${code.startsWith('2') ? 'text-emerald-600' : 'text-red-500'}`}>{code}</span> <span className="text-gray-500">{r.description}</span>
              {code.startsWith('2') && r.content?.['application/json']?.schema && <div className="mt-1"><Fields spec={spec} schema={r.content['application/json'].schema.properties?.data?.items || r.content['application/json'].schema} /></div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const VERIFY = `import crypto from 'crypto';

// Express: app.post('/b2b-webhook', express.raw({ type: 'application/json' }), handler)
const handler = (req, res) => {
  const expected = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET).update(req.body).digest('hex');
  const given = req.get('X-Webhook-Signature') || '';
  if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return res.status(401).end();
  }
  const { event, data } = JSON.parse(req.body);
  // … event: order.created, order.updated, invoice.issued …
  res.sendStatus(200);
};`;

// ERP / entegratör geliştiricileri için API dokümanı (herkese açık, giriş gerekmez)
const ApiDocs = () => {
  const { tenant } = useTenant();
  const [spec, setSpec] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API}/v1/openapi.json`).then((r) => r.json()).then(setSpec).catch(() => setError('API tanımı alınamadı.'));
  }, []);

  const groups = useMemo(() => {
    if (!spec) return [];
    return spec.tags.map((tag) => ({
      ...tag,
      ops: Object.entries(spec.paths).flatMap(([path, ops]) => Object.entries(ops).filter(([, op]) => op.tags?.includes(tag.name)).map(([method, op]) => ({ path, method, op })))
    }));
  }, [spec]);

  if (error) return <p className="p-10 text-center text-gray-500">{error}</p>;
  if (!spec) return <p className="p-10 text-center text-gray-400">Yükleniyor…</p>;
  const base = spec.servers[0].url;

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0b1220]">
      <header className="bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-10">
          <div className="flex items-center gap-3 text-indigo-300 text-xs font-black uppercase tracking-[0.2em]"><Code2 className="h-4 w-4" /> Geliştirici</div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight mt-2">{tenant?.name ? `${tenant.name} · ` : ''}Entegrasyon API</h1>
          <div className="mt-3 max-w-3xl text-slate-300 text-sm leading-relaxed space-y-2">
            {spec.info.description.split('\n\n').map((p) => <p key={p}>{p.replace(/\*\*/g, '')}</p>)}
          </div>
          <div className="mt-6 flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 font-mono">{base}</span>
            <a href={`${API}/v1/openapi.json`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-500 font-bold hover:bg-indigo-400"><Download className="h-3.5 w-3.5" /> openapi.json</a>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-8 py-10 space-y-10">
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: KeyRound, title: 'Kimlik doğrulama', text: 'Her isteğe X-API-Key başlığı ekleyin (ya da Authorization: Bearer). Anahtar yalnızca oluşturulduğunda bir kez gösterilir.' },
            { icon: ShieldCheck, title: 'Sınırlar', text: 'Dakikada 600 istek; toplu uçlarda tek istekte en fazla 1000 kayıt. Hatalı satırlar errors dizisinde döner, diğerleri işlenir.' },
            { icon: Webhook, title: 'Webhook', text: 'Sipariş, ödeme, iade, fatura olayları anında bildirilir; imzayı doğrulayın. 2xx dönmezseniz 3 kez yeniden denenir.' },
          ].map((c) => (
            <div key={c.title} className="rounded-2xl bg-white ring-1 ring-gray-100 p-5">
              <c.icon className="h-5 w-5 text-indigo-500 mb-2" />
              <p className="text-sm font-black text-gray-900">{c.title}</p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{c.text}</p>
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-black text-gray-900">Tipik senkron akışı</h2>
          <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1">
            <li>Gece: <code className="font-mono text-xs bg-gray-100 px-1 rounded">POST /products/upsert</code> ve <code className="font-mono text-xs bg-gray-100 px-1 rounded">POST /companies/upsert</code> ile kartları eşitleyin.</li>
            <li>Sık aralıkla: <code className="font-mono text-xs bg-gray-100 px-1 rounded">PUT /products/stock</code>, <code className="font-mono text-xs bg-gray-100 px-1 rounded">PUT /products/prices</code>, <code className="font-mono text-xs bg-gray-100 px-1 rounded">PUT /companies/balances</code>.</li>
            <li>Siparişler: <code className="font-mono text-xs bg-gray-100 px-1 rounded">GET /orders?status=APPROVED,PARTIAL_APPROVED&amp;exported=false</code> → ERP'ye kaydet → <code className="font-mono text-xs bg-gray-100 px-1 rounded">POST /orders/{'{id}'}/exported</code>.</li>
            <li>Sevkiyat ve fatura: <code className="font-mono text-xs bg-gray-100 px-1 rounded">PATCH /orders/{'{id}'}/status</code> ve <code className="font-mono text-xs bg-gray-100 px-1 rounded">PUT /orders/{'{id}'}/invoice</code>.</li>
          </ol>
        </section>

        {groups.map((g) => (
          <section key={g.name} className="space-y-3">
            <div><h2 className="text-xl font-black text-gray-900">{g.name}</h2><p className="text-sm text-gray-500">{g.description}</p></div>
            {g.ops.map((o) => <Operation key={`${o.method}${o.path}`} spec={spec} base={base} {...o} />)}
          </section>
        ))}

        <section className="space-y-3">
          <h2 className="text-xl font-black text-gray-900">Webhook olayları</h2>
          <Text>{Object.values(spec.webhooks)[0]?.post.description}</Text>
          <div className="rounded-2xl ring-1 ring-gray-100 bg-white divide-y divide-gray-100">
            {Object.entries(spec.webhooks).map(([event, w]) => (
              <div key={event} className="flex items-center gap-3 px-4 py-2.5"><code className="font-mono text-sm font-bold text-indigo-700 w-44">{event}</code><span className="text-sm text-gray-600">{w.post.summary}</span></div>
            ))}
          </div>
          <p className="text-sm font-bold text-gray-800">Gövde örneği</p>
          <CodeBlock>{JSON.stringify({ event: 'order.created', createdAt: '2026-10-27T09:15:00.000Z', data: { id: 1024, number: 'AK-1024', status: 'PENDING', companyId: 12, total: 15840 } }, null, 2)}</CodeBlock>
          <p className="text-sm font-bold text-gray-800">İmza doğrulama (Node.js)</p>
          <CodeBlock>{VERIFY}</CodeBlock>
        </section>
      </main>
    </div>
  );
};

export default ApiDocs;
