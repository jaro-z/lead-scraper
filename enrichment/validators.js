/**
 * Email and Phone Validators
 * PRD-WATERFALL-ENRICHMENT: Step 3 - Email Validation
 */

const dns = require('dns').promises;

/**
 * Validate email format and MX records (FREE, no API needed)
 * @param {string} email - Email address to validate
 * @returns {Promise<{valid: boolean, reason: string, mxHost?: string}>}
 */
async function validateEmail(email) {
  // 1. Format check
  const formatRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!formatRegex.test(email)) {
    return { valid: false, reason: 'invalid_format' };
  }

  // 2. Extract domain
  const domain = email.split('@')[1];
  if (!domain) {
    return { valid: false, reason: 'invalid_domain' };
  }

  // 3. MX record check
  try {
    const mxRecords = await dns.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      return { valid: false, reason: 'no_mx_records' };
    }
    // Sort by priority (lowest = highest priority)
    mxRecords.sort((a, b) => a.priority - b.priority);
    return {
      valid: true,
      reason: 'valid',
      mxHost: mxRecords[0].exchange
    };
  } catch (err) {
    return {
      valid: false,
      reason: 'mx_lookup_failed',
      error: err.code || err.message
    };
  }
}

/**
 * Validate Czech phone number format
 * @param {string} phone - Phone number to validate
 * @returns {{valid: boolean, reason?: string, normalized?: string}}
 */
function validatePhone(phone) {
  if (!phone) {
    return { valid: false, reason: 'empty' };
  }

  // Remove spaces, dashes, parentheses, dots
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');

  // Czech formats: +420XXXXXXXXX or 00420XXXXXXXXX or XXXXXXXXX (9 digits)
  const czechRegex = /^(\+420|00420)?[1-9][0-9]{8}$/;

  if (!czechRegex.test(cleaned)) {
    return { valid: false, reason: 'invalid_format' };
  }

  // Normalize to +420 format
  let normalized = cleaned;
  if (normalized.startsWith('00420')) {
    normalized = '+420' + normalized.slice(5);
  } else if (!normalized.startsWith('+')) {
    normalized = '+420' + normalized;
  }

  return {
    valid: true,
    normalized
  };
}

/**
 * Batch validate emails with concurrency control
 * @param {string[]} emails - Array of email addresses
 * @param {number} concurrency - Max concurrent validations (default: 5)
 * @returns {Promise<Map<string, {valid: boolean, reason: string}>>}
 */
async function validateEmailsBatch(emails, concurrency = 5) {
  const results = new Map();
  const queue = [...emails];

  async function worker() {
    while (queue.length > 0) {
      const email = queue.shift();
      if (email) {
        results.set(email, await validateEmail(email));
      }
    }
  }

  // Start workers
  const workers = [];
  for (let i = 0; i < Math.min(concurrency, emails.length); i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return results;
}

module.exports = {
  validateEmail,
  validatePhone,
  validateEmailsBatch
};
