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
async function enrichContactsWithMissingEmails(contacts, domain, hunterApiKey, decisions = []) {
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
      // Branch A: Contact has first AND last name
      if (!hasFirstNameOnly) {
        // Change 4: Apply derived pattern FIRST if we have one with enough confidence.
        // Only fall through to Hunter if no pattern exists, or pattern has very low confidence
        // (1 match), or the contact is a decision-maker with less than 2 pattern matches.
        const patternEmail = applyDerivedPattern(derivedPattern, contact, domain);
        const shouldUsePatternFirst = patternEmail && derivedPattern && (
          derivedPattern.matches >= 2 ||
          (derivedPattern.matches === 1 && contact.isDecisionMaker !== true)
        );
        const shouldCallHunter = hunterApiKey && (
          !patternEmail ||                                                        // No pattern available
          (derivedPattern && derivedPattern.matches === 0) ||                    // Pattern had zero matches
          (contact.isDecisionMaker === true && (!derivedPattern || derivedPattern.matches < 2)) // DM with weak pattern
        );

        if (shouldUsePatternFirst) {
          log.emailsRecovered++;
          log.patternsGenerated++;
          decisions.push({
            step: 'email_source', contact: contact.name || contact.firstName,
            decision: 'pattern', reason: `derived pattern has ${derivedPattern.matches} match(es)`,
            patternMatches: derivedPattern.matches, email: patternEmail
          });
          enrichedContacts.push({
            ...contact,
            email: patternEmail,
            confidence: derivedPattern.matches >= 2 ? 20 : 10,
            source: 'pattern_derived',
            emailSource: 'pattern_derived'
          });
          console.log(`[Waterfall] Applied derived pattern for ${contact.name || contact.firstName}: ${patternEmail} (${derivedPattern.matches} match(es), skipping Hunter)`);
          continue;
        }

        if (shouldCallHunter) {
          const result = await hunter.findEmailForContact(contact, domain, hunterApiKey);

          if (result.email) {
            log.emailsRecovered++;
            decisions.push({
              step: 'email_source', contact: contact.name || contact.firstName,
              decision: 'hunter', reason: 'Hunter email-finder returned result',
              email: result.email
            });
            enrichedContacts.push({
              ...contact,
              email: result.email,
              confidence: result.confidence || DEFAULT_CONFIDENCE.hunter_finder,
              source: 'hunter_finder',
              emailSource: 'hunter_finder'
            });
            console.log(`[Waterfall] Recovered email for ${contact.name} via Hunter: ${result.email}`);
            continue;
          }

          if (patternEmail) {
            log.emailsRecovered++;
            log.patternsGenerated++;
            decisions.push({
              step: 'email_source', contact: contact.name || contact.firstName,
              decision: 'pattern_fallback', reason: 'Hunter returned nothing, fell back to derived pattern',
              patternMatches: derivedPattern?.matches, email: patternEmail
            });
            enrichedContacts.push({
              ...contact,
              email: patternEmail,
              confidence: derivedPattern.matches >= 2 ? 20 : 10,
              source: 'pattern_derived',
              emailSource: 'pattern_derived'
            });
            console.log(`[Waterfall] Hunter found nothing for ${contact.name || contact.firstName}, falling back to derived pattern: ${patternEmail}`);
            continue;
          }

          decisions.push({
            step: 'email_source', contact: contact.name || contact.firstName,
            decision: 'dropped', reason: 'Hunter returned nothing and no pattern available'
          });
        } else if (!shouldUsePatternFirst && !shouldCallHunter) {
          decisions.push({
            step: 'email_source', contact: contact.name || contact.firstName,
            decision: 'dropped', reason: 'no Hunter key and no pattern available'
          });
          enrichedContacts.push(contact);
          continue;
        }

        enrichedContacts.push(contact);
      }
      // Branch B: Contact has FIRST NAME ONLY
      else {
        const patternEmail = applyDerivedPattern(derivedPattern, contact, domain);
        if (patternEmail) {
          log.emailsRecovered++;
          log.patternsGenerated++;
          decisions.push({
            step: 'first_name_email', contact: contact.name || contact.firstName,
            decision: 'pattern', reason: 'derived pattern applied to first-name-only contact',
            email: patternEmail
          });
          enrichedContacts.push({
            ...contact,
            email: patternEmail,
            confidence: derivedPattern.matches >= 2 ? 20 : 10,
            source: 'pattern_derived',
            emailSource: 'pattern_derived'
          });
          console.log(`[Waterfall] Generated email from derived pattern for ${contact.name || contact.firstName}: ${patternEmail} (UNVERIFIED GUESS)`);
          continue;
        }

        if (!hunterApiKey) {
          decisions.push({
            step: 'first_name_email', contact: contact.name || contact.firstName,
            decision: 'dropped', reason: 'no pattern and no Hunter key'
          });
          enrichedContacts.push(contact);
          continue;
        }

        const firstName = contact.firstName || contact.name;
        console.log(`[Waterfall] First-name-only contact: "${firstName}" - trying pattern generation for ${domain}`);

        const patternResult = await hunter.generateEmailFromFirstName(firstName, domain, hunterApiKey);

        if (patternResult.email) {
          log.emailsRecovered++;
          log.firstNamePatterns = (log.firstNamePatterns || 0) + 1;
          decisions.push({
            step: 'first_name_email', contact: firstName,
            decision: 'hunter_generate', reason: 'Hunter generated email from first name + domain pattern',
            email: patternResult.email
          });
          enrichedContacts.push({
            ...contact,
            email: patternResult.email,
            confidence: Math.min(patternResult.confidence, 15),
            source: 'first_name_pattern',
            emailSource: 'first_name_pattern',
            suggestedEmails: patternResult.candidates
          });
          console.log(`[Waterfall] Generated email for first-name "${firstName}": ${patternResult.email} (confidence: ${Math.min(patternResult.confidence, 15)}, UNVERIFIED GUESS)`);
        } else {
          decisions.push({
            step: 'first_name_email', contact: firstName,
            decision: 'dropped', reason: 'Hunter could not generate email from first name'
          });
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
 *
 * Change 6: Also handles subdomain case (e.g., company domain is cz.prefa.com but
 * emails are @prefa.com). Uses the actual email domain from scraped contacts
 * rather than forcing a match against the subdomain.
 */
function derivePatternFromExistingContacts(contacts, domain) {
  const domainLower = domain.toLowerCase();

  // Derive the parent domain in case the company domain is a subdomain
  // e.g., cz.prefa.com → prefa.com
  const domainParts = domainLower.split('.');
  const parentDomain = domainParts.length > 2
    ? domainParts.slice(-2).join('.')
    : domainLower;

  // Accept contacts whose email domain matches either the exact company domain
  // or the parent domain (Change 6: subdomain fix)
  const contactsWithEmail = contacts.filter(c => {
    if (!c.email || !c.firstName) return false;
    const emailDomain = c.email.split('@')[1];
    if (!emailDomain) return false;
    const ed = emailDomain.toLowerCase();
    return ed === domainLower || ed === parentDomain;
  });

  if (contactsWithEmail.length === 0) return null;

  // Change 6: Determine which domain the actual emails use (parent vs subdomain)
  // Use whatever domain appears most in the real scraped emails
  const emailDomainCounts = {};
  for (const c of contactsWithEmail) {
    const ed = c.email.split('@')[1].toLowerCase();
    emailDomainCounts[ed] = (emailDomainCounts[ed] || 0) + 1;
  }
  const effectiveDomain = Object.entries(emailDomainCounts)
    .sort((a, b) => b[1] - a[1])[0][0];

  if (effectiveDomain !== domainLower) {
    console.log(`[Waterfall] Subdomain fix: company domain is "${domainLower}" but emails use "${effectiveDomain}" — using "${effectiveDomain}" for pattern generation`);
  }

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

  return { pattern: bestPattern, matches: bestCount, emailDomain: effectiveDomain };
}

/**
 * Apply a derived pattern to generate an email for a contact without one.
 * Change 6: Uses derivedPattern.emailDomain (the actual domain from scraped contacts)
 * instead of the raw company domain, so subdomain companies generate correct emails.
 */
function applyDerivedPattern(derivedPattern, contact, domain) {
  if (!derivedPattern) return null;

  const first = removeDiacritics(contact.firstName || contact.name || '');
  const last = removeDiacritics(contact.lastName || '');

  if (!first) return null;

  // Use the actual email domain from existing contacts (handles subdomain case)
  const targetDomain = derivedPattern.emailDomain || domain;

  switch (derivedPattern.pattern) {
    case '{first}':
      return `${first}@${targetDomain}`;
    case '{first}.{last}':
      return last ? `${first}.${last}@${targetDomain}` : null;
    case '{f}{last}':
      return last ? `${first[0]}${last}@${targetDomain}` : null;
    case '{first}{last}':
      return last ? `${first}${last}@${targetDomain}` : null;
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
async function discoverContacts(companyId, domain, hunterApiKey, options = {}) {
  const startedAt = Date.now();
  const decisions = [];
  const log = {
    source: null,
    webScrape: null,
    hunter: null
  };

  if (!domain) {
    return { source: null, contacts: [], companyId, log, decisions, duration: 0, error: 'No domain provided' };
  }

  const preferredProtocol = options.originalUrl && options.originalUrl.startsWith('http://')
    ? 'http' : 'https';

  const cleanDomain = domain
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');

  const makeResult = (extra) => ({
    ...extra, companyId, log, decisions, duration: Date.now() - startedAt
  });

  // Step 1: Try web scraping (FREE)
  try {
    const scrapeResult = await webScraper.scrapeTeamPages(cleanDomain, { returnLog: true, preferredProtocol });
    const scrapedContacts = scrapeResult.contacts || [];
    log.webScrape = scrapeResult.log;

    if (scrapedContacts.length > 0) {
      console.log(`[Waterfall] Found ${scrapedContacts.length} contacts via web scrape for ${cleanDomain}`);
      decisions.push({
        step: 'web_scrape', result: 'found', contactCount: scrapedContacts.length
      });

      let normalizedContacts = normalizeContacts(scrapedContacts, 'web_scrape');

      // Step 1.5: Try to recover emails for contacts with names but no emails
      const contactsWithoutEmails = normalizedContacts.filter(c => !c.email && (c.name || c.firstName));
      if (contactsWithoutEmails.length > 0 && hunterApiKey) {
        console.log(`[Waterfall] Attempting to recover emails for ${contactsWithoutEmails.length} contacts without emails`);
        const enrichResult = await enrichContactsWithMissingEmails(normalizedContacts, cleanDomain, hunterApiKey, decisions);
        normalizedContacts = enrichResult.contacts;
        log.emailRecovery = enrichResult.log;

        decisions.push({
          step: 'email_recovery',
          contactsChecked: enrichResult.log.contactsChecked,
          emailsRecovered: enrichResult.emailsRecovered
        });

        if (enrichResult.emailsRecovered > 0) {
          console.log(`[Waterfall] Recovered ${enrichResult.emailsRecovered} emails via Hunter email-finder`);
        }
      }

      const hasRealPersonalEmail = normalizedContacts.some(c =>
        c.email && !c.isGenericFallback &&
        c.emailSource !== 'pattern_derived' &&
        c.emailSource !== 'first_name_pattern'
      );

      const hasPatternDerivedEmail = normalizedContacts.some(c =>
        c.email &&
        (c.emailSource === 'pattern_derived' || c.emailSource === 'first_name_pattern')
      );

      if (!hasRealPersonalEmail && hunterApiKey) {
        console.log(`[Waterfall] No real personal emails found - searching Hunter for decision-makers at ${cleanDomain}`);
        decisions.push({
          step: 'personal_email_check', hasReal: false,
          hasPatternOnly: hasPatternDerivedEmail,
          action: 'dm_search'
        });
        try {
          const dmResult = await hunter.searchDecisionMakers(cleanDomain, hunterApiKey);
          log.decisionMakerSearch = { found: dmResult.contacts.length, pattern: dmResult.pattern };

          if (dmResult.contacts.length > 0) {
            const dmNormalized = dmResult.contacts.map(c => ({
              name: c.fullName || null,
              firstName: c.firstName || null,
              lastName: c.lastName || null,
              email: c.email || null,
              phone: null,
              title: c.title || null,
              source: 'hunter_dm_search',
              emailSource: 'hunter_domain_search',
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
      } else if (hasRealPersonalEmail) {
        decisions.push({
          step: 'personal_email_check', hasReal: true,
          hasPatternOnly: false,
          action: 'return'
        });
      }

      const webScrapeFoundPersonalEmail = normalizedContacts.some(c =>
        c.email && !c.isGenericFallback &&
        c.source === 'web_scrape' &&
        !['pattern_derived', 'first_name_pattern', 'hunter_domain_search'].includes(c.emailSource)
      );

      if (webScrapeFoundPersonalEmail) {
        log.source = 'web_scrape';
        return makeResult({ source: 'web_scrape', contacts: normalizedContacts });
      }

      console.log(`[Waterfall] Web scrape found no personal emails — falling through to full Hunter domain-search for ${cleanDomain}`);
      decisions.push({
        step: 'personal_email_check', hasReal: false,
        hasPatternOnly: hasPatternDerivedEmail,
        action: 'fallthrough'
      });
      log.webScrape = scrapeResult.log;
      log.webScrapeContacts = normalizedContacts;
    } else {
      decisions.push({
        step: 'web_scrape', result: 'empty', contactCount: 0
      });
    }
  } catch (error) {
    console.warn(`[Waterfall] Web scraping failed for ${cleanDomain}:`, error.message);
    log.webScrape = { error: error.message };
    decisions.push({
      step: 'web_scrape', result: 'error', error: error.message
    });
  }

  // Step 2: Fallback to Hunter.io (PAID)
  if (hunterApiKey) {
    try {
      const hunterResult = await hunter.domainSearch(cleanDomain, hunterApiKey);
      const hunterContacts = hunterResult.emails || [];
      log.hunter = { contacted: true, found: hunterContacts.length };

      if (hunterContacts.length > 0) {
        console.log(`[Waterfall] Found ${hunterContacts.length} contacts via Hunter.io for ${cleanDomain}`);

        const hunterNormalized = normalizeContacts(hunterContacts, 'hunter');
        const hunterEmails = new Set(hunterNormalized.map(c => c.email?.toLowerCase()).filter(Boolean));
        const webScrapeContacts = log.webScrapeContacts || [];

        const uniqueWebScrapeContacts = webScrapeContacts.filter(c =>
          c.email && !c.isGenericFallback && !hunterEmails.has(c.email.toLowerCase())
        );

        decisions.push({
          step: 'hunter_domain', result: 'found',
          hunterCount: hunterContacts.length,
          mergedWebScrape: uniqueWebScrapeContacts.length
        });

        if (uniqueWebScrapeContacts.length > 0) {
          console.log(`[Waterfall] Merged ${uniqueWebScrapeContacts.length} email-finder contacts with Hunter results`);
        }

        log.source = 'hunter';
        return makeResult({
          source: 'hunter',
          contacts: [...hunterNormalized, ...uniqueWebScrapeContacts],
          organization: hunterResult.organization
        });
      } else {
        decisions.push({
          step: 'hunter_domain', result: 'empty'
        });
      }
    } catch (error) {
      console.warn(`[Waterfall] Hunter.io failed for ${cleanDomain}:`, error.message);
      log.hunter = { error: error.message };
      decisions.push({
        step: 'hunter_domain', result: 'error', error: error.message
      });
    }
  } else {
    console.log(`[Waterfall] No Hunter API key provided, skipping paid fallback for ${cleanDomain}`);
    log.hunter = { skipped: true, reason: 'no_api_key' };
    decisions.push({
      step: 'hunter_domain', result: 'skipped', reason: 'no_api_key'
    });
  }

  // Step 3: Last resort - generate info@domain as tier-3 fallback
  console.log(`[Waterfall] No contacts found for ${cleanDomain}, generating info@ fallback`);
  decisions.push({
    step: 'generic_fallback', email: `info@${cleanDomain}`
  });
  log.source = 'generic_fallback';
  log.genericFallback = true;
  return makeResult({
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
    }]
  });
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
