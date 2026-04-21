'use client';

import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, Check } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import {
  useDateStore,
  DATE_PRESETS,
  getDateRangeLabel,
  DatePreset,
} from '@/lib/dateStore';
import { useAuthStore } from '@/lib/store';

export function GlobalDateFilter() {
  const { range, setPreset, setCustomRange } = useDateStore();
  const { selectedAdAccount } = useAuthStore();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [customSince, setCustomSince] = useState('');
  const [customUntil, setCustomUntil] = useState('');
  const [pendingPreset, setPendingPreset] = useState<DatePreset | null>(
    range.preset
  );
  const [isCustom, setIsCustom] = useState(!range.preset);

  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Sync custom fields from store when opened
  useEffect(() => {
    if (open) {
      setPendingPreset(range.preset);
      setIsCustom(!range.preset);
      setCustomSince(range.since ?? '');
      setCustomUntil(range.until ?? '');
    }
  }, [open]);

  function invalidateAll() {
    void queryClient.invalidateQueries({ queryKey: ['analytics-overview', selectedAdAccount] });
    void queryClient.invalidateQueries({ queryKey: ['spend-over-time', selectedAdAccount] });
    void queryClient.invalidateQueries({ queryKey: ['performance-breakdown', selectedAdAccount] });
    void queryClient.invalidateQueries({ queryKey: ['analytics-breakdowns', selectedAdAccount] });
    void queryClient.invalidateQueries({ queryKey: ['campaigns', selectedAdAccount] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard-live-campaigns', selectedAdAccount] });
  }

  function handleApply() {
    if (isCustom) {
      if (customSince && customUntil) {
        setCustomRange(customSince, customUntil);
        invalidateAll();
        setOpen(false);
      }
    } else if (pendingPreset) {
      setPreset(pendingPreset);
      invalidateAll();
      setOpen(false);
    }
  }

  const label = getDateRangeLabel(range);

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all',
          open
            ? 'bg-surface-800 border-brand-500/40 text-white'
            : 'bg-surface-900 border-white/10 text-surface-300 hover:text-white hover:border-white/20'
        )}
      >
        <Calendar size={13} className="text-brand-400 shrink-0" />
        <span>{label}</span>
        <ChevronDown
          size={12}
          className={cn('text-surface-500 transition-transform', open && 'rotate-180')}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-[480px] bg-surface-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex">
            {/* Preset list */}
            <div className="w-44 shrink-0 border-r border-white/5 p-2">
              <p className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider px-2 py-1 mb-1">
                Presets
              </p>
              {DATE_PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => {
                    setPendingPreset(p.value);
                    setIsCustom(false);
                  }}
                  className={cn(
                    'w-full text-left text-xs px-3 py-2 rounded-lg flex items-center justify-between transition-colors',
                    !isCustom && pendingPreset === p.value
                      ? 'bg-brand-500/15 text-brand-300'
                      : 'text-surface-300 hover:text-white hover:bg-surface-800'
                  )}
                >
                  {p.label}
                  {!isCustom && pendingPreset === p.value && (
                    <Check size={12} className="text-brand-400" />
                  )}
                </button>
              ))}
              <button
                onClick={() => {
                  setIsCustom(true);
                  setPendingPreset(null);
                }}
                className={cn(
                  'w-full text-left text-xs px-3 py-2 rounded-lg flex items-center justify-between transition-colors mt-1 border-t border-white/5 pt-2',
                  isCustom
                    ? 'bg-brand-500/15 text-brand-300'
                    : 'text-surface-300 hover:text-white hover:bg-surface-800'
                )}
              >
                Custom range
                {isCustom && <Check size={12} className="text-brand-400" />}
              </button>
            </div>

            {/* Right panel */}
            <div className="flex-1 p-4 flex flex-col gap-4">
              {!isCustom ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mb-3">
                    <Calendar size={20} className="text-brand-400" />
                  </div>
                  <p className="text-sm font-semibold text-white mb-1">
                    {DATE_PRESETS.find((p) => p.value === pendingPreset)?.label ?? 'Select a preset'}
                  </p>
                  <p className="text-xs text-surface-500">
                    Click Apply to update all data
                  </p>
                </div>
              ) : (
                <div className="flex-1 space-y-4">
                  <div>
                    <label className="text-xs font-medium text-surface-400 mb-1.5 block">
                      Start date
                    </label>
                    <input
                      type="date"
                      value={customSince}
                      onChange={(e) => setCustomSince(e.target.value)}
                      className="input text-xs w-full"
                      max={customUntil || undefined}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-surface-400 mb-1.5 block">
                      End date
                    </label>
                    <input
                      type="date"
                      value={customUntil}
                      onChange={(e) => setCustomUntil(e.target.value)}
                      className="input text-xs w-full"
                      min={customSince || undefined}
                    />
                  </div>
                  {customSince && customUntil && (
                    <p className="text-xs text-surface-500">
                      {customSince} → {customUntil}
                    </p>
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-white/5">
                <p className="text-xs text-surface-500">
                  Currently: <span className="text-surface-300">{label}</span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setOpen(false)}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApply}
                    disabled={
                      isCustom
                        ? !customSince || !customUntil
                        : !pendingPreset
                    }
                    className="btn-primary text-xs py-1.5 px-4 disabled:opacity-40"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
