require('dotenv').config({ path: '.env.local' });
const express = require('express');
const path = require('path');
const db = require('./db');
const googlePlaces = require('./google-places');
const hunter = require('./hunter');

// PRD-WATERFALL-ENRICHMENT: Import enrichment modules
const {
  enrichCompany,
  discoverContacts,
  validateEmail,
  assignTemplate,
  validateICO
} = require('./enrichment');

const app = express();
const PORT = process.env.PORT || 3003;
const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const API_LIMIT = parseInt(process.env.API_MONTHLY_LIMIT) || 20;
const HUNTER_API_KEY = process.env.HUNTER_API_KEY;

app.use(express.json());
app.use(express.static(__dirname));

// Store active search progress for SSE
const searchProgress = new Map();

// ============ Searches ============

// List all searches
app.get('/api/searches', (req, res) => {
  try {
    const searches = db.getSearches();
    res.json(searches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single search
app.get('/api/searches/:id', (req, res) => {
  try {
    const search = db.getSearchById(req.params.id);
    if (!search) {
      return res.status(404).json({ error: 'Search not found' });
    }
    res.json(search);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start new search
app.post('/api/searches', async (req, res) => {
  const { query, location, gridSize } = req.body;

  if (!query || !location) {
    return res.status(400).json({ error: 'Query and location are required' });
  }

  if (!API_KEY) {
    return res.status(500).json({ error: 'Google Places API key not configured' });
  }

  // Check rate limit
  const usage = db.getApiUsage();
  if (usage.request_count >= API_LIMIT) {
    return res.status(429).json({
      error: `API limit reached (${usage.request_count}/${API_LIMIT} requests this month)`
    });
  }

  try {
    const searchId = db.createSearch(query, location, gridSize || 'medium');

    // Start search in background (with error handling to prevent unhandled rejection)
    runSearchAsync(searchId, query, location, gridSize || 'medium').catch(err => {
      console.error(`Background search ${searchId} failed:`, err);
    });

    res.json({ id: searchId, status: 'running' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete search
app.delete('/api/searches/:id', (req, res) => {
  try {
    db.deleteSearch(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get search progress (SSE)
app.get('/api/searches/:id/progress', (req, res) => {
  const searchId = req.params.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Check current status
  const search = db.getSearchById(searchId);
  if (search && search.status === 'completed') {
    sendEvent({ status: 'completed', resultCount: search.result_count });
    res.end();
    return;
  }

  // Store callback for this search
  const progressCallback = (progress) => {
    sendEvent(progress);
    if (progress.status === 'completed' || progress.status === 'error') {
      searchProgress.delete(searchId);
      res.end();
    }
  };

  searchProgress.set(searchId, progressCallback);

  req.on('close', () => {
    searchProgress.delete(searchId);
  });
});

async function runSearchAsync(searchId, query, location, gridSize) {
  const onProgress = (progress) => {
    const callback = searchProgress.get(String(searchId));
    if (callback) {
      callback(progress);
    }
  };

  try {
    const result = await googlePlaces.runSearch(
      searchId, query, location, gridSize, API_KEY, API_LIMIT, onProgress
    );

    onProgress({
      status: 'completed',
      totalResults: result.totalResults,
      newResults: result.newResults
    });

  } catch (error) {
    console.error(`Search ${searchId} error:`, error);
    try {
      db.updateSearchStatus(searchId, 'error');
      onProgress({ status: 'error', message: error.message });
    } catch (innerError) {
      console.error(`Failed to handle search error:`, innerError);
    }
  }
}

// ============ Companies ============

// Get companies for a search
app.get('/api/searches/:id/companies', (req, res) => {
  try {
    const companies = db.getCompaniesBySearch(req.params.id);
    res.json(companies);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all companies
app.get('/api/companies', (req, res) => {
  try {
    const companies = db.getAllCompanies();
    res.json(companies);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single company
app.get('/api/companies/:id', (req, res) => {
  try {
    const company = db.getCompanyById(req.params.id);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    res.json(company);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete single company
app.delete('/api/companies/:id', (req, res) => {
  try {
    db.deleteCompany(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk delete companies
app.post('/api/companies/bulk-delete', (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: 'ids array required' });
  }
  if (ids.length === 0) {
    return res.status(400).json({ error: 'ids array cannot be empty' });
  }
  if (ids.length > 1000) {
    return res.status(400).json({ error: 'Maximum 1000 items per batch' });
  }
  // Validate all IDs are positive integers
  for (const id of ids) {
    const num = Number(id);
    if (!Number.isInteger(num) || num <= 0) {
      return res.status(400).json({ error: `Invalid ID: ${id}` });
    }
  }
  try {
    db.bulkDeleteCompanies(ids);
    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Export ============

// Export search results as CSV
app.get('/api/searches/:id/export', (req, res) => {
  try {
    const companies = db.getCompaniesBySearch(req.params.id);
    const csv = db.exportToCSV(companies);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="leads-search-${req.params.id}.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export all companies as CSV
app.get('/api/companies/export', (req, res) => {
  try {
    const companies = db.getAllCompanies();
    const csv = db.exportToCSV(companies);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="all-leads.csv"');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Usage ============

app.get('/api/usage', (req, res) => {
  try {
    const usage = db.getApiUsage();
    res.json({
      month: usage.month,
      used: usage.request_count,
      limit: API_LIMIT,
      remaining: Math.max(0, API_LIMIT - usage.request_count)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Enrichment (Hunter.io) ============

// Enrich single company
app.post('/api/companies/:id/enrich', async (req, res) => {
  if (!HUNTER_API_KEY) {
    return res.status(500).json({ error: 'Hunter API key not configured. Add HUNTER_API_KEY to .env.local' });
  }

  try {
    const company = db.getCompanyById(req.params.id);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    if (!company.website) {
      return res.status(400).json({ error: 'Company has no website' });
    }

    const { emails, error } = await hunter.enrichCompany(company.website, HUNTER_API_KEY);

    if (error) {
      return res.status(400).json({ error });
    }

    const count = db.saveContacts(company.id, emails);
    const primary = emails.find(e => e.isPrimary);

    res.json({
      id: company.id,
      contactsFound: count,
      primaryContact: primary || null,
      contacts: emails
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Enrich all companies (simple loop, no SSE for now)
app.post('/api/companies/enrich', async (req, res) => {
  if (!HUNTER_API_KEY) {
    return res.status(500).json({ error: 'Hunter API key not configured. Add HUNTER_API_KEY to .env.local' });
  }

  try {
    const companies = db.getCompaniesForEnrichment();

    if (!companies.length) {
      return res.json({ message: 'No companies to enrich', enriched: 0 });
    }

    let enriched = 0;
    let totalContacts = 0;
    const errors = [];

    for (const company of companies) {
      try {
        const { emails } = await hunter.enrichCompany(company.website, HUNTER_API_KEY);
        if (emails.length > 0) {
          db.saveContacts(company.id, emails);
          enriched++;
          totalContacts += emails.length;
        }
        // Rate limit: 500ms between requests
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        errors.push({ id: company.id, name: company.name, error: err.message });
      }
    }

    res.json({ enriched, totalContacts, total: companies.length, errors });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get contacts for a company
app.get('/api/companies/:id/contacts', (req, res) => {
  try {
    const contacts = db.getContactsByCompany(req.params.id);
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Waterfall Enrichment (PRD-WATERFALL-ENRICHMENT) ============

/**
 * Full waterfall enrichment for a single company (Steps 1-4)
 * 1. Get company, extract domain
 * 2. enrichCompany(domain) - get segment, ico, etc.
 * 3. If ico found, validateICO(ico)
 * 4. discoverContacts(id, domain, HUNTER_API_KEY)
 * 5. For each contact, validateEmail and assignTemplate
 */
app.post('/api/companies/:id/enrich-full', async (req, res) => {
  try {
    const company = db.getCompanyById(req.params.id);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    if (!company.website) {
      return res.status(400).json({ error: 'Company has no website' });
    }

    // Step 1: Extract domain from website
    const domain = company.website
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '');

    const result = {
      company_id: company.id,
      domain,
      enrichment: null,
      ico_validation: null,
      contacts: [],
      errors: []
    };

    // Step 2: Enrich company (get segment, ico, industry, etc.)
    try {
      const enrichmentData = await enrichCompany(domain);
      result.enrichment = enrichmentData;

      // Update company with enrichment data
      db.updateCompanyEnrichment(company.id, {
        ico: enrichmentData.ico || null,
        segment: enrichmentData.segment || null,
        industry: enrichmentData.industry || null,
        company_size: enrichmentData.size || null,
        enrichment_source: 'waterfall_full',
        ico_validated: false
      });
    } catch (err) {
      result.errors.push({ step: 'enrichCompany', error: err.message });
    }

    // Step 3: Validate ICO if found
    if (result.enrichment?.ico) {
      try {
        const icoValidation = await validateICO(result.enrichment.ico);
        result.ico_validation = icoValidation;

        if (icoValidation.valid) {
          db.updateCompanyEnrichment(company.id, { ico_validated: true });
        }
      } catch (err) {
        result.errors.push({ step: 'validateICO', error: err.message });
      }
    }

    // Step 4: Discover contacts using waterfall (web scrape first, then Hunter)
    try {
      const contactResult = await discoverContacts(company.id, domain, HUNTER_API_KEY);
      const contacts = contactResult.contacts || [];

      // Step 5: For each contact, validate email and assign template
      for (const contact of contacts) {
        let emailValidation = null;
        let templateType = 'generic';

        // Validate email
        if (contact.email) {
          try {
            emailValidation = await validateEmail(contact.email);
          } catch (err) {
            emailValidation = { valid: false, reason: 'validation_error' };
          }
        }

        // Assign template based on role/title
        templateType = assignTemplate(contact.title || contact.role);

        // Save contact to database
        const savedContacts = db.saveContacts(company.id, [{
          email: contact.email,
          firstName: contact.firstName,
          lastName: contact.lastName,
          fullName: contact.name,
          title: contact.title,
          isPrimary: contacts.indexOf(contact) === 0,
          confidence: contact.confidence || 50
        }]);

        // Get the contact ID from database for the most recently saved contact
        const dbContacts = db.getContactsByCompany(company.id);
        const dbContact = dbContacts.find(c => c.email === contact.email);

        if (dbContact) {
          // Update contact with validation data
          db.updateContactValidation(dbContact.id, {
            email_valid: emailValidation?.valid || false,
            email_validated_at: new Date().toISOString(),
            template_type: templateType,
            source: contactResult.source || 'unknown',
            phone: contact.phone || null
          });
        }

        result.contacts.push({
          ...contact,
          email_valid: emailValidation?.valid || false,
          template_type: templateType,
          source: contactResult.source
        });
      }
    } catch (err) {
      result.errors.push({ step: 'discoverContacts', error: err.message });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Batch enrich unenriched companies (companies with website but no enrichment_source)
 */
app.post('/api/companies/enrich-batch', async (req, res) => {
  try {
    const companies = db.getUnenrichedCompanies();

    if (!companies.length) {
      return res.json({ message: 'No unenriched companies found', enriched: 0 });
    }

    const { limit = 10 } = req.body;
    const toProcess = companies.slice(0, limit);

    const results = {
      total: companies.length,
      processed: 0,
      enriched: 0,
      contacts_found: 0,
      errors: []
    };

    for (const company of toProcess) {
      try {
        const domain = company.website
          .replace(/^https?:\/\//, '')
          .replace(/^www\./, '')
          .replace(/\/.*$/, '');

        // Enrich company
        const enrichmentData = await enrichCompany(domain);

        db.updateCompanyEnrichment(company.id, {
          ico: enrichmentData.ico || null,
          segment: enrichmentData.segment || null,
          industry: enrichmentData.industry || null,
          company_size: enrichmentData.size || null,
          enrichment_source: 'batch_waterfall',
          ico_validated: false
        });

        // Validate ICO if found
        if (enrichmentData.ico) {
          try {
            const icoValidation = await validateICO(enrichmentData.ico);
            if (icoValidation.valid) {
              db.updateCompanyEnrichment(company.id, { ico_validated: true });
            }
          } catch (err) {
            // Continue even if ICO validation fails
          }
        }

        // Discover contacts
        const contactResult = await discoverContacts(company.id, domain, HUNTER_API_KEY);
        if (contactResult.contacts?.length > 0) {
          db.saveContacts(company.id, contactResult.contacts.map((c, idx) => ({
            email: c.email,
            firstName: c.firstName,
            lastName: c.lastName,
            fullName: c.name,
            title: c.title,
            isPrimary: idx === 0,
            confidence: c.confidence || 50
          })));
          results.contacts_found += contactResult.contacts.length;
        }

        results.enriched++;
        results.processed++;

        // Rate limiting between companies
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        results.errors.push({ company_id: company.id, name: company.name, error: err.message });
        results.processed++;
      }
    }

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Validate email for a single contact (MX check)
 */
app.post('/api/contacts/:id/validate-email', async (req, res) => {
  try {
    const contact = db.getContactById(req.params.id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    if (!contact.email) {
      return res.status(400).json({ error: 'Contact has no email' });
    }

    const validation = await validateEmail(contact.email);

    // Update contact with validation result
    db.updateContactValidation(contact.id, {
      email_valid: validation.valid,
      email_validated_at: new Date().toISOString()
    });

    res.json({
      contact_id: contact.id,
      email: contact.email,
      valid: validation.valid,
      reason: validation.reason,
      mx_host: validation.mxHost || null,
      validated_at: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Batch validate unchecked emails (contacts where email_valid IS NULL)
 */
app.post('/api/contacts/validate-batch', async (req, res) => {
  try {
    const contacts = db.getUnvalidatedContacts();

    if (!contacts.length) {
      return res.json({ message: 'No unvalidated contacts found', validated: 0 });
    }

    const { limit = 50 } = req.body;
    const toProcess = contacts.slice(0, limit);

    const results = {
      total: contacts.length,
      processed: 0,
      valid: 0,
      invalid: 0,
      errors: []
    };

    for (const contact of toProcess) {
      try {
        const validation = await validateEmail(contact.email);

        db.updateContactValidation(contact.id, {
          email_valid: validation.valid,
          email_validated_at: new Date().toISOString()
        });

        if (validation.valid) {
          results.valid++;
        } else {
          results.invalid++;
        }

        results.processed++;

        // Small delay between validations to avoid DNS rate limiting
        await new Promise(r => setTimeout(r, 100));
      } catch (err) {
        results.errors.push({ contact_id: contact.id, email: contact.email, error: err.message });
        results.processed++;
      }
    }

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Lead Scraper running at http://localhost:${PORT}`);
  console.log(`API limit: ${API_LIMIT} requests/month`);
  const usage = db.getApiUsage();
  console.log(`Current usage: ${usage.request_count}/${API_LIMIT}`);
});
