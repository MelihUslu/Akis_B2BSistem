import { SiteHeader, PageFooter } from '../landing/layout';
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
      <SiteHeader brand={company.brand || PLATFORM_NAME} />
      <main className="max-w-3xl mx-auto px-5 pt-6 md:pt-10">
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
      </main>
      <PageFooter company={company} brand={company.brand || PLATFORM_NAME} />
    </div>
  );
};

export default LegalPage;
