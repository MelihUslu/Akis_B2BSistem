import { Paperclip, X, FileText, FileSpreadsheet, Loader2, Download } from 'lucide-react';
import { formatSize } from './supportMeta';

const isImage = (type) => String(type || '').startsWith('image/');
const FileIcon = ({ type, className }) => (/sheet|excel|csv/.test(type) ? <FileSpreadsheet className={className} /> : <FileText className={className} />);

// Gönderilmeyi bekleyen ekler (kaldırılabilir)
export const PendingAttachments = ({ files, uploading, onRemove }) => {
  if (!files.length && !uploading) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f) => (
        <span key={f.url} className="group relative inline-flex items-center gap-2 h-12 pl-1 pr-7 rounded-xl bg-white ring-1 ring-gray-200 max-w-[14rem]">
          {isImage(f.type) ? <img src={f.url} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <span className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center"><FileIcon type={f.type} className="h-5 w-5 text-gray-500" /></span>}
          <span className="min-w-0">
            <span className="block text-xs font-bold text-gray-700 truncate">{f.name}</span>
            <span className="block text-[10px] text-gray-400">{formatSize(f.size)}</span>
          </span>
          <button type="button" onClick={() => onRemove(f.url)} className="absolute top-1 right-1 p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50" aria-label="Kaldır"><X className="h-3.5 w-3.5" /></button>
        </span>
      ))}
      {uploading && <span className="inline-flex items-center gap-2 h-12 px-3 rounded-xl bg-gray-50 text-xs font-bold text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…</span>}
    </div>
  );
};

export const AttachButton = ({ onFiles, disabled, label = 'Dosya ekle' }) => (
  <label className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-bold transition-colors ${disabled ? 'opacity-40 pointer-events-none' : 'cursor-pointer text-gray-600 bg-gray-100 hover:bg-gray-200'}`} title="Görsel, PDF, Excel, Word, CSV veya TXT · en fazla 10 MB">
    <Paperclip className="h-3.5 w-3.5" /> {label}
    <input type="file" multiple className="hidden" accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.txt,.csv,.xlsx,.xls,.docx"
      onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
  </label>
);

// Gönderilmiş mesajdaki ekler
export const MessageAttachments = ({ files, mine }) => {
  if (!files?.length) return null;
  const images = files.filter((f) => isImage(f.type));
  const docs = files.filter((f) => !isImage(f.type));
  return (
    <div className={`mt-2 space-y-2 ${mine ? 'items-end' : ''}`}>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((f) => (
            <a key={f.url} href={f.url} target="_blank" rel="noreferrer" title={f.name} className="block h-28 w-28 rounded-xl overflow-hidden ring-1 ring-black/5 bg-white hover:opacity-90">
              <img src={f.url} alt={f.name} className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      )}
      {docs.map((f) => (
        <a key={f.url} href={f.url} target="_blank" rel="noreferrer" download={f.name}
          className={`flex items-center gap-2.5 px-3 py-2 rounded-xl max-w-xs ${mine ? 'bg-white/15 hover:bg-white/25 text-white' : 'bg-gray-50 ring-1 ring-gray-100 hover:bg-gray-100 text-gray-700'}`}>
          <FileIcon type={f.type} className="h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold truncate">{f.name}</span>
            <span className={`block text-[10px] ${mine ? 'text-brand-100' : 'text-gray-400'}`}>{formatSize(f.size)}</span>
          </span>
          <Download className="h-4 w-4 shrink-0 opacity-70" />
        </a>
      ))}
    </div>
  );
};
