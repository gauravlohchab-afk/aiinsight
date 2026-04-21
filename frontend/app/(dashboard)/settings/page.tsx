'use client';

import { useState } from 'react';
import { useAuthStore } from '@/lib/store';
import { api } from '@/lib/api';
import { useAdAccount } from '@/context/AdAccountContext';
import { motion } from 'framer-motion';
import { Zap, CheckCircle2, User, Bell, Palette, Shield, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const { user, fetchMe } = useAuthStore();
  const { accounts, selectedAccount, setSelectedAccount, loading, fetchAccounts } = useAdAccount();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [name, setName] = useState(user?.name || '');

  const isConnected = !!user?.metaAuth?.adAccountIds?.length;
  const adAccountCount = accounts.length || user?.metaAuth?.adAccountIds?.length || 0;

  const handleMetaConnect = async () => {
    setConnecting(true);
    try {
      const { data } = await api.auth.metaConnect();
      window.location.href = data.data.url;
    } catch {
      toast.error('Failed to initiate Meta connection');
      setConnecting(false);
    }
  };

  const handleMetaDisconnect = async () => {
    if (!confirm('Disconnect Meta Ads? This will stop data syncing.')) return;
    setDisconnecting(true);
    try {
      await api.auth.metaDisconnect();
      await fetchMe();
      await fetchAccounts();
      toast.success('Meta Ads disconnected');
    } catch {
      toast.error('Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await api.auth.updateProfile({ name });
      await fetchMe();
      toast.success('Profile updated');
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const sections = [
    { id: 'integrations', label: 'Integrations', icon: Zap },
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'security', label: 'Security', icon: Shield },
  ];

  const [activeSection, setActiveSection] = useState('integrations');

  return (
    <div className="max-w-[1000px] p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Settings</h1>
        <p className="text-surface-400 text-sm mt-0.5">Manage your account, integrations, and preferences</p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Sidebar */}
        <div className="shrink-0 lg:w-48">
          <nav className="flex gap-2 overflow-x-auto lg:block lg:space-y-0.5">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={cn(
                  'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-all lg:w-full',
                  activeSection === s.id
                    ? 'bg-surface-800 text-white font-medium'
                    : 'text-surface-400 hover:text-white hover:bg-surface-900'
                )}
              >
                <s.icon size={14} />
                {s.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-4">
          {activeSection === 'integrations' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="card p-4 sm:p-5">
                <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#1877F2]/10 border border-[#1877F2]/20 flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-[#1877F2]">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">Meta Ads</h3>
                      <p className="text-xs text-surface-500 mt-0.5">
                        Connect your Facebook & Instagram ad accounts
                      </p>
                    </div>
                  </div>
                  {isConnected ? (
                    <span className="badge bg-green-500/10 text-green-400 border border-green-500/20 text-xs">
                      <CheckCircle2 size={10} />
                      Connected
                    </span>
                  ) : (
                    <span className="badge bg-surface-800 text-surface-500 text-xs">
                      Not Connected
                    </span>
                  )}
                </div>

                {isConnected ? (
                  <div className="space-y-3">
                    <div className="bg-surface-950 rounded-xl p-4 border border-white/5">
                      <div className="grid grid-cols-1 gap-4 text-center sm:grid-cols-3">
                        <div>
                          <p className="text-xl font-bold text-white">{adAccountCount}</p>
                          <p className="text-xs text-surface-500 mt-0.5">Ad Accounts</p>
                        </div>
                        <div>
                          <p className="text-xl font-bold text-white">
                            {user?.metaAuth?.tokenExpiresAt
                              ? Math.max(0, Math.round((new Date(user.metaAuth.tokenExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                              : 0}d
                          </p>
                          <p className="text-xs text-surface-500 mt-0.5">Token Valid</p>
                        </div>
                        <div>
                          <p className="text-xl font-bold text-accent-green">Active</p>
                          <p className="text-xs text-surface-500 mt-0.5">Sync Status</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {loading && adAccountCount === 0 && (
                        <div className="space-y-2">
                          {Array.from({ length: 2 }).map((_, index) => (
                            <div key={index} className="rounded-xl border border-white/5 bg-surface-950 px-4 py-3">
                              <div className="skeleton h-4 w-40 rounded mb-2" />
                              <div className="skeleton h-3 w-28 rounded" />
                            </div>
                          ))}
                        </div>
                      )}
                      {(accounts.length > 0 ? accounts : (user?.metaAuth?.adAccounts || [])).map((account) => {
                        const isActiveAccount = selectedAccount?.id === account.id;

                        return (
                          <div
                            key={account.id}
                            className={cn(
                              'flex items-center justify-between gap-3 rounded-xl px-4 py-3 border transition-colors duration-200',
                              isActiveAccount
                                ? 'bg-green-500/10 border-green-500/20'
                                : 'bg-surface-950 border-white/5 hover:bg-surface-900'
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={cn(
                                'w-2.5 h-2.5 rounded-full shrink-0',
                                isActiveAccount ? 'bg-green-400' : 'bg-surface-600'
                              )} />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-white truncate">{account.name || account.id}</p>
                                <p className="text-[11px] text-surface-500 font-mono truncate">{account.id}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {isActiveAccount && (
                                <span className="badge bg-green-500/10 text-green-400 border border-green-500/20 text-[10px]">
                                  Active
                                </span>
                              )}
                              <button
                                onClick={() => {
                                  setSelectedAccount({ id: account.id, name: account.name || account.id });
                                  toast.success(`Switched to ${account.name || account.id}`);
                                }}
                                disabled={isActiveAccount}
                                className={cn(
                                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200',
                                  isActiveAccount
                                    ? 'bg-white/5 text-surface-500 cursor-default'
                                    : 'bg-brand-500/15 text-brand-300 hover:bg-brand-500/25'
                                )}
                              >
                                {isActiveAccount ? 'Selected' : 'Select Account'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {!loading && adAccountCount === 0 && (
                        <div className="rounded-xl border border-white/5 bg-surface-950 px-4 py-6 text-center text-sm text-surface-500">
                          Connect Meta Ads to load your ad accounts.
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                      <button onClick={handleMetaConnect} disabled={connecting} className="btn-secondary text-xs">
                        <ExternalLink size={12} />
                        Reconnect / Add Account
                      </button>
                      <button
                        onClick={handleMetaDisconnect}
                        disabled={disconnecting}
                        className="btn-ghost text-xs text-red-400 hover:bg-red-500/10"
                      >
                        {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-surface-400 mb-4">
                      Connect your Meta Ads account to enable campaign syncing, analytics, and AI-powered insights.
                    </p>
                    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {['Campaign sync', 'Performance analytics', 'Anomaly detection', 'AI optimization'].map((f) => (
                        <div key={f} className="flex items-center gap-2 text-xs text-surface-400">
                          <CheckCircle2 size={11} className="text-brand-400" />
                          {f}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={handleMetaConnect}
                      disabled={connecting}
                      className="btn-primary gap-2"
                    >
                      {connecting ? (
                        <>
                          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30 60" />
                          </svg>
                          Redirecting to Meta…
                        </>
                      ) : (
                        <>
                          <Zap size={14} />
                          Connect Meta Ads
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeSection === 'profile' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Profile Information</h3>
                <div className="space-y-4">
                  <div>
                    <label className="label">Full Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Email Address</label>
                    <input
                      type="email"
                      value={user?.email || ''}
                      disabled
                      className="input opacity-50 cursor-not-allowed"
                    />
                    <p className="text-xs text-surface-600 mt-1.5">Email cannot be changed</p>
                  </div>
                  <div>
                    <label className="label">Subscription Plan</label>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="badge bg-brand-500/15 text-brand-300 border border-brand-500/20 text-xs capitalize">
                        {user?.subscription?.plan} plan
                      </span>
                      <span className="badge bg-surface-800 text-surface-400 text-xs capitalize">
                        {user?.subscription?.status}
                      </span>
                    </div>
                  </div>
                  <button onClick={handleSaveProfile} disabled={savingProfile} className="btn-primary text-sm">
                    {savingProfile ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {(activeSection === 'notifications' || activeSection === 'appearance' || activeSection === 'security') && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="card p-12 text-center">
                <div className="w-10 h-10 rounded-xl bg-surface-800 flex items-center justify-center mx-auto mb-3">
                  {activeSection === 'notifications' ? <Bell size={18} className="text-surface-400" /> :
                   activeSection === 'appearance' ? <Palette size={18} className="text-surface-400" /> :
                   <Shield size={18} className="text-surface-400" />}
                </div>
                <p className="text-surface-300 font-medium text-sm">Coming Soon</p>
                <p className="text-surface-600 text-xs mt-1">
                  {activeSection.charAt(0).toUpperCase() + activeSection.slice(1)} settings are coming in the next release.
                </p>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
