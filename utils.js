/**
 * Shared utilities for the lead-scraper application
 */

/**
 * Sanitize error messages for client responses
 * - Logs full error server-side
 * - Returns generic message in production
 * - Returns error message (no stack) in development
 * - Never exposes file paths, API keys, or internal details
 * @param {Error|string} error - The error to sanitize
 * @returns {string} Safe error message for client
 */
function sanitizeErrorMessage(error) {
  const errorObj = error instanceof Error ? error : new Error(String(error));
  const errorMessage = errorObj.message || 'Unknown error';

  // Always log full error server-side
  console.error('[Server Error]', errorObj);

  // Production: return generic message
  if (process.env.NODE_ENV === 'production') {
    return 'An internal error occurred. Please try again later.';
  }

  // Development: sanitize the message to remove sensitive info
  // Remove file paths (Unix and Windows)
  let sanitized = errorMessage
    .replace(/\/[^\s:]+\.(js|ts|json|env|local)/gi, '[path]')
    .replace(/[A-Z]:\\[^\s:]+\.(js|ts|json|env|local)/gi, '[path]')
    // Remove potential API keys (common patterns)
    .replace(/sk-[a-zA-Z0-9-_]{20,}/g, '[api-key]')
    .replace(/sk_[a-zA-Z0-9-_]{20,}/g, '[api-key]')
    .replace(/key[=:]\s*['"]?[a-zA-Z0-9-_]{20,}['"]?/gi, 'key=[redacted]')
    .replace(/api[_-]?key[=:]\s*['"]?[a-zA-Z0-9-_]{20,}['"]?/gi, 'api_key=[redacted]')
    // Remove stack trace lines if accidentally included
    .replace(/\s+at\s+.+:\d+:\d+/g, '')
    .replace(/Error:\s*/g, '');

  return sanitized.trim() || 'An error occurred';
}

/**
 * Extract domain from a website URL
 * @param {string} website - The website URL
 * @returns {string|null} The extracted domain or null
 */
function extractDomain(website) {
  if (!website) return null;
  try {
    const url = new URL(website.startsWith('http') ? website : `https://${website}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Validate and extract domain from a website URL with SSRF protection
 * Blocks internal network addresses and non-HTTP(S) protocols
 * @param {string} website - The website URL
 * @returns {string} The validated, clean domain without www prefix
 * @throws {Error} If URL is invalid, uses blocked protocol, or points to internal network
 */
function validateAndExtractDomain(website) {
  if (!website || typeof website !== 'string') {
    throw new Error('Invalid website: URL is required');
  }

  // Parse URL properly
  let url;
  try {
    url = new URL(website.startsWith('http') ? website : `https://${website}`);
  } catch {
    throw new Error('Invalid website: Unable to parse URL');
  }

  // Only allow http/https protocols
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Invalid protocol: Only http and https are allowed`);
  }

  const hostname = url.hostname.toLowerCase();

  // Block localhost variations
  if (hostname === 'localhost' || hostname === 'localhost.localdomain') {
    throw new Error('Blocked domain: localhost is not allowed');
  }

  // Check for IP addresses and block internal ranges
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipMatch = hostname.match(ipv4Regex);

  if (ipMatch) {
    const octets = ipMatch.slice(1).map(Number);
    const [a, b, c, d] = octets;

    // Validate IP octets are in valid range
    if (octets.some(o => o > 255)) {
      throw new Error('Invalid IP address');
    }

    // Block 127.x.x.x (loopback)
    if (a === 127) {
      throw new Error('Blocked domain: Loopback addresses (127.x.x.x) are not allowed');
    }

    // Block 10.x.x.x (private)
    if (a === 10) {
      throw new Error('Blocked domain: Private network addresses (10.x.x.x) are not allowed');
    }

    // Block 172.16.x.x - 172.31.x.x (private)
    if (a === 172 && b >= 16 && b <= 31) {
      throw new Error('Blocked domain: Private network addresses (172.16-31.x.x) are not allowed');
    }

    // Block 192.168.x.x (private)
    if (a === 192 && b === 168) {
      throw new Error('Blocked domain: Private network addresses (192.168.x.x) are not allowed');
    }

    // Block 169.254.x.x (link-local)
    if (a === 169 && b === 254) {
      throw new Error('Blocked domain: Link-local addresses (169.254.x.x) are not allowed');
    }

    // Block 0.x.x.x (invalid/reserved)
    if (a === 0) {
      throw new Error('Blocked domain: Reserved addresses (0.x.x.x) are not allowed');
    }
  }

  // Check for IPv6 localhost (::1) and other internal IPv6
  if (hostname === '[::1]' || hostname === '::1') {
    throw new Error('Blocked domain: IPv6 loopback is not allowed');
  }

  // Return clean domain without www prefix
  return hostname.replace(/^www\./, '');
}

/**
 * Sleep for a specified number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Build a dynamic SQL UPDATE statement from an object of fields
 * @param {string} table - Table name
 * @param {Object} data - Object with field names and values
 * @param {string} idField - Name of the ID field (default: 'id')
 * @returns {{ sql: string, values: any[] } | null} SQL and values, or null if no fields
 */
function buildUpdateQuery(table, data, idField = 'id') {
  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(data)) {
    if (key === idField || value === undefined) continue;

    // Handle boolean conversion for SQLite
    if (typeof value === 'boolean') {
      fields.push(`${key} = ?`);
      values.push(value ? 1 : 0);
    } else {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return null;

  const sql = `UPDATE ${table} SET ${fields.join(', ')} WHERE ${idField} = ?`;
  return { sql, values };
}

/**
 * Validate that an ID is a positive integer
 * @param {any} id - The ID to validate
 * @returns {number} The validated ID as a number
 * @throws {Error} If ID is invalid
 */
function validateId(id) {
  const num = Number(id);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error(`Invalid ID: ${id} must be a positive integer`);
  }
  return num;
}

/**
 * Validate an array of IDs
 * @param {any[]} ids - Array of IDs to validate
 * @param {number} maxBatch - Maximum batch size (default: 1000)
 * @returns {number[]} Array of validated IDs
 * @throws {Error} If any ID is invalid or array exceeds max size
 */
function validateIds(ids, maxBatch = 1000) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('Invalid IDs: must be a non-empty array');
  }
  if (ids.length > maxBatch) {
    throw new Error(`Invalid IDs: maximum ${maxBatch} items per batch`);
  }
  return ids.map(validateId);
}

/**
 * Escape a value for CSV output
 * @param {any} val - Value to escape
 * @returns {string} CSV-safe string
 */
function escapeCSV(val) {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Safely extract a string value from external API response
 * @param {any} value - The value to validate
 * @param {number} maxLength - Maximum allowed length (default: 500)
 * @returns {string|null} Validated string or null
 */
function safeString(value, maxLength = 500) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const str = String(value).trim();
  return str.length > 0 && str.length <= maxLength ? str : null;
}

/**
 * Safely extract an array of strings from external API response
 * @param {any} value - The value to validate
 * @param {number} maxItems - Maximum number of items (default: 10)
 * @param {number} itemMaxLength - Maximum length per item (default: 200)
 * @returns {string[]} Validated array of strings
 */
function safeArray(value, maxItems = 10, itemMaxLength = 200) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maxItems)
    .map(item => safeString(item, itemMaxLength))
    .filter(Boolean);
}

/**
 * Sanitize a contact field by removing HTML tags and angle brackets
 * @param {any} value - The value to sanitize
 * @returns {string|null} Sanitized string or null
 */
function sanitizeContactField(value) {
  if (!value || typeof value !== 'string') return null;
  return value
    .replace(/<[^>]*>/g, '')  // Remove HTML tags
    .replace(/[<>]/g, '')     // Remove angle brackets
    .trim() || null;
}

module.exports = {
  sanitizeErrorMessage,
  extractDomain,
  validateAndExtractDomain,
  sleep,
  buildUpdateQuery,
  validateId,
  validateIds,
  escapeCSV,
  safeString,
  safeArray,
  sanitizeContactField
};
