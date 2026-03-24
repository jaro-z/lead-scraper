/**
 * Web Scraper for Team/Contact Pages
 * PRD-WATERFALL-ENRICHMENT: Step 2 - Contact Discovery (FREE method)
 *
 * Uses Firecrawl for JS-rendered scraping and Claude API for intelligent extraction.
 * Firecrawl handles JavaScript rendering, proxy rotation, and anti-bot bypassing.
 */

const Anthropic = require('@anthropic-ai/sdk');
const FirecrawlApp = require('@mendable/firecrawl-js').default;
const { validateEmail, validatePhone } = require('./validators');
const { sanitizeContactField } = require('../utils');

// Initialize Firecrawl (uses FIRECRAWL_API_KEY env var)
// SDK v4+ puts methods on .v1 property
const _firecrawlApp = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_API_KEY
});
const firecrawl = _firecrawlApp.v1 || _firecrawlApp;

// Initialize Anthropic client (uses ANTHROPIC_API_KEY env var)
const anthropic = new Anthropic();

// Page category constants for logging
const PAGE_CATEGORIES = ['TEAM', 'CONTACT', 'ABOUT'];

// Contact page URL suffixes for pattern matching (Czech + English + German)
const CONTACT_URL_SUFFIXES = [
  '/kontakt', '/contact', '/kontakty', '/contact-us',
  '/contacts', '/kontakte', '/kontakta', '/get-in-touch',
  '/napiste-nam'
];

// Generic email prefixes to filter out (not personal contacts)
const GENERIC_EMAIL_PREFIXES = [
  'info@', 'kontakt@', 'contact@', 'office@', 'support@',
  'sales@', 'hello@', 'obchod@', 'noreply@', 'chci@', 'poptavka@',
  'recepce@', 'fakturace@', 'admin@', 'marketing@', 'hr@', 'jobs@',
  'kariera@', 'press@', 'media@', 'podpora@', 'team@', 'partnerships@',
  'helpdesk@', 'service@', 'billing@', 'accounts@', 'general@'
];

/**
 * Sanitize email address - remove URL encoding, HTML artifacts, validate format
 * @param {string} email - Raw email string
 * @param {boolean} skipCompanyPattern - If true, don't filter company-pattern emails (for person-associated emails)
 * @returns {string|null} - Cleaned email or null if invalid
 */
function sanitizeEmail(email, skipCompanyPattern = false) {
  if (!email || typeof email !== 'string') return null;

  let cleaned = email.trim();

  // Remove URL-encoded characters (%20, %40, etc.)
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch (e) {
    // If decodeURIComponent fails, just remove common encoded chars manually
    cleaned = cleaned.replace(/%20/g, '').replace(/%40/g, '@');
  }

  // Remove leading/trailing non-email characters (HTML artifacts like 'E' before 'info@')
  // Keep only valid email characters
  cleaned = cleaned.replace(/^[^a-zA-Z0-9._%+-]+/, ''); // Remove leading junk
  cleaned = cleaned.replace(/[^a-zA-Z0-9._%+-]+$/, ''); // Remove trailing junk after TLD fix

  // Fix: extract just the email if there's garbage attached
  const emailMatch = cleaned.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (!emailMatch) return null;
  cleaned = emailMatch[1];

  // Validate basic email format
  if (!cleaned.includes('@') || !cleaned.includes('.')) return null;

  // Check for company-name@ pattern (e.g., woxo@woxo.cz, bpa@bpa.cz)
  // Skip this filter if the email is explicitly associated with a person
  if (!skipCompanyPattern) {
    const [localPart, domain] = cleaned.toLowerCase().split('@');
    const domainName = domain.split('.')[0]; // Get domain without TLD
    if (localPart === domainName) {
      // This is a company@ email pattern - treat as generic
      return null;
    }
  }

  return cleaned.toLowerCase();
}

/**
 * Check if email matches a generic pattern beyond just prefixes
 * @param {string} email - Email to check
 * @returns {boolean} True if generic/invalid
 */
function isCompanyPatternEmail(email) {
  if (!email) return true;
  const [localPart, domain] = email.toLowerCase().split('@');
  if (!domain) return true;
  const domainName = domain.split('.')[0];
  // company@company.tld pattern
  return localPart === domainName;
}


/**
 * Map all URLs on a domain using Firecrawl /map endpoint (fast, 1 credit)
 * @param {string} domain - Domain to map (e.g., "company.cz")
 * @returns {Promise<string[]>} - Array of discovered URLs
 */
async function mapDomain(domain, protocol = 'https') {
  console.log(`[Firecrawl] Mapping domain: ${domain} (${protocol})`);

  try {
    const result = await firecrawl.mapUrl(`${protocol}://${domain}`, {
      limit: 100 // Limit to 100 URLs for efficiency
    });

    if (!result.success) {
      throw new Error(result.error || 'Firecrawl map failed');
    }

    const urls = result.links || [];
    console.log(`[Firecrawl] Mapped ${urls.length} URLs from ${domain}`);
    return urls;
  } catch (error) {
    console.error(`[Firecrawl] Map error: ${error.message}`);
    return [];
  }
}

/**
 * Fetch a web page using Firecrawl (with JS rendering)
 * Firecrawl handles: JavaScript execution, proxy rotation, anti-bot bypassing
 * @param {string} url - Full URL to fetch
 * @param {number} timeout - Request timeout in ms (default: 30000)
 * @returns {Promise<string>} - HTML content
 */
async function fetchPage(url, timeout = 30000) {
  console.log(`[Firecrawl] Scraping: ${url}`);

  const result = await firecrawl.scrapeUrl(url, {
    formats: ['html'],
    waitFor: 3000, // Wait 3s for JS to render (raw HTTP fallback catches the rest)
    timeout: timeout
  });

  if (!result.success) {
    throw new Error(result.error || 'Firecrawl scrape failed');
  }

  let html = result.html || '';

  // If HTML is suspiciously short, try with www prefix (redirect issue)
  if (html.length < 500) {
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.startsWith('www.')) {
        const wwwUrl = url.replace(parsed.hostname, 'www.' + parsed.hostname);
        console.log(`[Firecrawl] Short HTML (${html.length} chars), retrying with www: ${wwwUrl}`);
        const retryResult = await firecrawl.scrapeUrl(wwwUrl, {
          formats: ['html'],
          waitFor: 5000,
          timeout: timeout
        });
        if (retryResult.success && (retryResult.html || '').length > html.length) {
          html = retryResult.html;
          console.log(`[Firecrawl] www retry got ${html.length} chars`);
        }
      }
    } catch (e) {
      console.warn(`[Firecrawl] www retry failed: ${e.message}`);
    }
  }

  console.log(`[Firecrawl] Success: ${url} (${html.length} chars)`);
  return html;
}

/**
 * Try fetching a URL with HTTPS first, then HTTP fallback.
 * Handles HTTP-only sites (common for older Czech businesses).
 * @param {string} domain - Bare domain (e.g., 'azadakstav.cz')
 * @param {string} path - URL path (default: '/')
 * @param {number} timeout - Request timeout in ms
 * @param {string} preferredProtocol - Which protocol to try first ('https' or 'http')
 * @returns {Promise<{html: string, url: string}|null>}
 */
async function rawFetchWithFallback(domain, path = '/', timeout = 15000, preferredProtocol = 'https') {
  const protocols = preferredProtocol === 'http' ? ['http', 'https'] : ['https', 'http'];

  for (const proto of protocols) {
    try {
      const url = `${proto}://${domain}${path}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadScraper/1.0)' },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeout)
      });
      const html = await res.text();
      if (html.length > 500) {
        console.log(`[WebScraper] Raw fetch success: ${url} (${html.length} chars)`);
        return { html, url };
      }
    } catch (err) {
      console.warn(`[WebScraper] Raw fetch failed for ${proto}://${domain}${path}: ${err.message}`);
    }
  }
  return null;
}


/**
 * Use AI to rank the TOP 3 best pages to scrape for contacts
 * Priority: TEAM > ABOUT > CONTACT
 * @param {string[]} urls - Array of discovered URLs
 * @returns {Promise<Array<{url: string, category: string}>>} - Ranked list of up to 3 pages
 */
async function rankBestPages(urls) {
  if (urls.length === 0) return [];

  // Filter out obviously useless URLs before ranking
  const filteredUrls = urls.filter(u => {
    const lower = u.toLowerCase();
    return !lower.includes('sitemap.xml') && !lower.includes('robots.txt') &&
           !lower.endsWith('.pdf') && !lower.endsWith('.jpg') && !lower.endsWith('.png');
  });

  // Limit URLs to avoid token overflow
  const urlList = filteredUrls.slice(0, 50).join('\n');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Rank the TOP 3 pages most likely to contain team member contact info (names, emails, phones).

PRIORITY ORDER:
1. TEAM - pages listing team members, employees, leadership, staff, founders
2. ABOUT - about us pages that might show founders/team
3. CONTACT - contact pages with people's info (not just forms)

URLs discovered on this company website:
${urlList}

Rules:
- Rank by likelihood of having INDIVIDUAL people with emails/phones
- Consider URL path keywords in any language
- Czech: tým=team, lidé=people, vedení=leadership, o-nas/o-nás=about, kontakt=contact
- IGNORE: services, products, blog, careers/jobs, legal, privacy, terms
- INCLUDE homepage (/) if it looks like it may contain team/people info (small company sites often show founders on homepage)

Return ONLY valid JSON array (no markdown), max 3 items:
[{"url": "https://...", "category": "TEAM|ABOUT|CONTACT"}, ...]

If NO pages fit, return: []`
      }]
    });

    const responseText = response.content[0].text.trim();

    // Parse JSON response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('[WebScraper] No JSON array in AI response for page ranking');
      return [];
    }

    const ranked = JSON.parse(jsonMatch[0]);

    // Filter valid entries and limit to 3
    let validRanked = ranked
      .filter(r => r.url && r.category)
      .slice(0, 3);

    // Validate ranked URLs against discovered URLs to prevent AI hallucinations
    // When mapDomain finds few URLs, the AI sometimes invents plausible subpages
    // that don't actually exist (e.g., /tym, /kontakt) — causing all fetches to fail
    const discoveredPathnames = new Set(urls.map(u => {
      try { return new URL(u).pathname.toLowerCase().replace(/\/+$/, '') || '/'; }
      catch { return null; }
    }).filter(Boolean));
    discoveredPathnames.add('/'); // Homepage is always valid

    const beforeCount = validRanked.length;
    validRanked = validRanked.filter(r => {
      try {
        const pathname = new URL(r.url).pathname.toLowerCase().replace(/\/+$/, '') || '/';
        const exists = discoveredPathnames.has(pathname);
        if (!exists) {
          console.warn(`[WebScraper] Filtered hallucinated URL: ${r.url} (not in ${urls.length} discovered URLs)`);
        }
        return exists;
      } catch { return false; }
    });

    if (beforeCount > validRanked.length) {
      console.log(`[WebScraper] Filtered ${beforeCount - validRanked.length} hallucinated URLs, ${validRanked.length} remain`);
    }

    console.log(`[WebScraper] AI ranked ${validRanked.length} pages:`, validRanked.map(r => `${r.category}: ${r.url}`));
    return validRanked;

  } catch (error) {
    console.error('[WebScraper] AI page ranking error:', error.message);
    return [];
  }
}

/**
 * Clean HTML to reduce size for Claude API
 * Removes scripts, styles, and excessive whitespace
 * @param {string} html - Raw HTML
 * @returns {string} - Cleaned HTML
 */
function cleanHtml(html) {
  return html
    // Remove script tags and content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove style tags and content
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, '')
    // Remove SVG content (often large)
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    // Remove noscript tags
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    // Remove empty tags
    .replace(/<(\w+)[^>]*>\s*<\/\1>/g, '')
    .trim();
}

/**
 * Extract contacts from HTML using Claude API
 * @param {string} html - Page HTML content
 * @param {Object} options - Extraction options
 * @param {boolean} options.keepGeneric - If true, keep generic emails (info@, etc.) in results
 * @returns {Promise<Array<{name: string, role: string, email: string, phone: string}>>}
 */
async function extractContactsWithClaude(html, options = {}) {
  const { keepGeneric = false } = options;

  // Clean and truncate HTML to fit in API limits
  const cleanedHtml = cleanHtml(html);
  const truncatedHtml = cleanedHtml.substring(0, 100000); // Increased from 50KB to 100KB

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', // Using Haiku for cost savings (~12x cheaper than Sonnet)
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `Extract team contacts from this company website HTML.

For each person found, extract:
- name: Full name (MUST be first name + last name if available, e.g. "Jan Novák")
- firstName: First name only (e.g. "Jan")
- lastName: Last name only (e.g. "Novák") - set null if unknown
- role: Job title (keep original language)
- email: Email address (or null)
- phone: Phone number (or null)
- isDecisionMaker: true/false - Is this person a decision-maker who can authorize purchases?

DECISION-MAKER CRITERIA (isDecisionMaker = true):
- C-level executives (CEO, COO, CFO, CTO, CMO, etc.)
- Founders, owners, co-founders
- Directors, managing directors, board members
- Partners, principals, presidents
- Anyone in "management", "leadership", "vedení" (Czech)

CZECH DECISION-MAKER TITLES (always isDecisionMaker = true):
- jednatel / jednatelka = managing director / statutory director
- ředitel / ředitelka = director
- majitel / majitelka = owner
- zakladatel / zakladatelka = founder
- spoluzakladatel = co-founder
- společník = partner/shareholder
- generální ředitel = CEO
- obchodní ředitel = sales director
- výkonný ředitel = executive director
- vedoucí = head/leader (department head)

NOT a job title (ignore these, set role to null):
- "Kontakt" (just means "Contact" - it's a page label, not a role)
- "Napište nám" (means "Write to us")
- "Formulář" (means "Form")
- Any navigation label, section header, or page title

NOT decision-makers (isDecisionMaker = false):
- Individual contributors (developers, designers, copywriters)
- Specialists, consultants, assistants
- Junior/entry-level roles (junior, trainee, intern, stážista)
- Support staff
- Project managers (projektový manažer) - unless "senior" or "head of"

NAME EXTRACTION RULES:
- If you see a first name displayed (e.g. "Standa", "Jakub", "Petra") next to a photo or role, ALWAYS extract it as firstName
- If only a first name is visible (no last name), still extract the person with lastName: null
- This is CRITICAL for Czech agency team pages that often show first names only with photos
- Look for names in image alt text, captions, headings, and team member cards

EXTRACTION RULES:
1. Extract EVERY person visible on the page (even with first name only)
2. Include ALL emails found (even generic like info@)
3. Sort by importance: decision-makers first
4. Keep job titles in their original language
5. If a name appears with a role but the "role" is actually a page heading like "Kontakt" or a navigation item, set role to null

GENERIC EMAIL ASSOCIATION:
- Generic emails are: info@, kontakt@, contact@, office@, support@, sales@, hello@, obchod@, etc.
- If a generic email appears DIRECTLY with a person's name and their contact details
  (same visual block, card, or section), set "emailAssociatedWithPerson": true
- This means the person personally uses this email, not just the company
- Example: A contact page showing "Lucie Novak, CEO, info@company.cz, +420..."
  → emailAssociatedWithPerson: true (the email belongs to Lucie specifically)
- If the generic email is separate from people (e.g., in footer, standalone contact form,
  or listed without a specific person's name), set emailAssociatedWithPerson: false or omit

Return ONLY a JSON array:
[{"name": "Petr Novák", "firstName": "Petr", "lastName": "Novák", "role": "CEO", "email": "info@company.cz", "phone": "+420123456789", "isDecisionMaker": true, "emailAssociatedWithPerson": true}]

Example with first-name-only:
[{"name": "Standa", "firstName": "Standa", "lastName": null, "role": "Creative Director", "email": null, "phone": null, "isDecisionMaker": false}]

Return [] if no people found.

HTML:
${truncatedHtml}`
      }]
    });

    // Parse Claude's response
    const responseText = response.content[0].text.trim();

    // Try to extract JSON from the response (in case there's extra text)
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('No JSON array found in Claude response');
      return [];
    }

    const contacts = JSON.parse(jsonMatch[0]);

    return contacts
      .filter(contact => contact.name && typeof contact.name === 'string' && contact.name.length >= 2)
      .map(contact => {
        const isAssociatedWithPerson = contact.emailAssociatedWithPerson === true;
        return {
          name: sanitizeContactField(contact.name),
          firstName: sanitizeContactField(contact.firstName) || null,
          lastName: sanitizeContactField(contact.lastName) || null,
          role: sanitizeContactField(contact.role),
          // Keep email if associated with person (even generic), otherwise filter generics
          email: isAssociatedWithPerson
            ? sanitizeEmail(contact.email, true) // Skip company-pattern filter for associated emails
            : (keepGeneric ? sanitizeEmail(contact.email) : filterGenericEmail(contact.email)),
          phone: sanitizeContactField(contact.phone),
          // Claude determines if this person is a decision-maker (can authorize purchases)
          isDecisionMaker: contact.isDecisionMaker === true,
          // Track if this generic email is personally associated with this contact
          emailAssociatedWithPerson: isAssociatedWithPerson
        };
      })
      .filter(contact => contact.name);

  } catch (error) {
    console.error('Claude API error:', error.message);
    return [];
  }
}

/**
 * Check if an email is generic (info@, support@, etc.)
 * @param {string} email - Email to check
 * @returns {boolean} True if generic
 */
function isGenericEmail(email) {
  if (!email) return true;
  const lower = email.toLowerCase();
  return GENERIC_EMAIL_PREFIXES.some(prefix => lower.startsWith(prefix)) ||
         lower.includes('example.com');
}

/**
 * Filter out generic email, return sanitized email or null
 * @param {string} email - Email to filter
 * @returns {string|null} Cleaned email or null if generic/invalid
 */
function filterGenericEmail(email) {
  if (!email) return null;

  // First sanitize (removes URL encoding, HTML artifacts, extracts valid email)
  const sanitized = sanitizeEmail(email);
  if (!sanitized) return null;

  // Then check if it's a generic prefix
  return isGenericEmail(sanitized) ? null : sanitized;
}

/**
 * Extract email addresses from HTML using regex (backup verification)
 * @param {string} html - Raw HTML content
 * @returns {string[]} - Array of personal email addresses found
 */
function extractEmailsFromHtml(html) {
  // First decode any URL-encoded content in HTML
  let decodedHtml = html;
  try {
    decodedHtml = decodeURIComponent(html.replace(/\+/g, ' '));
  } catch (e) {
    // If full decode fails, just handle common patterns
    decodedHtml = html.replace(/%40/g, '@').replace(/%20/g, '');
  }

  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = decodedHtml.match(emailRegex) || [];

  const validEmails = [];
  for (const rawEmail of [...new Set(matches)]) {
    // Sanitize each email
    const sanitized = sanitizeEmail(rawEmail);
    if (!sanitized) continue;

    // Filter out generic emails
    if (isGenericEmail(sanitized)) continue;

    // Filter out image/file references with @ (e.g., logo@2x.png)
    if (/\.(png|jpg|jpeg|gif|svg|webp|ico|css|js)$/i.test(sanitized)) continue;

    // Filter out obviously fake/placeholder emails
    if (/example\.|test@|placeholder|jmenujise@/i.test(sanitized)) continue;

    validEmails.push(sanitized);
  }

  return [...new Set(validEmails)]; // Dedupe again after sanitization
}

/**
 * Try to guess a name from an email address (firstname.lastname@domain)
 * @param {string} email - Email address
 * @returns {string|null} Guessed name or null
 */
function guessNameFromEmail(email) {
  const localPart = email.split('@')[0];
  const nameParts = localPart.split(/[._-]/);
  if (nameParts.length < 2) return null;

  return nameParts
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Verify Claude extracted all emails visible in HTML
 * @param {Array} contacts - Contacts extracted by Claude
 * @param {string} html - Original HTML content
 * @returns {Array} - Contacts with any missed emails added
 */
function verifyAndAddMissedContacts(contacts, html) {
  const htmlEmails = extractEmailsFromHtml(html);
  const extractedEmails = new Set(contacts.map(c => c.email?.toLowerCase()).filter(Boolean));

  const missedEmails = htmlEmails.filter(email => !extractedEmails.has(email.toLowerCase()));

  if (missedEmails.length > 0) {
    console.log(`[WebScraper] Found ${missedEmails.length} additional emails: ${missedEmails.join(', ')}`);

    for (const email of missedEmails) {
      contacts.push({
        name: guessNameFromEmail(email) || 'Unknown',
        role: null,
        email: email,
        phone: null
      });
    }
  }

  return contacts;
}

/**
 * Normalize a name for matching (lowercase, remove diacritics, trim)
 * @param {string} name - Name to normalize
 * @returns {string} Normalized name
 */
function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z\s]/g, '') // Keep only letters and spaces
    .trim();
}

/**
 * Extract surname from email (e.g., "rojek@company.cz" -> "rojek")
 * @param {string} email - Email address
 * @returns {string|null} Extracted surname or null
 */
function extractSurnameFromEmail(email) {
  if (!email) return null;
  const localPart = email.split('@')[0].toLowerCase();
  // Common patterns: surname, firstname.surname, f.surname
  const parts = localPart.split(/[._-]/);
  // Return the last part as potential surname
  return parts[parts.length - 1];
}

/**
 * Check if a name contains a surname that matches the email
 * @param {string} name - Full name
 * @param {string} email - Email address
 * @returns {boolean} True if name likely matches email
 */
function nameMatchesEmail(name, email) {
  if (!name || !email) return false;

  const normalizedName = normalizeName(name);
  const surname = extractSurnameFromEmail(email);

  if (!surname || surname.length < 3) return false;

  // Check if the surname appears in the normalized name
  return normalizedName.includes(surname);
}

/**
 * Deduplicate and merge contacts by email, name, or email-name matching
 * Handles cases where name is on one page and email is on another
 * @param {Array} contacts - Array of contact objects
 * @returns {Array} - Deduplicated and merged contacts
 */
function deduplicateContacts(contacts) {
  const byEmail = new Map(); // email -> contact
  const byName = new Map();  // normalized name -> contact
  const result = [];

  // First pass: collect all contacts by email and name
  for (const contact of contacts) {
    const email = contact.email?.toLowerCase();
    const normalizedName = normalizeName(contact.name);

    if (email && byEmail.has(email)) {
      // Merge with existing email match
      const existing = byEmail.get(email);
      byEmail.set(email, mergeContacts(existing, contact));
    } else if (email) {
      byEmail.set(email, contact);
    }

    if (normalizedName && normalizedName.length > 2) {
      if (byName.has(normalizedName)) {
        // Merge with existing name match
        const existing = byName.get(normalizedName);
        byName.set(normalizedName, mergeContacts(existing, contact));
      } else {
        byName.set(normalizedName, contact);
      }
    }
  }

  // Second pass: try to match names with emails (cross-page merging)
  // e.g., "Miroslav Rojek" from /tym matches "rojek@company.cz" from /kontakt
  for (const [email, emailContact] of byEmail) {
    let merged = false;
    for (const [name, nameContact] of byName) {
      if (nameMatchesEmail(nameContact.name, email)) {
        // Found a match! Merge the contacts
        const mergedContact = mergeContacts(nameContact, emailContact);
        result.push(mergedContact);
        byName.delete(name); // Remove from name map so we don't add it twice
        merged = true;
        break;
      }
    }
    if (!merged) {
      result.push(emailContact);
    }
  }

  // Add remaining name-only contacts
  for (const contact of byName.values()) {
    // Check if this contact wasn't already merged via email match
    const hasEmail = result.some(c =>
      c.email && normalizeName(c.name) === normalizeName(contact.name)
    );
    if (!hasEmail) {
      result.push(contact);
    }
  }

  return result;
}

/**
 * Merge two contacts, preferring non-null values and better roles
 * @param {Object} a - First contact
 * @param {Object} b - Second contact
 * @returns {Object} Merged contact
 */
function mergeContacts(a, b) {
  // Prefer the role from whichever contact is marked as decision-maker
  // Otherwise prefer the longer/more specific role
  let role = a.role || b.role;
  if (a.role && b.role) {
    if (b.isDecisionMaker && !a.isDecisionMaker) {
      role = b.role;
    } else if (a.isDecisionMaker && !b.isDecisionMaker) {
      role = a.role;
    } else if (b.role.length > a.role.length) {
      role = b.role;
    }
  }

  return {
    name: a.name || b.name,
    role: role,
    email: a.email || b.email,
    phone: a.phone || b.phone,
    // Either contact being a decision-maker means the merged one is
    isDecisionMaker: a.isDecisionMaker || b.isDecisionMaker,
    // Preserve any additional fields
    ...(a.email_valid !== undefined && { email_valid: a.email_valid || b.email_valid }),
    ...(a.phone_valid !== undefined && { phone_valid: a.phone_valid || b.phone_valid })
  };
}

/**
 * Check if contacts have usable contact info (email or phone)
 * @param {Array} contacts - Array of contact objects
 * @returns {boolean} True if at least one contact has email or phone
 */
function hasUsableContacts(contacts) {
  return contacts.some(c => c.email || c.phone);
}

/**
 * Main function: Scrape contacts from a domain
 * Uses Firecrawl /map to discover URLs, ranks top 3 pages, scrapes ALL of them,
 * and merges contacts across pages.
 *
 * @param {string} domain - Company domain (e.g., "ppcone.cz")
 * @param {Object} options - Scraping options
 * @param {boolean} options.validateResults - Whether to validate emails/phones (default: true)
 * @param {number} options.maxAttempts - Max pages to scrape (default: 3)
 * @param {boolean} options.returnLog - Whether to return log object (default: false for backwards compat)
 * @returns {Promise<Array|{contacts: Array, log: Object}>}
 */
async function scrapeTeamPages(domain, options = {}) {
  const { validateResults = true, maxAttempts = 3, returnLog = false, preferredProtocol = 'https' } = options;

  // Initialize log object with detailed tracking
  const log = {
    urlsDiscovered: 0,
    pagesRanked: [],
    pagesScraped: [],
    contactsRaw: [],
    contactsKept: [],
    genericEmailsFound: [],      // Track generic emails (kept as fallback)
    genericEmailsOnly: false,    // Flag when only generic emails available
    decisionMakerFound: false,   // Track if we found a CEO/founder
    decisionMakerReason: null,   // Why no DM found (e.g., "no matching titles on pages X, Y, Z")
    crossPageMerges: 0,          // Count of contacts merged across pages
    result: null,
    error: null
  };

  console.log(`[WebScraper] Starting scrape for: ${domain}`);

  // Step 1: Use /map to discover all URLs (1 credit, fast)
  const allUrls = await mapDomain(domain, preferredProtocol);
  log.urlsDiscovered = allUrls.length;

  if (allUrls.length === 0) {
    console.warn(`[WebScraper] No URLs found for ${domain}`);
    log.result = 'no_urls';
    log.error = 'Firecrawl could not map this domain';
    log.decisionMakerReason = 'Could not access website';
    return returnLog ? { contacts: [], log } : [];
  }

  // Step 2: Use AI to rank top 3 pages (Team > About > Contact)
  let rankedPages = await rankBestPages(allUrls);

  // Step 2.25: Ensure at least one CONTACT page is included (bonus 4th scrape)
  const hasContactPage = rankedPages.some(p => p.category === 'CONTACT');
  if (!hasContactPage && rankedPages.length > 0) {
    // Normalize to pathnames to handle AI returning different URL formats
    const rankedPathnames = new Set(rankedPages.map(p => {
      try { return new URL(p.url).pathname.toLowerCase().replace(/\/$/, ''); }
      catch { return p.url.toLowerCase(); }
    }));
    const contactUrl = allUrls.find(url => {
      try {
        const pathname = new URL(url).pathname.toLowerCase().replace(/\/$/, '');
        if (rankedPathnames.has(pathname)) return false; // skip URLs already ranked (avoids duplicates)
        return CONTACT_URL_SUFFIXES.some(suffix => pathname.endsWith(suffix));
      } catch { return false; }
    });

    if (contactUrl) {
      rankedPages.push({ url: contactUrl, category: 'CONTACT' });
      console.log(`[WebScraper] Added CONTACT page: ${contactUrl} (bonus scrape)`);
    }
  }

  log.pagesRanked = rankedPages.map(p => ({ url: p.url, category: p.category }));

  // Step 2.5: Fallback to homepage if no relevant pages found, or ensure homepage for small sites
  const findHomepageUrl = () => allUrls.find(url => {
    try {
      const parsed = new URL(url);
      return parsed.pathname === '/' || parsed.pathname === '';
    } catch { return false; }
  }) || `${preferredProtocol}://${domain}`;

  const homepageInRanked = rankedPages.some(p => {
    try { const pn = new URL(p.url).pathname.replace(/\/+$/, ''); return pn === '' || pn === '/'; }
    catch { return false; }
  });

  if (rankedPages.length === 0) {
    console.log(`[WebScraper] No team/about/contact pages found, falling back to homepage for ${domain}`);
    const homepageUrl = findHomepageUrl();
    rankedPages = [{ url: homepageUrl, category: 'HOMEPAGE' }];
    log.pagesRanked = [{ url: homepageUrl, category: 'HOMEPAGE (fallback)' }];
    log.homepageFallback = true;
  } else if (allUrls.length <= 3 && !homepageInRanked) {
    // Small sites (3 or fewer pages) almost always have contact info on the homepage
    const homepageUrl = findHomepageUrl();
    rankedPages.push({ url: homepageUrl, category: 'HOMEPAGE' });
    console.log(`[WebScraper] Small site (${allUrls.length} URLs), adding homepage: ${homepageUrl}`);
  }

  // Step 3: Scrape ALL ranked pages and collect contacts
  // Allow bonus contact page to exceed maxAttempts by 1
  const scrapeLimit = Math.min(rankedPages.length, maxAttempts + (hasContactPage ? 0 : 1));
  let allContactsRaw = [];
  let allGenericEmails = [];

  for (let i = 0; i < scrapeLimit; i++) {
    const page = rankedPages[i];
    console.log(`[WebScraper] Scraping page ${i + 1}/${rankedPages.length}: ${page.category} - ${page.url}`);

    const pageLog = { url: page.url, category: page.category, status: 'pending', contactsFound: 0, genericEmails: [] };

    try {
      // Scrape the page (1 credit per page)
      const html = await fetchPage(page.url);
      pageLog.status = 'scraped';

      // Extract contacts (includes generic emails at this stage)
      let contacts = await extractContactsWithClaude(html, { keepGeneric: true });

      // Track raw contacts before filtering
      for (const c of contacts) {
        log.contactsRaw.push({ name: c.name, role: c.role, email: c.email, phone: c.phone, page: page.url });
      }

      // Also extract emails from raw HTML (backup)
      const htmlEmails = extractEmailsFromHtmlWithGeneric(html);
      for (const email of htmlEmails.generic) {
        if (!allGenericEmails.includes(email)) {
          allGenericEmails.push(email);
          pageLog.genericEmails.push(email);
        }
      }

      contacts = verifyAndAddMissedContacts(contacts, html);
      pageLog.contactsFound = contacts.length;

      console.log(`[WebScraper] Found ${contacts.length} contacts from ${page.category} page`);

      // Collect all contacts for cross-page merging
      allContactsRaw.push(...contacts);
      pageLog.status = contacts.length > 0 ? 'success' : 'no_contacts';

    } catch (error) {
      console.warn(`[WebScraper] Could not fetch ${page.url}: ${error.message}`);
      pageLog.status = 'error';
      pageLog.error = error.message;
    }

    log.pagesScraped.push(pageLog);
  }

  // Step 3.1: If ALL ranked page fetches failed, try homepage directly via Firecrawl
  const allPagesFailed = log.pagesScraped.length > 0 && log.pagesScraped.every(p => p.status === 'error');
  if (allPagesFailed) {
    const homepageUrl = findHomepageUrl();
    const alreadyTried = log.pagesScraped.some(p => {
      try { const pn = new URL(p.url).pathname.replace(/\/+$/, ''); return pn === '' || pn === '/'; }
      catch { return p.url === homepageUrl; }
    });

    if (!alreadyTried) {
      console.log(`[WebScraper] All ${log.pagesScraped.length} ranked pages failed, trying homepage: ${homepageUrl}`);
      const pageLog = { url: homepageUrl, category: 'HOMEPAGE (all-failed fallback)', status: 'pending', contactsFound: 0, genericEmails: [] };
      try {
        const html = await fetchPage(homepageUrl);
        pageLog.status = 'scraped';
        let contacts = await extractContactsWithClaude(html, { keepGeneric: true });
        for (const c of contacts) {
          log.contactsRaw.push({ name: c.name, role: c.role, email: c.email, phone: c.phone, page: homepageUrl });
        }
        const htmlEmails = extractEmailsFromHtmlWithGeneric(html);
        for (const email of htmlEmails.generic) {
          if (!allGenericEmails.includes(email)) {
            allGenericEmails.push(email);
            pageLog.genericEmails.push(email);
          }
        }
        contacts = verifyAndAddMissedContacts(contacts, html);
        pageLog.contactsFound = contacts.length;
        pageLog.status = contacts.length > 0 ? 'success' : 'no_contacts';
        allContactsRaw.push(...contacts);
      } catch (error) {
        console.warn(`[WebScraper] Homepage fallback also failed: ${error.message}`);
        pageLog.status = 'error';
        pageLog.error = error.message;
      }
      log.pagesScraped.push(pageLog);
    }
  }

  // Step 3.5: If Firecrawl found no personal contacts, try raw HTTP fetch of homepage
  // Many modern sites (Next.js, etc.) have CEO data in SSR HTML that gets replaced
  // by lazy-loaded JS during hydration — Firecrawl's JS rendering actually hides it
  const hasPersonalFromFirecrawl = allContactsRaw.some(c => c.email && !isGenericEmail(c.email));
  if (!hasPersonalFromFirecrawl) {
    // Step 3.5: Try raw HTTP fetch of homepage (with HTTPS→HTTP fallback)
    console.log(`[WebScraper] No personal contacts from Firecrawl, trying raw HTTP fetch of homepage`);
    const rawResult = await rawFetchWithFallback(domain, '/', 15000, preferredProtocol);

    if (rawResult) {
      const { html: rawHtml, url: homepageUrl } = rawResult;
      const rawPageLog = { url: homepageUrl, category: 'HOMEPAGE (raw fetch)', status: 'pending', contactsFound: 0, genericEmails: [] };

      // Extract contacts from raw SSR HTML
      let rawContacts = await extractContactsWithClaude(rawHtml, { keepGeneric: true });
      for (const c of rawContacts) {
        log.contactsRaw.push({ name: c.name, role: c.role, email: c.email, phone: c.phone, page: homepageUrl + ' (raw)' });
      }

      // Backup: regex email extraction
      const rawEmails = extractEmailsFromHtmlWithGeneric(rawHtml);
      for (const email of rawEmails.generic) {
        if (!allGenericEmails.includes(email)) {
          allGenericEmails.push(email);
          rawPageLog.genericEmails.push(email);
        }
      }

      rawContacts = verifyAndAddMissedContacts(rawContacts, rawHtml);
      rawPageLog.contactsFound = rawContacts.length;
      rawPageLog.status = rawContacts.length > 0 ? 'success' : 'no_contacts';

      if (rawContacts.length > 0) {
        console.log(`[WebScraper] Raw fetch found ${rawContacts.length} contacts!`);
      }

      allContactsRaw.push(...rawContacts);
      log.pagesScraped.push(rawPageLog);
    }

    // Step 3.6: Also try raw HTTP fetch of contact page URLs (FREE, no Firecrawl credits)
    // Always run — multilingual sites may have different contacts on different language pages
    // Exclude pages already successfully scraped (but retry failed ones)
    const scrapedUrls = new Set(log.pagesScraped.filter(p => p.status !== 'error').map(p => p.url));
    const contactPageUrls = allUrls.filter(url => {
      if (scrapedUrls.has(url)) return false;
      try {
        const pathname = new URL(url).pathname.toLowerCase().replace(/\/$/, '');
        return CONTACT_URL_SUFFIXES.some(suffix => pathname.endsWith(suffix));
      } catch { return false; }
    }).slice(0, 2); // limit to 2 contact page attempts

    for (const contactPageUrl of contactPageUrls) {
      try {
        console.log(`[WebScraper] Trying raw HTTP fetch of contact page: ${contactPageUrl}`);
        // Try the URL as-is first, then with opposite protocol
        let contactHtml = null;
        let fetchUrl = contactPageUrl;

        try {
          const contactRes = await fetch(contactPageUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadScraper/1.0)' },
            redirect: 'follow',
            signal: AbortSignal.timeout(15000)
          });
          contactHtml = await contactRes.text();
          if (contactHtml.length <= 500) contactHtml = null;
        } catch {
          // Try opposite protocol
          const altUrl = contactPageUrl.startsWith('https://')
            ? contactPageUrl.replace('https://', 'http://')
            : contactPageUrl.replace('http://', 'https://');
          try {
            const altRes = await fetch(altUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadScraper/1.0)' },
              redirect: 'follow',
              signal: AbortSignal.timeout(15000)
            });
            contactHtml = await altRes.text();
            if (contactHtml.length > 500) {
              fetchUrl = altUrl;
            } else {
              contactHtml = null;
            }
          } catch (altErr) {
            console.warn(`[WebScraper] Both protocols failed for contact page: ${contactPageUrl}`);
          }
        }

        if (contactHtml) {
          const contactPageLog = { url: fetchUrl, category: 'CONTACT (raw fetch)', status: 'pending', contactsFound: 0, genericEmails: [] };

          let contactContacts = await extractContactsWithClaude(contactHtml, { keepGeneric: true });
          for (const c of contactContacts) {
            log.contactsRaw.push({ name: c.name, role: c.role, email: c.email, phone: c.phone, page: fetchUrl + ' (raw)' });
          }

          const contactEmails = extractEmailsFromHtmlWithGeneric(contactHtml);
          for (const email of contactEmails.generic) {
            if (!allGenericEmails.includes(email)) {
              allGenericEmails.push(email);
              contactPageLog.genericEmails.push(email);
            }
          }

          contactContacts = verifyAndAddMissedContacts(contactContacts, contactHtml);
          contactPageLog.contactsFound = contactContacts.length;
          contactPageLog.status = contactContacts.length > 0 ? 'success' : 'no_contacts';

          if (contactContacts.length > 0) {
            console.log(`[WebScraper] Raw contact page fetch found ${contactContacts.length} contacts!`);
          }

          allContactsRaw.push(...contactContacts);
          log.pagesScraped.push(contactPageLog);
        }
      } catch (contactErr) {
        console.warn(`[WebScraper] Raw HTTP fetch of contact page failed: ${contactErr.message}`);
      }
    }
  }

  // Step 4: Merge contacts across all pages (handles name-email matching)
  const contactCountBefore = allContactsRaw.length;
  let mergedContacts = deduplicateContacts(allContactsRaw);
  log.crossPageMerges = contactCountBefore - mergedContacts.length;

  if (log.crossPageMerges > 0) {
    console.log(`[WebScraper] Merged ${log.crossPageMerges} contacts across pages`);
  }

  // Step 5: Separate personal vs generic emails
  // Personal emails (firstname@, etc.)
  const personalContacts = mergedContacts.filter(c => c.email && !isGenericEmail(c.email));
  // Generic emails associated with a specific person (e.g., "Lucie Novak" with info@company.cz)
  const personAssociatedGeneric = mergedContacts.filter(
    c => c.email && isGenericEmail(c.email) && c.emailAssociatedWithPerson && c.name
  );
  // Generic emails NOT associated with any person (for "General Contact" fallback)
  const unassociatedGeneric = mergedContacts.filter(
    c => c.email && isGenericEmail(c.email) && !c.emailAssociatedWithPerson
  );
  const noEmailContacts = mergedContacts.filter(c => !c.email && c.name);

  // Track unassociated generic emails (for fallback "General Contact")
  log.genericEmailsFound = [...new Set([
    ...unassociatedGeneric.map(c => c.email),
    ...allGenericEmails
  ])];

  // Contacts with usable emails = personal + person-associated generic
  const contactsWithEmail = [...personalContacts, ...personAssociatedGeneric];

  // Step 6: Determine final contacts
  let finalContacts;
  if (contactsWithEmail.length > 0) {
    // We have contacts with emails (personal or person-associated generic)
    finalContacts = [...contactsWithEmail, ...noEmailContacts];
    // Also include ONE unassociated generic email as supplementary contact point
    if (log.genericEmailsFound.length > 0) {
      finalContacts.push({
        name: 'General Contact',
        role: 'Company Email',
        email: log.genericEmailsFound[0],
        isGenericFallback: true
      });
    }
    log.result = 'success';
  } else if (noEmailContacts.length > 0) {
    // We have names but no personal/associated emails - keep them for Hunter lookup
    // Also include ONE generic email as fallback contact point
    finalContacts = [...noEmailContacts];
    if (log.genericEmailsFound.length > 0) {
      finalContacts.push({
        name: 'General Contact',
        role: 'Company Email',
        email: log.genericEmailsFound[0],
        isGenericFallback: true
      });
    }
    log.result = 'partial';
    log.genericEmailsOnly = true;
  } else if (log.genericEmailsFound.length > 0) {
    // Only unassociated generic emails found - return as fallback
    finalContacts = [{
      name: 'General Contact',
      role: 'Company Email',
      email: log.genericEmailsFound[0],
      isGenericFallback: true
    }];
    log.result = 'generic_only';
    log.genericEmailsOnly = true;
  } else {
    finalContacts = [];
    log.result = 'no_contacts';
    log.error = 'No contacts or emails found on any scraped page';
  }

  // Step 7: Check for decision-makers (using Claude's classification, not regex)
  const decisionMakers = finalContacts.filter(c => c.isDecisionMaker === true);

  if (decisionMakers.length > 0) {
    log.decisionMakerFound = true;
    log.decisionMakersCount = decisionMakers.length;
    console.log(`[WebScraper] Decision-maker found: ${decisionMakers[0].name} (${decisionMakers[0].role})`);
  } else {
    log.decisionMakerFound = false;
    // Build reason why no DM found
    const pagesScrapedStr = log.pagesScraped.map(p => p.url).join(', ');
    const rolesFound = log.contactsRaw.map(c => c.role).filter(Boolean);
    if (rolesFound.length > 0) {
      log.decisionMakerReason = `Claude found no decision-makers among ${finalContacts.length} contacts. Roles seen: ${[...new Set(rolesFound)].slice(0, 5).join(', ')}. Pages scraped: ${pagesScrapedStr}`;
    } else if (log.contactsRaw.length > 0) {
      log.decisionMakerReason = `Found ${log.contactsRaw.length} contacts but no job titles extracted. Pages scraped: ${pagesScrapedStr}`;
    } else {
      log.decisionMakerReason = `No contacts found on pages: ${pagesScrapedStr}`;
    }
  }

  // Track which contacts were kept
  for (const contact of finalContacts) {
    if (contact.email && !contact.isGenericFallback) {
      log.contactsKept.push({ name: contact.name, role: contact.role, email: contact.email });
    }
  }

  console.log(`[WebScraper] Final: ${finalContacts.length} contacts (${personalContacts.length} personal, ${personAssociatedGeneric.length} person-associated generic, ${noEmailContacts.length} names only, ${log.genericEmailsFound.length} unassociated generic)`);

  // Step 8: Optional validation
  if (validateResults) {
    for (const contact of finalContacts) {
      if (contact.email) {
        const emailResult = await validateEmail(contact.email);
        contact.email_valid = emailResult.valid;
      }
      if (contact.phone) {
        const phoneResult = validatePhone(contact.phone);
        contact.phone_valid = phoneResult.valid;
        if (phoneResult.normalized) {
          contact.phone = phoneResult.normalized;
        }
      }
    }
  }

  return returnLog ? { contacts: finalContacts, log } : finalContacts;
}

/**
 * Extract emails from HTML, separating personal from generic
 * @param {string} html - Raw HTML content
 * @returns {{personal: string[], generic: string[]}}
 */
function extractEmailsFromHtmlWithGeneric(html) {
  let decodedHtml = html;
  try {
    decodedHtml = decodeURIComponent(html.replace(/\+/g, ' '));
  } catch (e) {
    decodedHtml = html.replace(/%40/g, '@').replace(/%20/g, '');
  }

  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = decodedHtml.match(emailRegex) || [];

  const personal = [];
  const generic = [];

  for (const rawEmail of [...new Set(matches)]) {
    const sanitized = sanitizeEmail(rawEmail);
    if (!sanitized) continue;

    // Filter out image/file references
    if (/\.(png|jpg|jpeg|gif|svg|webp|ico|css|js)$/i.test(sanitized)) continue;
    if (/example\.|test@|placeholder|jmenujise@/i.test(sanitized)) continue;

    if (isGenericEmail(sanitized)) {
      if (!generic.includes(sanitized)) generic.push(sanitized);
    } else {
      if (!personal.includes(sanitized)) personal.push(sanitized);
    }
  }

  return { personal, generic };
}

module.exports = {
  // Core functions
  mapDomain,
  fetchPage,
  cleanHtml,
  scrapeTeamPages,

  // URL discovery & ranking
  rankBestPages,

  // Contact extraction
  extractContactsWithClaude,
  extractEmailsFromHtml,
  extractEmailsFromHtmlWithGeneric,
  verifyAndAddMissedContacts,
  deduplicateContacts,
  mergeContacts,
  guessNameFromEmail,
  hasUsableContacts,

  // Name/email matching
  normalizeName,
  extractSurnameFromEmail,
  nameMatchesEmail,

  // Utilities
  isGenericEmail,
  filterGenericEmail,
  sanitizeEmail,
  isCompanyPatternEmail,
  GENERIC_EMAIL_PREFIXES,
  PAGE_CATEGORIES,
  CONTACT_URL_SUFFIXES
};
