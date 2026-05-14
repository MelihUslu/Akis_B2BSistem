import React, { useEffect } from 'react';
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
    gradient: 'from-indigo-400 to-purple-500',
    shadow: 'shadow-indigo-500/30',
    ring: 'ring-indigo-100',
    btn: 'from-indigo-500 to-purple-600 shadow-indigo-500/30 hover:shadow-indigo-500/50',
    bg: 'bg-indigo-50',
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
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div
        className="relative bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden"
        style={{ animation: 'alertCardIn 0.35s cubic-bezier(0.16,1,0.3,1) forwards' }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors z-10"
        >
          <X className="h-4 w-4 text-gray-400" />
        </button>

        {/* Icon header */}
        <div className={`${cfg.bg} pt-10 pb-8 flex flex-col items-center`}>
          <div
            className={`bg-gradient-to-br ${cfg.gradient} p-5 rounded-[1.5rem] shadow-xl ${cfg.shadow} ring-4 ${cfg.ring}`}
          >
            <Icon className="h-9 w-9 text-white" strokeWidth={2} />
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
                className="flex-1 py-3.5 rounded-2xl border-2 border-gray-100 bg-white text-sm font-black text-gray-500 hover:bg-gray-50 hover:border-gray-200 transition-all active:scale-95"
              >
                {cancelText}
              </button>
            )}
            <button
              onClick={() => { onConfirm?.(); onClose?.(); }}
              className={`flex-1 py-3.5 rounded-2xl bg-gradient-to-br ${cfg.btn} text-white text-sm font-black uppercase tracking-wider shadow-lg hover:-translate-y-0.5 transition-all active:scale-95`}
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
