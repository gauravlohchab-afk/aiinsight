# 🧪 Verification Guide: ROAS, CTR, Conversions Fix

## Quick Test Steps

### 1. Backend Verification

#### Check Meta API Requests Include Required Fields

Look for these log lines in your backend:
```
📡 Meta API Call: GET https://graph.facebook.com/v19.0/{accountId}/campaigns
```

The request should include `purchase_roas` in fields for insights requests.

#### Verify Extraction Logic

When fetching campaigns, you should see logs like:
```
INSIGHT: Campaign {
  conversions: 5,
  actions: [{ action_type: "lead", value: "5" }],
  roas: 1.8,
  purchase_roas: [{ value: "1.8" }],
  ctr: 2.5,
  spend: 150
}

ACTIONS: {
  campaign: "My Campaign",
  actions: [...],
  roas: [{ value: "1.8" }],
  conversions: 5
}
```

#### Test Performance Breakdown Endpoint

```bash
# Terminal
curl "http://localhost:3000/api/analytics/performance-breakdown?adAccountId=YOUR_AD_ACCOUNT_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "name": "Campaign Name",
      "spend": 150.50,
      "roas": 1.8,
      "ctr": 2.5,
      "conversions": 5,
      "impressions": 2000,
      "clicks": 50,
      "cpa": 30.1
    }
  ]
}
```

✅ Verify:
- [ ] `roas` is > 0 (not 0)
- [ ] `ctr` is > 0 (not 0)
- [ ] `conversions` is > 0 (not 0)
- [ ] All values match Meta ads dashboard

---

### 2. Frontend Verification

#### Check Campaigns Page Table

Navigate to **Campaigns** → Should show a table with columns:
- Name
- Health
- **Spend** ✓ Was working
- **ROAS** ← Should now show values > 0
- **CTR** ← Should now show percentage > 0
- **CPA** ← Calculated from conversions
- **Conversions** ← Should now show values > 0

**Expected Table Row:**
```
My Campaign | 78 | ₹1,500 | 1.8 ↑ | 2.5% | ₹30.10 | 5
```

✅ Verify:
- [ ] ROAS column shows numbers (not 0 or dashes)
- [ ] CTR column shows percentages (not 0%)
- [ ] Conversions column shows count > 0
- [ ] All values are color-coded (green for good, red for bad)

#### Check Analytics Page

Navigate to **Analytics** (Dashboard) → Should show:

**Campaign ROAS Comparison Chart**
- X-axis: Campaign names
- Y-axis: Two bars per campaign
  - Blue bar: ROAS (should be > 0)
  - Cyan bar: CTR (should be > 0)

✅ Verify:
- [ ] Chart shows bars (not flat line at 0)
- [ ] Hover tooltip shows ROAS value
- [ ] Hover tooltip shows CTR value
- [ ] Values match campaigns page

**Performance Data Table** (if displayed):
- Spend ✓ Working
- ROAS (new)
- CTR (new)
- Conversions (new)

---

### 3. Browser Console Verification

Open **Developer Tools** (F12) → **Console** tab

Should see logs like:
```
📊 [Analytics] Fetching performance breakdown...
✅ [Analytics] Performance data received: [
  { name: "Campaign 1", spend: 150, roas: 1.8, ctr: 2.5 },
  { name: "Campaign 2", spend: 200, roas: 2.1, ctr: 3.2 }
]
📊 [normalizeCampaign] Metrics extracted: {
  id: "campaign-id",
  name: "Campaign Name",
  roas: 1.8,
  ctr: 2.5,
  conversions: 5
}
```

✅ Verify:
- [ ] No console errors
- [ ] `roas` value is extracted correctly
- [ ] `ctr` value is extracted correctly
- [ ] `conversions` value extracted correctly

---

### 4. Expected Behavior Changes

#### Before Fix
```
Campaign | Spend   | ROAS | CTR  | Conversions
---------|---------|------|------|----------
Camp A   | ₹1,500  | 0    | 0%   | 0
Camp B   | ₹2,000  | 0    | 0%   | 0
```

#### After Fix
```
Campaign | Spend   | ROAS | CTR  | Conversions
---------|---------|------|------|----------
Camp A   | ₹1,500  | 1.8  | 2.5% | 5
Camp B   | ₹2,000  | 2.1  | 3.2% | 8
```

---

### 5. Debug Mode

If values still show 0, check:

#### Backend Logs
```bash
# In terminal where backend is running, look for:
1. "INSIGHT:" log - Shows raw Meta response
2. "ACTIONS:" log - Shows extracted conversions
3. "ROAS:" log - Shows purchase_roas array from Meta

# If "INSIGHT:" shows empty or null - Meta API is not returning data
# If "actions" is undefined - Meta API format changed
# If "purchase_roas" is undefined - Meta API doesn't have ROAS data for this account
```

#### Frontend Logs
```javascript
// In browser console, look for:
1. Fetch request to `/performance-breakdown` endpoint
2. Response should have data array with roas/ctr/conversions > 0
3. normalizeCampaign logs should show extracted metrics

// If values are 0:
- Check console for API response
- Verify backend is returning non-zero values
- Check if running on correct account with active campaigns
```

---

### 6. Common Issues & Solutions

**Issue: ROAS still showing 0**
- [ ] Check if `purchase_roas` field is in API request (look for backend logs)
- [ ] Verify Meta account has campaigns with revenue/purchase conversions
- [ ] Check if date preset is "last_30d" and account has recent data

**Issue: CTR showing 0**
- [ ] Check if `ctr` field is in API request
- [ ] Verify Meta account has clicks/impressions data
- [ ] Check account setup - might need more data

**Issue: Conversions showing 0**
- [ ] Check if `actions` array is present in insights response
- [ ] Verify campaigns have converted (lead or purchase events)
- [ ] If `actions` is missing, check Meta API account permissions

**Issue: No data at all**
- [ ] Verify ad account is selected in sidebar
- [ ] Check network tab for errors in API calls
- [ ] Verify backend Meta token is valid
- [ ] Check backend logs for "Meta Insights Fetch Error"

---

### 7. Success Criteria

✅ **All of these should be true:**

1. Dashboard campaigns page shows non-zero ROAS values
2. Dashboard campaigns page shows non-zero CTR percentages
3. Dashboard campaigns page shows non-zero conversion counts
4. Analytics page ROAS chart shows bars (not flat)
5. Analytics page CTR chart shows bars (not flat)
6. Backend logs show "INSIGHT:", "ACTIONS:", "ROAS:" lines
7. No TypeScript errors in terminal
8. No JavaScript errors in browser console
9. All values match Meta ads manager dashboard

---

## 📱 Testing on Different Screens

### Desktop
- Campaigns page table (all columns visible)
- Analytics dashboard charts
- Campaign detail page metrics

### Mobile (if applicable)
- Campaigns page stacked cards
- Analytics page responsive charts

---

## 🔄 Regression Testing

Verify these still work after the fix:

- [x] Spend still displays correctly ✓ (was already working)
- [x] Currency symbol is ₹ ✓ (was already fixed)
- [x] Charts render without errors ✓ (tooltip fix)
- [x] Account switching refreshes data ✓ (context feature)
- [x] No database required for live data ✓ (uses Meta API directly)

---

## 📊 Expected Meta API Response Format

When everything works, Meta API returns insights like:

```json
{
  "spend": "150.50",
  "ctr": "2.5",
  "impressions": "2000",
  "clicks": "50",
  "actions": [
    { "action_type": "lead", "value": "5" },
    { "action_type": "complete_registration", "value": "3" }
  ],
  "action_values": [
    { "action_type": "purchase", "value": "270" }
  ],
  "purchase_roas": [
    { "value": "1.8" }
  ]
}
```

Backend extracts:
- `ctr` → 2.5
- `conversions` → 5 (from actions[0])
- `roas` → 1.8 (from purchase_roas[0])

Frontend receives:
```json
{
  "name": "Campaign Name",
  "spend": 150.50,
  "ctr": 2.5,
  "conversions": 5,
  "roas": 1.8
}
```

Dashboard displays:
- ROAS: **1.8** ✅
- CTR: **2.5%** ✅
- Conversions: **5** ✅

---

## ✨ You're Done!

Once all green checkmarks appear, the fix is complete and working correctly.
