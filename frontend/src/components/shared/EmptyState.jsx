// Boş liste görünümü: tüm panellerde aynı kart
const EmptyState = ({ icon: Icon, children, action }) => (
  <div className="rounded-2xl bg-white border border-gray-100 shadow-sm py-12 px-6 text-center">
    {Icon && <Icon className="h-10 w-10 mx-auto mb-3 text-gray-200" />}
    <p className="text-sm text-gray-400">{children}</p>
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>
);

export default EmptyState;
