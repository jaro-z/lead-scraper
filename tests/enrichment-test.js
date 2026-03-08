/**
 * Live Enrichment Test
 *
 * Tests free web scraping enrichment on real Czech companies.
 * Measures: what % of CEO/founder/partner contacts can we find without Hunter.io?
 *
 * Usage: node tests/enrichment-test.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const db = require('../db');
const { enrichCompany, validateICO } = require('../enrichment/companyEnricher');
const { discoverContacts } = require('../enrichment/contactWaterfall');
const { validateEmail } = require('../enrichment/validators');
const { assignTemplate } = require('../enrichment/templateRouter');
const { validateAndExtractDomain } = require('../utils');

const BATCH_SIZE = 35;
const DELAY_BETWEEN = 3000; // 3 seconds between companies to avoid rate limits

// Decision-maker role patterns (Czech + English)
const DECISION_MAKER_PATTERNS = /ceo|founder|co-founder|owner|managing director|partner|jednatel|majitel|zakladatel|spolumajitel|ředitel|generální|general director|principal|president/i;

function isDecisionMaker(title) {
  if (!title) return false;
  return DECISION_MAKER_PATTERNS.test(title);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('=== CHORIZO LEAD SCRAPER — FREE ENRICHMENT TEST ===');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log('');

  // Step 1: Reset previously enriched companies so we can re-test
  console.log('Step 1: Resetting previously enriched companies...');
  db.db.prepare(`
    UPDATE companies
    SET enrichment_source = NULL, contacts_count = 0, enrichment_error = NULL, enrichment_log = NULL
    WHERE enrichment_source IS NOT NULL
  `).run();
  db.db.prepare('DELETE FROM contacts').run();
  console.log('  Reset complete.');

  // Step 2: Select test companies (with websites, excluding social media URLs)
  console.log(`\nStep 2: Selecting ${BATCH_SIZE} test companies...`);
  const companies = db.db.prepare(`
    SELECT id, name, website, address, pipeline_stage
    FROM companies
    WHERE website IS NOT NULL
      AND website != ''
      AND website NOT LIKE '%facebook.com%'
      AND website NOT LIKE '%instagram.com%'
      AND website NOT LIKE '%linkedin.com%'
      AND website NOT LIKE '%twitter.com%'
    ORDER BY RANDOM()
    LIMIT ?
  `).all(BATCH_SIZE);

  console.log(`  Selected ${companies.length} companies with real websites.`);

  // Step 3: Run enrichment on each company
  const results = [];
  let successCount = 0;
  let anyContactCount = 0;
  let decisionMakerCount = 0;
  let hunterFallbackCount = 0;
  let emailValidCount = 0;
  let totalEmails = 0;
  let errCount = 0;

  console.log(`\nStep 3: Running free web scraping enrichment...\n`);

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    let domain;

    try {
      domain = validateAndExtractDomain(company.website);
    } catch (e) {
      console.log(`  [${i + 1}/${companies.length}] ${company.name} — SKIP: invalid domain (${e.message})`);
      results.push({
        id: company.id,
        name: company.name,
        website: company.website,
        domain: null,
        status: 'invalid_domain',
        contacts: [],
        decisionMaker: null,
        hunterNeeded: false,
        error: e.message
      });
      errCount++;
      continue;
    }

    console.log(`  [${i + 1}/${companies.length}] ${company.name} (${domain})...`);

    const result = {
      id: company.id,
      name: company.name,
      website: company.website,
      domain,
      status: 'pending',
      enrichment: null,
      contacts: [],
      decisionMaker: null,
      hunterNeeded: false,
      emailsValid: 0,
      source: null,
      error: null
    };

    try {
      // Step 3a: Company enrichment (segment, ICO)
      let enrichmentData = null;
      try {
        enrichmentData = await enrichCompany(domain);
        result.enrichment = {
          segment: enrichmentData?.segment,
          industry: enrichmentData?.industry,
          size: enrichmentData?.size,
          ico: enrichmentData?.ico
        };

        // Save to DB
        db.updateCompanyEnrichment(company.id, {
          ico: enrichmentData?.ico || null,
          segment: enrichmentData?.segment || null,
          industry: enrichmentData?.industry || null,
          company_description: enrichmentData?.description || null,
          company_size: enrichmentData?.size || null,
          enrichment_source: 'test_free_scrape',
          ico_validated: false
        });

        // Validate ICO if found
        if (enrichmentData?.ico) {
          try {
            const icoResult = await validateICO(enrichmentData.ico);
            if (icoResult.valid) {
              db.updateCompanyEnrichment(company.id, { ico_validated: true });
              result.enrichment.icoValid = true;
            }
          } catch (e) {
            // ICO validation failure is not critical
          }
        }
      } catch (e) {
        result.error = `Company enrichment failed: ${e.message}`;
        console.log(`    ⚠ Company enrichment failed: ${e.message.substring(0, 80)}`);
      }

      // Step 3b: Contact discovery (FREE path only)
      const contactResult = await discoverContacts(company.id, domain, null); // null = no Hunter API key
      const contacts = contactResult.contacts || [];
      result.source = contactResult.source;

      if (contactResult.source === null && contacts.length === 0) {
        result.hunterNeeded = true;
        hunterFallbackCount++;
        console.log(`    HUNTER_FALLBACK_NEEDED: ${domain} — no contacts from web scraping`);
      }

      // Step 3c: Process contacts
      if (contacts.length > 0) {
        // Save all contacts at once
        const dbContacts = contacts.map((c, idx) => ({
          email: c.email,
          firstName: c.firstName,
          lastName: c.lastName,
          fullName: c.name,
          title: c.title,
          isPrimary: idx === 0,
          confidence: c.confidence || 50
        }));
        db.saveContacts(company.id, dbContacts);

        // Validate emails and assign templates
        for (const contact of contacts) {
          let emailValid = false;
          if (contact.email) {
            totalEmails++;
            try {
              const validation = await validateEmail(contact.email);
              emailValid = validation.valid;
              if (emailValid) emailValidCount++;
            } catch {
              // MX check failed
            }
          }

          const templateType = assignTemplate(contact.title || contact.role);
          const isDM = isDecisionMaker(contact.title || contact.role);

          result.contacts.push({
            name: contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
            title: contact.title || contact.role,
            email: contact.email,
            phone: contact.phone,
            emailValid,
            templateType,
            isDecisionMaker: isDM
          });

          // Update contact in DB
          const savedContacts = db.getContactsByCompany(company.id);
          const savedContact = savedContacts.find(c => c.email === contact.email);
          if (savedContact) {
            db.updateContactValidation(savedContact.id, {
              email_valid: emailValid,
              email_validated_at: new Date().toISOString(),
              template_type: templateType,
              source: contactResult.source || 'web_scrape',
              phone: contact.phone || null
            });
          }
        }
      }

      // Determine decision maker
      const dm = result.contacts.find(c => c.isDecisionMaker);
      if (dm) {
        result.decisionMaker = dm;
        decisionMakerCount++;
      }

      if (result.contacts.length > 0) {
        anyContactCount++;
        result.status = 'contacts_found';
        db.updatePipelineStage(company.id, 'enriched');
        console.log(`    ✓ Found ${result.contacts.length} contact(s)${dm ? ` — DM: ${dm.name} (${dm.title})` : ' — no decision-maker'}`);
      } else {
        result.status = 'no_contacts';
        console.log(`    ✗ No contacts found`);
      }

      successCount++;
    } catch (e) {
      result.status = 'error';
      result.error = e.message;
      errCount++;
      console.log(`    ✗ ERROR: ${e.message.substring(0, 100)}`);
    }

    results.push(result);

    // Rate limit delay
    if (i < companies.length - 1) {
      await sleep(DELAY_BETWEEN);
    }
  }

  // Step 4: Calculate and display results
  console.log('\n\n=== TEST RESULTS ===\n');

  const tested = results.length;
  const withWebsite = results.filter(r => r.domain).length;

  console.log(`| Metric                     | Result              |`);
  console.log(`|----------------------------|---------------------|`);
  console.log(`| Companies tested           | ${tested}                |`);
  console.log(`| Companies with valid domain | ${withWebsite}                |`);
  console.log(`| Any contact found          | ${anyContactCount} (${Math.round(anyContactCount / withWebsite * 100)}%)         |`);
  console.log(`| Decision-maker found       | ${decisionMakerCount} (${Math.round(decisionMakerCount / withWebsite * 100)}%)         |`);
  console.log(`| Would need Hunter fallback | ${hunterFallbackCount} (${Math.round(hunterFallbackCount / withWebsite * 100)}%)         |`);
  console.log(`| Emails MX-validated        | ${emailValidCount}/${totalEmails} (${totalEmails > 0 ? Math.round(emailValidCount / totalEmails * 100) : 0}%)    |`);
  console.log(`| Errors                     | ${errCount}                 |`);

  // Step 5: Write detailed results file
  const fs = require('fs');
  const reportPath = require('path').join(__dirname, '..', 'docs', 'enrichment-test-results.md');

  let report = `# Enrichment Test Results — Free Web Scraping Only\n\n`;
  report += `**Date**: ${new Date().toISOString()}\n`;
  report += `**Method**: Free web scraping (Firecrawl + Claude API) — NO Hunter.io\n`;
  report += `**Sample**: ${tested} Czech companies (marketing/PR/HR/creative agencies)\n\n`;
  report += `---\n\n`;
  report += `## Summary\n\n`;
  report += `| Metric | Free Scraping Only |\n`;
  report += `|--------|--------------------|\n`;
  report += `| Companies tested | ${tested} |\n`;
  report += `| Companies with valid domains | ${withWebsite} |\n`;
  report += `| Any contact found | ${anyContactCount} (${Math.round(anyContactCount / withWebsite * 100)}%) |\n`;
  report += `| Decision-maker found | ${decisionMakerCount} (${Math.round(decisionMakerCount / withWebsite * 100)}%) |\n`;
  report += `| Would need Hunter fallback | ${hunterFallbackCount} (${Math.round(hunterFallbackCount / withWebsite * 100)}%) |\n`;
  report += `| Emails MX-validated | ${emailValidCount}/${totalEmails} (${totalEmails > 0 ? Math.round(emailValidCount / totalEmails * 100) : 0}%) |\n`;
  report += `| Errors | ${errCount} |\n\n`;
  report += `---\n\n`;
  report += `## Detailed Results\n\n`;

  for (const r of results) {
    report += `### ${r.name}\n`;
    report += `- **Domain**: ${r.domain || 'N/A'}\n`;
    report += `- **Status**: ${r.status}\n`;
    if (r.enrichment) {
      report += `- **Segment**: ${r.enrichment.segment || 'N/A'}\n`;
      report += `- **Industry**: ${r.enrichment.industry || 'N/A'}\n`;
      report += `- **Size**: ${r.enrichment.size || 'N/A'}\n`;
      if (r.enrichment.ico) {
        report += `- **IČO**: ${r.enrichment.ico} (${r.enrichment.icoValid ? 'valid' : 'not validated'})\n`;
      }
    }
    if (r.contacts.length > 0) {
      report += `- **Contacts found**: ${r.contacts.length}\n`;
      for (const c of r.contacts) {
        report += `  - ${c.name || 'Unknown'} — ${c.title || 'Unknown role'} — ${c.email || 'no email'}`;
        if (c.emailValid) report += ' ✓ MX valid';
        if (c.isDecisionMaker) report += ' ⭐ DECISION MAKER';
        report += `\n`;
      }
      report += `- **Source**: ${r.source}\n`;
    }
    if (r.hunterNeeded) {
      report += `- **HUNTER_FALLBACK_NEEDED**: Yes\n`;
    }
    if (r.error) {
      report += `- **Error**: ${r.error}\n`;
    }
    report += `\n`;
  }

  report += `---\n\n`;
  report += `## Companies Where Hunter.io Fallback Would Be Needed\n\n`;
  const hunterNeeded = results.filter(r => r.hunterNeeded);
  if (hunterNeeded.length > 0) {
    for (const r of hunterNeeded) {
      report += `- ${r.name} (${r.domain})\n`;
    }
  } else {
    report += `None — all companies had contacts from free scraping.\n`;
  }

  report += `\n---\n\n`;
  report += `## Decision-Maker Contacts Found\n\n`;
  const dmResults = results.filter(r => r.decisionMaker);
  if (dmResults.length > 0) {
    report += `| Company | Name | Title | Email | MX Valid |\n`;
    report += `|---------|------|-------|-------|----------|\n`;
    for (const r of dmResults) {
      const dm = r.decisionMaker;
      report += `| ${r.name} | ${dm.name || 'N/A'} | ${dm.title || 'N/A'} | ${dm.email || 'N/A'} | ${dm.emailValid ? 'Yes' : 'No'} |\n`;
    }
  } else {
    report += `No decision-maker contacts found.\n`;
  }

  fs.writeFileSync(reportPath, report);
  console.log(`\nDetailed results written to: docs/enrichment-test-results.md`);
  console.log('\nTest complete.');

  // Return summary for orchestrator
  return {
    tested,
    withWebsite,
    anyContactCount,
    decisionMakerCount,
    hunterFallbackCount,
    emailValidCount,
    totalEmails,
    errCount,
    anyContactRate: Math.round(anyContactCount / withWebsite * 100),
    decisionMakerRate: Math.round(decisionMakerCount / withWebsite * 100),
    hunterFallbackRate: Math.round(hunterFallbackCount / withWebsite * 100)
  };
}

runTest()
  .then(summary => {
    console.log('\n=== SUMMARY FOR ORCHESTRATOR ===');
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('FATAL ERROR:', err);
    process.exit(1);
  });
