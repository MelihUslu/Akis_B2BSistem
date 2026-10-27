import { useState } from 'react';
import { Star } from 'lucide-react';

const LABELS = ['', 'Çok kötü', 'Kötü', 'İdare eder', 'İyi', 'Mükemmel'];

export const Stars = ({ value, size = 'h-3.5 w-3.5' }) => (
  <span className="inline-flex" title={`${value}/5`}>
    {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`${size} ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />)}
  </span>
);

/**
 * Kapanan talep için memnuniyet puanı. onRate(rating, comment) -> Promise<boolean>.
 * Puan verilmişse özet gösterir; "Değiştir" ile yeniden puanlanabilir.
 */
const TicketRating = ({ ticket, onRate }) => {
  const [editing, setEditing] = useState(!ticket.rating);
  const [rating, setRating] = useState(ticket.rating || 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(ticket.ratingComment || '');
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-amber-50/60 ring-1 ring-amber-100 px-3 py-2 text-xs">
        <span className="font-bold text-gray-600">Değerlendirmeniz:</span><Stars value={ticket.rating} />
        {ticket.ratingComment && <span className="text-gray-500 truncate">“{ticket.ratingComment}”</span>}
        <button onClick={() => setEditing(true)} className="ml-auto font-bold text-blue-600 hover:underline shrink-0">Değiştir</button>
      </div>
    );
  }

  const save = async () => {
    if (!rating) return;
    setSaving(true);
    if (await onRate(rating, comment.trim())) setEditing(false);
    setSaving(false);
  };
  const shown = hover || rating;
  return (
    <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-white ring-1 ring-amber-200 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-black text-gray-900">Destek deneyiminizi puanlayın</p>
        <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n)} onMouseEnter={() => setHover(n)} aria-label={`${n} yıldız`} className="p-0.5 transition-transform hover:scale-110">
              <Star className={`h-7 w-7 ${n <= shown ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />
            </button>
          ))}
        </div>
        {shown > 0 && <span className="text-xs font-bold text-amber-700">{LABELS[shown]}</span>}
      </div>
      {rating > 0 && (
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000}
            placeholder={rating <= 3 ? 'Neyi daha iyi yapabilirdik? (isteğe bağlı)' : 'Eklemek istediğiniz bir şey var mı? (isteğe bağlı)'}
            className="flex-1 h-10 px-3 rounded-xl bg-white ring-1 ring-gray-200 text-sm outline-none focus:ring-2 focus:ring-amber-300" />
          <button disabled={saving} onClick={save} className="h-10 px-4 rounded-xl bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 disabled:opacity-50">{saving ? 'Gönderiliyor…' : 'Gönder'}</button>
        </div>
      )}
    </div>
  );
};

export default TicketRating;
