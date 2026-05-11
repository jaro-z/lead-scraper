const Database = require('better-sqlite3');
const path = require('path');
const { buildUpdateQuery, validateIds, escapeCSV, extractDomain } = require('./utils');

const dbPath = path.join(__dirname, 'data', 'leads.db');
const db = new Database(dbPath);

// Initialize schema
db.exec(`
  -- Track each scrape run
  CREATE TABLE IF NOT EXISTS searches (
    id INTEGER PRIMARY KEY,
    query TEXT NOT NULL,
    location TEXT NOT NULL,
    grid_size TEXT,
    result_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Global company records (deduplicated by place_id)
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY,
    place_id TEXT UNIQUE NOT NULL,
    name TEXT,
    address TEXT,
    category TEXT,
    website TEXT,
    google_maps_url TEXT,
    rating REAL,
    rating_count INTEGER,
    phone TEXT,
    opening_hours TEXT,
    price_level INTEGER,
    business_status TEXT,
    lat REAL,
    lng REAL,
    photos TEXT,
    types TEXT,
    raw_data TEXT,
    status TEXT DEFAULT 'scraped',
    emails TEXT,
    enrichment_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Many-to-many: which searches found which companies
  CREATE TABLE IF NOT EXISTS search_companies (
    search_id INTEGER,
    company_id INTEGER,
    PRIMARY KEY (search_id, company_id),
    FOREIGN KEY (search_id) REFERENCES searches(id),
    FOREIGN KEY (company_id) REFERENCES companies(id)
  );

  -- API usage tracking
  CREATE TABLE IF NOT EXISTS api_usage (
    id INTEGER PRIMARY KEY,
    month TEXT UNIQUE NOT NULL,
    request_count INTEGER DEFAULT 0
  );

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_companies_place_id ON companies(place_id);
  CREATE INDEX IF NOT EXISTS idx_companies_category ON companies(category);
  CREATE INDEX IF NOT EXISTS idx_companies_rating ON companies(rating);

  -- Contacts table for Hunter enrichment
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY,
    company_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    full_name TEXT,
    title TEXT,
    is_primary INTEGER DEFAULT 0,
    confidence INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id);
`);

// Safe column migrations (ignores if column already exists)
function addColumnIfMissing(table, column, definition) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (e) {
    // Column already exists - ignore
  }
}

// Company enrichment columns
addColumnIfMissing('companies', 'enriched_at', 'DATETIME');
addColumnIfMissing('companies', 'contacts_count', 'INTEGER DEFAULT 0');
addColumnIfMissing('companies', 'ico', 'TEXT');
addColumnIfMissing('companies', 'ico_validated', 'INTEGER DEFAULT 0');
addColumnIfMissing('companies', 'segment', 'TEXT');
addColumnIfMissing('companies', 'industry', 'TEXT');
addColumnIfMissing('companies', 'company_size', 'TEXT');
addColumnIfMissing('companies', 'enrichment_source', 'TEXT');
addColumnIfMissing('companies', 'company_description', 'TEXT');

// Pipeline stage columns
addColumnIfMissing('companies', 'pipeline_stage', "TEXT DEFAULT 'raw'");
addColumnIfMissing('companies', 'in_notion', 'INTEGER DEFAULT 0');
addColumnIfMissing('companies', 'qualified_at', 'DATETIME');

// Enrichment log - stores JSON with URLs discovered, pages scraped, contacts parsed
addColumnIfMissing('companies', 'enrichment_log', 'TEXT');
addColumnIfMissing('companies', 'enrichment_error', 'TEXT');

// Migration: Remove 'review' stage - move to 'enriched'
db.exec(`UPDATE companies SET pipeline_stage = 'enriched' WHERE pipeline_stage = 'review'`);

// Migration: Remove 'ready' stage - merge into 'qualified'
db.exec(`UPDATE companies SET pipeline_stage = 'qualified' WHERE pipeline_stage = 'ready'`);

// Migration: Fix companies without website stuck in 'raw' stage
db.exec(`UPDATE companies SET pipeline_stage = 'no_website' WHERE (pipeline_stage = 'raw' OR pipeline_stage IS NULL) AND (website IS NULL OR website = '')`);

// Contact enrichment columns
addColumnIfMissing('contacts', 'phone', 'TEXT');
addColumnIfMissing('contacts', 'email_valid', 'INTEGER');
addColumnIfMissing('contacts', 'email_validated_at', 'TEXT');
addColumnIfMissing('contacts', 'template_type', 'TEXT');
addColumnIfMissing('contacts', 'source', 'TEXT');
addColumnIfMissing('contacts', 'email_source', 'TEXT');

// ============ Searches ============

function createSearch(query, location, gridSize) {
  const stmt = db.prepare(`
    INSERT INTO searches (query, location, grid_size, status)
    VALUES (?, ?, ?, 'running')
  `);
  const result = stmt.run(query, location, gridSize);
  return result.lastInsertRowid;
}

function getSearches() {
  return db.prepare(`
    SELECT * FROM searches ORDER BY created_at DESC
  `).all();
}

function getSearchById(id) {
  return db.prepare(`SELECT * FROM searches WHERE id = ?`).get(id);
}

function updateSearchStatus(id, status, resultCount = null) {
  if (resultCount !== null) {
    db.prepare(`UPDATE searches SET status = ?, result_count = ? WHERE id = ?`)
      .run(status, resultCount, id);
  } else {
    db.prepare(`UPDATE searches SET status = ? WHERE id = ?`).run(status, id);
  }
}

function deleteSearch(id) {
  // Remove from junction table first
  db.prepare(`DELETE FROM search_companies WHERE search_id = ?`).run(id);
  db.prepare(`DELETE FROM searches WHERE id = ?`).run(id);
}

// ============ Companies ============

function upsertCompany(company, searchId) {
  // Check if company already exists
  const existing = db.prepare(`SELECT id FROM companies WHERE place_id = ?`)
    .get(company.place_id);

  let companyId;
  if (existing) {
    companyId = existing.id;
    // Update with latest data
    db.prepare(`
      UPDATE companies SET
        name = ?, address = ?, category = ?, website = ?, google_maps_url = ?,
        rating = ?, rating_count = ?, phone = ?, opening_hours = ?,
        price_level = ?, business_status = ?, lat = ?, lng = ?,
        photos = ?, types = ?, raw_data = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      company.name, company.address, company.category, company.website, company.google_maps_url,
      company.rating, company.rating_count, company.phone, company.opening_hours,
      company.price_level, company.business_status, company.lat, company.lng,
      company.photos, company.types, company.raw_data, companyId
    );
  } else {
    // Insert new company
    const stmt = db.prepare(`
      INSERT INTO companies (
        place_id, name, address, category, website, google_maps_url, rating, rating_count,
        phone, opening_hours, price_level, business_status, lat, lng,
        photos, types, raw_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      company.place_id, company.name, company.address, company.category,
      company.website, company.google_maps_url, company.rating, company.rating_count, company.phone,
      company.opening_hours, company.price_level, company.business_status,
      company.lat, company.lng, company.photos, company.types, company.raw_data
    );
    companyId = result.lastInsertRowid;
  }

  // Link to search
  db.prepare(`
    INSERT OR IGNORE INTO search_companies (search_id, company_id)
    VALUES (?, ?)
  `).run(searchId, companyId);

  // Auto-assign pipeline stage based on website presence
  if (!company.website) {
    // No website → move to no_website (only if still in raw/null stage)
    db.prepare(`
      UPDATE companies SET pipeline_stage = 'no_website'
      WHERE id = ? AND (pipeline_stage = 'raw' OR pipeline_stage IS NULL)
    `).run(companyId);
  } else if (existing) {
    // Existing company now has a website but was in no_website → move back to raw
    db.prepare(`
      UPDATE companies SET pipeline_stage = 'raw'
      WHERE id = ? AND pipeline_stage = 'no_website'
    `).run(companyId);
  }

  return { companyId, isNew: !existing };
}

function getCompaniesBySearch(searchId) {
  return db.prepare(`
    SELECT c.*,
      pc.email as primary_email,
      pc.title as primary_contact_title,
      pc.first_name as primary_contact_first_name
    FROM companies c
    JOIN search_companies sc ON c.id = sc.company_id
    LEFT JOIN contacts pc ON pc.company_id = c.id AND pc.is_primary = 1
    WHERE sc.search_id = ?
    ORDER BY c.name ASC
  `).all(searchId);
}

function getAllCompanies() {
  return db.prepare(`
    SELECT c.*,
      pc.email as primary_email,
      pc.title as primary_contact_title,
      pc.first_name as primary_contact_first_name
    FROM companies c
    LEFT JOIN contacts pc ON pc.company_id = c.id AND pc.is_primary = 1
    ORDER BY c.name ASC
  `).all();
}

function getCompanyById(id) {
  return db.prepare(`SELECT * FROM companies WHERE id = ?`).get(id);
}

function deleteCompany(id) {
  db.prepare(`DELETE FROM search_companies WHERE company_id = ?`).run(id);
  db.prepare(`DELETE FROM companies WHERE id = ?`).run(id);
}

function bulkDeleteCompanies(ids) {
  const validatedIds = validateIds(ids);
  const placeholders = validatedIds.map(() => '?').join(',');

  db.prepare(`DELETE FROM search_companies WHERE company_id IN (${placeholders})`).run(...validatedIds);
  db.prepare(`DELETE FROM contacts WHERE company_id IN (${placeholders})`).run(...validatedIds);
  db.prepare(`DELETE FROM companies WHERE id IN (${placeholders})`).run(...validatedIds);
}

function getExistingPlaceIds() {
  const rows = db.prepare(`SELECT place_id FROM companies`).all();
  return new Set(rows.map(r => r.place_id));
}

// ============ API Usage ============

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getApiUsage() {
  const month = getCurrentMonth();
  let row = db.prepare(`SELECT * FROM api_usage WHERE month = ?`).get(month);
  if (!row) {
    db.prepare(`INSERT INTO api_usage (month, request_count) VALUES (?, 0)`).run(month);
    row = { month, request_count: 0 };
  }
  return row;
}

function incrementApiUsage(count = 1) {
  const month = getCurrentMonth();
  db.prepare(`
    INSERT INTO api_usage (month, request_count) VALUES (?, ?)
    ON CONFLICT(month) DO UPDATE SET request_count = request_count + ?
  `).run(month, count, count);
}

function canMakeApiCall(limit) {
  const usage = getApiUsage();
  return usage.request_count < limit;
}

// ============ Export ============

// Legacy company-only export (kept for backwards compatibility)
function exportToCSV(companies) {
  const headers = ['Name', 'Address', 'Category', 'Website', 'Rating', 'Reviews', 'Phone', 'Added'];
  const rows = companies.map(c => [
    c.name, c.address, c.category, c.website,
    c.rating, c.rating_count, c.phone, c.created_at
  ].map(escapeCSV));

  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

/**
 * Export contacts with company info. Each row = one contact.
 * If a company has no contacts, exports one row with company info only.
 * @param {Object} filters - { searchId, companyIds }
 */
function exportContactsCSV(filters = {}) {
  let query = `
    SELECT
      c.id as company_id,
      c.name as company_name,
      c.address,
      c.category,
      c.website,
      c.phone as company_phone,
      c.rating,
      c.rating_count,
      c.google_maps_url,
      c.segment,
      c.industry,
      c.company_size,
      ct.id as contact_id,
      ct.first_name,
      ct.last_name,
      ct.full_name,
      ct.email,
      ct.title,
      ct.phone as contact_phone,
      ct.email_valid,
      ct.is_primary
    FROM companies c
    LEFT JOIN contacts ct ON ct.company_id = c.id
  `;
  const params = [];
  const conditions = [];

  // Filter by search ID
  if (filters.searchId) {
    conditions.push(`c.id IN (SELECT company_id FROM search_companies WHERE search_id = ?)`);
    params.push(filters.searchId);
  }

  // Filter by specific company IDs
  if (filters.companyIds && filters.companyIds.length > 0) {
    conditions.push(`c.id IN (${filters.companyIds.map(() => '?').join(',')})`);
    params.push(...filters.companyIds);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  // Order by company name, then primary contact first, then by contact name
  query += ' ORDER BY c.name ASC, ct.is_primary DESC, ct.full_name ASC';

  const rows = db.prepare(query).all(...params);

  const headers = [
    'Company Name',
    'First Name',
    'Last Name',
    'Full Name',
    'Email',
    'Title',
    'Contact Phone',
    'Email Valid',
    'Primary Contact',
    'Company Phone',
    'Address',
    'Category',
    'Website',
    'Segment',
    'Industry',
    'Company Size',
    'Rating',
    'Reviews',
    'Google Maps URL'
  ];

  const csvRows = rows.map(r => [
    r.company_name || '',
    r.first_name || '',
    r.last_name || '',
    r.full_name || '',
    r.email || '',
    r.title || '',
    r.contact_phone || '',
    r.email_valid === 1 ? 'Yes' : (r.email_valid === 0 ? 'No' : ''),
    r.is_primary === 1 ? 'Yes' : (r.contact_id ? 'No' : ''),
    r.company_phone || '',
    r.address || '',
    r.category || '',
    r.website || '',
    r.segment || '',
    r.industry || '',
    r.company_size || '',
    r.rating || '',
    r.rating_count || '',
    r.google_maps_url || ''
  ].map(escapeCSV));

  return [headers.join(','), ...csvRows.map(row => row.join(','))].join('\n');
}

function exportToYAMM(filters = {}) {
  let query = `
    SELECT c.name, c.address, c.segment, c.website, c.rating, c.rating_count,
           ct.first_name, ct.email
    FROM companies c
    JOIN contacts ct ON ct.company_id = c.id AND ct.is_primary = 1
    WHERE ct.email_valid = 1
  `;
  const params = [];

  if (filters.segment) {
    query += ' AND c.segment = ?';
    params.push(filters.segment);
  }
  if (filters.ids && filters.ids.length > 0) {
    query += ` AND c.id IN (${filters.ids.map(() => '?').join(',')})`;
    params.push(...filters.ids);
  }

  query += ' ORDER BY c.name ASC';

  const rows = db.prepare(query).all(...params);

  const headers = ['First Name', 'Email', 'Company', 'Segment', 'City', 'Website', 'Rating', 'Reviews'];
  const csvRows = rows.map(r => {
    // Extract city from Czech address format: "Street, PostalCode City-District, Czechia"
    let city = '';
    if (r.address) {
      const parts = r.address.split(',').map(p => p.trim());
      // Skip last part if it's a country name
      const lastPart = parts[parts.length - 1];
      const isCountry = /^(czechia|czech republic|germany|austria|slovakia|poland)/i.test(lastPart);
      const cityPart = isCountry && parts.length > 1 ? parts[parts.length - 2] : lastPart;
      // Remove postal code (Czech format: 123 45 or 12345)
      city = cityPart.replace(/\d{3}\s?\d{2}/, '').replace(/\s+/g, ' ').trim();
      // Normalize Prague/Brno districts: "Praha 5-Zbraslav" -> "Praha", "Praha-Lipence" -> "Praha"
      city = city.replace(/^(Praha|Brno|Ostrava|Plzeň)\s*\d*\s*[-].*$/i, '$1').trim();
      // Also catch "Praha 5" without district name
      city = city.replace(/^(Praha|Brno|Ostrava|Plzeň)\s+\d+$/i, '$1').trim();
    }
    return [
      r.first_name || '', r.email, r.name, r.segment || '', city,
      r.website || '', r.rating || '', r.rating_count || ''
    ].map(escapeCSV);
  });

  return [headers.join(','), ...csvRows.map(row => row.join(','))].join('\n');
}

function getUncheckedEmailCount() {
  const result = db.prepare('SELECT COUNT(*) as count FROM contacts WHERE email_valid IS NULL AND email IS NOT NULL').get();
  return result.count;
}

// ============ Contacts (Hunter Enrichment) ============

function saveContacts(companyId, contacts) {
  // Clear existing contacts for this company
  db.prepare(`DELETE FROM contacts WHERE company_id = ?`).run(companyId);

  const stmt = db.prepare(`
    INSERT INTO contacts (company_id, email, first_name, last_name, full_name, title, is_primary, confidence, source, email_source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const c of contacts) {
    stmt.run(companyId, c.email, c.firstName, c.lastName, c.fullName, c.title, c.isPrimary ? 1 : 0, c.confidence, c.source || null, c.emailSource || null);
  }

  // Update company
  db.prepare(`
    UPDATE companies SET contacts_count = ?, enriched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(contacts.length, companyId);

  return contacts.length;
}

function getContactsByCompany(companyId) {
  return db.prepare(`
    SELECT * FROM contacts WHERE company_id = ? ORDER BY is_primary DESC, confidence DESC
  `).all(companyId);
}

function getPrimaryContact(companyId) {
  return db.prepare(`
    SELECT * FROM contacts WHERE company_id = ? ORDER BY is_primary DESC, confidence DESC LIMIT 1
  `).get(companyId);
}

function getCompaniesForEnrichment() {
  return db.prepare(`
    SELECT * FROM companies
    WHERE website IS NOT NULL AND website != '' AND enriched_at IS NULL
    ORDER BY name ASC
  `).all();
}

// ============ Waterfall Enrichment Helpers ============

/**
 * Update company with enrichment data (ICO, segment, industry, etc.)
 * @param {number} id - Company ID
 * @param {Object} data - Enrichment data
 */
function updateCompanyEnrichment(id, data) {
  const query = buildUpdateQuery('companies', data);
  if (!query) return;

  // Append updated_at timestamp
  const sql = query.sql.replace(' WHERE', ', updated_at = CURRENT_TIMESTAMP WHERE');
  db.prepare(sql).run(...query.values, id);
}

/**
 * Update contact with validation data
 * @param {number} contactId - Contact ID
 * @param {Object} data - Validation data
 */
function updateContactValidation(contactId, data) {
  const query = buildUpdateQuery('contacts', data);
  if (!query) return;

  db.prepare(query.sql).run(...query.values, contactId);
}

/**
 * Get companies with website but no enrichment_source (need enrichment)
 * @returns {Array} Unenriched companies
 */
function getUnenrichedCompanies() {
  return db.prepare(`
    SELECT * FROM companies
    WHERE website IS NOT NULL AND website != ''
      AND (enrichment_source IS NULL OR enrichment_source = '')
    ORDER BY created_at DESC
  `).all();
}

/**
 * Get contacts where email has not been validated yet
 * @returns {Array} Unvalidated contacts
 */
function getUnvalidatedContacts() {
  return db.prepare(`
    SELECT c.*, comp.name as company_name, comp.website as company_website
    FROM contacts c
    JOIN companies comp ON c.company_id = comp.id
    WHERE c.email_valid IS NULL
    ORDER BY c.created_at DESC
  `).all();
}

/**
 * Get contact by ID
 * @param {number} id - Contact ID
 * @returns {Object} Contact record
 */
function getContactById(id) {
  return db.prepare(`SELECT * FROM contacts WHERE id = ?`).get(id);
}

/**
 * Delete a contact and update company contacts_count
 * @param {number} contactId - Contact ID
 * @returns {number|null} Company ID or null if contact not found
 */
function deleteContact(contactId) {
  const contact = db.prepare(`SELECT company_id FROM contacts WHERE id = ?`).get(contactId);
  if (!contact) return null;

  db.prepare(`DELETE FROM contacts WHERE id = ?`).run(contactId);

  // Update company contacts_count
  const count = db.prepare(`SELECT COUNT(*) as cnt FROM contacts WHERE company_id = ?`)
    .get(contact.company_id).cnt;
  db.prepare(`UPDATE companies SET contacts_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(count, contact.company_id);

  return contact.company_id;
}

/**
 * Update contact fields
 * @param {number} contactId - Contact ID
 * @param {Object} data - Fields to update
 * @returns {Object|null} Updated contact or null
 */
function updateContact(contactId, data) {
  const allowedFields = ['email', 'first_name', 'last_name', 'full_name', 'title', 'phone', 'is_primary'];
  const filteredData = {};

  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      filteredData[key] = data[key];
    }
  }

  const query = buildUpdateQuery('contacts', filteredData);
  if (!query) return null;

  db.prepare(query.sql).run(...query.values, contactId);
  return getContactById(contactId);
}

/**
 * Set primary contact for a company (clears existing primary)
 * @param {number} companyId - Company ID
 * @param {number} contactId - Contact ID to set as primary
 */
function setPrimaryContact(companyId, contactId) {
  // Clear existing primary flag for this company
  db.prepare(`UPDATE contacts SET is_primary = 0 WHERE company_id = ?`).run(companyId);
  // Set new primary
  db.prepare(`UPDATE contacts SET is_primary = 1 WHERE id = ? AND company_id = ?`).run(contactId, companyId);
}

// ============ Pipeline Stage Functions ============

/**
 * Get pipeline statistics (count of companies per stage)
 * @returns {Object} Counts by stage
 */
function getPipelineStats(searchId) {
  const join = searchId ? 'JOIN search_companies sc ON c.id = sc.company_id' : '';
  const where = searchId ? 'WHERE sc.search_id = ?' : '';
  const params = searchId ? [searchId] : [];

  const stats = db.prepare(`
    SELECT
      SUM(CASE WHEN (pipeline_stage = 'raw' OR pipeline_stage IS NULL) AND website IS NOT NULL AND website != '' THEN 1 ELSE 0 END) as raw,
      SUM(CASE WHEN pipeline_stage = 'no_website' OR ((pipeline_stage IS NULL OR pipeline_stage = 'raw') AND (website IS NULL OR website = '')) THEN 1 ELSE 0 END) as no_website,
      SUM(CASE WHEN pipeline_stage = 'enriched' THEN 1 ELSE 0 END) as enriched,
      SUM(CASE WHEN pipeline_stage = 'qualified' THEN 1 ELSE 0 END) as qualified,
      SUM(CASE WHEN in_notion = 1 THEN 1 ELSE 0 END) as in_notion,
      SUM(CASE WHEN pipeline_stage = 'parked' THEN 1 ELSE 0 END) as parked,
      COUNT(*) as total
    FROM companies c
    ${join}
    ${where}
  `).get(...params);

  return {
    raw: stats.raw || 0,
    no_website: stats.no_website || 0,
    enriched: stats.enriched || 0,
    qualified: stats.qualified || 0,
    in_notion: stats.in_notion || 0,
    parked: stats.parked || 0,
    total: stats.total || 0
  };
}

/**
 * Get companies by pipeline stage, optionally scoped to a search
 * Uses same logic as getPipelineStats() so counts match
 * @param {string} stage - Pipeline stage to filter by
 * @param {number} [searchId] - Optional search ID to scope results
 * @returns {Array} Companies matching the stage
 */
function getCompaniesByStage(stage, searchId) {
  const validStages = ['raw', 'no_website', 'enriched', 'qualified', 'parked'];
  if (!validStages.includes(stage)) {
    throw new Error(`Invalid pipeline stage: ${stage}`);
  }

  let stageClause;
  switch (stage) {
    case 'raw':
      stageClause = "(c.pipeline_stage = 'raw' OR c.pipeline_stage IS NULL) AND c.website IS NOT NULL AND c.website != ''";
      break;
    case 'no_website':
      stageClause = "c.pipeline_stage = 'no_website' OR ((c.pipeline_stage IS NULL OR c.pipeline_stage = 'raw') AND (c.website IS NULL OR c.website = ''))";
      break;
    default:
      stageClause = `c.pipeline_stage = '${stage}'`;
  }

  const searchJoin = searchId ? 'JOIN search_companies sc ON c.id = sc.company_id' : '';
  const searchWhere = searchId ? 'AND sc.search_id = ?' : '';
  const params = searchId ? [searchId] : [];

  return db.prepare(`
    SELECT c.*,
      pc.email as primary_email,
      pc.title as primary_contact_title,
      pc.first_name as primary_contact_first_name
    FROM companies c
    ${searchJoin}
    LEFT JOIN contacts pc ON pc.company_id = c.id AND pc.is_primary = 1
    WHERE (${stageClause})
    ${searchWhere}
    ORDER BY c.name ASC
  `).all(...params);
}

/**
 * Update pipeline stage for a company
 * @param {number} id - Company ID
 * @param {string} stage - New pipeline stage
 */
function updatePipelineStage(id, stage) {
  const validStages = ['raw', 'no_website', 'enriched', 'qualified', 'parked'];
  if (!validStages.includes(stage)) {
    throw new Error(`Invalid pipeline stage: ${stage}`);
  }

  const updates = { pipeline_stage: stage, updated_at: 'CURRENT_TIMESTAMP' };
  if (stage === 'qualified') {
    db.prepare(`
      UPDATE companies SET pipeline_stage = ?, qualified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(stage, id);
  } else {
    db.prepare(`
      UPDATE companies SET pipeline_stage = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(stage, id);
  }
}

/**
 * Mark company as found in Notion (duplicate)
 * @param {number} id - Company ID
 */
function markInNotion(id) {
  db.prepare(`
    UPDATE companies SET in_notion = 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);
}

/**
 * Get companies that need qualification (raw stage with website)
 * @returns {Array} Companies to qualify
 */
function getCompaniesForQualification() {
  return db.prepare(`
    SELECT * FROM companies
    WHERE (pipeline_stage = 'raw' OR pipeline_stage IS NULL)
      AND website IS NOT NULL AND website != ''
      AND in_notion = 0
    ORDER BY created_at DESC
  `).all();
}

/**
 * Get companies for classification (qualified stage)
 * @returns {Array} Companies to classify
 */
function getCompaniesForClassification() {
  return db.prepare(`
    SELECT * FROM companies
    WHERE pipeline_stage = 'qualified'
      AND (segment IS NULL OR segment = '')
    ORDER BY created_at DESC
  `).all();
}

/**
 * Simple string similarity (Levenshtein-based)
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Similarity score 0-1
 */
function stringSimilarity(a, b) {
  if (!a || !b) return 0;
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 1;

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1;

  // Simple Levenshtein distance
  const matrix = [];
  for (let i = 0; i <= shorter.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= longer.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= shorter.length; i++) {
    for (let j = 1; j <= longer.length; j++) {
      if (shorter[i - 1] === longer[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  const distance = matrix[shorter.length][longer.length];
  return (longer.length - distance) / longer.length;
}

/**
 * Find local duplicates for a company (same domain or similar name)
 * @param {number} companyId - Company ID to check
 * @param {number} threshold - Similarity threshold for name matching (default 0.85)
 * @returns {Array} Matching companies with match type and confidence
 */
function getLocalDuplicates(companyId, threshold = 0.85) {
  const company = getCompanyById(companyId);
  if (!company) return [];

  const domain = extractDomain(company.website);
  const matches = [];

  // Get all other companies
  const others = db.prepare(`
    SELECT * FROM companies WHERE id != ?
  `).all(companyId);

  for (const other of others) {
    const otherDomain = extractDomain(other.website);

    // Check domain match
    if (domain && otherDomain && domain === otherDomain) {
      matches.push({
        ...other,
        matchType: 'domain',
        confidence: 0.95
      });
      continue;
    }

    // Check name similarity
    const similarity = stringSimilarity(company.name, other.name);
    if (similarity >= threshold) {
      matches.push({
        ...other,
        matchType: 'fuzzy_name',
        confidence: similarity
      });
    }
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Get all distinct segments from companies
 * @returns {Array} Unique segment values
 */
function getDistinctSegments() {
  return db.prepare(`
    SELECT DISTINCT segment FROM companies
    WHERE segment IS NOT NULL AND segment != ''
    ORDER BY segment ASC
  `).all().map(r => r.segment);
}

/**
 * Update company description
 * @param {number} id - Company ID
 * @param {string} description - One-sentence description
 */
function updateCompanyDescription(id, description) {
  db.prepare(`
    UPDATE companies SET company_description = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(description, id);
}

/**
 * Save enrichment log (JSON object with URLs discovered, pages scraped, contacts parsed)
 * @param {number} id - Company ID
 * @param {Object} log - Enrichment log object
 */
function saveEnrichmentLog(id, log) {
  const logJson = JSON.stringify(log);
  db.prepare(`
    UPDATE companies SET enrichment_log = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(logJson, id);
}

/**
 * Set enrichment error (e.g., 'no_contacts', 'scrape_failed')
 * @param {number} id - Company ID
 * @param {string} error - Error type
 */
function setEnrichmentError(id, error) {
  db.prepare(`
    UPDATE companies SET enrichment_error = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(error, id);
}

/**
 * Clear enrichment error
 * @param {number} id - Company ID
 */
function clearEnrichmentError(id) {
  db.prepare(`
    UPDATE companies SET enrichment_error = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);
}

/**
 * Get enrichment log for a company
 * @param {number} id - Company ID
 * @returns {Object|null} Parsed enrichment log or null
 */
function getEnrichmentLog(id) {
  const row = db.prepare(`SELECT enrichment_log FROM companies WHERE id = ?`).get(id);
  if (!row || !row.enrichment_log) return null;
  try {
    return JSON.parse(row.enrichment_log);
  } catch (e) {
    return null;
  }
}

module.exports = {
  db,
  createSearch,
  getSearches,
  getSearchById,
  updateSearchStatus,
  deleteSearch,
  upsertCompany,
  getCompaniesBySearch,
  getAllCompanies,
  getCompaniesByStage,
  getCompanyById,
  deleteCompany,
  bulkDeleteCompanies,
  getExistingPlaceIds,
  getApiUsage,
  incrementApiUsage,
  canMakeApiCall,
  exportToCSV,
  exportContactsCSV,
  exportToYAMM,
  getUncheckedEmailCount,
  saveContacts,
  getContactsByCompany,
  getPrimaryContact,
  getCompaniesForEnrichment,
  updateCompanyEnrichment,
  updateContactValidation,
  getUnenrichedCompanies,
  getUnvalidatedContacts,
  getContactById,
  deleteContact,
  updateContact,
  setPrimaryContact,
  // Pipeline stage functions
  getCompaniesByStage,
  getPipelineStats,
  updatePipelineStage,
  markInNotion,
  getCompaniesForQualification,
  getCompaniesForClassification,
  // New pipeline functions
  getLocalDuplicates,
  getDistinctSegments,
  updateCompanyDescription,
  extractDomain,
  // Enrichment log functions
  saveEnrichmentLog,
  setEnrichmentError,
  clearEnrichmentError,
  getEnrichmentLog
};
