
// Sayfa kodu (lazy chunk) yüklenirken gösterilir
const PageLoader = () => (
  <div className="flex items-center justify-center py-24" role="status" aria-label="Yükleniyor">
    <div className="h-8 w-8 rounded-full border-4 border-brand-100 border-t-brand-500 animate-spin" />
  </div>
);

export default PageLoader;
