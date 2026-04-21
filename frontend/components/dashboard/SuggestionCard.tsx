'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, CheckCircle2, Zap, TrendingUp, AlertCircle, PauseCircle, RefreshCw, DollarSign } from 'lucide-react';
import { cn, getImpactColor } from '@/lib/utils';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface Suggestion {
  _id: string;
  title: string;
  reason: string;
  impact: 'high' | 'medium' | 'low';
  priority: number;
  type: string;
  applied: boolean;
  createdAt: string;
}

interface SuggestionCardProps {
  suggestion: Suggestion & { campaignId?: string; campaignName?: string };
  onApplied?: () => void;
}

const typeConfig: Record<string, { icon: any; color: string }> = {
  roas_optimization: { icon: TrendingUp, color: 'text-brand-400' },
  cpa_reduction: { icon: AlertCircle, color: 'text-red-400' },
  creative_refresh: { icon: RefreshCw, color: 'text-cyan-400' },
  budget_utilization: { icon: DollarSign, color: 'text-amber-400' },
  budget_increase: { icon: Zap, color: 'text-green-400' },
  pause_campaign: { icon: PauseCircle, color: 'text-red-400' },
  frequency_increase: { icon: TrendingUp, color: 'text-purple-400' },
};

export function SuggestionCard({ suggestion, onApplied }: SuggestionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(suggestion.applied);

  const config = typeConfig[suggestion.type] || { icon: Zap, color: 'text-brand-400' };
  const TypeIcon = config.icon;

  const handleApply = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!suggestion.campaignId) return;
    setApplying(true);
    try {
      await api.campaigns.applySuggestion(suggestion.campaignId, suggestion._id);
      setApplied(true);
      onApplied?.();
      toast.success('Suggestion marked as applied!');
    } catch {
      toast.error('Failed to update suggestion');
    } finally {
      setApplying(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'border rounded-xl overflow-hidden transition-all duration-200',
        applied
          ? 'bg-surface-950 border-white/5 opacity-60'
          : 'bg-surface-900 border-white/8 hover:border-white/12 cursor-pointer'
      )}
      onClick={() => !applied && setExpanded(!expanded)}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Priority indicator */}
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
            applied ? 'bg-green-500/10' : 'bg-surface-800'
          )}>
            {applied ? (
              <CheckCircle2 size={15} className="text-green-400" />
            ) : (
              <TypeIcon size={15} className={config.color} />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className={cn('text-sm font-medium', applied ? 'text-surface-500 line-through' : 'text-white')}>
                {suggestion.title}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn('badge text-[10px]', getImpactColor(suggestion.impact))}>
                  {suggestion.impact}
                </span>
                {!applied && (
                  <ChevronDown
                    size={14}
                    className={cn('text-surface-500 transition-transform', expanded && 'rotate-180')}
                  />
                )}
              </div>
            </div>

            {suggestion.campaignName && (
              <p className="text-xs text-surface-500 mt-0.5">{suggestion.campaignName}</p>
            )}
          </div>
        </div>
      </div>

      {/* Expandable detail */}
      <AnimatePresence>
        {expanded && !applied && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-4 pb-4 border-t border-white/5 pt-3">
              <p className="text-sm text-surface-300 leading-relaxed">{suggestion.reason}</p>

              {suggestion.campaignId && (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={handleApply}
                    disabled={applying}
                    className="btn-primary py-1.5 text-xs"
                  >
                    {applying ? (
                      <>
                        <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30 60" />
                        </svg>
                        Applying…
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={12} />
                        Mark as Applied
                      </>
                    )}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
                    className="btn-ghost py-1.5 text-xs"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
