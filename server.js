require('dotenv').config({ path: '.env.local' });
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const db = require('./db');
const googlePlaces = require('./google-places');
const hunter = require('./hunter');
const notion = require('./notion');
const { extractDomain, validateAndExtractDomain, sleep, validateId, sanitizeErrorMessage } = require('./utils');

const {
  enrichCompany,
  discoverContacts,
  validateEmail,
  assignTemplate,
  validateICO
} = require('./enrichment');

const app = express();
const PORT = process.env.PORT || 3002;
const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const API_LIMIT = parseInt(process.env.API_MONTHLY_LIMIT) || 20;
const HUNTER_API_KEY = process.env.HUNTER_API_KEY;
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

// ============ Rate Limiting ============

// General API limiter: 100 requests per 15 minutes for all /api/ routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limiter for batch enrichment: 5 requests per hour
const batchEnrichLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: 'Batch enrichment rate limit exceeded. Maximum 5 requests per hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limiter for batch contact validation: 10 requests per 15 minutes
const batchValidateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Batch validation rate limit exceeded. Maximum 10 requests per 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limiter for full enrichment: 20 requests per hour
const fullEnrichLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: { error: 'Full enrichment rate limit exceeded. Maximum 20 requests per hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general API limiter to all /api/ routes
app.use('/api/', apiLimiter);

// ============ CORS Configuration ============
// Allow requests from localhost development servers
app.use(cors({
  origin: ['http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());
app.use(express.static(__dirname));

// Store active search progress for SSE
const searchProgress = new Map();

// ============ Helper Functions ============

/**
 * Wrap async route handlers to catch errors automatically
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(err => {
      res.status(500).json({ error: sanitizeErrorMessage(err) });
    });
  };
}

/**
 * Check if Hunter API is configured
 */
function requireHunterApi(res) {
  if (!HUNTER_API_KEY) {
    res.status(500).json({ error: 'Hunter API key not configured. Add HUNTER_API_KEY to .env.local' });
    return false;
  }
  return true;
}

/**
 * Check if Notion is configured
 */
function requireNotionConfig(res) {
  if (!NOTION_API_KEY || !NOTION_DATABASE_ID) {
    res.status(500).json({ error: 'Notion not configured. Add NOTION_API_KEY and NOTION_DATABASE_ID to .env.local' });
    return false;
  }
  return true;
}

/**
 * Get company by ID or return 404
 */
function getCompanyOrFail(id, res) {
  const company = db.getCompanyById(id);
  if (!company) {
    res.status(404).json({ error: 'Company not found' });
    return null;
  }
  return company;
}

/**
 * Require company to have a website
 */
function requireWebsite(company, res) {
  if (!company.website) {
    res.status(400).json({ error: 'Company has no website' });
    return false;
  }
  return true;
}

// ============ Searches ============

app.get('/api/searches', asyncHandler((req, res) => {
  res.json(db.getSearches());
}));

app.get('/api/searches/:id', asyncHandler((req, res) => {
  const search = db.getSearchById(req.params.id);
  if (!search) {
    return res.status(404).json({ error: 'Search not found' });
  }
  res.json(search);
}));

app.post('/api/searches', asyncHandler(async (req, res) => {
  const { query, location, gridSize } = req.body;

  if (!query || !location) {
    return res.status(400).json({ error: 'Query and location are required' });
  }
  if (!API_KEY) {
    return res.status(500).json({ error: 'Google Places API key not configured' });
  }

  const usage = db.getApiUsage();
  if (usage.request_count >= API_LIMIT) {
    return res.status(429).json({
      error: `API limit reached (${usage.request_count}/${API_LIMIT} requests this month)`
    });
  }

  const searchId = db.createSearch(query, location, gridSize || 'medium');

  runSearchAsync(searchId, query, location, gridSize || 'medium').catch(err => {
    console.error(`Background search ${searchId} failed:`, err);
  });

  res.json({ id: searchId, status: 'running' });
}));

app.delete('/api/searches/:id', asyncHandler((req, res) => {
  db.deleteSearch(req.params.id);
  res.json({ success: true });
}));

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

app.get('/api/searches/:id/companies', asyncHandler((req, res) => {
  res.json(db.getCompaniesBySearch(req.params.id));
}));

app.get('/api/companies', asyncHandler((req, res) => {
  res.json(db.getAllCompanies());
}));

// Pipeline stats - must be before /api/companies/:id
app.get('/api/companies/stats', asyncHandler(async (req, res) => {
  const stats = db.getPipelineStats();
  res.json(stats);
}));

app.get('/api/companies/:id', asyncHandler((req, res) => {
  const company = getCompanyOrFail(req.params.id, res);
  if (company) res.json(company);
}));

app.delete('/api/companies/:id', asyncHandler((req, res) => {
  db.deleteCompany(req.params.id);
  res.json({ success: true });
}));

app.post('/api/companies/bulk-delete', asyncHandler((req, res) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array required and cannot be empty' });
  }

  // Validation is handled by db.bulkDeleteCompanies via validateIds
  db.bulkDeleteCompanies(ids);
  res.json({ success: true, deleted: ids.length });
}));

// ============ Export ============

function sendCSV(res, companies, filename) {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(db.exportToCSV(companies));
}

app.get('/api/searches/:id/export', asyncHandler((req, res) => {
  const companies = db.getCompaniesBySearch(req.params.id);
  sendCSV(res, companies, `leads-search-${req.params.id}.csv`);
}));
app.get('/api/companies/export', asyncHandler((req, res) => {
  sendCSV(res, db.getAllCompanies(), 'all-leads.csv');
}));

// ============ Usage ============

app.get('/api/usage', asyncHandler((req, res) => {
  const usage = db.getApiUsage();
  res.json({
    month: usage.month,
    used: usage.request_count,
    limit: API_LIMIT,
    remaining: Math.max(0, API_LIMIT - usage.request_count)
  });
}));

// ============ Enrichment (Hunter.io) ============

app.post('/api/companies/:id/enrich', asyncHandler(async (req, res) => {
  if (!requireHunterApi(res)) return;

  const company = getCompanyOrFail(req.params.id, res);
  if (!company) return;
  if (!requireWebsite(company, res)) return;

  const { emails, error } = await hunter.enrichCompany(company.website, HUNTER_API_KEY);
  if (error) {
    return res.status(400).json({ error });
  }

  const count = db.saveContacts(company.id, emails);
  res.json({
    id: company.id,
    contactsFound: count,
    primaryContact: emails.find(e => e.isPrimary) || null,
    contacts: emails
  });
}));

app.post('/api/companies/enrich', asyncHandler(async (req, res) => {
  if (!requireHunterApi(res)) return;

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
      await sleep(500);
    } catch (err) {
      errors.push({ id: company.id, name: company.name, error: err.message });
    }
  }

  res.json({ enriched, totalContacts, total: companies.length, errors });
}));

app.get('/api/companies/:id/contacts', asyncHandler((req, res) => {
  res.json(db.getContactsByCompany(req.params.id));
}));

// ============ Waterfall Enrichment (PRD-WATERFALL-ENRICHMENT) ============

/**
 * Run enrichment step with error capture
 */
async function runEnrichmentStep(stepName, result, fn) {
  try {
    return await fn();
  } catch (err) {
    result.errors.push({ step: stepName, error: err.message });
    return null;
  }
}

/**
 * Process a single contact: validate email and assign template
 */
async function processContact(contact, contactIndex, companyId, source) {
  let emailValidation = null;

  if (contact.email) {
    try {
      emailValidation = await validateEmail(contact.email);
    } catch {
      emailValidation = { valid: false, reason: 'validation_error' };
    }
  }

  const templateType = assignTemplate(contact.title || contact.role);

  db.saveContacts(companyId, [{
    email: contact.email,
    firstName: contact.firstName,
    lastName: contact.lastName,
    fullName: contact.name,
    title: contact.title,
    isPrimary: contactIndex === 0,
    confidence: contact.confidence || 50
  }]);

  const dbContacts = db.getContactsByCompany(companyId);
  const dbContact = dbContacts.find(c => c.email === contact.email);

  if (dbContact) {
    db.updateContactValidation(dbContact.id, {
      email_valid: emailValidation?.valid || false,
      email_validated_at: new Date().toISOString(),
      template_type: templateType,
      source: source || 'unknown',
      phone: contact.phone || null
    });
  }

  return {
    ...contact,
    email_valid: emailValidation?.valid || false,
    template_type: templateType,
    source
  };
}

app.post('/api/companies/:id/enrich-full', fullEnrichLimiter, asyncHandler(async (req, res) => {
  const company = getCompanyOrFail(req.params.id, res);
  if (!company) return;
  if (!requireWebsite(company, res)) return;

  // Validate domain to prevent SSRF attacks
  let domain;
  try {
    domain = validateAndExtractDomain(company.website);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const result = {
    company_id: company.id,
    domain,
    enrichment: null,
    ico_validation: null,
    contacts: [],
    errors: []
  };

  // Step 1: Enrich company
  const enrichmentData = await runEnrichmentStep('enrichCompany', result, async () => {
    const data = await enrichCompany(domain);
    db.updateCompanyEnrichment(company.id, {
      ico: data.ico || null,
      segment: data.segment || null,
      industry: data.industry || null,
      company_size: data.size || null,
      enrichment_source: 'waterfall_full',
      ico_validated: false
    });
    return data;
  });
  result.enrichment = enrichmentData;

  // Step 2: Validate ICO if found
  if (enrichmentData?.ico) {
    const icoValidation = await runEnrichmentStep('validateICO', result, async () => {
      const validation = await validateICO(enrichmentData.ico);
      if (validation.valid) {
        db.updateCompanyEnrichment(company.id, { ico_validated: true });
      }
      return validation;
    });
    result.ico_validation = icoValidation;
  }

  // Step 3: Discover and process contacts
  await runEnrichmentStep('discoverContacts', result, async () => {
    const contactResult = await discoverContacts(company.id, domain, HUNTER_API_KEY);
    const contacts = contactResult.contacts || [];

    for (let i = 0; i < contacts.length; i++) {
      const processed = await processContact(contacts[i], i, company.id, contactResult.source);
      result.contacts.push(processed);
    }
  });

  // Update pipeline stage to enriched
  try {
    db.updatePipelineStage(company.id, 'enriched');
  } catch (stageErr) {
    result.errors.push({ step: 'updatePipelineStage', error: stageErr.message });
  }

  res.json(result);
}));

/**
 * Convert raw contacts to database format
 */
function formatContactsForDB(contacts) {
  return contacts.map((c, idx) => ({
    email: c.email,
    firstName: c.firstName,
    lastName: c.lastName,
    fullName: c.name,
    title: c.title,
    isPrimary: idx === 0,
    confidence: c.confidence || 50
  }));
}

app.post('/api/companies/enrich-batch', batchEnrichLimiter, asyncHandler(async (req, res) => {
  const companies = db.getUnenrichedCompanies();
  if (!companies.length) {
    return res.json({ message: 'No unenriched companies found', enriched: 0 });
  }

  // Batch limit validation: max 25 companies per batch
  const MAX_ENRICH_BATCH_LIMIT = 25;
  const DEFAULT_ENRICH_LIMIT = 10;
  const requestedLimit = parseInt(req.body.limit) || DEFAULT_ENRICH_LIMIT;

  if (requestedLimit > MAX_ENRICH_BATCH_LIMIT) {
    return res.status(400).json({
      error: `Batch limit exceeded. Maximum ${MAX_ENRICH_BATCH_LIMIT} companies per batch request.`
    });
  }

  const limit = Math.min(Math.max(1, requestedLimit), MAX_ENRICH_BATCH_LIMIT);
  const toProcess = companies.slice(0, limit);
  const results = { total: companies.length, processed: 0, enriched: 0, contacts_found: 0, errors: [] };

  for (const company of toProcess) {
    try {
      // Validate domain to prevent SSRF attacks
      let domain;
      try {
        domain = validateAndExtractDomain(company.website);
      } catch (domainErr) {
        results.errors.push({ company_id: company.id, name: company.name, error: domainErr.message });
        results.processed++;
        continue;
      }

      const enrichmentData = await enrichCompany(domain);

      db.updateCompanyEnrichment(company.id, {
        ico: enrichmentData.ico || null,
        segment: enrichmentData.segment || null,
        industry: enrichmentData.industry || null,
        company_size: enrichmentData.size || null,
        enrichment_source: 'batch_waterfall',
        ico_validated: false
      });

      if (enrichmentData.ico) {
        try {
          const icoValidation = await validateICO(enrichmentData.ico);
          if (icoValidation.valid) {
            db.updateCompanyEnrichment(company.id, { ico_validated: true });
          }
        } catch {
          // Continue even if ICO validation fails
        }
      }

      const contactResult = await discoverContacts(company.id, domain, HUNTER_API_KEY);
      if (contactResult.contacts?.length > 0) {
        db.saveContacts(company.id, formatContactsForDB(contactResult.contacts));
        results.contacts_found += contactResult.contacts.length;
      }

      // Update pipeline stage to enriched
      try {
        db.updatePipelineStage(company.id, 'enriched');
      } catch {
        // Continue even if stage update fails
      }

      results.enriched++;
      results.processed++;
      await sleep(1000);
    } catch (err) {
      results.errors.push({ company_id: company.id, name: company.name, error: err.message });
      results.processed++;
    }
  }

  res.json(results);
}));

app.post('/api/contacts/:id/validate-email', asyncHandler(async (req, res) => {
  const contact = db.getContactById(req.params.id);
  if (!contact) {
    return res.status(404).json({ error: 'Contact not found' });
  }
  if (!contact.email) {
    return res.status(400).json({ error: 'Contact has no email' });
  }

  const validation = await validateEmail(contact.email);
  const validatedAt = new Date().toISOString();

  db.updateContactValidation(contact.id, {
    email_valid: validation.valid,
    email_validated_at: validatedAt
  });

  res.json({
    contact_id: contact.id,
    email: contact.email,
    valid: validation.valid,
    reason: validation.reason,
    mx_host: validation.mxHost || null,
    validated_at: validatedAt
  });
}));

app.post('/api/contacts/validate-batch', batchValidateLimiter, asyncHandler(async (req, res) => {
  const contacts = db.getUnvalidatedContacts();
  if (!contacts.length) {
    return res.json({ message: 'No unvalidated contacts found', validated: 0 });
  }

  // Batch limit validation: max 100 contacts per batch
  const MAX_VALIDATE_BATCH_LIMIT = 100;
  const DEFAULT_VALIDATE_LIMIT = 50;
  const requestedLimit = parseInt(req.body.limit) || DEFAULT_VALIDATE_LIMIT;

  if (requestedLimit > MAX_VALIDATE_BATCH_LIMIT) {
    return res.status(400).json({
      error: `Batch limit exceeded. Maximum ${MAX_VALIDATE_BATCH_LIMIT} contacts per batch request.`
    });
  }

  const limit = Math.min(Math.max(1, requestedLimit), MAX_VALIDATE_BATCH_LIMIT);
  const toProcess = contacts.slice(0, limit);
  const results = { total: contacts.length, processed: 0, valid: 0, invalid: 0, errors: [] };

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
      await sleep(100);
    } catch (err) {
      results.errors.push({ contact_id: contact.id, email: contact.email, error: err.message });
      results.processed++;
    }
  }

  res.json(results);
}));

// ============ Pipeline Stage & Qualification ============

app.post('/api/companies/:id/qualify', asyncHandler(async (req, res) => {
  const id = validateId(req.params.id);
  const company = getCompanyOrFail(id, res);
  if (!company) return;

  // Check if company has a website
  if (!company.website) {
    return res.json({
      company_id: company.id,
      qualified: false,
      reason: 'no_website',
      message: 'Company has no website'
    });
  }

  // Check Notion for duplicates if configured
  if (NOTION_API_KEY && NOTION_DATABASE_ID) {
    try {
      const { contacts, domainIndex } = await getNotionContacts();
      const dupeCheck = notion.checkDuplicate(company, domainIndex, contacts);

      if (dupeCheck.isDupe) {
        db.markInNotion(company.id);
        return res.json({
          company_id: company.id,
          qualified: false,
          reason: 'in_notion',
          message: 'Duplicate found in Notion CRM',
          matches: dupeCheck.matches
        });
      }
    } catch (err) {
      // Continue without Notion check if it fails
      console.error('Notion check failed:', err.message);
    }
  }

  // Mark as qualified
  db.updatePipelineStage(company.id, 'qualified');

  res.json({
    company_id: company.id,
    qualified: true,
    reason: 'unique',
    message: 'Company qualified successfully'
  });
}));

app.post('/api/companies/qualify', asyncHandler(async (req, res) => {
  const { ids, all } = req.body;

  let companiesToQualify;
  if (all) {
    // Get all raw companies with websites that aren't in Notion
    companiesToQualify = db.getCompaniesForQualification();
  } else if (ids && Array.isArray(ids)) {
    companiesToQualify = ids.map(id => db.getCompanyById(id)).filter(Boolean);
  } else {
    return res.status(400).json({ error: 'Either ids array or all:true required' });
  }

  if (!companiesToQualify.length) {
    return res.json({ message: 'No companies to qualify', qualified: 0, in_notion: 0, no_website: 0 });
  }

  const results = { qualified: 0, in_notion: 0, no_website: 0, errors: [] };

  // Get Notion contacts once for batch checking
  let notionContacts = null;
  let notionDomainIndex = null;
  if (NOTION_API_KEY && NOTION_DATABASE_ID) {
    try {
      const notionData = await getNotionContacts(true);
      notionContacts = notionData.contacts;
      notionDomainIndex = notionData.domainIndex;
    } catch (err) {
      console.error('Failed to fetch Notion contacts:', err.message);
    }
  }

  for (const company of companiesToQualify) {
    try {
      // Skip if no website
      if (!company.website) {
        results.no_website++;
        continue;
      }

      // Check Notion for duplicates
      if (notionContacts && notionDomainIndex) {
        const dupeCheck = notion.checkDuplicate(company, notionDomainIndex, notionContacts);
        if (dupeCheck.isDupe) {
          db.markInNotion(company.id);
          results.in_notion++;
          continue;
        }
      }

      // Mark as qualified
      db.updatePipelineStage(company.id, 'qualified');
      results.qualified++;
    } catch (err) {
      results.errors.push({ company_id: company.id, error: err.message });
    }
  }

  res.json({
    total: companiesToQualify.length,
    ...results
  });
}));

app.post('/api/companies/:id/stage', asyncHandler(async (req, res) => {
  const id = validateId(req.params.id);
  const { stage } = req.body;

  if (!stage) {
    return res.status(400).json({ error: 'stage is required' });
  }

  const company = getCompanyOrFail(id, res);
  if (!company) return;

  try {
    db.updatePipelineStage(company.id, stage);
    res.json({ company_id: company.id, stage, success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

// ============ Notion Integration (Dedupe & Export) ============

// Cache for Notion contacts (refreshed on demand)
let notionContactsCache = null;
let notionDomainIndex = null;
let notionCacheTime = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Refresh Notion contacts cache
 */
async function refreshNotionCache() {
  if (!NOTION_API_KEY || !NOTION_DATABASE_ID) {
    throw new Error('Notion API key or Database ID not configured');
  }

  const client = new notion.NotionClient(NOTION_API_KEY);
  const pages = await client.queryDatabase(NOTION_DATABASE_ID);

  notionContactsCache = pages.map(p => notion.parseNotionContact(p));
  notionDomainIndex = notion.buildDomainIndex(notionContactsCache);
  notionCacheTime = Date.now();

  return notionContactsCache;
}

/**
 * Get cached contacts (refresh if stale)
 */
async function getNotionContacts(forceRefresh = false) {
  if (forceRefresh || !notionContactsCache || (Date.now() - notionCacheTime) > CACHE_TTL) {
    await refreshNotionCache();
  }
  return { contacts: notionContactsCache, domainIndex: notionDomainIndex };
}

/**
 * Check companies for duplicates in Notion
 */
function checkCompaniesForDupes(companies, domainIndex, contacts) {
  const results = [];
  for (const company of companies) {
    const dupeResult = notion.checkDuplicate(company, domainIndex, contacts);
    results.push({
      companyId: company.id,
      companyName: company.name,
      companyWebsite: company.website,
      ...dupeResult
    });
  }
  return results;
}

/**
 * Format dedupe results summary
 */
function formatDedupeSummary(results) {
  return {
    total: results.length,
    duplicates: results.filter(r => r.isDupe).length,
    unique: results.filter(r => !r.isDupe).length,
    results
  };
}

app.get('/api/notion/status', (req, res) => {
  res.json({
    configured: !!(NOTION_API_KEY && NOTION_DATABASE_ID),
    hasApiKey: !!NOTION_API_KEY,
    hasDatabaseId: !!NOTION_DATABASE_ID
  });
});

app.get('/api/notion/contacts', asyncHandler(async (req, res) => {
  if (!requireNotionConfig(res)) return;

  const { contacts } = await getNotionContacts(req.query.refresh === 'true');
  res.json({
    count: contacts.length,
    contacts: contacts.map(c => ({
      fullName: c.fullName,
      email: c.email,
      domain: c.domain,
      organizaceUrl: c.organizaceUrl
    }))
  });
}));

app.post('/api/notion/dedupe/check', asyncHandler(async (req, res) => {
  if (!requireNotionConfig(res)) return;

  const { companyId } = req.body;
  if (!companyId) {
    return res.status(400).json({ error: 'companyId required' });
  }

  const company = getCompanyOrFail(companyId, res);
  if (!company) return;

  const { contacts, domainIndex } = await getNotionContacts();
  const result = notion.checkDuplicate(company, domainIndex, contacts);

  res.json({
    companyId: company.id,
    companyName: company.name,
    companyWebsite: company.website,
    ...result
  });
}));

app.post('/api/notion/dedupe/batch', asyncHandler(async (req, res) => {
  if (!requireNotionConfig(res)) return;

  const { companyIds } = req.body;
  if (!companyIds || !Array.isArray(companyIds)) {
    return res.status(400).json({ error: 'companyIds array required' });
  }

  const { contacts, domainIndex } = await getNotionContacts();
  const companies = companyIds.map(id => db.getCompanyById(id)).filter(Boolean);
  const results = checkCompaniesForDupes(companies, domainIndex, contacts);

  res.json(formatDedupeSummary(results));
}));

app.post('/api/notion/dedupe/search/:searchId', asyncHandler(async (req, res) => {
  if (!requireNotionConfig(res)) return;

  const companies = db.getCompaniesBySearch(req.params.searchId);
  if (!companies.length) {
    return res.json({ total: 0, duplicates: 0, unique: 0, results: [] });
  }

  const { contacts, domainIndex } = await getNotionContacts(true);
  const results = checkCompaniesForDupes(companies, domainIndex, contacts);
  res.json(formatDedupeSummary(results));
}));

app.post('/api/notion/export', asyncHandler(async (req, res) => {
  if (!requireNotionConfig(res)) return;

  const { companyId, skipDupeCheck } = req.body;
  if (!companyId) {
    return res.status(400).json({ error: 'companyId required' });
  }

  const company = getCompanyOrFail(companyId, res);
  if (!company) return;

  if (!skipDupeCheck) {
    const { contacts, domainIndex } = await getNotionContacts();
    const dupeCheck = notion.checkDuplicate(company, domainIndex, contacts);
    if (dupeCheck.isDupe) {
      return res.status(409).json({ error: 'Duplicate found in Notion CRM', ...dupeCheck });
    }
  }

  const client = new notion.NotionClient(NOTION_API_KEY);
  const properties = notion.formatLeadForNotion(company);
  const page = await client.createPage(NOTION_DATABASE_ID, properties);
  notionCacheTime = null;

  res.json({
    success: true,
    notionPageId: page.id,
    notionUrl: page.url,
    companyId: company.id
  });
}));

app.post('/api/notion/export/batch', asyncHandler(async (req, res) => {
  if (!requireNotionConfig(res)) return;

  const { companyIds, skipDupeCheck } = req.body;
  if (!companyIds || !Array.isArray(companyIds)) {
    return res.status(400).json({ error: 'companyIds array required' });
  }

  const client = new notion.NotionClient(NOTION_API_KEY);
  const { contacts, domainIndex } = await getNotionContacts(true);
  const results = { exported: 0, skippedDupes: 0, errors: [], pages: [] };

  for (const id of companyIds) {
    const company = db.getCompanyById(id);
    if (!company) {
      results.errors.push({ companyId: id, error: 'Not found' });
      continue;
    }

    if (!skipDupeCheck) {
      const dupeCheck = notion.checkDuplicate(company, domainIndex, contacts);
      if (dupeCheck.isDupe) {
        results.skippedDupes++;
        continue;
      }
    }

    try {
      const properties = notion.formatLeadForNotion(company);
      const page = await client.createPage(NOTION_DATABASE_ID, properties);

      results.pages.push({
        companyId: company.id,
        companyName: company.name,
        notionPageId: page.id
      });
      results.exported++;
      await sleep(300);
    } catch (err) {
      results.errors.push({ companyId: company.id, error: err.message });
    }
  }

  notionCacheTime = null;
  res.json(results);
}));

// Start server
app.listen(PORT, () => {
  console.log(`Lead Scraper running at http://localhost:${PORT}`);
  console.log(`API limit: ${API_LIMIT} requests/month`);
  const usage = db.getApiUsage();
  console.log(`Current usage: ${usage.request_count}/${API_LIMIT}`);
});
