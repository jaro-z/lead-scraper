/**
 * Contact Waterfall - Waterfall Contact Discovery
 * PRD-WATERFALL-ENRICHMENT: Step 2 - Contact Discovery
 *
 * Implements waterfall approach: Try FREE methods first,
 * fallback to PAID APIs only when necessary.
 *
 * Waterfall order:
 * 1. Web scraping (FREE) - scrape team/contact pages
 * 2. Hunter.io API (PAID) - fallback if no contacts found
 */

const webScraper = require('./webScraper');
const hunter = require('../hunter');

/**
 * Discover contacts for a company using waterfall approach
 * @param {number|string} companyId - Company ID in database
 * @param {string} domain - Company domain (e.g., 'example.cz')
 * @param {string} hunterApiKey - Hunter.io API key for paid fallback
 * @returns {Promise<{source: 'web_scrape'|'hunter'|null, contacts: Array}>}
 */
async function discoverContacts(companyId, domain, hunterApiKey) {
  if (!domain) {
    return { source: null, contacts: [], error: 'No domain provided' };
  }

  // Clean domain (remove protocol, www, trailing slashes)
  const cleanDomain = domain
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');

  // Step 1: Try web scraping (FREE)
  try {
    const scrapedContacts = await webScraper.scrapeTeamPages(cleanDomain);

    if (scrapedContacts && scrapedContacts.length > 0) {
      console.log(`[Waterfall] Found ${scrapedContacts.length} contacts via web scrape for ${cleanDomain}`);
      return {
        source: 'web_scrape',
        contacts: normalizeContacts(scrapedContacts, 'web_scrape'),
        companyId
      };
    }
  } catch (error) {
    console.warn(`[Waterfall] Web scraping failed for ${cleanDomain}:`, error.message);
    // Continue to fallback
  }

  // Step 2: Fallback to Hunter.io (PAID)
  if (hunterApiKey) {
    try {
      const hunterResult = await hunter.domainSearch(cleanDomain, hunterApiKey);
      const hunterContacts = hunterResult.emails || [];

      if (hunterContacts.length > 0) {
        console.log(`[Waterfall] Found ${hunterContacts.length} contacts via Hunter.io for ${cleanDomain}`);
        return {
          source: 'hunter',
          contacts: normalizeContacts(hunterContacts, 'hunter'),
          companyId,
          organization: hunterResult.organization
        };
      }
    } catch (error) {
      console.warn(`[Waterfall] Hunter.io failed for ${cleanDomain}:`, error.message);
    }
  } else {
    console.log(`[Waterfall] No Hunter API key provided, skipping paid fallback for ${cleanDomain}`);
  }

  // No contacts found
  console.log(`[Waterfall] No contacts found for ${cleanDomain}`);
  return { source: null, contacts: [], companyId };
}

/**
 * Normalize contacts from different sources to a common format
 * @param {Array} contacts - Raw contacts from source
 * @param {string} source - Source identifier ('web_scrape' | 'hunter')
 * @returns {Array} Normalized contacts
 */
function normalizeContacts(contacts, source) {
  return contacts.map(contact => {
    // Handle web scraper format
    if (source === 'web_scrape') {
      return {
        name: contact.name || null,
        firstName: contact.firstName || extractFirstName(contact.name),
        lastName: contact.lastName || extractLastName(contact.name),
        email: contact.email || null,
        phone: contact.phone || null,
        title: contact.role || contact.title || null,
        source: 'web_scrape',
        confidence: contact.confidence || 50 // Default confidence for scraped data
      };
    }

    // Handle Hunter.io format
    if (source === 'hunter') {
      return {
        name: contact.fullName || [contact.firstName, contact.lastName].filter(Boolean).join(' '),
        firstName: contact.firstName || null,
        lastName: contact.lastName || null,
        email: contact.email || null,
        phone: null, // Hunter doesn't provide phone
        title: contact.title || contact.position || null,
        source: 'hunter',
        confidence: contact.confidence || 0
      };
    }

    return contact;
  });
}

/**
 * Extract first name from full name
 * @param {string} fullName - Full name string
 * @returns {string|null}
 */
function extractFirstName(fullName) {
  if (!fullName) return null;
  const parts = fullName.trim().split(/\s+/);
  return parts[0] || null;
}

/**
 * Extract last name from full name
 * @param {string} fullName - Full name string
 * @returns {string|null}
 */
function extractLastName(fullName) {
  if (!fullName) return null;
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : null;
}

/**
 * Discover contacts for multiple companies in batch
 * @param {Array<{id: number, domain: string}>} companies - Array of companies
 * @param {string} hunterApiKey - Hunter.io API key
 * @param {Object} options - Batch options
 * @param {number} options.delayMs - Delay between requests (default: 1000ms)
 * @param {Function} options.onProgress - Progress callback
 * @returns {Promise<Map<number, {source: string, contacts: Array}>>}
 */
async function discoverContactsBatch(companies, hunterApiKey, options = {}) {
  const { delayMs = 1000, onProgress } = options;
  const results = new Map();

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];

    if (onProgress) {
      onProgress({
        current: i + 1,
        total: companies.length,
        company: company.domain
      });
    }

    const result = await discoverContacts(company.id, company.domain, hunterApiKey);
    results.set(company.id, result);

    // Rate limiting between requests
    if (i < companies.length - 1 && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

/**
 * Get waterfall statistics from results
 * @param {Map} results - Results from discoverContactsBatch
 * @returns {Object} Statistics object
 */
function getWaterfallStats(results) {
  const stats = {
    total: results.size,
    webScrape: 0,
    hunter: 0,
    noContacts: 0,
    totalContacts: 0
  };

  for (const result of results.values()) {
    if (result.source === 'web_scrape') stats.webScrape++;
    else if (result.source === 'hunter') stats.hunter++;
    else stats.noContacts++;

    stats.totalContacts += result.contacts?.length || 0;
  }

  stats.webScrapeRate = stats.total > 0 ? (stats.webScrape / stats.total * 100).toFixed(1) + '%' : '0%';
  stats.costSavings = stats.total > 0 ? (stats.webScrape / stats.total * 100).toFixed(1) + '%' : '0%';

  return stats;
}

module.exports = {
  discoverContacts,
  discoverContactsBatch,
  normalizeContacts,
  getWaterfallStats
};
