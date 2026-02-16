/**
 * Enrichment Module
 * PRD-WATERFALL-ENRICHMENT: Main orchestrator for lead enrichment
 *
 * Exports all enrichment utilities:
 * - hunter: Hunter.io API integration (from root)
 * - validators: Email MX and phone validation
 * - ares: Czech IČO validation via ARES API
 * - webScraper: Team/contact page scraping (FREE)
 * - companyEnricher: Company categorization via Claude API
 * - contactWaterfall: Waterfall contact discovery orchestrator
 * - templateRouter: Role to template matching
 */

const hunter = require('../hunter');
const validators = require('./validators');
const ares = require('./ares');
const webScraper = require('./webScraper');
const companyEnricher = require('./companyEnricher');
const contactWaterfall = require('./contactWaterfall');
const templateRouter = require('./templateRouter');

module.exports = {
  // Module exports
  hunter,
  validators,
  ares,
  webScraper,
  companyEnricher,
  contactWaterfall,
  templateRouter,

  // Re-export commonly used functions for convenience

  // Validators
  validateEmail: validators.validateEmail,
  validatePhone: validators.validatePhone,
  validateEmailsBatch: validators.validateEmailsBatch,

  // ARES
  validateICO: ares.validateICO,
  extractICO: ares.extractICO,
  validateICOsBatch: ares.validateICOsBatch,

  // Web Scraper
  scrapeTeamPages: webScraper.scrapeTeamPages,
  fetchPage: webScraper.fetchPage,
  extractContactsWithClaude: webScraper.extractContactsWithClaude,

  // Company Enricher
  enrichCompany: companyEnricher.enrichCompany,
  enrichCompaniesBatch: companyEnricher.enrichCompaniesBatch,

  // Contact Waterfall
  discoverContacts: contactWaterfall.discoverContacts,
  discoverContactsBatch: contactWaterfall.discoverContactsBatch,
  getWaterfallStats: contactWaterfall.getWaterfallStats,

  // Template Router
  assignTemplate: templateRouter.assignTemplate,
  ROLE_TEMPLATES: templateRouter.ROLE_TEMPLATES,
  getTemplateTypes: templateRouter.getTemplateTypes,
  assignTemplatesBatch: templateRouter.assignTemplatesBatch
};
