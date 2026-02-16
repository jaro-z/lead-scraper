/**
 * Web Scraper for Team/Contact Pages
 * PRD-WATERFALL-ENRICHMENT: Step 2 - Contact Discovery (FREE method)
 *
 * Uses Claude API to intelligently extract contact information from company websites.
 * Tries common team/about page patterns before falling back to paid APIs.
 */

const Anthropic = require('@anthropic-ai/sdk');
const { validateEmail, validatePhone } = require('./validators');

// Initialize Anthropic client (uses ANTHROPIC_API_KEY env var)
const anthropic = new Anthropic();

// Common team page URL patterns (Czech + English)
const TEAM_PAGE_PATTERNS = [
  '/nas-tym',
  '/o-nas',
  '/kontakt',
  '/kontakty',
  '/team',
  '/about',
  '/about-us',
  '/contact',
  '/contacts',
  '/our-team',
  '/people',
  '/crew',
  '/tym',
  '/vedeni',
  '/management'
];

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
 * Find potential team/contact page URLs from homepage HTML
 * @param {string} html - Homepage HTML content
 * @param {string} domain - Base domain (e.g., "company.cz")
 * @returns {string[]} - Array of full URLs to potential team pages
 */
function findTeamPageUrls(html, domain) {
  const urls = new Set();
  const baseUrl = `https://${domain}`;

  // Regex to find links in HTML
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
  let match;

  // Keywords that suggest team/contact pages (Czech + English)
  const teamKeywords = [
    'team', 'tym', 'tým', 'about', 'o nas', 'o nás', 'contact', 'kontakt',
    'people', 'lidé', 'lidi', 'vedení', 'vedeni', 'management', 'crew',
    'our team', 'náš tým', 'nas tym', 'who we are', 'kdo jsme'
  ];

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    const linkText = match[2].toLowerCase();

    // Check if link text contains team-related keywords
    const isTeamLink = teamKeywords.some(keyword =>
      linkText.includes(keyword) || href.toLowerCase().includes(keyword)
    );

    if (isTeamLink) {
      let fullUrl;
      if (href.startsWith('http')) {
        // Only include if it's the same domain
        if (href.includes(domain)) {
          fullUrl = href;
        }
      } else if (href.startsWith('/')) {
        fullUrl = baseUrl + href;
      } else if (!href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
        fullUrl = baseUrl + '/' + href;
      }

      if (fullUrl) {
        urls.add(fullUrl);
      }
    }
  }

  return Array.from(urls);
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
  const truncatedHtml = cleanedHtml.substring(0, 50000);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `Extract all team members/contacts from this company website HTML.
For each person, extract:
- name: Full name of the person
- role: Job title or position (CEO, Marketing Manager, etc.)
- email: Email address if visible
- phone: Phone number if visible

Important:
- Only extract REAL people with names, not generic "info@" or "support@" emails
- Extract all team members you can find
- If an email or phone is not available for a specific person, use null
- Return ONLY valid JSON, no other text

Return JSON array only in this exact format:
[{"name": "Petr Novák", "role": "CEO", "email": "petr@company.cz", "phone": "+420123456789"}]

If no specific contacts/team members found, return empty array: []

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

    // Validate and clean contacts
    return contacts.filter(contact => {
      // Must have a name
      if (!contact.name || typeof contact.name !== 'string' || contact.name.length < 2) {
        return false;
      }
      // Filter out generic emails
      if (contact.email) {
        const genericPrefixes = ['info@', 'kontakt@', 'contact@', 'office@', 'support@', 'sales@', 'hello@'];
        if (genericPrefixes.some(prefix => contact.email.toLowerCase().startsWith(prefix))) {
          contact.email = null;
        }
      }
      return true;
    }).map(contact => ({
      name: contact.name?.trim() || null,
      role: contact.role?.trim() || null,
      email: contact.email?.trim() || null,
      phone: contact.phone?.trim() || null
    }));

  } catch (error) {
    console.error('Claude API error:', error.message);
    return [];
  }
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
 * Main function: Scrape team/contact pages from a domain
 * @param {string} domain - Company domain (e.g., "ppcone.cz")
 * @param {Object} options - Scraping options
 * @param {boolean} options.validateResults - Whether to validate emails/phones (default: true)
 * @param {number} options.maxPages - Maximum pages to scrape (default: 10)
 * @returns {Promise<Array<{name: string, role: string, email: string, phone: string, email_valid?: boolean, phone_valid?: boolean}>>}
 */
async function scrapeTeamPages(domain, options = {}) {
  const { validateResults = true, maxPages = 10 } = options;
  const allContacts = [];
  const visitedUrls = new Set();

  console.log(`[WebScraper] Starting scrape for domain: ${domain}`);

  // Step 1: Fetch homepage and extract contacts directly from it
  // Many single-page sites have contact info on homepage (e.g., 2score.cz/#contact)
  let teamUrls = [];
  let homepage = null;
  try {
    homepage = await fetchPage(`https://${domain}`);

    // IMPORTANT: Extract contacts from homepage first (catches single-page sites)
    console.log(`[WebScraper] Extracting contacts from homepage...`);
    const homepageContacts = await extractContactsWithClaude(homepage);
    if (homepageContacts.length > 0) {
      console.log(`[WebScraper] Found ${homepageContacts.length} contacts on homepage`);
      allContacts.push(...homepageContacts);
    }

    teamUrls = findTeamPageUrls(homepage, domain);
    console.log(`[WebScraper] Found ${teamUrls.length} potential team page links from homepage`);
  } catch (error) {
    console.warn(`[WebScraper] Could not fetch homepage: ${error.message}`);
  }

  // Step 2: Add common URL patterns to try
  const patternsToTry = TEAM_PAGE_PATTERNS.map(p => `https://${domain}${p}`);

  // Combine found URLs with patterns, prioritizing found links
  const urlsToScrape = [...new Set([...teamUrls, ...patternsToTry])].slice(0, maxPages);

  // Step 3: Fetch and extract contacts from each page
  for (const url of urlsToScrape) {
    if (visitedUrls.has(url)) continue;
    visitedUrls.add(url);

    try {
      console.log(`[WebScraper] Fetching: ${url}`);
      const html = await fetchPage(url);

      // Only process if page seems to have content
      if (html.length > 500) {
        const contacts = await extractContactsWithClaude(html);
        console.log(`[WebScraper] Extracted ${contacts.length} contacts from ${url}`);
        allContacts.push(...contacts);
      }
    } catch (error) {
      // Page doesn't exist or error - continue silently
      console.log(`[WebScraper] Skipping ${url}: ${error.message}`);
    }

    // Small delay between requests to be polite
    await new Promise(r => setTimeout(r, 500));
  }

  // Step 4: Deduplicate contacts
  const uniqueContacts = deduplicateContacts(allContacts);
  console.log(`[WebScraper] Total unique contacts: ${uniqueContacts.length}`);

  // Step 5: Optionally validate emails and phones
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
  fetchPage,
  findTeamPageUrls,
  extractContactsWithClaude,
  scrapeTeamPages,
  cleanHtml,
  deduplicateContacts,
  TEAM_PAGE_PATTERNS
};
