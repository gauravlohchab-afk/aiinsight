import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });

    // Request interceptor: Add token to every request
    this.client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
      return config;
    });

    // Response interceptor: Handle 401 and retry with token refresh
    this.client.interceptors.response.use(
      (response) => {
        console.log(`📥 [API Response] ${response.status} ${response.config.url}`);
        return response;
      },
      async (error) => {
        const originalRequest = error.config;
        const isAuthEndpoint = !originalRequest?.url || originalRequest.url.startsWith('/auth/');

        console.error(`❌ [API Error] ${error.response?.status || 'NETWORK'} ${originalRequest?.url}`);
        console.error(`   Message: ${error.response?.data?.message || error.message}`);

        if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
          console.log('🔄 [API] Attempting token refresh...');
          originalRequest._retry = true;
          
          try {
            const refreshToken = localStorage.getItem('refreshToken');
            if (!refreshToken) throw new Error('No refresh token');

            console.log('📤 [API] Sending refresh token...');
            const response = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
            const { accessToken, refreshToken: newRefreshToken } = response.data.data;

            localStorage.setItem('token', accessToken);
            // Only update refreshToken if the server returned a new one
            if (newRefreshToken) localStorage.setItem('refreshToken', newRefreshToken);

            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            return this.client(originalRequest);
          } catch {
            console.error('❌ [API] Token refresh failed, clearing storage');
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
            if (typeof window !== 'undefined') {
              window.location.href = '/login';
            }
          }
        }
        
        return Promise.reject(error);
      }
    );
  }

  auth = {
    register: (data: { email: string; password: string; name: string }) =>
      this.client.post('/auth/register', data),
    login: (data: { email: string; password: string }) =>
      this.client.post('/auth/login', data),
    me: () => this.client.get('/auth/me'),
    metaConnect: () => this.client.get('/auth/meta/connect'),
    metaDisconnect: () => this.client.post('/auth/meta/disconnect'),
    updateProfile: (data: Record<string, unknown>) => this.client.patch('/auth/profile', data),
  };

  meta = {
    accounts: () => this.client.get('/meta/accounts'),
  };

  campaigns = {
    list: (params?: Record<string, unknown>) =>
      this.client.get('/campaigns', { params }),
    metaList: (params?: Record<string, unknown>) =>
      this.client.get('/campaigns/meta/list', { params }),
    get: (id: string) => this.client.get(`/campaigns/${id}`),
    adsets: (id: string, params?: Record<string, unknown>) =>
      this.client.get(`/campaigns/${id}/adsets`, { params }),
    timeseries: (id: string, params?: Record<string, unknown>) =>
      this.client.get(`/campaigns/${id}/timeseries`, { params }),
    ads: (id: string) => this.client.get(`/campaigns/${id}/ads`),
    breakdown: (id: string, params?: Record<string, unknown>) =>
      this.client.get(`/campaigns/${id}/breakdown`, { params }),
    sync: (adAccountId: string) => this.client.post('/campaigns/sync', { adAccountId }),
    kpiSummary: (params?: Record<string, unknown>) =>
      this.client.get('/campaigns/summary/kpi', { params }),
    applySuggestion: (campaignId: string, suggestionId: string) =>
      this.client.patch(`/campaigns/${campaignId}/suggestions/${suggestionId}/apply`),
  };

  analytics = {
    list: (params?: Record<string, unknown>) =>
      this.client.get('/analytics', { params }),
    overview: (params?: Record<string, unknown>) =>
      this.client.get('/analytics/overview', { params }),
    breakdowns: (params?: Record<string, unknown>) =>
      this.client.get('/analytics/breakdowns', { params }),
    spendOverTime: (params?: Record<string, unknown>) =>
      this.client.get('/analytics/spend-over-time', { params }),
    performanceBreakdown: (params?: Record<string, unknown>) =>
      this.client.get('/analytics/performance-breakdown', { params }),
    anomalies: () => this.client.get('/analytics/anomalies'),
    creativeFatigue: () => this.client.get('/analytics/creative-fatigue'),
    healthDistribution: () => this.client.get('/analytics/health-distribution'),
  };

  adsets = {
    ads: (id: string, params?: Record<string, unknown>) =>
      this.client.get(`/adsets/${id}/ads`, { params }),
    breakdowns: (id: string, params?: Record<string, unknown>) =>
      this.client.get(`/adsets/${id}/breakdowns`, { params }),
    breakdown: (id: string, params?: Record<string, unknown>) =>
      this.client.get(`/adsets/${id}/breakdown`, { params }),
  };

  ads = {
    get: (id: string, params?: Record<string, unknown>) =>
      this.client.get(`/ads/${id}`, { params }),
    breakdown: (id: string, params?: Record<string, unknown>) =>
      this.client.get(`/ads/${id}/breakdown`, { params }),
    leads: (id: string, params?: Record<string, unknown>) =>
      this.client.get(`/ads/${id}/leads`, { params }),
  };

  ai = {
    analyzeAudience: (data: Record<string, unknown>) =>
      this.client.post('/ai/analyze-audience', data),
    performanceReview: (adAccountId: string) =>
      this.client.post('/ai/performance-review', { adAccountId }),
    analyzeCreatives: (adAccountId: string) =>
      this.client.post('/ai/analyze-creatives', { adAccountId }),
    optimizeBudget: (data: { adAccountId: string; totalBudget: number }) =>
      this.client.post('/ai/optimize-budget', data),
    history: (params?: Record<string, unknown>) =>
      this.client.get('/ai/history', { params }),
    improvements: (data: Record<string, unknown>) =>
      this.client.post('/ai/improvements', data),
  };
}

export const api = new ApiClient();
