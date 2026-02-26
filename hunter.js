/**
 * Hunter.io API client for email enrichment
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
  enrichCompany
};
