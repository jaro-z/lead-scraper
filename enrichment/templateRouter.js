/**
 * Template Router - Role to Template Matching
 * PRD-WATERFALL-ENRICHMENT: Step 4 - Template Routing
 *
 * Maps contact roles to appropriate outreach templates based on
 * their position/title. Supports both Czech and English role names.
 */

/**
 * Role patterns mapped to template types
 * Format: regex pattern (case-insensitive) => template name
 */
const ROLE_TEMPLATES = {
  // CEO/Founders/Owners - Strategic Partnership
  'ceo|founder|owner|jednatel|majitel|zakladatel': 'strategic_partnership',

  // COO/Operations - Process Automation
  'coo|operations|provozni|provoz': 'process_automation',

  // CFO/Finance - Backoffice/Finance
  'cfo|finance|financni|ucetni': 'backoffice_finance',

  // CMO/Marketing - Marketing Automation
  'cmo|marketing|marketingovy': 'marketing_automation',

  // CTO/Tech/IT - Tech Integration
  'cto|tech|it|technicky|developer': 'tech_integration'
};

/**
 * Assign a template type based on contact role/title
 * @param {string} role - The contact's job title/role
 * @returns {string} Template type: 'strategic_partnership', 'process_automation',
 *                   'backoffice_finance', 'marketing_automation', 'tech_integration', or 'generic'
 */
function assignTemplate(role) {
  if (!role) return 'generic';

  const normalizedRole = role.toLowerCase();

  for (const [pattern, template] of Object.entries(ROLE_TEMPLATES)) {
    if (new RegExp(pattern, 'i').test(normalizedRole)) {
      return template;
    }
  }

  return 'generic';
}

/**
 * Get all available template types
 * @returns {string[]} Array of template type names
 */
function getTemplateTypes() {
  return [...new Set(Object.values(ROLE_TEMPLATES)), 'generic'];
}

/**
 * Batch assign templates to multiple contacts
 * @param {Array<{role: string}>} contacts - Array of contacts with role property
 * @returns {Array<{role: string, template: string}>} Contacts with assigned templates
 */
function assignTemplatesBatch(contacts) {
  return contacts.map(contact => ({
    ...contact,
    template: assignTemplate(contact.role || contact.title)
  }));
}

module.exports = {
  assignTemplate,
  ROLE_TEMPLATES,
  getTemplateTypes,
  assignTemplatesBatch
};
