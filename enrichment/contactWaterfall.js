/**
 * Contact Waterfall - Waterfall Contact Discovery
 * PRD-WATERFALL-ENRICHMENT: Step 2 - Contact Discovery
 *
 * Implements waterfall approach: Try FREE methods first,
 * fallback to PAID APIs only when necessary.
 *
 * Waterfall order:
 * 1. Web scraping (FREE) - scrape team/contact pages
 * 2. Hunter email-finder (PAID) - recover emails for contacts found with names but no emails
 * 3. Hunter domain-search (PAID) - fallback if no contacts found at all
 */

const webScraper = require('./webScraper');
const hunter = require('../hunter');
const { removeDiacritics } = require('../utils');

// Default confidence scores by source
const DEFAULT_CONFIDENCE = {
  web_scrape: 50,
  hunter: 0,
  hunter_finder: 75  // Higher confidence when we find email for a known person
};

/**
 * Try to recover emails for contacts that have names but no emails
 * Uses Hunter email-finder API
 *
 * @param {Array} contacts - Normalized contacts (some may be missing emails)
 * @param {string} domain - Company domain
 * @param {string} hunterApiKey - Hunter.io API key
 * @returns {Promise<{contacts: Array, emailsRecovered: number, log: Object}>}
 */
async function enrichContactsWithMissingEmails(contacts, domain, hunterApiKey) {
  const log = {
    contactsChecked: 0,
    emailsRecovered: 0,
    patternsGenerated: 0,
    patternDerived: null,
    errors: []
  };

  // Step 0: Derive email pattern from contacts that already have emails (FREE)
  const derivedPattern = derivePatternFromExistingContacts(contacts, domain);
  if (derivedPattern) {
    log.patternDerived = derivedPattern;
    console.log(`[Waterfall] Derived email pattern from existing contacts: ${derivedPattern.pattern} (${derivedPattern.matches} matches)`);
  }

  const enrichedContacts = [];

  for (const contact of contacts) {
    // Skip contacts that already have emails
    if (contact.email) {
      enrichedContacts.push(contact);
      continue;
    }

    // Skip contacts without any name at all
    if (!contact.name && !contact.firstName) {
      enrichedContacts.push(contact);
      continue;
    }

    const hasFirstNameOnly = (contact.firstName || contact.name) && !contact.lastName;
    log.contactsChecked++;

    try {
      // Try derived pattern first (FREE, no API call)
      const patternEmail = applyDerivedPattern(derivedPattern, contact, domain);
      if (patternEmail) {
        log.emailsRecovered++;
        log.patternsGenerated++;
        enrichedContacts.push({
          ...contact,
          email: patternEmail,
          confidence: derivedPattern.matches >= 2 ? 45 : 25,
          source: 'pattern_derived',
          emailSource: 'pattern_derived'
        });
        console.log(`[Waterfall] Generated email from derived pattern for ${contact.name || contact.firstName}: ${patternEmail}`);
        continue;
      }

      // Fallback to Hunter API
      if (!hunterApiKey) {
        enrichedContacts.push(contact);
        continue;
      }

      // Branch A: Contact has first AND last name → use Hunter email-finder
      if (!hasFirstNameOnly) {
        const result = await hunter.findEmailForContact(contact, domain, hunterApiKey);

        if (result.email) {
          log.emailsRecovered++;
          enrichedContacts.push({
            ...contact,
            email: result.email,
            confidence: result.confidence || DEFAULT_CONFIDENCE.hunter_finder,
            source: 'hunter_finder',
            emailSource: 'hunter_finder'
          });
          console.log(`[Waterfall] Recovered email for ${contact.name}: ${result.email}`);
        } else if (result.patterns && result.patterns.length > 0) {
          log.patternsGenerated++;
          enrichedContacts.push({
            ...contact,
            suggestedEmails: result.patterns,
            emailSource: 'pattern_suggestions'
          });
        } else {
          enrichedContacts.push(contact);
        }
      }
      // Branch B: Contact has FIRST NAME ONLY → use domain pattern approach
      else {
        const firstName = contact.firstName || contact.name;
        console.log(`[Waterfall] First-name-only contact: "${firstName}" - trying pattern generation for ${domain}`);

        const patternResult = await hunter.generateEmailFromFirstName(firstName, domain, hunterApiKey);

        if (patternResult.email) {
          log.emailsRecovered++;
          log.firstNamePatterns = (log.firstNamePatterns || 0) + 1;
          enrichedContacts.push({
            ...contact,
            email: patternResult.email,
            confidence: patternResult.confidence,
            source: 'first_name_pattern',
            emailSource: 'first_name_pattern',
            suggestedEmails: patternResult.candidates
          });
          console.log(`[Waterfall] Generated email for first-name "${firstName}": ${patternResult.email} (confidence: ${patternResult.confidence})`);
        } else {
          enrichedContacts.push(contact);
        }
      }
    } catch (error) {
      log.errors.push({ name: contact.name, error: error.message });
      enrichedContacts.push(contact);
    }
  }

  return {
    contacts: enrichedContacts,
    emailsRecovered: log.emailsRecovered,
    log
  };
}

/**
 * Derive email pattern from contacts that already have emails.
 * Looks at existing emails like martin@domain.cz and petra@domain.cz
 * to detect the pattern is {first}@domain.cz
 */
function derivePatternFromExistingContacts(contacts, domain) {
  const domainLower = domain.toLowerCase();
  const contactsWithEmail = contacts.filter(c => {
    if (!c.email || !c.firstName) return false;
    const emailDomain = c.email.split('@')[1];
    return emailDomain && emailDomain.toLowerCase() === domainLower;
  });

  if (contactsWithEmail.length === 0) return null;

  const patterns = { '{first}': 0, '{first}.{last}': 0, '{f}{last}': 0, '{first}{last}': 0 };

  for (const c of contactsWithEmail) {
    const local = c.email.split('@')[0].toLowerCase();
    const first = removeDiacritics(c.firstName || '');
    const last = removeDiacritics(c.lastName || '');

    if (!first) continue;

    if (local === first) patterns['{first}']++;
    if (last && local === `${first}.${last}`) patterns['{first}.{last}']++;
    if (last && local === `${first[0]}${last}`) patterns['{f}{last}']++;
    if (last && local === `${first}${last}`) patterns['{first}{last}']++;
  }

  // Find the best matching pattern
  let bestPattern = null;
  let bestCount = 0;
  for (const [pattern, count] of Object.entries(patterns)) {
    if (count > bestCount) {
      bestPattern = pattern;
      bestCount = count;
    }
  }

  if (bestCount === 0) return null;

  return { pattern: bestPattern, matches: bestCount };
}

/**
 * Apply a derived pattern to generate an email for a contact without one.
 */
function applyDerivedPattern(derivedPattern, contact, domain) {
  if (!derivedPattern) return null;

  const first = removeDiacritics(contact.firstName || contact.name || '');
  const last = removeDiacritics(contact.lastName || '');

  if (!first) return null;

  switch (derivedPattern.pattern) {
    case '{first}':
      return `${first}@${domain}`;
    case '{first}.{last}':
      return last ? `${first}.${last}@${domain}` : null;
    case '{f}{last}':
      return last ? `${first[0]}${last}@${domain}` : null;
    case '{first}{last}':
      return last ? `${first}${last}@${domain}` : null;
    default:
      return null;
  }
}

/**
 * Discover contacts for a company using waterfall approach
 * @param {number|string} companyId - Company ID in database
 * @param {string} domain - Company domain (e.g., 'example.cz')
 * @param {string} hunterApiKey - Hunter.io API key for paid fallback
 * @returns {Promise<{source: 'web_scrape'|'hunter'|null, contacts: Array, log: Object}>}
 */
async function discoverContacts(companyId, domain, hunterApiKey) {
  // Initialize combined log
  const log = {
    source: null,
    webScrape: null,
    hunter: null
  };

  if (!domain) {
    return { source: null, contacts: [], companyId, log, error: 'No domain provided' };
  }

  // Clean domain (remove protocol, www, trailing slashes)
  const cleanDomain = domain
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');

  // Step 1: Try web scraping (FREE)
  try {
    const scrapeResult = await webScraper.scrapeTeamPages(cleanDomain, { returnLog: true });
    const scrapedContacts = scrapeResult.contacts || [];
    log.webScrape = scrapeResult.log;

    if (scrapedContacts.length > 0) {
      console.log(`[Waterfall] Found ${scrapedContacts.length} contacts via web scrape for ${cleanDomain}`);

      // Normalize contacts first
      let normalizedContacts = normalizeContacts(scrapedContacts, 'web_scrape');

      // Step 1.5: Try to recover emails for contacts with names but no emails
      const contactsWithoutEmails = normalizedContacts.filter(c => !c.email && (c.name || c.firstName));
      if (contactsWithoutEmails.length > 0 && hunterApiKey) {
        console.log(`[Waterfall] Attempting to recover emails for ${contactsWithoutEmails.length} contacts without emails`);
        const enrichResult = await enrichContactsWithMissingEmails(normalizedContacts, cleanDomain, hunterApiKey);
        normalizedContacts = enrichResult.contacts;
        log.emailRecovery = enrichResult.log;

        if (enrichResult.emailsRecovered > 0) {
          console.log(`[Waterfall] Recovered ${enrichResult.emailsRecovered} emails via Hunter email-finder`);
        }
      }

      // Step 1.7: If we only have generic emails (no personal emails), try Hunter for decision-makers
      const hasPersonalEmail = normalizedContacts.some(c => c.email && !c.isGenericFallback);
      const onlyGenericEmails = !hasPersonalEmail && normalizedContacts.some(c => c.isGenericFallback);

      if (onlyGenericEmails && hunterApiKey) {
        console.log(`[Waterfall] Only generic emails found - searching Hunter for decision-makers at ${cleanDomain}`);
        try {
          const dmResult = await hunter.searchDecisionMakers(cleanDomain, hunterApiKey);
          log.decisionMakerSearch = { found: dmResult.contacts.length, pattern: dmResult.pattern };

          if (dmResult.contacts.length > 0) {
            // Add decision-maker contacts from Hunter alongside existing contacts
            const dmNormalized = dmResult.contacts.map(c => ({
              name: c.fullName || null,
              firstName: c.firstName || null,
              lastName: c.lastName || null,
              email: c.email || null,
              phone: null,
              title: c.title || null,
              source: 'hunter_dm_search',
              confidence: c.confidence || 60,
              isDecisionMaker: c.isDecisionMaker || false,
              isGenericFallback: false
            }));
            normalizedContacts = [...dmNormalized, ...normalizedContacts];
            console.log(`[Waterfall] Added ${dmResult.contacts.length} decision-maker(s) from Hunter for ${cleanDomain}`);
          }
        } catch (dmError) {
          console.warn(`[Waterfall] Decision-maker search failed for ${cleanDomain}:`, dmError.message);
          log.decisionMakerSearch = { error: dmError.message };
        }
      }

      log.source = 'web_scrape';
      return {
        source: 'web_scrape',
        contacts: normalizedContacts,
        companyId,
        log
      };
    }
  } catch (error) {
    console.warn(`[Waterfall] Web scraping failed for ${cleanDomain}:`, error.message);
    log.webScrape = { error: error.message };
    // Continue to fallback
  }

  // Step 2: Fallback to Hunter.io (PAID)
  if (hunterApiKey) {
    try {
      const hunterResult = await hunter.domainSearch(cleanDomain, hunterApiKey);
      const hunterContacts = hunterResult.emails || [];
      log.hunter = { contacted: true, found: hunterContacts.length };

      if (hunterContacts.length > 0) {
        console.log(`[Waterfall] Found ${hunterContacts.length} contacts via Hunter.io for ${cleanDomain}`);
        log.source = 'hunter';
        return {
          source: 'hunter',
          contacts: normalizeContacts(hunterContacts, 'hunter'),
          companyId,
          organization: hunterResult.organization,
          log
        };
      }
    } catch (error) {
      console.warn(`[Waterfall] Hunter.io failed for ${cleanDomain}:`, error.message);
      log.hunter = { error: error.message };
    }
  } else {
    console.log(`[Waterfall] No Hunter API key provided, skipping paid fallback for ${cleanDomain}`);
    log.hunter = { skipped: true, reason: 'no_api_key' };
  }

  // Step 3: Last resort - generate info@domain as tier-3 fallback
  console.log(`[Waterfall] No contacts found for ${cleanDomain}, generating info@ fallback`);
  log.source = 'generic_fallback';
  log.genericFallback = true;
  return {
    source: 'generic_fallback',
    contacts: [{
      name: 'General Contact',
      firstName: null,
      lastName: null,
      email: `info@${cleanDomain}`,
      phone: null,
      title: 'Company Email',
      source: 'generic_fallback',
      confidence: 10,
      isDecisionMaker: false,
      isGenericFallback: true
    }],
    companyId,
    log
  };
}

/**
 * Split full name into first and last name
 * @param {string} fullName - Full name string
 * @returns {{firstName: string|null, lastName: string|null}}
 */
function splitName(fullName) {
  if (!fullName) return { firstName: null, lastName: null };
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0] || null,
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : null
  };
}

/**
 * Normalize a web scraper contact to common format
 * @param {Object} contact - Raw contact from web scraper
 * @returns {Object} Normalized contact
 */
function normalizeWebScraperContact(contact) {
  const nameParts = splitName(contact.name);
  // Prefer explicit firstName/lastName from Claude extraction over split-from-name
  const firstName = contact.firstName || nameParts.firstName;
  const lastName = contact.lastName || nameParts.lastName;
  return {
    name: contact.name || null,
    firstName: firstName,
    lastName: lastName,
    email: contact.email || null,
    phone: contact.phone || null,
    title: contact.role || contact.title || null,
    source: 'web_scrape',
    confidence: contact.confidence || DEFAULT_CONFIDENCE.web_scrape,
    // Preserve Claude's decision-maker classification
    isDecisionMaker: contact.isDecisionMaker === true,
    // Preserve generic fallback flag
    isGenericFallback: contact.isGenericFallback === true
  };
}

/**
 * Normalize a Hunter.io contact to common format
 * @param {Object} contact - Raw contact from Hunter.io
 * @returns {Object} Normalized contact
 */
function normalizeHunterContact(contact) {
  const name = contact.fullName || [contact.firstName, contact.lastName].filter(Boolean).join(' ');
  return {
    name: name || null,
    firstName: contact.firstName || null,
    lastName: contact.lastName || null,
    email: contact.email || null,
    phone: null,
    title: contact.title || contact.position || null,
    source: 'hunter',
    confidence: contact.confidence || DEFAULT_CONFIDENCE.hunter
  };
}

/**
 * Normalize contacts from different sources to a common format
 * @param {Array} contacts - Raw contacts from source
 * @param {string} source - Source identifier ('web_scrape' | 'hunter')
 * @returns {Array} Normalized contacts
 */
function normalizeContacts(contacts, source) {
  if (source === 'web_scrape') {
    return contacts.map(normalizeWebScraperContact);
  }
  if (source === 'hunter') {
    return contacts.map(normalizeHunterContact);
  }
  return contacts;
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
    genericFallback: 0,
    noContacts: 0,
    totalContacts: 0,
    firstNamePatterns: 0,
    decisionMakerSearches: 0
  };

  for (const result of results.values()) {
    if (result.source === 'web_scrape') stats.webScrape++;
    else if (result.source === 'hunter') stats.hunter++;
    else if (result.source === 'generic_fallback') stats.genericFallback++;
    else stats.noContacts++;

    stats.totalContacts += result.contacts?.length || 0;

    // Track new enrichment methods
    if (result.log?.emailRecovery?.firstNamePatterns) {
      stats.firstNamePatterns += result.log.emailRecovery.firstNamePatterns;
    }
    if (result.log?.decisionMakerSearch?.found > 0) {
      stats.decisionMakerSearches++;
    }
  }

  stats.webScrapeRate = stats.total > 0 ? (stats.webScrape / stats.total * 100).toFixed(1) + '%' : '0%';
  stats.costSavings = stats.total > 0 ? (stats.webScrape / stats.total * 100).toFixed(1) + '%' : '0%';

  return stats;
}

module.exports = {
  discoverContacts,
  discoverContactsBatch,
  enrichContactsWithMissingEmails,
  normalizeContacts,
  getWaterfallStats
};
