/* ===== Field Kit - Main Application ===== */

(function () {
  'use strict';

  // --- State ---
  let allPackets = [];
  let filteredPackets = [];
  let activeFilters = {
    search: '',
    publishState: '',
    discoverability: '',
    tags: [] // freeform tag strings clicked from sidebar/tag cloud
  };

  // --- DOM refs (populated after DOMContentLoaded) ---
  let $searchInput, $stateFilter, $discoverFilter, $packetGrid,
      $activeFilters, $resultsSummary, $modalOverlay, $modalContent,
      $sidebarIndustry, $sidebarDomain, $sidebarLanguage, $tagCloud;

  // --- Resource type icons (emoji fallback, no external deps) ---
  const RESOURCE_ICONS = {
    'github-repo': '📂',
    'html': '🌐',
    'devin-session': '🤖',
    'google-doc': '📄',
    'video': '🎬',
    'notion': '📝',
    'other': '📎'
  };

  const MEDIA_TYPE_LABELS = {
    'Demo': '🎯 Demo',
    'Explanation': '💡 Explanation',
    'Setup': '🔧 Setup'
  };

  // --- Boot ---
  document.addEventListener('DOMContentLoaded', async () => {
    cacheDom();
    bindEvents();
    await loadPackets();
    buildSidebar();
    applyFilters();
  });

  function cacheDom() {
    $searchInput = document.getElementById('search-input');
    $stateFilter = document.getElementById('filter-state');
    $discoverFilter = document.getElementById('filter-discoverability');
    $packetGrid = document.getElementById('packet-grid');
    $activeFilters = document.getElementById('active-filters');
    $resultsSummary = document.getElementById('results-summary');
    $modalOverlay = document.getElementById('modal-overlay');
    $modalContent = document.getElementById('modal-content');
    $sidebarIndustry = document.getElementById('sidebar-industry');
    $sidebarDomain = document.getElementById('sidebar-domain');
    $sidebarLanguage = document.getElementById('sidebar-language');
    $tagCloud = document.getElementById('tag-cloud');
  }

  function bindEvents() {
    $searchInput.addEventListener('input', debounce(() => {
      activeFilters.search = $searchInput.value.trim();
      applyFilters();
    }, 200));

    $stateFilter.addEventListener('change', () => {
      activeFilters.publishState = $stateFilter.value;
      applyFilters();
    });

    $discoverFilter.addEventListener('change', () => {
      activeFilters.discoverability = $discoverFilter.value;
      applyFilters();
    });

    $modalOverlay.addEventListener('click', (e) => {
      if (e.target === $modalOverlay) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
  }

  // --- Data loading ---
  async function loadPackets() {
    try {
      const indexResp = await fetch('data/packets/index.json');
      const index = await indexResp.json();
      const promises = index.map(file =>
        fetch('data/packets/' + file).then(r => r.json())
      );
      allPackets = await Promise.all(promises);
    } catch (err) {
      console.error('Failed to load packets:', err);
      allPackets = [];
    }
  }

  // --- Sidebar ---
  function buildSidebar() {
    const counts = { industry: {}, domain: {}, language: {}, allTags: {} };

    allPackets.forEach(p => {
      (p.tags.industry || []).forEach(t => { counts.industry[t] = (counts.industry[t] || 0) + 1; });
      (p.tags.technicalDomain || []).forEach(t => { counts.domain[t] = (counts.domain[t] || 0) + 1; });
      (p.tags.language || []).forEach(t => { counts.language[t] = (counts.language[t] || 0) + 1; });

      // Collect ALL tags for tag cloud
      Object.values(p.tags).forEach(arr => {
        if (Array.isArray(arr)) {
          arr.forEach(t => { counts.allTags[t] = (counts.allTags[t] || 0) + 1; });
        }
      });
    });

    renderSidebarList($sidebarIndustry, counts.industry);
    renderSidebarList($sidebarDomain, counts.domain);
    renderSidebarList($sidebarLanguage, counts.language);
    renderTagCloud(counts.allTags);
  }

  function renderSidebarList($el, countMap) {
    const sorted = Object.entries(countMap).sort((a, b) => b[1] - a[1]);
    $el.innerHTML = sorted.map(([tag, count]) =>
      `<li data-tag="${esc(tag)}" class="${activeFilters.tags.includes(tag) ? 'active' : ''}">
        <span>${esc(tag)}</span>
        <span class="count">${count}</span>
      </li>`
    ).join('');

    $el.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', () => toggleTag(li.dataset.tag));
    });
  }

  function renderTagCloud(countMap) {
    const sorted = Object.entries(countMap).sort((a, b) => b[1] - a[1]);
    $tagCloud.innerHTML = sorted.map(([tag]) =>
      `<button class="tag-btn ${activeFilters.tags.includes(tag) ? 'active' : ''}" data-tag="${esc(tag)}">${esc(tag)}</button>`
    ).join('');

    $tagCloud.querySelectorAll('.tag-btn').forEach(btn => {
      btn.addEventListener('click', () => toggleTag(btn.dataset.tag));
    });
  }

  function toggleTag(tag) {
    const idx = activeFilters.tags.indexOf(tag);
    if (idx === -1) {
      activeFilters.tags.push(tag);
    } else {
      activeFilters.tags.splice(idx, 1);
    }
    buildSidebar(); // re-render active states
    applyFilters();
  }

  // --- Filtering ---
  function applyFilters() {
    const q = activeFilters.search.toLowerCase();

    filteredPackets = allPackets.filter(p => {
      // Publish state
      if (activeFilters.publishState && p.publishState !== activeFilters.publishState) return false;

      // Discoverability
      if (activeFilters.discoverability && p.discoverability !== activeFilters.discoverability) return false;

      // Tags
      if (activeFilters.tags.length > 0) {
        const packetTags = getAllTags(p).map(t => t.toLowerCase());
        const match = activeFilters.tags.every(ft => packetTags.includes(ft.toLowerCase()));
        if (!match) return false;
      }

      // Search: match against title, description, all tags, maintainer
      if (q) {
        const haystack = [
          p.title,
          p.description,
          p.maintainer || '',
          ...getAllTags(p)
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });

    renderPacketGrid();
    renderActiveFilters();
    renderResultsSummary();
  }

  function getAllTags(packet) {
    const tags = [];
    Object.values(packet.tags).forEach(arr => {
      if (Array.isArray(arr)) tags.push(...arr);
    });
    return tags;
  }

  // --- Render Packet Cards ---
  function renderPacketGrid() {
    if (filteredPackets.length === 0) {
      $packetGrid.innerHTML = `
        <div class="empty-state">
          <div class="icon">🔍</div>
          <h3>No packets found</h3>
          <p>Try adjusting your search or filters.</p>
        </div>`;
      return;
    }

    $packetGrid.innerHTML = filteredPackets.map(p => {
      const stateBadge = badgeClass(p.publishState);
      const discBadge = discoverabilityBadge(p.discoverability);
      const tags = getAllTags(p).slice(0, 6);
      const resourceCount = countResources(p);

      return `
        <div class="packet-card" data-id="${esc(p.id)}">
          <div class="packet-card-header">
            <span class="packet-title">${esc(p.title)}</span>
            <div class="packet-badges">
              <span class="badge ${stateBadge}">${esc(p.publishState)}</span>
              <span class="badge ${discBadge}">${esc(p.discoverability)}</span>
            </div>
          </div>
          <div class="packet-description">${esc(p.description)}</div>
          <div class="packet-tags">
            ${tags.map(t => `<span class="packet-tag">${esc(t)}</span>`).join('')}
            ${getAllTags(p).length > 6 ? `<span class="packet-tag">+${getAllTags(p).length - 6} more</span>` : ''}
          </div>
          <div class="packet-meta">
            <span>📎 ${resourceCount} resource${resourceCount !== 1 ? 's' : ''}</span>
            <span>👤 ${esc(p.maintainer || 'Unknown')}</span>
            <span>📅 ${esc(p.updated || p.created || '')}</span>
          </div>
        </div>`;
    }).join('');

    $packetGrid.querySelectorAll('.packet-card').forEach(card => {
      card.addEventListener('click', () => openModal(card.dataset.id));
    });
  }

  // --- Active Filters Chips ---
  function renderActiveFilters() {
    const chips = [];

    if (activeFilters.search) {
      chips.push(chipHtml('Search: ' + activeFilters.search, () => {
        activeFilters.search = '';
        $searchInput.value = '';
        applyFilters();
      }));
    }
    if (activeFilters.publishState) {
      chips.push(chipHtml('State: ' + activeFilters.publishState, () => {
        activeFilters.publishState = '';
        $stateFilter.value = '';
        applyFilters();
      }));
    }
    if (activeFilters.discoverability) {
      chips.push(chipHtml('Access: ' + activeFilters.discoverability, () => {
        activeFilters.discoverability = '';
        $discoverFilter.value = '';
        applyFilters();
      }));
    }
    activeFilters.tags.forEach(tag => {
      chips.push(chipHtml(tag, () => toggleTag(tag)));
    });

    if (chips.length > 0) {
      chips.push(`<button class="clear-all-btn" id="clear-all-filters">Clear all</button>`);
    }

    $activeFilters.innerHTML = chips.join('');

    const clearBtn = document.getElementById('clear-all-filters');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        activeFilters = { search: '', publishState: '', discoverability: '', tags: [] };
        $searchInput.value = '';
        $stateFilter.value = '';
        $discoverFilter.value = '';
        buildSidebar();
        applyFilters();
      });
    }
  }

  function chipHtml(label, _handler) {
    // We use event delegation below instead
    return `<span class="filter-chip" data-chip="${esc(label)}">${esc(label)} <button>&times;</button></span>`;
  }

  function renderResultsSummary() {
    const total = allPackets.length;
    const shown = filteredPackets.length;
    $resultsSummary.textContent = shown === total
      ? `Showing all ${total} packets`
      : `Showing ${shown} of ${total} packets`;
  }

  // --- Modal ---
  function openModal(packetId) {
    const packet = allPackets.find(p => p.id === packetId);
    if (!packet) return;

    const stateBadge = badgeClass(packet.publishState);
    const discBadge = discoverabilityBadge(packet.discoverability);

    let html = `
      <div class="modal-header">
        <div>
          <h2>${esc(packet.title)}</h2>
          <div class="packet-badges" style="margin-top:0.5rem">
            <span class="badge ${stateBadge}">${esc(packet.publishState)}</span>
            <span class="badge ${discBadge}">${esc(packet.discoverability)}</span>
          </div>
        </div>
        <button class="modal-close" id="modal-close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <div class="modal-section">
          <h3>Description</h3>
          <p style="font-size:0.9rem;color:var(--color-text-muted);line-height:1.6">${esc(packet.description)}</p>
        </div>

        <div class="modal-section">
          <h3>Tags</h3>
          <div class="packet-tags">
            ${getAllTags(packet).map(t => `<span class="packet-tag">${esc(t)}</span>`).join('')}
          </div>
        </div>

        <div class="modal-section">
          <h3>Metadata</h3>
          <div class="packet-meta" style="flex-wrap:wrap;gap:1rem">
            <span>👤 Maintainer: ${esc(packet.maintainer || 'Unknown')}</span>
            <span>📅 Created: ${esc(packet.created || 'N/A')}</span>
            <span>📅 Updated: ${esc(packet.updated || 'N/A')}</span>
          </div>
        </div>`;

    // Lab Package
    const lab = packet.resources.labPackage;
    if (lab) {
      if (lab.cognitionEnv && lab.cognitionEnv.length > 0) {
        html += renderResourceSection('Lab Package — Cognition Env', lab.cognitionEnv);
      }
      if (lab.customerEnv && lab.customerEnv.length > 0) {
        html += renderResourceSection('Lab Package — Customer Env', lab.customerEnv);
      }
    }

    // Setup Guide
    if (packet.resources.setupGuide && packet.resources.setupGuide.length > 0) {
      html += renderResourceSection('Setup / Technical Guide', packet.resources.setupGuide);
    }

    // Media
    if (packet.resources.media && packet.resources.media.length > 0) {
      html += renderResourceSection('Audio / Video', packet.resources.media, true);
    }

    html += `</div>`; // close modal-body

    $modalContent.innerHTML = html;
    $modalOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  }

  function renderResourceSection(title, resources, showMediaType) {
    let html = `<div class="modal-section"><h3>${esc(title)}</h3><ul class="resource-list">`;
    resources.forEach(r => {
      const icon = RESOURCE_ICONS[r.type] || RESOURCE_ICONS['other'];
      const accessClass = (r.access || 'public');
      const mediaLabel = showMediaType && r.mediaType ? ` — ${MEDIA_TYPE_LABELS[r.mediaType] || r.mediaType}` : '';
      html += `
        <li class="resource-item">
          <div class="resource-icon ${r.type}">${icon}</div>
          <div class="resource-info">
            <a href="${esc(r.url)}" target="_blank" rel="noopener" class="resource-title">${esc(r.title)}${mediaLabel}</a>
            ${r.description ? `<div class="resource-desc">${esc(r.description)}</div>` : ''}
          </div>
          <span class="resource-access ${accessClass}">${accessClass}</span>
        </li>`;
    });
    html += `</ul></div>`;
    return html;
  }

  function closeModal() {
    $modalOverlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  // --- Helpers ---
  function badgeClass(state) {
    return 'badge-' + (state || '').toLowerCase().replace(/\//g, '-');
  }

  function discoverabilityBadge(disc) {
    const d = (disc || '').toLowerCase();
    if (d === 'public') return 'badge-public';
    if (d === 'internal') return 'badge-internal';
    return 'badge-partner'; // partner variants
  }

  function countResources(packet) {
    let count = 0;
    const res = packet.resources;
    if (res.labPackage) {
      count += (res.labPackage.cognitionEnv || []).length;
      count += (res.labPackage.customerEnv || []).length;
    }
    count += (res.setupGuide || []).length;
    count += (res.media || []).length;
    return count;
  }

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }
})();
