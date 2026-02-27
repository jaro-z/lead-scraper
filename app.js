// State
let currentView = 'dashboard';
let currentSearchId = null;
let companies = [];
let filteredCompanies = [];
let selectedIds = new Set();
let sortColumn = 'name';
let sortDirection = 'asc';
let activeStageFilter = '';
let pipelineStats = { raw: 0, enriched: 0, qualified: 0, ready: 0, in_notion: 0, total: 0 };
let rowStatuses = new Map(); // Track inline status per row

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

  // Custom segment dropdown
  document.getElementById('segment-filter-btn').addEventListener('click', toggleSegmentDropdown);
  document.querySelectorAll('.custom-select-option').forEach(opt => {
    opt.addEventListener('click', () => selectSegment(opt));
  });
  document.addEventListener('click', closeSegmentDropdownOnClickOutside);

  // Stage pill clicks
  document.querySelectorAll('.stage-pill').forEach(pill => {
    pill.addEventListener('click', () => handleProgressClick(pill.dataset.stage));
  });

  // More menu toggle
  document.getElementById('more-menu-btn').addEventListener('click', toggleMoreMenu);
  document.addEventListener('click', closeMoreMenuOnClickOutside);

  // Main action button
  document.getElementById('main-action-btn').addEventListener('click', handleMainAction);

  // Select all
  document.getElementById('select-all').addEventListener('change', handleSelectAll);

  // Delete selected
  document.getElementById('delete-selected-btn').addEventListener('click', handleDeleteSelected);

  // Export
  document.getElementById('export-btn').addEventListener('click', handleExport);

  // Dedupe button
  document.getElementById('dedupe-btn').addEventListener('click', handleDedupe);

  // Push to Notion button
  document.getElementById('push-notion-btn').addEventListener('click', handlePushToNotion);

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

// More menu helpers
function toggleMoreMenu(e) {
  e.stopPropagation();
  document.getElementById('more-dropdown').classList.toggle('hidden');
}

function closeMoreMenuOnClickOutside(e) {
  const toolbarMore = document.querySelector('.toolbar-more');
  const dropdown = document.getElementById('more-dropdown');

  // Close dropdown if click is outside the toolbar-more container
  if (toolbarMore && dropdown && !toolbarMore.contains(e.target)) {
    dropdown.classList.add('hidden');
  }
}

// Segment dropdown helpers
function toggleSegmentDropdown(e) {
  e.stopPropagation();
  const wrapper = document.getElementById('segment-filter-wrapper');
  const dropdown = document.getElementById('segment-filter-dropdown');
  wrapper.classList.toggle('open');
  dropdown.classList.toggle('hidden');
}

function selectSegment(option) {
  const value = option.dataset.value;
  const text = option.textContent;

  // Update hidden input
  document.getElementById('segment-filter').value = value;

  // Update button text
  document.getElementById('segment-filter-text').textContent = text;

  // Update selected state
  document.querySelectorAll('.custom-select-option').forEach(opt => {
    opt.classList.remove('selected');
  });
  option.classList.add('selected');

  // Close dropdown
  document.getElementById('segment-filter-wrapper').classList.remove('open');
  document.getElementById('segment-filter-dropdown').classList.add('hidden');

  // Apply filter
  applyFilters();
}

function closeSegmentDropdownOnClickOutside(e) {
  const wrapper = document.getElementById('segment-filter-wrapper');
  const dropdown = document.getElementById('segment-filter-dropdown');

  if (wrapper && dropdown && !wrapper.contains(e.target)) {
    wrapper.classList.remove('open');
    dropdown.classList.add('hidden');
  }
}

// ============ Context Menu for Stage Movement ============

const stageContextMenu = document.getElementById('stage-context-menu');
let contextMenuTargetId = null;

// Close context menu when clicking elsewhere
document.addEventListener('click', (e) => {
  if (stageContextMenu && !stageContextMenu.contains(e.target)) {
    hideContextMenu();
  }
});

// Close on escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hideContextMenu();
  }
});

function showContextMenu(e, companyId) {
  e.preventDefault();
  contextMenuTargetId = companyId;

  const company = companies.find(c => c.id === companyId);
  const currentStage = company?.pipeline_stage || 'raw';

  // Update current stage indicator
  stageContextMenu.querySelectorAll('.context-menu-item').forEach(item => {
    item.classList.toggle('current', item.dataset.stage === currentStage);
  });

  // Position menu at cursor
  stageContextMenu.style.left = `${e.clientX}px`;
  stageContextMenu.style.top = `${e.clientY}px`;
  stageContextMenu.classList.remove('hidden');

  // Ensure menu stays within viewport
  const rect = stageContextMenu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    stageContextMenu.style.left = `${window.innerWidth - rect.width - 10}px`;
  }
  if (rect.bottom > window.innerHeight) {
    stageContextMenu.style.top = `${window.innerHeight - rect.height - 10}px`;
  }
}

function hideContextMenu() {
  if (stageContextMenu) {
    stageContextMenu.classList.add('hidden');
  }
  contextMenuTargetId = null;
}

async function handleStageChange(newStage) {
  if (!contextMenuTargetId) return;

  const companyId = contextMenuTargetId;
  hideContextMenu();

  try {
    setRowStatus(companyId, 'Moving...', 'processing');

    const res = await fetch(`/api/companies/${companyId}/stage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: newStage })
    });

    if (res.ok) {
      setRowStatus(companyId, formatStageStatus(newStage), 'done');
      // Update local data
      const company = companies.find(c => c.id === companyId);
      if (company) {
        company.pipeline_stage = newStage;
      }
      // Refresh stats
      await updatePipelineStats();
      // Re-render if filtered by stage
      if (activeStageFilter) {
        applyFilters();
      }
    } else {
      const err = await res.json();
      setRowStatus(companyId, 'Error', 'error');
      console.error('Failed to change stage:', err.error);
    }
  } catch (err) {
    setRowStatus(companyId, 'Error', 'error');
    console.error('Failed to change stage:', err.message);
  }
}

// Setup context menu item click handlers
if (stageContextMenu) {
  stageContextMenu.querySelectorAll('.context-menu-item').forEach(item => {
    item.addEventListener('click', () => handleStageChange(item.dataset.stage));
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
    updateMainActionButton();
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
        <div class="search-card-title">
          <h3>${escapeHtml(s.query)}</h3>
          <button class="search-delete-btn" title="Delete search">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="16" height="16">
              <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
          </button>
        </div>
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
    card.addEventListener('click', (e) => {
      if (e.target.closest('.search-delete-btn')) return;
      showResults(card.dataset.id);
    });
  });

  // Add delete handlers
  searchesList.querySelectorAll('.search-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const card = btn.closest('.search-card');
      const searchId = card.dataset.id;
      const searchName = card.querySelector('h3').textContent;

      if (confirm(`Delete search "${searchName}" and all its results?`)) {
        try {
          await fetch(`/api/searches/${searchId}`, { method: 'DELETE' });
          loadSearches();
        } catch (err) {
          console.error('Failed to delete search:', err);
          alert('Failed to delete search');
        }
      }
    });
  });
}

function renderCompanies() {
  const sorted = sortCompanies(filteredCompanies);

  if (!sorted.length) {
    resultsBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;">No results found</td></tr>';
    document.getElementById('results-count').textContent = '';
    return;
  }

  resultsBody.innerHTML = sorted.map(c => {
    const status = rowStatuses.get(c.id) || { text: formatStageStatus(c.pipeline_stage), state: 'idle' };
    return `
    <tr data-id="${c.id}">
      <td><input type="checkbox" class="row-checkbox" ${selectedIds.has(c.id) ? 'checked' : ''}></td>
      <td>${escapeHtml(c.name || '-')}</td>
      <td>${escapeHtml(extractCity(c.address))}</td>
      <td>${c.website ? `<a href="${escapeHtml(c.website)}" target="_blank">${escapeHtml(formatWebsiteUrl(c.website))}</a>` : '<span style="color:#9CA3AF">-</span>'}</td>
      <td>${formatSegmentBadge(c.segment, c.enrichment_source)}</td>
      <td class="status-cell"><span class="status-${status.state}">${status.text}</span></td>
      <td>
        <div class="action-icons">
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
  `}).join('');

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

  // Right-click context menu for stage changes
  resultsBody.querySelectorAll('tr').forEach(row => {
    row.addEventListener('contextmenu', (e) => {
      const id = parseInt(row.dataset.id);
      if (id) showContextMenu(e, id);
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
  await updatePipelineStats();
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
  const segmentFilter = document.getElementById('segment-filter').value;

  filteredCompanies = companies.filter(c => {
    const matchesSearch = !searchTerm ||
      (c.name && c.name.toLowerCase().includes(searchTerm)) ||
      (c.address && c.address.toLowerCase().includes(searchTerm));

    // Stage filter from progress bar
    let matchesStage = true;
    if (activeStageFilter) {
      matchesStage = (c.pipeline_stage || 'raw') === activeStageFilter;
    }

    // Segment filter
    const matchesSegment = !segmentFilter ||
      (c.segment && c.segment.toLowerCase().includes(segmentFilter.toLowerCase()));

    return matchesSearch && matchesStage && matchesSegment;
  });

  renderCompanies();
  updateMainActionButton();
}



function handleSelectAll(e) {
  const checked = e.target.checked;
  if (checked) {
    filteredCompanies.forEach(c => selectedIds.add(c.id));
  } else {
    selectedIds.clear();
  }
  updateDeleteButton();
  updateMainActionButton();
  updatePushNotionButton();
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
  updateMainActionButton();
  updatePushNotionButton();
}

function updateDeleteButton() {
  const btn = document.getElementById('delete-selected-btn');
  if (selectedIds.size > 0) {
    btn.classList.remove('hidden');
    btn.textContent = `Delete (${selectedIds.size})`;
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

// Enrich Panel Elements
const enrichPanel = document.getElementById('enrich-panel');
const enrichBackdrop = document.getElementById('enrich-backdrop');
const enrichProgressText = document.getElementById('enrich-progress-text');
const enrichProgressFill = document.getElementById('enrich-progress-fill');
const enrichCurrentName = document.getElementById('enrich-current-name');
const enrichResultsList = document.getElementById('enrich-results-list');

let enrichmentRunning = false;

function showEnrichPanel() {
  enrichPanel.classList.remove('hidden');
  enrichBackdrop.classList.remove('hidden');
}

function hideEnrichPanel() {
  enrichPanel.classList.add('hidden');
  enrichBackdrop.classList.add('hidden');
}

function resetEnrichSteps() {
  document.querySelectorAll('.enrich-step').forEach(step => {
    step.classList.remove('active', 'done', 'error', 'skipped');
    step.querySelector('.enrich-step-status').textContent = '';
  });
}

function setEnrichStep(stepName, state, status = '') {
  const step = document.querySelector(`.enrich-step[data-step="${stepName}"]`);
  if (!step) return;

  step.classList.remove('active', 'done', 'error', 'skipped');
  if (state) step.classList.add(state);
  step.querySelector('.enrich-step-status').textContent = status;
}

function addEnrichResult(company, success, meta = '') {
  const iconSvg = success
    ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clip-rule="evenodd" /></svg>'
    : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd" /></svg>';

  const item = document.createElement('div');
  item.className = 'enrich-result-item';
  item.innerHTML = `
    <div class="enrich-result-icon ${success ? 'success' : 'error'}">${iconSvg}</div>
    <span class="enrich-result-name">${escapeHtml(company.name)}</span>
    <span class="enrich-result-meta">${escapeHtml(meta)}</span>
  `;
  enrichResultsList.appendChild(item);
  enrichResultsList.scrollTop = enrichResultsList.scrollHeight;
}

async function handleWaterfallEnrich() {
  try {
    if (!currentSearchId) {
      alert('Please select a search first from the dashboard.');
      return;
    }

    // Get companies to enrich (selected or qualified companies)
    const toEnrich = selectedIds.size > 0
      ? companies.filter(c => selectedIds.has(c.id) && c.website && c.pipeline_stage === 'qualified')
      : companies.filter(c => c.website && c.pipeline_stage === 'qualified');

    if (!toEnrich.length) {
      const qualified = companies.filter(c => c.pipeline_stage === 'qualified').length;
      const raw = companies.filter(c => !c.pipeline_stage || c.pipeline_stage === 'raw').length;
      alert(`No qualified companies to enrich.\n\n• ${raw} raw (need qualification first)\n• ${qualified} qualified\n\nQualify companies first, then enrich.`);
      return;
    }

    // Show the enrich panel
    enrichmentRunning = true;
    enrichResultsList.innerHTML = '';
    resetEnrichSteps();
    enrichProgressText.textContent = `0 of ${toEnrich.length} companies`;
    enrichProgressFill.style.width = '0%';
    enrichCurrentName.textContent = '-';
    showEnrichPanel();

  const btn = document.getElementById('waterfall-enrich-btn');
  const originalText = btn.innerHTML;
  btn.disabled = true;

  let enriched = 0;
  let totalContacts = 0;

  for (let i = 0; i < toEnrich.length; i++) {
    if (!enrichmentRunning) break; // Allow cancellation

    const company = toEnrich[i];

    // Update overall progress
    enrichProgressText.textContent = `${i + 1} of ${toEnrich.length} companies`;
    enrichProgressFill.style.width = `${((i) / toEnrich.length) * 100}%`;
    enrichCurrentName.textContent = company.name;

    // Reset steps for new company
    resetEnrichSteps();

    // Simulate step-by-step progress (the actual API does this server-side)
    // Step 1: Scrape website
    setEnrichStep('scrape', 'active', 'Fetching...');
    await new Promise(r => setTimeout(r, 300));

    try {
      // Start the actual enrichment
      setEnrichStep('scrape', 'done', 'Done');

      // Step 2: AI Analysis
      setEnrichStep('analyze', 'active', 'Processing with Claude...');
      await new Promise(r => setTimeout(r, 200));

      const res = await fetch(`/api/companies/${company.id}/enrich-full`, { method: 'POST' });

      if (res.ok) {
        const data = await res.json();

        // Mark AI analysis done
        setEnrichStep('analyze', 'done', data.enrichment?.segment || 'Analyzed');

        // Step 3: Contacts
        setEnrichStep('contacts', 'active', 'Searching...');
        await new Promise(r => setTimeout(r, 150));

        const contactsFound = data.contacts?.length || 0;
        if (contactsFound > 0) {
          setEnrichStep('contacts', 'done', `${contactsFound} found`);

          // Step 4: Validate
          setEnrichStep('validate', 'active', 'Checking MX records...');
          await new Promise(r => setTimeout(r, 150));
          setEnrichStep('validate', 'done', 'Verified');

          // Hunter not needed
          setEnrichStep('hunter', 'skipped', 'Not needed');
        } else {
          setEnrichStep('contacts', 'done', 'None found');
          setEnrichStep('validate', 'skipped', 'No emails');

          // Step 5: Hunter fallback
          if (data.enrichment_source?.includes('hunter')) {
            setEnrichStep('hunter', 'active', 'Querying Hunter.io...');
            await new Promise(r => setTimeout(r, 150));
            setEnrichStep('hunter', 'done', 'Checked');
          } else {
            setEnrichStep('hunter', 'skipped', 'Skipped');
          }
        }

        enriched++;
        totalContacts += contactsFound;

        // Update local data
        company.enrichment_source = 'waterfall_full';
        company.segment = data.enrichment?.segment;
        company.industry = data.enrichment?.industry;
        company.ico = data.enrichment?.ico;
        company.pipeline_stage = 'enriched';
        if (data.contacts?.length > 0) {
          company.contacts_count = data.contacts.length;
          const primary = data.contacts.find(c => c.email);
          if (primary) company.primary_email = primary.email;
        }

        addEnrichResult(company, true, contactsFound > 0 ? `${contactsFound} contacts` : (data.enrichment?.segment || 'Enriched'));

      } else {
        const err = await res.json();
        setEnrichStep('analyze', 'error', err.error || 'Failed');
        setEnrichStep('contacts', 'skipped');
        setEnrichStep('validate', 'skipped');
        setEnrichStep('hunter', 'skipped');
        addEnrichResult(company, false, err.error || 'Error');
      }
    } catch (err) {
      setEnrichStep('scrape', 'error', 'Failed');
      setEnrichStep('analyze', 'skipped');
      setEnrichStep('contacts', 'skipped');
      setEnrichStep('validate', 'skipped');
      setEnrichStep('hunter', 'skipped');
      addEnrichResult(company, false, err.message);
    }

    // Small delay between companies
    await new Promise(r => setTimeout(r, 300));
  }

  // Final progress update
  enrichProgressFill.style.width = '100%';
  enrichProgressText.textContent = `Done! ${enriched} of ${toEnrich.length} enriched`;
  enrichCurrentName.textContent = `Found ${totalContacts} contacts`;
  resetEnrichSteps();

  btn.disabled = false;
  btn.innerHTML = originalText;
  enrichmentRunning = false;

  await loadCompanies(currentSearchId);
  await updatePipelineStats();
  } catch (error) {
    alert('AI Enrich error: ' + error.message);
    enrichmentRunning = false;
    hideEnrichPanel();
  }
}

// Close enrich panel handlers
document.getElementById('close-enrich-panel').addEventListener('click', () => {
  if (enrichmentRunning) {
    if (confirm('Enrichment is still running. Stop and close?')) {
      enrichmentRunning = false;
      hideEnrichPanel();
    }
  } else {
    hideEnrichPanel();
  }
});

document.getElementById('enrich-backdrop').addEventListener('click', () => {
  if (!enrichmentRunning) {
    hideEnrichPanel();
  }
});

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

function formatStageStatus(stage) {
  const stageLabels = {
    raw: 'Raw',
    enriched: 'Enriched',
    qualified: 'Qualified',
    ready: 'Ready'
  };
  return stageLabels[stage] || stageLabels.raw;
}

// ============ Pipeline Progress & Main Action ============

async function updatePipelineStats() {
  try {
    const res = await fetch('/api/companies/stats');
    pipelineStats = await res.json();

    // Update labels for pipeline: Raw → Enriched → Qualified → Ready
    document.getElementById('stat-raw').textContent = pipelineStats.raw || 0;
    document.getElementById('stat-enriched').textContent = pipelineStats.enriched || 0;
    document.getElementById('stat-qualified').textContent = pipelineStats.qualified || 0;
    document.getElementById('stat-ready').textContent = pipelineStats.ready || 0;

    updateMainActionButton();
    updatePushNotionButton();
  } catch (err) {
    console.error('Failed to update pipeline stats:', err);
  }
}

function updateMainActionButton() {
  const btn = document.getElementById('main-action-btn');
  const btnText = document.getElementById('main-action-text');
  const selectedCount = selectedIds.size;

  // Remove all state classes
  btn.classList.remove('qualify', 'enrich', 'approve', 'done');

  // Get selected companies' stages
  const selectedCompanies = companies.filter(c => selectedIds.has(c.id));
  const selectedRaw = selectedCompanies.filter(c =>
    c.website && (!c.pipeline_stage || c.pipeline_stage === 'raw')
  ).length;
  const selectedEnriched = selectedCompanies.filter(c =>
    c.pipeline_stage === 'enriched'
  ).length;

  // Require checkbox selection for all actions
  if (selectedCount === 0) {
    btnText.textContent = 'Select leads to enrich';
    btn.disabled = true;
    btn.dataset.action = 'none';
    return;
  }

  // Determine action based on selected leads' stages
  if (selectedRaw > 0) {
    btn.classList.add('enrich');
    btnText.textContent = `✨ Enrich (${selectedRaw})`;
    btn.disabled = false;
    btn.dataset.action = 'enrich';
  } else if (selectedEnriched > 0) {
    btn.classList.add('approve');
    btnText.textContent = `✓ Approve (${selectedEnriched})`;
    btn.disabled = false;
    btn.dataset.action = 'approve';
  } else {
    btnText.textContent = `${selectedCount} selected`;
    btn.disabled = true;
    btn.dataset.action = 'none';
  }
}

function updatePushNotionButton() {
  const btn = document.getElementById('push-notion-btn');
  const countSpan = document.getElementById('notion-count');
  const selectedCount = selectedIds.size;

  // Only enable when leads are selected
  if (selectedCount > 0) {
    btn.disabled = false;
    countSpan.textContent = `(${selectedCount})`;
    btn.title = `Push ${selectedCount} leads to Notion`;
  } else {
    btn.disabled = true;
    countSpan.textContent = '';
    btn.title = 'Select leads first';
  }
}

function handleProgressClick(stage) {
  // Toggle filter: clicking the active stage clears the filter
  activeStageFilter = (activeStageFilter === stage) ? '' : stage;

  // Update active state on pills
  // When no filter is active, default to showing "raw" as the active pill
  const activePillStage = activeStageFilter || 'raw';
  document.querySelectorAll('.stage-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.stage === activePillStage);
  });

  applyFilters();
}

async function handleMainAction() {
  const btn = document.getElementById('main-action-btn');
  const action = btn.dataset.action;

  if (action === 'enrich') {
    await handleEnrichSelected();
  } else if (action === 'approve') {
    await handleApproveSelected();
  }
}

async function handleEnrichSelected() {
  const selectedCompanies = companies.filter(c =>
    selectedIds.has(c.id) &&
    c.website &&
    (!c.pipeline_stage || c.pipeline_stage === 'raw')
  );

  if (!selectedCompanies.length) {
    alert('No raw leads selected to enrich.');
    return;
  }

  const btn = document.getElementById('main-action-btn');
  const btnText = document.getElementById('main-action-text');
  btn.disabled = true;
  btnText.innerHTML = '<span class="spinner"></span> Enriching...';

  // Process each selected company with inline status updates
  for (const company of selectedCompanies) {
    setRowStatus(company.id, 'Enriching...', 'processing');

    try {
      const res = await fetch(`/api/companies/${company.id}/enrich-full`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (res.ok) {
        setRowStatus(company.id, '✓ Done', 'done');
      } else {
        const err = await res.json();
        setRowStatus(company.id, '✗ Error', 'error');
        console.error(`Enrich failed for ${company.name}:`, err);
      }
    } catch (err) {
      setRowStatus(company.id, '✗ Error', 'error');
      console.error(`Enrich failed for ${company.name}:`, err);
    }
  }

  // Reload and update
  await loadCompanies(currentSearchId);
  await updatePipelineStats();
  selectedIds.clear();
  updateMainActionButton();
  updatePushNotionButton();
}

async function handleApproveSelected() {
  const ids = Array.from(selectedIds);
  if (!ids.length) return;

  const btn = document.getElementById('main-action-btn');
  btn.disabled = true;

  try {
    const res = await fetch('/api/companies/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyIds: ids })
    });

    const result = await res.json();
    if (res.ok) {
      alert(`✓ ${result.approved} leads approved`);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }

  await loadCompanies(currentSearchId);
  await updatePipelineStats();
  selectedIds.clear();
  updateMainActionButton();
}

async function handlePushToNotion() {
  const ids = Array.from(selectedIds);
  if (!ids.length) {
    alert('Select leads to push to Notion first.');
    return;
  }

  const btn = document.getElementById('push-notion-btn');
  btn.disabled = true;

  for (const id of ids) {
    setRowStatus(id, 'Pushing...', 'processing');
  }

  try {
    const res = await fetch('/api/companies/push-to-notion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyIds: ids })
    });

    const result = await res.json();

    // Update statuses
    for (const page of result.pages) {
      setRowStatus(page.companyId, '✓ Pushed', 'done');
    }
    for (const err of result.errors) {
      setRowStatus(err.companyId, '✗ Error', 'error');
    }

    alert(`Pushed ${result.pushed} leads to Notion\n${result.skipped} skipped (already in Notion)\n${result.errors.length} errors`);
  } catch (err) {
    alert('Error: ' + err.message);
  }

  await loadCompanies(currentSearchId);
  await updatePipelineStats();
  selectedIds.clear();
  updateMainActionButton();
  updatePushNotionButton();
}

function setRowStatus(companyId, text, state) {
  rowStatuses.set(companyId, { text, state });
  const row = document.querySelector(`tr[data-id="${companyId}"]`);
  if (row) {
    const statusCell = row.querySelector('.status-cell');
    if (statusCell) {
      statusCell.innerHTML = `<span class="status-${state}">${text}</span>`;
    }
  }
}

// ============ Notion Dedupe ============

const dedupePanel = document.getElementById('dedupe-panel');
const dedupeBackdrop = document.getElementById('dedupe-backdrop');
const dedupeNotConfigured = document.getElementById('dedupe-not-configured');
const dedupeLoading = document.getElementById('dedupe-loading');
const dedupeResults = document.getElementById('dedupe-results');
const dedupeList = document.getElementById('dedupe-list');

let dedupeData = null;
let selectedDupeIds = new Set();

function showDedupePanel() {
  dedupePanel.classList.remove('hidden');
  dedupeBackdrop.classList.remove('hidden');
}

function hideDedupePanel() {
  dedupePanel.classList.add('hidden');
  dedupeBackdrop.classList.add('hidden');
}

function resetDedupePanel() {
  dedupeNotConfigured.classList.add('hidden');
  dedupeLoading.classList.add('hidden');
  dedupeResults.classList.add('hidden');
  dedupeList.innerHTML = '';
  dedupeData = null;
  selectedDupeIds.clear();
}

async function handleDedupe() {
  if (!currentSearchId) {
    alert('Please select a search first');
    return;
  }

  resetDedupePanel();
  showDedupePanel();

  // Check Notion status
  try {
    const statusRes = await fetch('/api/notion/status');
    const status = await statusRes.json();

    if (!status.configured) {
      dedupeNotConfigured.classList.remove('hidden');
      return;
    }
  } catch (err) {
    dedupeNotConfigured.classList.remove('hidden');
    return;
  }

  // Show loading
  dedupeLoading.classList.remove('hidden');

  try {
    const res = await fetch(`/api/notion/dedupe/search/${currentSearchId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Dedupe check failed');
    }

    dedupeData = await res.json();
    dedupeLoading.classList.add('hidden');
    renderDedupeResults();
  } catch (err) {
    dedupeLoading.classList.add('hidden');
    alert('Error: ' + err.message);
    hideDedupePanel();
  }
}

function renderDedupeResults() {
  if (!dedupeData) return;

  // Update stats
  document.getElementById('dedupe-unique-count').textContent = dedupeData.unique;
  document.getElementById('dedupe-dupe-count').textContent = dedupeData.duplicates;
  document.getElementById('dedupe-total-count').textContent = dedupeData.total;

  // Render duplicate list
  const dupes = dedupeData.results.filter(r => r.isDupe);

  if (dupes.length === 0) {
    dedupeList.innerHTML = '<div style="padding:20px;text-align:center;color:#6B7280;">No duplicates found!</div>';
  } else {
    // Pre-select all duplicates by default
    dupes.forEach(d => selectedDupeIds.add(d.companyId));

    dedupeList.innerHTML = dupes.map(dupe => `
      <div class="dedupe-item" data-id="${dupe.companyId}">
        <div class="dedupe-item-header">
          <input type="checkbox" class="dedupe-item-checkbox" ${selectedDupeIds.has(dupe.companyId) ? 'checked' : ''}>
          <div class="dedupe-item-info">
            <div class="dedupe-item-name">${escapeHtml(dupe.companyName)}</div>
            <div class="dedupe-item-domain">${escapeHtml(extractDomainFromUrl(dupe.companyWebsite))}</div>
          </div>
          <span class="dedupe-item-match-type ${dupe.matchType}">${dupe.matchType === 'domain' ? 'Domain Match' : 'Fuzzy Name'}</span>
          <span class="dedupe-item-confidence">${Math.round(dupe.confidence * 100)}%</span>
          <div class="dedupe-item-toggle">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="16" height="16">
              <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
        </div>
        <div class="dedupe-item-matches">
          <div style="font-size:11px;color:#6B7280;margin-bottom:8px;">Matches in Notion CRM:</div>
          ${dupe.matches.map(m => `
            <div class="dedupe-match">
              <div class="dedupe-match-name">${escapeHtml(m.name || 'Unknown')}</div>
              ${m.organizaceUrl ? `<div class="dedupe-match-url">${escapeHtml(m.organizaceUrl)}</div>` : ''}
              ${m.email ? `<div class="dedupe-match-email">${escapeHtml(m.email)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    // Add event listeners
    dedupeList.querySelectorAll('.dedupe-item-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.type === 'checkbox') return;
        const item = header.closest('.dedupe-item');
        item.classList.toggle('expanded');
      });
    });

    dedupeList.querySelectorAll('.dedupe-item-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        const id = parseInt(cb.closest('.dedupe-item').dataset.id);
        if (cb.checked) {
          selectedDupeIds.add(id);
        } else {
          selectedDupeIds.delete(id);
        }
      });
    });
  }

  dedupeResults.classList.remove('hidden');
}

function extractDomainFromUrl(url) {
  if (!url) return '-';
  return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

async function handleDeleteDupes() {
  if (selectedDupeIds.size === 0) {
    alert('No duplicates selected');
    return;
  }

  if (!confirm(`Delete ${selectedDupeIds.size} duplicate companies from the scraper?\n\nThis will NOT affect your Notion CRM.`)) {
    return;
  }

  try {
    await fetch('/api/companies/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedDupeIds) })
    });

    companies = companies.filter(c => !selectedDupeIds.has(c.id));
    filteredCompanies = filteredCompanies.filter(c => !selectedDupeIds.has(c.id));

    hideDedupePanel();
    renderCompanies();
    alert(`Deleted ${selectedDupeIds.size} duplicates`);
    selectedDupeIds.clear();
  } catch (err) {
    alert('Error deleting: ' + err.message);
  }
}

async function handleExportUniqueToNotion() {
  if (!dedupeData) return;

  const uniqueIds = dedupeData.results
    .filter(r => !r.isDupe)
    .map(r => r.companyId);

  if (uniqueIds.length === 0) {
    alert('No unique leads to export');
    return;
  }

  if (!confirm(`Export ${uniqueIds.length} unique leads to Notion CRM?`)) {
    return;
  }

  const btn = document.getElementById('dedupe-export-unique');
  btn.disabled = true;
  btn.textContent = 'Exporting...';

  try {
    const res = await fetch('/api/notion/export/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyIds: uniqueIds })
    });

    const result = await res.json();

    if (res.ok) {
      alert(`Exported ${result.exported} leads to Notion!\n${result.skippedDupes} skipped as duplicates.\n${result.errors.length} errors.`);
      hideDedupePanel();
    } else {
      throw new Error(result.error);
    }
  } catch (err) {
    alert('Export failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Export Unique to Notion';
  }
}

// Dedupe event listeners
document.getElementById('dedupe-btn').addEventListener('click', handleDedupe);
document.getElementById('close-dedupe-panel').addEventListener('click', hideDedupePanel);
document.getElementById('dedupe-backdrop').addEventListener('click', hideDedupePanel);
document.getElementById('dedupe-delete-dupes').addEventListener('click', handleDeleteDupes);
document.getElementById('dedupe-export-unique').addEventListener('click', handleExportUniqueToNotion);
