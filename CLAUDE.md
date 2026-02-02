# Lead Scraper

Local app for scraping business leads from Google Places API.

## Quick Start

```bash
npm install
cp .env.example .env.local  # Add your GOOGLE_PLACES_API_KEY
node server.js
# Open http://localhost:3001
```

## Stack

- Frontend: Plain HTML/CSS/JS (no build step)
- Backend: Node.js + Express
- Database: SQLite (better-sqlite3)

## Key Files

- `server.js` - Express server with API routes
- `google-places.js` - Grid-based Google Places scraping
- `db.js` - SQLite database layer
- `index.html` + `app.js` - Frontend UI

## API Endpoints

### Searches
- `GET /api/searches` - List all past searches
- `POST /api/searches` - Start scrape (body: {query, location, gridSize})
- `GET /api/searches/:id` - Get search details
- `DELETE /api/searches/:id` - Delete a search

### Companies
- `GET /api/searches/:id/companies` - Get companies for a search
- `GET /api/companies` - List all companies
- `GET /api/companies/:id` - Get single company (full view)
- `DELETE /api/companies/:id` - Delete a company

### Export
- `GET /api/searches/:id/export` - Export search results as CSV
- `GET /api/companies/export` - Export all companies as CSV

### Usage
- `GET /api/usage` - Get API usage stats

## Google Places API

- Uses Text Search (New) API
- Grid search bypasses 60-result limit (max 60 per query)
- Deduplicates globally by place_id
- Rate limited to prevent cost overruns

## Database Schema

- `searches` - Track each scrape run
- `companies` - Global company records (deduplicated)
- `search_companies` - Many-to-many relationship
- `api_usage` - Track monthly API calls

## Rate Limiting

Default: 20 API requests/month. Configure via `API_MONTHLY_LIMIT` in .env.local.
