/**
 * Hunter.io API client for email enrichment
 *
 * Supports two main endpoints:
 * 1. Domain Search - Find all emails for a domain
 * 2. Email Finder - Find email for a specific person (first_name + last_name + domain)
 */

const { extractDomain } = require('./utils');

const HUNTER_API_BASE = 'https://api.hunter.io/v2';

// Priority order for decision-maker titles
const TITLE_PRIORITY = [
  'ceo', 'chief executive',
  'founder', 'co-founder', 'cofounder',
  'owner',
  'managing director', 'md',
  'president',
  'principal',
  'director'
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

  const first = firstName.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove diacritics (č→c, ř→r)
    .replace(/[^a-z]/g, ''); // Remove non-alpha

  const last = lastName.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');

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
  enrichCompany,
  TITLE_PRIORITY,
  EMAIL_PATTERNS
};
