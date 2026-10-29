import { Link } from 'react-router-dom';
import { ArrowLeft, Store } from 'lucide-react';
import { LEGAL_PAGES } from './texts';

const PLATFORM_NAME = import.meta.env.VITE_PLATFORM_NAME || 'Akis B2B';

/**
 * Yasal metin sayfası. Platform panelinden metin girildiyse o (paragraflar boş satırla ayrılır), yoksa taslak gösterilir.
 */
const LegalPage = ({ page, site }) => {
  const def = LEGAL_PAGES[page];
  const company = site?.company || {};
  const custom = site?.legal?.[page]?.trim();
  const sections = custom ? null : def.build(company);

  return (
    <div className="min-h-screen bg-[#f6f7f8] text-slate-900">
      <header className="max-w-3xl mx-auto px-5 py-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="h-9 w-9 rounded-xl bg-[#0b1120] flex items-center justify-center"><Store className="h-5 w-5 text-white" /></span>
          <span className="text-lg font-semibold tracking-tight">{company.brand || PLATFORM_NAME}</span>
        </Link>
        <Link to="/" className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-950"><ArrowLeft className="h-4 w-4" /> Ana sayfa</Link>
      </header>
      <main className="max-w-3xl mx-auto px-5 pb-20">
        <article className="rounded-[2rem] bg-white shadow-[0_10px_40px_-20px_rgba(15,23,42,0.2)] p-7 md:p-12">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.03em]">{def.title}</h1>
          {site?.legal?.updatedAt && <p className="mt-2 text-sm text-slate-500">Son güncelleme: {new Date(site.legal.updatedAt).toLocaleDateString('tr-TR')}</p>}
          <div className="mt-8 space-y-7 text-[15px] leading-relaxed text-slate-700">
            {custom
              ? custom.split(/\n\s*\n/).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)
              : sections.map(([title, blocks]) => (
                <section key={title}>
                  <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
                  {blocks.map((b, i) => (Array.isArray(b)
                    ? <ul key={i} className="mt-3 list-disc pl-5 space-y-1.5">{b.map((x) => <li key={x}>{x}</li>)}</ul>
                    : <p key={i} className="mt-3">{b}</p>))}
                </section>
              ))}
          </div>
        </article>
        <nav className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-500">
          {Object.entries(LEGAL_PAGES).map(([k, p]) => <Link key={k} to={p.path} className={k === page ? 'font-semibold text-slate-900' : 'hover:text-slate-900'}>{p.title}</Link>)}
        </nav>
      </main>
    </div>
  );
};

export default LegalPage;
