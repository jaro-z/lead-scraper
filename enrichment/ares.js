/**
 * ARES (Administrativní registr ekonomických subjektů) Integration
 * Czech Business Registry API for IČO validation
 * PRD-WATERFALL-ENRICHMENT: Company Validation
 *
 * API Documentation: https://ares.gov.cz/stranky/vyvojari
 */

const ARES_API_BASE = 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty';

/**
 * Validate Czech IČO (company registration number) via ARES API
 * @param {string} ico - 8-digit Czech company registration number
 * @returns {Promise<{valid: boolean, name?: string, address?: string, legalForm?: string, reason?: string}>}
 */
async function validateICO(ico) {
  // Validate format: must be 8 digits
  const cleanedICO = String(ico).replace(/\s/g, '');
  if (!/^\d{8}$/.test(cleanedICO)) {
    return { valid: false, reason: 'invalid_format' };
  }

  try {
    const response = await fetch(`${ARES_API_BASE}/${cleanedICO}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ChorizoLeadScraper/1.0'
      }
    });

    if (response.status === 404) {
      return { valid: false, reason: 'not_found' };
    }

    if (!response.ok) {
      return {
        valid: false,
        reason: 'api_error',
        error: `HTTP ${response.status}`
      };
    }

    const data = await response.json();

    // Extract relevant fields from ARES response
    return {
      valid: true,
      ico: cleanedICO,
      name: data.obchodniJmeno || data.nazev,
      address: data.sidlo?.textovaAdresa || formatAddress(data.sidlo),
      legalForm: data.pravniForma?.nazev || data.pravniForma,
      dateCreated: data.datumVzniku,
      dic: data.dic // Tax ID if available
    };

  } catch (error) {
    return {
      valid: false,
      reason: 'network_error',
      error: error.message
    };
  }
}

/**
 * Format address object to string
 * @param {Object} sidlo - Address object from ARES
 * @returns {string}
 */
function formatAddress(sidlo) {
  if (!sidlo) return null;

  const parts = [];
  if (sidlo.nazevUlice) {
    parts.push(sidlo.nazevUlice);
    if (sidlo.cisloDomovni) parts[0] += ` ${sidlo.cisloDomovni}`;
    if (sidlo.cisloOrientacni) parts[0] += `/${sidlo.cisloOrientacni}`;
  }
  if (sidlo.nazevObce) parts.push(sidlo.nazevObce);
  if (sidlo.psc) parts.push(sidlo.psc);

  return parts.join(', ') || null;
}

/**
 * Extract IČO from text (useful for parsing company websites)
 * @param {string} text - Text to search for IČO
 * @returns {string|null} - Found IČO or null
 */
function extractICO(text) {
  if (!text) return null;

  // Common patterns: "IČO: 12345678", "IČ: 12345678", "IČO 12345678"
  const patterns = [
    /IČO[\s:]*(\d{8})/i,
    /IČ[\s:]*(\d{8})/i,
    /(?:registration|reg\.?\s*(?:no\.?|number))[\s:]*(\d{8})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Batch validate multiple IČOs with rate limiting
 * @param {string[]} icos - Array of IČO numbers
 * @param {number} delayMs - Delay between requests (default: 200ms)
 * @returns {Promise<Map<string, Object>>}
 */
async function validateICOsBatch(icos, delayMs = 200) {
  const results = new Map();

  for (const ico of icos) {
    results.set(ico, await validateICO(ico));
    // Rate limit to be nice to the government API
    if (delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return results;
}

module.exports = {
  validateICO,
  extractICO,
  validateICOsBatch
};
