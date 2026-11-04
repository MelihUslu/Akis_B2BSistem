import { formatTRY } from '../../utils/format';

// Hedef ilerlemesi: gerçekleşen / hedef, yüzde ve çubuk (bayi ve yönetici ekranlarında aynı)
const TargetProgress = ({ t }) => {
  const reached = t.achieved >= t.targetAmount;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-bold text-gray-700 tabular-nums">{formatTRY(t.achieved)} <span className="text-gray-400 font-semibold">/ {formatTRY(t.targetAmount)}</span></span>
        <span className={`font-black tabular-nums ${reached ? 'text-emerald-600' : 'text-gray-900'}`}>%{t.percent.toLocaleString('tr-TR')}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, t.percent)} aria-label="Hedef gerçekleşme">
        <div className={`h-full rounded-full ${reached ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${Math.min(100, t.percent)}%` }} />
      </div>
    </div>
  );
};

export default TargetProgress;
