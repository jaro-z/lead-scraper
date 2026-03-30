# Agent D Review — Code Stress Test

**Date:** 2026-03-29
**Files reviewed:** `enrichment/webScraper.js`, `enrichment/contactWaterfall.js`
**Changes reviewed:** Change 1, 2, 3, 4, 5, 6

---

## Check-by-Check Findings

### A. `sanitizeEmail()` — blocklist (Change 1)

**PASS — with notes**

- **Hex-hash regex** (`/^[0-9a-f]{32,}$/`): Correctly blocks 32+ lowercase hex local parts. 31-char hex is allowed. Mixed-case hashes are handled correctly because the local part is lowercased at line 103 (`cleaned.toLowerCase().split('@')`) before the regex is applied — so an uppercase hash like `ABCDEF...@mhtml.blink` becomes `abcdef...` before the hex check runs.
- **Blocked domain matching** uses `emailDomain === blockedDomain || emailDomain.endsWith('.' + blockedDomain)`: correct endsWith semantics. `mail.wixpress.com` is caught by `wixpress.com` entry. `seznam.cz` is NOT blocked by the `firma.seznam.cz` entry (correct).
- **Placeholder exact match** (`BLOCKED_PLACEHOLDER_EMAILS.includes(cleaned.toLowerCase())`): `priklad@email.cz` is blocked; `priklad2@email.cz` is allowed. Correct.
- **Filter order**: Blocklist checks occur after format validation (emailMatch extraction at line 96–98). Correct — only valid-format emails hit the blocklist.

---

### B. `isExternalDomainEmail()` — subdomain company domain (Change 2)

**FAIL — BUG FOUND AND FIXED**

**Bug:** When `companyDomain` is a subdomain like `cz.prefa.com`, an email at the parent domain `jan@prefa.com` was incorrectly flagged as external. The function only checked:
- `emailDomain === cleanCompanyDomain` (false: `prefa.com` ≠ `cz.prefa.com`)
- `emailDomain.endsWith('.' + cleanCompanyDomain)` (false: `prefa.com` does not end with `.cz.prefa.com`)

It never checked the reverse: whether the company domain is a subdomain of the email domain.

**Fix applied:** Added a parent-domain check:
```js
if (cleanCompanyDomain.endsWith('.' + emailDomain)) {
  return false;
}
```
This correctly handles `cz.prefa.com`.endsWith(`.prefa.com`) → true → `jan@prefa.com` is not external.

**Other cases verified after fix:**
- Null/undefined `companyDomain` → returns false gracefully (PASS)
- `email.cz` is in `CZECH_PERSONAL_PROVIDERS` list (PASS)
- `gross.sro@volny.cz` with company `gross-spol.cz` → not flagged (PASS)

---

### C. `extractContactsWithClaude()` — `companyDomain` threading (Change 2)

**PASS**

All four call sites inside `scrapeTeamPages()` pass `companyDomain: domain`:
- Line 970: main scrape loop
- Line 1019: all-pages-failed fallback
- Line 1057: raw HTTP homepage fetch
- Line 1135: raw HTTP contact page fetch

`extractContactsWithClaude` accepts `companyDomain` via the `options` object (`const { keepGeneric = false, companyDomain = null } = options`). Consistent.

---

### D. Czech title prefix filter (Change 3)

**PASS**

The `CZECH_TITLE_PREFIXES` array includes both dotted (`'ing.'`) and undotted (`'ing'`) variants for all titles. The filter logic strips a trailing dot before the lookup: `firstName.toLowerCase().replace(/\.$/, '').trim()`, then checks `CZECH_TITLE_PREFIXES.includes(...)`.

Test results:
- `"Ing."` → null (wiped)
- `"Ing"` → null (wiped, undotted variant in list)
- `"Dr"` → null (wiped)
- `"Dr."` → null (wiped)
- `"Ing. Jan"` → `"Ing. Jan"` (NOT wiped — the trailing-dot strip only removes a trailing dot; the full string `"ing. jan"` is not in the prefix list)
- `"Jan"` → `"Jan"` (normal name, untouched)

All cases correct.

---

### E. Homepage always scraped (Change 5)

**FAIL — BUG FOUND AND FIXED**

**Bug:** The homepage was appended to the END of `rankedPages` using `.push()`. When the AI already ranked 3 pages (= `maxAttempts`), the homepage landed at index 3 or 4. The `scrapeLimit` calculation (`Math.min(rankedPages.length, maxAttempts + ...)`) capped the loop at 3 or 4 iterations, leaving the homepage as the last element and silently skipping it. The change did not achieve its stated goal ("regardless of site size") for the most common case (sites large enough to generate 3 AI-ranked pages).

Example scenario: AI ranks 3 pages, no contact page in them → contact page added at step 2.25 → homepage pushed at step 2.5 → `rankedPages` = 5 items, `scrapeLimit` = 4 → homepage at index 4, never scraped.

**Fix applied:** Changed `.push()` to `.unshift()` so the homepage is inserted at position 0. Since `scrapeLimit ≥ 1` in any valid code path, index 0 is always within the scrape window.

Verified after fix: all scenarios (AI ranked 1, 2, or 3 pages, with or without contact page) now result in homepage scraped: true.

**No page-count overflow risk:** `scrapeLimit` still caps total pages at `maxAttempts + 1` (4). Adding homepage at front just replaces whichever page would have been scraped last, not adding an extra scrape beyond the cap.

---

### F. `shouldCallHunter` edge cases (Change 4)

**PASS — with one noted behavior gap**

- `derivedPattern` is null → `patternEmail = null` → `shouldUsePatternFirst = false` → `shouldCallHunter = hunterApiKey` (calls Hunter if key present). Correct.
- `derivedPattern` exists but `applyDerivedPattern` returns null (e.g., no `lastName` for `{first}.{last}` pattern) → same flow as above. Correct.
- No name at all → early guard at line 60 pushes contact as-is without Hunter. Correct.

**Behavior gap (not a bug, documented):** When a contact is a decision-maker with a 1-match derived pattern and no Hunter API key: `shouldUsePatternFirst = false` (DM + only 1 match), `shouldCallHunter = false` (no key). The contact falls through to the `else if (!shouldUsePatternFirst && !shouldCallHunter)` branch and is pushed without an email. The 1-match pattern email is discarded even though it's the only option available. This is a conservative design choice (don't guess a CEO's email from a weak pattern), not a bug.

Also noted: the `(derivedPattern && derivedPattern.matches === 0)` guard in `shouldCallHunter` is dead code — `derivePatternFromExistingContacts` always returns `null` (not `{matches: 0}`) when no pattern is found.

---

### G. Decision-maker Hunter call with 2-match pattern (Change 4)

**PASS — design decision documented**

When `isDecisionMaker: true` and `derivedPattern.matches >= 2`:
- `shouldUsePatternFirst = true` (matches >= 2 takes priority over DM status)
- `shouldCallHunter = false` (DM + matches < 2 = false → entire Hunter condition is false)

Result: pattern is used, Hunter is NOT called, `confidence = 20`.

**Finding:** For a CEO where the email pattern is confirmed by 2+ other employees, we use the pattern and skip Hunter. This saves Hunter API credits at the cost of confidence (20 vs potentially 75 from Hunter). This is the intended cost-saving behavior per Change 4's design. For production, if high confidence on decision-maker emails is critical, the threshold could be raised (e.g., skip Hunter only at ≥ 3 matches for DMs). Flagged as a trade-off, not a bug.

---

### H. Subdomain fix — `effectiveDomain` (Change 6)

**PASS — minor edge case noted**

When a company has emails from both its subdomain and parent domain, the most-common domain wins. If there's a tie, `Object.entries().sort()` is not stable across JS engines for equal values, but in practice ties are rare and either domain is valid for pattern generation.

When `derivePatternFromExistingContacts` returns null (no contacts with emails), `applyDerivedPattern(null, ...)` immediately returns null at line 277. Correct.

---

### I. `derivePatternFromExistingContacts` return value (Change 6)

**PASS**

The function is only called once in `contactWaterfall.js` (line 44). The new `emailDomain` field added to the return value is:
- Used correctly in `applyDerivedPattern` as `targetDomain`
- Included in `log.patternDerived` (no destructuring — full object stored)
- Not destructured by any caller

No callers relied on the old `{ pattern, matches }` shape in a way that would break.

---

## Summary of Bugs Found and Fixed

| # | File | Severity | Description | Status |
|---|------|----------|-------------|--------|
| 1 | `webScraper.js` | **Medium** | `isExternalDomainEmail()` incorrectly flagged parent-domain emails as external when `companyDomain` is a subdomain (e.g., `jan@prefa.com` flagged as external for company `cz.prefa.com`) | **FIXED** — added parent-domain check |
| 2 | `webScraper.js` | **Medium** | Change 5 homepage always-scraped: homepage was `.push()`-ed to end of `rankedPages`, making it silently unreachable when AI already ranked 3 pages (most common case for large sites) | **FIXED** — changed to `.unshift()` |

---

## Concerns Not Fixed (by design or minor)

- **Dead code:** `derivedPattern.matches === 0` guard in `shouldCallHunter` is unreachable in normal flow. Low priority, no impact.
- **DM + 1-match pattern + no Hunter key** → contact gets no email. Conservative but valid design choice.
- **DM with 2-match pattern skips Hunter** → confidence=20 instead of potential 75. Expected trade-off per the waterfall cost-saving design.

---

## Overall Verdict

**READY TO TEST** (after the two fixes applied above)

The core logic of all 6 changes is sound. Two medium-severity bugs were found and fixed:
1. External domain detection was broken for subdomain company domains.
2. The homepage addition in Change 5 was silently ineffective for large sites due to array ordering vs scrapeLimit.

All other checks passed. The test can proceed.
