'use client';

import { cn, getHealthScoreColor } from '@/lib/utils';

interface HealthScoreRingProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

const sizeConfig = {
  sm: { radius: 16, strokeWidth: 3, text: 'text-xs', container: 'w-10 h-10' },
  md: { radius: 22, strokeWidth: 4, text: 'text-sm', container: 'w-14 h-14' },
  lg: { radius: 34, strokeWidth: 5, text: 'text-xl', container: 'w-20 h-20' },
};

function getScoreStrokeColor(score: number): string {
  if (score >= 80) return '#22d3ee';
  if (score >= 60) return '#4ade80';
  if (score >= 40) return '#fbbf24';
  if (score >= 20) return '#fb923c';
  return '#f87171';
}

export function HealthScoreRing({
  score,
  size = 'md',
  showLabel = false,
  className,
}: HealthScoreRingProps) {
  const { radius, strokeWidth, text, container } = sizeConfig[size];
  const circumference = 2 * Math.PI * radius;
  const viewBoxSize = (radius + strokeWidth) * 2 + 4;
  const center = viewBoxSize / 2;
  const dashOffset = circumference - (score / 100) * circumference;
  const strokeColor = getScoreStrokeColor(score);

  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      <div className={cn('relative', container)}>
        <svg
          viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
          className="w-full h-full -rotate-90"
        >
          {/* Background ring */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={strokeWidth}
          />
          {/* Score ring */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{
              transition: 'stroke-dashoffset 1s ease-out, stroke 0.3s ease',
              filter: `drop-shadow(0 0 4px ${strokeColor}60)`,
            }}
          />
        </svg>
        {/* Score text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn('font-bold tabular-nums', text, getHealthScoreColor(score))}>
            {score}
          </span>
        </div>
      </div>
      {showLabel && (
        <span className="text-[10px] text-surface-500 uppercase tracking-wider font-medium">
          Health
        </span>
      )}
    </div>
  );
}
