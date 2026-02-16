const Database = require('better-sqlite3');
const path = require('path');

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

// Add enrichment columns if missing (safe migration)
try {
  db.exec(`ALTER TABLE companies ADD COLUMN enriched_at DATETIME`);
} catch (e) { /* column exists */ }
try {
  db.exec(`ALTER TABLE companies ADD COLUMN contacts_count INTEGER DEFAULT 0`);
} catch (e) { /* column exists */ }

// PRD-WATERFALL-ENRICHMENT: Add company enrichment columns
try {
  db.exec(`ALTER TABLE companies ADD COLUMN ico TEXT`);
} catch (e) { /* column exists */ }
try {
  db.exec(`ALTER TABLE companies ADD COLUMN ico_validated INTEGER DEFAULT 0`);
} catch (e) { /* column exists */ }
try {
  db.exec(`ALTER TABLE companies ADD COLUMN segment TEXT`);
} catch (e) { /* column exists */ }
try {
  db.exec(`ALTER TABLE companies ADD COLUMN industry TEXT`);
} catch (e) { /* column exists */ }
try {
  db.exec(`ALTER TABLE companies ADD COLUMN company_size TEXT`);
} catch (e) { /* column exists */ }
try {
  db.exec(`ALTER TABLE companies ADD COLUMN enrichment_source TEXT`);
} catch (e) { /* column exists */ }

// PRD-WATERFALL-ENRICHMENT: Add contact enrichment columns
try {
  db.exec(`ALTER TABLE contacts ADD COLUMN phone TEXT`);
} catch (e) { /* column exists */ }
try {
  db.exec(`ALTER TABLE contacts ADD COLUMN email_valid INTEGER`);
} catch (e) { /* column exists */ }
try {
  db.exec(`ALTER TABLE contacts ADD COLUMN email_validated_at TEXT`);
} catch (e) { /* column exists */ }
try {
  db.exec(`ALTER TABLE contacts ADD COLUMN template_type TEXT`);
} catch (e) { /* column exists */ }
try {
  db.exec(`ALTER TABLE contacts ADD COLUMN source TEXT`);
} catch (e) { /* column exists */ }

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
  // Input validation: ensure all IDs are positive integers
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('Invalid IDs: must be a non-empty array');
  }
  if (ids.length > 1000) {
    throw new Error('Invalid IDs: maximum 1000 items per batch');
  }
  const validatedIds = ids.map(id => {
    const num = Number(id);
    if (!Number.isInteger(num) || num <= 0) {
      throw new Error(`Invalid ID: ${id} must be a positive integer`);
    }
    return num;
  });

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
    c.name || '',
    c.address || '',
    c.category || '',
    c.website || '',
    c.rating || '',
    c.rating_count || '',
    c.phone || '',
    c.created_at || ''
  ]);

  const escape = (val) => {
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(escape).join(','))
  ].join('\n');

  return csvContent;
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
  const fields = [];
  const values = [];

  if (data.ico !== undefined) {
    fields.push('ico = ?');
    values.push(data.ico);
  }
  if (data.segment !== undefined) {
    fields.push('segment = ?');
    values.push(data.segment);
  }
  if (data.industry !== undefined) {
    fields.push('industry = ?');
    values.push(data.industry);
  }
  if (data.company_size !== undefined) {
    fields.push('company_size = ?');
    values.push(data.company_size);
  }
  if (data.enrichment_source !== undefined) {
    fields.push('enrichment_source = ?');
    values.push(data.enrichment_source);
  }
  if (data.ico_validated !== undefined) {
    fields.push('ico_validated = ?');
    values.push(data.ico_validated ? 1 : 0);
  }

  if (fields.length === 0) return;

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  db.prepare(`UPDATE companies SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

/**
 * Update contact with validation data
 * @param {number} contactId - Contact ID
 * @param {Object} data - Validation data
 */
function updateContactValidation(contactId, data) {
  const fields = [];
  const values = [];

  if (data.email_valid !== undefined) {
    fields.push('email_valid = ?');
    values.push(data.email_valid ? 1 : 0);
  }
  if (data.email_validated_at !== undefined) {
    fields.push('email_validated_at = ?');
    values.push(data.email_validated_at);
  }
  if (data.template_type !== undefined) {
    fields.push('template_type = ?');
    values.push(data.template_type);
  }
  if (data.source !== undefined) {
    fields.push('source = ?');
    values.push(data.source);
  }
  if (data.phone !== undefined) {
    fields.push('phone = ?');
    values.push(data.phone);
  }

  if (fields.length === 0) return;

  values.push(contactId);

  db.prepare(`UPDATE contacts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
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
  getContactById
};
