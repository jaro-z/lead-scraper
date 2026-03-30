# Baseline Waterfall Diagnostic Report

**Run date:** 2026-03-29
**Purpose:** Pre-optimization baseline — captures current (unmodified) enrichment waterfall behavior for comparison after fixes.
**Agent:** Agent B (diagnostic runner)

---

## Company IDs Used

**For Agent E to reuse the exact same set:**

```
84,195,210,211,223,258,296,366,413,541,549,628,635,640,717,764,768,790,835,843
```

Ordered by enriched_at DESC as returned by the query:

| Position | ID  | Name                                            | Domain                  |
|----------|-----|-------------------------------------------------|-------------------------|
| 1        | 768 | REINBAU s.r.o.                                  | reinbau.cz              |
| 2        | 413 | JTM Partners s.r.o.                             | jtm-partners.cz         |
| 3        | 549 | Daluma s.r.o.                                   | daluma.cz               |
| 4        | 790 | Northtech s.r.o.                                | northtech.cz            |
| 5        | 195 | Fox Hunter                                      | foxhunter.cz            |
| 6        | 843 | AZ EKOTHERM s.r.o.                              | azeko.cz                |
| 7        | 258 | Stavby a zahrady Zelené údolí                   | zahrady-zeleneudoli.cz  |
| 8        | 764 | Rekomont a.s.                                   | rekomont.cz             |
| 9        | 640 | DEVPRO, s.r.o.                                  | devpro.cz               |
| 10       | 296 | Absolut estate s.r.o.                           | absolut-estate.cz       |
| 11       | 84  | kefa                                            | kefa.cz                 |
| 12       | 835 | PREFA Aluminiumprodukte Ltd. - Roof Systems     | cz.prefa.com            |
| 13       | 635 | MORIS construction                              | moris-construction.cz   |
| 14       | 211 | Revis - Praha spol. s r.o.                      | revis.cz                |
| 15       | 541 | Holkin, s.r.o.                                  | holkin.cz               |
| 16       | 717 | Stavební firma HEKO group s.r.o.                | heko-group.cz           |
| 17       | 210 | GROSS spol. s r.o.- zemní a výkopové práce      | gross-spol.cz           |
| 18       | 366 | BLESK - stavební řemesla s.r.o.                 | fablesk.cz              |
| 19       | 223 | RK STAVBA                                       | rkstavba.cz             |
| 20       | 628 | LLENTAB, spol. s r.o.                           | llentab.cz              |

---

## Full Diagnostic Output (Verbatim)

```
╔══════════════════════════════════════════════════════════╗
║  WATERFALL DIAGNOSTIC TEST — 20 Random Raw Companies    ║
╚══════════════════════════════════════════════════════════╝
Date: 2026-03-29T21:58:34.353Z
Hunter API Key: SET (095910ed...)
Batch size: 20

Re-testing 20 specific companies
Found 20 raw companies to test.


[1/20] kefa
  Website: https://kefa.cz/
  Domain: kefa.cz
[WebScraper] Starting scrape for: kefa.cz
[Firecrawl] Mapping domain: kefa.cz (https)
[Firecrawl] Map error: read ECONNRESET
[WebScraper] No URLs found for kefa.cz
[Waterfall] Found 1 contacts via Hunter.io for kefa.cz
  Source: hunter
  Pages scraped: 0
  Contacts: 1 total (0 real, 0 hunter, 0 fabricated, 1 generic, 0 name-only)
  Hunter: domain-search=true, dm-search=false, email-finder=false
    → [generic] Unknown  — info@kefa.cz conf:81
  Waiting 5s...

[2/20] Fox Hunter
  Website: http://www.foxhunter.cz/
  Domain: foxhunter.cz
[WebScraper] Starting scrape for: foxhunter.cz
[Firecrawl] Mapping domain: foxhunter.cz (http)
[Firecrawl] Map error: read ECONNRESET
[WebScraper] No URLs found for foxhunter.cz
[Waterfall] Found 5 contacts via Hunter.io for foxhunter.cz
  Source: hunter
  Pages scraped: 0
  Contacts: 5 total (4 real, 0 hunter, 0 fabricated, 1 generic, 0 name-only)
  Hunter: domain-search=true, dm-search=false, email-finder=false
    → [generic] Unknown  — info@foxhunter.cz conf:87
    → [real_scraped] Unknown  — lucie.ilincev@foxhunter.cz conf:82
    → [real_scraped] Unknown  — petra.biache@foxhunter.cz conf:79
    → [real_scraped] Unknown  — eva.kabelacova@foxhunter.cz conf:78
    → [real_scraped] Unknown  — michal.ekrt@foxhunter.cz conf:78
  Waiting 5s...

[3/20] GROSS spol. s r.o.- zemní a výkopové práce
  Website: http://www.gross-spol.cz/
  Domain: gross-spol.cz
[WebScraper] Starting scrape for: gross-spol.cz
[Firecrawl] Mapping domain: gross-spol.cz (http)
[Firecrawl] Mapped 1 URLs from gross-spol.cz
[WebScraper] Filtered hallucinated URL: https://gross-spol.cz/tym (not in 1 discovered URLs)
[WebScraper] Filtered hallucinated URL: https://gross-spol.cz/o-nas (not in 1 discovered URLs)
[WebScraper] Filtered hallucinated URL: https://gross-spol.cz/kontakt (not in 1 discovered URLs)
[WebScraper] Filtered 3 hallucinated URLs, 0 remain
[WebScraper] AI ranked 0 pages: []
[WebScraper] No team/about/contact pages found, falling back to homepage for gross-spol.cz
[WebScraper] Scraping page 1/1: HOMEPAGE - https://gross-spol.cz
[Firecrawl] Scraping: https://gross-spol.cz
[Firecrawl] Success: https://gross-spol.cz (69682 chars)
[WebScraper] Found 0 contacts from HOMEPAGE page
[WebScraper] No personal contacts from Firecrawl, trying raw HTTP fetch of homepage
[WebScraper] Raw fetch success: http://gross-spol.cz/ (13044 chars)
[WebScraper] Raw fetch found 2 contacts!
[WebScraper] Decision-maker found: Vladimír Vlasák (null)
[WebScraper] Final: 2 contacts (2 personal, 0 person-associated generic, 0 names only, 0 unassociated generic)
[Waterfall] Found 2 contacts via web scrape for gross-spol.cz
  Source: web_scrape
  Pages scraped: 2
  Contacts: 2 total (2 real, 0 hunter, 0 fabricated, 0 generic, 0 name-only)
  Hunter: domain-search=false, dm-search=false, email-finder=false
  Hunter reason: web_scrape_found_contacts
    → [real_scraped] Vladimír  — gross.sro@volny.cz conf:50
    → [real_scraped] Jaroslav  — gross.sro@volny.cz conf:50
  Waiting 5s...

[4/20] Revis - Praha spol. s r.o.
  Website: http://www.revis.cz/
  Domain: revis.cz
[WebScraper] Starting scrape for: revis.cz
[Firecrawl] Mapping domain: revis.cz (http)
[Firecrawl] Mapped 37 URLs from revis.cz
[WebScraper] AI ranked 3 pages: [
  'CONTACT: https://www.revis.cz/kontakt',
  'ABOUT: https://www.revis.cz/o-nas',
  'ABOUT: https://www.revis.cz'
]
[WebScraper] Scraping page 1/3: CONTACT - https://www.revis.cz/kontakt
[Firecrawl] Scraping: https://www.revis.cz/kontakt
[WebScraper] Could not fetch https://www.revis.cz/kontakt: No response received while trying to scrape URL. This may be a network error or the server is unreachable.
[WebScraper] Scraping page 2/3: ABOUT - https://www.revis.cz/o-nas
[Firecrawl] Scraping: https://www.revis.cz/o-nas
[Firecrawl] Success: https://www.revis.cz/o-nas (34463 chars)
[WebScraper] Found 1 additional emails: frame-5b5591b2fca26216245de801cff2b5eb@mhtml.blink
[WebScraper] Found 1 contacts from ABOUT page
[WebScraper] Scraping page 3/3: ABOUT - https://www.revis.cz
[Firecrawl] Scraping: https://www.revis.cz
[Firecrawl] Success: https://www.revis.cz (28747 chars)
[WebScraper] Found 0 contacts from ABOUT page
[WebScraper] Final: 2 contacts (1 personal, 0 person-associated generic, 0 names only, 1 unassociated generic)
[Waterfall] Found 2 contacts via web scrape for revis.cz
  Source: web_scrape
  Pages scraped: 3
  Contacts: 2 total (1 real, 0 hunter, 0 fabricated, 1 generic, 0 name-only)
  Hunter: domain-search=false, dm-search=false, email-finder=false
  Hunter reason: unknown
    → [real_scraped] Frame  — frame-5b5591b2fca26216245de801cff2b5eb@mhtml.blink conf:50
    → [generic] General (Company Email) — info@revis.cz conf:50
  Waiting 5s...

[5/20] RK STAVBA
  Website: http://www.rkstavba.cz/
  Domain: rkstavba.cz
[WebScraper] Starting scrape for: rkstavba.cz
[Firecrawl] Mapping domain: rkstavba.cz (http)
[Firecrawl] Mapped 29 URLs from rkstavba.cz
[WebScraper] AI ranked 3 pages: [
  'CONTACT: https://www.rkstavba.cz/kontakt',
  'ABOUT: https://www.rkstavba.cz/o-nas',
  'ABOUT: https://www.rkstavba.cz'
]
[WebScraper] Scraping page 1/3: CONTACT - https://www.rkstavba.cz/kontakt
[Firecrawl] Scraping: https://www.rkstavba.cz/kontakt
[Firecrawl] Success: https://www.rkstavba.cz/kontakt (63041 chars)
[WebScraper] Found 1 contacts from CONTACT page
[WebScraper] Scraping page 2/3: ABOUT - https://www.rkstavba.cz/o-nas
[Firecrawl] Scraping: https://www.rkstavba.cz/o-nas
[Firecrawl] Success: https://www.rkstavba.cz/o-nas (12280 chars)
[WebScraper] Found 2 contacts from ABOUT page
[WebScraper] Scraping page 3/3: ABOUT - https://www.rkstavba.cz
[Firecrawl] Scraping: https://www.rkstavba.cz (97918 chars)
[WebScraper] Found 1 contacts from ABOUT page
[WebScraper] Merged 2 contacts across pages
[WebScraper] Decision-maker found: Rostislav Kalousek (majitel)
[WebScraper] Final: 2 contacts (1 personal, 0 person-associated generic, 1 names only, 0 unassociated generic)
[Waterfall] Found 2 contacts via web scrape for rkstavba.cz
[Waterfall] Attempting to recover emails for 1 contacts without emails
  Source: web_scrape
  Pages scraped: 3
  Contacts: 2 total (1 real, 0 hunter, 0 fabricated, 0 generic, 1 name-only)
  Hunter: domain-search=false, dm-search=false, email-finder=false
  Hunter reason: web_scrape_found_contacts
  Email recovery: checked:1 recovered:0 patterns:0 fnPatterns:0
    → [real_scraped] Rostislav (majitel) — r.k.stavba@email.cz conf:50
    → [name_only] Jakub (vedoucí stavby) — (no email) conf:50
  Waiting 5s...

[6/20] Stavby a zahrady Zelené údolí
  Website: http://zahrady-zeleneudoli.cz/
  Domain: zahrady-zeleneudoli.cz
[WebScraper] Starting scrape for: zahrady-zeleneudoli.cz
[Firecrawl] Mapping domain: zahrady-zeleneudoli.cz (http)
[Firecrawl] Mapped 1 URLs from zahrady-zeleneudoli.cz
[WebScraper] Filtered hallucinated URL: http://zahrady-zeleneudoli.cz/kontakt (not in 1 discovered URLs)
[WebScraper] Filtered 1 hallucinated URLs, 1 remain
[WebScraper] AI ranked 1 pages: [ 'ABOUT: http://zahrady-zeleneudoli.cz/' ]
[WebScraper] Scraping page 1/1: ABOUT - http://zahrady-zeleneudoli.cz/
[Firecrawl] Scraping: http://zahrady-zeleneudoli.cz/
[Firecrawl] Success: http://zahrady-zeleneudoli.cz/ (181855 chars)
[WebScraper] Found 0 contacts from ABOUT page
[WebScraper] No personal contacts from Firecrawl, trying raw HTTP fetch of homepage
[WebScraper] Raw fetch success: http://zahrady-zeleneudoli.cz/ (724573 chars)
[WebScraper] Found 2 additional emails: 605a7baede844d278b89dc95ae0a9123@sentry-next.wixpress.com, 8eb368c655b84e029ed79ad7a5c1718e@sentry.wixpress.com
[WebScraper] Raw fetch found 2 contacts!
[WebScraper] Final: 3 contacts (2 personal, 0 person-associated generic, 0 names only, 1 unassociated generic)
[Waterfall] Found 3 contacts via web scrape for zahrady-zeleneudoli.cz
  Source: web_scrape
  Pages scraped: 2
  Contacts: 3 total (2 real, 0 hunter, 0 fabricated, 1 generic, 0 name-only)
  Hunter: domain-search=false, dm-search=false, email-finder=false
  Hunter reason: unknown
    → [real_scraped] Unknown  — 605a7baede844d278b89dc95ae0a9123@sentry-next.wixpress.com conf:50
    → [real_scraped] Unknown  — 8eb368c655b84e029ed79ad7a5c1718e@sentry.wixpress.com conf:50
    → [generic] General (Company Email) — info@szzu.cz conf:50
  Waiting 5s...

[7/20] Absolut estate s.r.o.
  Website: https://absolut-estate.cz/
  Domain: absolut-estate.cz
[WebScraper] Starting scrape for: absolut-estate.cz
[Firecrawl] Mapping domain: absolut-estate.cz (https)
[Firecrawl] Mapped 5 URLs from absolut-estate.cz
[WebScraper] AI ranked 3 pages: [
  'TEAM: https://absolut-estate.cz/team.html',
  'ABOUT: https://www.absolut-estate.cz/onas.html',
  'CONTACT: https://www.absolut-estate.cz/spoluprace.html'
]
[WebScraper] Scraping page 1/3: TEAM - https://absolut-estate.cz/team.html
[Firecrawl] Scraping: https://absolut-estate.cz/team.html
[Firecrawl] Success: https://absolut-estate.cz/team.html (4586 chars)
[WebScraper] Found 3 contacts from TEAM page
[WebScraper] Scraping page 2/3: ABOUT - https://www.absolut-estate.cz/onas.html
[Firecrawl] Scraping: https://www.absolut-estate.cz/onas.html
[Firecrawl] Success: https://www.absolut-estate.cz/onas.html (1131 chars)
[WebScraper] Found 0 contacts from ABOUT page
[WebScraper] Scraping page 3/3: CONTACT - https://www.absolut-estate.cz/spoluprace.html
[Firecrawl] Scraping: https://www.absolut-estate.cz/spoluprace.html
[Firecrawl] Success: https://www.absolut-estate.cz/spoluprace.html (2666 chars)
[WebScraper] Found 0 contacts from CONTACT page
[WebScraper] Final: 4 contacts (2 personal, 1 person-associated generic, 0 names only, 1 unassociated generic)
[Waterfall] Found 4 contacts via web scrape for absolut-estate.cz
  Source: web_scrape
  Pages scraped: 3
  Contacts: 4 total (2 real, 0 hunter, 0 fabricated, 2 generic, 0 name-only)
  Hunter: domain-search=false, dm-search=false, email-finder=false
  Hunter reason: web_scrape_found_contacts
    → [real_scraped] Jiří  — kurka@absolut-estate.cz conf:50
    → [real_scraped] Václav  — ruzicka@krlegal.cz conf:50
    → [generic] Sergej  — info@absolut-estate.cz conf:50
    → [generic] General (Company Email) — info@absolut-estate.cz conf:50
  Waiting 5s...

[8/20] BLESK - stavební řemesla s.r.o.
  Website: http://www.fablesk.cz/
  Domain: fablesk.cz
[WebScraper] Starting scrape for: fablesk.cz
[Firecrawl] Mapping domain: fablesk.cz (http)
[Firecrawl] Mapped 100 URLs from fablesk.cz
[WebScraper] AI ranked 3 pages: [
  'CONTACT: http://www.fablesk.cz/index.php/kontakt',
  'ABOUT: https://fablesk.cz',
  'ABOUT: http://www.fablesk.cz/index.php/reference'
]
[WebScraper] Scraping page 1/3: CONTACT - http://www.fablesk.cz/index.php/kontakt
[Firecrawl] Scraping: http://www.fablesk.cz/index.php/kontakt
[Firecrawl] Success: http://www.fablesk.cz/index.php/kontakt (9788 chars)
[WebScraper] Found 1 contacts from CONTACT page
[WebScraper] Scraping page 2/3: ABOUT - https://fablesk.cz
[Firecrawl] Scraping: https://fablesk.cz
[Firecrawl] Success: https://fablesk.cz (1821 chars)
[WebScraper] Found 0 contacts from ABOUT page
[WebScraper] Scraping page 3/3: ABOUT - http://www.fablesk.cz/index.php/reference
[Firecrawl] Scraping: http://www.fablesk.cz/index.php/reference
[Firecrawl] Success: http://www.fablesk.cz/index.php/reference (9626 chars)
[WebScraper] Found 0 contacts from ABOUT page
[WebScraper] Final: 2 contacts (1 personal, 0 person-associated generic, 0 names only, 1 unassociated generic)
[Waterfall] Found 2 contacts via web scrape for fablesk.cz
  Source: web_scrape
  Pages scraped: 3
  Contacts: 2 total (1 real, 0 hunter, 0 fabricated, 1 generic, 0 name-only)
  Hunter: domain-search=false, dm-search=false, email-finder=false
  Hunter reason: web_scrape_found_contacts
    → [real_scraped] Jan  — janhyka@fablesk.cz conf:50
    → [generic] General (Company Email) — info@web4ce.cz conf:50
  Waiting 5s...

[9/20] JTM Partners s.r.o.
  Website: http://www.jtm-partners.cz/
  Domain: jtm-partners.cz
[WebScraper] Starting scrape for: jtm-partners.cz
[Firecrawl] Mapping domain: jtm-partners.cz (http)
[Firecrawl] Mapped 35 URLs from jtm-partners.cz
[WebScraper] AI ranked 3 pages: [
  'CONTACT: https://www.jtm-partners.cz/kontakty',
  'ABOUT: https://www.jtm-partners.cz/o-nas',
  'ABOUT: https://www.jtm-partners.cz'
]
[WebScraper] Scraping page 1/3: CONTACT - https://www.jtm-partners.cz/kontakty
[Firecrawl] Scraping: https://www.jtm-partners.cz/kontakty
[Firecrawl] Success: https://www.jtm-partners.cz/kontakty (67133 chars)
[WebScraper] Found 2 contacts from CONTACT page
[WebScraper] Scraping page 2/3: ABOUT - https://www.jtm-partners.cz/o-nas
[Firecrawl] Scraping: https://www.jtm-partners.cz/o-nas
[Firecrawl] Success: https://www.jtm-partners.cz/o-nas (30522 chars)
[WebScraper] Found 7 contacts from ABOUT page
[WebScraper] Scraping page 3/3: ABOUT - https://www.jtm-partners.cz
[Firecrawl] Scraping: https://www.jtm-partners.cz
[Firecrawl] Success: https://www.jtm-partners.cz (60062 chars)
[WebScraper] Found 0 contacts from ABOUT page
[WebScraper] Decision-maker found: Jakub Doležal (Jednatel společnosti)
[WebScraper] Final: 10 contacts (2 personal, 0 person-associated generic, 7 names only, 1 unassociated generic)
[Waterfall] Found 10 contacts via web scrape for jtm-partners.cz
[Waterfall] Attempting to recover emails for 7 contacts without emails
[Waterfall] First-name-only contact: "Tomáš" - trying pattern generation for jtm-partners.cz
[Hunter] Domain pattern for jtm-partners.cz: {last}
[Waterfall] Generated email for first-name "Tomáš": tomas@jtm-partners.cz (confidence: 15, UNVERIFIED GUESS)
[Waterfall] First-name-only contact: "Jakub" - trying pattern generation for jtm-partners.cz
[Hunter] Domain pattern for jtm-partners.cz: {last}
[Waterfall] Generated email for first-name "Jakub": jakub@jtm-partners.cz (confidence: 15, UNVERIFIED GUESS)
[Hunter] Email finder error for Petr J.@jtm-partners.cz: Last name cannot only be made up of single letters
[Waterfall] First-name-only contact: "Adam" - trying pattern generation for jtm-partners.cz
[Hunter] Domain pattern for jtm-partners.cz: {last}
[Waterfall] Generated email for first-name "Adam": adam@jtm-partners.cz (confidence: 15, UNVERIFIED GUESS)
[Hunter] Email finder error for Petr B.@jtm-partners.cz: Last name cannot only be made up of single letters
[Waterfall] First-name-only contact: "Dejv" - trying pattern generation for jtm-partners.cz
[Hunter] Domain pattern for jtm-partners.cz: {last}
[Waterfall] Generated email for first-name "Dejv": dejv@jtm-partners.cz (confidence: 15, UNVERIFIED GUESS)
[Waterfall] First-name-only contact: "Karolína" - trying pattern generation for jtm-partners.cz
[Hunter] Domain pattern for jtm-partners.cz: {last}
[Waterfall] Generated email for first-name "Karolína": karolina@jtm-partners.cz (confidence: 15, UNVERIFIED GUESS)
[Waterfall] Recovered 5 emails via Hunter email-finder
  Source: web_scrape
  Pages scraped: 3
  Contacts: 10 total (2 real, 0 hunter, 5 fabricated, 1 generic, 2 name-only)
  Hunter: domain-search=false, dm-search=false, email-finder=true
  Hunter reason: web_scrape_found_contacts
  Email recovery: checked:7 recovered:5 patterns:0 fnPatterns:5
    → [real_scraped] Jakub (Jednatel společnosti) — dolezal@jtm-partners.cz conf:50
    → [real_scraped] Tomáš (Jednatel společnosti) — koblizek@jtm-partners.cz conf:50
    → [pattern_fabricated] Tomáš (Zakladatel) — tomas@jtm-partners.cz conf:15
    → [pattern_fabricated] Jakub (Zakladatel) — jakub@jtm-partners.cz conf:15
    → [name_only] Petr (Závozník) — (no email) conf:50
    → [pattern_fabricated] Adam (Stavbyvedoucí) — adam@jtm-partners.cz conf:15
    → [name_only] Petr (Závozník) — (no email) conf:50
    → [pattern_fabricated] Dejv (Závozník) — dejv@jtm-partners.cz conf:15
    → [pattern_fabricated] Karolína  — karolina@jtm-partners.cz conf:15
    → [generic] General (Company Email) — info@jtm-partners.cz conf:50
  Waiting 5s...

[10/20] Holkin, s.r.o.
  Website: http://www.holkin.cz/
  Domain: holkin.cz
[WebScraper] Starting scrape for: holkin.cz
[Firecrawl] Mapping domain: holkin.cz (http)
[Firecrawl] Mapped 2 URLs from holkin.cz
[WebScraper] Filtered hallucinated URL: https://holkin.cz/tým (not in 2 discovered URLs)
[WebScraper] Filtered hallucinated URL: https://holkin.cz/o-nás (not in 2 discovered URLs)
[WebScraper] Filtered hallucinated URL: https://holkin.cz/kontakt (not in 2 discovered URLs)
[WebScraper] Filtered 3 hallucinated URLs, 0 remain
[WebScraper] AI ranked 0 pages: []
[WebScraper] No team/about/contact pages found, falling back to homepage for holkin.cz
[WebScraper] Scraping page 1/1: HOMEPAGE - https://holkin.cz
[Firecrawl] Scraping: https://holkin.cz
[Firecrawl] Short HTML (490 chars), retrying with www: https://www.holkin.cz
[Firecrawl] www retry got 68952 chars
[Firecrawl] Success: https://holkin.cz (68952 chars)
[WebScraper] Found 1 contacts from HOMEPAGE page
[WebScraper] Decision-maker found: Robert Holkovič (Jednatel)
[WebScraper] Final: 1 contacts (1 personal, 0 person-associated generic, 0 names only, 0 unassociated generic)
[Waterfall] Found 1 contacts via web scrape for holkin.cz
  Source: web_scrape
  Pages scraped: 1
  Contacts: 1 total (1 real, 0 hunter, 0 fabricated, 0 generic, 0 name-only)
  Hunter: domain-search=false, dm-search=false, email-finder=false
  Hunter reason: web_scrape_found_contacts
    → [real_scraped] Robert (Jednatel) — holkovic@holkin.cz conf:50
  Waiting 5s...

[11/20] Daluma s.r.o.
  Website: https://www.daluma.cz/
  Domain: daluma.cz
[WebScraper] Starting scrape for: daluma.cz
[Firecrawl] Mapping domain: daluma.cz (https)
[Firecrawl] Mapped 78 URLs from daluma.cz
[WebScraper] AI ranked 3 pages: [
  'CONTACT: https://daluma.cz/en/contact',
  'ABOUT: https://daluma.cz/en/about-us',
  'ABOUT: https://daluma.cz/o-nas'
]
[WebScraper] Scraping page 1/3: CONTACT - https://daluma.cz/en/contact
[Firecrawl] Scraping: https://daluma.cz/en/contact
[Firecrawl] Success: https://daluma.cz/en/contact (92698 chars)
[WebScraper] Found 0 contacts from CONTACT page
[WebScraper] Scraping page 2/3: ABOUT - https://daluma.cz/en/about-us
[Firecrawl] Scraping: https://daluma.cz/en/about-us
[Firecrawl] Success: https://daluma.cz/en/about-us (31420 chars)
[WebScraper] Found 3 contacts from ABOUT page
[WebScraper] Scraping page 3/3: ABOUT - https://daluma.cz/o-nas
[Firecrawl] Scraping: https://daluma.cz/o-nas
[Firecrawl] Success: https://daluma.cz/o-nas (31420 chars)
[WebScraper] Found 3 contacts from ABOUT page
[WebScraper] No personal contacts from Firecrawl, trying raw HTTP fetch of homepage
[WebScraper] Raw fetch success: https://daluma.cz/ (583280 chars)
[WebScraper] Trying raw HTTP fetch of contact page: https://daluma.cz/kontakt
[WebScraper] Trying raw HTTP fetch of contact page: https://development.daluma.cz/kontakt
[WebScraper] Merged 3 contacts across pages
[WebScraper] Final: 4 contacts (0 personal, 0 person-associated generic, 3 names only, 1 unassociated generic)
[Waterfall] Found 4 contacts via web scrape for daluma.cz
[Waterfall] Attempting to recover emails for 3 contacts without emails
[Hunter] Found email for David Mach: david.mach@daluma.cz (confidence: 95%)
[Waterfall] Recovered email for David Mach: david.mach@daluma.cz
[Hunter] Found email for Matěj Mach: matej.mach@daluma.cz (confidence: 95%)
[Waterfall] Recovered email for Matěj Mach: matej.mach@daluma.cz
[Waterfall] Recovered 2 emails via Hunter email-finder
  Source: web_scrape
  Pages scraped: 6
  Contacts: 4 total (0 real, 2 hunter, 0 fabricated, 1 generic, 1 name-only)
  Hunter: domain-search=false, dm-search=false, email-finder=true
  Hunter reason: web_scrape_found_contacts
  Email recovery: checked:3 recovered:2 patterns:0 fnPatterns:0
    → [hunter_found] David (Commerce and Strategy) — david.mach@daluma.cz conf:95
    → [name_only] Lukáš (Commerce, Purchasing and Production Control) — (no email) conf:50
    → [hunter_found] Matěj (Commerce and Finance) — matej.mach@daluma.cz conf:95
    → [generic] General (Company Email) — info@daluma.cz conf:50
  Waiting 5s...

[12/20] LLENTAB, spol. s r.o.
  Website: https://www.llentab.cz/
  Domain: llentab.cz
[WebScraper] Starting scrape for: llentab.cz
[Firecrawl] Mapping domain: llentab.cz (https)
[Firecrawl] Mapped 100 URLs from llentab.cz
[WebScraper] AI ranked 3 pages: [
  'ABOUT: https://www.llentab.cz/llentab',
  'ABOUT: https://www.llentab.cz/llentab/mezinarodni-pusobnost',
  'ABOUT: https://llentab.cz'
]
[WebScraper] Added CONTACT page: https://www.llentab.cz/kontakty (bonus scrape)
[WebScraper] Scraping page 1/4: ABOUT - https://www.llentab.cz/llentab
[Firecrawl] Scraping: https://www.llentab.cz/llentab
[Firecrawl] Success: https://www.llentab.cz/llentab (57840 chars)
[WebScraper] Found 0 contacts from ABOUT page
[WebScraper] Scraping page 2/4: ABOUT - https://www.llentab.cz/llentab/mezinarodni-pusobnost
[Firecrawl] Scraping: https://www.llentab.cz/llentab/mezinarodni-pusobnost
[Firecrawl] Success: https://www.llentab.cz/llentab/mezinarodni-pusobnost (48401 chars)
[WebScraper] Found 0 contacts from ABOUT page
[WebScraper] Scraping page 3/4: ABOUT - https://llentab.cz
[Firecrawl] Scraping: https://llentab.cz
[Firecrawl] Success: https://llentab.cz (98244 chars)
[WebScraper] Found 0 contacts from ABOUT page
[WebScraper] Scraping page 4/4: CONTACT - https://www.llentab.cz/kontakty
[Firecrawl] Scraping: https://www.llentab.cz/kontakty
[Firecrawl] Success: https://www.llentab.cz/kontakty (50577 chars)
[WebScraper] Found 1 additional emails: frame-c1746742d8908997289a2e4d57edffd3@mhtml.blink
[WebScraper] Found 7 contacts from CONTACT page
[WebScraper] Decision-maker found: Radek Těšík (Jednatel společnosti)
[WebScraper] Final: 8 contacts (7 personal, 0 person-associated generic, 0 names only, 1 unassociated generic)
[Waterfall] Found 8 contacts via web scrape for llentab.cz
  Source: web_scrape
  Pages scraped: 4
  Contacts: 8 total (7 real, 0 hunter, 0 fabricated, 1 generic, 0 name-only)
  Hunter: domain-search=false, dm-search=false, email-finder=false
  Hunter reason: web_scrape_found_contacts
    → [real_scraped] Radek (Jednatel společnosti) — radek.tesik@llentab.cz conf:50
    → [real_scraped] Jan (Technický ředitel) — jan.pechac@llentab.cz conf:50
    → [real_scraped] Jana (vedoucí oddělení Finance) — jana.koucka@llentab.cz conf:50
    → [real_scraped] Jaroslav (Vedoucí oddělení Projekce) — jaroslav.kosinka@llentab.cz conf:50
    → [real_scraped] Renata (Manažer logistiky) — renata.maskova@llentab.cz conf:50
    → [real_scraped] Markéta (Personalista / HR Business Partner) — marketa.brabcova@llentab.cz conf:50
    → [real_scraped] Frame  — frame-c1746742d8908997289a2e4d57edffd3@mhtml.blink conf:50
    → [generic] General (Company Email) — info@llentab.cz conf:50
  Waiting 5s...

[13/20] MORIS construction
  Website: https://www.moris-construction.cz/
  Domain: moris-construction.cz
[WebScraper] Starting scrape for: moris-construction.cz
[Firecrawl] Mapping domain: moris-construction.cz (https)
[Firecrawl] Mapped 80 URLs from moris-construction.cz
[WebScraper] AI ranked 3 pages: [
  'CONTACT: https://moris-construction.cz/kontakty',
  'ABOUT: https://moris-construction.cz/o-nas',
  'CONTACT: https://moris-construction.cz/kontakty-2'
]
[WebScraper] Scraping page 1/3: CONTACT - https://moris-construction.cz/kontakty
[Firecrawl] Scraping: https://moris-construction.cz/kontakty
[Firecrawl] Success: https://moris-construction.cz/kontakty (145798 chars)
[WebScraper] Found 3 additional emails: stavby@moris.cz, marian.stastny@moris.cz, tmp@aceit.cz
[WebScraper] Found 5 contacts from CONTACT page
[WebScraper] Scraping page 2/3: ABOUT - https://moris-construction.cz/o-nas
[Firecrawl] Scraping: https://moris-construction.cz/o-nas
[Firecrawl] Success: https://moris-construction.cz/o-nas (11187 chars)
[WebScraper] Found 1 contacts from ABOUT page
[WebScraper] Scraping page 3/3: CONTACT - https://moris-construction.cz/kontakty-2
[Firecrawl] Scraping: https://moris-construction.cz/kontakty-2
[Firecrawl] Success: https://moris-construction.cz/kontakty-2 (4636 chars)
[WebScraper] Found 0 contacts from CONTACT page
[WebScraper] Merged 1 contacts across pages
[WebScraper] Decision-maker found: Adam Klofáč (Obchod)
[WebScraper] Final: 5 contacts (5 personal, 0 person-associated generic, 0 names only, 0 unassociated generic)
[Waterfall] Found 5 contacts via web scrape for moris-construction.cz
  Source: web_scrape
  Pages scraped: 3
  Contacts: 5 total (5 real, 0 hunter, 0 fabricated, 0 generic, 0 name-only)
  Hunter: domain-search=false, dm-search=false, email-finder=false
  Hunter reason: web_scrape_found_contacts
    → [real_scraped] Adam (Obchod) — adam.klofac@moris.cz conf:50
    → [real_scraped] Dominika (Personální oddělení) — dominika.martonova@moris.cz conf:50
    → [real_scraped] Unknown  — stavby@moris.cz conf:50
    → [real_scraped] Marian (Ředitel divize construction) — marian.stastny@moris.cz conf:50
    → [real_scraped] Unknown  — tmp@aceit.cz conf:50
  Waiting 5s...

[14/20] DEVPRO, s.r.o.
  Website: http://www.devpro.cz/
  Domain: devpro.cz
[WebScraper] Starting scrape for: devpro.cz
[Firecrawl] Mapping domain: devpro.cz (http)
[Firecrawl] Mapped 23 URLs from devpro.cz
[WebScraper] AI ranked 3 pages: [
  'ABOUT: https://devpro.cz',
  'ABOUT: https://devpro.cz/dev-pro',
  'TEAM: https://devpro.cz/wp-sitemap-users-1.xml'
]
[WebScraper] Scraping page 1/3: ABOUT - https://devpro.cz
[Firecrawl] Scraping: https://devpro.cz
[Firecrawl] Success: https://devpro.cz (24132 chars)
[WebScraper] Found 0 contacts from ABOUT page
[WebScraper] Scraping page 2/3: ABOUT - https://devpro.cz/dev-pro
[Firecrawl] Scraping: https://devpro.cz/dev-pro
[Firecrawl] Success: https://devpro.cz/dev-pro (10820 chars)
[WebScraper] Found 0 contacts from ABOUT page
[WebScraper] Scraping page 3/3: TEAM - https://devpro.cz/wp-sitemap-users-1.xml
[Firecrawl] Scraping: https://devpro.cz/wp-sitemap-users-1.xml
[Firecrawl] Short HTML (273 chars), retrying with www: https://www.devpro.cz/wp-sitemap-users-1.xml
[Firecrawl] Success: https://devpro.cz/wp-sitemap-users-1.xml (273 chars)
[WebScraper] Found 0 contacts from TEAM page
[WebScraper] No personal contacts from Firecrawl, trying raw HTTP fetch of homepage
[WebScraper] Raw fetch success: http://devpro.cz/ (63129 chars)
[WebScraper] Final: 1 contacts (0 personal, 0 person-associated generic, 0 names only, 1 unassociated generic)
[Waterfall] Found 1 contacts via web scrape for devpro.cz
[Waterfall] No real personal emails found - searching Hunter for decision-makers at devpro.cz
  Source: web_scrape
  Pages scraped: 4
  Contacts: 1 total (0 real, 0 hunter, 0 fabricated, 1 generic, 0 name-only)
  Hunter: domain-search=false, dm-search=true, email-finder=false
    → [generic] General (Company Email) — info@devpro.cz conf:50

[15/20] Stavební firma HEKO group s.r.o.
  Website: http://www.heko-group.cz/
  Domain: heko-group.cz
[WebScraper] Starting scrape for: heko-group.cz
[Firecrawl] Mapping domain: heko-group.cz (http)
[Firecrawl] Mapped 100 URLs from heko-group.cz
[WebScraper] AI ranked 3 pages: [
  'TEAM: https://www.heko-group.cz/team',
  'ABOUT: https://www.heko-group.cz/o-nas',
  'CONTACT: https://www.heko-group.cz/kontakt'
]
[WebScraper] Scraping page 1/3: TEAM - https://www.heko-group.cz/team
[Firecrawl] Scraping: https://www.heko-group.cz/team
[Firecrawl] Success: https://www.heko-group.cz/team (14835 chars)
[WebScraper] Found 7 contacts from TEAM page
[WebScraper] Scraping page 2/3: ABOUT - https://www.heko-group.cz/o-nas
[Firecrawl] Scraping: https://www.heko-group.cz/o-nas
[Firecrawl] Success: https://www.heko-group.cz/o-nas (34659 chars)
[WebScraper] Found 2 contacts from ABOUT page
[WebScraper] Scraping page 3/3: CONTACT - https://www.heko-group.cz/kontakt
[Firecrawl] Scraping: https://www.heko-group.cz/kontakt
[Firecrawl] Success: https://www.heko-group.cz/kontakt (46391 chars)
[WebScraper] Found 2 additional emails: frame-3bd69450556b652c2a532e7eef3d6cf5@mhtml.blink, priklad@email.cz
[WebScraper] Found 9 contacts from CONTACT page
[WebScraper] Merged 9 contacts across pages
[WebScraper] Decision-maker found: Mgr. Jakub Kosák (Jednatel - příprava zakázek)
[WebScraper] Final: 9 contacts (9 personal, 0 person-associated generic, 0 names only, 0 unassociated generic)
[Waterfall] Found 9 contacts via web scrape for heko-group.cz
  Source: web_scrape
  Pages scraped: 3
  Contacts: 9 total (9 real, 0 hunter, 0 fabricated, 0 generic, 0 name-only)
  Hunter: domain-search=false, dm-search=false, email-finder=false
  Hunter reason: web_scrape_found_contacts
    → [real_scraped] Mgr. (Jednatel - příprava zakázek) — kosak@heko-group.cz conf:50
    → [real_scraped] Ing. (Jednatel - realizace zakázek) — herold@heko-group.cz conf:50
    → [real_scraped] Karel (Jednatel - elektroinstalace) — slama@heko-group.cz conf:50
    → [real_scraped] Veronika (Administrativa, fakturace) — koukalova@heko-group.cz conf:50
    → [real_scraped] David (Příprava staveb) — cap@heko-group.cz conf:50
    → [real_scraped] Michal (Revizní technik - elektroinstalace) — krotil@heko-group.cz conf:50
    → [real_scraped] Petr (Instalatérství, topenářství) — huml@heko-group.cz conf:50
    → [real_scraped] Frame  — frame-3bd69450556b652c2a532e7eef3d6cf5@mhtml.blink conf:50
    → [real_scraped] Unknown  — priklad@email.cz conf:50
  Waiting 5s...

[16/20] Rekomont a.s.
  Website: http://www.rekomont.cz/
  Domain: rekomont.cz
[WebScraper] Starting scrape for: rekomont.cz
[Firecrawl] Mapping domain: rekomont.cz (http)
[Firecrawl] Mapped 100 URLs from rekomont.cz
[WebScraper] AI ranked 2 pages: [
  'CONTACT: https://www.rekomont.cz/kontakt',
  'ABOUT: https://www.rekomont.cz'
]
[WebScraper] Scraping page 1/2: CONTACT - https://www.rekomont.cz/kontakt
[Firecrawl] Scraping: https://www.rekomont.cz/kontakt
[Firecrawl] Success: https://www.rekomont.cz/kontakt (30432 chars)
[WebScraper] Found 8 contacts from CONTACT page
[WebScraper] Scraping page 2/2: ABOUT - https://www.rekomont.cz
[Firecrawl] Scraping: https://www.rekomont.cz
[Firecrawl] Success: https://www.rekomont.cz (22883 chars)
[WebScraper] Found 0 contacts from ABOUT page
[WebScraper] Decision-maker found: Domažlický Vladko (Předseda představenstva)
[WebScraper] Final: 8 contacts (8 personal, 0 person-associated generic, 0 names only, 0 unassociated generic)
[Waterfall] Found 8 contacts via web scrape for rekomont.cz
  Source: web_scrape
  Pages scraped: 2
  Contacts: 8 total (8 real, 0 hunter, 0 fabricated, 0 generic, 0 name-only)
  Hunter: domain-search=false, dm-search=false, email-finder=false
  Hunter reason: web_scrape_found_contacts
    → [real_scraped] Domažlický (Předseda představenstva) — domazlicky@rekomont.cz conf:50
    → [real_scraped] Ing. (Výrobní ředitel) — krejcir@rekomont.cz conf:50
    → [real_scraped] Ing. (Ekonomický ředitel) — loula@rekomont.cz conf:50
    → [real_scraped] Ing. (Obchodně technická ředitelka) — domazlicka@rekomont.cz conf:50
    → [real_scraped] Mgr. (Marketingová ředitelka) — janouskova@rekomont.cz conf:50
    → [real_scraped] Nováková (Vedoucí MTZ) — novakova@rekomont.cz conf:50
    → [real_scraped] Ing. (Vedoucí dopravy a mechanizace) — formanek@rekomont.cz conf:50
    → [real_scraped] Malík (Zmocněnec pro kvalitu) — malik@rekomont.cz conf:50
  Waiting 5s...

[17/20] REINBAU s.r.o.
  Website: https://reinbau.cz/
  Domain: reinbau.cz
[WebScraper] Starting scrape for: reinbau.cz
[Firecrawl] Mapping domain: reinbau.cz (https)
[Firecrawl] Mapped 4 URLs from reinbau.cz
[WebScraper] AI ranked 1 pages: [ 'ABOUT: https://reinbau.cz' ]
[WebScraper] Scraping page 1/1: ABOUT - https://reinbau.cz
[Firecrawl] Scraping: https://reinbau.cz
[Firecrawl] Success: https://reinbau.cz (24610 chars)
[WebScraper] Found 0 contacts from ABOUT page
[WebScraper] No personal contacts from Firecrawl, trying raw HTTP fetch of homepage
[WebScraper] Raw fetch success: https://reinbau.cz/ (79115 chars)
[WebScraper] Final: 1 contacts (0 personal, 0 person-associated generic, 0 names only, 1 unassociated generic)
[Waterfall] Found 1 contacts via web scrape for reinbau.cz
[Waterfall] No real personal emails found - searching Hunter for decision-makers at reinbau.cz
  Source: web_scrape
  Pages scraped: 2
  Contacts: 1 total (0 real, 0 hunter, 0 fabricated, 1 generic, 0 name-only)
  Hunter: domain-search=false, dm-search=true, email-finder=false
    → [generic] General (Company Email) — info@reinbau.cz conf:50
  Waiting 5s...

[18/20] Northtech s.r.o.
  Website: http://www.northtech.cz/
  Domain: northtech.cz
[WebScraper] Starting scrape for: northtech.cz
[Firecrawl] Mapping domain: northtech.cz (http)
[Firecrawl] Mapped 37 URLs from northtech.cz
[WebScraper] AI ranked 3 pages: [
  'ABOUT: https://northtech.cz/o-nas',
  'ABOUT: https://northtech.cz',
  'CONTACT: https://northtech.cz/reference'
]
[WebScraper] Scraping page 1/3: ABOUT - https://northtech.cz/o-nas
[Firecrawl] Scraping: https://northtech.cz/o-nas
[Firecrawl] Success: https://northtech.cz/o-nas (34368 chars)
[WebScraper] Found 2 contacts from ABOUT page
[WebScraper] Scraping page 2/3: ABOUT - https://northtech.cz
[Firecrawl] Scraping: https://northtech.cz
[Firecrawl] Success: https://northtech.cz (55626 chars)
[WebScraper] Found 0 contacts from ABOUT page
[WebScraper] Scraping page 3/3: CONTACT - https://northtech.cz/reference
[Firecrawl] Scraping: https://northtech.cz/reference
[Firecrawl] Success: https://northtech.cz/reference (39969 chars)
[WebScraper] Found 0 contacts from CONTACT page
[WebScraper] No personal contacts from Firecrawl, trying raw HTTP fetch of homepage
[WebScraper] Raw fetch success: http://northtech.cz/ (91782 chars)
[WebScraper] Raw fetch found 1 contacts!
[WebScraper] Decision-maker found: Magda Nakládalová (jednatelka společnosti)
[WebScraper] Final: 4 contacts (0 personal, 0 person-associated generic, 3 names only, 1 unassociated generic)
[Waterfall] Found 4 contacts via web scrape for northtech.cz
[Waterfall] Attempting to recover emails for 3 contacts without emails
[Waterfall] First-name-only contact: "northtech@northtech.cz" - trying pattern generation for northtech.cz
[Hunter] Domain pattern for northtech.cz: none found
[Waterfall] Generated email for first-name "northtech@northtech.cz": northtechnorthtechcz@northtech.cz (confidence: 10, UNVERIFIED GUESS)
[Waterfall] Recovered 1 emails via Hunter email-finder
[Waterfall] No real personal emails found - searching Hunter for decision-makers at northtech.cz
  Source: web_scrape
  Pages scraped: 4
  Contacts: 4 total (0 real, 0 hunter, 1 fabricated, 1 generic, 2 name-only)
  Hunter: domain-search=false, dm-search=true, email-finder=true
  Email recovery: checked:3 recovered:1 patterns:0 fnPatterns:1
    → [name_only] Magda (jednatelka společnosti) — (no email) conf:50
    → [name_only] Leoš (autorizovaný inženýr v oboru pozemní stavby) — (no email) conf:50
    → [pattern_fabricated] northtech@northtech.cz  — northtechnorthtechcz@northtech.cz conf:10
    → [generic] General (Company Email) — kariera@firma.seznam.cz conf:50
  Waiting 5s...

[19/20] PREFA Aluminiumprodukte Ltd. - Roof Systems
  Website: https://cz.prefa.com/
  Domain: cz.prefa.com
[WebScraper] Starting scrape for: cz.prefa.com
[Firecrawl] Mapping domain: cz.prefa.com (https)
[Firecrawl] Mapped 100 URLs from cz.prefa.com
[WebScraper] AI ranked 3 pages: [
  'CONTACT: https://cz.prefa.com/kontakt/kontakty-prefa-team',
  'ABOUT: https://cz.prefa.com/prefa-rodinny-podnik/o-nas',
  'CONTACT: https://cz.prefa.com/kontakt'
]
[WebScraper] Scraping page 1/3: CONTACT - https://cz.prefa.com/kontakt/kontakty-prefa-team
[Firecrawl] Scraping: https://cz.prefa.com/kontakt/kontakty-prefa-team
[Firecrawl] Success: https://cz.prefa.com/kontakt/kontakty-prefa-team (133805 chars)
[WebScraper] Found 2 additional emails: zakaznickyservis@prefa.com, ludek.holstein@prefa.com
[WebScraper] Found 17 contacts from CONTACT page
[WebScraper] Scraping page 2/3: ABOUT - https://cz.prefa.com/prefa-rodinny-podnik/o-nas
[Firecrawl] Scraping: https://cz.prefa.com/prefa-rodinny-podnik/o-nas
[Firecrawl] Success: https://cz.prefa.com/prefa-rodinny-podnik/o-nas (52362 chars)
[WebScraper] Found 1 additional emails: zakaznickyservis@prefa.com
[WebScraper] Found 3 contacts from ABOUT page
[WebScraper] Scraping page 3/3: CONTACT - https://cz.prefa.com/kontakt
[Firecrawl] Scraping: https://cz.prefa.com/kontakt
[Firecrawl] Success: https://cz.prefa.com/kontakt (39433 chars)
[WebScraper] Found 1 additional emails: zakaznickyservis@prefa.com
[WebScraper] Found 1 contacts from CONTACT page
[WebScraper] Merged 2 contacts across pages
[WebScraper] Decision-maker found: Karin Alexandrová (vedoucí marketingu)
[WebScraper] Final: 19 contacts (17 personal, 0 person-associated generic, 2 names only, 0 unassociated generic)
[Waterfall] Found 19 contacts via web scrape for cz.prefa.com
[Waterfall] Attempting to recover emails for 2 contacts without emails
[Waterfall] First-name-only contact: "Pasquali" - trying pattern generation for cz.prefa.com
[Hunter] Domain pattern for cz.prefa.com: none found
[Waterfall] Generated email for first-name "Pasquali": pasquali@cz.prefa.com (confidence: 10, UNVERIFIED GUESS)
[Waterfall] Recovered 1 emails via Hunter email-finder
  Source: web_scrape
  Pages scraped: 3
  Contacts: 19 total (17 real, 0 hunter, 1 fabricated, 0 generic, 1 name-only)
  Hunter: domain-search=false, dm-search=false, email-finder=true
  Hunter reason: web_scrape_found_contacts
  Email recovery: checked:2 recovered:1 patterns:0 fnPatterns:1
    → [real_scraped] Karin (vedoucí marketingu) — karin.alexandrova@prefa.com conf:50
    → [real_scraped] Aleš (prokurista) — ales.slivka@prefa.com conf:50
    → [real_scraped] Josef (školitel) — josef.albl@prefa.com conf:50
    → [real_scraped] Ondřej (on-line marketing) — ondrej.louda@prefa.com conf:50
    → [real_scraped] Kateřina (zákaznický servis) — katerina.paleckova@prefa.com conf:50
    → [real_scraped] Radka (zákaznický servis) — radka.hejclova@prefa.com conf:50
    → [real_scraped] Luděk (technické výpočty a cenové nabídky) — vypocty@prefa.com conf:50
    → [real_scraped] Šárka  — sarka.moravcova@prefa.com conf:50
    → [real_scraped] Denisa  — denisa.pazourova@prefa.com conf:50
    → [real_scraped] Hana  — hana.vohankova@prefa.com conf:50
    → [real_scraped] Monika  — monika.weisgarberova@prefa.com conf:50
    → [real_scraped] Dáša  — dasa.schejbalova@prefa.com conf:50
    → [real_scraped] Eva (controlling) — eva.barvova@prefa.com conf:50
    → [real_scraped] Unknown  — zakaznickyservis@prefa.com conf:50
    → [real_scraped] Luděk (technické výpočty a cenové nabídky) — vypocty@prefa.com conf:50
    → [real_scraped] Martina (technické výpočty a cenové nabídky) — vypocty@prefa.com conf:50
    → [real_scraped] Václav (technické výpočty a cenové nabídky) — vypocty@prefa.com conf:50
    → [name_only] Cornelius (majitel) — (no email) conf:50
    → [pattern_fabricated] Pasquali (vedení společnosti) — pasquali@cz.prefa.com conf:10
  Waiting 5s...

[20/20] AZ EKOTHERM s.r.o.
  Website: http://azeko.cz/
  Domain: azeko.cz
[WebScraper] Starting scrape for: azeko.cz
[Firecrawl] Mapping domain: azeko.cz (http)
[Firecrawl] Mapped 100 URLs from azeko.cz
[WebScraper] AI ranked 3 pages: [
  'CONTACT: https://www.azeko.cz/kontakt',
  'CONTACT: https://www.azeko.cz/contact',
  'CONTACT: https://www.azeko.cz/kontakt-1'
]
[WebScraper] Scraping page 1/3: CONTACT - https://www.azeko.cz/kontakt
[Firecrawl] Scraping: https://www.azeko.cz/kontakt
[Firecrawl] Success: https://www.azeko.cz/kontakt (79943 chars)
[WebScraper] Found 3 additional emails: uhrineves@azeko.cz, zimni.zahrady@azeko.cz, hopo@azeko.cz
[WebScraper] Found 3 contacts from CONTACT page
[WebScraper] Scraping page 2/3: CONTACT - https://www.azeko.cz/contact
[Firecrawl] Scraping: https://www.azeko.cz/contact
[Firecrawl] Success: https://www.azeko.cz/contact (77911 chars)
[WebScraper] Found 0 contacts from CONTACT page
[WebScraper] Scraping page 3/3: CONTACT - https://www.azeko.cz/kontakt-1
[Firecrawl] Scraping: https://www.azeko.cz/kontakt-1
[Firecrawl] Success: https://www.azeko.cz/kontakt-1 (76896 chars)
[WebScraper] Found 0 contacts from CONTACT page
[WebScraper] Final: 4 contacts (3 personal, 0 person-associated generic, 0 names only, 1 unassociated generic)
[Waterfall] Found 4 contacts via web scrape for azeko.cz
  Source: web_scrape
  Pages scraped: 3
  Contacts: 4 total (3 real, 0 hunter, 0 fabricated, 1 generic, 0 name-only)
  Hunter: domain-search=false, dm-search=false, email-finder=false
  Hunter reason: unknown
    → [real_scraped] Unknown  — uhrineves@azeko.cz conf:50
    → [real_scraped] Zimni  — zimni.zahrady@azeko.cz conf:50
    → [real_scraped] Unknown  — hopo@azeko.cz conf:50
    → [generic] General (Company Email) — info@azeko.cz conf:50


╔══════════════════════════════════════════════════════════╗
║                    RESULTS TABLE                        ║
╚══════════════════════════════════════════════════════════╝
| # | Company | Domain | Pages | Contacts | Real | Hunter | Fabricated | Generic | Names Only | Hunter Called? | Why Not? |
|---|---------|--------|-------|----------|------|--------|------------|---------|------------|----------------|----------|
| 1 | kefa | kefa.cz | 0 | 1 | 0 | 0 | 0 | 1 | 0 | YES |  |
| 2 | Fox Hunter | foxhunter.cz | 0 | 5 | 4 | 0 | 0 | 1 | 0 | YES |  |
| 3 | GROSS spol. s r.o.- zemní a vý | gross-spol.cz | 2 | 2 | 2 | 0 | 0 | 0 | 0 | NO | web_scrape_found_contacts |
| 4 | Revis - Praha spol. s r.o. | revis.cz | 3 | 2 | 1 | 0 | 0 | 1 | 0 | NO | unknown |
| 5 | RK STAVBA | rkstavba.cz | 3 | 2 | 1 | 0 | 0 | 0 | 1 | NO | web_scrape_found_contacts |
| 6 | Stavby a zahrady Zelené údolí | zahrady-zeleneudoli.cz | 2 | 3 | 2 | 0 | 0 | 1 | 0 | NO | unknown |
| 7 | Absolut estate s.r.o. | absolut-estate.cz | 3 | 4 | 2 | 0 | 0 | 2 | 0 | NO | web_scrape_found_contacts |
| 8 | BLESK - stavební řemesla s.r.o | fablesk.cz | 3 | 2 | 1 | 0 | 0 | 1 | 0 | NO | web_scrape_found_contacts |
| 9 | JTM Partners s.r.o. | jtm-partners.cz | 3 | 10 | 2 | 0 | 5 | 1 | 2 | finder only | web_scrape_found_contacts |
| 10 | Holkin, s.r.o. | holkin.cz | 1 | 1 | 1 | 0 | 0 | 0 | 0 | NO | web_scrape_found_contacts |
| 11 | Daluma s.r.o. | daluma.cz | 6 | 4 | 0 | 2 | 0 | 1 | 1 | finder only | web_scrape_found_contacts |
| 12 | LLENTAB, spol. s r.o. | llentab.cz | 4 | 8 | 7 | 0 | 0 | 1 | 0 | NO | web_scrape_found_contacts |
| 13 | MORIS construction | moris-construction.cz | 3 | 5 | 5 | 0 | 0 | 0 | 0 | NO | web_scrape_found_contacts |
| 14 | DEVPRO, s.r.o. | devpro.cz | 4 | 1 | 0 | 0 | 0 | 1 | 0 | YES |  |
| 15 | Stavební firma HEKO group s.r. | heko-group.cz | 3 | 9 | 9 | 0 | 0 | 0 | 0 | NO | web_scrape_found_contacts |
| 16 | Rekomont a.s. | rekomont.cz | 2 | 8 | 8 | 0 | 0 | 0 | 0 | NO | web_scrape_found_contacts |
| 17 | REINBAU s.r.o. | reinbau.cz | 2 | 1 | 0 | 0 | 0 | 1 | 0 | YES |  |
| 18 | Northtech s.r.o. | northtech.cz | 4 | 4 | 0 | 0 | 1 | 1 | 2 | YES |  |
| 19 | PREFA Aluminiumprodukte Ltd. - | cz.prefa.com | 3 | 19 | 17 | 0 | 1 | 0 | 1 | finder only | web_scrape_found_contacts |
| 20 | AZ EKOTHERM s.r.o. | azeko.cz | 3 | 4 | 3 | 0 | 0 | 1 | 0 | NO | unknown |

--- SUMMARY ---
Companies tested: 20
Companies with contacts: 20 (100%)
Companies with errors: 0

Total contacts found: 95
  Real (scraped from HTML): 65 (68%)
  Hunter-found: 2 (2%)
  FABRICATED (pattern guess): 7 (7%)
  Generic (info@, etc.): 14 (15%)
  Name-only (no email): 7 (7%)

Hunter domain-search fired: 2/20 companies
Hunter DM-search fired: 3/20 companies

*** FABRICATION RATE: 8% of emails are pattern-guesses ***
*** HUNTER DOMAIN-SEARCH RATE: 10% of companies ***
```

---

## Analysis of Key Metrics

### 1. Companies with at least 1 real email found via web scraping

**15 out of 20 companies** had at least one real (non-generic, non-fabricated) email found via web scraping.

The 5 that did NOT find real emails via scraping:
- kefa.cz — Firecrawl ECONNRESET on map; fell straight to Hunter domain-search
- foxhunter.cz — Firecrawl ECONNRESET on map; fell straight to Hunter domain-search
- devpro.cz — 4 pages scraped, zero personal contacts found; only info@devpro.cz
- reinbau.cz — 2 pages scraped, zero personal contacts; only info@reinbau.cz
- northtech.cz — 4 pages scraped, found names (Magda, Leoš) but no emails attached to them

Notable: daluma.cz scraped 6 pages and found 3 named contacts but zero personal emails from HTML. All real emails there (2) came from Hunter email-finder (conf:95).

### 2. Companies that triggered Hunter email-finder calls

**4 out of 20 companies** triggered Hunter email-finder:
- jtm-partners.cz — 7 contacts without emails; 5 recovered (all first-name-only pattern, conf:15)
- daluma.cz — 3 contacts without emails; 2 recovered via actual Hunter lookup (conf:95)
- northtech.cz — 3 contacts without emails; 1 recovered (nonsensical: northtechnorthtechcz@northtech.cz)
- cz.prefa.com — 2 contacts without emails; 1 recovered via first-name-only pattern (conf:10)

Hunter domain-search fired for 2 companies (kefa.cz, foxhunter.cz) due to Firecrawl failures.
Hunter DM-search fired for 3 companies (devpro.cz, reinbau.cz, northtech.cz) as fallback after zero personal contacts found.

### 3. Contacts with pattern_derived or first_name_pattern as email_source

**7 contacts** across 3 companies were pattern-fabricated (email_source = pattern_fabricated / first_name_pattern):

- jtm-partners.cz: 5 fabricated (Tomáš, Jakub, Adam, Dejv, Karolína) — all conf:15, pattern {last}, generated as first-name@domain
- northtech.cz: 1 fabricated (the contact name was "northtech@northtech.cz" which was treated as a first name — produced nonsensical northtechnorthtechcz@northtech.cz, conf:10)
- cz.prefa.com: 1 fabricated (Pasquali, conf:10 — no pattern found on domain so first-name@domain fallback used)

None of the 7 fabricated contacts used "pattern_derived" (full-name pattern match); all 7 used the "first_name_pattern" path where the system guesses first@domain when it only has a first name. The low confidence scores (10-15) flag these correctly as unverified.

### 4. Contacts with no email at all (name-only)

**7 contacts across 5 companies** ended up name-only (no email):

- rkstavba.cz: Jakub (vedoucí stavby) — 1 name-only
- jtm-partners.cz: 2x Petr (Závozník, Stavbyvedoucí) — 2 name-only; Hunter couldn't process single-letter surnames
- daluma.cz: Lukáš (Commerce, Purchasing and Production Control) — 1 name-only; Hunter finder didn't return a result
- northtech.cz: Magda (jednatelka), Leoš (autorizovaný inženýr) — 2 name-only; no Hunter result
- cz.prefa.com: Cornelius (majitel) — 1 name-only; Hunter tried but no result for this name

Total name-only rate: 7.4% of all 95 contacts.

### 5. Hunter domain-search fallback rate

**2 out of 20 companies (10%)** hit the Hunter domain-search path (not email-finder — the full domain scan):
- kefa.cz — triggered because Firecrawl gave ECONNRESET on URL mapping (website was not reachable)
- foxhunter.cz — same ECONNRESET failure

Both cases are due to Firecrawl connectivity failures, not a logic choice by the waterfall. The domain-search fallback is working as intended, but this means ~10% of the time the system burns Hunter credits on a domain scan because the scraper couldn't even reach the site.

### 6. Companies where homepage-first would have helped

**3 companies** where scraping the homepage first (or in addition to deeper pages) would have caught contacts that were missed:

**gross-spol.cz** — The AI found zero contacts from the Firecrawl-rendered homepage (69,682 chars), but the raw HTTP fetch of the same URL (13,044 chars) immediately found 2 contacts. This is the clearest example: the lightweight/raw-HTML version of the homepage had the data, but the JavaScript-rendered Firecrawl version either rendered it into something else or the email regex wasn't matching the rendered output. Homepage-first with raw HTTP would have saved a Firecrawl scrape call here.

**holkin.cz** — Similar situation: Firecrawl's map returned only 2 URLs, all AI-suggested sub-pages were hallucinations (filtered out), so it fell back to homepage. Firecrawl returned a short 490-char HTML and had to retry with www (got 68,952 chars). Only 1 page scraped, 1 real contact found. Homepage-first would have found the same result but more directly.

**northtech.cz** — Scraped 3 pages via Firecrawl, found 2 named contacts on /o-nas but no emails. The raw HTTP homepage fetch then found 1 additional contact (Magda Nakládalová, jednatelka). However the contact still had no email — the issue here isn't just homepage-first, but that the /o-nas page doesn't expose emails. Homepage-first might have caught the Magda contact earlier but would not have changed the final result.

### 7. Companies where pattern derivation before Hunter would have saved API credits

**2 situations** where calling Hunter's email-finder was either wasteful or created worse results than pattern derivation would have:

**jtm-partners.cz** — The domain email pattern from Hunter is `{last}` (i.e., lastname@jtm-partners.cz). For 5 first-name-only contacts (Tomáš, Jakub, Adam, Dejv, Karolína), the system correctly detected these were first-name-only and fell back to `first@domain` (e.g., tomas@jtm-partners.cz, conf:15). Each of these still made an API call to Hunter to fetch the domain pattern (5 API calls for the pattern lookup alone, plus separate calls for the Petr J. and Petr B. contacts which errored). If the domain pattern were cached after the first lookup, the subsequent 4 calls for the same `{last}` pattern would have been avoided. The pattern derivation itself is reasonable here, but the API call overhead is redundant.

**northtech.cz** — The system treated "northtech@northtech.cz" (an actual email address scraped from the raw homepage) as a contact's first name, then tried to fabricate an email from it: `northtechnorthtechcz@northtech.cz` (conf:10). This is a bug/anomaly: the scraper captured an email address but stored it as if it were a person's name. A pre-Hunter pattern check that validates whether the "first name" looks like an email address would have skipped the Hunter call entirely and saved an API credit.

---

## Anomalies and Interesting Patterns

**Firecrawl ECONNRESET on mapping (2 companies):** kefa.cz and foxhunter.cz both failed at the URL-mapping stage with `read ECONNRESET`. Both are small single-page sites. The system correctly fell back to Hunter domain-search, which returned useful data for foxhunter.cz (4 real emails, conf:78-82) but only a generic info@ for kefa.cz. This suggests the Hunter domain-search fallback is valuable when mapping fails.

**"Frame" email pollution (3 companies):** revis.cz, llentab.cz, and heko-group.cz all had a contact classified as `[real_scraped]` with emails like `frame-5b5591b2fca26216245de801cff2b5eb@mhtml.blink`. These are MHTML/Blink internal email addresses embedded in the Firecrawl output — not real emails. They are being captured as "real scraped" contacts. This is a data quality bug: the email regex or post-processing is not filtering out `.blink` domain emails.

**priklad@email.cz captured as real (heko-group.cz):** The contact page at heko-group.cz apparently contains a placeholder/example email "priklad@email.cz" (Czech for "example@email.cz") and it was scraped as a real contact email. This should be filtered as a known placeholder pattern.

**tmp@aceit.cz captured as real (moris-construction.cz):** A temporary or internal email from an unrelated domain (aceit.cz) was scraped from moris-construction.cz's contact page. This appears to be a developer artifact left in the page. The system correctly treats it as real_scraped, but it's not a valid outreach contact.

**daluma.cz — 6 pages scraped, zero real emails from HTML, 2 from Hunter at conf:95:** This is the best-case Hunter email-finder scenario. The website had named contacts (David Mach, Matěj Mach) with titles but no emails in the HTML. Hunter found both with 95% confidence. This is exactly the intended use of the email-finder fallback.

**PREFA — best overall result, 17 real scraped emails from one company:** cz.prefa.com has a dedicated team contact page with full name+email for 17 people. This is an outlier that inflates the "real scraped" total significantly. Without PREFA, the real scrape rate would be: (65-17)/76 = 63%.

**AZ EKOTHERM (azeko.cz) — 3 "real" emails are actually department aliases:** uhrineves@azeko.cz, zimni.zahrady@azeko.cz, and hopo@azeko.cz look like branch-office or department emails, not personal emails. They were found via "additional emails" in the raw HTML, classified as real_scraped but with "Unknown" as the name. These are borderline-generic contacts that happen to not match the generic pattern regex.

**Hunter reason "unknown" on 3 companies (revis.cz, zahrady-zeleneudoli.cz, azeko.cz):** These companies found contacts via web scrape but Hunter reason logged as "unknown" rather than "web_scrape_found_contacts". This is likely a code path where the Hunter-skip condition was met but the reason wasn't explicitly set. Minor logging bug.
