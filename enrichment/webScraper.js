/**
 * Web Scraper for Team/Contact Pages
 * PRD-WATERFALL-ENRICHMENT: Step 2 - Contact Discovery (FREE method)
 *
 * Uses Claude API to intelligently extract contact information from company websites.
 * Tries common team/about page patterns before falling back to paid APIs.
 */

const Anthropic = require('@anthropic-ai/sdk');
const { validateEmail, validatePhone } = require('./validators');
const { sanitizeContactField } = require('../utils');

// Initialize Anthropic client (uses ANTHROPIC_API_KEY env var)
const anthropic = new Anthropic();

// Page category constants for logging
const PAGE_CATEGORIES = ['TEAM', 'CONTACT', 'ABOUT'];

// Generic email prefixes to filter out (not personal contacts)
const GENERIC_EMAIL_PREFIXES = [
  'info@', 'kontakt@', 'contact@', 'office@', 'support@',
  'sales@', 'hello@', 'obchod@', 'noreply@'
];

// File extensions and paths to skip when discovering URLs
const SKIP_EXTENSIONS = /\.(pdf|jpg|jpeg|png|gif|svg|webp|ico|css|js|woff|woff2|ttf|eot|xml|json|zip|rar)$/i;
const SKIP_PATHS = /\/(wp-content|wp-includes|assets|static|media|images|css|js)\//i;

/**
 * Fetch a web page with proper headers to avoid blocking
 * @param {string} url - Full URL to fetch
 * @param {number} timeout - Request timeout in ms (default: 10000)
 * @returns {Promise<string>} - HTML content
 */
async function fetchPage(url, timeout = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'cs,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      redirect: 'follow'
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Check if href should be skipped (non-page links, assets)
 * @param {string} href - The href value to check
 * @returns {boolean} True if should skip
 */
function shouldSkipHref(href) {
  return href.startsWith('mailto:') ||
         href.startsWith('tel:') ||
         href.startsWith('javascript:') ||
         SKIP_EXTENSIONS.test(href) ||
         SKIP_PATHS.test(href);
}

/**
 * Check if href is same domain (handles www variants)
 * @param {string} href - Full URL to check
 * @param {string} domain - Base domain
 * @returns {boolean} True if same domain
 */
function isSameDomain(href, domain) {
  try {
    const hrefDomain = new URL(href).hostname.replace(/^www\./, '');
    const baseDomain = domain.replace(/^www\./, '');
    return hrefDomain === baseDomain;
  } catch {
    return false;
  }
}

/**
 * Discover ALL internal URLs from homepage HTML
 * @param {string} html - Homepage HTML content
 * @param {string} domain - Base domain (e.g., "company.cz")
 * @returns {string[]} - Array of unique internal URLs (full URLs)
 */
function discoverAllInternalUrls(html, domain) {
  const urls = new Set();
  const baseUrl = `https://${domain}`;
  const hrefRegex = /href=["']([^"'#]+)["']/gi;

  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1];

    if (shouldSkipHref(href)) continue;

    let fullUrl;
    if (href.startsWith('http')) {
      if (isSameDomain(href, domain)) {
        fullUrl = href;
      }
    } else if (href.startsWith('/')) {
      fullUrl = baseUrl + href;
    }

    if (fullUrl) {
      const normalized = fullUrl.split('?')[0].replace(/\/$/, '');
      urls.add(normalized);
    }
  }

  return Array.from(urls);
}

/**
 * Use AI to categorize and select the ONE best page to scrape
 * Priority: TEAM > CONTACT > ABOUT
 * @param {string[]} urls - Array of discovered URLs
 * @param {string} html - Original homepage HTML (for link text extraction)
 * @returns {Promise<{url: string, category: string} | null>}
 */
async function categorizeAndSelectBestPage(urls, html) {
  if (urls.length === 0) return null;

  // Build href -> link text map from HTML for context
  const linkTextMap = new Map();
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    const text = match[2].trim();
    if (text && text.length < 100) {
      linkTextMap.set(href, text);
    }
  }

  // Build URL list with link text context
  const urlsWithContext = urls.map(url => {
    const path = new URL(url).pathname;
    // Find matching link text
    let linkText = null;
    for (const [href, text] of linkTextMap.entries()) {
      if (url.endsWith(href) || href === path || url.includes(href)) {
        linkText = text;
        break;
      }
    }
    return linkText ? `${url} (link text: "${linkText}")` : url;
  }).join('\n');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `Select the BEST page to find team/employee contact info.

PRIORITY (pick highest available):
1. TEAM - pages listing team members, employees, leadership, staff
2. CONTACT - contact pages with people's info (not just forms)
3. ABOUT - about us pages that might show founders/team

URLs discovered on this company website:
${urlsWithContext}

Rules:
- Pick ONE URL most likely to have individual people with emails
- Consider URL path AND link text
- Any language (Czech: tým=team, lidé=people, vedení=leadership, kontakt=contact, o nás=about)
- Ignore: homepage, services, products, blog, careers/jobs, legal pages

Return ONLY valid JSON (no markdown):
{"url": "https://...", "category": "TEAM|CONTACT|ABOUT"}

If NO page fits these categories, return:
{"url": null, "category": null}`
      }]
    });

    const responseText = response.content[0].text.trim();

    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[WebScraper] No JSON in AI response for page selection');
      return null;
    }

    const result = JSON.parse(jsonMatch[0]);

    if (result.url && result.category) {
      console.log(`[WebScraper] AI selected ${result.category} page: ${result.url}`);
      return { url: result.url, category: result.category };
    }

    return null;
  } catch (error) {
    console.error('[WebScraper] AI page selection error:', error.message);
    return null;
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
      model: 'claude-sonnet-4-20250514',
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
 * Main function: Scrape contacts from a domain (efficient single-page approach)
 * Discovers URLs from homepage, selects ONE best page (Team > Contact > About),
 * and sends only that page to Claude API.
 *
 * @param {string} domain - Company domain (e.g., "ppcone.cz")
 * @param {Object} options - Scraping options
 * @param {boolean} options.validateResults - Whether to validate emails/phones (default: true)
 * @returns {Promise<Array<{name: string, role: string, email: string, phone: string, email_valid?: boolean, phone_valid?: boolean}>>}
 */
async function scrapeTeamPages(domain, options = {}) {
  const { validateResults = true } = options;

  console.log(`[WebScraper] Starting scrape for: ${domain}`);

  // Step 1: Fetch homepage
  let homepage;
  try {
    homepage = await fetchPage(`https://${domain}`);
  } catch (error) {
    console.warn(`[WebScraper] Could not fetch homepage: ${error.message}`);
    return [];
  }

  // Step 2: Discover ALL internal URLs from homepage (no guessing!)
  const allUrls = discoverAllInternalUrls(homepage, domain);
  console.log(`[WebScraper] Discovered ${allUrls.length} internal URLs`);

  // Step 3: Use AI to select ONE best page (priority: Team > Contact > About)
  const bestPage = await categorizeAndSelectBestPage(allUrls, homepage);

  let htmlToScrape = homepage;
  let pageSource = 'homepage';

  if (bestPage) {
    console.log(`[WebScraper] Selected ${bestPage.category} page: ${bestPage.url}`);
    try {
      htmlToScrape = await fetchPage(bestPage.url);
      pageSource = bestPage.category;
    } catch (error) {
      console.warn(`[WebScraper] Could not fetch ${bestPage.url}, using homepage`);
      // Fall back to homepage
    }
  } else {
    console.log(`[WebScraper] No team/contact/about pages found, using homepage only`);
  }

  // Step 4: Extract contacts (SINGLE Claude API call - saves ~90% tokens)
  let contacts = await extractContactsWithClaude(htmlToScrape);
  contacts = verifyAndAddMissedContacts(contacts, htmlToScrape);

  const uniqueContacts = deduplicateContacts(contacts);
  console.log(`[WebScraper] Found ${uniqueContacts.length} unique contacts from ${pageSource}`);

  // Step 5: Optional validation
  if (validateResults) {
    for (const contact of uniqueContacts) {
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

  return uniqueContacts;
}

module.exports = {
  // Core functions
  fetchPage,
  cleanHtml,
  scrapeTeamPages,

  // URL discovery
  discoverAllInternalUrls,
  categorizeAndSelectBestPage,

  // Contact extraction
  extractContactsWithClaude,
  extractEmailsFromHtml,
  verifyAndAddMissedContacts,
  deduplicateContacts,
  guessNameFromEmail,

  // Utilities
  isGenericEmail,
  filterGenericEmail,
  GENERIC_EMAIL_PREFIXES,
  PAGE_CATEGORIES
};
