'use client';

import { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format, isValid, parseISO } from 'date-fns';
import { formatCurrency, formatPercent, generateChartColors } from '@/lib/utils';
import { useCurrencyStore, formatInCurrencyCompact, convertCurrency, type Currency } from '@/lib/currencyStore';

interface ChartPoint {
  date: string;
  spend: number;
  ctr: number;
  conversions: number;
}

interface SpendChartProps {
  data: ChartPoint[];
  isLoading?: boolean;
  title?: string;
  subtitle?: string;
}

interface PerformanceChartProps {
  data: Array<{ name: string; spend: number; conversions: number; ctr?: number }>;
  isLoading?: boolean;
  title?: string;
  subtitle?: string;
}

interface BreakdownPieChartProps {
  title: string;
  data: Array<{ dimension: string; spend: number; conversions?: number }>;
  isLoading?: boolean;
  valueKey?: 'spend' | 'conversions';
  hideHeader?: boolean;
}

const METRICS = [
  { key: 'spend',       label: 'Spend',       color: '#7c3aed', gradientId: 'gradSpend'  },
  { key: 'ctr',         label: 'CTR',         color: '#22d3ee', gradientId: 'gradCTR'    },
  { key: 'conversions', label: 'Conversions', color: '#f59e0b', gradientId: 'gradConv'   },
] as const;

function formatTooltipLabel(label: unknown) {
  if (typeof label !== 'string' || label.trim().length === 0) return 'Unknown';
  const parsed = parseISO(label);
  if (isValid(parsed)) return format(parsed, 'MMM d, yyyy');
  const fallback = new Date(label);
  if (isValid(fallback)) return format(fallback, 'MMM d, yyyy');
  return label;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/98 px-4 py-3 shadow-2xl backdrop-blur-sm min-w-[160px]">
      <p className="text-xs text-surface-400 mb-2.5 font-medium">{formatTooltipLabel(label)}</p>
      <div className="space-y-2">
        {payload.map((item: any) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-5 text-xs">
            <div className="flex items-center gap-2 text-surface-300">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              <span>{item.name}</span>
            </div>
            <span className="font-semibold text-white tabular-nums">
              {item.dataKey === 'spend'
                ? formatCurrency(Number(item.value) || 0)
                : item.dataKey === 'ctr'
                  ? formatPercent(Number(item.value) || 0)
                  : Number(item.value || 0).toFixed(0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export function SpendChart({
  data,
  isLoading,
  title = 'Performance Over Time',
  subtitle = 'Spend, CTR & conversions trend',
}: SpendChartProps) {
  // Subscribe so the chart re-renders when currency changes
  const { currency, accountCurrency } = useCurrencyStore();

  const [activeMetrics, setActiveMetrics] = useState<Set<string>>(
    new Set(['spend', 'ctr', 'conversions'])
  );

  const toggleMetric = (key: string) => {
    setActiveMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key); // keep at least one
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="card p-5">
        <div className="skeleton h-5 w-40 rounded mb-4" />
        <div className="skeleton h-72 rounded-lg" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="card p-5">
        <div className="mb-5">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="mt-0.5 text-xs text-surface-500">{subtitle}</p>
        </div>
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-surface-500">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <p className="text-sm">No time-series data yet</p>
          <p className="text-xs text-surface-600">Run campaigns for a few days to see trends</p>
        </div>
      </div>
    );
  }

  // Recharts needs ≥2 points to draw lines. When only 1 point (e.g. "Today"),
  // pad with a zeroed anchor point so the Area can render a line.
  const singlePoint = data.length === 1;
  const chartData = singlePoint
    ? [{ date: data[0].date, spend: 0, ctr: 0, conversions: 0 }, ...data]
    : data;

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="mt-0.5 text-xs text-surface-500">{subtitle}</p>
        </div>
        {/* Metric toggle pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {METRICS.map((m) => {
            const active = activeMetrics.has(m.key);
            return (
              <button
                key={m.key}
                onClick={() => toggleMetric(m.key)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-all ${
                  active
                    ? 'border-white/15 bg-white/8 text-white'
                    : 'border-white/5 bg-transparent text-surface-600 hover:text-surface-400'
                }`}
              >
                <div
                  className="h-2 w-2 rounded-full transition-opacity"
                  style={{ backgroundColor: m.color, opacity: active ? 1 : 0.3 }}
                />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {METRICS.map((m) => (
              <linearGradient key={m.gradientId} id={m.gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={m.color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={m.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />

          <XAxis
            dataKey="date"
            tickFormatter={(d) => {
              try { return format(new Date(d), 'MMM d'); } catch { return d; }
            }}
            tick={{ fill: '#5a6a8a', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="spend"
            tickFormatter={(v) => {
              const converted = convertCurrency(Number(v) || 0, accountCurrency, currency);
              return formatInCurrencyCompact(converted, currency);
            }}
            tick={{ fill: '#5a6a8a', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={72}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v) => Number(v || 0).toFixed(1)}
            tick={{ fill: '#5a6a8a', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={36}
          />

          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }} />

          {activeMetrics.has('spend') && (
            <Area
              yAxisId="spend"
              type="monotone"
              dataKey="spend"
              name="Spend"
              stroke="#7c3aed"
              strokeWidth={2.5}
              fill="url(#gradSpend)"
              dot={false}
              activeDot={{ r: 5, fill: '#7c3aed', stroke: '#090d18', strokeWidth: 2 }}
              animationDuration={900}
            />
          )}
          {activeMetrics.has('ctr') && (
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="ctr"
              name="CTR"
              stroke="#22d3ee"
              strokeWidth={2}
              fill="url(#gradCTR)"
              dot={false}
              activeDot={{ r: 4, fill: '#22d3ee', stroke: '#090d18', strokeWidth: 2 }}
              animationDuration={1000}
            />
          )}
          {activeMetrics.has('conversions') && (
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="conversions"
              name="Conversions"
              stroke="#f59e0b"
              strokeWidth={2}
              fill="url(#gradConv)"
              dot={false}
              activeDot={{ r: 4, fill: '#f59e0b', stroke: '#090d18', strokeWidth: 2 }}
              animationDuration={1100}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>

      {singlePoint && (
        <p className="mt-2 text-center text-[11px] text-surface-600">
          Only today's data — select a wider date range to see trend lines
        </p>
      )}
    </div>
  );
}

export function PerformanceChart({
  data,
  isLoading,
  title = 'Campaign Comparison',
  subtitle = 'Spend versus conversions across your strongest campaigns',
}: PerformanceChartProps) {
  if (isLoading) {
    return (
      <div className="card p-5">
        <div className="skeleton h-5 w-52 rounded mb-4" />
        <div className="skeleton h-64 rounded-lg" />
      </div>
    );
  }

  const trimmedData = data.slice(0, 8).map((d) => ({
    ...d,
    name: d.name.length > 18 ? `${d.name.slice(0, 18)}…` : d.name,
  }));

  return (
    <div className="card p-5">
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="text-xs text-surface-500 mt-0.5">{subtitle}</p>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={trimmedData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={10}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: '#6374a0', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis tick={{ fill: '#6374a0', fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
          <Bar dataKey="spend" fill="#5b8cff" radius={[10, 10, 0, 0]} name="Spend" animationDuration={900} />
          <Bar dataKey="conversions" fill="#3dd9b8" radius={[10, 10, 0, 0]} name="Conversions" animationDuration={1100} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BreakdownPieChart({
  title,
  data,
  isLoading,
  valueKey = 'spend',
  hideHeader = false,
}: BreakdownPieChartProps) {
  if (isLoading) {
    return (
      <div className="card p-5">
        <div className="skeleton h-5 w-32 rounded mb-4" />
        <div className="skeleton h-56 rounded-lg" />
      </div>
    );
  }

  const filtered = data.filter((item) => Number(item[valueKey] || 0) > 0).slice(0, 6);
  const colors = generateChartColors(filtered.length || 1);

  return (
    <div className="card p-5">
      {!hideHeader && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="text-xs text-surface-500 mt-0.5">
            {valueKey === 'spend' ? 'Spend share by segment' : 'Conversions share by segment'}
          </p>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="flex h-[240px] items-center justify-center text-sm text-surface-500">
          No breakdown data available
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
              <Pie
                data={filtered}
                dataKey={valueKey}
                nameKey="dimension"
                innerRadius={55}
                outerRadius={84}
                paddingAngle={3}
                animationDuration={900}
              >
                {filtered.map((entry, index) => (
                  <Cell key={`${entry.dimension}-${index}`} fill={colors[index]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          <div className="space-y-2">
            {filtered.map((item, index) => (
              <div key={item.dimension} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index] }} />
                  <span className="capitalize text-surface-300">{item.dimension}</span>
                </div>
                <span className="font-medium text-white">
                  {valueKey === 'spend'
                    ? formatCurrency(Number(item.spend) || 0)
                    : Number(item.conversions || 0).toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
