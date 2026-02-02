// State
let currentView = 'dashboard';
let currentSearchId = null;
let companies = [];
let filteredCompanies = [];
let selectedIds = new Set();
let sortColumn = 'name';
let sortDirection = 'asc';
let viewMode = 'simple';

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
  document.getElementById('category-filter').addEventListener('change', applyFilters);

  // View toggle
  document.getElementById('simple-view-btn').addEventListener('click', () => setViewMode('simple'));
  document.getElementById('full-view-btn').addEventListener('click', () => setViewMode('full'));

  // Select all
  document.getElementById('select-all').addEventListener('change', handleSelectAll);

  // Delete selected
  document.getElementById('delete-selected-btn').addEventListener('click', handleDeleteSelected);

  // Export
  document.getElementById('export-btn').addEventListener('click', handleExport);

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
    updateCategoryFilter();
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
      <td>${escapeHtml(c.address || '-')}</td>
      <td>${escapeHtml(formatCategory(c.category))}</td>
      <td>${c.website ? `<a href="${escapeHtml(c.website)}" target="_blank">Link</a>` : '-'}</td>
      <td>${c.rating ? `<span class="rating"><span class="star">★</span> ${c.rating}</span>` : '-'}</td>
      <td>${c.rating_count || '-'}</td>
      <td>${formatDate(c.created_at)}</td>
      <td>
        <button class="view-details-btn" title="View details">👁</button>
        <button class="delete-btn" title="Delete">×</button>
      </td>
    </tr>
  `).join('');

  document.getElementById('results-count').textContent = `Showing ${sorted.length} of ${companies.length} companies`;

  // Add event listeners
  resultsBody.querySelectorAll('.row-checkbox').forEach(cb => {
    cb.addEventListener('change', handleRowSelect);
  });

  resultsBody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.closest('tr').dataset.id);
      handleDelete(id);
    });
  });

  resultsBody.querySelectorAll('.view-details-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.closest('tr').dataset.id);
      showDetails(id);
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
  const category = document.getElementById('category-filter').value;

  filteredCompanies = companies.filter(c => {
    const matchesSearch = !searchTerm ||
      (c.name && c.name.toLowerCase().includes(searchTerm)) ||
      (c.address && c.address.toLowerCase().includes(searchTerm)) ||
      (c.category && c.category.toLowerCase().includes(searchTerm));

    const matchesCategory = !category || c.category === category;

    return matchesSearch && matchesCategory;
  });

  renderCompanies();
}

function updateCategoryFilter() {
  const categories = [...new Set(companies.map(c => c.category).filter(Boolean))].sort();
  const select = document.getElementById('category-filter');

  select.innerHTML = '<option value="">All Categories</option>' +
    categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(formatCategory(c))}</option>`).join('');
}

function setViewMode(mode) {
  viewMode = mode;
  document.getElementById('simple-view-btn').classList.toggle('active', mode === 'simple');
  document.getElementById('full-view-btn').classList.toggle('active', mode === 'full');

  // For now, full view opens the side panel on row click
  // Simple view is the default table
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

function showDetails(id) {
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
    <div class="field">
      <div class="field-label">Business Status</div>
      <div class="field-value">${escapeHtml(company.business_status || '-')}</div>
    </div>
    <div class="field">
      <div class="field-label">Price Level</div>
      <div class="field-value">${company.price_level ? '$'.repeat(company.price_level) : '-'}</div>
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
      <div class="field-label">Coordinates</div>
      <div class="field-value">${company.lat && company.lng ? `${company.lat}, ${company.lng}` : '-'}</div>
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

function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}
