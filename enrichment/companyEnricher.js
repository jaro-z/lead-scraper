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
const { validateICO, extractICO } = require('./ares');
const { fetchPage, cleanHtml } = require('./webScraper');
const { safeString, safeArray } = require('../utils');

// Initialize Anthropic client (uses ANTHROPIC_API_KEY env var)
const anthropic = new Anthropic();

// Valid segment values for categorization
const VALID_SEGMENTS = ['SaaS', 'Agency', 'E-commerce', 'Manufacturing', 'Services', 'Other'];
const VALID_SIZES = ['small', 'medium', 'large'];

/**
 * Create default enrichment result structure
 * @returns {Object} Default result with empty/null values
 */
function createDefaultResult() {
  return {
    ico: null,
    segment: 'Other',
    industry: null,
    size: 'small',
    services: [],
    ico_validated: false,
    enriched_at: new Date().toISOString()
  };
}

/**
 * Enrich company data by analyzing their website with Claude
 * @param {string} domain - Company domain (e.g., "ppcone.cz")
 * @returns {Promise<{ico: string|null, segment: string, industry: string, size: string, services: string[], ico_validated: boolean, error?: string}>}
 */
async function enrichCompany(domain) {
  console.log(`[CompanyEnricher] Enriching: ${domain}`);

  const result = createDefaultResult();

  // Step 1: Fetch homepage
  let html;
  try {
    html = await fetchPage(`https://${domain}`);
  } catch (error) {
    console.warn(`[CompanyEnricher] Fetch failed: ${error.message}`);
    result.error = `fetch_failed: ${error.message}`;
    return result;
  }

  // Step 2: Try to extract IČO directly from HTML first (faster, no API cost)
  const directICO = extractICO(html);
  if (directICO) {
    console.log(`[CompanyEnricher] Found IČO in HTML: ${directICO}`);
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

    // Use Claude's IČO if we didn't find one directly (safe extraction)
    if (!result.ico) {
      const icoValue = safeString(claudeData.ico, 8);
      if (icoValue && /^\d{8}$/.test(icoValue)) {
        result.ico = icoValue;
      }
    }

    // Validate and apply segment (safe extraction)
    const segmentValue = safeString(claudeData.segment, 50);
    if (segmentValue && VALID_SEGMENTS.includes(segmentValue)) {
      result.segment = segmentValue;
    }

    // Apply industry (safe extraction with max length)
    const industryValue = safeString(claudeData.industry, 200);
    if (industryValue) {
      result.industry = industryValue;
    }

    // Validate and apply size
    if (claudeData.size && VALID_SIZES.includes(claudeData.size)) {
      result.size = claudeData.size;
    }

    // Apply services (safe array extraction)
    result.services = safeArray(claudeData.services, 5, 200);

    console.log(`[CompanyEnricher] Categorized: ${result.segment} / ${result.industry}`);

  } catch (error) {
    console.error('[CompanyEnricher] Claude API error:', error.message);
    result.error = `claude_api_error: ${error.message}`;
  }

  // Step 4: Validate IČO via ARES if found
  if (result.ico) {
    result.ico_validated = await validateICOWithAres(result.ico, result);
  }

  return result;
}

/**
 * Validate IČO via ARES and attach ares_data to result if valid
 * @param {string} ico - IČO to validate
 * @param {Object} result - Result object to update with ares_data
 * @returns {Promise<boolean>} Whether ICO is valid
 */
async function validateICOWithAres(ico, result) {
  console.log(`[CompanyEnricher] Validating IČO: ${ico}`);
  try {
    const aresResult = await validateICO(ico);
    if (aresResult.valid) {
      console.log(`[CompanyEnricher] IČO validated: ${aresResult.name}`);
      result.ares_data = {
        name: aresResult.name,
        address: aresResult.address,
        legalForm: aresResult.legalForm
      };
      return true;
    }
    console.log(`[CompanyEnricher] IČO invalid: ${aresResult.reason}`);
    return false;
  } catch (error) {
    console.warn(`[CompanyEnricher] ARES error: ${error.message}`);
    return false;
  }
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
      const errorResult = createDefaultResult();
      errorResult.error = error.message;
      results.set(domain, errorResult);
    }

    if (delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return results;
}

module.exports = {
  enrichCompany,
  enrichCompaniesBatch,
  createDefaultResult,
  VALID_SEGMENTS,
  VALID_SIZES
};
