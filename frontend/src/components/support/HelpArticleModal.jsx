import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ThumbsUp, ThumbsDown, LifeBuoy, Eye } from 'lucide-react';
import { TICKET_CATEGORIES } from '../shared/supportMeta';
import ArticleBody from './ArticleBody';

const VOTED_KEY = 'akis_help_votes';
const readVotes = () => { try { return JSON.parse(localStorage.getItem(VOTED_KEY) || '{}'); } catch { return {}; } };

/**
 * Yardım yazısı penceresi. onNeedHelp: "Sorunum çözülmedi" → destek talebi formunu açar.
 */
const HelpArticleModal = ({ id, client, onClose, onNeedHelp }) => {
  const [article, setArticle] = useState(null);
  const [vote, setVote] = useState(() => readVotes()[id]);

  useEffect(() => {
    client.get(`/account/help/${id}`).then((r) => setArticle(r.data)).catch(() => onClose());
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = (helpful) => {
    if (vote) return;
    setVote(helpful ? 'yes' : 'no');
    try { localStorage.setItem(VOTED_KEY, JSON.stringify({ ...readVotes(), [id]: helpful ? 'yes' : 'no' })); } catch { /* yoksay */ }
    client.post(`/account/help/${id}/feedback`, { helpful }).catch(() => {});
  };

  const cat = TICKET_CATEGORIES[article?.category] || TICKET_CATEGORIES.USAGE;
  // Sayfa kapsayıcısındaki transform/animasyon sabit konumu bozmasın diye body'ye çizilir
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-panel w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="modal-header">
          <div className="flex items-start gap-3 min-w-0">
            <span className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center ${cat.tile}`}><cat.icon className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h3 className="modal-title leading-snug">{article?.title || 'Yükleniyor…'}</h3>
              {article?.summary && <p className="modal-subtitle">{article.summary}</p>}
            </div>
          </div>
          <button onClick={onClose} className="modal-close" aria-label="Kapat"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          {article ? <ArticleBody text={article.body} /> : <div className="h-40 animate-pulse rounded-xl bg-gray-50" />}
        </div>
        <div className="modal-footer flex-wrap items-center">
          {article && (
            <span className="mr-auto inline-flex items-center gap-1.5 text-[11px] text-gray-400"><Eye className="h-3.5 w-3.5" /> {article.views + 1} görüntülenme</span>
          )}
          {vote ? (
            <span className="text-xs font-bold text-emerald-600">{vote === 'yes' ? 'Teşekkürler, işinize yaradığına sevindik.' : 'Teşekkürler, bu yazıyı geliştireceğiz.'}</span>
          ) : (
            <span className="inline-flex items-center gap-2 text-xs font-bold text-gray-500">
              Bu yazı işinize yaradı mı?
              <button onClick={() => send(true)} className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100"><ThumbsUp className="h-3.5 w-3.5" /> Evet</button>
              <button onClick={() => send(false)} className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"><ThumbsDown className="h-3.5 w-3.5" /> Hayır</button>
            </span>
          )}
          {onNeedHelp && (vote === 'no' || !vote) && (
            <button onClick={onNeedHelp} className="btn-gradient h-10 py-0 px-4"><LifeBuoy className="h-4 w-4 mr-1.5" /> Çözülmedi, talep aç</button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default HelpArticleModal;
