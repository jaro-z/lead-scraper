// Segment color map
const SEGMENT_COLORS = {
  'Performance Marketing': { bg: '#DBEAFE', text: '#1D4ED8' },
  'Brand Marketing': { bg: '#FEE2E2', text: '#DC2626' },
  'Creative Agency': { bg: '#FEF3C7', text: '#D97706' },
  'Web Development': { bg: '#CFFAFE', text: '#0891B2' },
  'PR & Media': { bg: '#EDE9FE', text: '#7C3AED' },
  'Full-Service Marketing': { bg: '#F3F4F6', text: '#374151' },
  'Consulting': { bg: '#D1FAE5', text: '#059669' },
  'Other': { bg: '#F3F4F6', text: '#6B7280' },
};

// State
let currentView = 'dashboard';
let currentSearchId = null;
let companies = [];
let filteredCompanies = [];
let selectedIds = new Set();
let sortColumn = 'name';
let sortDirection = 'asc';
let activeStageFilter = '';
let isGlobalView = false; // true when viewing all companies by stage (not filtered by search)
let pipelineStats = { raw: 0, enriched: 0, qualified: 0, in_notion: 0, parked: 0, total: 0 };
let allSegments = [];
let rowStatuses = new Map(); // Track inline status per row

// DOM Elements
const dashboardView = document.getElementById('dashboard-view');
const resultsView = document.getElementById('results-view');
const searchesList = document.getElementById('searches-list');
const resultsBody = document.getElementById('results-body');
const apiUsage = document.getElementById('api-usage');
const searchModal = document.getElementById('search-modal');
const progressModal = document.getElementById('progress-modal');
const addUrlModal = document.getElementById('add-url-modal');
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

  // Add URL (manual single-company enrichment)
  document.getElementById('add-url-btn').addEventListener('click', () => {
    resetAddUrlModal();
    showModal(addUrlModal);
    setTimeout(() => document.getElementById('add-url-website').focus(), 50);
  });
  document.getElementById('cancel-add-url').addEventListener('click', () => hideModal(addUrlModal));
  document.getElementById('add-url-form').addEventListener('submit', handleAddUrl);
  // If user edits the URL after seeing a duplicate warning, drop the reenrich target
  // so submitting creates a fresh company instead of re-enriching the previously-matched id.
  document.getElementById('add-url-website').addEventListener('input', () => {
    if (addUrlReenrichTargetId) {
      addUrlReenrichTargetId = null;
      addUrlReenrichTargetName = null;
      document.getElementById('add-url-error').classList.add('hidden');
      document.getElementById('submit-add-url').textContent = 'Enrich';
    }
  });
  addUrlModal.addEventListener('click', (e) => {
    if (e.target === addUrlModal) hideModal(addUrlModal);
  });

  // Back to dashboard
  document.getElementById('back-btn').addEventListener('click', showDashboard);

  // Filters
  document.getElementById('search-filter').addEventListener('input', debounce(applyFilters, 200));

  // Custom segment dropdown (options are populated dynamically by loadSegments/updateSegmentDropdown)
  document.getElementById('segment-filter-btn').addEventListener('click', toggleSegmentDropdown);
  document.addEventListener('click', closeSegmentDropdownOnClickOutside);

  // Custom tier dropdown (options are populated dynamically by updateTierDropdown)
  document.getElementById('tier-filter-btn').addEventListener('click', toggleTierDropdown);
  document.addEventListener('click', closeTierDropdownOnClickOutside);

  // Initialize tier dropdown with all options
  updateTierDropdown();

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

  // Bulk move to stage
  document.querySelectorAll('.bulk-move-btn').forEach(btn => {
    btn.addEventListener('click', () => handleBulkMove(btn.dataset.stage));
  });

  // Export
  document.getElementById('export-btn').addEventListener('click', handleExport);

  // Export YAMM
  document.getElementById('export-yamm-btn').addEventListener('click', handleYAMMExport);

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

  // Edit contact modal handlers
  const editContactModal = document.getElementById('edit-contact-modal');
  document.getElementById('edit-contact-form').addEventListener('submit', handleSaveContact);
  document.getElementById('cancel-edit-contact').addEventListener('click', () => hideModal(editContactModal));
  editContactModal.addEventListener('click', (e) => {
    if (e.target === editContactModal) hideModal(editContactModal);
  });

  // Global ESC key to close any open modal/panel
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Close modals (in order of priority)
      const modals = [editContactModal, searchModal, progressModal, addUrlModal];
      for (const modal of modals) {
        if (!modal.classList.contains('hidden')) {
          hideModal(modal);
          return;
        }
      }
      // Close full view panel
      if (!fullViewPanel.classList.contains('hidden')) {
        fullViewPanel.classList.add('hidden');
        return;
      }
      // Close context menu
      if (stageContextMenu && !stageContextMenu.classList.contains('hidden')) {
        hideContextMenu();
        return;
      }
      // Close more dropdown
      const moreDropdown = document.getElementById('more-dropdown');
      if (moreDropdown && !moreDropdown.classList.contains('hidden')) {
        moreDropdown.classList.add('hidden');
        return;
      }
    }
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

  document.getElementById('segment-filter').value = value;
  document.getElementById('segment-filter-text').textContent = value ? option.textContent : 'Segment';

  document.getElementById('segment-filter-wrapper').classList.remove('open');
  document.getElementById('segment-filter-dropdown').classList.add('hidden');

  // Cross-filter: update tier dropdown to only show tiers that exist in this segment
  updateTierDropdown();
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

// Tier dropdown helpers
function toggleTierDropdown(e) {
  e.stopPropagation();
  const wrapper = document.getElementById('tier-filter-wrapper');
  const dropdown = document.getElementById('tier-filter-dropdown');
  wrapper.classList.toggle('open');
  dropdown.classList.toggle('hidden');
}

function selectTier(option) {
  const value = option.dataset.value;

  document.getElementById('tier-filter').value = value;
  document.getElementById('tier-filter-text').textContent = value ? option.textContent : 'Tier';

  document.getElementById('tier-filter-wrapper').classList.remove('open');
  document.getElementById('tier-filter-dropdown').classList.add('hidden');

  // Cross-filter: update segment dropdown to only show segments that have companies with this tier
  updateSegmentDropdown();
  applyFilters();
}

function closeTierDropdownOnClickOutside(e) {
  const wrapper = document.getElementById('tier-filter-wrapper');
  const dropdown = document.getElementById('tier-filter-dropdown');

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
    isGlobalView = false;
    activeStageFilter = '';

    // Reset pills - default 'raw' as active
    document.querySelectorAll('.stage-pill').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.stage === 'raw');
    });

    renderCompanies();
    updateMainActionButton();
  } catch (error) {
    console.error('Error loading companies:', error);
  }
}

async function loadCompaniesByStage(stage, searchId) {
  try {
    const url = searchId
      ? `/api/companies/by-stage/${stage}?searchId=${searchId}`
      : `/api/companies/by-stage/${stage}`;
    const res = await fetch(url);
    companies = await res.json();
    filteredCompanies = [...companies];
    activeStageFilter = stage;

    if (searchId) {
      // Stay scoped to the search
      isGlobalView = false;
    } else {
      isGlobalView = true;
      currentSearchId = null;

      // Update title to show global view
      const stageLabels = {
        raw: 'Raw',
        no_website: 'No Website',
        enriched: 'Enriched',
        qualified: 'Qualified',
        parked: 'Parked'
      };
      document.getElementById('search-title').textContent = `All ${stageLabels[stage]} Companies`;
      document.getElementById('search-meta').textContent = `${companies.length} companies across all searches`;
    }

    // Make sure results view is visible
    dashboardView.classList.add('hidden');
    resultsView.classList.remove('hidden');

    renderCompanies();
    updateMainActionButton();
  } catch (error) {
    console.error('Error loading companies by stage:', error);
  }
}

async function loadSegments() {
  try {
    const res = await fetch('/api/segments');
    const segments = await res.json();
    allSegments = segments;
    updateSegmentDropdown();
  } catch (error) {
    console.error('Error loading segments:', error);
  }
}

// Cross-filtering: update segment dropdown based on current tier filter
function updateSegmentDropdown() {
  const tierFilter = document.getElementById('tier-filter').value;
  const dropdown = document.getElementById('segment-filter-dropdown');
  const currentSegment = document.getElementById('segment-filter').value;

  // Figure out which segments are available given the tier filter
  let availableSegments = allSegments;
  if (tierFilter && companies.length > 0) {
    const segmentsWithTier = new Set();
    companies.forEach(c => {
      if (c.segment && getContactTier(c) === tierFilter) {
        segmentsWithTier.add(c.segment);
      }
    });
    availableSegments = allSegments.filter(s => segmentsWithTier.has(s));
  }

  dropdown.innerHTML = '';
  const allBtn = document.createElement('button');
  allBtn.className = 'custom-select-option' + (!currentSegment ? ' selected' : '');
  allBtn.dataset.value = '';
  allBtn.textContent = 'All';
  allBtn.addEventListener('click', () => selectSegment(allBtn));
  dropdown.appendChild(allBtn);

  availableSegments.forEach(segment => {
    const btn = document.createElement('button');
    btn.className = 'custom-select-option' + (currentSegment === segment ? ' selected' : '');
    btn.dataset.value = segment;
    btn.textContent = segment;
    btn.addEventListener('click', () => selectSegment(btn));
    dropdown.appendChild(btn);
  });
}

// Cross-filtering: update tier dropdown based on current segment filter
function updateTierDropdown() {
  const segmentFilter = document.getElementById('segment-filter').value;
  const currentTier = document.getElementById('tier-filter').value;
  const dropdown = document.getElementById('tier-filter-dropdown');

  const allTiers = [
    { value: '', label: 'All Tiers' },
    { value: 'ceo', label: 'CEO/Founder' },
    { value: 'named', label: 'Named Person' },
    { value: 'generic', label: 'Generic Email' },
    { value: 'none', label: 'No Contact' }
  ];

  // Figure out which tiers exist given the segment filter
  let availableTiers = allTiers;
  if (segmentFilter && companies.length > 0) {
    const tiersInSegment = new Set();
    companies.forEach(c => {
      if (c.segment && c.segment.toLowerCase() === segmentFilter.toLowerCase()) {
        tiersInSegment.add(getContactTier(c));
      }
    });
    availableTiers = allTiers.filter(t => !t.value || tiersInSegment.has(t.value));
  }

  dropdown.innerHTML = '';
  availableTiers.forEach(tier => {
    const btn = document.createElement('button');
    btn.className = 'custom-select-option' + (currentTier === tier.value ? ' selected' : '');
    btn.dataset.value = tier.value;
    btn.textContent = tier.label;
    btn.addEventListener('click', () => selectTier(btn));
    dropdown.appendChild(btn);
  });
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
    resultsBody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:40px;">No results found</td></tr>';
    document.getElementById('results-count').textContent = '';
    return;
  }

  resultsBody.innerHTML = sorted.map(c => {
    const status = rowStatuses.get(c.id) || { text: formatStageStatus(c.pipeline_stage, c.enrichment_error), state: c.enrichment_error ? 'warning' : 'idle' };
    return `
    <tr data-id="${c.id}">
      <td><input type="checkbox" class="row-checkbox" ${selectedIds.has(c.id) ? 'checked' : ''}></td>
      <td>${escapeHtml(c.name || '-')}</td>
      <td>${escapeHtml(extractCity(c.address))}</td>
      <td>${c.website ? `<a href="${escapeHtml(c.website)}" target="_blank">${escapeHtml(formatWebsiteUrl(c.website))}</a>` : '<span style="color:#9CA3AF">-</span>'}</td>
      <td class="rating-col">${formatRating(c.rating, c.rating_count, c.google_maps_url)}</td>
      <td class="contact-col">${formatContactCell(c)}</td>
      <td>${formatSegmentBadge(c.segment, c.enrichment_source)}</td>
      <td class="status-cell">${formatStatusCell(status)}</td>
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

  // Tier badge click → popover
  resultsBody.querySelectorAll('.contact-tier-badge.clickable').forEach(badge => {
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      const companyId = parseInt(badge.dataset.companyId);
      if (companyId) showTierPopover(companyId, badge);
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

// ============ Add URL (manual single-company enrichment) ============

let addUrlDone = false;
let addUrlProgressTimer = null;
let addUrlReenrichTargetId = null;
let addUrlReenrichTargetName = null;

function resetAddUrlModal() {
  document.getElementById('add-url-form').reset();
  const err = document.getElementById('add-url-error');
  const status = document.getElementById('add-url-status');
  err.classList.add('hidden');
  err.textContent = '';
  status.classList.add('hidden');
  status.classList.remove('dialog-alert-warning', 'dialog-alert-success');
  status.classList.add('dialog-alert-success');
  status.textContent = '';
  stopAddUrlProgress();
  const progress = document.getElementById('add-url-progress');
  progress.classList.add('hidden');
  document.getElementById('add-url-progress-fill').style.width = '0%';
  document.getElementById('add-url-progress-pct').textContent = '0%';
  document.getElementById('add-url-progress-label').textContent = 'Enriching…';
  document.getElementById('add-url-website').disabled = false;
  document.getElementById('add-url-name').disabled = false;
  const submitBtn = document.getElementById('submit-add-url');
  submitBtn.disabled = false;
  submitBtn.textContent = 'Enrich';
  addUrlDone = false;
  addUrlReenrichTargetId = null;
  addUrlReenrichTargetName = null;
}

function startAddUrlProgress(domain) {
  const progress = document.getElementById('add-url-progress');
  const fill = document.getElementById('add-url-progress-fill');
  const pct = document.getElementById('add-url-progress-pct');
  const label = document.getElementById('add-url-progress-label');

  progress.classList.remove('hidden');
  fill.style.width = '0%';
  pct.textContent = '0%';
  label.textContent = domain ? `Enriching ${domain}…` : 'Enriching…';

  let startedAt = Date.now();
  let targetMs = 25000;
  let labelSwitched = false;
  stopAddUrlProgress();
  addUrlProgressTimer = setInterval(() => {
    const elapsed = Date.now() - startedAt;
    if (!labelSwitched && elapsed > 45000) {
      label.textContent = 'Still working, complex site...';
      const currentFraction = 1 - Math.exp(-elapsed / targetMs);
      targetMs = 50000;
      startedAt = Date.now() + targetMs * Math.log(1 - currentFraction);
      labelSwitched = true;
    }
    const pctValue = Math.min(92, 92 * (1 - Math.exp(-(Date.now() - startedAt) / targetMs)));
    fill.style.width = pctValue.toFixed(1) + '%';
    pct.textContent = Math.round(pctValue) + '%';
  }, 200);
}

function stopAddUrlProgress() {
  if (addUrlProgressTimer) {
    clearInterval(addUrlProgressTimer);
    addUrlProgressTimer = null;
  }
}

function finishAddUrlProgress() {
  stopAddUrlProgress();
  const fill = document.getElementById('add-url-progress-fill');
  const pct = document.getElementById('add-url-progress-pct');
  fill.style.width = '100%';
  pct.textContent = '100%';
}

function renderAddUrlResult(result) {
  const statusEl = document.getElementById('add-url-status');
  const contacts = result.contacts || [];
  const segment = result.enrichment?.segment || 'unknown';
  const industry = result.enrichment?.industry || '';
  const icoValid = result.ico_validation?.valid ? ' (ICO ✓)' : '';

  statusEl.classList.remove('hidden', 'dialog-alert-warning', 'dialog-alert-success');
  if (contacts.length > 0) {
    statusEl.classList.add('dialog-alert-success');
    const lines = contacts.slice(0, 5).map(c =>
      `• ${c.email || '(no email)'} — ${[c.firstName, c.lastName].filter(Boolean).join(' ')}${c.title ? ' (' + c.title + ')' : ''}`.trim()
    );
    const more = contacts.length > 5 ? `\n…and ${contacts.length - 5} more` : '';
    statusEl.textContent = `Enriched as "${segment}"${industry ? ' / ' + industry : ''}${icoValid}. ${contacts.length} contact${contacts.length === 1 ? '' : 's'}:\n${lines.join('\n')}${more}`;
  } else {
    statusEl.classList.add('dialog-alert-warning');
    statusEl.textContent = `Enriched as "${segment}"${industry ? ' / ' + industry : ''}${icoValid}, but no contacts found. Company saved.`;
  }
}

async function handleAddUrl(e) {
  e.preventDefault();

  // If we're already showing a successful result, the "Close" press closes the modal.
  if (addUrlDone) {
    hideModal(addUrlModal);
    loadSearches();
    return;
  }

  const website = document.getElementById('add-url-website').value.trim();
  const name = document.getElementById('add-url-name').value.trim();
  const errEl = document.getElementById('add-url-error');
  const statusEl = document.getElementById('add-url-status');
  const submitBtn = document.getElementById('submit-add-url');
  const websiteInput = document.getElementById('add-url-website');
  const nameInput = document.getElementById('add-url-name');

  // Re-enrich branch: user hit "Re-enrich existing" on a duplicate. Skip the insert
  // and just run the waterfall on the existing company_id.
  if (addUrlReenrichTargetId) {
    const targetId = addUrlReenrichTargetId;
    const targetName = addUrlReenrichTargetName || 'existing company';
    addUrlReenrichTargetId = null;
    addUrlReenrichTargetName = null;
    errEl.classList.add('hidden');
    errEl.textContent = '';
    statusEl.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Working…';
    websiteInput.disabled = true;
    nameInput.disabled = true;
    startAddUrlProgress(targetName);
    try {
      const enrichRes = await fetch(`/api/companies/${targetId}/enrich-full`, { method: 'POST' });
      if (!enrichRes.ok) {
        const body = await enrichRes.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(body.error || `HTTP ${enrichRes.status}`);
      }
      const result = await enrichRes.json();
      finishAddUrlProgress();
      renderAddUrlResult(result);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Close';
      addUrlDone = true;
    } catch (error) {
      stopAddUrlProgress();
      document.getElementById('add-url-progress').classList.add('hidden');
      errEl.textContent = 'Error: ' + error.message;
      errEl.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Retry';
      websiteInput.disabled = false;
      nameInput.disabled = false;
    }
    return;
  }

  if (!website) return;

  errEl.classList.add('hidden');
  errEl.textContent = '';
  statusEl.classList.add('hidden');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Working…';
  websiteInput.disabled = true;
  nameInput.disabled = true;

  // Show progress immediately (covers the DB insert + enrichment).
  startAddUrlProgress(null);

  try {
    // Step 1: create the company row
    const createRes = await fetch('/api/companies/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ website, name })
    });

    if (createRes.status === 409) {
      stopAddUrlProgress();
      document.getElementById('add-url-progress').classList.add('hidden');
      const body = await createRes.json();
      errEl.innerHTML = `Already in your list: <strong>${escapeHtml(body.company_name || 'existing company')}</strong> (id ${body.company_id}).`;
      errEl.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Re-enrich existing';
      addUrlReenrichTargetId = body.company_id;
      addUrlReenrichTargetName = body.company_name;
      websiteInput.disabled = false;
      nameInput.disabled = false;
      return;
    }

    if (!createRes.ok) {
      const body = await createRes.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(body.error || `HTTP ${createRes.status}`);
    }

    const { company_id, domain } = await createRes.json();

    // Update progress label with the actual domain now that we have it.
    document.getElementById('add-url-progress-label').textContent = `Enriching ${domain}…`;

    // Step 2: run the full enrichment waterfall
    const enrichRes = await fetch(`/api/companies/${company_id}/enrich-full`, {
      method: 'POST'
    });

    if (!enrichRes.ok) {
      const body = await enrichRes.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(body.error || `HTTP ${enrichRes.status}`);
    }

    const result = await enrichRes.json();
    finishAddUrlProgress();
    renderAddUrlResult(result);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Close';
    addUrlDone = true;
  } catch (error) {
    stopAddUrlProgress();
    document.getElementById('add-url-progress').classList.add('hidden');
    errEl.textContent = 'Error: ' + error.message;
    errEl.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Retry';
    websiteInput.disabled = false;
    nameInput.disabled = false;
  }
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
  await loadSegments();
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

    // Contact tier sort uses computed values
    if (sortColumn === 'contact_tier') {
      const tierOrder = { ceo: 0, named: 1, generic: 2, none: 3 };
      aVal = tierOrder[getContactTier(a)] ?? 4;
      bVal = tierOrder[getContactTier(b)] ?? 4;
    }

    // Handle nulls - for rating, push to end
    if (sortColumn === 'rating') {
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortDirection === 'asc' ? 1 : -1;
      if (bVal == null) return sortDirection === 'asc' ? -1 : 1;
    }

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
  const tierFilter = document.getElementById('tier-filter').value;

  filteredCompanies = companies.filter(c => {
    const matchesSearch = !searchTerm ||
      (c.name && c.name.toLowerCase().includes(searchTerm)) ||
      (c.address && c.address.toLowerCase().includes(searchTerm));

    // Stage filter from progress bar
    let matchesStage = true;
    if (activeStageFilter) {
      if (activeStageFilter === 'no_website') {
        matchesStage = !c.website || c.pipeline_stage === 'no_website';
      } else if (activeStageFilter === 'raw') {
        matchesStage = c.website && (!c.pipeline_stage || c.pipeline_stage === 'raw');
      } else {
        matchesStage = c.pipeline_stage === activeStageFilter;
      }
    }

    // Segment filter
    const matchesSegment = !segmentFilter ||
      (c.segment && c.segment.toLowerCase().includes(segmentFilter.toLowerCase()));

    // Contact tier filter
    const matchesTier = !tierFilter || getContactTier(c) === tierFilter;

    return matchesSearch && matchesStage && matchesSegment && matchesTier;
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
  const moveMenu = document.getElementById('bulk-move-menu');
  if (selectedIds.size > 0) {
    btn.classList.remove('hidden');
    btn.textContent = `Delete (${selectedIds.size})`;
    moveMenu.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
    moveMenu.classList.add('hidden');
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

async function handleBulkMove(stage) {
  const ids = Array.from(selectedIds);
  if (!ids.length) return;

  try {
    const res = await fetch('/api/companies/bulk-stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, stage })
    });

    if (res.ok) {
      const result = await res.json();
      // Update local state
      companies.forEach(c => {
        if (selectedIds.has(c.id)) c.pipeline_stage = stage;
      });
      selectedIds.clear();
      document.getElementById('select-all').checked = false;
      await updatePipelineStats();
      renderCompanies();
      updateDeleteButton();
      updateMainActionButton();
    }
  } catch (error) {
    alert('Error moving: ' + error.message);
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
  if (selectedIds.size > 0) {
    const ids = Array.from(selectedIds).join(',');
    window.location.href = `/api/searches/${currentSearchId}/export?ids=${ids}`;
  } else {
    window.location.href = `/api/searches/${currentSearchId}/export`;
  }
}

async function handleYAMMExport() {
  // Check for unchecked emails first
  try {
    const resp = await fetch('/api/contacts/unchecked-count');
    const data = await resp.json();
    if (data.unchecked > 0) {
      const proceed = confirm(`Warning: ${data.unchecked} contact emails haven't been validated yet. Only validated emails will be included in the export.\n\nContinue?`);
      if (!proceed) return;
    }
  } catch (e) {
    // Continue anyway if check fails
  }

  let url = '/api/export/yamm';
  const params = [];

  // If rows are selected, only export those
  if (selectedIds.size > 0) {
    params.push('ids=' + Array.from(selectedIds).join(','));
  }

  // If segment filter is active, include it
  const segmentText = document.getElementById('segment-filter-text')?.textContent;
  if (segmentText && segmentText !== 'Segment' && segmentText !== 'All') {
    params.push('segment=' + encodeURIComponent(segmentText));
  }

  if (params.length > 0) {
    url += '?' + params.join('&');
  }

  window.location.href = url;
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

/**
 * Enrich a single company - used for parallel processing
 * @param {Object} company - Company to enrich
 * @returns {Promise<{success: boolean, contacts: number, error?: string}>}
 */
async function enrichCompanyAsync(company) {
  // Set row status to processing
  setRowStatus(company.id, 'Enriching...', 'processing');

  try {
    const res = await fetch(`/api/companies/${company.id}/enrich-full`, { method: 'POST' });

    if (res.ok) {
      const data = await res.json();
      const contactsFound = data.contacts?.length || 0;

      // Update local data
      company.enrichment_source = 'waterfall_full';
      company.segment = data.enrichment?.segment;
      company.industry = data.enrichment?.industry;
      company.ico = data.enrichment?.ico;
      company.pipeline_stage = 'enriched';
      if (contactsFound > 0) {
        company.contacts_count = contactsFound;
        const primary = data.contacts.find(c => c.email);
        if (primary) company.primary_email = primary.email;
      }

      // Update row status to done
      const statusText = contactsFound > 0 ? `${contactsFound} contacts` : (data.enrichment?.segment || 'Done');
      setRowStatus(company.id, statusText, 'done');

      // Refresh row data immediately
      await refreshSingleRow(company.id);

      return { success: true, contacts: contactsFound, company, data };
    } else {
      const err = await res.json();
      setRowStatus(company.id, err.error || 'Failed', 'error');
      return { success: false, contacts: 0, error: err.error || 'Unknown error', company };
    }
  } catch (err) {
    setRowStatus(company.id, 'Error', 'error');
    return { success: false, contacts: 0, error: err.message, company };
  }
}

async function handleWaterfallEnrich() {
  const BATCH_SIZE = 3;

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
    const totalBatches = Math.ceil(toEnrich.length / BATCH_SIZE);
    enrichProgressText.textContent = `0 of ${toEnrich.length} companies`;
    enrichProgressFill.style.width = '0%';
    enrichCurrentName.textContent = 'Starting...';
    showEnrichPanel();

    const btn = document.getElementById('waterfall-enrich-btn');
    const originalText = btn.innerHTML;
    btn.disabled = true;

    let enriched = 0;
    let totalContacts = 0;
    let processed = 0;

    // Process in batches of BATCH_SIZE
    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      if (!enrichmentRunning) break; // Allow cancellation between batches

      const batchStart = batchIdx * BATCH_SIZE;
      const batch = toEnrich.slice(batchStart, batchStart + BATCH_SIZE);

      // Update panel to show current batch
      const batchNames = batch.map(c => c.name).join(', ');
      enrichCurrentName.textContent = batch.length > 1 ? `${batch.length} companies in parallel` : batch[0].name;

      // Hide step indicators (they don't make sense for parallel)
      resetEnrichSteps();
      setEnrichStep('scrape', 'active', `Processing ${batch.length} companies...`);

      // Process batch in parallel
      const results = await Promise.allSettled(batch.map(c => enrichCompanyAsync(c)));

      // Process results
      for (const result of results) {
        processed++;
        enrichProgressText.textContent = `${processed} of ${toEnrich.length} companies`;
        enrichProgressFill.style.width = `${(processed / toEnrich.length) * 100}%`;

        if (result.status === 'fulfilled') {
          const r = result.value;
          if (r.success) {
            enriched++;
            totalContacts += r.contacts;
            addEnrichResult(r.company, true, r.contacts > 0 ? `${r.contacts} contacts` : (r.data?.enrichment?.segment || 'Enriched'));
          } else {
            addEnrichResult(r.company, false, r.error || 'Error');
          }
        } else {
          // Promise rejected (shouldn't happen with our try/catch, but handle it)
          addEnrichResult(batch[0], false, result.reason?.message || 'Error');
        }
      }
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

  // Fetch enrichment log
  let enrichmentLogHtml = '';
  try {
    const logRes = await fetch(`/api/companies/${id}/enrichment-log`);
    const logData = await logRes.json();
    if (logData.log || logData.enrichment_error) {
      enrichmentLogHtml = buildEnrichmentLogHtml(logData.log, logData.enrichment_error, logData.runs);
    }
  } catch (e) {
    console.warn('Failed to fetch enrichment log:', e);
  }

  // Fetch contacts if enriched
  let contactsHtml = '-';
  if (company.contacts_count > 0) {
    try {
      const res = await fetch(`/api/companies/${id}/contacts`);
      const contacts = await res.json();
      if (contacts.length) {
        contactsHtml = contacts.map(c => `
          <div class="contact-card ${c.is_primary ? 'primary' : ''}" data-contact-id="${c.id}">
            <div class="contact-card-header">
              <div class="contact-name">${escapeHtml(c.full_name || c.email)}</div>
              <div class="contact-actions">
                <button class="contact-edit-btn" title="Edit contact" onclick="showEditContactModal(${c.id})">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="14" height="14">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                  </svg>
                </button>
                <button class="contact-delete-btn" title="Delete contact" onclick="handleDeleteContact(${c.id}, ${id})">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="14" height="14">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </button>
              </div>
            </div>
            <div class="contact-email"><a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a></div>
            ${c.title ? `<div class="contact-title">${escapeHtml(c.title)}</div>` : ''}
            ${c.phone ? `<div class="contact-phone">${escapeHtml(c.phone)}</div>` : ''}
            <div class="contact-confidence">${c.confidence || 0}% confidence</div>
          </div>
        `).join('');
      }
    } catch (e) {}
  }

  const currentStage = company.pipeline_stage || 'raw';
  const stages = ['raw', 'enriched', 'qualified', 'in_notion', 'parked'];
  const stageOptions = stages.map(s =>
    `<option value="${s}" ${s === currentStage ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}</option>`
  ).join('');

  content.innerHTML = `
    <div class="field">
      <div class="field-label">Name</div>
      <div class="field-value">${escapeHtml(company.name || '-')}</div>
    </div>
    <div class="field">
      <div class="field-label">Stage</div>
      <div class="field-value">
        <select class="detail-stage-select" id="detail-stage-select" data-company-id="${company.id}">
          ${stageOptions}
        </select>
      </div>
    </div>
    <div class="field">
      <div class="field-label">Segment</div>
      <div class="field-value">
        <select class="detail-segment-select" id="detail-segment-select" data-company-id="${company.id}">
          <option value="">-- Select --</option>
          <option value="Performance Marketing" ${company.segment === 'Performance Marketing' ? 'selected' : ''}>Performance Marketing</option>
          <option value="Brand Marketing" ${company.segment === 'Brand Marketing' ? 'selected' : ''}>Brand Marketing</option>
          <option value="Web Development" ${company.segment === 'Web Development' ? 'selected' : ''}>Web Development</option>
          <option value="Creative Agency" ${company.segment === 'Creative Agency' ? 'selected' : ''}>Creative Agency</option>
          <option value="PR & Media" ${company.segment === 'PR & Media' ? 'selected' : ''}>PR & Media</option>
          <option value="Full-Service Marketing" ${company.segment === 'Full-Service Marketing' ? 'selected' : ''}>Full-Service Marketing</option>
          <option value="Consulting" ${company.segment === 'Consulting' ? 'selected' : ''}>Consulting</option>
          <option value="Other" ${company.segment === 'Other' ? 'selected' : ''}>Other</option>
        </select>
      </div>
    </div>
    <div class="field">
      <div class="field-label">Website</div>
      <div class="field-value">${company.website ? `<a href="${escapeHtml(company.website)}" target="_blank">${escapeHtml(company.website)}</a>` : '-'}</div>
    </div>
    <div class="field contacts-section">
      <div class="field-label">Contacts</div>
      <div class="field-value">${contactsHtml}</div>
    </div>
    ${enrichmentLogHtml}
    <div class="details-more">
      <button class="details-toggle-btn" onclick="this.parentElement.classList.toggle('expanded')">
        More details
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="details-extra">
        <div class="field">
          <div class="field-label">Address</div>
          <div class="field-value">${escapeHtml(company.address || '-')}</div>
        </div>
        ${company.industry ? `
        <div class="field">
          <div class="field-label">Industry</div>
          <div class="field-value">${escapeHtml(company.industry)}</div>
        </div>
        ` : ''}
        ${company.ico ? `
        <div class="field">
          <div class="field-label">IČO</div>
          <div class="field-value">
            <span class="ico-badge ${company.ico_validated ? 'validated' : ''}">
              ${escapeHtml(company.ico)}
              ${company.ico_validated ? ' ✓' : ''}
            </span>
          </div>
        </div>
        ` : ''}
        ${company.company_size ? `
        <div class="field">
          <div class="field-label">Size</div>
          <div class="field-value">${escapeHtml(company.company_size)}</div>
        </div>
        ` : ''}
        <div class="field">
          <div class="field-label">Phone</div>
          <div class="field-value">${escapeHtml(company.phone || '-')}</div>
        </div>
        <div class="field">
          <div class="field-label">Rating</div>
          <div class="field-value">${company.rating ? `${company.rating} (${company.rating_count} reviews)` : '-'}</div>
        </div>
        ${company.enrichment_source ? `
        <div class="field">
          <div class="field-label">Source</div>
          <div class="field-value"><span class="enrichment-badge ${company.enrichment_source.includes('web') ? 'web_scrape' : 'hunter'}">${escapeHtml(company.enrichment_source)}</span></div>
        </div>
        ` : ''}
        <div class="field">
          <div class="field-label">Category</div>
          <div class="field-value">${escapeHtml(formatCategory(company.category))}</div>
        </div>
        <div class="field">
          <div class="field-label">Business Status</div>
          <div class="field-value">${escapeHtml(company.business_status || '-')}</div>
        </div>
        <div class="field">
          <div class="field-label">Place ID</div>
          <div class="field-value" style="font-size:11px;word-break:break-all;">${escapeHtml(company.place_id)}</div>
        </div>
      </div>
    </div>
  `;

  // Wire up stage selector
  document.getElementById('detail-stage-select').addEventListener('change', async (e) => {
    const newStage = e.target.value;
    const companyId = parseInt(e.target.dataset.companyId);
    try {
      const res = await fetch(`/api/companies/${companyId}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage })
      });
      if (res.ok) {
        const comp = companies.find(c => c.id === companyId);
        if (comp) comp.pipeline_stage = newStage;
        await updatePipelineStats();
        renderTable();
      }
    } catch (err) {
      console.error('Stage change failed:', err);
    }
  });

  // Wire up segment selector
  document.getElementById('detail-segment-select').addEventListener('change', async (e) => {
    const newSegment = e.target.value;
    const companyId = parseInt(e.target.dataset.companyId);
    if (!newSegment) return; // Ignore "-- Select --" option
    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment: newSegment })
      });
      if (res.ok) {
        const comp = companies.find(c => c.id === companyId);
        if (comp) comp.segment = newSegment;
        renderTable();
        // Refresh segment filter dropdown with any new segments
        loadSegments();
      }
    } catch (err) {
      console.error('Segment change failed:', err);
    }
  });

  fullViewPanel.classList.remove('hidden');
}

// Track current company being viewed for contact operations
let currentDetailCompanyId = null;

async function handleDeleteContact(contactId, companyId) {
  if (!confirm('Delete this contact?')) return;

  try {
    const res = await fetch(`/api/contacts/${contactId}`, { method: 'DELETE' });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error);
    }

    // Refresh the company details panel
    showDetails(companyId);

    // Update company in local state
    const company = companies.find(c => c.id === companyId);
    if (company) {
      company.contacts_count = Math.max(0, (company.contacts_count || 1) - 1);
    }
  } catch (err) {
    console.error('Failed to delete contact:', err);
    alert('Failed to delete contact: ' + err.message);
  }
}

async function showEditContactModal(contactId) {
  try {
    // Fetch current contact data
    const res = await fetch(`/api/contacts/${contactId}`);
    if (!res.ok) throw new Error('Contact not found');

    const contact = await res.json();

    // Populate and show modal
    document.getElementById('edit-contact-id').value = contact.id;
    document.getElementById('edit-contact-company-id').value = contact.company_id;
    document.getElementById('edit-contact-email').value = contact.email || '';
    document.getElementById('edit-contact-first-name').value = contact.first_name || '';
    document.getElementById('edit-contact-last-name').value = contact.last_name || '';
    document.getElementById('edit-contact-title').value = contact.title || '';
    document.getElementById('edit-contact-phone').value = contact.phone || '';
    document.getElementById('edit-contact-primary').checked = contact.is_primary === 1;

    showModal(document.getElementById('edit-contact-modal'));
  } catch (err) {
    console.error('Failed to load contact:', err);
    alert('Failed to load contact for editing');
  }
}

async function handleSaveContact(e) {
  e.preventDefault();

  const contactId = document.getElementById('edit-contact-id').value;
  const companyId = document.getElementById('edit-contact-company-id').value;

  const data = {
    email: document.getElementById('edit-contact-email').value.trim(),
    first_name: document.getElementById('edit-contact-first-name').value.trim(),
    last_name: document.getElementById('edit-contact-last-name').value.trim(),
    title: document.getElementById('edit-contact-title').value.trim(),
    phone: document.getElementById('edit-contact-phone').value.trim(),
    is_primary: document.getElementById('edit-contact-primary').checked
  };

  // Build full_name from first + last
  data.full_name = [data.first_name, data.last_name].filter(Boolean).join(' ') || null;

  try {
    const res = await fetch(`/api/contacts/${contactId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error);
    }

    hideModal(document.getElementById('edit-contact-modal'));

    // Refresh the details panel
    showDetails(parseInt(companyId));
  } catch (err) {
    console.error('Failed to update contact:', err);
    alert('Failed to update contact: ' + err.message);
  }
}

// ============ Utilities ============

function showModal(modal) {
  modal.classList.remove('hidden');
}

function hideModal(modal) {
  modal.classList.add('hidden');
}

/**
 * Build HTML for enrichment log display with optional run dropdown.
 * @param {Object} log - Latest run's enrichment log (or legacy flat log)
 * @param {string} error - Enrichment error type
 * @param {Array|null} runs - All runs from versioned log (null for legacy)
 * @returns {string} HTML string
 */
function buildEnrichmentLogHtml(log, error, runs) {
  if (!log && !error) return '';

  const hasMultipleRuns = runs && runs.length > 1;

  let runDropdownHtml = '';
  if (hasMultipleRuns) {
    const options = runs.map((r, i) => {
      const date = new Date(r.timestamp).toLocaleString('cs-CZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      const domain = r.domain ? ` (${escapeHtml(r.domain)})` : '';
      const selected = i === runs.length - 1 ? ' selected' : '';
      return `<option value="${i}"${selected}>${date}${domain}</option>`;
    }).join('');
    runDropdownHtml = `<select class="run-selector" onchange="switchEnrichmentRun(this)">${options}</select>`;
  }

  let runsHtml = '';
  if (hasMultipleRuns) {
    runsHtml = runs.map((r, i) => {
      const hidden = i === runs.length - 1 ? '' : ' style="display:none"';
      return `<div class="enrichment-run" data-run-index="${i}"${hidden}>${buildSingleRunLogHtml(r.log, i === runs.length - 1 ? error : null)}</div>`;
    }).join('');
  } else {
    runsHtml = `<div class="enrichment-run">${buildSingleRunLogHtml(log, error)}</div>`;
  }

  return `
    <div class="field enrichment-log-section">
      <div class="field-label">
        Enrichment Log ${runDropdownHtml}
        <button class="log-toggle" onclick="this.parentElement.parentElement.classList.toggle('collapsed')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
      </div>
      <div class="enrichment-log">
        ${runsHtml}
      </div>
    </div>
  `;
}

function switchEnrichmentRun(select) {
  const container = select.closest('.enrichment-log-section');
  const allRuns = container.querySelectorAll('.enrichment-run');
  allRuns.forEach(r => r.style.display = 'none');
  const selected = container.querySelector(`[data-run-index="${select.value}"]`);
  if (selected) selected.style.display = '';
}

function buildSingleRunLogHtml(log, error) {
  if (!log && !error) return '<div class="log-item">No log data</div>';

  const webResult = log?.webScrape?.result;
  const hunterFound = log?.hunter?.found > 0;
  const patternFound = log?.decisionMakerSearch?.found > 0;
  const scrapedContacts = log?.webScrape?.contactsKept?.length || 0;
  const hasPersonalContacts = scrapedContacts > 0 || hunterFound || patternFound;

  let resultClass, resultText;

  if (hasPersonalContacts) {
    resultClass = 'success';
    const sources = [];
    if (scrapedContacts > 0) sources.push('scrape');
    if (patternFound) sources.push('pattern');
    if (hunterFound) sources.push('hunter');
    resultText = `Found ${scrapedContacts + (log?.hunter?.found || 0) + (log?.decisionMakerSearch?.found || 0)} contact(s) via ${sources.join(' + ')}`;
  } else if (webResult === 'no_urls') {
    resultClass = 'error';
    resultText = 'Could not map domain';
  } else if (webResult === 'generic_only') {
    resultClass = 'warning';
    const genericEmails = log?.webScrape?.genericEmailsFound || [];
    resultText = `No personal contacts, only generic: ${genericEmails.map(e => escapeHtml(e)).join(', ') || 'none'}`;
  } else if (webResult === 'partial') {
    resultClass = 'warning';
    resultText = 'Found names but no emails';
  } else {
    resultClass = 'error';
    resultText = 'No contacts found';
  }

  // Run metadata
  let metaHtml = '';
  if (log?.duration != null) {
    metaHtml = `<div class="log-section"><div class="log-header">Duration: ${(log.duration / 1000).toFixed(1)}s</div></div>`;
  }

  const webLog = log?.webScrape || {};
  const urlsDiscovered = webLog.urlsDiscovered || 0;
  const pagesScraped = webLog.pagesScraped || [];
  const contactsKept = webLog.contactsKept || [];
  const genericSkipped = webLog.genericEmailsSkipped || [];

  let pagesHtml = '';
  if (pagesScraped.length > 0) {
    pagesHtml = pagesScraped.map(p => {
      const shortUrl = p.url.replace(/^https?:\/\/[^/]+/, '');
      const statusIcon = p.status === 'success' ? '✓' : p.status === 'error' ? '✗' : '○';
      return `<div class="log-item">├─ ${escapeHtml(shortUrl)} (${escapeHtml(p.category)}) ${statusIcon}</div>`;
    }).join('');
  } else {
    pagesHtml = '<div class="log-item">└─ No pages scraped</div>';
  }

  let contactsHtml = '';
  if (contactsKept.length > 0) {
    contactsHtml = contactsKept.map(c => {
      const role = c.role ? ` (${escapeHtml(c.role)})` : '';
      const srcTag = c.emailSource && c.emailSource !== 'web_scrape' ? ` [${escapeHtml(c.emailSource)}]` : '';
      return `<div class="log-item">├─ ${escapeHtml(c.name || 'Unknown')}${role} - ${escapeHtml(c.email)}${srcTag} ✓</div>`;
    }).join('');
  }
  if (genericSkipped.length > 0) {
    contactsHtml += `<div class="log-item log-skipped">└─ Filtered: ${genericSkipped.map(e => escapeHtml(e) + ' (generic)').join(', ')}</div>`;
  }
  if (!contactsHtml) {
    contactsHtml = '<div class="log-item">└─ No contacts extracted</div>';
  }

  // Contacts filtered from decisions
  const decisions = log?.decisions || [];
  const droppedDecisions = decisions.filter(d => d.decision === 'dropped');
  let filteredHtml = '';
  if (droppedDecisions.length > 0) {
    filteredHtml = `<div class="log-section">
      <div class="log-header">Contacts filtered: ${droppedDecisions.length}</div>
      ${droppedDecisions.map(d => `<div class="log-item log-skipped">├─ ${escapeHtml(d.contact || '?')}: ${escapeHtml(d.reason)}</div>`).join('')}
    </div>`;
  }

  // Decision trace (collapsible, collapsed by default)
  let decisionTraceHtml = '';
  if (decisions.length > 0) {
    const traceItems = decisions.map((d, i) => {
      const detail = d.decision ? ` → ${escapeHtml(d.decision)}` : '';
      const reason = d.reason ? `: ${escapeHtml(d.reason)}` : '';
      const extra = d.email ? ` (${escapeHtml(d.email)})` : '';
      return `<div class="log-item">├─ ${i + 1}. ${escapeHtml(d.step)}${detail}${reason}${extra}</div>`;
    }).join('');
    decisionTraceHtml = `
      <div class="log-section decision-trace collapsed">
        <div class="log-header" style="cursor:pointer" onclick="this.parentElement.classList.toggle('collapsed')">
          Decision trace (${decisions.length})
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-left:4px">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </div>
        ${traceItems}
      </div>`;
  }

  return `
    ${metaHtml}
    <div class="log-section">
      <div class="log-header">URLs discovered: ${urlsDiscovered}</div>
    </div>
    <div class="log-section">
      <div class="log-header">Pages scraped: ${pagesScraped.length}</div>
      ${pagesHtml}
    </div>
    <div class="log-section">
      <div class="log-header">Contacts extracted: ${contactsKept.length}</div>
      ${contactsHtml}
    </div>
    ${buildHunterLogHtml(log)}
    ${buildDecisionMakerLogHtml(log)}
    ${filteredHtml}
    ${decisionTraceHtml}
    <div class="log-result ${resultClass}">
      Result: ${resultClass === 'success' ? '✓' : resultClass === 'warning' ? '⚠' : '✗'} ${resultText}
    </div>
  `;
}

function buildHunterLogHtml(log) {
  if (!log?.hunter) {
    if (log?.decisionMakerSearch) {
      const dmFound = log.decisionMakerSearch.found || 0;
      return `<div class="log-section"><div class="log-header">Hunter.io: decision-maker search only</div><div class="log-item">${dmFound > 0 ? '✓' : '○'} ${dmFound} decision-maker${dmFound !== 1 ? 's' : ''} found</div></div>`;
    }
    const contactsKept = log?.webScrape?.contactsKept?.length || 0;
    const reason = contactsKept > 0 ? `Not needed, web scraping found ${contactsKept} personal contact${contactsKept > 1 ? 's' : ''}` : 'Not needed, web scraping found contacts';
    return `<div class="log-section"><div class="log-header">Hunter.io: skipped</div><div class="log-item log-skipped">└─ ${reason}</div></div>`;
  }
  const h = log.hunter;
  if (h.skipped && h.reason === 'no_api_key') {
    return `<div class="log-section"><div class="log-header">Hunter.io: skipped</div><div class="log-item log-skipped">└─ No API key configured</div></div>`;
  }
  if (h.error) return `<div class="log-section"><div class="log-header">Hunter.io: ✗ error</div><div class="log-item log-skipped">└─ ${escapeHtml(h.error)}</div></div>`;
  const found = h.found || 0;
  let html = `<div class="log-section"><div class="log-header">Hunter.io: ${found} contact${found !== 1 ? 's' : ''} found</div>`;
  if (!found) html += '<div class="log-item">└─ No results for this domain</div>';
  html += '</div>';
  return html;
}

function buildDecisionMakerLogHtml(log) {
  if (!log?.decisionMakerSearch) {
    if (log?.webScrape?.genericEmailsOnly) {
      return `<div class="log-section"><div class="log-header">Decision-maker search: not attempted</div><div class="log-item log-skipped">└─ No Hunter API key to search for decision-makers</div></div>`;
    }
    return '';
  }
  const dm = log.decisionMakerSearch;
  if (dm.error) {
    return `<div class="log-section"><div class="log-header">Decision-maker search: ✗ failed</div><div class="log-item log-skipped">└─ ${escapeHtml(dm.error)}</div></div>`;
  }
  let html = `<div class="log-section"><div class="log-header">Decision-maker search: ${dm.found || 0} email${(dm.found || 0) !== 1 ? 's' : ''} derived</div>`;
  if (dm.pattern) html += `<div class="log-item">├─ Pattern detected: ${escapeHtml(dm.pattern)}</div>`;
  if (dm.source) html += `<div class="log-item">├─ Derived from: ${escapeHtml(dm.source)}</div>`;
  if (dm.found > 0) html += `<div class="log-item">└─ Applied pattern to generate CEO/founder emails</div>`;
  html += '</div>';
  return html;
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

  const colors = SEGMENT_COLORS[segment] || SEGMENT_COLORS['Other'];
  return `<span class="segment-badge" style="background:${colors.bg};color:${colors.text}">${escapeHtml(segment)}</span>`;
}

function formatRating(rating, count, googleMapsUrl) {
  // null/undefined = no Google data
  if (rating == null) return '<span style="color:#9CA3AF">-</span>';
  // Format: "4.2 (3)" or "4.2 (1.2k)" for large counts
  const displayCount = count >= 1000 ? (count / 1000).toFixed(1) + 'k' : count || 0;
  const ratingText = `${rating.toFixed(1)} (${displayCount})`;

  // Add Google Maps link icon if URL exists
  if (googleMapsUrl) {
    return `${ratingText} <a href="${escapeHtml(googleMapsUrl)}" target="_blank" title="View on Google Maps" class="maps-link"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg></a>`;
  }
  return ratingText;
}

function getContactTier(company) {
  if (!company.primary_email) return 'none';

  const email = company.primary_email.toLowerCase();

  // Check for CEO/founder titles first (highest priority)
  const title = (company.primary_contact_title || '').toLowerCase();
  if (/\b(ceo|founder|co-founder|owner|director|managing|president|jednatel|majitel|zakladatel|ředitel|společník|partner)\b/.test(title)) return 'ceo';

  // Check if there's a real person's name associated (not "General Contact")
  // If a person is associated with a generic email, show as "named" not "generic"
  const hasPersonName = company.primary_contact_first_name &&
                        company.primary_contact_first_name !== 'General' &&
                        company.primary_contact_first_name.trim().length > 0;
  if (hasPersonName) return 'named';

  // Only mark as generic if no person name is associated
  const genericPrefixes = ['info@', 'kontakt@', 'contact@', 'office@', 'support@', 'sales@', 'hello@', 'obchod@', 'noreply@', 'poptavka@', 'recepce@', 'fakturace@', 'admin@', 'marketing@', 'webmaster@', 'general@', 'team@'];
  if (genericPrefixes.some(p => email.startsWith(p))) return 'generic';

  return 'named';
}

function formatContactCell(company) {
  const tier = getContactTier(company);
  if (tier === 'none') return '<span style="color:#9CA3AF">-</span>';

  const tierConfig = {
    ceo: { label: 'CEO', cls: 'tier-ceo' },
    named: { label: 'Named', cls: 'tier-named' },
    generic: { label: 'Generic', cls: 'tier-generic' }
  };
  const config = tierConfig[tier];
  const email = escapeHtml(company.primary_email);
  const truncated = email.length > 25 ? email.substring(0, 22) + '...' : email;

  return `<span class="contact-tier-badge ${config.cls} clickable" data-company-id="${company.id}">${config.label}</span><a href="mailto:${email}" class="contact-email-link" title="${email}">${truncated}</a>`;
}

// Tier popover for switching primary contact
async function showTierPopover(companyId, badgeEl) {
  // Close any existing popover
  closeTierPopover();

  try {
    const res = await fetch(`/api/companies/${companyId}/contacts`);
    const contacts = await res.json();

    if (!contacts.length) return;

    const popover = document.createElement('div');
    popover.id = 'tier-popover';
    popover.className = 'tier-popover';
    popover.innerHTML = `
      <div class="tier-popover-header">Switch Primary Contact</div>
      ${contacts.map(c => {
        const tierCls = getContactTierFromContact(c);
        const tierLabel = { ceo: 'CEO', named: 'Named', generic: 'Generic' }[tierCls] || 'Named';
        return `
          <label class="tier-popover-row ${c.is_primary ? 'active' : ''}" data-contact-id="${c.id}">
            <input type="radio" name="primary-contact" value="${c.id}" ${c.is_primary ? 'checked' : ''}>
            <span class="contact-tier-badge ${tierCls === 'ceo' ? 'tier-ceo' : tierCls === 'generic' ? 'tier-generic' : 'tier-named'}">${tierLabel}</span>
            <span class="tier-popover-name">${escapeHtml(c.full_name || c.email)}</span>
            <span class="tier-popover-email">${escapeHtml(c.email)}</span>
          </label>`;
      }).join('')}
    `;

    // Position next to the badge
    const rect = badgeEl.getBoundingClientRect();
    popover.style.top = `${rect.bottom + window.scrollY + 4}px`;
    popover.style.left = `${rect.left + window.scrollX}px`;
    document.body.appendChild(popover);

    // Handle radio change
    popover.querySelectorAll('input[name="primary-contact"]').forEach(radio => {
      radio.addEventListener('change', async () => {
        const contactId = radio.value;
        try {
          await fetch(`/api/contacts/${contactId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_primary: true })
          });
          closeTierPopover();
          await loadCompanies(currentSearchId);
        } catch (err) {
          console.error('Failed to switch primary:', err);
        }
      });
    });

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', closeTierPopoverOnOutsideClick);
    }, 0);
  } catch (err) {
    console.error('Failed to load contacts:', err);
  }
}

function getContactTierFromContact(contact) {
  if (!contact.email) return 'none';
  const email = contact.email.toLowerCase();

  // Check for CEO/founder titles first (highest priority)
  const title = (contact.title || '').toLowerCase();
  if (/\b(ceo|founder|co-founder|owner|director|managing|president|jednatel|majitel|zakladatel|ředitel|společník|partner)\b/.test(title)) return 'ceo';

  // Check if there's a real person's name (not "General Contact")
  const firstName = contact.first_name || '';
  const fullName = contact.full_name || '';
  const hasPersonName = (firstName && firstName !== 'General' && firstName.trim().length > 0) ||
                        (fullName && !fullName.toLowerCase().includes('general contact') && fullName.trim().length > 0);
  if (hasPersonName) return 'named';

  // Only mark as generic if no person name is associated
  const genericPrefixes = ['info@', 'kontakt@', 'contact@', 'office@', 'support@', 'sales@', 'hello@', 'webmaster@', 'general@', 'team@'];
  if (genericPrefixes.some(p => email.startsWith(p))) return 'generic';

  return 'named';
}

function closeTierPopover() {
  const existing = document.getElementById('tier-popover');
  if (existing) existing.remove();
  document.removeEventListener('click', closeTierPopoverOnOutsideClick);
}

function closeTierPopoverOnOutsideClick(e) {
  const popover = document.getElementById('tier-popover');
  if (popover && !popover.contains(e.target) && !e.target.classList.contains('contact-tier-badge')) {
    closeTierPopover();
  }
}

function formatStageStatus(stage, enrichmentError) {
  // Handle enrichment error
  if (enrichmentError === 'no_contacts') {
    return '<span class="enrichment-error-badge">No contacts</span>';
  }

  const stageLabels = {
    raw: 'Raw',
    no_website: 'No Website',
    enriched: 'Enriched',
    qualified: 'Qualified'
  };
  return stageLabels[stage] || stageLabels.raw;
}

/**
 * Format status cell with optional spinner
 * @param {{text: string, state: string}} status - Status object with text and state
 * @returns {string} - HTML for status cell
 */
function formatStatusCell(status) {
  const { text, state } = status;
  if (state === 'processing') {
    return `<span class="status-spinner"></span><span class="status-processing">${escapeHtml(text)}</span>`;
  }
  return `<span class="status-${state}">${escapeHtml(text)}</span>`;
}

// ============ Pipeline Progress & Main Action ============

async function updatePipelineStats() {
  try {
    const url = currentSearchId ? `/api/companies/stats?searchId=${currentSearchId}` : '/api/companies/stats';
    const res = await fetch(url);
    pipelineStats = await res.json();

    // Update labels for pipeline: Raw → No Website → Enriched → Qualified
    document.getElementById('stat-raw').textContent = pipelineStats.raw || 0;
    document.getElementById('stat-no_website').textContent = pipelineStats.no_website || 0;
    document.getElementById('stat-enriched').textContent = pipelineStats.enriched || 0;
    document.getElementById('stat-qualified').textContent = pipelineStats.qualified || 0;
    document.getElementById('stat-parked').textContent = pipelineStats.parked || 0;

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
    btnText.textContent = 'Enrich';
    btn.disabled = true;
    btn.dataset.action = 'none';
    return;
  }

  // Count no-website companies in selection
  const selectedNoWebsite = selectedCompanies.filter(c =>
    !c.website || c.pipeline_stage === 'no_website'
  ).length;

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
  } else if (selectedNoWebsite > 0 && activeStageFilter === 'no_website') {
    btnText.textContent = `Park (${selectedNoWebsite})`;
    btn.disabled = false;
    btn.dataset.action = 'park';
  } else {
    btnText.textContent = `${selectedCount} selected`;
    btn.disabled = true;
    btn.dataset.action = 'none';
  }
}

function updatePushNotionButton() {
  const btn = document.getElementById('push-notion-btn');
  const countSpan = document.getElementById('notion-count');

  // Count selected companies that can be pushed (qualified, not already in Notion)
  const selectedCompanies = companies.filter(c => selectedIds.has(c.id));
  const pushableCount = selectedCompanies.filter(c =>
    c.pipeline_stage === 'qualified' && !c.in_notion
  ).length;

  // Only enable when there are pushable leads selected
  if (pushableCount > 0) {
    btn.disabled = false;
    countSpan.textContent = `(${pushableCount})`;
    btn.title = `Push ${pushableCount} qualified leads to Notion`;
  } else {
    btn.disabled = true;
    countSpan.textContent = '';
    btn.title = selectedIds.size > 0 ? 'No qualified leads selected' : 'Select leads first';
  }
}

function handleProgressClick(stage) {
  // Update active state on pills
  document.querySelectorAll('.stage-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.stage === stage);
  });

  // Scope to current search if viewing one, otherwise global
  if (currentSearchId) {
    loadCompaniesByStage(stage, currentSearchId);
  } else {
    loadCompaniesByStage(stage);
  }
}

let enrichmentRunningBulk = false;
async function handleMainAction() {
  const btn = document.getElementById('main-action-btn');
  const action = btn.dataset.action;

  if (action === 'enrich') {
    if (enrichmentRunningBulk) return;
    enrichmentRunningBulk = true;
    try { await handleEnrichSelected(); } finally { enrichmentRunningBulk = false; }
  } else if (action === 'approve') {
    await handleApproveSelected();
  } else if (action === 'park') {
    await handleBulkMove('parked');
  }
}

async function handleEnrichSelected() {
  // First try raw companies
  let selectedCompanies = companies.filter(c =>
    selectedIds.has(c.id) &&
    c.website &&
    (!c.pipeline_stage || c.pipeline_stage === 'raw')
  );

  // If no raw leads but some already-enriched leads are selected, offer re-enrichment
  if (!selectedCompanies.length) {
    const enrichedSelected = companies.filter(c =>
      selectedIds.has(c.id) && c.website && c.enrichment_source
    );
    if (enrichedSelected.length > 0 && confirm(`Re-enrich ${enrichedSelected.length} already-enriched lead${enrichedSelected.length > 1 ? 's' : ''}? This will re-scrape and overwrite existing data.`)) {
      selectedCompanies = enrichedSelected;
    } else {
      alert('No leads selected to enrich.');
      return;
    }
  }

  const btn = document.getElementById('main-action-btn');
  const btnText = document.getElementById('main-action-text');
  btn.disabled = true;

  // Process in parallel batches of 3
  const BATCH_SIZE = 3;
  let done = 0;
  const total = selectedCompanies.length;
  btnText.innerHTML = `<span class="spinner"></span> Enriching 0/${total}...`;

  for (let i = 0; i < selectedCompanies.length; i += BATCH_SIZE) {
    const batch = selectedCompanies.slice(i, i + BATCH_SIZE);
    batch.forEach(c => setRowStatus(c.id, 'Enriching...', 'processing'));

    await Promise.all(batch.map(async (company) => {
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
      done++;
      btnText.innerHTML = `<span class="spinner"></span> Enriching ${done}/${total}...`;
    }));
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
      statusCell.innerHTML = formatStatusCell({ text, state });
    }
  }
}

/**
 * Refresh a single row with updated data from the server
 * @param {number} companyId - Company ID to refresh
 */
async function refreshSingleRow(companyId) {
  try {
    const res = await fetch(`/api/companies/${companyId}`);
    if (!res.ok) return;

    const updated = await res.json();

    // Update local companies array
    const idx = companies.findIndex(c => c.id === companyId);
    if (idx !== -1) {
      companies[idx] = { ...companies[idx], ...updated };
    }

    // Update filtered list too
    const filteredIdx = filteredCompanies.findIndex(c => c.id === companyId);
    if (filteredIdx !== -1) {
      filteredCompanies[filteredIdx] = { ...filteredCompanies[filteredIdx], ...updated };
    }

    // Re-render just this row's data cells (preserve status cell)
    const row = document.querySelector(`tr[data-id="${companyId}"]`);
    if (row && idx !== -1) {
      const c = companies[idx];
      // Update individual cells
      const cells = row.querySelectorAll('td');
      if (cells.length >= 8) {
        cells[1].textContent = c.name || '-';
        cells[2].textContent = extractCity(c.address);
        cells[3].innerHTML = c.website ? `<a href="${escapeHtml(c.website)}" target="_blank">${escapeHtml(formatWebsiteUrl(c.website))}</a>` : '<span style="color:#9CA3AF">-</span>';
        cells[5].innerHTML = formatContactCell(c);
        cells[6].innerHTML = formatSegmentBadge(c.segment, c.enrichment_source);
      }
    }
  } catch (err) {
    console.error('Failed to refresh row:', companyId, err);
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
    const body = selectedIds.size > 0 ? { companyIds: Array.from(selectedIds) } : {};
    const res = await fetch(`/api/notion/dedupe/search/${currentSearchId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
