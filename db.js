const Database = require('better-sqlite3');
const path = require('path');
const { buildUpdateQuery, validateIds, escapeCSV } = require('./utils');

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

// Pipeline stage columns
addColumnIfMissing('companies', 'pipeline_stage', "TEXT DEFAULT 'raw'");
addColumnIfMissing('companies', 'in_notion', 'INTEGER DEFAULT 0');
addColumnIfMissing('companies', 'qualified_at', 'DATETIME');

// Contact enrichment columns
addColumnIfMissing('contacts', 'phone', 'TEXT');
addColumnIfMissing('contacts', 'email_valid', 'INTEGER');
addColumnIfMissing('contacts', 'email_validated_at', 'TEXT');
addColumnIfMissing('contacts', 'template_type', 'TEXT');
addColumnIfMissing('contacts', 'source', 'TEXT');

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
        name = ?, address = ?, category = ?, website = ?,
        rating = ?, rating_count = ?, phone = ?, opening_hours = ?,
        price_level = ?, business_status = ?, lat = ?, lng = ?,
        photos = ?, types = ?, raw_data = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      company.name, company.address, company.category, company.website,
      company.rating, company.rating_count, company.phone, company.opening_hours,
      company.price_level, company.business_status, company.lat, company.lng,
      company.photos, company.types, company.raw_data, companyId
    );
  } else {
    // Insert new company
    const stmt = db.prepare(`
      INSERT INTO companies (
        place_id, name, address, category, website, rating, rating_count,
        phone, opening_hours, price_level, business_status, lat, lng,
        photos, types, raw_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      company.place_id, company.name, company.address, company.category,
      company.website, company.rating, company.rating_count, company.phone,
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

  return { companyId, isNew: !existing };
}

function getCompaniesBySearch(searchId) {
  return db.prepare(`
    SELECT c.*,
      (SELECT email FROM contacts WHERE company_id = c.id AND is_primary = 1 LIMIT 1) as primary_email
    FROM companies c
    JOIN search_companies sc ON c.id = sc.company_id
    WHERE sc.search_id = ?
    ORDER BY c.name ASC
  `).all(searchId);
}

function getAllCompanies() {
  return db.prepare(`
    SELECT c.*,
      (SELECT email FROM contacts WHERE company_id = c.id AND is_primary = 1 LIMIT 1) as primary_email
    FROM companies c
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

function exportToCSV(companies) {
  const headers = ['Name', 'Address', 'Category', 'Website', 'Rating', 'Reviews', 'Phone', 'Added'];
  const rows = companies.map(c => [
    c.name, c.address, c.category, c.website,
    c.rating, c.rating_count, c.phone, c.created_at
  ].map(escapeCSV));

  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

// ============ Contacts (Hunter Enrichment) ============

function saveContacts(companyId, contacts) {
  // Clear existing contacts for this company
  db.prepare(`DELETE FROM contacts WHERE company_id = ?`).run(companyId);

  const stmt = db.prepare(`
    INSERT INTO contacts (company_id, email, first_name, last_name, full_name, title, is_primary, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const c of contacts) {
    stmt.run(companyId, c.email, c.firstName, c.lastName, c.fullName, c.title, c.isPrimary ? 1 : 0, c.confidence);
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

// ============ Pipeline Stage Functions ============

/**
 * Get companies by pipeline stage
 * @param {string} stage - Pipeline stage (raw, qualified, classified, enriched, ready)
 * @returns {Array} Companies in that stage
 */
function getCompaniesByStage(stage) {
  return db.prepare(`
    SELECT c.*,
      (SELECT email FROM contacts WHERE company_id = c.id AND is_primary = 1 LIMIT 1) as primary_email
    FROM companies c
    WHERE c.pipeline_stage = ?
    ORDER BY c.name ASC
  `).all(stage);
}

/**
 * Get pipeline statistics (count of companies per stage)
 * @returns {Object} Counts by stage
 */
function getPipelineStats() {
  const stats = db.prepare(`
    SELECT
      SUM(CASE WHEN pipeline_stage = 'raw' OR pipeline_stage IS NULL THEN 1 ELSE 0 END) as raw,
      SUM(CASE WHEN pipeline_stage = 'qualified' THEN 1 ELSE 0 END) as qualified,
      SUM(CASE WHEN pipeline_stage = 'classified' THEN 1 ELSE 0 END) as classified,
      SUM(CASE WHEN pipeline_stage = 'enriched' THEN 1 ELSE 0 END) as enriched,
      SUM(CASE WHEN pipeline_stage = 'ready' THEN 1 ELSE 0 END) as ready,
      SUM(CASE WHEN in_notion = 1 THEN 1 ELSE 0 END) as in_notion,
      COUNT(*) as total
    FROM companies
  `).get();

  return {
    raw: stats.raw || 0,
    qualified: stats.qualified || 0,
    classified: stats.classified || 0,
    enriched: stats.enriched || 0,
    ready: stats.ready || 0,
    in_notion: stats.in_notion || 0,
    total: stats.total || 0
  };
}

/**
 * Update pipeline stage for a company
 * @param {number} id - Company ID
 * @param {string} stage - New pipeline stage
 */
function updatePipelineStage(id, stage) {
  const validStages = ['raw', 'qualified', 'classified', 'enriched', 'ready'];
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
  getCompanyById,
  deleteCompany,
  bulkDeleteCompanies,
  getExistingPlaceIds,
  getApiUsage,
  incrementApiUsage,
  canMakeApiCall,
  exportToCSV,
  saveContacts,
  getContactsByCompany,
  getPrimaryContact,
  getCompaniesForEnrichment,
  updateCompanyEnrichment,
  updateContactValidation,
  getUnenrichedCompanies,
  getUnvalidatedContacts,
  getContactById,
  // Pipeline stage functions
  getCompaniesByStage,
  getPipelineStats,
  updatePipelineStage,
  markInNotion,
  getCompaniesForQualification,
  getCompaniesForClassification
};
