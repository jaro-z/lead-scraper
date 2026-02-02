# Lead Scraper

A simple local app for scraping business leads from Google Places API.

## Features

- Search businesses by category and location
- Grid-based searching to bypass Google's 60-result limit
- Automatic deduplication across searches
- Simple and Full view modes
- Sort, filter, and search results
- Export to CSV
- Rate limiting to control API costs
- Ready for Hunter.io email enrichment (Phase 2)

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local and add your GOOGLE_PLACES_API_KEY

# Start the server
npm start

# Open in browser
open http://localhost:3001
```

## Configuration

Edit `.env.local`:

```bash
GOOGLE_PLACES_API_KEY=your_api_key_here
PORT=3001
API_MONTHLY_LIMIT=20  # Adjust based on your needs
```

## Usage

1. Click "New Search"
2. Enter a search term (e.g., "marketing agencies")
3. Enter a location (e.g., "Prague" or "Czechia")
4. Select grid size:
   - Small (2x2): 4 cells, ~12 API calls
   - Medium (3x3): 9 cells, ~27 API calls
   - Large (5x5): 25 cells, ~75 API calls
5. Click "Start Search"
6. Review results, delete irrelevant ones
7. Export to CSV

## API Limits

- Google Places API: 10,000 free requests/month
- Default app limit: 20 requests/month (configurable)
- Each grid cell uses 1-3 requests (pagination)

## Tech Stack

- Frontend: Plain HTML/CSS/JS
- Backend: Node.js + Express
- Database: SQLite

## Project Structure

```
lead-scraper/
├── index.html          # Main UI
├── style.css           # Styling
├── app.js              # Frontend logic
├── server.js           # Express server
├── db.js               # Database layer
├── google-places.js    # Google API integration
├── enrichment/         # Hunter.io (Phase 2)
└── data/leads.db       # SQLite database
```

## Phase 2 (Coming Soon)

- Hunter.io email enrichment
- Manual email entry
- Hostinger deployment guide

## License

MIT
