# Product Requirements Document: Lead Qualification Pipeline

**Product:** Chorizo Lead Scraper
**Version:** 2.0
**Date:** February 2026
**Author:** Jaro

---

## 1. Overview

### 1.1 Purpose
Extend the existing Lead Scraper application with a qualification pipeline that transforms raw Google Places leads into segmented, high-quality lists with CEO/founder emails ready for outreach via YAMM (Gmail mail merge).

### 1.2 Current State
The application currently:
- Scrapes business data from Google Places API (name, address, website, phone, rating, reviews, category)
- Stores leads in SQLite database
- Provides basic filtering and CSV export
- Has placeholder for Hunter.io integration (not implemented)

### 1.3 Target State
A 4-stage pipeline that:
1. Qualifies leads (has website + not already in Notion)
2. Classifies leads by industry subsegment using AI
3. Enriches leads with decision-maker emails via Hunter.io
4. Exports segmented lists ready for personalized outreach

---

## 2. User Stories

### 2.1 Qualification
> As a sales rep, I want to automatically filter out leads that don't have websites or already exist in my Notion CRM, so I only spend time on new, contactable prospects.

**Acceptance Criteria:**
- Leads without websites are marked as unqualified
- Leads with domains matching my Notion database are flagged as "In Notion"
- Qualified leads show a checkmark in the table
- I can filter by: All / Qualified / Unqualified / In Notion

### 2.2 Classification
> As a sales rep, I want leads automatically categorized by industry subsegment (SEO, PR, HR, etc.), so I can send targeted messaging to each segment.

**Acceptance Criteria:**
- Each qualified lead is assigned one subsegment category
- Classification uses AI (Perplexity) to analyze company name and website
- Subsegment appears as a badge in the table
- I can filter leads by subsegment

### 2.3 Enrichment
> As a sales rep, I want to find CEO/founder email addresses for each company, so I can reach decision-makers directly.

**Acceptance Criteria:**
- Hunter.io API discovers emails for each company domain
- System prioritizes decision-maker titles (CEO, Founder, Owner, MD)
- Primary contact email displayed in table
- Full contact list available in company detail panel

### 2.4 Export
> As a sales rep, I want to export a YAMM-ready CSV with personalization fields, so I can run targeted email campaigns.

**Acceptance Criteria:**
- Export includes: First Name, Email, Company, Subsegment, City, Website
- Can filter by subsegment before export
- Includes personalization data (rating, review count)
- One-click "Export for YAMM" button

---

## 3. Pipeline Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  STAGE 1: RAW                                                  │
│  Source: Google Places API                                     │
│  Data: Name, address, website, phone, rating, reviews          │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  STAGE 2: QUALIFIED                                            │
│  Checks:                                                       │
│    • Has website? ────────────────────────────────────── Yes   │
│    • In Notion DB? (domain match) ────────────────────── No    │
│  Output: Qualified ✓ or Unqualified/In Notion                  │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  STAGE 3: CLASSIFIED                                           │
│  Method: Perplexity LLM API                                    │
│  Input: Company name + website URL                             │
│  Output: Subsegment category                                   │
│    • seo_ads      • hr_staffing    • social_media              │
│    • pr_comms     • creative       • web_dev                   │
│    • full_service • other                                      │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  STAGE 4: ENRICHED                                             │
│  Method: Hunter.io Domain Search API                           │
│  Input: Company domain                                         │
│  Output: Decision-maker emails                                 │
│    • Filter by title: CEO, Founder, Owner, MD, Director        │
│    • Store in contacts table                                   │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  STAGE 5: READY                                                │
│  Action: Export to CSV                                         │
│  Format: YAMM-compatible                                       │
│  Fields: First Name, Email, Company, Subsegment, City, Website │
└────────────────────────────────────────────────────────────────┘
```

---

## 4. Functional Requirements

### 4.1 Qualification Module

#### 4.1.1 Website Check
- Extract website URL from lead record
- Mark as unqualified if website is null or empty
- No HTTP validation required (trust Google Places data)

#### 4.1.2 Notion Deduplication
- Extract domain from website URL
  - Input: `https://www.example.com/about`
  - Output: `example.com`
- Query Notion database via API
- Match against "Website" or "Domain" property
- Mark as "In Notion" if match found

#### 4.1.3 Qualification Status
- `qualified`: Has website AND not in Notion
- `unqualified`: No website
- `in_notion`: Domain exists in Notion DB

### 4.2 Classification Module

#### 4.2.1 Perplexity Integration
- API endpoint: Perplexity Sonar API
- Input: Company name + website URL
- Perplexity will browse the website to gather context

#### 4.2.2 Classification Prompt
```
Classify this company into ONE category:
- seo_ads (SEO, PPC, digital marketing, performance marketing)
- pr_comms (PR, public relations, communications, media)
- hr_staffing (HR, recruitment, staffing, headhunting)
- creative (design, branding, creative agency)
- social_media (social media, content marketing, influencer)
- web_dev (web development, software, app development)
- full_service (full service, integrated, 360 agency)
- other (doesn't fit above categories)

Company: {name}
Website: {url}

Reply with just the category name, nothing else.
```

#### 4.2.3 Subsegment Categories
| Code | Display Name | Keywords |
|------|--------------|----------|
| `seo_ads` | SEO & Ads | SEO, PPC, Google Ads, performance |
| `pr_comms` | PR & Comms | Public relations, communications |
| `hr_staffing` | HR & Staffing | Recruitment, headhunting, HR |
| `creative` | Creative | Design, branding, creative |
| `social_media` | Social Media | Content, influencer, social |
| `web_dev` | Web Dev | Development, software, apps |
| `full_service` | Full Service | Integrated, 360, full service |
| `other` | Other | Uncategorized |

### 4.3 Enrichment Module

#### 4.3.1 Hunter.io Integration
- **Domain Search** (`GET /v2/domain-search`)
  - Input: `domain=example.com`
  - Output: Array of emails with names and titles
  - Cost: 1 credit per request

#### 4.3.2 Decision-Maker Filtering
Priority order for title matching:
1. CEO, Chief Executive Officer
2. Founder, Co-founder, Co-Founder
3. Owner
4. Managing Director, MD
5. President
6. Principal
7. Director (fallback for small companies)

#### 4.3.3 Contact Storage
Store all discovered contacts, flag primary contact (highest priority title).

### 4.4 Export Module

#### 4.4.1 YAMM CSV Format
| Column | Source | Example |
|--------|--------|---------|
| First Name | contacts.first_name | "John" |
| Email | contacts.email | "john@example.com" |
| Company | companies.name | "Acme Agency" |
| Subsegment | companies.subsegment | "seo_ads" |
| City | Extracted from address | "Prague" |
| Website | companies.website | "example.com" |
| Rating | companies.rating | "4.5" |
| Reviews | companies.rating_count | "127" |

#### 4.4.2 Export Filters
- By subsegment (single or multiple)
- By pipeline stage (only "ready" by default)
- Exclude leads without primary contact email

---

## 5. Database Schema

### 5.1 Schema Changes to `companies` Table

```sql
-- Add pipeline tracking
ALTER TABLE companies ADD COLUMN pipeline_stage TEXT DEFAULT 'raw';
-- Values: raw, qualified, classified, enriched, ready

-- Add Notion dedup flag
ALTER TABLE companies ADD COLUMN in_notion INTEGER DEFAULT 0;
-- 0 = not checked or not in Notion, 1 = exists in Notion

-- Add subsegment classification
ALTER TABLE companies ADD COLUMN subsegment TEXT;
-- Values: seo_ads, pr_comms, hr_staffing, creative, social_media, web_dev, full_service, other
```

### 5.2 New `contacts` Table

```sql
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  title TEXT,
  is_primary INTEGER DEFAULT 0,
  source TEXT DEFAULT 'hunter',
  confidence INTEGER,
  raw_data TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE INDEX idx_contacts_company ON contacts(company_id);
CREATE INDEX idx_contacts_primary ON contacts(is_primary);
```

---

## 6. API Endpoints

### 6.1 Qualification

```
POST /api/companies/qualify
Body: { companyIds: [1, 2, 3] } or { all: true }
Response: { qualified: 45, unqualified: 12, inNotion: 8 }
```

```
POST /api/companies/:id/qualify
Response: { status: "qualified" | "unqualified" | "in_notion" }
```

### 6.2 Classification

```
POST /api/companies/classify
Body: { companyIds: [1, 2, 3] } or { qualified: true }
Response: { classified: 45, failed: 2 }
```

```
POST /api/companies/:id/classify
Response: { subsegment: "seo_ads" }
```

### 6.3 Enrichment

```
POST /api/companies/enrich
Body: { companyIds: [1, 2, 3] } or { classified: true }
Response: { enriched: 30, noResults: 12, failed: 3 }
```

```
POST /api/companies/:id/enrich
Response: { contacts: [...], primaryContact: {...} }
```

### 6.4 Export

```
GET /api/export/yamm?subsegment=seo_ads&stage=ready
Response: CSV file download
```

---

## 7. UI Specifications

### 7.1 Table Columns (Updated)

| Column | Width | Content |
|--------|-------|---------|
| Checkbox | 40px | Selection |
| Qualified | 60px | ✓ or empty |
| Name | flex | Company name |
| City | 100px | Extracted city |
| Subsegment | 120px | Colored badge |
| Website | 150px | Truncated link |
| Email | 180px | Primary contact email |
| Rating | 80px | Star + number |
| Reviews | 80px | Number |
| Actions | 80px | View / Delete icons |

### 7.2 Filter Bar (Updated)

```
[ Search by name... ] [ Stage ▼ ] [ Subsegment ▼ ] [ Category ▼ ]
```

**Stage Dropdown:**
- All Leads
- Qualified
- Unqualified
- In Notion
- Classified
- Enriched
- Ready

**Subsegment Dropdown:**
- All Subsegments
- SEO & Ads
- PR & Comms
- HR & Staffing
- Creative
- Social Media
- Web Dev
- Full Service
- Other

### 7.3 Action Buttons

**Header Actions:**
```
[ + New Search ] [ Qualify All ] [ Classify All ] [ Enrich All ] [ Export YAMM ▼ ]
```

**Bulk Actions (when rows selected):**
```
[ Qualify Selected ] [ Classify Selected ] [ Enrich Selected ] [ Delete Selected ]
```

### 7.4 Subsegment Badge Colors

| Subsegment | Background | Text |
|------------|------------|------|
| seo_ads | #DBEAFE | #1D4ED8 |
| pr_comms | #FEE2E2 | #DC2626 |
| hr_staffing | #D1FAE5 | #059669 |
| creative | #FEF3C7 | #D97706 |
| social_media | #EDE9FE | #7C3AED |
| web_dev | #CFFAFE | #0891B2 |
| full_service | #F3F4F6 | #374151 |
| other | #F3F4F6 | #6B7280 |

---

## 8. External Integrations

### 8.1 Notion API

**Purpose:** Deduplication against existing CRM data

**Required Configuration:**
```
NOTION_API_KEY=secret_xxxxx
NOTION_DATABASE_ID=xxxxx-xxxxx-xxxxx
```

**API Calls:**
- `POST /v1/databases/{database_id}/query`
- Filter by "Website" property contains domain

**Rate Limits:** 3 requests/second

### 8.2 Perplexity API

**Purpose:** AI-powered industry classification

**Required Configuration:**
```
PERPLEXITY_API_KEY=pplx-xxxxx
```

**API Calls:**
- `POST https://api.perplexity.ai/chat/completions`
- Model: `sonar` (can browse websites)

**Rate Limits:** Varies by plan
**Cost:** ~$0.005 per classification

### 8.3 Hunter.io API

**Purpose:** Email discovery and enrichment

**Required Configuration:**
```
HUNTER_API_KEY=xxxxx
```

**API Calls:**
- `GET https://api.hunter.io/v2/domain-search?domain={domain}&api_key={key}`

**Rate Limits:** Based on plan
**Cost:** 1 credit per domain search

---

## 9. Implementation Phases

### Phase 1: Qualification + Notion Dedup
**Scope:**
- Add `pipeline_stage` and `in_notion` columns to database
- Create `notion.js` API client
- Add qualification endpoint
- Add "Qualified" column with checkmark
- Add stage filter dropdown
- Add "Qualify All" button

**Deliverables:**
- Leads can be qualified/unqualified
- Notion duplicates are flagged
- UI shows qualification status

### Phase 2: Perplexity Classification
**Scope:**
- Add `subsegment` column to database
- Create `perplexity.js` API client
- Add classification endpoint
- Add subsegment badge to table
- Add subsegment filter dropdown
- Add "Classify All" button

**Deliverables:**
- Qualified leads can be classified
- Subsegments displayed in UI
- Can filter by subsegment

### Phase 3: Hunter Enrichment
**Scope:**
- Create `contacts` table
- Create `hunter.js` API client
- Add enrichment endpoint
- Display primary email in table
- Show full contact list in detail panel
- Add "Enrich All" button

**Deliverables:**
- Classified leads can be enriched
- Decision-maker emails discovered
- Contacts stored and displayed

### Phase 4: YAMM Export
**Scope:**
- Create YAMM export endpoint
- Add "Export YAMM" button with subsegment filter
- Include all personalization fields

**Deliverables:**
- One-click export to YAMM-ready CSV
- Filtered by subsegment
- Includes contact + company data

---

## 10. Success Metrics

| Metric | Target |
|--------|--------|
| Qualification rate | >70% of raw leads have websites |
| Classification accuracy | >90% correct subsegment (spot check) |
| Enrichment hit rate | >40% of domains return emails |
| Decision-maker match | >60% of enriched leads have CEO/Founder |
| Export to outreach | <5 minutes from scrape to YAMM |

---

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Notion API rate limits | Slow qualification | Batch requests, cache results |
| Perplexity classification errors | Wrong segments | Manual override capability |
| Hunter low hit rate | Few emails found | Add Apollo.io as fallback |
| API costs exceed budget | Overspend | Add usage tracking, daily limits |
| Notion DB schema mismatch | Dedup fails | Configurable property name |

---

## 12. Appendix

### A. Environment Variables

```bash
# Existing
GOOGLE_PLACES_API_KEY=xxxxx
PORT=3003
API_MONTHLY_LIMIT=50

# New - Phase 1
NOTION_API_KEY=secret_xxxxx
NOTION_DATABASE_ID=xxxxx

# New - Phase 2
PERPLEXITY_API_KEY=pplx-xxxxx

# New - Phase 3
HUNTER_API_KEY=xxxxx
```

### B. File Structure (After Implementation)

```
lead-scraper/
├── server.js          # Express server + API routes
├── db.js              # SQLite database + queries
├── google-places.js   # Google Places API client
├── notion.js          # NEW: Notion API client
├── perplexity.js      # NEW: Perplexity API client
├── hunter.js          # NEW: Hunter.io API client
├── index.html         # Frontend HTML
├── app.js             # Frontend JavaScript
├── style.css          # Frontend styles
├── .env.local         # Environment variables
├── .env.example       # Example env file
├── PRD.md             # This document
└── leads.db           # SQLite database file
```
