import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Inbox, Settings2 } from 'lucide-react';
import api from '../../services/api';
import useAlert from '../../hooks/useAlert';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import WhatsAppInbox from '../../components/whatsapp/WhatsAppInbox';
import WhatsAppSettings from '../../components/whatsapp/WhatsAppSettings';

/**
 * WhatsApp: gelen kutusu (MESSAGES yetkisi) ve bağlantı / yapay zekâ ayarları (SETTINGS yetkisi).
 * Numara bağlı değilse ayarlar açılır.
 */
const WhatsAppPage = () => {
  const { user } = useAuth();
  const canInbox = can(user, 'MESSAGES');
  const canSettings = can(user, 'SETTINGS');
  const [data, setData] = useState(null);
  const [tab, setTab] = useState(null);
  const { alertElement, showAlert, confirm } = useAlert();

  const load = useCallback(() => api.get('/whatsapp/channel').then((r) => setData(r.data)).catch(() => setData({ connected: false, channel: null, ai: { enabled: false } })), []);
  useEffect(() => { load(); }, [load]);

  const active = tab || (data && (!data.connected || !canInbox) ? 'settings' : 'inbox');
  const ch = data?.channel;

  return (
    <div className="space-y-6">
      {alertElement}
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div className="flex items-center gap-4">
          <div className="page-icon"><MessageCircle className="h-6 w-6 text-brand-400" /></div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">WhatsApp</h1>
            <p className="text-gray-500 text-sm mt-1">
              {data?.connected
                ? <>{ch.displayPhone} · {ch.aiEnabled ? 'Yapay zekâ müşterilere otomatik cevap veriyor; emin olmadığında ekibe devrediyor.' : 'Yapay zekâ kapalı; mesajları ekip cevaplıyor.'}</>
                : 'WhatsApp Business numaranızı bağlayın; müşteri mesajlarına yapay zekâ firmanızın bilgileriyle cevap versin.'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {canInbox && data?.connected && (
            <button type="button" onClick={() => setTab('inbox')} className={`h-11 px-4 rounded-xl text-sm font-black flex items-center gap-2 ${active === 'inbox' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}><Inbox className="h-4 w-4" /> Gelen kutusu</button>
          )}
          {(canSettings || canInbox) && (
            <button type="button" onClick={() => setTab('settings')} className={`h-11 px-4 rounded-xl text-sm font-black flex items-center gap-2 ${active === 'settings' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}><Settings2 className="h-4 w-4" /> Ayarlar</button>
          )}
        </div>
      </div>

      {!data ? <div className="card-premium h-96 animate-pulse" />
        : active === 'inbox'
          ? <WhatsAppInbox aiEnabled={ch?.aiEnabled} showAlert={showAlert} />
          : <WhatsAppSettings key={`${data.connected}-${ch?.aiEnabled}-${ch?.knowledge}-${ch?.handoffMessage}`} data={data} reload={load} showAlert={showAlert} confirm={confirm} canEdit={canSettings} />}
    </div>
  );
};

export default WhatsAppPage;
