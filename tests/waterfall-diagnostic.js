/**
 * Waterfall Diagnostic Test
 *
 * Tests the full enrichment waterfall on 20 random raw companies.
 * Produces a detailed table showing exactly what happened at each step:
 * - Which pages were scraped
 * - Whether Hunter was called (and why/why not)
 * - How many emails were fabricated via pattern derivation
 * - How many are real (scraped from HTML or Hunter-verified)
 *
 * Usage: node tests/waterfall-diagnostic.js
 *
 * READ-ONLY: Does NOT save contacts to DB or modify company records.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const db = require('../db');
const { discoverContacts } = require('../enrichment/contactWaterfall');
const { validateEmail } = require('../enrichment/validators');
const { validateAndExtractDomain } = require('../utils');
const fs = require('fs');
const path = require('path');

const BATCH_SIZE = parseInt(process.env.TEST_BATCH_SIZE) || 20;
const DELAY_BETWEEN = 5000; // 5s between companies to avoid rate limits
const HUNTER_API_KEY = process.env.HUNTER_API_KEY;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Classify a contact's email source
 */
function classifyContact(contact) {
  if (!contact.email) return 'name_only';

  // Generic fallback emails
  const genericPatterns = /^(info|kontakt|contact|office|obchod|sales|support|hello|ahoj|poptavka|objednavka|recepce)@/i;
  if (genericPatterns.test(contact.email) || contact.isGenericFallback) return 'generic';

  // Pattern-fabricated
  if (contact.emailSource === 'pattern_derived' || contact.source === 'pattern_derived') return 'pattern_fabricated';
  if (contact.emailSource === 'first_name_pattern' || contact.source === 'first_name_pattern') return 'pattern_fabricated';

  // Hunter-found
  if (contact.emailSource === 'hunter_finder' || contact.source === 'hunter_finder') return 'hunter_found';
  if (contact.emailSource === 'hunter_domain_search' || contact.source === 'hunter_domain_search') return 'hunter_found';
  if (contact.source === 'hunter_dm_search') return 'hunter_found';

  // If source is web_scrape and has email, it was found in HTML
  if (contact.source === 'web_scrape' || contact.emailSource === 'web_scrape') return 'real_scraped';

  // Default: if contact has email and came from enrichment, classify based on confidence
  if (contact.confidence && contact.confidence < 30) return 'pattern_fabricated';

  return 'real_scraped'; // Assume real if we can't determine
}

/**
 * Determine why Hunter wasn't called
 */
function analyzeHunterUsage(log) {
  if (!log) return { called: false, reason: 'no_log' };

  const hunterLog = log.hunter;
  const emailRecovery = log.emailRecovery;
  const dmSearch = log.decisionMakerSearch;

  const result = {
    domainSearchCalled: false,
    emailFinderCalled: false,
    dmSearchCalled: false,
    reason: '',
    details: ''
  };

  // Check domain search
  if (hunterLog && hunterLog.contacted) {
    result.domainSearchCalled = true;
  } else if (hunterLog && hunterLog.skipped) {
    result.reason = 'no_api_key';
  }

  // Check decision-maker search
  if (dmSearch && !dmSearch.error) {
    result.dmSearchCalled = true;
  }

  // Check email recovery (email-finder calls happen inside here)
  if (emailRecovery) {
    const checked = emailRecovery.contactsChecked || 0;
    const recovered = emailRecovery.emailsRecovered || 0;
    const patterns = emailRecovery.patternsGenerated || 0;
    const fnPatterns = emailRecovery.firstNamePatterns || 0;

    // If patterns > 0 or firstNamePatterns > 0, pattern derivation ran
    // email-finder is called for full-name contacts before pattern (Branch A)
    // generateEmailFromFirstName calls domain-search internally (Branch B)
    if (fnPatterns > 0) {
      result.emailFinderCalled = true; // generateEmailFromFirstName calls Hunter internally
    }
    if (checked > 0 && patterns === 0 && fnPatterns === 0 && recovered > 0) {
      result.emailFinderCalled = true; // Likely Hunter email-finder returned results
    }

    result.details = `checked:${checked} recovered:${recovered} patterns:${patterns} fnPatterns:${fnPatterns}`;
  }

  // Determine why domain-search didn't run
  if (!result.domainSearchCalled && !result.dmSearchCalled) {
    if (log.webScrape && log.webScrape.contactsRaw && log.webScrape.contactsRaw.length > 0) {
      result.reason = 'web_scrape_found_contacts';
    } else if (log.webScrape && log.webScrape.error) {
      result.reason = 'web_scrape_errored';
    } else if (!HUNTER_API_KEY) {
      result.reason = 'no_api_key';
    } else {
      result.reason = 'unknown';
    }
  }

  return result;
}

async function runDiagnostic() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  WATERFALL DIAGNOSTIC TEST — 20 Random Raw Companies    ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Hunter API Key: ${HUNTER_API_KEY ? 'SET (' + HUNTER_API_KEY.slice(0, 8) + '...)' : 'NOT SET'}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log('');

  // Support re-testing specific company IDs via COMPANY_IDS env var
  const specificIds = process.env.COMPANY_IDS ? process.env.COMPANY_IDS.split(',').map(Number) : null;

  // Query companies — either specific IDs or random raw ones
  const companies = specificIds
    ? db.db.prepare(`
        SELECT id, name, website, category, address
        FROM companies
        WHERE id IN (${specificIds.map(() => '?').join(',')})
      `).all(...specificIds)
    : db.db.prepare(`
    SELECT id, name, website, category, address
    FROM companies
    WHERE pipeline_stage = 'raw'
      AND website IS NOT NULL
      AND website != ''
      AND website NOT LIKE '%facebook.com%'
      AND website NOT LIKE '%firmy.cz%'
      AND website NOT LIKE '%instagram.com%'
    ORDER BY RANDOM()
    LIMIT ?
  `).all(BATCH_SIZE);

  console.log(specificIds ? `Re-testing ${specificIds.length} specific companies` : 'Testing random companies');

  if (companies.length === 0) {
    console.log('No raw companies with websites found!');
    return;
  }

  console.log(`Found ${companies.length} raw companies to test.\n`);

  // Store results for each company
  const results = [];
  const companyIds = []; // Track IDs for re-testing

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    console.log(`\n[${ i + 1}/${companies.length}] ${company.name}`);
    console.log(`  Website: ${company.website}`);

    let domain;
    try {
      domain = validateAndExtractDomain(company.website);
    } catch (err) {
      console.log(`  ✗ Invalid domain: ${err.message}`);
      results.push({
        name: company.name,
        domain: company.website,
        error: err.message,
        pagesScraped: 0,
        totalContacts: 0,
        real: 0,
        hunter: 0,
        fabricated: 0,
        generic: 0,
        nameOnly: 0,
        hunterStatus: 'N/A',
        hunterReason: 'invalid_domain'
      });
      continue;
    }

    console.log(`  Domain: ${domain}`);

    try {
      const result = await discoverContacts(company.id, domain, HUNTER_API_KEY, { originalUrl: company.website });
      const contacts = result.contacts || [];
      const log = result.log || {};

      // Classify each contact
      const classifications = contacts.map(c => ({
        ...c,
        classification: classifyContact(c)
      }));

      const real = classifications.filter(c => c.classification === 'real_scraped').length;
      const hunterFound = classifications.filter(c => c.classification === 'hunter_found').length;
      const fabricated = classifications.filter(c => c.classification === 'pattern_fabricated').length;
      const generic = classifications.filter(c => c.classification === 'generic').length;
      const nameOnly = classifications.filter(c => c.classification === 'name_only').length;

      // Analyze Hunter usage
      const hunterUsage = analyzeHunterUsage(log);

      // Count pages scraped
      const pagesScraped = log.webScrape?.pagesScraped?.length || 0;

      // Log summary
      console.log(`  Source: ${result.source}`);
      console.log(`  Pages scraped: ${pagesScraped}`);
      console.log(`  Contacts: ${contacts.length} total (${real} real, ${hunterFound} hunter, ${fabricated} fabricated, ${generic} generic, ${nameOnly} name-only)`);
      console.log(`  Hunter: domain-search=${hunterUsage.domainSearchCalled}, dm-search=${hunterUsage.dmSearchCalled}, email-finder=${hunterUsage.emailFinderCalled}`);
      if (hunterUsage.reason) console.log(`  Hunter reason: ${hunterUsage.reason}`);
      if (hunterUsage.details) console.log(`  Email recovery: ${hunterUsage.details}`);

      // Log each contact
      for (const c of classifications) {
        const emailStr = c.email || '(no email)';
        const nameStr = c.firstName || c.name || 'Unknown';
        const titleStr = c.title || '';
        const confStr = c.confidence ? `conf:${c.confidence}` : '';
        console.log(`    → [${c.classification}] ${nameStr} ${titleStr ? '(' + titleStr + ')' : ''} — ${emailStr} ${confStr}`);
      }

      results.push({
        id: company.id,
        name: company.name,
        domain,
        error: null,
        source: result.source,
        pagesScraped,
        totalContacts: contacts.length,
        real,
        hunter: hunterFound,
        fabricated,
        generic,
        nameOnly,
        hunterDomainSearch: hunterUsage.domainSearchCalled,
        hunterDmSearch: hunterUsage.dmSearchCalled,
        hunterEmailFinder: hunterUsage.emailFinderCalled,
        hunterReason: hunterUsage.reason,
        hunterDetails: hunterUsage.details,
        contacts: classifications
      });

      companyIds.push(company.id);

    } catch (err) {
      console.log(`  ✗ Error: ${err.message}`);
      results.push({
        name: company.name,
        domain,
        error: err.message,
        pagesScraped: 0,
        totalContacts: 0,
        real: 0,
        hunter: 0,
        fabricated: 0,
        generic: 0,
        nameOnly: 0,
        hunterStatus: 'error',
        hunterReason: 'enrichment_error'
      });
    }

    // Delay between companies
    if (i < companies.length - 1) {
      console.log(`  Waiting ${DELAY_BETWEEN / 1000}s...`);
      await sleep(DELAY_BETWEEN);
    }
  }

  // ===== SUMMARY =====
  console.log('\n\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║                    RESULTS TABLE                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // Build markdown table
  const header = '| # | Company | Domain | Pages | Contacts | Real | Hunter | Fabricated | Generic | Names Only | Hunter Called? | Why Not? |';
  const divider = '|---|---------|--------|-------|----------|------|--------|------------|---------|------------|----------------|----------|';
  const rows = results.map((r, i) => {
    const hunterCalled = r.hunterDomainSearch || r.hunterDmSearch ? 'YES' : (r.hunterEmailFinder ? 'finder only' : 'NO');
    const reason = r.hunterReason || '';
    return `| ${i + 1} | ${r.name?.slice(0, 30)} | ${r.domain?.slice(0, 25) || 'N/A'} | ${r.pagesScraped} | ${r.totalContacts} | ${r.real} | ${r.hunter} | ${r.fabricated} | ${r.generic} | ${r.nameOnly} | ${hunterCalled} | ${reason} |`;
  });

  const table = [header, divider, ...rows].join('\n');
  console.log(table);

  // Summary stats
  const totalCompanies = results.length;
  const companiesWithContacts = results.filter(r => r.totalContacts > 0).length;
  const totalContacts = results.reduce((s, r) => s + r.totalContacts, 0);
  const totalReal = results.reduce((s, r) => s + r.real, 0);
  const totalHunter = results.reduce((s, r) => s + r.hunter, 0);
  const totalFabricated = results.reduce((s, r) => s + r.fabricated, 0);
  const totalGeneric = results.reduce((s, r) => s + r.generic, 0);
  const totalNameOnly = results.reduce((s, r) => s + r.nameOnly, 0);
  const hunterDomainSearchFired = results.filter(r => r.hunterDomainSearch).length;
  const hunterDmSearchFired = results.filter(r => r.hunterDmSearch).length;
  const errors = results.filter(r => r.error).length;

  console.log('\n--- SUMMARY ---');
  console.log(`Companies tested: ${totalCompanies}`);
  console.log(`Companies with contacts: ${companiesWithContacts} (${Math.round(companiesWithContacts / totalCompanies * 100)}%)`);
  console.log(`Companies with errors: ${errors}`);
  console.log('');
  console.log(`Total contacts found: ${totalContacts}`);
  console.log(`  Real (scraped from HTML): ${totalReal} (${totalContacts ? Math.round(totalReal / totalContacts * 100) : 0}%)`);
  console.log(`  Hunter-found: ${totalHunter} (${totalContacts ? Math.round(totalHunter / totalContacts * 100) : 0}%)`);
  console.log(`  FABRICATED (pattern guess): ${totalFabricated} (${totalContacts ? Math.round(totalFabricated / totalContacts * 100) : 0}%)`);
  console.log(`  Generic (info@, etc.): ${totalGeneric} (${totalContacts ? Math.round(totalGeneric / totalContacts * 100) : 0}%)`);
  console.log(`  Name-only (no email): ${totalNameOnly} (${totalContacts ? Math.round(totalNameOnly / totalContacts * 100) : 0}%)`);
  console.log('');
  console.log(`Hunter domain-search fired: ${hunterDomainSearchFired}/${totalCompanies} companies`);
  console.log(`Hunter DM-search fired: ${hunterDmSearchFired}/${totalCompanies} companies`);
  console.log('');

  // Fabrication rate (the key metric)
  const contactsWithEmail = totalContacts - totalNameOnly;
  const fabricationRate = contactsWithEmail > 0 ? Math.round(totalFabricated / contactsWithEmail * 100) : 0;
  console.log(`*** FABRICATION RATE: ${fabricationRate}% of emails are pattern-guesses ***`);
  console.log(`*** HUNTER DOMAIN-SEARCH RATE: ${Math.round(hunterDomainSearchFired / totalCompanies * 100)}% of companies ***`);

  // Save report
  const reportPath = path.join(__dirname, '..', 'docs', 'waterfall-diagnostic-results.md');
  const report = `# Waterfall Diagnostic Test Results

**Date:** ${new Date().toISOString()}
**Companies tested:** ${totalCompanies}
**Hunter API Key:** ${HUNTER_API_KEY ? 'Configured' : 'Not set'}

## Results Table

${table}

## Summary

| Metric | Count | % |
|--------|-------|---|
| Companies tested | ${totalCompanies} | 100% |
| Companies with contacts | ${companiesWithContacts} | ${Math.round(companiesWithContacts / totalCompanies * 100)}% |
| Companies with errors | ${errors} | ${Math.round(errors / totalCompanies * 100)}% |
| | | |
| Total contacts | ${totalContacts} | 100% |
| Real (scraped from HTML) | ${totalReal} | ${totalContacts ? Math.round(totalReal / totalContacts * 100) : 0}% |
| Hunter-found | ${totalHunter} | ${totalContacts ? Math.round(totalHunter / totalContacts * 100) : 0}% |
| **FABRICATED (pattern guess)** | **${totalFabricated}** | **${totalContacts ? Math.round(totalFabricated / totalContacts * 100) : 0}%** |
| Generic (info@, etc.) | ${totalGeneric} | ${totalContacts ? Math.round(totalGeneric / totalContacts * 100) : 0}% |
| Name-only (no email) | ${totalNameOnly} | ${totalContacts ? Math.round(totalNameOnly / totalContacts * 100) : 0}% |
| | | |
| Hunter domain-search fired | ${hunterDomainSearchFired} | ${Math.round(hunterDomainSearchFired / totalCompanies * 100)}% |
| Hunter DM-search fired | ${hunterDmSearchFired} | ${Math.round(hunterDmSearchFired / totalCompanies * 100)}% |

## Key Metrics

- **Fabrication Rate:** ${fabricationRate}% of emails are pattern-guesses (not verified)
- **Hunter Domain-Search Rate:** ${Math.round(hunterDomainSearchFired / totalCompanies * 100)}% of companies
- **Real Email Rate:** ${contactsWithEmail > 0 ? Math.round(totalReal / contactsWithEmail * 100) : 0}% of emails are confirmed real

## Company IDs Tested

\`${companyIds.join(',')}\`

(Use these IDs to re-test the same companies after fixes)

## Per-Company Details

${results.map((r, i) => `### ${i + 1}. ${r.name}
- Domain: ${r.domain || 'N/A'}
- Source: ${r.source || 'N/A'}
- Pages scraped: ${r.pagesScraped}
- Hunter: domain-search=${r.hunterDomainSearch || false}, dm-search=${r.hunterDmSearch || false}
- Contacts: ${r.totalContacts} (${r.real} real, ${r.hunter} hunter, ${r.fabricated} fabricated, ${r.generic} generic, ${r.nameOnly} name-only)
${r.error ? `- Error: ${r.error}` : ''}
${(r.contacts || []).map(c => `  - [${c.classification}] ${c.firstName || c.name || 'Unknown'} ${c.title ? '(' + c.title + ')' : ''} — ${c.email || '(no email)'} conf:${c.confidence || 'N/A'}`).join('\n')}
`).join('\n')}
`;

  fs.writeFileSync(reportPath, report);
  console.log(`\nReport saved to: ${reportPath}`);
  console.log('Done.');
}

runDiagnostic().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
