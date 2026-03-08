# Enrichment Test Results v2 — Improved Pipeline

**Date**: 2026-03-08T22:11:43.796Z
**Method**: Free web scraping (Firecrawl + Claude API) with LLM-based decision-maker detection
**Sample**: 20 Czech companies (marketing/PR/HR/creative agencies)
**Test Mode**: NEW companies only (SKIP_RESET=true)

---

## Summary

| Metric | Free Scraping Only |
|--------|--------------------|
| Companies tested | 20 |
| Companies with valid domains | 20 |
| Any contact found | 15 (75%) |
| Decision-maker found | 7 (35%) |
| Would need Hunter fallback | 5 (25%) |
| Emails MX-validated | 38/38 (100%) |
| Errors | 0 |

### Decision-Maker Detection Source

| Source | Count |
|--------|-------|
| Claude LLM | 0 |
| Regex fallback | 22 |
| Generic email fallbacks | 5 |

---

## Detailed Results

### Stratify Prague Studio
- **Domain**: stratify.cz
- **Status**: contacts_found
- **Segment**: Consulting
- **Industry**: Business Services
- **Size**: small
- **Contacts found**: 1
  - General Contact — Company Email — info@stratify.cz ✓ MX valid
- **Source**: web_scrape

### Groovio
- **Domain**: groovio.cz
- **Status**: contacts_found
- **Segment**: Creative Agency
- **Industry**: Marketing
- **Size**: small
- **Contacts found**: 7
  - Ondra Vazač — Designer & zakladatel — ondra@groovio.cz ✓ MX valid ⭐ DM (regex)
  - Unknown — Unknown role — no@email.cz ✓ MX valid
  - Gabriela Králová — Projektový manažer & UX specialista — no email
  - Václav Pojer — Kodér & designer — no email
  - Eva Poštulková — Grafický designer & DTP — no email
  - Katarína Tvrdá — Tisková specialistka a produkce — no email
  - Ondřej Vazač — zakladatel a art director — no email ⭐ DM (regex)
- **Source**: web_scrape

### Eventuality s.r.o
- **Domain**: eventuality.cz
- **Status**: no_contacts
- **Segment**: Brand Marketing
- **Industry**: Marketing
- **Size**: medium
- **IČO**: 27216535 (not validated)
- **HUNTER_FALLBACK_NEEDED**: Yes

### iMagency s.r.o.
- **Domain**: imagency.cz
- **Status**: contacts_found
- **Segment**: Performance Marketing
- **Industry**: Marketing
- **Size**: medium
- **Contacts found**: 1
  - General Contact — Company Email — sales@imagency.cz ✓ MX valid
- **Source**: web_scrape

### We Are Creators' LAB
- **Domain**: wearecreators.cz
- **Status**: contacts_found
- **Segment**: Creative Agency
- **Industry**: Marketing
- **Size**: small
- **Contacts found**: 1
  - Matej — Unknown role — matej@wearecreators.cz ✓ MX valid
- **Source**: web_scrape

### Jan Solta - Shop4Experience
- **Domain**: shop4experience.cz
- **Status**: contacts_found
- **Segment**: Consulting
- **Industry**: Marketing
- **Size**: small
- **Contacts found**: 1
  - Jan Šolta — trade, brand and design consultant, founder of Shop4Experience, Head of Retail Experience at Cocoon — solta@shop4experience.cz ✓ MX valid ⭐ DM (regex)
- **Source**: web_scrape

### Profi LED obrazovky
- **Domain**: profi-led-obrazovky.cz
- **Status**: contacts_found
- **Segment**: Brand Marketing
- **Industry**: Marketing
- **Size**: small
- **Contacts found**: 1
  - General Contact — Company Email — info@mega-led-poster.cz ✓ MX valid
- **Source**: web_scrape

### MARCO reklamní agentura, spol. s.r.o.
- **Domain**: marco.eu
- **Status**: contacts_found
- **Segment**: Brand Marketing
- **Industry**: Marketing
- **Size**: medium
- **IČO**: 60702265 (not validated)
- **Contacts found**: 13
  - Pavel Marek — Managing Director — pavel.marek@marco.eu ✓ MX valid ⭐ DM (regex)
  - Petr Marek — Executive Director — petr.marek@marco.eu ✓ MX valid ⭐ DM (regex)
  - David Beneš — Key Account Manager — david.benes@marco.eu ✓ MX valid
  - Michal Pullmann — Art Director — michal.pullmann@marco.eu ✓ MX valid ⭐ DM (regex)
  - Kateřína Hermanová — Account Manager — katerina.hermanova@marco.eu ✓ MX valid
  - Lenka Galko — Production & Account Manager — lenka.galko@marco.eu ✓ MX valid
  - Kristýna Kočí — Account & Digital Specialist — kristyna.koci@marco.eu ✓ MX valid
  - Filip Hrabal — Account Manager — filip.hrabal@marco.eu ✓ MX valid
  - Ondřej Vrtěl — Digital & IT Specialist — ondrej.vrtel@marco.eu ✓ MX valid
  - Jan Kvasnička — Art Director — jan.kvasnicka@marco.eu ✓ MX valid ⭐ DM (regex)
  - Petr Ludva — CMS & DTP specialist — petr.ludva@marco.eu ✓ MX valid
  - Taťána Marková — Accountant — tatana.markova@marco.eu ✓ MX valid
  - Unknown — Unknown role — praha@marco.eu ✓ MX valid
- **Source**: web_scrape

### [Advisio] - online marketingová agentura Praha, PPC reklama
- **Domain**: advisio.cz
- **Status**: contacts_found
- **Segment**: Performance Marketing
- **Industry**: Marketing
- **Size**: large
- **Contacts found**: 5
  - Lada Pěgřimková — Chief Executive Officer — lada.pegrimkova@advisio.cz ✓ MX valid ⭐ DM (regex)
  - Antonín Rybnikář — Business Development Partner — antonin.rybnikar@advisio.cz ✓ MX valid ⭐ DM (regex)
  - Nikol Kružberská — Marketing Manager — nikola.kruzberska@advisio.cz ✓ MX valid
  - Lydie Hrdličková — HR Specialist — lydie.hrdlickova@advisio.cz ✓ MX valid
  - Adam Novák — Key Account Manager — adam.novak@advisio.cz ✓ MX valid
- **Source**: web_scrape

### Best Marketing s.r.o.
- **Domain**: bestmarketing.cz
- **Status**: contacts_found
- **Segment**: Brand Marketing
- **Industry**: Marketing
- **Size**: small
- **Contacts found**: 13
  - Mgr. Marek Dvořák — CEO — marek@bestmarketing.cz ✓ MX valid ⭐ DM (regex)
  - Marek — Unknown role — marek@bestmarketing.cz ✓ MX valid
  - Stacy Farská — Event managerka — no email
  - Veronika Eiblová — Account manager — no email
  - Diana Walsh — PR manažerka — no email
  - Petra Kuncová — Account manager — no email
  - Jakub Janča — Kameraman, střihač — no email
  - Kristýna Staňková — Account manager — no email
  - Patricia Truchlíková — Account manager — no email
  - Nela Slivková — PR manažerka — no email
  - Petr Turok — Grafik, designér — no email
  - Vojtěch Šustal — PPC specialista — no email
  - Petra Karasová — Webdesign — no email
- **Source**: web_scrape

### Boomerang Communication s.r.o.
- **Domain**: boomerang.co.com
- **Status**: contacts_found
- **Segment**: Brand Marketing
- **Industry**: Marketing
- **Size**: medium
- **Contacts found**: 2
  - Martin Vymětal — BYZNYS PARTNER — martin.vymetal@boomerang.agency ✓ MX valid ⭐ DM (regex)
  - Tomáš Cibor — BYZNYS PARTNER — tomas.cibor@boomerang.agency ✓ MX valid ⭐ DM (regex)
- **Source**: web_scrape

### Česká Marketingová Společnost, z.s.
- **Domain**: cms-cma.cz
- **Status**: contacts_found
- **Segment**: N/A
- **Industry**: N/A
- **Size**: small
- **Contacts found**: 29
  - Ladislava Knihová — Prezidentka — no email
  - Tomáš David — Viceprezident — no email
  - Naděžda Krohová — Viceprezidentka — no email
  - Radek Hofman — Člen prezidia — no email
  - Petr Uchytil — Člen prezidia — no email
  - Hana Augustinová — Člen hlavního výboru — no email
  - Pavel Brabec — Člen hlavního výboru — no email
  - Tomáš Hájek — Člen hlavního výboru — no email
  - Monika Hrubalová — Člen hlavního výboru — no email
  - Robert Chmelař — Člen hlavního výboru — no email
  - David Jareš — Člen hlavního výboru — no email
  - Lenka Kauerová — Člen hlavního výboru — no email
  - Jan Mareš — Člen hlavního výboru — no email
  - Jiří Mikeš — Člen hlavního výboru — no email
  - Libor Nečas — Člen hlavního výboru — no email
  - Pavel Novák — Člen hlavního výboru — no email
  - Dušan Pavlů — Člen hlavního výboru — no email
  - Ondřej Pešek — Člen hlavního výboru — no email
  - Pavlína Pellešová — Člen hlavního výboru — no email
  - Milan Postler — Člen hlavního výboru — no email
  - David Říha — Člen hlavního výboru — no email
  - Tomáš Soukup — Člen hlavního výboru — no email
  - Jaroslav Tamchyna — Člen hlavního výboru — no email
  - Petr Tureček — Člen hlavního výboru — no email
  - Martina Weberová — Člen hlavního výboru — no email
  - Kateřina Kantorová — Člen revizní komise — no email
  - Vratislav Kozák — Člen revizní komise — no email
  - Ilona Švihlíková — Člen revizní komise — no email
  - General Contact — Company Email — info@cms-cma.cz ✓ MX valid
- **Source**: web_scrape

### Eximia Cz, S.r.o.
- **Domain**: eximia.cz
- **Status**: contacts_found
- **Segment**: Performance Marketing
- **Industry**: Marketing
- **Size**: medium
- **Contacts found**: 2
  - Petr Stavitel — Architekt — no email
  - Petr Paul — Šéfkuchař — no email
- **Source**: web_scrape

### Obchodní Agentura
- **Domain**: obchodniagentura.com
- **Status**: no_contacts
- **Segment**: Performance Marketing
- **Industry**: Marketing
- **Size**: small
- **IČO**: 03789683 (not validated)
- **HUNTER_FALLBACK_NEEDED**: Yes

### Confidence Digital
- **Domain**: cdigital.cz
- **Status**: no_contacts
- **Segment**: Web Development
- **Industry**: Software
- **Size**: small
- **HUNTER_FALLBACK_NEEDED**: Yes

### World of Online
- **Domain**: woo.cz
- **Status**: no_contacts
- **Segment**: Brand Marketing
- **Industry**: Marketing
- **Size**: medium
- **HUNTER_FALLBACK_NEEDED**: Yes

### TotalMedia Group s.r.o.
- **Domain**: totalmedia.cz
- **Status**: contacts_found
- **Segment**: N/A
- **Industry**: N/A
- **Size**: small
- **Contacts found**: 1
  - General Contact — Company Email — info@totalmedia.cz ✓ MX valid
- **Source**: web_scrape

### Fragile Media Ltd.
- **Domain**: fragile.cz
- **Status**: contacts_found
- **Segment**: Performance Marketing
- **Industry**: Marketing
- **Size**: medium
- **Contacts found**: 1
  - Unknown — Unknown role — yourwayup@fragile.cz ✓ MX valid
- **Source**: web_scrape

### Digitální agentura EL TORO
- **Domain**: eltoro.cz
- **Status**: contacts_found
- **Segment**: Performance Marketing
- **Industry**: Marketing
- **Size**: medium
- **Contacts found**: 18
  - Roman Voženílek — CEO / CFO / Art director — vozenilek@eltoro.cz ✓ MX valid ⭐ DM (regex)
  - Michaela Tejkalová — Head Hunter / Recruitment — tejkalova@eltoro.cz ✓ MX valid ⭐ DM (regex)
  - Martina Vaic — HR manager — vaic@eltoro.cz ✓ MX valid
  - Jiří Pudil — Senior marketing account — pudil@eltoro.cz ✓ MX valid
  - Martina Rychterová — Marketing coordinator — rychterova@eltoro.cz ✓ MX valid
  - Unknown — Unknown role — start@eltoro.cz ✓ MX valid
  - Jan Bartl — Marketingový ředitel — no email
  - Daniel Římal — Jednatel — no email ⭐ DM (regex)
  - Pavel Hořejší — Výkonný ředitel — no email
  - Jaroslav Melc — Jednatel — no email ⭐ DM (regex)
  - Tereza Horáková — Account Director — no email ⭐ DM (regex)
  - Eliška Vámošová — Head of Marketing & PR — no email ⭐ DM (regex)
  - Miroslava Pohanková — CEO a zakladatelka — no email ⭐ DM (regex)
  - Tomáš Kočí — Marketing advisor — no email
  - Jitka Procházková — Marketingová specialistka — no email
  - Petr Kunrátek — Jednatel — no email ⭐ DM (regex)
  - Matyáš Exner — CEO — no email ⭐ DM (regex)
  - Martin Moises — Jednatel a majitel — no email ⭐ DM (regex)
- **Source**: web_scrape

### ClickPro
- **Domain**: clickpro.cz
- **Status**: no_contacts
- **Segment**: Performance Marketing
- **Industry**: Marketing
- **Size**: small
- **HUNTER_FALLBACK_NEEDED**: Yes

---

## Companies Where Hunter.io Fallback Would Be Needed

- Eventuality s.r.o (eventuality.cz)
- Obchodní Agentura (obchodniagentura.com)
- Confidence Digital (cdigital.cz)
- World of Online (woo.cz)
- ClickPro (clickpro.cz)

---

## Decision-Maker Contacts Found

| Company | Name | Title | Email | MX Valid |
|---------|------|-------|-------|----------|
| Groovio | Ondra Vazač | Designer & zakladatel | ondra@groovio.cz | Yes |
| Jan Solta - Shop4Experience | Jan Šolta | trade, brand and design consultant, founder of Shop4Experience, Head of Retail Experience at Cocoon | solta@shop4experience.cz | Yes |
| MARCO reklamní agentura, spol. s.r.o. | Pavel Marek | Managing Director | pavel.marek@marco.eu | Yes |
| [Advisio] - online marketingová agentura Praha, PPC reklama | Lada Pěgřimková | Chief Executive Officer | lada.pegrimkova@advisio.cz | Yes |
| Best Marketing s.r.o. | Mgr. Marek Dvořák | CEO | marek@bestmarketing.cz | Yes |
| Boomerang Communication s.r.o. | Martin Vymětal | BYZNYS PARTNER | martin.vymetal@boomerang.agency | Yes |
| Digitální agentura EL TORO | Roman Voženílek | CEO / CFO / Art director | vozenilek@eltoro.cz | Yes |
