require('dotenv').config({ path: '.env.local' });
const express = require('express');
const path = require('path');
const db = require('./db');
const googlePlaces = require('./google-places');

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const API_LIMIT = parseInt(process.env.API_MONTHLY_LIMIT) || 20;

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

    // Start search in background
    runSearchAsync(searchId, query, location, gridSize || 'medium');

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
    db.updateSearchStatus(searchId, 'error');
    onProgress({ status: 'error', message: error.message });
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

// ============ Enrichment (Phase 2 placeholders) ============

app.post('/api/companies/:id/enrich', (req, res) => {
  res.status(501).json({ error: 'Enrichment coming soon' });
});

app.post('/api/companies/enrich', (req, res) => {
  res.status(501).json({ error: 'Enrichment coming soon' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Lead Scraper running at http://localhost:${PORT}`);
  console.log(`API limit: ${API_LIMIT} requests/month`);
  const usage = db.getApiUsage();
  console.log(`Current usage: ${usage.request_count}/${API_LIMIT}`);
});
