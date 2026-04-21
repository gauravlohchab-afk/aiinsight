import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/api';

export interface AdAccountOption {
  id: string;
  name: string;
  currency?: string; // native currency of the Meta ad account (e.g. 'INR', 'PHP', 'USD')
}

interface User {
  _id: string;
  email: string;
  name: string;
  avatar?: string;
  role: string;
  metaAuth?: {
    userId: string;
    adAccountIds: string[];
    adAccounts?: AdAccountOption[];
    tokenExpiresAt: string;
  };
  subscription: {
    plan: string;
    status: string;
  };
  preferences: {
    theme: 'dark' | 'light';
    defaultDateRange: string;
  };
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  isLoading: boolean;
  selectedAdAccount: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  initialize: () => void;
  setSelectedAdAccount: (id: string) => void;
  updatePreferences: (prefs: Partial<User['preferences']>) => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isInitialized: false,
      isLoading: false,
      selectedAdAccount: null,

      // ✅ LOGIN - Extract and store tokens from response
      login: async (email, password) => {
        set({ isLoading: true });

        try {
          console.log('🔐 [Auth] Attempting login for:', email);
          
          const loginResponse = await api.auth.login({ email, password });
          const { accessToken, refreshToken, user } = loginResponse.data.data;

          console.log('📦 [Auth] Login response received');
          console.log(`TOKEN SENT: ${accessToken ? 'YES ✅' : 'NO ❌'}`);
          console.log(`REFRESH TOKEN SENT: ${refreshToken ? 'YES ✅' : 'NO ❌'}`);
          
          // ✅ CRITICAL: Store tokens in localStorage for axios interceptor
          localStorage.setItem('token', accessToken);
          localStorage.setItem('refreshToken', refreshToken);
          console.log('💾 [Auth] Tokens stored in localStorage');

          const defaultAccount = user.metaAuth?.adAccounts?.[0]?.id || user.metaAuth?.adAccountIds?.[0] || null;

          if (defaultAccount) {
            const accountDetails = user.metaAuth?.adAccounts?.find((account) => account.id === defaultAccount);
            localStorage.setItem('selectedAdAccount', defaultAccount);
            if (accountDetails) {
              localStorage.setItem('ad_account', JSON.stringify(accountDetails));
            }
          }

          set({
            user,
            accessToken,
            refreshToken,
            isAuthenticated: true,
            selectedAdAccount: defaultAccount,
          });

          console.log('✅ [Auth] Login successful:', {
            userId: user._id,
            email: user.email,
          });

        } catch (err: any) {
          console.error("❌ [Auth] Login failed:", {
            status: err?.response?.status,
            message: err?.response?.data?.message || err.message,
          });
          throw err;
        } finally {
          set({ isLoading: false });
        }
      },

      // ✅ REGISTER - Extract and store tokens from response
      register: async (email, password, name) => {
        set({ isLoading: true });

        try {
          console.log('🔐 [Auth] Attempting registration for:', email);
          
          const registerResponse = await api.auth.register({ email, password, name });
          const { accessToken, refreshToken, user } = registerResponse.data.data;

          console.log('📦 [Auth] Register response received');
          console.log(`TOKEN SENT: ${accessToken ? 'YES ✅' : 'NO ❌'}`);
          console.log(`REFRESH TOKEN SENT: ${refreshToken ? 'YES ✅' : 'NO ❌'}`);
          
          // ✅ CRITICAL: Store tokens in localStorage for axios interceptor
          localStorage.setItem('token', accessToken);
          localStorage.setItem('refreshToken', refreshToken);
          console.log('💾 [Auth] Tokens stored in localStorage');

          const defaultAccount = user.metaAuth?.adAccounts?.[0]?.id || user.metaAuth?.adAccountIds?.[0] || null;

          if (defaultAccount) {
            const accountDetails = user.metaAuth?.adAccounts?.find((account) => account.id === defaultAccount);
            localStorage.setItem('selectedAdAccount', defaultAccount);
            if (accountDetails) {
              localStorage.setItem('ad_account', JSON.stringify(accountDetails));
            }
          }

          set({
            user,
            accessToken,
            refreshToken,
            isAuthenticated: true,
            selectedAdAccount: defaultAccount,
          });

          console.log('✅ [Auth] Registration successful:', {
            userId: user._id,
            email: user.email,
          });

        } catch (err: any) {
          console.error("❌ [Auth] Registration failed:", {
            status: err?.response?.status,
            message: err?.response?.data?.message || err.message,
          });
          throw err;
        } finally {
          set({ isLoading: false });
        }
      },

      // ✅ LOGOUT - Clear tokens from both localStorage and state
      logout: () => {
        console.log('🔓 [Auth] Logging out user...');
        // Remove tokens from localStorage
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('selectedAdAccount');
        localStorage.removeItem('ad_account');
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          selectedAdAccount: null,
        });
      },

      // ✅ FETCH USER - Uses Authorization header with token from localStorage
      fetchMe: async () => {
        try {
          console.log('🔐 [Auth] Attempting to fetch user from /auth/me...');
          const token = localStorage.getItem('token');
          console.log(`🔑 [Auth] Token in localStorage: ${token ? 'YES ✅' : 'NO ❌'}`);
          
          const { data } = await api.auth.me();
          const user = data.data;

          console.log('✅ [Auth] User fetched successfully:', {
            userId: user._id,
            email: user.email,
            name: user.name,
            hasMetaAuth: !!user.metaAuth,
          });

          const defaultAccount =
            get().selectedAdAccount ||
            user.metaAuth?.adAccounts?.[0]?.id ||
            user.metaAuth?.adAccountIds?.[0] ||
            null;

          if (defaultAccount) {
            const accountDetails = user.metaAuth?.adAccounts?.find((account) => account.id === defaultAccount);
            localStorage.setItem('selectedAdAccount', defaultAccount);
            if (accountDetails) {
              localStorage.setItem('ad_account', JSON.stringify(accountDetails));
            }
          }

          set({
            user,
            isAuthenticated: true,
            isInitialized: true,
            selectedAdAccount: defaultAccount,
          });

        } catch (err: any) {
          console.error('❌ [Auth] FetchMe failed:', {
            status: err?.response?.status,
            message: err?.message,
            error: err?.response?.data,
          });
          
          // Only logout if it's a real auth failure (401 after token was attempted)
          if (err?.response?.status === 401 || err?.response?.status === 403) {
            console.log('🔓 [Auth] Token invalid or expired, logging out...');
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
            set({
              user: null,
              accessToken: null,
              refreshToken: null,
              isAuthenticated: false,
              isInitialized: true,
            });
          } else {
            // Non-auth error (network, 5xx) — keep existing auth state, just mark initialized
            set({ isInitialized: true });
          }
        }
      },

      // ✅ INITIALIZE - Restore tokens from localStorage on app load
      initialize: () => {
        console.log('🚀 [Auth] Initializing auth from localStorage...');
        if (typeof window !== 'undefined') {
          const token = localStorage.getItem('token');
          const refreshToken = localStorage.getItem('refreshToken');
          const savedAdAccount = localStorage.getItem('selectedAdAccount');
          const savedAdAccountObject = localStorage.getItem('ad_account');
          
          if (token && refreshToken) {
            set({ accessToken: token, refreshToken, isAuthenticated: true });
            console.log('✅ [Auth] Tokens restored from localStorage');
          } else {
            // No tokens — mark initialized so layout won't stay on spinner
            set({ isInitialized: true });
            console.log('⚠️  [Auth] No tokens in localStorage');
          }

          if (savedAdAccountObject) {
            try {
              const parsedAccount = JSON.parse(savedAdAccountObject) as AdAccountOption;
              if (parsedAccount?.id) {
                set({ selectedAdAccount: parsedAccount.id });
                console.log('✅ [Auth] Selected ad account restored from object:', parsedAccount.id);
              }
            } catch {
              if (savedAdAccount) {
                set({ selectedAdAccount: savedAdAccount });
              }
            }
          } else if (savedAdAccount) {
            set({ selectedAdAccount: savedAdAccount });
            console.log('✅ [Auth] Selected ad account restored:', savedAdAccount);
          }
        }
      },

      setSelectedAdAccount: (id) => {
        console.log('🔄 [Auth] Switching ad account to:', id);
        localStorage.setItem('selectedAdAccount', id);
        set({ selectedAdAccount: id });
      },

      updatePreferences: async (prefs) => {
        await api.auth.updateProfile({ preferences: prefs });

        const currentUser = get().user;

        if (currentUser) {
          set({
            user: {
              ...currentUser,
              preferences: {
                ...currentUser.preferences,
                ...prefs,
              },
            },
          });
        }
      },
    }),
    {
      name: 'adinsight-auth',

      // ✅ ONLY persist selectedAdAccount (tokens are now cookie-based)
      partialize: (state) => ({
        selectedAdAccount: state.selectedAdAccount,
      }),
    }
  )
);