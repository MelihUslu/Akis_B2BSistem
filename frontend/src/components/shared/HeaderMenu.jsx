import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { initials } from '../../utils/ui';

/**
 * Üst çubuk açılır menüsü: dışarı tıklayınca, Esc ile ya da bir seçenek seçilince kapanır.
 * trigger: (open) => düğme içeriği · children: (close) => menü içeriği
 */
export const HeaderPopover = ({ trigger, label, children, width = 'w-64', buttonClass = '' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" aria-label={label} className={buttonClass}>
        {trigger(open)}
      </button>
      {open && (
        <div role="menu" className={`absolute right-0 z-50 mt-2 ${width} max-w-[calc(100vw-1.5rem)] bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
};

/**
 * Kullanıcı menüsü (sağ üst): ad, rol, e-posta; hesap bağlantıları ve Çıkış Yap.
 * items: [{ label, icon, to } | { label, icon, onClick, danger } | { divider: true }]
 */
export const UserMenu = ({ name, role, email, items }) => (
  <HeaderPopover label={name} width="w-64"
    buttonClass="flex items-center gap-3 pl-2 md:pl-4 md:border-l border-gray-100 rounded-xl group"
    trigger={(open) => (
      <>
        <span className="hidden md:flex flex-col text-right">
          <span className="text-xs font-black leading-none text-gray-900">{name}</span>
          <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest mt-1">{role}</span>
        </span>
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-[11px] shadow-sm transition-colors ${open ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-600 group-hover:bg-indigo-200'}`}>{initials(name)}</span>
        <ChevronDown className={`hidden md:block h-3.5 w-3.5 transition-transform ${open ? 'rotate-180 text-indigo-500' : 'text-gray-300 group-hover:text-indigo-500'}`} />
      </>
    )}>
    {(close) => (
      <>
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
          <span className="w-10 h-10 shrink-0 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-xs">{initials(name)}</span>
          <div className="min-w-0">
            <p className="text-sm font-black text-gray-900 truncate">{name}</p>
            {email && <p className="text-xs text-gray-500 truncate">{email}</p>}
          </div>
        </div>
        <div className="p-1.5">
          {items.map((it, i) => {
            if (it.divider) return <div key={`d${i}`} className="my-1.5 border-t border-gray-100" />;
            const cls = `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-left transition-colors ${it.danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'}`;
            const body = <><it.icon className={`h-4 w-4 ${it.danger ? '' : 'text-gray-400'}`} /> {it.label}</>;
            return it.to
              ? <Link key={it.label} to={it.to} onClick={close} role="menuitem" className={cls}>{body}</Link>
              : <button key={it.label} type="button" role="menuitem" onClick={() => { close(); it.onClick(); }} className={cls}>{body}</button>;
          })}
        </div>
      </>
    )}
  </HeaderPopover>
);
