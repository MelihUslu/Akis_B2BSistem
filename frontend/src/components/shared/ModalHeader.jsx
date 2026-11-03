import { X } from 'lucide-react';

/**
 * Tüm açılır pencerelerin ortak başlığı: ikon kutusu + başlık + (varsa) alt başlık + kapatma.
 * media: ikon yerine gösterilecek önizleme (ürün görseli, baş harfler); kutunun stili aynıdır.
 */
const ModalHeader = ({ icon: Icon, media, title, subtitle, onClose, closeLabel = 'Kapat', actions, className = '' }) => (
  <div className={`modal-header items-center ${className}`}>
    <div className="flex items-center gap-3 min-w-0">
      <span className="modal-icon">{media || (Icon && <Icon className="h-5 w-5" />)}</span>
      <div className="min-w-0">
        <h3 className="modal-title">{title}</h3>
        {subtitle && <div className="modal-subtitle">{subtitle}</div>}
      </div>
    </div>
    {(actions || onClose) && (
      <div className="flex items-center gap-2 shrink-0">
        {actions}
        {onClose && <button type="button" onClick={onClose} className="modal-close" aria-label={closeLabel}><X className="h-5 w-5" /></button>}
      </div>
    )}
  </div>
);

export default ModalHeader;
