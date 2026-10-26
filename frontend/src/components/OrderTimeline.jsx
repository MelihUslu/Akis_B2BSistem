import React from 'react';
import { Clock, CheckCircle, Truck, PackageCheck, XCircle } from 'lucide-react';
import { formatDate } from '../utils/format';
import { t } from '../i18n';

const OrderTimeline = ({ order, compact = false }) => {
  if (order.status === 'CANCELLED') {
    return (
      <div className="flex items-center text-xs font-bold text-red-500">
        <XCircle className="h-4 w-4 mr-2" /> {t('Sipariş iptal edildi')}
      </div>
    );
  }

  const approved = order.status !== 'PENDING';
  const shipped = ['SHIPPED', 'COMPLETED'].includes(order.status);
  const delivered = order.status === 'COMPLETED';

  const steps = [
    { label: t('Sipariş Alındı'), done: true, date: order.createdAt, icon: Clock },
    { label: order.status === 'PARTIAL_APPROVED' ? t('Kısmen Onaylandı') : t('Onaylandı'), done: approved, date: order.approvedAt, icon: CheckCircle },
    { label: t('Kargoya Verildi'), done: shipped, date: order.shippedAt, icon: Truck },
    { label: t('Teslim Edildi'), done: delivered, date: delivered ? order.updatedAt : null, icon: PackageCheck },
  ];

  return (
    <div className={`flex ${compact ? 'items-center gap-6 flex-wrap' : 'items-start'}`}>
      {steps.map((step, i) => (
        <React.Fragment key={step.label}>
          <div className={`flex ${compact ? 'items-center' : 'flex-col items-center text-center flex-1'}`}>
            <div className={`${compact ? 'h-6 w-6 mr-2' : 'h-11 w-11 mb-3'} rounded-full flex items-center justify-center ${step.done ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'bg-gray-100 text-gray-300'}`}>
              <step.icon className={compact ? 'h-3.5 w-3.5' : 'h-5 w-5'} />
            </div>
            <div>
              <p className={`text-xs font-black ${step.done ? 'text-gray-900' : 'text-gray-300'}`}>{t(step.label)}</p>
              {!compact && step.done && step.date && <p className="text-[10px] font-bold text-gray-400 mt-1">{formatDate(step.date, true)}</p>}
            </div>
          </div>
          {!compact && i < steps.length - 1 && (
            <div className={`h-1 flex-1 mt-5 rounded-full ${steps[i + 1].done ? 'bg-emerald-400' : 'bg-gray-100'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default OrderTimeline;
