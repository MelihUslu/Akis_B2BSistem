import { X } from 'lucide-react';

// Ortak pencere: başlık, kapatma, kaydırılabilir içerik, isteğe bağlı alt çubuk
const Modal = ({ title, onClose, children, footer, size = 'max-w-lg', z = 'z-[60]', as = 'div', onSubmit }) => {
  const Panel = as;
  return (
    <div className={`fixed inset-0 ${z} flex items-center justify-center p-4`}>
      <div className="modal-backdrop" onClick={onClose} />
      <Panel onSubmit={onSubmit} className={`modal-panel w-full ${size} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="modal-title">{title}</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100" aria-label="Kapat"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">{children}</div>
        {footer && <div className="p-5 border-t border-gray-100 flex justify-end gap-2">{footer}</div>}
      </Panel>
    </div>
  );
};

export default Modal;
