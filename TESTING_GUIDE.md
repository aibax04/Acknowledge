# Testing Guide - Policy Filtering & Acknowledgments

## Current Status
✅ Backend restarted with enhanced logging
✅ Frontend updated with console debugging
✅ Both features implemented and ready to test

## How to Test

### 1. Test Policy Filtering (Multiple Audiences)

#### Step 1: Create a Test Policy for Specific Audience
1. Log in as **Senior** user
2. Go to **"Compliance & Policies"** tab
3. Click **"+ Publish New Policy"**
4. Fill in:
   - Title: "Test - Employees Only"
   - **UNCHECK** "All Company"
   - **CHECK ONLY** "Employees"
   - Content: "This should only be visible to employees"
5. Click **"Publish to Selected Audience"**
6. **Open Browser Console** (F12) and check the logs:
   - Should see: `Selected audiences array: ["employee"]`
   - Should see: `Audience string: employee`

#### Step 2: Verify Filtering Works
1. **Stay logged in as Senior**:
   - You should see the policy (seniors see all policies)
   
2. **Log in as Employee** (different browser/incognito):
   - Go to dashboard
   - **Should SEE** the "Test - Employees Only" policy ✅
   
3. **Log in as Manager** (different browser/incognito):
   - Go to dashboard
   - **Should NOT SEE** the "Test - Employees Only" policy ❌

4. **Check Backend Logs**:
```bash
sudo docker compose logs backend --tail 50 | grep "DEBUG"
```
You should see logs like:
```
DEBUG: Policy 'Test - Employees Only' has audiences: ['employee'], checking against role: manager
DEBUG: ✗ Policy 'Test - Employees Only' DOES NOT MATCH - hiding from manager
```

#### Step 3: Test Multiple Audiences
1. Create another policy:
   - Title: "Test - Employees and Managers"
   - **CHECK** "Employees"
   - **CHECK** "Managers"
   - **UNCHECK** "All Company" and "Interns"
2. Verify:
   - Employees see it ✅
   - Managers see it ✅
   - Interns DON'T see it ❌

---

### 2. Test Acknowledgment Tracking

#### Step 1: View Acknowledgments
1. Log in as **Senior**
2. Go to **"Compliance & Policies"** tab
3. Find any policy in the table
4. Click **"View Details"** button (purple button)
5. **Open Browser Console** (F12) - you should see:
   ```
   === LOADING ACKNOWLEDGMENTS FOR POLICY X ===
   Acknowledgment data received: {acknowledged: [...], pending: [...], total: X}
   Modal populated successfully, showing modal
   ```

#### Step 2: Check Modal Display
The modal should show:
- **Title**: "Acknowledgments: [Policy Name]"
- **Stats**: "X of Y (Z%)"
- **Left Column (Green)**: Users who acknowledged
  - Shows name, role, and timestamp
- **Right Column (Red)**: Users who haven't acknowledged
  - Shows name and role

#### Step 3: Test with Different Audiences
1. Create a policy for "Employees Only"
2. Have some employees acknowledge it
3. Click "View Details"
4. **Should only show employees** in the lists (not managers or interns)

---

## Troubleshooting

### Issue: Policies still showing to everyone

**Check Console Logs**:
1. Open browser console (F12)
2. When creating policy, look for:
   ```
   === POLICY SUBMISSION DEBUG ===
   Selected audiences array: [...]
   ```
3. If array is empty or shows `["all"]`, the checkboxes aren't working

**Check Backend Logs**:
```bash
sudo docker compose logs backend --tail 100 | grep "DEBUG"
```
Look for:
- `DEBUG: get_policies for user: ...`
- `DEBUG: Policy 'X' has audiences: ...`
- `DEBUG: ✓ Policy 'X' MATCHES` or `✗ DOES NOT MATCH`

**Verify Database**:
```bash
sudo docker compose exec db psql -U postgres -d Acknowledge_db -c "SELECT id, title, target_audience FROM policies ORDER BY created_at DESC LIMIT 5;"
```
- Check `target_audience` column
- Should see values like: `employee`, `employee,manager`, `all`

### Issue: Acknowledgment modal not loading

**Check Console Logs**:
1. Click "View Details"
2. Console should show:
   ```
   === LOADING ACKNOWLEDGMENTS FOR POLICY X ===
   ```
3. If you see an error, it will show:
   ```
   Failed to load acknowledgments: [error message]
   Error details: ...
   ```

**Common Errors**:
- **404 Not Found**: Endpoint not registered (backend restart needed)
- **403 Forbidden**: Not logged in as senior/manager
- **500 Server Error**: Check backend logs for Python errors

**Check Backend Endpoint**:
```bash
# Test the endpoint directly
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8001/api/policies/1/acknowledgments
```

---

## Expected Behavior Summary

### Policy Filtering
| User Role | Policy Audience | Should See? |
|-----------|----------------|-------------|
| Employee  | `all`          | ✅ Yes      |
| Employee  | `employee`     | ✅ Yes      |
| Employee  | `manager`      | ❌ No       |
| Employee  | `employee,manager` | ✅ Yes  |
| Manager   | `employee`     | ❌ No       |
| Manager   | `manager`      | ✅ Yes      |
| Manager   | `employee,manager` | ✅ Yes  |
| Senior    | ANY            | ✅ Yes (sees all) |

### Acknowledgment Tracking
- **Acknowledged list**: Shows users who clicked "Acknowledge" with timestamps
- **Pending list**: Shows users in target audience who haven't acknowledged
- **Percentage**: Calculated as `acknowledged / (acknowledged + pending) * 100`
- **Respects audience**: Only shows users who should see the policy

---

## Quick Test Script

Run this to test everything quickly:

1. **Create test policies**:
   - Policy A: "All Company" → Everyone sees it
   - Policy B: "Employees" only → Only employees see it
   - Policy C: "Employees,Managers" → Both groups see it

2. **Test visibility**:
   - Log in as employee → Should see A, B, C
   - Log in as manager → Should see A, C (not B)
   - Log in as intern → Should see A only

3. **Test acknowledgments**:
   - Have employee acknowledge Policy B
   - As senior, click "View Details" on Policy B
   - Should show employee in "Acknowledged" column
   - Should show other employees in "Pending" column
   - Should NOT show managers or interns in either column

---

## Need More Help?

If issues persist:
1. Share the **browser console logs** (F12 → Console tab)
2. Share the **backend logs**: `sudo docker compose logs backend --tail 100`
3. Share the **database query result**: The psql command above
4. Describe exactly what you're seeing vs. what you expect

The enhanced logging will help us pinpoint exactly where the issue is!
