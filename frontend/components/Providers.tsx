'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/lib/store';
import { AdAccountProvider } from '@/context/AdAccountContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes
      retry: (failureCount, error: any) => {
        const status = error?.response?.status;

        if (status === 401 || status === 429) {
          return false;
        }

        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
    },
  },
});

function AuthInitializer() {
  const { fetchMe, initialize, isAuthenticated, user } = useAuthStore();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    console.log('🚀 [AuthInitializer] Starting auth initialization...');
    
    const initAuth = async () => {
      try {
        // Step 1: Restore tokens from localStorage
        console.log('📂 [AuthInitializer] Step 1: Restoring tokens from localStorage...');
        initialize();

        // Step 2: Fetch user with token from Authorization header
        console.log('🔐 [AuthInitializer] Step 2: Fetching user from /auth/me...');
        await fetchMe();
        
        console.log('✅ [AuthInitializer] Auth initialization completed successfully');
      } catch (error) {
        console.error('❌ [AuthInitializer] Auth initialization failed:', error);
      }
    };

    initAuth();
  }, [fetchMe, initialize]);

  // Log auth state changes
  useEffect(() => {
    console.log('🔐 [Auth State] Updated:', {
      isAuthenticated,
      hasUser: !!user,
      userName: user?.name,
    });
  }, [isAuthenticated, user]);

  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthInitializer />
      <AdAccountProvider>{children}</AdAccountProvider>
    </QueryClientProvider>
  );
}
