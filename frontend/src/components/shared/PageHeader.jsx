// Sayfa başlığı: renkli ikon kutusu + başlık + açıklama, sağda işlemler (admin ve bayi sayfalarında aynı görünüm)
const TONES = {
  indigo: 'from-indigo-500 to-indigo-700 shadow-indigo-500/25',
  blue: 'from-blue-500 to-blue-700 shadow-blue-500/25',
  emerald: 'from-emerald-500 to-emerald-700 shadow-emerald-500/25',
  orange: 'from-orange-500 to-orange-700 shadow-orange-500/25',
  violet: 'from-violet-500 to-purple-700 shadow-violet-500/25',
};

const PageHeader = ({ icon: Icon, title, subtitle, tone = 'indigo', actions, children }) => (
  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div className="flex items-center gap-4 min-w-0">
      <div className={`bg-gradient-to-br ${TONES[tone] || TONES.indigo} p-3 md:p-3.5 rounded-2xl shadow-lg shrink-0`}><Icon className="h-6 w-6 text-white" /></div>
      <div className="min-w-0">
        <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">{title}</h1>
        {subtitle && <div className="text-gray-500 text-sm mt-1">{subtitle}</div>}
        {children}
      </div>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

export default PageHeader;
