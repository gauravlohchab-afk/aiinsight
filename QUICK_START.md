# 🎯 Quick Start Guide - Meta Ads Insights Implementation

## ✅ What's Fixed

The "Sync failed — check Meta connection" error is now resolved with:

1. **Robust Insights Fetching Service** that directly queries Meta's Graph API
2. **Proper Error Handling** with automatic retries and meaningful error messages
3. **Detailed Logging** for debugging Meta API issues
4. **New API Endpoint** for real-time insights fetching

---

## 🚀 Getting Started

### 1. Start the Backend (port 5000)
```bash
cd /Users/apple/Downloads/adinsight\ 3/backend
npm run dev
```

✅ You should see:
```
[INFO] Starting development server...
✓ Server listening on port 5000
```

### 2. Start the Frontend (port 3001)
```bash
cd /Users/apple/Downloads/adinsight\ 3/frontend
npm run dev
```

✅ You should see:
```
✓ Ready in 5.2s
- Local: http://localhost:3001
```

### 3. Test the New Insights Endpoint

```bash
# Get insights from your Meta Ads account
curl -X GET "http://localhost:5000/api/analytics/meta-insights?adAccountId=act_1234567890" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "success": true,
  "message": "Insights fetched successfully",
  "data": {
    "adAccountId": "act_1234567890",
    "recordCount": 5,
    "fetchedAt": "2026-04-17T10:33:45.123Z",
    "insights": [
      {
        "campaign_name": "Campaign 1",
        "impressions": 15000,
        "spend": 250.75,
        "ctr": 3.0,
        "cpc": 0.56,
        "conversions": 25,
        "revenue": 1250.00
      }
    ]
  }
}
```

---

## 📊 Key Changes in Code

### MetaService.ts - New Method
```typescript
async getAdInsights(
  adAccountId: string,
  accessToken: string,
  maxRetries: number = 2
): Promise<Array<Record<string, any>>>
```

**Features:**
- ✅ Format account ID with `act_` prefix
- ✅ Validate access token
- ✅ Call Meta `/insights` endpoint
- ✅ Retry with exponential backoff on failures
- ✅ Handle 401 (invalid token), 403 (permissions), 429 (rate limit) errors
- ✅ Return normalized data

### Analytics Route - New Endpoint
```typescript
router.get('/meta-insights', ...)
```

**Features:**
- ✅ Requires `adAccountId` query parameter
- ✅ Fetches user's Meta token from database
- ✅ Returns clean, structured response
- ✅ Detailed error messages in development mode

### Sync Worker - Enhanced Error Handling
**Features:**
- ✅ Better error tracking per resource
- ✅ Success/failure count reporting
- ✅ Job duration tracking
- ✅ Graceful degradation (one error doesn't fail entire job)
- ✅ Detailed logging with context

---

## 🔍 Testing Error Cases

### 1. Invalid Token
```bash
curl -X GET "http://localhost:5000/api/analytics/meta-insights?adAccountId=act_123" \
  -H "Authorization: Bearer invalid_token"
```

**Expected Response:**
```json
{
  "success": false,
  "error": {
    "code": "AUTH_FAILED",
    "message": "Invalid OAuth token. Please reconnect to Meta."
  }
}
```

### 2. Missing Permissions
**Response:**
```json
{
  "success": false,
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "Missing permissions. Required: ads_read, ads_management"
  }
}
```

### 3. Rate Limited
**Response:**
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limited by Meta API. Please retry in 1 minute."
  }
}
```

---

## 📝 Configuration

All credentials are in `.env`:
```
META_APP_ID=1116061880694123
META_APP_SECRET=b5f03fdfbbc665cdaa1f20f49f1b7287
META_API_VERSION=v18.0
```

**No changes needed!** Backend is ready to use.

---

## 🎨 Frontend Integration

The dashboard automatically syncs with the new implementation:

1. **Click "Sync now"** → Triggers background sync job
2. **Dashboard loads** → Fetches latest insights via new endpoint
3. **KPI cards update** → Shows real-time spend, ROAS, CTR, CPA metrics
4. **Error notifications** → Shows friendly error messages if sync fails

---

## 📊 Data Flow

```
User opens dashboard
    ↓
Frontend makes request to /api/analytics/meta-insights
    ↓
Backend validates JWT token
    ↓
Fetches user's Meta access token from database
    ↓
Calls Meta Graph API with retry logic
    ↓
Normalizes response data
    ↓
Frontend displays KPI cards with metrics
```

---

## 🧪 Debugging Tips

### 1. Check Backend Logs
```bash
# Watch backend logs in real-time
tail -f /Users/apple/Downloads/adinsight\ 3/backend/logs/combined.log
```

### 2. Check Sync Status
Look for these log messages:
- ✅ `"✅ Successfully fetched N insights records"` → Success
- ⚠️ `"⚠️ Empty or malformed Meta API response"` → No data
- ❌ `"❌ Meta Insights Fetch Error"` → API error
- 💥 `"💥 All retry attempts failed"` → All retries exhausted

### 3. Verify Token
```bash
# Check if user has valid Meta token
curl -X GET "http://localhost:5000/api/auth/me" \
  -H "Authorization: Bearer YOUR_JWT"
```

---

## ✨ What Was Added

| File | Change | Purpose |
|------|--------|---------|
| `MetaService.ts` | `getAdInsights()` method | Fetch insights with retry logic |
| `analytics.ts` | `/meta-insights` route | New API endpoint |
| `syncWorker.ts` | Enhanced error tracking | Better error reporting |
| `Campaign.ts` | Type definitions updated | Support new fields |

---

## 🎯 Success Indicators

✅ Backend running on port 5000
✅ Frontend running on port 3001
✅ Dashboard displays metrics (not all $0.00)
✅ "Sync now" button works without errors
✅ Logs show successful insights fetch

---

## 🆘 Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Cannot fetch insights | Invalid Meta token | Reconnect Meta account in settings |
| All metrics show $0.00 | No campaigns running | Create/activate campaigns in Meta Ads Manager |
| Permission denied error | Missing scopes | Re-authenticate with `ads_read, ads_management` |
| Timeout errors | Too many campaigns | Sync has retry logic, will complete eventually |
| Backend won't start | Port 5000 in use | `killall node` then try again |

---

## 📞 Support

For detailed documentation, see: **`META_INSIGHTS_IMPLEMENTATION.md`**

Contains:
- 📡 Full API endpoint documentation
- 🔧 Service implementation details
- 🛠️ Configuration reference
- 🧪 Testing procedures
- 🔒 Security features
- 📊 Data flow diagram

---

**Status:** ✅ Production Ready
**Last Updated:** April 17, 2026
**Tested On:** macOS with Node.js
