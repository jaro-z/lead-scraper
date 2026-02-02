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
`);

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
    SELECT c.* FROM companies c
    JOIN search_companies sc ON c.id = sc.company_id
    WHERE sc.search_id = ?
    ORDER BY c.name ASC
  `).all(searchId);
}

function getAllCompanies() {
  return db.prepare(`SELECT * FROM companies ORDER BY name ASC`).all();
}

function getCompanyById(id) {
  return db.prepare(`SELECT * FROM companies WHERE id = ?`).get(id);
}

function deleteCompany(id) {
  db.prepare(`DELETE FROM search_companies WHERE company_id = ?`).run(id);
  db.prepare(`DELETE FROM companies WHERE id = ?`).run(id);
}

function bulkDeleteCompanies(ids) {
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM search_companies WHERE company_id IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM companies WHERE id IN (${placeholders})`).run(...ids);
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
  exportToCSV
};
