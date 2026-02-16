// State
let currentView = 'dashboard';
let currentSearchId = null;
let companies = [];
let filteredCompanies = [];
let selectedIds = new Set();
let sortColumn = 'name';
let sortDirection = 'asc';

// DOM Elements
const dashboardView = document.getElementById('dashboard-view');
const resultsView = document.getElementById('results-view');
const searchesList = document.getElementById('searches-list');
const resultsBody = document.getElementById('results-body');
const apiUsage = document.getElementById('api-usage');
const searchModal = document.getElementById('search-modal');
const progressModal = document.getElementById('progress-modal');
const fullViewPanel = document.getElementById('full-view-panel');

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadApiUsage();
  await loadSearches();
  setupEventListeners();
}

function setupEventListeners() {
  // New search
  document.getElementById('new-search-btn').addEventListener('click', () => showModal(searchModal));
  document.getElementById('cancel-search').addEventListener('click', () => hideModal(searchModal));
  document.getElementById('search-form').addEventListener('submit', handleNewSearch);

  // Back to dashboard
  document.getElementById('back-btn').addEventListener('click', showDashboard);

  // Filters
  document.getElementById('search-filter').addEventListener('input', debounce(applyFilters, 200));
  document.getElementById('website-filter').addEventListener('change', applyFilters);


  // Select all
  document.getElementById('select-all').addEventListener('change', handleSelectAll);

  // Delete selected
  document.getElementById('delete-selected-btn').addEventListener('click', handleDeleteSelected);

  // Export
  document.getElementById('export-btn').addEventListener('click', handleExport);

  // Enrich with Hunter
  document.getElementById('enrich-btn').addEventListener('click', handleEnrich);

  // AI Waterfall Enrich
  document.getElementById('waterfall-enrich-btn').addEventListener('click', handleWaterfallEnrich);

  // Close panel
  document.getElementById('close-panel').addEventListener('click', () => fullViewPanel.classList.add('hidden'));

  // Table sorting
  document.querySelectorAll('#results-table th.sortable').forEach(th => {
    th.addEventListener('click', () => handleSort(th.dataset.sort));
  });

  // Close modals on backdrop click
  [searchModal, progressModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) hideModal(modal);
    });
  });
}

// ============ API Calls ============

async function loadApiUsage() {
  try {
    const res = await fetch('/api/usage');
    const data = await res.json();
    apiUsage.textContent = `API: ${data.used}/${data.limit} this month`;
    apiUsage.classList.remove('warning', 'danger');
    if (data.used >= data.limit) {
      apiUsage.classList.add('danger');
    } else if (data.used >= data.limit * 0.8) {
      apiUsage.classList.add('warning');
    }
  } catch (error) {
    apiUsage.textContent = 'API: Error loading';
  }
}

async function loadSearches() {
  try {
    const res = await fetch('/api/searches');
    const searches = await res.json();
    renderSearches(searches);
  } catch (error) {
    console.error('Error loading searches:', error);
  }
}

async function loadCompanies(searchId) {
  try {
    const res = await fetch(`/api/searches/${searchId}/companies`);
    companies = await res.json();
    filteredCompanies = [...companies];
    renderCompanies();
  } catch (error) {
    console.error('Error loading companies:', error);
  }
}

// ============ Render Functions ============

function renderSearches(searches) {
  if (!searches.length) {
    searchesList.innerHTML = '<p class="empty-state">No searches yet. Click "New Search" to get started.</p>';
    return;
  }

  searchesList.innerHTML = searches.map(s => `
    <div class="search-card" data-id="${s.id}">
      <div class="search-card-info">
        <h3>${escapeHtml(s.query)}</h3>
        <div class="meta">${escapeHtml(s.location)} &bull; ${formatDate(s.created_at)} &bull; ${s.grid_size} grid</div>
      </div>
      <div class="search-card-stats">
        <span class="status ${s.status}">${s.status}</span>
        <div class="count">${s.result_count || 0}</div>
        <div class="label">results</div>
      </div>
    </div>
  `).join('');

  // Add click handlers
  searchesList.querySelectorAll('.search-card').forEach(card => {
    card.addEventListener('click', () => showResults(card.dataset.id));
  });
}

function renderCompanies() {
  const sorted = sortCompanies(filteredCompanies);

  if (!sorted.length) {
    resultsBody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;">No results found</td></tr>';
    document.getElementById('results-count').textContent = '';
    return;
  }

  resultsBody.innerHTML = sorted.map(c => `
    <tr data-id="${c.id}">
      <td><input type="checkbox" class="row-checkbox" ${selectedIds.has(c.id) ? 'checked' : ''}></td>
      <td>${escapeHtml(c.name || '-')}</td>
      <td>${escapeHtml(extractCity(c.address))}</td>
      <td>${escapeHtml(formatCategory(c.category))}</td>
      <td>${formatSegmentBadge(c.segment, c.enrichment_source)}</td>
      <td>${c.website ? `<a href="${escapeHtml(c.website)}" target="_blank">${escapeHtml(formatWebsiteUrl(c.website))}</a>` : '-'}</td>
      <td>${c.rating ? `<span class="rating"><span class="star">★</span> ${c.rating}</span>` : '-'}</td>
      <td>${c.primary_email ? `<a href="mailto:${escapeHtml(c.primary_email)}" class="email-link">${escapeHtml(c.primary_email)}</a>` : (c.contacts_count > 0 ? `<span class="contacts-badge">${c.contacts_count}</span>` : '-')}</td>
      <td>
        <div class="action-icons">
          ${c.website && !c.enrichment_source ? `
          <button class="icon-btn enrich-btn" title="AI Enrich">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
          </button>
          ` : ''}
          <button class="icon-btn view-btn" title="View details">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>
          <button class="icon-btn delete-btn" title="Delete">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  document.getElementById('results-count').textContent = `Showing ${sorted.length} of ${companies.length} companies`;

  // Add event listeners
  resultsBody.querySelectorAll('.row-checkbox').forEach(cb => {
    cb.addEventListener('change', handleRowSelect);
  });

  resultsBody.querySelectorAll('.icon-btn.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.closest('tr').dataset.id);
      handleDelete(id);
    });
  });

  resultsBody.querySelectorAll('.icon-btn.view-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.closest('tr').dataset.id);
      showDetails(id);
    });
  });

  resultsBody.querySelectorAll('.icon-btn.enrich-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.closest('tr').dataset.id);
      handleSingleEnrich(id, btn);
    });
  });
}

// ============ Event Handlers ============

async function handleNewSearch(e) {
  e.preventDefault();

  const query = document.getElementById('query').value.trim();
  const location = document.getElementById('location').value.trim();
  const gridSize = document.getElementById('grid-size').value;

  hideModal(searchModal);
  showModal(progressModal);

  try {
    const res = await fetch('/api/searches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, location, gridSize })
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error);
    }

    const { id } = await res.json();

    // Listen to progress
    const eventSource = new EventSource(`/api/searches/${id}/progress`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      updateProgress(data);

      if (data.status === 'completed' || data.status === 'error') {
        eventSource.close();
        setTimeout(() => {
          hideModal(progressModal);
          loadApiUsage();
          if (data.status === 'completed') {
            showResults(id);
          } else {
            loadSearches();
            alert('Search failed: ' + data.message);
          }
        }, 1000);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      hideModal(progressModal);
      loadSearches();
    };

  } catch (error) {
    hideModal(progressModal);
    alert('Error: ' + error.message);
  }

  // Reset form
  document.getElementById('search-form').reset();
}

function updateProgress(data) {
  const status = document.getElementById('progress-status');
  const fill = document.getElementById('progress-fill');
  const details = document.getElementById('progress-details');

  status.textContent = data.message || data.status;

  if (data.totalCells) {
    const percent = (data.cell / data.totalCells) * 100;
    fill.style.width = percent + '%';
  }

  if (data.totalResults !== undefined) {
    details.textContent = `Found ${data.totalResults} results (${data.newResults} new)`;
  }
}

async function showResults(searchId) {
  currentSearchId = searchId;
  currentView = 'results';

  // Get search info
  const res = await fetch(`/api/searches/${searchId}`);
  const search = await res.json();

  document.getElementById('search-title').textContent = search.query;
  document.getElementById('search-meta').textContent = `${search.location} • ${formatDate(search.created_at)}`;

  dashboardView.classList.add('hidden');
  resultsView.classList.remove('hidden');

  await loadCompanies(searchId);
}

function showDashboard() {
  currentView = 'dashboard';
  currentSearchId = null;
  companies = [];
  filteredCompanies = [];
  selectedIds.clear();

  resultsView.classList.add('hidden');
  dashboardView.classList.remove('hidden');

  loadSearches();
}

function handleSort(column) {
  if (sortColumn === column) {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    sortColumn = column;
    sortDirection = 'asc';
  }

  // Update UI
  document.querySelectorAll('#results-table th.sortable').forEach(th => {
    th.classList.remove('asc', 'desc');
    if (th.dataset.sort === sortColumn) {
      th.classList.add(sortDirection);
    }
  });

  renderCompanies();
}

function sortCompanies(list) {
  return [...list].sort((a, b) => {
    let aVal = a[sortColumn];
    let bVal = b[sortColumn];

    // Handle nulls
    if (aVal == null) aVal = '';
    if (bVal == null) bVal = '';

    // Numeric columns
    if (['rating', 'rating_count'].includes(sortColumn)) {
      aVal = parseFloat(aVal) || 0;
      bVal = parseFloat(bVal) || 0;
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });
}

function applyFilters() {
  const searchTerm = document.getElementById('search-filter').value.toLowerCase();
  const hasWebsite = document.getElementById('website-filter').checked;

  filteredCompanies = companies.filter(c => {
    const matchesSearch = !searchTerm ||
      (c.name && c.name.toLowerCase().includes(searchTerm)) ||
      (c.address && c.address.toLowerCase().includes(searchTerm)) ||
      (c.category && c.category.toLowerCase().includes(searchTerm));

    const matchesWebsite = !hasWebsite || c.website;

    return matchesSearch && matchesWebsite;
  });

  renderCompanies();
}



function handleSelectAll(e) {
  const checked = e.target.checked;
  if (checked) {
    filteredCompanies.forEach(c => selectedIds.add(c.id));
  } else {
    selectedIds.clear();
  }
  updateDeleteButton();
  renderCompanies();
}

function handleRowSelect(e) {
  const id = parseInt(e.target.closest('tr').dataset.id);
  if (e.target.checked) {
    selectedIds.add(id);
  } else {
    selectedIds.delete(id);
  }
  updateDeleteButton();
}

function updateDeleteButton() {
  const btn = document.getElementById('delete-selected-btn');
  if (selectedIds.size > 0) {
    btn.classList.remove('hidden');
    btn.textContent = `Delete Selected (${selectedIds.size})`;
  } else {
    btn.classList.add('hidden');
  }
}

async function handleDelete(id) {
  if (!confirm('Delete this company?')) return;

  try {
    await fetch(`/api/companies/${id}`, { method: 'DELETE' });
    companies = companies.filter(c => c.id !== id);
    filteredCompanies = filteredCompanies.filter(c => c.id !== id);
    selectedIds.delete(id);
    renderCompanies();
    updateDeleteButton();
  } catch (error) {
    alert('Error deleting: ' + error.message);
  }
}

async function handleDeleteSelected() {
  if (!confirm(`Delete ${selectedIds.size} companies?`)) return;

  try {
    await fetch('/api/companies/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedIds) })
    });

    companies = companies.filter(c => !selectedIds.has(c.id));
    filteredCompanies = filteredCompanies.filter(c => !selectedIds.has(c.id));
    selectedIds.clear();
    document.getElementById('select-all').checked = false;
    renderCompanies();
    updateDeleteButton();
  } catch (error) {
    alert('Error deleting: ' + error.message);
  }
}

function handleExport() {
  window.location.href = `/api/searches/${currentSearchId}/export`;
}

async function handleEnrich() {
  // Get companies to enrich (selected or all with websites but no email yet)
  const toEnrich = selectedIds.size > 0
    ? companies.filter(c => selectedIds.has(c.id) && c.website && !c.enriched_at)
    : companies.filter(c => c.website && !c.enriched_at);

  if (!toEnrich.length) {
    alert('No companies to enrich. Make sure they have websites and haven\'t been enriched yet.');
    return;
  }

  if (!confirm(`Find emails for ${toEnrich.length} companies using Hunter.io?\n\nThis uses your Hunter API credits.`)) {
    return;
  }

  const btn = document.getElementById('enrich-btn');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQb_VzR1613Ir5hKIcvy3ZN41rtf18rvA6qfA&s" alt="Hunter" class="hunter-logo"> Finding emails...';

  let enriched = 0;
  let totalContacts = 0;

  for (let i = 0; i < toEnrich.length; i++) {
    const company = toEnrich[i];
    btn.innerHTML = `<img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQb_VzR1613Ir5hKIcvy3ZN41rtf18rvA6qfA&s" alt="Hunter" class="hunter-logo"> ${i + 1}/${toEnrich.length}...`;

    try {
      const res = await fetch(`/api/companies/${company.id}/enrich`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.contactsFound > 0) {
          enriched++;
          totalContacts += data.contactsFound;
          // Update local data
          company.enriched_at = new Date().toISOString();
          company.contacts_count = data.contactsFound;
          if (data.primaryContact) {
            company.primary_email = data.primaryContact.email;
          }
        }
      }
    } catch (err) {
      console.error(`Error enriching ${company.name}:`, err);
    }

    // Small delay between requests
    await new Promise(r => setTimeout(r, 100));
  }

  btn.disabled = false;
  btn.innerHTML = originalText;

  alert(`Done! Found ${totalContacts} contacts for ${enriched} companies.`);
  renderCompanies();
}

async function handleWaterfallEnrich() {
  // Get companies to enrich (selected or all with websites but not enriched yet)
  const toEnrich = selectedIds.size > 0
    ? companies.filter(c => selectedIds.has(c.id) && c.website && !c.enrichment_source)
    : companies.filter(c => c.website && !c.enrichment_source);

  if (!toEnrich.length) {
    alert('No companies to enrich. Make sure they have websites and haven\'t been enriched yet.');
    return;
  }

  if (!confirm(`AI Enrich ${toEnrich.length} companies?\n\nThis uses Claude AI to:\n• Extract IČO & company segment\n• Scrape team pages for contacts (FREE)\n• Fallback to Hunter.io if needed\n• Validate emails via MX check`)) {
    return;
  }

  const btn = document.getElementById('waterfall-enrich-btn');
  const originalText = btn.innerHTML;
  btn.disabled = true;

  let enriched = 0;
  let totalContacts = 0;
  const errors = [];

  for (let i = 0; i < toEnrich.length; i++) {
    const company = toEnrich[i];
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="waterfall-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" /></svg> ${i + 1}/${toEnrich.length}...`;

    try {
      const res = await fetch(`/api/companies/${company.id}/enrich-full`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        enriched++;
        // Update local data
        company.enrichment_source = 'waterfall_full';
        company.segment = data.enrichment?.segment;
        company.industry = data.enrichment?.industry;
        company.ico = data.enrichment?.ico;
        if (data.contacts?.length > 0) {
          totalContacts += data.contacts.length;
          company.contacts_count = data.contacts.length;
          const primary = data.contacts.find(c => c.email);
          if (primary) company.primary_email = primary.email;
        }
      } else {
        const err = await res.json();
        errors.push(`${company.name}: ${err.error}`);
      }
    } catch (err) {
      errors.push(`${company.name}: ${err.message}`);
    }

    // Delay between requests
    await new Promise(r => setTimeout(r, 500));
  }

  btn.disabled = false;
  btn.innerHTML = originalText;

  let msg = `Done! Enriched ${enriched}/${toEnrich.length} companies.\nFound ${totalContacts} contacts.`;
  if (errors.length > 0) {
    msg += `\n\n${errors.length} errors:\n${errors.slice(0, 5).join('\n')}`;
    if (errors.length > 5) msg += `\n...and ${errors.length - 5} more`;
  }
  alert(msg);
  await loadCompanies(currentSearchId);
}

async function handleSingleEnrich(id, btn) {
  const company = companies.find(c => c.id === id);
  if (!company) return;

  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<svg class="animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:16px;height:16px;animation:spin 1s linear infinite;"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" opacity="0.25"></circle><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>';

  try {
    const res = await fetch(`/api/companies/${id}/enrich-full`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      company.enrichment_source = 'waterfall_full';
      company.segment = data.enrichment?.segment;
      company.industry = data.enrichment?.industry;
      company.ico = data.enrichment?.ico;
      if (data.contacts?.length > 0) {
        company.contacts_count = data.contacts.length;
        const primary = data.contacts.find(c => c.email);
        if (primary) company.primary_email = primary.email;
      }
      renderCompanies();
    } else {
      const err = await res.json();
      alert(`Error: ${err.error}`);
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

async function showDetails(id) {
  const company = companies.find(c => c.id === id);
  if (!company) return;

  const content = document.getElementById('panel-content');

  // Parse JSON fields
  let openingHours = null;
  let types = null;
  try {
    if (company.opening_hours) openingHours = JSON.parse(company.opening_hours);
    if (company.types) types = JSON.parse(company.types);
  } catch (e) {}

  // Fetch contacts if enriched
  let contactsHtml = '-';
  if (company.contacts_count > 0) {
    try {
      const res = await fetch(`/api/companies/${id}/contacts`);
      const contacts = await res.json();
      if (contacts.length) {
        contactsHtml = contacts.map(c => `
          <div class="contact-card ${c.is_primary ? 'primary' : ''}">
            <div class="contact-name">${escapeHtml(c.full_name || c.email)}</div>
            <div class="contact-email"><a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a></div>
            ${c.title ? `<div class="contact-title">${escapeHtml(c.title)}</div>` : ''}
            <div class="contact-confidence">${c.confidence}% confidence</div>
          </div>
        `).join('');
      }
    } catch (e) {}
  }

  content.innerHTML = `
    <div class="field">
      <div class="field-label">Name</div>
      <div class="field-value">${escapeHtml(company.name || '-')}</div>
    </div>
    <div class="field">
      <div class="field-label">Address</div>
      <div class="field-value">${escapeHtml(company.address || '-')}</div>
    </div>
    <div class="field">
      <div class="field-label">Category</div>
      <div class="field-value">${escapeHtml(formatCategory(company.category))}</div>
    </div>
    ${company.segment ? `
    <div class="field">
      <div class="field-label">Segment</div>
      <div class="field-value">${formatSegmentBadge(company.segment, company.enrichment_source)}</div>
    </div>
    ` : ''}
    ${company.industry ? `
    <div class="field">
      <div class="field-label">Industry</div>
      <div class="field-value">${escapeHtml(company.industry)}</div>
    </div>
    ` : ''}
    ${company.ico ? `
    <div class="field">
      <div class="field-label">IČO (Czech ID)</div>
      <div class="field-value">
        <span class="ico-badge ${company.ico_validated ? 'validated' : ''}">
          ${escapeHtml(company.ico)}
          ${company.ico_validated ? '<svg class="check-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>' : ''}
        </span>
      </div>
    </div>
    ` : ''}
    ${company.company_size ? `
    <div class="field">
      <div class="field-label">Company Size</div>
      <div class="field-value">${escapeHtml(company.company_size)}</div>
    </div>
    ` : ''}
    <div class="field">
      <div class="field-label">Website</div>
      <div class="field-value">${company.website ? `<a href="${escapeHtml(company.website)}" target="_blank">${escapeHtml(company.website)}</a>` : '-'}</div>
    </div>
    <div class="field">
      <div class="field-label">Phone</div>
      <div class="field-value">${escapeHtml(company.phone || '-')}</div>
    </div>
    <div class="field">
      <div class="field-label">Rating</div>
      <div class="field-value">${company.rating ? `${company.rating} (${company.rating_count} reviews)` : '-'}</div>
    </div>
    <div class="field contacts-section">
      <div class="field-label">Contacts</div>
      <div class="field-value">${contactsHtml}</div>
    </div>
    ${company.enrichment_source ? `
    <div class="field">
      <div class="field-label">Enrichment Source</div>
      <div class="field-value"><span class="enrichment-badge ${company.enrichment_source.includes('web') ? 'web_scrape' : 'hunter'}">${escapeHtml(company.enrichment_source)}</span></div>
    </div>
    ` : ''}
    <div class="field">
      <div class="field-label">Business Status</div>
      <div class="field-value">${escapeHtml(company.business_status || '-')}</div>
    </div>
    <div class="field">
      <div class="field-label">Types</div>
      <div class="field-value">${types ? types.map(t => formatCategory(t)).join(', ') : '-'}</div>
    </div>
    <div class="field">
      <div class="field-label">Opening Hours</div>
      <div class="field-value">${openingHours?.weekdayDescriptions ? openingHours.weekdayDescriptions.join('<br>') : '-'}</div>
    </div>
    <div class="field">
      <div class="field-label">Google Place ID</div>
      <div class="field-value" style="font-size:11px;word-break:break-all;">${escapeHtml(company.place_id)}</div>
    </div>
  `;

  fullViewPanel.classList.remove('hidden');
}

// ============ Utilities ============

function showModal(modal) {
  modal.classList.remove('hidden');
}

function hideModal(modal) {
  modal.classList.add('hidden');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCategory(category) {
  if (!category) return '-';
  return category
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function extractCity(address) {
  if (!address) return '-';
  // Try to extract city from address
  // Common formats: "Street 123, City, Country" or "Street 123, 110 00 City, Country"
  const parts = address.split(',').map(p => p.trim());

  if (parts.length >= 2) {
    // Look for a part that looks like a city (not a street number, not a postal code)
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      // Skip if it looks like a postal code (starts with number)
      if (/^\d/.test(part)) {
        // But extract city after postal code: "110 00 Praha 1" -> "Praha"
        const match = part.match(/\d+\s*\d*\s+(.+)/);
        if (match) {
          // Remove district numbers like "Praha 1" -> "Praha"
          return match[1].replace(/\s*\d+$/, '').trim();
        }
        continue;
      }
      // Skip if it's a country (last part, common countries)
      if (i === parts.length - 1 && /^(czechia|czech republic|germany|austria|poland|hungary|slovakia)/i.test(part)) {
        continue;
      }
      // This is likely the city
      // Remove district numbers like "Praha 1" -> "Praha"
      return part.replace(/\s*\d+$/, '').trim();
    }
  }

  // Fallback: return first meaningful part
  return parts[0] || '-';
}

function formatWebsiteUrl(url) {
  if (!url) return '';
  // Remove protocol and www, truncate if too long
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').substring(0, 30) + (url.length > 40 ? '...' : '');
}

function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

function formatSegmentBadge(segment, enrichmentSource) {
  if (!segment && !enrichmentSource) return '-';
  if (!segment) return `<span class="enrichment-badge pending">Pending</span>`;

  const segmentClass = segment.toLowerCase().replace(/[^a-z]/g, '-');
  return `<span class="segment-badge ${segmentClass}">${escapeHtml(segment)}</span>`;
}
