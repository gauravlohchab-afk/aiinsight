'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard, BarChart2, Brain, Settings, LogOut,
  Zap, RefreshCw, Bell, Target, Menu, X
} from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { AdAccountDropdown } from '@/components/AdAccountDropdown';
import { useAdAccount } from '@/context/AdAccountContext';
import { GlobalDateFilter } from '@/components/GlobalDateFilter';
import { CurrencySwitcher } from '@/components/CurrencySwitcher';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/campaigns', label: 'Campaigns', icon: Target },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/ai-insights', label: 'AI Insights', icon: Brain, badge: 'AI' },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function NavItem({
  href, label, icon: Icon, badge,
}: { href: string; label: string; icon: any; badge?: string }) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));

  return (
    <Link href={href}>
      <div
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group relative',
          isActive
            ? 'bg-brand-500/15 text-brand-300 border border-brand-500/20'
            : 'text-surface-400 hover:text-white hover:bg-surface-800'
        )}
      >
        {isActive && (
          <motion.div
            layoutId="nav-indicator"
            className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-brand-400 rounded-full"
          />
        )}
        <Icon size={16} className={isActive ? 'text-brand-400' : 'text-surface-500 group-hover:text-surface-300'} />
        <span className="flex-1">{label}</span>
        {badge && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-400 border border-brand-500/20">
            {badge}
          </span>
        )}
      </div>
    </Link>
  );
}

function SidebarContent({
  user,
  accounts,
  selectedAccount,
  setSelectedAccount,
  loading,
  accountDropdownOpen,
  setAccountDropdownOpen,
  logout,
}: {
  user: any;
  accounts: any[];
  selectedAccount: any;
  setSelectedAccount: (account: any) => void;
  loading: boolean;
  accountDropdownOpen: boolean;
  setAccountDropdownOpen: (open: boolean) => void;
  logout: () => void;
}) {
  return (
    <>
      <div className="px-5 py-4 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center">
            <Zap size={14} className="text-white" />
          </div>
          <span className="font-bold text-base">AdInsight</span>
          <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20">
            BETA
          </span>
        </div>
      </div>

      <AdAccountDropdown
        accounts={accounts}
        selectedId={selectedAccount?.id || null}
        onSelect={setSelectedAccount}
        isOpen={accountDropdownOpen}
        onOpenChange={setAccountDropdownOpen}
        isLoading={loading}
      />

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-white/5 space-y-0.5">
        <button className="btn-ghost w-full justify-start text-xs gap-2 py-2">
          <RefreshCw size={13} />
          Sync data
        </button>
        <button className="btn-ghost w-full justify-start text-xs gap-2 py-2">
          <Bell size={13} />
          Notifications
          <span className="ml-auto w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center">3</span>
        </button>
      </div>

      <div className="p-3 border-t border-white/5">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-surface-800 transition-colors cursor-pointer group">
          <div className="w-7 h-7 rounded-full bg-gradient-brand flex items-center justify-center text-white text-xs font-bold shrink-0">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate">{user.name}</p>
            <p className="text-[11px] text-surface-500 truncate">{user.email}</p>
          </div>
          <button
            onClick={logout}
            className="opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-400 text-surface-500"
            title="Sign out"
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isInitialized, logout } = useAuthStore();
  const { accounts, selectedAccount, setSelectedAccount, loading } = useAdAccount();
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isInitialized]);

  useEffect(() => {
    setMobileNavOpen(false);
    setAccountDropdownOpen(false);
  }, [pathname]);

  if (!isInitialized || !isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-surface-1000 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin w-8 h-8 text-brand-500" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30 60" />
          </svg>
          <span className="text-surface-400 text-sm">Loading AdInsight…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-1000 grid-bg flex">
      <AnimatePresence>
        {mobileNavOpen && (
          <>
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileNavOpen(false)}
              className="fixed inset-0 z-40 bg-surface-1000/70 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.2 }}
              className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-white/5 bg-surface-950 lg:hidden"
            >
              <div className="absolute right-3 top-3 z-10">
                <button
                  onClick={() => setMobileNavOpen(false)}
                  className="rounded-lg border border-white/10 bg-surface-900 p-2 text-surface-300"
                  aria-label="Close navigation"
                >
                  <X size={16} />
                </button>
              </div>
              <SidebarContent
                user={user}
                accounts={accounts}
                selectedAccount={selectedAccount}
                setSelectedAccount={setSelectedAccount}
                loading={loading}
                accountDropdownOpen={accountDropdownOpen}
                setAccountDropdownOpen={setAccountDropdownOpen}
                logout={logout}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <aside className="hidden w-60 shrink-0 border-r border-white/5 bg-surface-950 lg:flex lg:h-screen lg:sticky lg:top-0 lg:flex-col">
        <SidebarContent
          user={user}
          accounts={accounts}
          selectedAccount={selectedAccount}
          setSelectedAccount={setSelectedAccount}
          loading={loading}
          accountDropdownOpen={accountDropdownOpen}
          setAccountDropdownOpen={setAccountDropdownOpen}
          logout={logout}
        />
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-hidden">
        {/* Top bar with date filter */}
        <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-surface-1000/80 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3 lg:hidden">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="rounded-lg border border-white/10 bg-surface-900 p-2 text-surface-200"
              aria-label="Open navigation"
            >
              <Menu size={16} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{selectedAccount?.name || 'AdInsight'}</p>
              <p className="truncate text-[11px] text-surface-500">{selectedAccount?.id || 'Dashboard'}</p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <CurrencySwitcher />
            <GlobalDateFilter />
          </div>
        </div>
        <div className="page-enter">{children}</div>
      </main>
    </div>
  );
}
