'use client';

import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: string;
  change?: number;
  changeLabel?: string;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  trend?: 'up' | 'down' | 'neutral';
  positiveIsUp?: boolean;
  delay?: number;
  gradient?: string;
}

export function KPICard({
  title,
  value,
  change,
  changeLabel,
  icon: Icon,
  iconColor = 'text-brand-400',
  iconBg = 'bg-brand-500/10',
  trend,
  positiveIsUp = true,
  delay = 0,
  gradient,
}: KPICardProps) {
  const isPositive =
    change !== undefined
      ? positiveIsUp
        ? change >= 0
        : change <= 0
      : trend === 'up';

  const TrendIcon = change === 0 ? Minus : change && change > 0 ? TrendingUp : TrendingDown;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className={cn(
        'card relative overflow-hidden p-4 transition-all duration-200 hover:border-white/15 sm:p-5',
        gradient
      )}
    >
      {/* Subtle glow background */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />

      <div className="relative flex items-start justify-between mb-4">
        <p className="metric-label">{title}</p>
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', iconBg)}>
          <Icon size={15} className={iconColor} />
        </div>
      </div>

      <div className="relative space-y-1.5">
        <p className="metric-value text-xl sm:text-2xl">{value}</p>

        {change !== undefined && (
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                'flex items-center gap-0.5 text-xs font-medium',
                isPositive ? 'text-accent-green' : 'text-accent-red'
              )}
            >
              <TrendIcon size={12} />
              <span>{Math.abs(change).toFixed(1)}%</span>
            </div>
            {changeLabel && (
              <span className="text-surface-500 text-xs">{changeLabel}</span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function KPICardSkeleton() {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="skeleton h-3 w-20 rounded" />
        <div className="skeleton w-8 h-8 rounded-lg" />
      </div>
      <div className="skeleton h-8 w-28 rounded mb-2" />
      <div className="skeleton h-3 w-16 rounded" />
    </div>
  );
}
