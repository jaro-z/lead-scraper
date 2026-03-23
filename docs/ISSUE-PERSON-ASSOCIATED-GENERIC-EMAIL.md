# Issue: Person-Associated Generic Email Not Being Extracted

**Status**: PARTIALLY FIXED - Backend logic ready, but upstream extraction failing
**Priority**: High
**Last Updated**: 2026-03-22

---

## Executive Summary

When a contact page shows a person's name directly alongside a generic email (e.g., `info@`), the scraper should associate the actual person's name with that email. Currently, it creates a "General Contact" fallback instead.

**Example from 4M Digital (https://www.4m-digital.eu/):**
```
Ing. Lucie Šplíchalová, CEMS MIM
Email: info@4m-digital.eu
Tel.: +420 773 591 117
```

| Expected Result | Actual Result |
|-----------------|---------------|
| Name: "Ing. Lucie Šplíchalová" | Name: "General Contact" |
| Email: info@4m-digital.eu | Email: info@4m-digital.eu |
| Badge: "Named" | Badge: "GENERIC" |

---

## Problem Breakdown

There are **TWO separate issues** that were discovered:

### Issue 1: Backend Logic (FIXED)
When Claude extracts a contact with a generic email, the system was filtering out the email before associating it with the person's name.

**Root Cause**: `filterGenericEmail()` was called unconditionally, stripping generic emails even when Claude identified them as belonging to a specific person.

**Solution Implemented**: Added `emailAssociatedWithPerson` flag that Claude can set when a generic email appears directly with a person's contact details.

### Issue 2: Page Not Being Scraped (NOT FIXED - CURRENT BLOCKER)
The scraper isn't finding the contact page where Lucie's information exists.

**Evidence from enrichment log:**
```
URLs discovered: 15
Pages scraped: 3
  ├─ (ABOUT) ✓
  ├─ /de (ABOUT) ○
  ├─ (HOMEPAGE (raw fetch)) ✓
Contacts extracted: 0
  └─ No contacts extracted
Result: ⚠ No personal contacts – only generic: info@4m-digital.eu
```

**Root Cause**: The scraper found 15 URLs but only scraped 3 pages (ABOUT, German ABOUT, HOMEPAGE). The `/kontakt` page (or wherever Lucie's info lives) was either:
1. Not discovered in the URL patterns
2. Discovered but not prioritized for scraping
3. The contact info is embedded in a way the current page patterns don't recognize

---

## Code Changes Made (Issue 1 Fix)

### File: `lead-scraper/enrichment/webScraper.js`

#### 1. Claude Prompt Update (around line 287-352)
Added instruction block for generic email association:

```javascript
GENERIC EMAIL ASSOCIATION:
- Generic emails are: info@, kontakt@, contact@, office@, support@, sales@, hello@, obchod@, etc.
- If a generic email appears DIRECTLY with a person's name and their contact details
  (same visual block, card, or section), set "emailAssociatedWithPerson": true
- This means the person personally uses this email, not just the company
- Example: A contact page showing "Lucie Novak, CEO, info@company.cz, +420..."
  → emailAssociatedWithPerson: true
- If the generic email is separate from people (e.g., in footer, standalone contact form)
  → emailAssociatedWithPerson: false or omit
```

#### 2. Response Parsing Update (around line 368-383)
Modified contact mapping to preserve the flag and conditionally filter:

```javascript
.map(contact => {
  const isAssociatedWithPerson = contact.emailAssociatedWithPerson === true;
  return {
    name: sanitizeContactField(contact.name),
    firstName: sanitizeContactField(contact.firstName) || null,
    lastName: sanitizeContactField(contact.lastName) || null,
    role: sanitizeContactField(contact.role),
    email: isAssociatedWithPerson
      ? sanitizeEmail(contact.email, true)  // Skip company pattern filter
      : (keepGeneric ? sanitizeEmail(contact.email) : filterGenericEmail(contact.email)),
    phone: sanitizeContactField(contact.phone),
    isDecisionMaker: contact.isDecisionMaker === true,
    emailAssociatedWithPerson: isAssociatedWithPerson
  };
})
```

#### 3. `sanitizeEmail()` Function Update
Added optional parameter to skip company pattern filtering:

```javascript
function sanitizeEmail(email, skipCompanyPattern = false) {
  // ... existing sanitization ...
  if (!skipCompanyPattern) {
    const [localPart, domain] = cleaned.toLowerCase().split('@');
    const domainName = domain.split('.')[0];
    if (localPart === domainName) {
      return null;
    }
  }
  return cleaned.toLowerCase();
}
```

#### 4. Final Contact Assembly (around line 829-883)
Added separation of person-associated generic emails:

```javascript
// Separate personal vs generic emails
const personalContacts = mergedContacts.filter(c => c.email && !isGenericEmail(c.email));
const personAssociatedGeneric = mergedContacts.filter(
  c => c.email && isGenericEmail(c.email) && c.emailAssociatedWithPerson && c.name
);
const unassociatedGeneric = mergedContacts.filter(
  c => c.email && isGenericEmail(c.email) && !c.emailAssociatedWithPerson
);

// Include personal + person-associated generic in final contacts
const contactsWithEmail = [...personalContacts, ...personAssociatedGeneric];
```

#### 5. Exported `isGenericEmail()` Function
Made the function available for external use:

```javascript
function isGenericEmail(email) {
  if (!email) return false;
  const genericPrefixes = ['info@', 'kontakt@', 'contact@', 'office@', 'support@',
                           'sales@', 'hello@', 'obchod@', 'noreply@', 'poptavka@',
                           'recepce@', 'fakturace@', 'admin@', 'marketing@',
                           'webmaster@', 'general@', 'team@'];
  return genericPrefixes.some(p => email.toLowerCase().startsWith(p));
}

module.exports = {
  // ... existing exports ...
  isGenericEmail
};
```

### File: `lead-scraper/app.js`

#### Frontend Badge Logic Updates

**`getContactTier()` function (around line 1808-1819):**
```javascript
function getContactTier(company) {
  if (!company.primary_email) return 'none';
  const email = company.primary_email.toLowerCase();
  const title = (company.primary_contact_title || '').toLowerCase();

  // CEO check first
  if (/\b(ceo|founder|co-founder|owner|director|managing|president|jednatel|majitel|zakladatel|ředitel|společník|partner)\b/.test(title)) return 'ceo';

  // Check if real person name exists (not "General Contact")
  const hasPersonName = company.primary_contact_first_name &&
                        company.primary_contact_first_name !== 'General' &&
                        company.primary_contact_first_name.trim().length > 0;
  if (hasPersonName) return 'named';

  // Only mark as generic if no person name
  const genericPrefixes = ['info@', 'kontakt@', 'contact@', ...];
  if (genericPrefixes.some(p => email.startsWith(p))) return 'generic';

  return 'named';
}
```

**`getContactTierFromContact()` function (around line 1900):**
Similar logic - checks `first_name` and `full_name` before applying generic prefix check.

---

## Tests Added

### File: `lead-scraper/tests/enrichment.test.js`

Added 4 new tests in "Person-Associated Generic Email Handling" describe block:

1. **`should identify generic emails correctly with isGenericEmail()`** - Tests the isGenericEmail function
2. **`should preserve emailAssociatedWithPerson flag through deduplication`** - Ensures flag survives contact merging
3. **`should separate person-associated generic emails from unassociated ones`** - Tests the filtering logic
4. **`should NOT create "General Contact" when person-associated generic email exists`** - Core behavior test

All 4 tests pass.

---

## What Needs To Be Fixed Next (Issue 2)

The backend logic is ready, but Claude isn't extracting Lucie because **the contact page isn't being scraped**.

### Investigation Needed

1. **Check what pages exist on 4m-digital.eu**
   ```bash
   curl -s "https://www.4m-digital.eu/" | grep -oE 'href="[^"]*"' | sort -u
   ```

2. **Find where Lucie's contact info actually lives**
   - Is it on `/kontakt`? `/contact`? `/o-nas`? Homepage footer?

3. **Check `TEAM_PAGE_PATTERNS` in webScraper.js**
   - Does it include the URL pattern for this site's contact page?
   - The scraper uses regex patterns to identify team/contact pages

4. **Check page prioritization logic**
   - The scraper discovered 15 URLs but only scraped 3
   - Why wasn't the contact page prioritized?

### Likely Fixes

#### Option A: Add missing URL pattern
If the contact page URL doesn't match existing patterns, add it to `TEAM_PAGE_PATTERNS`:

```javascript
const TEAM_PAGE_PATTERNS = [
  // existing patterns...
  /\/kontakt/i,  // Make sure this exists
  // ...
];
```

#### Option B: Increase page scrape limit
If contact page is deprioritized, consider:
- Increasing the number of pages scraped per site
- Adjusting priority scoring for contact pages

#### Option C: Check if contact info is on already-scraped pages
The info might be on the ABOUT or HOMEPAGE pages but in a format Claude doesn't recognize:
- Check the raw HTML of those pages
- See if Lucie's name appears but Claude missed it
- May need to adjust Claude prompt for edge cases

---

## Database State

**Test company**: 4M Digital
**Company ID**: 92
**Current contact in DB**:
```sql
SELECT * FROM contacts WHERE company_id = 92;
-- Result: id=443, full_name="General Contact", email="info@4m-digital.eu"
```

To re-test after fixes:
```sql
DELETE FROM contacts WHERE company_id = 92;
UPDATE companies SET enrichment_status = 'pending', enrichment_log = NULL WHERE id = 92;
```

---

## Files Reference

| File | Purpose | Status |
|------|---------|--------|
| `lead-scraper/enrichment/webScraper.js` | Core scraping logic | MODIFIED |
| `lead-scraper/app.js` | Frontend display logic | MODIFIED |
| `lead-scraper/tests/enrichment.test.js` | Unit tests | MODIFIED |
| `data/leads.db` | SQLite database | Contains test data |

---

## Verification Steps

Once Issue 2 is fixed:

1. Clear 4M Digital data:
   ```sql
   DELETE FROM contacts WHERE company_id = 92;
   UPDATE companies SET enrichment_status = 'pending' WHERE id = 92;
   ```

2. Restart server:
   ```bash
   cd lead-scraper && npm start
   ```

3. Re-enrich 4M Digital in the UI

4. Verify result shows:
   - Name: "Ing. Lucie Šplíchalová" (not "General Contact")
   - Badge: "Named" (not "GENERIC")
   - Email: info@4m-digital.eu

5. Also test with a site that has truly unassociated generic email to ensure regression didn't occur.

---

## Related Files

- Original plan: `~/.claude/plans/partitioned-fluttering-yao.md`
- PRD: `lead-scraper/docs/PRD-WATERFALL-ENRICHMENT.md`
