import React from 'react';
import { AlertTriangle, RotateCw, Home } from 'lucide-react';
import { reportError } from '../utils/errorReporter';

// Bir sayfa çökerse boş ekran yerine anlaşılır bir hata ekranı gösterir ve hatayı raporlar
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    reportError(error, { componentStack: info?.componentStack });
  }

  render() {
    if (!this.state.error) return this.props.children;
    // Yeni sürüm yayınlandıysa eski sayfa parçası bulunamaz; sayfayı yenilemek yeterlidir
    const chunk = /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(this.state.error?.message || '');
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center"><AlertTriangle className="h-7 w-7" /></div>
          <h2 className="text-xl font-black text-gray-900">{chunk ? 'Uygulama güncellendi' : 'Bir şeyler ters gitti'}</h2>
          <p className="text-sm text-gray-500">{chunk ? 'Yeni sürümü yüklemek için sayfayı yenileyin.' : 'Bu hata ekibimize otomatik olarak bildirildi. Sayfayı yenileyip tekrar deneyebilirsiniz.'}</p>
          <div className="flex justify-center gap-2">
            <button onClick={() => window.location.reload()} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-gray-900 text-white text-sm font-bold"><RotateCw className="h-4 w-4" /> Sayfayı yenile</button>
            <button onClick={() => { window.location.href = '/'; }} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold"><Home className="h-4 w-4" /> Ana sayfa</button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
