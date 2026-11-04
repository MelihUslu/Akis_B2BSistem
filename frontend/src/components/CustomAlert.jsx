import { useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

/**
 * CustomAlert — SweetAlert-style premium popup
 *
 * Props:
 *  isOpen      : boolean
 *  type        : 'success' | 'error' | 'warning' | 'info'
 *  title       : string
 *  message     : string
 *  confirmText : string  (default 'Tamam')
 *  cancelText  : string  (optional — renders a cancel button when set)
 *  onConfirm   : () => void
 *  onCancel    : () => void  (optional)
 *  onClose     : () => void
 */
const CONFIG = {
  success: {
    icon: CheckCircle,
    gradient: 'from-emerald-400 to-teal-500',
    shadow: 'shadow-emerald-500/30',
    ring: 'ring-emerald-100',
    btn: 'from-emerald-500 to-teal-600 shadow-emerald-500/30 hover:shadow-emerald-500/50',
    bg: 'bg-emerald-50',
  },
  error: {
    icon: XCircle,
    gradient: 'from-rose-400 to-red-500',
    shadow: 'shadow-rose-500/30',
    ring: 'ring-rose-100',
    btn: 'from-rose-500 to-red-600 shadow-rose-500/30 hover:shadow-rose-500/50',
    bg: 'bg-rose-50',
  },
  warning: {
    icon: AlertTriangle,
    gradient: 'from-amber-400 to-orange-500',
    shadow: 'shadow-amber-500/30',
    ring: 'ring-amber-100',
    btn: 'from-amber-500 to-orange-600 shadow-amber-500/30 hover:shadow-amber-500/50',
    bg: 'bg-amber-50',
  },
  info: {
    icon: Info,
    gradient: 'from-brand-400 to-brand-600',
    shadow: 'shadow-brand-500/30',
    ring: 'ring-brand-100',
    btn: 'from-brand-500 to-brand-700 shadow-brand-500/30 hover:shadow-brand-500/50',
    bg: 'bg-brand-50',
  },
};

const CustomAlert = ({
  isOpen,
  type = 'info',
  title,
  message,
  confirmText = 'Tamam',
  cancelText,
  onConfirm,
  onCancel,
  onClose,
}) => {
  const cfg = CONFIG[type] || CONFIG.info;
  const Icon = cfg.icon;

  // ESC ile kapat
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && isOpen) onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Body scroll kilidi
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ animation: 'alertBackdropIn 0.2s ease forwards' }}
    >
      {/* Backdrop */}
      <div
        className="modal-backdrop"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className="relative bg-white rounded-[1.75rem] ring-1 ring-black/5 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.45)] w-full max-w-sm overflow-hidden"
        style={{ animation: 'alertCardIn 0.35s cubic-bezier(0.16,1,0.3,1) forwards' }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="modal-close absolute top-4 right-4 mr-0 z-10"
          aria-label="Kapat"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Icon header */}
        <div className={`${cfg.bg} pt-9 pb-7 flex flex-col items-center`}>
          <div
            className={`bg-gradient-to-br ${cfg.gradient} p-4 rounded-2xl shadow-xl ${cfg.shadow} ring-4 ${cfg.ring}`}
          >
            <Icon className="h-8 w-8 text-white" strokeWidth={2} />
          </div>
        </div>

        {/* Content */}
        <div className="px-8 pt-6 pb-8 text-center space-y-3">
          {title && (
            <h2 className="text-xl font-black text-gray-900 tracking-tight">{title}</h2>
          )}
          {message && (
            <p className="text-sm font-medium text-gray-500 leading-relaxed">{message}</p>
          )}

          {/* Buttons */}
          <div className={`pt-4 flex gap-3 ${cancelText ? 'flex-row' : 'flex-col'}`}>
            {cancelText && (
              <button
                onClick={() => { onCancel?.(); onClose?.(); }}
                className="flex-1 h-12 rounded-2xl border border-gray-200 bg-white text-sm font-black text-gray-600 hover:bg-gray-50 hover:border-gray-200 transition-all active:scale-95"
              >
                {cancelText}
              </button>
            )}
            <button
              onClick={() => { onConfirm?.(); onClose?.(); }}
              className={`flex-1 h-12 rounded-2xl bg-gradient-to-br ${cfg.btn} text-white text-sm font-black uppercase tracking-wider shadow-lg hover:-translate-y-0.5 transition-all active:scale-95`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes alertBackdropIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes alertCardIn {
          from { opacity: 0; transform: scale(0.85) translateY(20px); }
          to   { opacity: 1; transform: scale(1)   translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default CustomAlert;
