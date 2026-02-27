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
const firecrawl = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_API_KEY
});

// Initialize Anthropic client (uses ANTHROPIC_API_KEY env var)
const anthropic = new Anthropic();

// Page category constants for logging
const PAGE_CATEGORIES = ['TEAM', 'CONTACT', 'ABOUT'];

// Generic email prefixes to filter out (not personal contacts)
const GENERIC_EMAIL_PREFIXES = [
  'info@', 'kontakt@', 'contact@', 'office@', 'support@',
  'sales@', 'hello@', 'obchod@', 'noreply@'
];


/**
 * Map all URLs on a domain using Firecrawl /map endpoint (fast, 1 credit)
 * @param {string} domain - Domain to map (e.g., "company.cz")
 * @returns {Promise<string[]>} - Array of discovered URLs
 */
async function mapDomain(domain) {
  console.log(`[Firecrawl] Mapping domain: ${domain}`);

  try {
    const result = await firecrawl.mapUrl(`https://${domain}`, {
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
    waitFor: 3000, // Wait 3s for JS to render
    timeout: timeout
  });

  if (!result.success) {
    throw new Error(result.error || 'Firecrawl scrape failed');
  }

  console.log(`[Firecrawl] Success: ${url}`);
  return result.html || '';
}


/**
 * Use AI to rank the TOP 3 best pages to scrape for contacts
 * Priority: TEAM > ABOUT > CONTACT
 * @param {string[]} urls - Array of discovered URLs
 * @returns {Promise<Array<{url: string, category: string}>>} - Ranked list of up to 3 pages
 */
async function rankBestPages(urls) {
  if (urls.length === 0) return [];

  // Limit URLs to avoid token overflow
  const urlList = urls.slice(0, 50).join('\n');

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
- IGNORE: homepage (/), services, products, blog, careers/jobs, legal, privacy, terms

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
    const validRanked = ranked
      .filter(r => r.url && r.category)
      .slice(0, 3);

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
 * @returns {Promise<Array<{name: string, role: string, email: string, phone: string}>>}
 */
async function extractContactsWithClaude(html) {
  // Clean and truncate HTML to fit in API limits
  const cleanedHtml = cleanHtml(html);
  const truncatedHtml = cleanedHtml.substring(0, 100000); // Increased from 50KB to 100KB

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', // Using Haiku for cost savings (~12x cheaper than Sonnet)
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `Extract team contacts from this company website.

PRIORITY ORDER - List contacts in this order of importance:
1. CEO / Owner / Founder / Majitel / Jednatel / Zakladatel (HIGHEST)
2. COO / CFO / CTO / CMO / Directors / Ředitel
3. Managers and other team members

CRITICAL: Extract EVERY person visible. Do not stop after finding one.

Look for:
- People with photos, headshots, or profile cards
- People with job titles
- Anyone with email or phone shown
- Contact cards, team grids, footer sections

For each person, extract:
- name: Full name
- role: Job title (keep original language)
- email: Email (or null)
- phone: Phone (or null)

Rules:
- Include ALL people visible
- Skip generic emails: info@, kontakt@, support@, office@, obchod@
- Czech: jednatel=director, majitel=owner, ředitel=CEO/director
- Return sorted by PRIORITY above (CEO/owner first)

Return ONLY a JSON array:
[{"name": "Petr Novák", "role": "CEO", "email": "petr@company.cz", "phone": "+420123456789"}]

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
      .map(contact => ({
        name: sanitizeContactField(contact.name),
        role: sanitizeContactField(contact.role),
        email: filterGenericEmail(contact.email),
        phone: sanitizeContactField(contact.phone)
      }))
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
 * Filter out generic email, return trimmed email or null
 * @param {string} email - Email to filter
 * @returns {string|null} Cleaned email or null if generic
 */
function filterGenericEmail(email) {
  if (!email) return null;
  const trimmed = email.trim();
  return isGenericEmail(trimmed) ? null : trimmed;
}

/**
 * Extract email addresses from HTML using regex (backup verification)
 * @param {string} html - Raw HTML content
 * @returns {string[]} - Array of personal email addresses found
 */
function extractEmailsFromHtml(html) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = html.match(emailRegex) || [];

  return [...new Set(matches)].filter(email => !isGenericEmail(email));
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
 * Deduplicate contacts by email (or name if no email)
 * @param {Array} contacts - Array of contact objects
 * @returns {Array} - Deduplicated contacts
 */
function deduplicateContacts(contacts) {
  const seen = new Map();

  for (const contact of contacts) {
    // Use email as primary key, fall back to lowercase name
    const key = contact.email
      ? contact.email.toLowerCase()
      : contact.name?.toLowerCase();

    if (!key) continue;

    if (!seen.has(key)) {
      seen.set(key, contact);
    } else {
      // Merge: prefer non-null values
      const existing = seen.get(key);
      seen.set(key, {
        name: existing.name || contact.name,
        role: existing.role || contact.role,
        email: existing.email || contact.email,
        phone: existing.phone || contact.phone
      });
    }
  }

  return Array.from(seen.values());
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
 * Main function: Scrape contacts from a domain with retry loop
 * Uses Firecrawl /map to discover URLs, ranks top 3 pages, and tries each
 * until contacts with email/phone are found.
 *
 * @param {string} domain - Company domain (e.g., "ppcone.cz")
 * @param {Object} options - Scraping options
 * @param {boolean} options.validateResults - Whether to validate emails/phones (default: true)
 * @param {number} options.maxAttempts - Max pages to try before giving up (default: 3)
 * @returns {Promise<Array<{name: string, role: string, email: string, phone: string, email_valid?: boolean, phone_valid?: boolean}>>}
 */
async function scrapeTeamPages(domain, options = {}) {
  const { validateResults = true, maxAttempts = 3 } = options;

  console.log(`[WebScraper] Starting scrape for: ${domain}`);

  // Step 1: Use /map to discover all URLs (1 credit, fast)
  const allUrls = await mapDomain(domain);

  if (allUrls.length === 0) {
    console.warn(`[WebScraper] No URLs found for ${domain}`);
    return [];
  }

  // Step 2: Use AI to rank top 3 pages (Team > About > Contact)
  const rankedPages = await rankBestPages(allUrls);

  if (rankedPages.length === 0) {
    console.warn(`[WebScraper] No relevant pages found for ${domain}`);
    return [];
  }

  // Step 3: Try each ranked page until we find contacts with email/phone
  let allContacts = [];
  let successfulPage = null;

  for (let i = 0; i < Math.min(rankedPages.length, maxAttempts); i++) {
    const page = rankedPages[i];
    console.log(`[WebScraper] Attempt ${i + 1}/${rankedPages.length}: Trying ${page.category} page: ${page.url}`);

    try {
      // Scrape the page (1 credit per page)
      const html = await fetchPage(page.url);

      // Extract contacts
      let contacts = await extractContactsWithClaude(html);
      contacts = verifyAndAddMissedContacts(contacts, html);
      const uniqueContacts = deduplicateContacts(contacts);

      console.log(`[WebScraper] Found ${uniqueContacts.length} contacts from ${page.category} page`);

      // Check if we found usable contacts (with email or phone)
      if (hasUsableContacts(uniqueContacts)) {
        console.log(`[WebScraper] Success! Found contacts with email/phone on ${page.category} page`);
        allContacts = uniqueContacts;
        successfulPage = page;
        break; // Stop trying more pages
      } else {
        console.log(`[WebScraper] No email/phone found on ${page.category} page, trying next...`);
        // Keep contacts in case we need them as fallback
        if (uniqueContacts.length > allContacts.length) {
          allContacts = uniqueContacts;
        }
      }
    } catch (error) {
      console.warn(`[WebScraper] Could not fetch ${page.url}: ${error.message}`);
      continue;
    }
  }

  if (successfulPage) {
    console.log(`[WebScraper] Final: ${allContacts.length} contacts from ${successfulPage.category} page`);
  } else if (allContacts.length > 0) {
    console.log(`[WebScraper] Fallback: ${allContacts.length} contacts (no email/phone found)`);
  } else {
    console.log(`[WebScraper] No contacts found after ${maxAttempts} attempts`);
  }

  // Step 4: Optional validation
  if (validateResults) {
    for (const contact of allContacts) {
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

  return allContacts;
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
  verifyAndAddMissedContacts,
  deduplicateContacts,
  guessNameFromEmail,
  hasUsableContacts,

  // Utilities
  isGenericEmail,
  filterGenericEmail,
  GENERIC_EMAIL_PREFIXES,
  PAGE_CATEGORIES
};
