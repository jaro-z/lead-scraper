/**
 * Company Enrichment via Claude API
 * PRD-WATERFALL-ENRICHMENT: Step 1 - Company Enrichment
 *
 * Analyzes company websites to extract:
 * - IČO (Czech company registration number)
 * - Business segment classification
 * - Industry
 * - Company size estimation
 * - Services/products offered
 */

const Anthropic = require('@anthropic-ai/sdk');
const { validateICO } = require('./ares');

// Initialize Anthropic client (uses ANTHROPIC_API_KEY env var)
const anthropic = new Anthropic();

// Valid segment values for categorization
const VALID_SEGMENTS = ['SaaS', 'Agency', 'E-commerce', 'Manufacturing', 'Services', 'Other'];
const VALID_SIZES = ['small', 'medium', 'large'];

/**
 * Fetch a web page with proper headers
 * @param {string} url - Full URL to fetch
 * @param {number} timeout - Request timeout in ms (default: 10000)
 * @returns {Promise<string>} - HTML content
 */
async function fetchPage(url, timeout = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'cs,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
      },
      redirect: 'follow'
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Clean HTML to reduce size for Claude API
 * @param {string} html - Raw HTML
 * @returns {string} - Cleaned HTML
 */
function cleanHtml(html) {
  return html
    // Remove script tags and content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove style tags and content
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, '')
    // Remove SVG content
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    // Remove noscript tags
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract IČO directly from HTML using regex patterns
 * @param {string} html - Page HTML content
 * @returns {string|null} - Extracted IČO or null
 */
function extractICOFromHtml(html) {
  // Common patterns for Czech IČO on websites
  const patterns = [
    /IČO[\s:]*(\d{8})/i,
    /IČ[\s:]*(\d{8})/i,
    /I\.?Č\.?[\s:]*(\d{8})/i,
    /(?:Company\s*)?(?:ID|Registration|Reg\.?\s*No\.?)[\s:]*(\d{8})/i,
    /Identifikační\s*číslo[\s:]*(\d{8})/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Enrich company data by analyzing their website with Claude
 * @param {string} domain - Company domain (e.g., "ppcone.cz")
 * @returns {Promise<{ico: string|null, segment: string, industry: string, size: string, services: string[], ico_validated: boolean, error?: string}>}
 */
async function enrichCompany(domain) {
  console.log(`[CompanyEnricher] Enriching company: ${domain}`);

  // Default response structure
  const result = {
    ico: null,
    segment: 'Other',
    industry: null,
    size: 'small',
    services: [],
    ico_validated: false,
    enriched_at: new Date().toISOString()
  };

  // Step 1: Fetch homepage
  let html;
  try {
    html = await fetchPage(`https://${domain}`);
  } catch (error) {
    console.warn(`[CompanyEnricher] Could not fetch homepage: ${error.message}`);
    result.error = `fetch_failed: ${error.message}`;
    return result;
  }

  // Step 2: Try to extract IČO directly from HTML first (faster, no API cost)
  const directICO = extractICOFromHtml(html);
  if (directICO) {
    console.log(`[CompanyEnricher] Found IČO directly in HTML: ${directICO}`);
    result.ico = directICO;
  }

  // Step 3: Use Claude to analyze and categorize the company
  const cleanedHtml = cleanHtml(html);
  const truncatedHtml = cleanedHtml.substring(0, 50000);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Analyze this Czech company website and extract business information.

Extract the following:
1. IČO (Czech company registration number) - exactly 8 digits, often shown in footer or contact page
2. Segment - classify as one of: SaaS, Agency, E-commerce, Manufacturing, Services, Other
3. Industry - specific industry (e.g., "Digital Marketing", "Software Development", "Food Production")
4. Size - estimate based on team size or company presence: small (<10 employees), medium (10-50), large (50+)
5. Services - list of main services or products offered (max 5 items)

Guidelines for segment classification:
- SaaS: Software products, subscription services, online tools
- Agency: Marketing, design, PR, recruitment agencies
- E-commerce: Online shops, retail
- Manufacturing: Physical product production, factories
- Services: Consulting, legal, accounting, other professional services
- Other: Everything else

Return ONLY valid JSON in this exact format, no other text:
{"ico": "12345678", "segment": "Agency", "industry": "Digital Marketing", "size": "small", "services": ["PPC advertising", "SEO", "Social media"]}

If IČO is not found, use null for ico field.

HTML:
${truncatedHtml}`
      }]
    });

    // Parse Claude's response
    const responseText = response.content[0].text.trim();

    // Try to extract JSON from the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[CompanyEnricher] No JSON object found in Claude response');
      return result;
    }

    const claudeData = JSON.parse(jsonMatch[0]);

    // Use Claude's IČO if we didn't find one directly
    if (!result.ico && claudeData.ico && /^\d{8}$/.test(String(claudeData.ico))) {
      result.ico = String(claudeData.ico);
    }

    // Validate and apply segment
    if (claudeData.segment && VALID_SEGMENTS.includes(claudeData.segment)) {
      result.segment = claudeData.segment;
    }

    // Apply industry
    if (claudeData.industry && typeof claudeData.industry === 'string') {
      result.industry = claudeData.industry.trim();
    }

    // Validate and apply size
    if (claudeData.size && VALID_SIZES.includes(claudeData.size)) {
      result.size = claudeData.size;
    }

    // Apply services (ensure it's an array of strings)
    if (Array.isArray(claudeData.services)) {
      result.services = claudeData.services
        .filter(s => typeof s === 'string')
        .map(s => s.trim())
        .slice(0, 5);
    }

    console.log(`[CompanyEnricher] Claude categorized as: ${result.segment} / ${result.industry}`);

  } catch (error) {
    console.error('[CompanyEnricher] Claude API error:', error.message);
    result.error = `claude_api_error: ${error.message}`;
  }

  // Step 4: Validate IČO via ARES if found
  if (result.ico) {
    console.log(`[CompanyEnricher] Validating IČO via ARES: ${result.ico}`);
    try {
      const aresResult = await validateICO(result.ico);
      result.ico_validated = aresResult.valid;

      if (aresResult.valid) {
        console.log(`[CompanyEnricher] IČO validated: ${aresResult.name}`);
        // Optionally store ARES data
        result.ares_data = {
          name: aresResult.name,
          address: aresResult.address,
          legalForm: aresResult.legalForm
        };
      } else {
        console.log(`[CompanyEnricher] IČO validation failed: ${aresResult.reason}`);
      }
    } catch (error) {
      console.warn(`[CompanyEnricher] ARES validation error: ${error.message}`);
      result.ico_validated = false;
    }
  }

  return result;
}

/**
 * Batch enrich multiple companies
 * @param {string[]} domains - Array of company domains
 * @param {number} delayMs - Delay between requests (default: 1000ms)
 * @returns {Promise<Map<string, Object>>} - Map of domain to enrichment result
 */
async function enrichCompaniesBatch(domains, delayMs = 1000) {
  const results = new Map();

  for (const domain of domains) {
    try {
      results.set(domain, await enrichCompany(domain));
    } catch (error) {
      results.set(domain, {
        error: error.message,
        ico: null,
        segment: 'Other',
        industry: null,
        size: 'small',
        services: [],
        ico_validated: false
      });
    }

    // Rate limit to be polite and avoid API issues
    if (delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return results;
}

module.exports = {
  enrichCompany,
  enrichCompaniesBatch,
  fetchPage,
  cleanHtml,
  extractICOFromHtml,
  VALID_SEGMENTS,
  VALID_SIZES
};
