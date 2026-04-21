'use client';

import { ChevronDown } from 'lucide-react';

export type BreakdownOption =
  | 'none'
  | 'age'
  | 'gender'
  | 'country'
  | 'platform'
  | 'placement';

const BREAKDOWN_OPTIONS: { value: BreakdownOption; label: string }[] = [
  { value: 'none', label: 'No Breakdown' },
  { value: 'age', label: 'Age' },
  { value: 'gender', label: 'Gender' },
  { value: 'country', label: 'Country' },
  { value: 'platform', label: 'Platform' },
  { value: 'placement', label: 'Placement / Device' },
];

interface Props {
  value: BreakdownOption;
  onChange: (v: BreakdownOption) => void;
}

export default function BreakdownSelector({ value, onChange }: Props) {
  return (
    <div className="relative inline-flex items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as BreakdownOption)}
        className="
          appearance-none bg-white/5 border border-white/10 rounded-lg
          text-sm text-white/80 pl-3 pr-8 py-2
          focus:outline-none focus:ring-2 focus:ring-violet-500/60
          hover:bg-white/10 transition-colors cursor-pointer
        "
      >
        {BREAKDOWN_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-gray-900 text-white">
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 w-3.5 h-3.5 text-white/40 pointer-events-none" />
    </div>
  );
}
