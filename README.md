# Lead Scraper

A local lead generation and enrichment tool for B2B outreach. Scrapes businesses from Google Places, enriches them with AI-powered analysis, discovers decision-maker contacts, and syncs to Notion CRM.

## Features

### Lead Generation
- Search businesses by category and location via Google Places API
- Grid-based searching to bypass Google's 60-result limit
- Automatic deduplication across searches

### AI-Powered Enrichment
- **Granular segmentation** - AI generates specific segments like "SEO Agency", "PPC Agency", "B2B SaaS CRM" (not just generic "Agency")
- **Company descriptions** - One-sentence AI-generated summary of what each company does
- **IČO extraction** - Automatically finds Czech company registration numbers
- **Industry classification** - Specific industry tags

### Contact Discovery (Waterfall)
1. **Web scraping (free)** - Firecrawl + Claude extracts contacts from company websites
2. **Hunter.io (paid fallback)** - If web scraping finds nothing, falls back to Hunter API
3. **Decision makers first** - Prioritizes CEO, Founder, Director roles

### Pipeline Management
```
Raw → Enriched → Qualified → Ready → Push to Notion
```

- **Selection-based actions** - Must select leads before enriching (prevents accidents)
- **Inline progress** - See status per row: "Enriching...", "Finding emails...", "✓ Done"
- **Deduplication** - Check against local database AND Notion CRM
- **Bulk Notion push** - Select leads and push to your CRM

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your API keys

# Start the server
npm start

# Open in browser
open http://localhost:3002
```

## Configuration

Edit `.env.local`:

```bash
# Required
GOOGLE_PLACES_API_KEY=your_google_api_key

# AI Enrichment (required for enrichment features)
ANTHROPIC_API_KEY=your_claude_api_key
FIRECRAWL_API_KEY=your_firecrawl_api_key

# Contact Discovery (optional, paid fallback)
HUNTER_API_KEY=your_hunter_api_key

# Notion CRM Integration (optional)
NOTION_API_KEY=your_notion_api_key
NOTION_DATABASE_ID=your_database_id

# Server
PORT=3002
API_MONTHLY_LIMIT=20
```

## Usage

### 1. Scrape Leads
1. Click "New Search"
2. Enter search term (e.g., "marketing agencies")
3. Enter location (e.g., "Prague")
4. Select grid size and start search

### 2. Deduplicate
1. Click "Dedupe" button
2. Review duplicates (checks local DB + Notion)
3. Delete duplicates

### 3. Enrich
1. **Select leads** with checkboxes (required)
2. Click "Enrich" button
3. Watch inline status update per row
4. AI extracts: segment, description, contacts, IČO

### 4. Review & Qualify
1. Filter by "Enriched" stage
2. Review AI-generated segments and descriptions
3. Edit if needed in detail panel
4. Select and click "Approve" to move to Qualified

### 5. Push to Notion
1. Select qualified leads
2. Click "Push to Notion"
3. Leads sync to your Notion CRM database

## API Endpoints

### Companies
- `GET /api/searches/:id/companies` - Get companies for a search
- `POST /api/companies/:id/enrich-full` - Full waterfall enrichment
- `POST /api/companies/dedupe` - Check duplicates (local + Notion)
- `POST /api/companies/approve` - Bulk approve to qualified stage
- `POST /api/companies/push-to-notion` - Bulk push to Notion
- `PUT /api/companies/:id` - Update company fields

### Pipeline
- `GET /api/companies/stats` - Pipeline stage counts
- `POST /api/companies/:id/stage` - Update pipeline stage

### Segments
- `GET /api/segments` - Get distinct segments for filtering

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS
- **Backend**: Node.js + Express
- **Database**: SQLite (better-sqlite3)
- **AI**: Claude API (Anthropic)
- **Web Scraping**: Firecrawl
- **Email Discovery**: Hunter.io
- **CRM**: Notion API

## Project Structure

```
lead-scraper/
├── index.html              # Main UI
├── style.css               # Styling
├── app.js                  # Frontend logic
├── server.js               # Express server + API routes
├── db.js                   # SQLite database layer
├── google-places.js        # Google Places API
├── hunter.js               # Hunter.io integration
├── notion.js               # Notion CRM integration
├── enrichment/
│   ├── index.js            # Enrichment module exports
│   ├── companyEnricher.js  # AI company analysis
│   ├── contactWaterfall.js # Contact discovery waterfall
│   ├── webScraper.js       # Firecrawl + Claude extraction
│   ├── ares.js             # Czech business registry
│   └── validators.js       # Email validation
└── data/leads.db           # SQLite database
```

## License

MIT
