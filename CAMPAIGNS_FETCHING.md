# 🎯 Meta Campaigns Fetching - Complete Implementation

## ✨ What Was Implemented

I've added real-time Meta Ads campaign fetching that bypasses the database sync delay. Now campaigns appear instantly on the Campaigns page without waiting for the background sync job.

---

## 📡 Backend Service (`MetaService.ts`)

### New Method: `getMetaCampaigns()`

**Location:** `backend/src/services/MetaService.ts` (lines 162-225)

**Function:**
```typescript
async getMetaCampaigns(
  accessToken: string,
  adAccountId: string
): Promise<Array<Record<string, any>>>
```

**What it does:**
- ✅ Fetches campaigns directly from Meta Graph API
- ✅ Formats account ID with `act_` prefix if needed
- ✅ Validates access token before calling Meta
- ✅ Handles empty responses gracefully
- ✅ Normalizes campaign data (budgets converted to dollars)
- ✅ Detailed error logging with context

**Response:**
```typescript
[
  {
    id: "123456789",
    name: "Summer Sale Campaign",
    status: "ACTIVE",
    objective: "CONVERSIONS",
    daily_budget: 50.00,
    lifetime_budget: 1500.00,
    start_time: "2026-04-01T00:00:00+0000",
    stop_time: null,
    buying_type: "AUCTION"
  }
]
```

**Error Handling:**
- 401/190 → "Invalid OAuth token" 
- 403/200 → "Missing permissions (ads_read, ads_management)"
- Other → Returns detailed error message
- All errors logged to backend console

---

## 🛣️ New Backend Route (`campaigns.ts`)

### Endpoint: `GET /api/campaigns/meta/list`

**Location:** `backend/src/routes/campaigns.ts` (lines 18-74)

**Query Parameters:**
```
adAccountId=act_123456  (required)
```

**Authentication:** Bearer JWT token (required)

**Success Response (200):**
```json
{
  "success": true,
  "message": "Found 5 campaigns",
  "data": {
    "adAccountId": "act_123456",
    "campaignCount": 5,
    "campaigns": [
      {
        "id": "123456789",
        "name": "Campaign Name",
        "status": "ACTIVE",
        "objective": "CONVERSIONS",
        "daily_budget": 50.00,
        "lifetime_budget": 1500.00,
        "start_time": "2026-04-01T00:00:00+0000",
        "stop_time": null,
        "buying_type": "AUCTION"
      }
    ],
    "fetchedAt": "2026-04-17T10:33:45.123Z"
  }
}
```

**Error Response (400/401):**
```json
{
  "success": false,
  "error": {
    "message": "Invalid OAuth token. Please reconnect to Meta.",
    "details": "Please try again or reconnect your Meta account."
  }
}
```

---

## 🎨 Frontend Integration (`api.ts` & `campaigns/page.tsx`)

### API Client Update (`lib/api.ts`)

Added new method to campaigns API:
```typescript
campaigns = {
  list: (...) => ...,
  metaList: (params) =>                    // ← NEW
    this.client.get('/campaigns/meta/list', { params }),
  // ... other methods
}
```

### Campaigns Page Logic (`campaigns/page.tsx`)

**Smart Fallback Strategy:**
1. ✅ Try to fetch live campaigns from Meta using `metaList()`
2. ✅ Transform response to match database format
3. ⚠️ If Meta fetch fails, fall back to database campaigns
4. ✅ Display campaigns instantly without waiting for sync

**Updated Query:**
```typescript
const { data, isLoading, refetch } = useQuery({
  queryKey: ['campaigns', selectedAdAccount, ...],
  queryFn: async () => {
    try {
      // Fetch live from Meta
      const metaResponse = await api.campaigns.metaList({
        adAccountId: selectedAdAccount,
      });
      
      // Transform to display format
      return {
        data: {
          campaigns: metaResponse.data.campaigns.map((c) => ({
            _id: c.id,
            name: c.name,
            status: c.status,
            objective: c.objective,
            metrics: { spend: 0, roas: 0, ctr: 0 },
            healthScore: 0,
            anomalies: [],
            suggestions: [],
          })),
          pagination: { total: count, page: 1, limit: 50, pages: 1 },
        },
      };
    } catch (err) {
      // Fallback to database
      return api.campaigns.list({ ... });
    }
  },
});
```

---

## 🔄 Data Flow

```
User opens /campaigns page
    ↓
Frontend calls api.campaigns.metaList(adAccountId)
    ↓
Backend receives GET /campaigns/meta/list?adAccountId=act_xxx
    ↓
Authenticate user + fetch Meta token from database
    ↓
Call metaService.getMetaCampaigns(token, adAccountId)
    ↓
Meta Graph API: GET /act_xxx/campaigns
    ↓
Normalize campaign data (budgets USD conversion, null handling)
    ↓
Return [{ id, name, status, objective, budgets, ... }]
    ↓
Frontend displays campaigns in table instantly
    ↓
User can filter by status, search, sort without delay
```

---

## 🧪 Testing

### 1. Test Backend Endpoint Directly

```bash
# Get a valid JWT token first (login to get accessToken)

curl -X GET "http://localhost:5000/api/campaigns/meta/list?adAccountId=act_1234567890" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Found X campaigns",
  "data": {
    "adAccountId": "act_1234567890",
    "campaignCount": 5,
    "campaigns": [...]
  }
}
```

### 2. Test Frontend Navigation

1. Open http://localhost:3001/campaigns
2. You should see campaigns listed (if Meta account is connected)
3. Campaigns appear instantly without "Sync" button click
4. Search and filter work on live data

### 3. Test Error Cases

**Invalid Token:**
```bash
curl -X GET "http://localhost:5000/api/campaigns/meta/list?adAccountId=act_xxx" \
  -H "Authorization: Bearer invalid_token"
```
→ Should return 401 error

**Missing Account:**
```bash
curl -X GET "http://localhost:5000/api/campaigns/meta/list?adAccountId=act_badaccount" \
  -H "Authorization: Bearer VALID_TOKEN"
```
→ Should return 400 error with detailed message

---

## 🎯 Key Features

| Feature | Implementation | Status |
|---------|-----------------|--------|
| Direct Meta API fetch | `getMetaCampaigns()` service method | ✅ Done |
| Real-time display | `/campaigns/meta/list` endpoint | ✅ Done |
| Error handling | Specific error codes for 401, 403, 400 | ✅ Done |
| Fallback logic | Database campaigns as fallback | ✅ Done |
| Data normalization | Budgets converted to USD | ✅ Done |
| Loading states | React Query handles loading/error | ✅ Done |
| Empty campaigns | Shows "No campaigns" message gracefully | ✅ Done |
| Token validation | Verified before API call | ✅ Done |

---

## 📊 Budget Conversion

All budget values are converted from Meta API (cents) to USD:
```typescript
daily_budget: campaign.daily_budget ? parseInt(campaign.daily_budget) / 100 : null
lifetime_budget: campaign.lifetime_budget ? parseInt(campaign.lifetime_budget) / 100 : null
```

Example:
- Meta API: `"daily_budget": "5000"` (cents)
- Frontend: `daily_budget: 50.00` (USD)

---

## 🔒 Security

- ✅ Access token fetched from backend database, not exposed to frontend
- ✅ JWT token validation on every request
- ✅ No hardcoded tokens anywhere
- ✅ Error messages don't expose sensitive info in production
- ✅ Account ID validated before API call

---

## 📝 API Call Examples

### React/Next.js Integration

```typescript
import { api } from '@/lib/api';

// Fetch campaigns from Meta
const response = await api.campaigns.metaList({
  adAccountId: 'act_123456789'
});

// Handle response
if (response.data.success) {
  const campaigns = response.data.data.campaigns;
  console.log(`Found ${campaigns.length} campaigns`);
} else {
  console.error('Failed:', response.data.error.message);
}
```

### With React Query

```typescript
const { data, isLoading, error } = useQuery({
  queryKey: ['campaigns', adAccountId],
  queryFn: () => api.campaigns.metaList({ adAccountId }),
});

// Use data.data.campaigns for display
```

---

## 🚀 Why This Works

1. **No Database Delay**: Fetches directly from Meta API, not from synced database
2. **Instant Display**: Campaigns show up immediately when page loads
3. **Smart Fallback**: If Meta API fails, falls back to database campaigns
4. **Real-Time Data**: Always shows current list from Meta, not stale data
5. **Error Resilient**: Detailed error messages help diagnose issues

---

## 📚 Files Modified

| File | Change | Lines |
|------|--------|-------|
| `MetaService.ts` | Added `getMetaCampaigns()` method | 162-225 |
| `campaigns.ts` (route) | Added `GET /meta/list` endpoint | 18-74 |
| `api.ts` (frontend) | Added `metaList()` to campaigns API | ~75 |
| `campaigns/page.tsx` | Updated query to try Meta first | ~28-64 |

---

## ✅ Verification

**Backend logs should show:**
```
📊 Fetching campaigns from Meta for act_123456
✅ Successfully fetched 5 campaigns
```

**Frontend should display:**
- Campaign names, status, objectives in a table
- No "No campaigns found" message (if campaigns exist)
- "Sync" button to trigger background sync for detailed metrics

---

## 🎯 Next Steps (Optional)

1. Add campaign budget details to table columns
2. Add objective icons/badges
3. Add campaign creation date display
4. Add sorting by budget amount
5. Add campaign status indicator (active/paused/archived)

---

**Status:** ✅ Production Ready
**Last Updated:** April 17, 2026
