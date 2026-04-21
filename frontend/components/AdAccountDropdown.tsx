'use client';

import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AdAccount {
  id: string;
  name: string;
}

interface AdAccountDropdownProps {
  accounts: AdAccount[];
  selectedId: string | null;
  onSelect: (account: AdAccount) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isLoading?: boolean;
}

export function AdAccountDropdown({
  accounts,
  selectedId,
  onSelect,
  isOpen,
  onOpenChange,
  isLoading = false,
}: AdAccountDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedAccount = accounts.find((acc) => acc.id === selectedId) || accounts[0] || null;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onOpenChange(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onOpenChange]);

  if (isLoading) {
    return (
      <div className="px-4 py-3 border-b border-white/5">
        <p className="text-[10px] font-medium text-surface-500 uppercase tracking-wider mb-2">Ad Account</p>
        <div className="rounded-xl border border-white/10 bg-[#0B1220] px-3 py-3">
          <div className="skeleton h-3 w-28 rounded mb-2" />
          <div className="skeleton h-2.5 w-20 rounded" />
        </div>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="px-4 py-3 border-b border-white/5">
        <p className="text-[10px] font-medium text-surface-500 uppercase tracking-wider mb-2">Ad Account</p>
        <p className="text-xs text-surface-600 p-2 bg-surface-900 rounded-lg text-center">
          Connect Meta to access accounts
        </p>
      </div>
    );
  }

  return (
    <div ref={dropdownRef} className="relative px-4 py-3 border-b border-white/5">
      <p className="text-[10px] font-medium text-surface-500 uppercase tracking-wider mb-2">Ad Account</p>

      {/* Toggle Button */}
      <button
        onClick={() => onOpenChange(!isOpen)}
        className={cn(
          'w-full flex items-center justify-between gap-3 px-3 py-3 rounded-xl transition-all duration-200',
          'bg-[#0B1220] border border-white/10 hover:border-white/20',
          'text-white hover:bg-white/10',
          isOpen && 'border-brand-500/30 bg-white/10'
        )}
      >
        <div className="flex-1 min-w-0 text-left">
          {selectedAccount ? (
            <>
              <p className="text-xs font-semibold text-white truncate">{selectedAccount.name}</p>
              <p className="text-[10px] text-surface-500 truncate">{selectedAccount.id}</p>
            </>
          ) : (
            <p className="text-xs text-surface-500">Select Account</p>
          )}
        </div>
        <ChevronDown
          size={14}
          className={cn('shrink-0 transition-transform duration-200', isOpen && 'rotate-180')}
        />
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute left-4 right-4 top-[calc(100%+8px)] bg-[#0B1220] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden"
          >
            <div className="max-h-48 overflow-y-auto">
              {accounts.map((account, index) => (
                <motion.button
                  key={account.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03 }}
                  onClick={() => {
                    onSelect(account);
                    onOpenChange(false);
                  }}
                  className={cn(
                    'w-full flex items-center justify-between gap-3 px-3 py-3 text-left transition-colors duration-200 border-b border-white/5 last:border-b-0',
                    selectedId === account.id
                      ? 'bg-brand-500/20 hover:bg-brand-500/25 text-brand-300'
                      : 'text-surface-300 hover:bg-white/10'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{account.name}</p>
                    <p className="text-[10px] text-surface-500 truncate">{account.id}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {selectedId === account.id && (
                      <span className="inline-flex items-center rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-medium text-green-400">
                        Active
                      </span>
                    )}
                    {selectedId === account.id && (
                      <Check size={14} className="shrink-0 text-brand-400" />
                    )}
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
