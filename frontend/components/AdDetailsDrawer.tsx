'use client';

import { X, DollarSign, TrendingUp, MousePointerClick, Users, Image as ImageIcon } from 'lucide-react';
import { formatCurrency, formatPercent, cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface Ad {
  id: string;
  name: string;
  status: string;
  creative: {
    title?: string;
    body?: string;
    imageUrl?: string;
    callToAction?: string;
  };
  metrics: {
    spend: number;
    ctr: number;
    conversions: number;
    roas: number;
  };
}

interface AdDetailsDrawerProps {
  ad: Ad | null;
  isOpen: boolean;
  onClose: () => void;
}

export const AdDetailsDrawer = ({ ad, isOpen, onClose }: AdDetailsDrawerProps) => {
  if (!ad) return null;

  const statusColors: Record<string, string> = {
    'ACTIVE': 'bg-green-500/10 text-green-400 border-green-500/20',
    'PAUSED': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    'ARCHIVED': 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    'OFF': 'bg-red-500/10 text-red-400 border-red-500/20',
  };

  const statusColor = statusColors[ad.status] || 'bg-surface-800/50 text-surface-300 border-surface-700';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-surface-900 border-l border-white/5 shadow-2xl z-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-lg font-semibold text-white">Ad Details</h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-surface-800 border border-white/5 flex items-center justify-center hover:bg-surface-700 transition-colors"
              >
                <X size={16} className="text-surface-300" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Ad Name and Status */}
              <div>
                <h3 className="text-sm font-medium text-surface-400 uppercase tracking-wider mb-2">Ad Name</h3>
                <p className="text-base font-semibold text-white break-words">{ad.name}</p>
                <div className="mt-3 flex items-center gap-2">
                  <span className={cn('badge border text-xs px-2.5 py-1', statusColor)}>
                    {ad.status}
                  </span>
                </div>
              </div>

              {/* Creative Details */}
              <div>
                <h3 className="text-sm font-medium text-surface-400 uppercase tracking-wider mb-3">Creative</h3>
                <div className="space-y-3">
                  {ad.creative.imageUrl && (
                    <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-surface-800 border border-white/5">
                      <img
                        src={ad.creative.imageUrl}
                        alt={ad.creative.title || 'Ad creative'}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <div
                        className="absolute inset-0 hidden bg-surface-800/50 flex items-center justify-center"
                        style={{
                          display: ad.creative.imageUrl ? 'none' : 'flex',
                        }}
                      >
                        <ImageIcon size={32} className="text-surface-600" />
                      </div>
                    </div>
                  )}

                  {ad.creative.title && (
                    <div>
                      <p className="text-xs text-surface-500 mb-1">Headline</p>
                      <p className="text-sm text-white font-medium">{ad.creative.title}</p>
                    </div>
                  )}

                  {ad.creative.body && (
                    <div>
                      <p className="text-xs text-surface-500 mb-1">Body</p>
                      <p className="text-sm text-surface-300 line-clamp-3">{ad.creative.body}</p>
                    </div>
                  )}

                  {ad.creative.callToAction && (
                    <div>
                      <p className="text-xs text-surface-500 mb-1">Call to Action</p>
                      <p className="text-sm text-brand-300 font-medium">{ad.creative.callToAction}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Metrics */}
              <div>
                <h3 className="text-sm font-medium text-surface-400 uppercase tracking-wider mb-3">Performance</h3>
                <div className="grid grid-cols-2 gap-3">
                  <MetricCard
                    label="Spend"
                    value={formatCurrency(ad.metrics.spend || 0)}
                    icon={DollarSign}
                    color="text-brand-400"
                  />
                  <MetricCard
                    label="CTR"
                    value={formatPercent(ad.metrics.ctr || 0)}
                    icon={MousePointerClick}
                    color="text-cyan-400"
                  />
                  <MetricCard
                    label="Conversions"
                    value={(ad.metrics.conversions || 0).toFixed(0)}
                    icon={Users}
                    color="text-amber-400"
                  />
                  <MetricCard
                    label="ROAS"
                    value={`${(ad.metrics.roas || 0).toFixed(2)}x`}
                    icon={TrendingUp}
                    color={
                      (ad.metrics.roas || 0) >= 2
                        ? 'text-green-400'
                        : (ad.metrics.roas || 0) >= 1
                          ? 'text-amber-400'
                          : 'text-red-400'
                    }
                  />
                </div>
              </div>

              {/* Ad ID */}
              <div>
                <p className="text-xs text-surface-500 mb-2">Ad ID</p>
                <code className="text-xs bg-surface-950 border border-white/5 rounded px-2.5 py-1.5 text-surface-300 block break-all">
                  {ad.id}
                </code>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: any;
  color: string;
}) {
  return (
    <div className="bg-surface-800/50 border border-white/5 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className={color} />
        <p className="text-xs text-surface-400">{label}</p>
      </div>
      <p className="text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
