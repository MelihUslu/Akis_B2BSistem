// Sayfa başlığı: renkli ikon kutusu + başlık + açıklama, sağda işlemler (admin ve bayi sayfalarında aynı görünüm)
// Tüm sayfalarda aynı marka rengi (tone geriye dönük uyumluluk için kabul edilir, rengi değiştirmez)

const PageHeader = ({ icon: Icon, title, subtitle, actions, children }) => (
  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div className="flex items-center gap-4 min-w-0">
      <div className="page-icon !p-3 md:!p-3.5"><Icon className="h-6 w-6 text-brand-400" /></div>
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
