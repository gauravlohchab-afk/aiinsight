'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore, type AdAccountOption } from '@/lib/store';
import { useCurrencyStore } from '@/lib/currencyStore';

type AdAccountContextValue = {
  accounts: AdAccountOption[];
  selectedAccount: AdAccountOption | null;
  /** Native currency of the selected Meta ad account (e.g. 'INR', 'USD', 'PHP') */
  accountCurrency: string;
  loading: boolean;
  fetchAccounts: () => Promise<void>;
  setSelectedAccount: (account: AdAccountOption) => void;
};

const AdAccountContext = createContext<AdAccountContextValue | null>(null);

const QUERY_KEYS_TO_INVALIDATE = [
  ['analytics-overview'],
  ['spend-over-time'],
  ['performance-breakdown'],
  ['dashboard-live-campaigns'],
  ['campaigns'],
  ['anomalies'],
  ['health-distribution'],
  ['creative-fatigue'],
  ['ai-history'],
];

export function AdAccountProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { user, isAuthenticated, selectedAdAccount, setSelectedAdAccount } = useAuthStore();
  const { setAccountCurrency } = useCurrencyStore();
  const [accounts, setAccounts] = useState<AdAccountOption[]>([]);
  const [selectedAccount, setSelectedAccountState] = useState<AdAccountOption | null>(null);
  const [loading, setLoading] = useState(true);

  const fallbackAccounts = useMemo(
    () =>
      (user?.metaAuth?.adAccounts || []).map((account) => ({
        id: account.id,
        name: account.name || account.id,
      })),
    [user]
  );

  const fetchAccounts = useCallback(async () => {
    if (!isAuthenticated) {
      setAccounts([]);
      setSelectedAccountState(null);
      setLoading(false);
      console.log('Accounts:', []);
      console.log('Selected:', null);
      return;
    }

    setLoading(true);

    try {
      const response = await api.meta.accounts();
      const nextAccounts = ((response.data?.data || []) as AdAccountOption[]).map((account) => ({
        id: account.id,
        name: account.name || account.id,
        currency: account.currency || 'USD',
      }));

      const resolvedAccounts = nextAccounts.length > 0 ? nextAccounts : fallbackAccounts;
      setAccounts(resolvedAccounts);
      console.log('Accounts:', resolvedAccounts);
    } catch (error) {
      setAccounts(fallbackAccounts);
      console.log('Accounts:', fallbackAccounts);
      console.error('❌ [AdAccount] Failed to fetch accounts, using fallback', error);
    } finally {
      setLoading(false);
    }
  }, [fallbackAccounts, isAuthenticated]);

  const setSelectedAccount = useCallback(
    (account: AdAccountOption) => {
      localStorage.setItem('ad_account', JSON.stringify(account));
      localStorage.setItem('selectedAdAccount', account.id);
      setSelectedAdAccount(account.id);
      setSelectedAccountState(account);
      setAccountCurrency(account.currency || 'USD');

      QUERY_KEYS_TO_INVALIDATE.forEach((queryKey) => {
        void queryClient.invalidateQueries({ queryKey });
      });

      console.log('Selected:', account);
    },
    [queryClient, setSelectedAdAccount, setAccountCurrency]
  );

  useEffect(() => {
    void fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    const savedAccount = typeof window !== 'undefined' ? localStorage.getItem('ad_account') : null;
    if (savedAccount) {
      try {
        const parsed = JSON.parse(savedAccount) as AdAccountOption;
        const resolvedSavedAccount = accounts.find((account) => account.id === parsed?.id);
        if (resolvedSavedAccount) {
          setSelectedAccountState(resolvedSavedAccount);
          setAccountCurrency(resolvedSavedAccount.currency || 'USD');
          localStorage.setItem('ad_account', JSON.stringify(resolvedSavedAccount));
          if (resolvedSavedAccount.id !== selectedAdAccount) {
            setSelectedAdAccount(resolvedSavedAccount.id);
          }
          console.log('Selected:', resolvedSavedAccount);
          return;
        }

        if (parsed?.id && accounts.length === 0) {
          setSelectedAccountState(parsed);
          if (parsed.id !== selectedAdAccount) {
            setSelectedAdAccount(parsed.id);
          }
          console.log('Selected:', parsed);
          return;
        }
      } catch {
        // Ignore malformed storage and fall back to server data.
      }
    }

    if (accounts.length > 0) {
      const nextSelected =
        accounts.find((account) => account.id === selectedAdAccount) ||
        accounts[0];

      if (nextSelected) {
        setSelectedAccountState(nextSelected);
        setAccountCurrency(nextSelected.currency || 'USD');
        localStorage.setItem('ad_account', JSON.stringify(nextSelected));
        localStorage.setItem('selectedAdAccount', nextSelected.id);
        if (nextSelected.id !== selectedAdAccount) {
          setSelectedAdAccount(nextSelected.id);
        }
        console.log('Selected:', nextSelected);
      }
    } else {
      setSelectedAccountState(null);
      console.log('Selected:', null);
    }
  }, [accounts, selectedAdAccount, setSelectedAdAccount]);

  const value = useMemo(
    () => ({
      accounts,
      selectedAccount,
      accountCurrency: selectedAccount?.currency || 'USD',
      loading,
      fetchAccounts,
      setSelectedAccount,
    }),
    [accounts, fetchAccounts, loading, selectedAccount, setSelectedAccount]
  );

  return <AdAccountContext.Provider value={value}>{children}</AdAccountContext.Provider>;
}

export function useAdAccount() {
  const context = useContext(AdAccountContext);

  if (!context) {
    throw new Error('useAdAccount must be used within AdAccountProvider');
  }

  return context;
}