// Yardım yazısı metni: boş satırla ayrılmış paragraflar, "1." numaralı adımlar ve "-" maddeler.
// Tek satırlık başlıklar (sonunda nokta yok, ardından liste gelen) kalın gösterilir.
const ArticleBody = ({ text = '' }) => {
  const blocks = text.split(/\n\s*\n/).map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean));
  return (
    <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
      {blocks.map((lines, i) => {
        const heading = lines.length > 1 && !/^(\d+\.|-)/.test(lines[0]) && !/[.:!?]$/.test(lines[0]) ? lines.shift() : null;
        const steps = lines.every((l) => /^\d+\.\s/.test(l));
        const bullets = lines.every((l) => /^-\s/.test(l));
        return (
          <div key={i}>
            {heading && <p className="font-black text-gray-900 mb-1.5">{heading}</p>}
            {steps ? (
              <ol className="space-y-2">
                {lines.map((l, j) => (
                  <li key={j} className="flex gap-3">
                    <span className="h-6 w-6 shrink-0 rounded-full bg-indigo-50 text-indigo-700 text-xs font-black flex items-center justify-center">{j + 1}</span>
                    <span className="pt-0.5">{l.replace(/^\d+\.\s*/, '')}</span>
                  </li>
                ))}
              </ol>
            ) : bullets ? (
              <ul className="space-y-1.5">
                {lines.map((l, j) => <li key={j} className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-gray-300 shrink-0" />{l.replace(/^-\s*/, '')}</li>)}
              </ul>
            ) : lines.map((l, j) => <p key={j}>{l}</p>)}
          </div>
        );
      })}
    </div>
  );
};

export default ArticleBody;
