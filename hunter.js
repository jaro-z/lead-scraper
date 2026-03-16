/**
 * Hunter.io API client for email enrichment
 *
 * Supports two main endpoints:
 * 1. Domain Search - Find all emails for a domain
 * 2. Email Finder - Find email for a specific person (first_name + last_name + domain)
 */

const { extractDomain, removeDiacritics } = require('./utils');

const HUNTER_API_BASE = 'https://api.hunter.io/v2';

// Priority order for decision-maker titles (English + Czech)
const TITLE_PRIORITY = [
  'ceo', 'chief executive', 'generální ředitel',
  'founder', 'co-founder', 'cofounder', 'zakladatel', 'spoluzakladatel',
  'owner', 'majitel',
  'jednatel', 'jednatelka',                    // Czech: statutory director / managing director
  'managing director', 'md', 'výkonný ředitel',
  'president',
  'principal', 'společník',                     // Czech: partner/shareholder
  'director', 'ředitel', 'ředitelka',
  'vedoucí',                                    // Czech: head/leader
  'obchodní ředitel'                            // Czech: sales/business director
];

// Common email patterns for pattern guessing
const EMAIL_PATTERNS = [
  '{first}@{domain}',           // john@company.com
  '{first}.{last}@{domain}',    // john.smith@company.com
  '{first}{last}@{domain}',     // johnsmith@company.com
  '{f}{last}@{domain}',         // jsmith@company.com
  '{last}@{domain}',            // smith@company.com
  '{first}_{last}@{domain}',    // john_smith@company.com
  '{f}.{last}@{domain}',        // j.smith@company.com
];

/**
 * Get title priority score (lower = better)
 */
function getTitlePriority(title) {
  if (!title) return 999;
  const lower = title.toLowerCase();
  for (let i = 0; i < TITLE_PRIORITY.length; i++) {
    if (lower.includes(TITLE_PRIORITY[i])) return i;
  }
  return 999;
}

/**
 * Search for emails by domain
 */
async function domainSearch(domain, apiKey) {
  if (!domain) return { emails: [], organization: null };

  const url = new URL(`${HUNTER_API_BASE}/domain-search`);
  url.searchParams.set('domain', domain);
  url.searchParams.set('api_key', apiKey);

  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.errors?.[0]?.details || `Hunter API error: ${response.status}`);
  }

  const data = await response.json();

  // Transform and sort by title priority
  const emails = (data.data?.emails || [])
    .map(e => ({
      email: e.value,
      firstName: e.first_name,
      lastName: e.last_name,
      fullName: [e.first_name, e.last_name].filter(Boolean).join(' '),
      title: e.position,
      confidence: e.confidence,
      titlePriority: getTitlePriority(e.position)
    }))
    .sort((a, b) => a.titlePriority - b.titlePriority || b.confidence - a.confidence);

  // Mark first as primary
  if (emails.length > 0) {
    emails[0].isPrimary = true;
  }

  return { emails, organization: data.data?.organization };
}

/**
 * Find email for a specific person using Hunter's email-finder API
 * This is the key API for recovering emails when we have name but no email
 *
 * @param {string} domain - Company domain (e.g., "company.cz")
 * @param {string} firstName - Person's first name
 * @param {string} lastName - Person's last name
 * @param {string} apiKey - Hunter.io API key
 * @returns {Promise<{email: string|null, confidence: number, source: string}>}
 */
async function emailFinder(domain, firstName, lastName, apiKey) {
  if (!domain || !firstName || !lastName) {
    return { email: null, confidence: 0, source: 'hunter_finder', error: 'Missing required fields' };
  }

  const url = new URL(`${HUNTER_API_BASE}/email-finder`);
  url.searchParams.set('domain', domain);
  url.searchParams.set('first_name', firstName);
  url.searchParams.set('last_name', lastName);
  url.searchParams.set('api_key', apiKey);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.json();
      const errorMsg = error.errors?.[0]?.details || `Hunter API error: ${response.status}`;
      console.warn(`[Hunter] Email finder error for ${firstName} ${lastName}@${domain}: ${errorMsg}`);
      return { email: null, confidence: 0, source: 'hunter_finder', error: errorMsg };
    }

    const data = await response.json();
    const result = data.data;

    if (result?.email) {
      console.log(`[Hunter] Found email for ${firstName} ${lastName}: ${result.email} (confidence: ${result.score}%)`);
      return {
        email: result.email,
        confidence: result.score || 0,
        source: 'hunter_finder',
        firstName: result.first_name,
        lastName: result.last_name,
        position: result.position,
        twitter: result.twitter,
        linkedinUrl: result.linkedin_url,
        phoneNumber: result.phone_number,
        verificationStatus: result.verification?.status,
        verificationDate: result.verification?.date
      };
    }

    return { email: null, confidence: 0, source: 'hunter_finder', error: 'No email found' };

  } catch (error) {
    console.error(`[Hunter] Email finder exception: ${error.message}`);
    return { email: null, confidence: 0, source: 'hunter_finder', error: error.message };
  }
}

/**
 * Generate possible email patterns from name and domain
 * Used as fallback when Hunter doesn't have data
 *
 * @param {string} firstName - First name
 * @param {string} lastName - Last name
 * @param {string} domain - Company domain
 * @returns {string[]} - Array of possible email addresses
 */
function generateEmailPatterns(firstName, lastName, domain) {
  if (!firstName || !lastName || !domain) return [];

  const first = removeDiacritics(firstName).replace(/[^a-z]/g, '');
  const last = removeDiacritics(lastName).replace(/[^a-z]/g, '');

  const f = first.charAt(0); // First initial

  if (!first || !last) return [];

  return EMAIL_PATTERNS.map(pattern =>
    pattern
      .replace('{first}', first)
      .replace('{last}', last)
      .replace('{f}', f)
      .replace('{domain}', domain)
  );
}

/**
 * Try to find email for a contact using Hunter email-finder
 * Falls back to pattern generation if Hunter doesn't find it
 *
 * @param {Object} contact - Contact object with name/firstName/lastName
 * @param {string} domain - Company domain
 * @param {string} apiKey - Hunter.io API key (optional - if not provided, only generates patterns)
 * @returns {Promise<{email: string|null, confidence: number, source: string, patterns?: string[]}>}
 */
async function findEmailForContact(contact, domain, apiKey) {
  // Extract first and last name
  let firstName = contact.firstName || contact.first_name;
  let lastName = contact.lastName || contact.last_name;

  // If we only have full name, split it
  if (!firstName && !lastName && contact.name) {
    const parts = contact.name.trim().split(/\s+/);
    if (parts.length >= 2) {
      firstName = parts[0];
      lastName = parts.slice(1).join(' '); // Handle multi-part last names
    } else if (parts.length === 1) {
      firstName = parts[0];
      lastName = parts[0]; // Use same for both as fallback
    }
  }

  if (!firstName || !lastName) {
    return { email: null, confidence: 0, source: 'none', error: 'Could not extract first/last name' };
  }

  // Try Hunter email-finder first (if API key provided)
  if (apiKey) {
    const hunterResult = await emailFinder(domain, firstName, lastName, apiKey);
    if (hunterResult.email) {
      return hunterResult;
    }
  }

  // Generate patterns as fallback/alternative
  const patterns = generateEmailPatterns(firstName, lastName, domain);

  return {
    email: null,
    confidence: 0,
    source: 'pattern_suggestions',
    patterns,
    firstName,
    lastName,
    note: apiKey ? 'Hunter found nothing, try these patterns' : 'No API key, use patterns with MX validation'
  };
}

/**
 * Generate possible email addresses using ONLY the first name + domain email pattern.
 * Used when web scraping finds team members with first names but no last names.
 *
 * Flow:
 * 1. Call Hunter domain-search to get the company's email pattern (e.g., {first}@domain.cz)
 * 2. Use that pattern with the first name to generate candidate emails
 * 3. If Hunter has no pattern, fall back to common first-name-only patterns
 *
 * @param {string} firstName - Person's first name (e.g., "Standa")
 * @param {string} domain - Company domain (e.g., "agency.cz")
 * @param {string} apiKey - Hunter.io API key
 * @returns {Promise<{email: string|null, candidates: string[], pattern: string|null, confidence: number, source: string}>}
 */
async function generateEmailFromFirstName(firstName, domain, apiKey) {
  if (!firstName || !domain) {
    return { email: null, candidates: [], pattern: null, confidence: 0, source: 'none' };
  }

  const first = removeDiacritics(firstName).replace(/[^a-z]/g, '');

  if (!first) {
    return { email: null, candidates: [], pattern: null, confidence: 0, source: 'none' };
  }

  // Try to get the domain's email pattern from Hunter
  let hunterPattern = null;
  if (apiKey) {
    try {
      const url = new URL(`${HUNTER_API_BASE}/domain-search`);
      url.searchParams.set('domain', domain);
      url.searchParams.set('api_key', apiKey);
      url.searchParams.set('limit', '1'); // We only need the pattern, minimize data

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        hunterPattern = data.data?.pattern;
        console.log(`[Hunter] Domain pattern for ${domain}: ${hunterPattern || 'none found'}`);
      }
    } catch (error) {
      console.warn(`[Hunter] Pattern lookup failed for ${domain}: ${error.message}`);
    }
  }

  // Generate candidate emails
  const candidates = [];

  if (hunterPattern) {
    // Use Hunter's known pattern. Hunter patterns look like: "{first}", "{first}.{last}", "{f}{last}", etc.
    // For first-name-only, we can only use patterns that work with just a first name
    const firstOnlyEmail = hunterPattern
      .replace(/\{first\}/g, first)
      .replace(/\{f\}/g, first.charAt(0));

    // Only use the pattern if it doesn't still contain {last} placeholder (those need a last name)
    if (!firstOnlyEmail.includes('{last}') && !firstOnlyEmail.includes('{l}')) {
      candidates.push(`${firstOnlyEmail}@${domain}`);
    } else {
      // Pattern requires last name - still try {first}@domain as it's very common in CZ
      candidates.push(`${first}@${domain}`);
    }
  }

  // Always include common first-name-only patterns (very common in Czech companies)
  const firstNamePatterns = [
    `${first}@${domain}`,                    // standa@agency.cz (most common in CZ)
  ];

  for (const pattern of firstNamePatterns) {
    if (!candidates.includes(pattern)) {
      candidates.push(pattern);
    }
  }

  // The first candidate (based on Hunter pattern or {first}@domain) is our best guess
  const bestGuess = candidates[0] || null;

  return {
    email: bestGuess,
    candidates,
    pattern: hunterPattern,
    confidence: hunterPattern ? 40 : 20, // Lower confidence since we don't have last name
    source: 'first_name_pattern'
  };
}

/**
 * Search Hunter domain-search specifically for decision-maker contacts.
 * Used as a secondary check when web scraping only found generic emails.
 *
 * @param {string} domain - Company domain
 * @param {string} apiKey - Hunter.io API key
 * @param {string[]} targetTitles - Title keywords to search for (default: executive titles)
 * @returns {Promise<{contacts: Array, pattern: string|null}>}
 */
async function searchDecisionMakers(domain, apiKey, targetTitles) {
  if (!domain || !apiKey) return { contacts: [], pattern: null };

  const titles = targetTitles || ['ceo', 'founder', 'owner', 'director', 'managing', 'jednatel', 'ředitel', 'majitel'];

  try {
    const url = new URL(`${HUNTER_API_BASE}/domain-search`);
    url.searchParams.set('domain', domain);
    url.searchParams.set('api_key', apiKey);
    // Hunter domain-search supports seniority filter
    url.searchParams.set('seniority', 'senior,executive');

    const response = await fetch(url);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.errors?.[0]?.details || `Hunter API error: ${response.status}`);
    }

    const data = await response.json();
    const allEmails = data.data?.emails || [];
    const pattern = data.data?.pattern || null;

    // Filter for decision-maker titles
    const dmContacts = allEmails
      .filter(e => {
        if (!e.position) return false;
        const pos = e.position.toLowerCase();
        return titles.some(t => pos.includes(t));
      })
      .map(e => ({
        email: e.value,
        firstName: e.first_name,
        lastName: e.last_name,
        fullName: [e.first_name, e.last_name].filter(Boolean).join(' '),
        title: e.position,
        confidence: e.confidence,
        source: 'hunter_dm_search',
        isDecisionMaker: true
      }))
      .sort((a, b) => getTitlePriority(a.title) - getTitlePriority(b.title) || b.confidence - a.confidence);

    // If no DM-specific contacts, return the top person by seniority
    if (dmContacts.length === 0 && allEmails.length > 0) {
      const topContact = allEmails
        .map(e => ({
          email: e.value,
          firstName: e.first_name,
          lastName: e.last_name,
          fullName: [e.first_name, e.last_name].filter(Boolean).join(' '),
          title: e.position,
          confidence: e.confidence,
          source: 'hunter_dm_search',
          isDecisionMaker: false
        }))
        .sort((a, b) => getTitlePriority(a.title) - getTitlePriority(b.title) || b.confidence - a.confidence);

      return { contacts: topContact.slice(0, 2), pattern };
    }

    return { contacts: dmContacts, pattern };
  } catch (error) {
    console.error(`[Hunter] Decision-maker search failed for ${domain}: ${error.message}`);
    return { contacts: [], pattern: null };
  }
}

/**
 * Enrich a single company
 */
async function enrichCompany(website, apiKey) {
  const domain = extractDomain(website);
  if (!domain) {
    return { emails: [], error: 'No valid domain' };
  }
  return domainSearch(domain, apiKey);
}

module.exports = {
  extractDomain,
  domainSearch,
  emailFinder,
  findEmailForContact,
  generateEmailPatterns,
  generateEmailFromFirstName,
  searchDecisionMakers,
  enrichCompany,
  TITLE_PRIORITY,
  EMAIL_PATTERNS
};
