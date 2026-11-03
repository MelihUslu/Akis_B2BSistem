import ModalHeader from './ModalHeader';

// Ortak pencere: ikonlu başlık, kapatma, kaydırılabilir içerik, isteğe bağlı alt şerit
const Modal = ({ title, subtitle, icon, onClose, children, footer, size = 'max-w-lg', z = 'z-[60]', as = 'div', onSubmit }) => {
  const Panel = as;
  return (
    <div className={`fixed inset-0 ${z} flex items-center justify-center p-4`}>
      <div className="modal-backdrop" onClick={onClose} />
      <Panel onSubmit={onSubmit} className={`modal-panel w-full ${size} max-h-[90vh] flex flex-col`}>
        <ModalHeader icon={icon} title={title} subtitle={subtitle} onClose={onClose} />
        <div className="p-5 sm:p-7 space-y-4 overflow-y-auto">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </Panel>
    </div>
  );
};

export default Modal;
