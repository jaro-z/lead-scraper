/**
 * Notion CRM Integration
 * - Fetch existing contacts/companies for dedupe
 * - Export new leads to Notion
 */

const NOTION_API_VERSION = '2022-06-28';

/**
 * Extract domain from URL
 * @param {string} url - Full URL or domain
 * @returns {string} - Clean domain (e.g., "increative.cz")
 */
function extractDomain(url) {
  if (!url) return null;
  try {
    let domain = url
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .toLowerCase()
      .trim();
    return domain || null;
  } catch {
    return null;
  }
}

/**
 * Fuzzy match score for business names (0-1)
 * @param {string} a - First name
 * @param {string} b - Second name
 * @returns {number} - Similarity score
 */
function fuzzyMatch(a, b) {
  if (!a || !b) return 0;

  const normalize = (s) => s.toLowerCase()
    .replace(/[^a-z0-9\u00C0-\u017F]/g, '') // Keep accented chars
    .trim();

  const s1 = normalize(a);
  const s2 = normalize(b);

  if (s1 === s2) return 1;

  // Only count substring match if the shorter string is substantial (at least 5 chars)
  const shorter = s1.length < s2.length ? s1 : s2;
  if (shorter.length >= 5 && (s1.includes(s2) || s2.includes(s1))) return 0.85;

  // Levenshtein-based similarity for short strings
  const longer = s1.length > s2.length ? s1 : s2;

  if (longer.length === 0) return 1;

  const editDistance = levenshtein(s1, s2);
  return (longer.length - editDistance) / longer.length;
}

function levenshtein(s1, s2) {
  const m = s1.length, n = s2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i-1] === s2[j-1]) {
        dp[i][j] = dp[i-1][j-1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Notion API client
 */
class NotionClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.notion.com/v1';
  }

  async request(endpoint, options = {}) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Notion-Version': NOTION_API_VERSION,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Notion API error: ${response.status} - ${error.message || response.statusText}`);
    }

    return response.json();
  }

  /**
   * Query all pages from a database (handles pagination)
   * @param {string} databaseId - Notion database ID
   * @returns {Promise<Array>} - All pages
   */
  async queryDatabase(databaseId) {
    const pages = [];
    let cursor = undefined;

    do {
      const body = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;

      const response = await this.request(`/databases/${databaseId}/query`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      pages.push(...response.results);
      cursor = response.has_more ? response.next_cursor : undefined;
    } while (cursor);

    return pages;
  }

  /**
   * Create a new page in a database
   * @param {string} databaseId - Target database ID
   * @param {Object} properties - Page properties
   * @returns {Promise<Object>} - Created page
   */
  async createPage(databaseId, properties) {
    return this.request('/pages', {
      method: 'POST',
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties,
      }),
    });
  }
}

/**
 * Extract contact info from Notion page
 * Maps Czech property names to normalized structure
 */
function parseNotionContact(page) {
  const props = page.properties;

  // Get title (page name - contact full name)
  let fullName = '';
  const titleProp = Object.values(props).find(p => p.type === 'title');
  if (titleProp?.title?.[0]?.plain_text) {
    fullName = titleProp.title[0].plain_text;
  }

  // Extract organization URL and domain
  let organizaceUrl = null;
  let domain = null;

  // Try common property names for organization
  const orgProp = props['Organizace'] || props['Organization'] || props['Company'] || props['Website'];
  if (orgProp) {
    if (orgProp.type === 'url') {
      organizaceUrl = orgProp.url;
    } else if (orgProp.type === 'rich_text' && orgProp.rich_text?.[0]?.plain_text) {
      organizaceUrl = orgProp.rich_text[0].plain_text;
    }
    domain = extractDomain(organizaceUrl);
  }

  // Extract email and get domain as fallback
  let email = null;
  const emailProp = props['E-mail'] || props['Email'] || props['email'];
  if (emailProp?.email) {
    email = emailProp.email;
    if (!domain && email) {
      domain = email.split('@')[1]?.toLowerCase();
    }
  }

  // Extract first name
  let firstName = '';
  const firstNameProp = props['Křestní jméno'] || props['First Name'] || props['FirstName'];
  if (firstNameProp?.rich_text?.[0]?.plain_text) {
    firstName = firstNameProp.rich_text[0].plain_text;
  }

  // Extract last name
  let lastName = '';
  const lastNameProp = props['Příjmení'] || props['Last Name'] || props['LastName'];
  if (lastNameProp?.rich_text?.[0]?.plain_text) {
    lastName = lastNameProp.rich_text[0].plain_text;
  }

  return {
    pageId: page.id,
    fullName,
    firstName,
    lastName,
    email,
    organizaceUrl,
    domain,
  };
}

/**
 * Build domain index from Notion contacts for fast lookup
 * @param {Array} contacts - Parsed Notion contacts
 * @returns {Map} - domain -> array of contacts
 */
function buildDomainIndex(contacts) {
  const index = new Map();

  for (const contact of contacts) {
    if (contact.domain) {
      const existing = index.get(contact.domain) || [];
      existing.push(contact);
      index.set(contact.domain, existing);
    }
  }

  return index;
}

/**
 * Check if a lead is a duplicate
 * @param {Object} lead - Lead from scraper (has website, name)
 * @param {Map} domainIndex - Domain -> contacts map
 * @param {Array} allContacts - All Notion contacts (for fuzzy match)
 * @returns {Object} - { isDupe, matchType, matches, confidence }
 */
function checkDuplicate(lead, domainIndex, allContacts) {
  const leadDomain = extractDomain(lead.website);
  const result = {
    isDupe: false,
    matchType: null,
    matches: [],
    confidence: 0,
  };

  // Step 1: Exact domain match
  if (leadDomain && domainIndex.has(leadDomain)) {
    const domainMatches = domainIndex.get(leadDomain);
    result.isDupe = true;
    result.matchType = 'domain';
    result.matches = domainMatches.map(c => ({
      pageId: c.pageId,
      name: c.fullName,
      email: c.email,
      organizaceUrl: c.organizaceUrl,
    }));
    result.confidence = 0.95;
    return result;
  }

  // Step 2: Fuzzy match on organization/company name from URL only
  // (Comparing lead company names to contact person names doesn't make sense)
  if (lead.name) {
    const FUZZY_THRESHOLD = 0.85; // High threshold - must be very similar
    const fuzzyMatches = [];

    for (const contact of allContacts) {
      // Only match against organization URL domain (the company identifier)
      // NOT against contact.fullName (which is a person's name)
      if (!contact.organizaceUrl) continue;

      const orgName = contact.organizaceUrl
        ? extractDomain(contact.organizaceUrl)?.split('.')[0]
        : null;

      if (!orgName || orgName.length < 3) continue; // Skip very short domains

      const orgScore = fuzzyMatch(lead.name, orgName);

      if (orgScore >= FUZZY_THRESHOLD) {
        fuzzyMatches.push({
          contact,
          score: orgScore,
        });
      }
    }

    if (fuzzyMatches.length > 0) {
      // Sort by score descending
      fuzzyMatches.sort((a, b) => b.score - a.score);

      result.isDupe = true;
      result.matchType = 'fuzzy_name';
      result.matches = fuzzyMatches.slice(0, 3).map(m => ({
        pageId: m.contact.pageId,
        name: m.contact.fullName,
        email: m.contact.email,
        organizaceUrl: m.contact.organizaceUrl,
        score: m.score,
      }));
      result.confidence = fuzzyMatches[0].score;
    }
  }

  return result;
}

/**
 * Format lead for Notion export
 * Maps scraper fields to Notion properties (Czech names)
 */
function formatLeadForNotion(lead) {
  const properties = {};

  // Title (page name) - use company name or extract from domain
  if (lead.name) {
    properties['title'] = {
      title: [{ text: { content: lead.name } }],
    };
  }

  // Organization (website URL)
  if (lead.website) {
    properties['Organizace'] = {
      url: lead.website.startsWith('http') ? lead.website : `https://${lead.website}`,
    };
  }

  // Phone
  if (lead.phone) {
    properties['Telefon'] = {
      phone_number: lead.phone,
    };
  }

  // Lead source
  properties['Zdroj leadu'] = {
    select: { name: 'Lead Scraper' },
  };

  return properties;
}

module.exports = {
  extractDomain,
  fuzzyMatch,
  NotionClient,
  parseNotionContact,
  buildDomainIndex,
  checkDuplicate,
  formatLeadForNotion,
};
