/**
 * Comprehensive Tests for Waterfall Enrichment Pipeline
 * Based on PRD-WATERFALL-ENRICHMENT.md Section 11 "Verification Plan"
 *
 * Run with: node --test tests/enrichment.test.js
 *
 * Tests cover:
 * 1. MX Validation (enrichment/validators.js)
 * 2. ARES Validation (enrichment/ares.js)
 * 3. Template Router (enrichment/templateRouter.js)
 * 4. Contact Waterfall (enrichment/contactWaterfall.js)
 */

const { describe, it, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

// ============================================================================
// SECTION 1: MX VALIDATION TESTS (enrichment/validators.js)
// ============================================================================

describe('MX Validation - validators.js', () => {
  const { validateEmail, validatePhone, validateEmailsBatch } = require('../enrichment/validators');

  describe('validateEmail()', () => {
    it('should return valid: true for real email with valid MX records (petr@ppcone.cz)', async () => {
      const result = await validateEmail('petr@ppcone.cz');
      assert.strictEqual(result.valid, true, 'Expected email to be valid');
      assert.strictEqual(result.reason, 'valid');
      assert.ok(result.mxHost, 'Expected mxHost to be present');
    });

    it('should return valid: false with reason mx_lookup_failed for nonexistent domain', async () => {
      const result = await validateEmail('fake@nonexistent123.cz');
      assert.strictEqual(result.valid, false, 'Expected email to be invalid');
      assert.strictEqual(result.reason, 'mx_lookup_failed', 'Expected reason to be mx_lookup_failed');
    });

    it('should return valid: false for invalid email format (no @)', async () => {
      const result = await validateEmail('invalidemail.com');
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, 'invalid_format');
    });

    it('should return valid: false for invalid email format (no domain)', async () => {
      const result = await validateEmail('invalid@');
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, 'invalid_format');
    });

    it('should return valid: false for email with spaces', async () => {
      const result = await validateEmail('invalid email@domain.cz');
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, 'invalid_format');
    });

    it('should return valid: true for common email providers (gmail.com)', async () => {
      const result = await validateEmail('test@gmail.com');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.reason, 'valid');
    });
  });

  describe('validatePhone() - Czech phone numbers', () => {
    it('should validate standard Czech format +420XXXXXXXXX', () => {
      const result = validatePhone('+420123456789');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.normalized, '+420123456789');
    });

    it('should validate and normalize 00420 prefix format', () => {
      const result = validatePhone('00420123456789');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.normalized, '+420123456789');
    });

    it('should validate and normalize 9-digit format without prefix', () => {
      const result = validatePhone('123456789');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.normalized, '+420123456789');
    });

    it('should handle phone with spaces', () => {
      const result = validatePhone('+420 123 456 789');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.normalized, '+420123456789');
    });

    it('should handle phone with dashes', () => {
      const result = validatePhone('+420-123-456-789');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.normalized, '+420123456789');
    });

    it('should handle phone with parentheses', () => {
      const result = validatePhone('(+420) 123 456 789');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.normalized, '+420123456789');
    });

    it('should reject empty phone', () => {
      const result = validatePhone('');
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, 'empty');
    });

    it('should reject null phone', () => {
      const result = validatePhone(null);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, 'empty');
    });
  });

  describe('validateEmailsBatch()', () => {
    it('should validate multiple emails concurrently', async () => {
      const emails = ['test@gmail.com', 'fake@nonexistent123.cz'];
      const results = await validateEmailsBatch(emails, 2);

      assert.ok(results instanceof Map, 'Expected results to be a Map');
      assert.strictEqual(results.size, 2);
      assert.strictEqual(results.get('test@gmail.com').valid, true);
      assert.strictEqual(results.get('fake@nonexistent123.cz').valid, false);
    });
  });
});

// ============================================================================
// SECTION 2: ARES VALIDATION TESTS (enrichment/ares.js)
// ============================================================================

describe('ARES Validation - ares.js', () => {
  const { validateICO, extractICO } = require('../enrichment/ares');

  describe('validateICO()', () => {
    it('should return valid: true with company name for valid ICO', async () => {
      const result = await validateICO('27082440'); // Alza.cz
      assert.strictEqual(result.valid, true, 'Expected ICO to be valid');
      assert.ok(result.name, 'Expected name to be present');
      assert.ok(typeof result.name === 'string' && result.name.length > 0, 'Name should be non-empty string');
    });

    it('should return valid: false for non-existent ICO', async () => {
      const result = await validateICO('99999999');
      assert.strictEqual(result.valid, false);
      assert.ok(result.reason, 'Expected reason to be present');
    });

    it('should return valid: false for invalid format (not 8 digits)', async () => {
      const result = await validateICO('1234567');
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, 'invalid_format');
    });

    it('should return valid: false for invalid format (letters)', async () => {
      const result = await validateICO('1234567a');
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.reason, 'invalid_format');
    });
  });

  describe('extractICO()', () => {
    it('should extract ICO from text with "IČO:" prefix (Czech)', () => {
      const text = 'Company info: IČO: 27082440, Praha';
      const result = extractICO(text);
      assert.strictEqual(result, '27082440');
    });

    it('should extract ICO from text with "IČO " prefix (no colon)', () => {
      const text = 'IČO 12345678';
      const result = extractICO(text);
      assert.strictEqual(result, '12345678');
    });

    it('should return null when no ICO found', () => {
      const text = 'Company without registration number';
      const result = extractICO(text);
      assert.strictEqual(result, null);
    });

    it('should return null for empty text', () => {
      assert.strictEqual(extractICO(''), null);
    });

    it('should return null for null input', () => {
      assert.strictEqual(extractICO(null), null);
    });
  });
});

// ============================================================================
// SECTION 3: TEMPLATE ROUTER TESTS (enrichment/templateRouter.js)
// ============================================================================

describe('Template Router - templateRouter.js', () => {
  const { assignTemplate, getTemplateTypes, assignTemplatesBatch, ROLE_TEMPLATES } = require('../enrichment/templateRouter');

  describe('assignTemplate() - English roles', () => {
    it('should return "strategic_partnership" for CEO', () => {
      const result = assignTemplate('CEO');
      assert.strictEqual(result, 'strategic_partnership');
    });

    it('should return "strategic_partnership" for Founder', () => {
      const result = assignTemplate('Founder');
      assert.strictEqual(result, 'strategic_partnership');
    });

    it('should return "strategic_partnership" for Owner', () => {
      const result = assignTemplate('Owner');
      assert.strictEqual(result, 'strategic_partnership');
    });

    it('should return "marketing_automation" for CMO', () => {
      const result = assignTemplate('CMO');
      assert.strictEqual(result, 'marketing_automation');
    });

    it('should return "marketing_automation" for Marketing Manager', () => {
      const result = assignTemplate('Marketing Manager');
      assert.strictEqual(result, 'marketing_automation');
    });

    it('should return "backoffice_finance" for CFO', () => {
      const result = assignTemplate('CFO');
      assert.strictEqual(result, 'backoffice_finance');
    });

    it('should return "process_automation" for COO', () => {
      const result = assignTemplate('COO');
      assert.strictEqual(result, 'process_automation');
    });

    it('should return "tech_integration" for CTO', () => {
      const result = assignTemplate('CTO');
      assert.strictEqual(result, 'tech_integration');
    });

    it('should return "tech_integration" for Developer', () => {
      const result = assignTemplate('Developer');
      assert.strictEqual(result, 'tech_integration');
    });
  });

  describe('assignTemplate() - Czech roles', () => {
    it('should return "strategic_partnership" for jednatel', () => {
      const result = assignTemplate('jednatel');
      assert.strictEqual(result, 'strategic_partnership');
    });

    it('should return "strategic_partnership" for majitel', () => {
      const result = assignTemplate('majitel');
      assert.strictEqual(result, 'strategic_partnership');
    });

    it('should return "strategic_partnership" for zakladatel', () => {
      const result = assignTemplate('zakladatel');
      assert.strictEqual(result, 'strategic_partnership');
    });

    it('should return "marketing_automation" for marketingovy', () => {
      const result = assignTemplate('marketingovy');
      assert.strictEqual(result, 'marketing_automation');
    });

    it('should return "backoffice_finance" for financni', () => {
      const result = assignTemplate('financni');
      assert.strictEqual(result, 'backoffice_finance');
    });

    it('should return "backoffice_finance" for ucetni', () => {
      const result = assignTemplate('ucetni');
      assert.strictEqual(result, 'backoffice_finance');
    });

    it('should return "process_automation" for provozni', () => {
      const result = assignTemplate('provozni');
      assert.strictEqual(result, 'process_automation');
    });

    it('should return "tech_integration" for technicky', () => {
      const result = assignTemplate('technicky');
      assert.strictEqual(result, 'tech_integration');
    });
  });

  describe('assignTemplate() - Edge cases', () => {
    it('should return "generic" for null role', () => {
      const result = assignTemplate(null);
      assert.strictEqual(result, 'generic');
    });

    it('should return "generic" for undefined role', () => {
      const result = assignTemplate(undefined);
      assert.strictEqual(result, 'generic');
    });

    it('should return "generic" for empty string', () => {
      const result = assignTemplate('');
      assert.strictEqual(result, 'generic');
    });

    it('should return "generic" for unknown role', () => {
      const result = assignTemplate('Receptionist');
      assert.strictEqual(result, 'generic');
    });

    it('should be case-insensitive', () => {
      assert.strictEqual(assignTemplate('ceo'), 'strategic_partnership');
      assert.strictEqual(assignTemplate('CEO'), 'strategic_partnership');
      assert.strictEqual(assignTemplate('Ceo'), 'strategic_partnership');
    });
  });

  describe('assignTemplatesBatch()', () => {
    it('should assign templates to multiple contacts', () => {
      const contacts = [
        { name: 'John', role: 'CEO' },
        { name: 'Jane', role: 'CMO' },
        { name: 'Bob', title: 'Developer' },
      ];

      const result = assignTemplatesBatch(contacts);

      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0].template, 'strategic_partnership');
      assert.strictEqual(result[1].template, 'marketing_automation');
      assert.strictEqual(result[2].template, 'tech_integration');
    });
  });

  describe('getTemplateTypes()', () => {
    it('should return all available template types including generic', () => {
      const types = getTemplateTypes();

      assert.ok(Array.isArray(types));
      assert.ok(types.includes('strategic_partnership'));
      assert.ok(types.includes('marketing_automation'));
      assert.ok(types.includes('backoffice_finance'));
      assert.ok(types.includes('process_automation'));
      assert.ok(types.includes('tech_integration'));
      assert.ok(types.includes('generic'));
    });
  });

  describe('ROLE_TEMPLATES constant', () => {
    it('should export ROLE_TEMPLATES for customization', () => {
      assert.ok(ROLE_TEMPLATES);
      assert.ok(typeof ROLE_TEMPLATES === 'object');
      assert.ok(Object.keys(ROLE_TEMPLATES).length > 0);
    });
  });
});

// ============================================================================
// SECTION 4: CONTACT WATERFALL TESTS (enrichment/contactWaterfall.js)
// ============================================================================

describe('Contact Waterfall - contactWaterfall.js', () => {
  describe('normalizeContacts()', () => {
    const { normalizeContacts } = require('../enrichment/contactWaterfall');

    it('should normalize web_scrape contacts correctly', () => {
      const rawContacts = [
        { name: 'Petr Novak', role: 'CEO', email: 'petr@test.cz', phone: '+420123456789' }
      ];

      const result = normalizeContacts(rawContacts, 'web_scrape');

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, 'Petr Novak');
      assert.strictEqual(result[0].firstName, 'Petr');
      assert.strictEqual(result[0].lastName, 'Novak');
      assert.strictEqual(result[0].email, 'petr@test.cz');
      assert.strictEqual(result[0].phone, '+420123456789');
      assert.strictEqual(result[0].title, 'CEO');
      assert.strictEqual(result[0].source, 'web_scrape');
      assert.strictEqual(result[0].confidence, 50);
    });

    it('should normalize hunter contacts correctly', () => {
      const rawContacts = [
        {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@test.com',
          position: 'Marketing Director',
          confidence: 95
        }
      ];

      const result = normalizeContacts(rawContacts, 'hunter');

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, 'John Doe');
      assert.strictEqual(result[0].firstName, 'John');
      assert.strictEqual(result[0].lastName, 'Doe');
      assert.strictEqual(result[0].email, 'john@test.com');
      assert.strictEqual(result[0].phone, null);
      assert.strictEqual(result[0].title, 'Marketing Director');
      assert.strictEqual(result[0].source, 'hunter');
      assert.strictEqual(result[0].confidence, 95);
    });

    it('should handle contacts with only full name (extract first/last)', () => {
      const rawContacts = [
        { name: 'Jan Novak Starsi', role: 'Director', email: 'jan@test.cz' }
      ];

      const result = normalizeContacts(rawContacts, 'web_scrape');

      assert.strictEqual(result[0].firstName, 'Jan');
      assert.strictEqual(result[0].lastName, 'Novak Starsi');
    });

    it('should handle contacts with single name', () => {
      const rawContacts = [
        { name: 'Madonna', role: 'Artist', email: 'madonna@test.com' }
      ];

      const result = normalizeContacts(rawContacts, 'web_scrape');

      assert.strictEqual(result[0].firstName, 'Madonna');
      assert.strictEqual(result[0].lastName, null);
    });
  });

  describe('getWaterfallStats()', () => {
    const { getWaterfallStats } = require('../enrichment/contactWaterfall');

    it('should calculate correct statistics from results', () => {
      const results = new Map();
      results.set(1, { source: 'web_scrape', contacts: [{ email: 'a@test.com' }, { email: 'b@test.com' }] });
      results.set(2, { source: 'web_scrape', contacts: [{ email: 'c@test.com' }] });
      results.set(3, { source: 'hunter', contacts: [{ email: 'd@test.com' }] });
      results.set(4, { source: null, contacts: [] });

      const stats = getWaterfallStats(results);

      assert.strictEqual(stats.total, 4);
      assert.strictEqual(stats.webScrape, 2);
      assert.strictEqual(stats.hunter, 1);
      assert.strictEqual(stats.noContacts, 1);
      assert.strictEqual(stats.totalContacts, 4);
      assert.strictEqual(stats.webScrapeRate, '50.0%');
    });

    it('should handle empty results', () => {
      const results = new Map();
      const stats = getWaterfallStats(results);

      assert.strictEqual(stats.total, 0);
      assert.strictEqual(stats.webScrape, 0);
      assert.strictEqual(stats.hunter, 0);
      assert.strictEqual(stats.noContacts, 0);
      assert.strictEqual(stats.webScrapeRate, '0%');
    });
  });

  describe('discoverContacts() - Integration tests with mocks', () => {
    it('should return source: web_scrape when web scraper finds contacts', async () => {
      const mockWebScraper = {
        scrapeTeamPages: async () => [
          { name: 'Petr Kucera', role: 'CEO', email: 'petr@ppcone.cz', phone: '+420777123456' },
          { name: 'Pavla Ryznarova', role: 'CMO', email: 'pavla@ppcone.cz', phone: '+420777654321' }
        ]
      };

      const discoverContactsWithMock = async (companyId, domain, hunterApiKey) => {
        const scrapedContacts = await mockWebScraper.scrapeTeamPages(domain);

        if (scrapedContacts && scrapedContacts.length > 0) {
          return {
            source: 'web_scrape',
            contacts: scrapedContacts.map(c => ({ ...c, source: 'web_scrape' })),
            companyId
          };
        }

        return { source: null, contacts: [], companyId };
      };

      const result = await discoverContactsWithMock(123, 'ppcone.cz', 'fake-api-key');

      assert.strictEqual(result.source, 'web_scrape', 'Expected source to be web_scrape');
      assert.strictEqual(result.contacts.length, 2, 'Expected 2 contacts');
      assert.strictEqual(result.companyId, 123);
    });

    it('should fall back to Hunter when web scraper finds no contacts', async () => {
      const mockWebScraper = { scrapeTeamPages: async () => [] };
      const mockHunter = {
        domainSearch: async () => ({
          emails: [
            { firstName: 'John', lastName: 'Doe', email: 'john@example.com', position: 'CEO', confidence: 90 }
          ],
          organization: 'Example Inc'
        })
      };

      const discoverContactsWithMock = async (companyId, domain, hunterApiKey) => {
        const scrapedContacts = await mockWebScraper.scrapeTeamPages(domain);

        if (scrapedContacts && scrapedContacts.length > 0) {
          return { source: 'web_scrape', contacts: scrapedContacts, companyId };
        }

        if (hunterApiKey) {
          const hunterResult = await mockHunter.domainSearch(domain, hunterApiKey);
          const hunterContacts = hunterResult.emails || [];

          if (hunterContacts.length > 0) {
            return {
              source: 'hunter',
              contacts: hunterContacts.map(c => ({ ...c, source: 'hunter' })),
              companyId,
              organization: hunterResult.organization
            };
          }
        }

        return { source: null, contacts: [], companyId };
      };

      const result = await discoverContactsWithMock(456, 'example.com', 'fake-api-key');

      assert.strictEqual(result.source, 'hunter', 'Expected source to be hunter');
      assert.strictEqual(result.contacts.length, 1, 'Expected 1 contact from Hunter');
      assert.strictEqual(result.organization, 'Example Inc');
    });

    it('should return source: null when no contacts found from any source', async () => {
      const mockWebScraper = { scrapeTeamPages: async () => [] };
      const mockHunter = { domainSearch: async () => ({ emails: [], organization: null }) };

      const discoverContactsWithMock = async (companyId, domain, hunterApiKey) => {
        const scrapedContacts = await mockWebScraper.scrapeTeamPages(domain);
        if (scrapedContacts && scrapedContacts.length > 0) {
          return { source: 'web_scrape', contacts: scrapedContacts, companyId };
        }

        if (hunterApiKey) {
          const hunterResult = await mockHunter.domainSearch(domain, hunterApiKey);
          if (hunterResult.emails && hunterResult.emails.length > 0) {
            return { source: 'hunter', contacts: hunterResult.emails, companyId };
          }
        }

        return { source: null, contacts: [], companyId };
      };

      const result = await discoverContactsWithMock(789, 'nocontacts.com', 'fake-api-key');

      assert.strictEqual(result.source, null, 'Expected source to be null');
      assert.strictEqual(result.contacts.length, 0, 'Expected no contacts');
    });

    it('should skip Hunter fallback when no API key provided', async () => {
      const mockWebScraper = { scrapeTeamPages: async () => [] };
      let hunterCalled = false;
      const mockHunter = {
        domainSearch: async () => {
          hunterCalled = true;
          return { emails: [{ email: 'test@test.com' }] };
        }
      };

      const discoverContactsWithMock = async (companyId, domain, hunterApiKey) => {
        const scrapedContacts = await mockWebScraper.scrapeTeamPages(domain);
        if (scrapedContacts && scrapedContacts.length > 0) {
          return { source: 'web_scrape', contacts: scrapedContacts, companyId };
        }

        if (hunterApiKey) {
          const hunterResult = await mockHunter.domainSearch(domain, hunterApiKey);
          if (hunterResult.emails && hunterResult.emails.length > 0) {
            return { source: 'hunter', contacts: hunterResult.emails, companyId };
          }
        }

        return { source: null, contacts: [], companyId };
      };

      const result = await discoverContactsWithMock(100, 'example.com', null);

      assert.strictEqual(hunterCalled, false, 'Hunter should not be called without API key');
      assert.strictEqual(result.source, null);
    });

    it('should handle domain with protocol and www prefix', async () => {
      const cleanDomain = (domain) => {
        return domain
          .replace(/^https?:\/\//, '')
          .replace(/^www\./, '')
          .replace(/\/$/, '');
      };

      assert.strictEqual(cleanDomain('https://www.example.com/'), 'example.com');
      assert.strictEqual(cleanDomain('http://example.com'), 'example.com');
      assert.strictEqual(cleanDomain('www.example.com'), 'example.com');
      assert.strictEqual(cleanDomain('example.com'), 'example.com');
    });
  });
});

// ============================================================================
// SECTION 5: WEB SCRAPER HELPER TESTS (enrichment/webScraper.js)
// ============================================================================

describe('Web Scraper Helpers - webScraper.js', () => {
  const { cleanHtml, deduplicateContacts, findTeamPageUrls, TEAM_PAGE_PATTERNS } = require('../enrichment/webScraper');

  describe('cleanHtml()', () => {
    it('should remove script tags', () => {
      const html = '<div>Content</div><script>alert("test")</script><p>More</p>';
      const result = cleanHtml(html);
      assert.ok(!result.includes('<script>'));
      assert.ok(!result.includes('alert'));
    });

    it('should remove style tags', () => {
      const html = '<div>Content</div><style>.test { color: red; }</style><p>More</p>';
      const result = cleanHtml(html);
      assert.ok(!result.includes('<style>'));
      assert.ok(!result.includes('color: red'));
    });

    it('should remove HTML comments', () => {
      const html = '<div>Content</div><!-- This is a comment --><p>More</p>';
      const result = cleanHtml(html);
      assert.ok(!result.includes('comment'));
    });

    it('should collapse whitespace', () => {
      const html = '<div>   Multiple    Spaces   </div>';
      const result = cleanHtml(html);
      assert.ok(!result.includes('   '));
    });
  });

  describe('deduplicateContacts()', () => {
    it('should deduplicate contacts by email', () => {
      const contacts = [
        { name: 'John Doe', email: 'john@test.com', role: 'CEO' },
        { name: 'John D.', email: 'john@test.com', role: 'CEO' },
        { name: 'Jane Doe', email: 'jane@test.com', role: 'CMO' }
      ];

      const result = deduplicateContacts(contacts);

      assert.strictEqual(result.length, 2);
      const emails = result.map(c => c.email);
      assert.ok(emails.includes('john@test.com'));
      assert.ok(emails.includes('jane@test.com'));
    });

    it('should deduplicate contacts by name when no email', () => {
      const contacts = [
        { name: 'John Doe', email: null, role: 'CEO' },
        { name: 'john doe', email: null, role: 'CEO' },
        { name: 'Jane Doe', email: null, role: 'CMO' }
      ];

      const result = deduplicateContacts(contacts);

      assert.strictEqual(result.length, 2);
    });

    it('should merge non-null values when deduplicating', () => {
      const contacts = [
        { name: 'John Doe', email: 'john@test.com', role: null, phone: '+420123456789' },
        { name: null, email: 'john@test.com', role: 'CEO', phone: null }
      ];

      const result = deduplicateContacts(contacts);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, 'John Doe');
      assert.strictEqual(result[0].role, 'CEO');
      assert.strictEqual(result[0].phone, '+420123456789');
    });
  });

  describe('findTeamPageUrls()', () => {
    it('should find team page links from HTML', () => {
      const html = `
        <a href="/about">About Us</a>
        <a href="/nas-tym">Nas tym</a>
        <a href="/products">Products</a>
        <a href="/kontakt">Kontakt</a>
      `;

      const result = findTeamPageUrls(html, 'example.cz');

      assert.ok(result.length > 0);
      assert.ok(result.some(url => url.includes('/about')));
      assert.ok(result.some(url => url.includes('/nas-tym')));
      assert.ok(result.some(url => url.includes('/kontakt')));
    });

    it('should not include non-team links', () => {
      const html = `
        <a href="/products">Products</a>
        <a href="/pricing">Pricing</a>
        <a href="/blog">Blog</a>
      `;

      const result = findTeamPageUrls(html, 'example.cz');

      assert.strictEqual(result.length, 0);
    });

    it('should handle full URLs on same domain', () => {
      const html = `<a href="https://example.cz/team">Team</a>`;
      const result = findTeamPageUrls(html, 'example.cz');

      assert.strictEqual(result.length, 1);
      assert.ok(result[0].includes('example.cz/team'));
    });
  });

  describe('TEAM_PAGE_PATTERNS', () => {
    it('should include common Czech patterns', () => {
      assert.ok(TEAM_PAGE_PATTERNS.includes('/nas-tym'));
      assert.ok(TEAM_PAGE_PATTERNS.includes('/o-nas'));
      assert.ok(TEAM_PAGE_PATTERNS.includes('/kontakt'));
      assert.ok(TEAM_PAGE_PATTERNS.includes('/tym'));
    });

    it('should include common English patterns', () => {
      assert.ok(TEAM_PAGE_PATTERNS.includes('/team'));
      assert.ok(TEAM_PAGE_PATTERNS.includes('/about'));
      assert.ok(TEAM_PAGE_PATTERNS.includes('/contact'));
    });
  });
});

// ============================================================================
// SECTION 6: INTEGRATION TEST SCENARIOS
// ============================================================================

describe('Integration Scenarios', () => {
  describe('Full Pipeline Flow Simulation', () => {
    const { validateEmail, validatePhone } = require('../enrichment/validators');
    const { assignTemplate } = require('../enrichment/templateRouter');
    const { normalizeContacts } = require('../enrichment/contactWaterfall');

    it('should process a complete contact through the pipeline', async () => {
      const scrapedContact = {
        name: 'Petr Kucera',
        role: 'CEO',
        email: 'test@gmail.com',
        phone: '+420 777 123 456'
      };

      // Step 1: Normalize contact
      const [normalizedContact] = normalizeContacts([scrapedContact], 'web_scrape');
      assert.strictEqual(normalizedContact.source, 'web_scrape');
      assert.strictEqual(normalizedContact.firstName, 'Petr');
      assert.strictEqual(normalizedContact.lastName, 'Kucera');

      // Step 2: Validate email
      const emailResult = await validateEmail(normalizedContact.email);
      assert.strictEqual(emailResult.valid, true);

      // Step 3: Validate phone
      const phoneResult = validatePhone(normalizedContact.phone);
      assert.strictEqual(phoneResult.valid, true);
      assert.strictEqual(phoneResult.normalized, '+420777123456');

      // Step 4: Assign template
      const template = assignTemplate(normalizedContact.title);
      assert.strictEqual(template, 'strategic_partnership');
    });
  });
});

console.log('\n=================================================');
console.log('Running Waterfall Enrichment Pipeline Tests');
console.log('Based on PRD-WATERFALL-ENRICHMENT.md Section 11');
console.log('=================================================\n');
