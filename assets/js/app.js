/* ===== Field Kit - Main Application ===== */

(function () {
  'use strict';

  // Draft access: only viewers with ?token=<DRAFT_TOKEN> can see Draft packets
  const DRAFT_TOKEN = 'drafts';
  const isDraftViewer = new URLSearchParams(window.location.search).get('token') === DRAFT_TOKEN;

  let allPackets = [];
  let filteredPackets = [];
  let activeFilters = {
    search: '',
    publishState: '',
    discoverability: '',
    packetType: '',
    tags: []
  };

  // Cache for fetched remote content
  const contentCache = {};

  // Modal generation counter to prevent race conditions
  let modalGeneration = 0;

  let $searchInput, $stateFilter, $discoverFilter, $typeFilter, $packetGrid,
      $activeFilters, $resultsSummary, $modalOverlay, $modalContent,
      $sidebarIndustry, $sidebarDomain, $sidebarType, $tagCloud,
      $proposeBtn, $proposeDropdown;

  const RESOURCE_ICONS = {
    'github-repo': '\u{1F4C2}',
    'html': '\u{1F310}',
    'devin-session': '\u{1F916}',
    'google-doc': '\u{1F4C4}',
    'video': '\u{1F3AC}',
    'notion': '\u{1F4DD}',
    'other': '\u{1F4CE}'
  };

  const GITHUB_REPO = 'Devin-Samples/field-kit';
  const GITHUB_BRANCH = 'main';

  function approveUrl(packet) {
    // Link to edit the packet file on GitHub — user changes publishState to Published and commits
    const filename = packet.id + '.json';
    return `https://github.com/${GITHUB_REPO}/edit/${GITHUB_BRANCH}/data/packets/${filename}`;
  }

  function rejectUrl(packet) {
    // Link to delete the packet file on GitHub — creates a commit/PR removing it
    const filename = packet.id + '.json';
    return `https://github.com/${GITHUB_REPO}/delete/${GITHUB_BRANCH}/data/packets/${filename}`;
  }

  function issueUrl(packet) {
    if (!packet.issueNumber) return null;
    return `https://github.com/${GITHUB_REPO}/issues/${packet.issueNumber}`;
  }

  // --- Boot ---
  document.addEventListener('DOMContentLoaded', async () => {
    cacheDom();
    bindEvents();
    // Hide Draft filter option for non-token visitors; default to Draft if token present
    if (!isDraftViewer) {
      const draftOpt = $stateFilter.querySelector('option[value="Draft"]');
      if (draftOpt) draftOpt.remove();
    } else {
      $stateFilter.value = 'Draft';
      activeFilters.publishState = 'Draft';
    }
    await loadPackets();
    buildSidebar();
    buildProposeDropdown();
    applyFilters();
  });

  function cacheDom() {
    $searchInput = document.getElementById('search-input');
    $stateFilter = document.getElementById('filter-state');
    $discoverFilter = document.getElementById('filter-discoverability');
    $typeFilter = document.getElementById('filter-type');
    $packetGrid = document.getElementById('packet-grid');
    $activeFilters = document.getElementById('active-filters');
    $resultsSummary = document.getElementById('results-summary');
    $modalOverlay = document.getElementById('modal-overlay');
    $modalContent = document.getElementById('modal-content');
    $sidebarIndustry = document.getElementById('sidebar-industry');
    $sidebarDomain = document.getElementById('sidebar-domain');
    $sidebarType = document.getElementById('sidebar-type');
    $tagCloud = document.getElementById('tag-cloud');
    $proposeBtn = document.getElementById('propose-entry-btn');
    $proposeDropdown = document.getElementById('propose-dropdown');
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

    $typeFilter.addEventListener('change', () => {
      activeFilters.packetType = $typeFilter.value;
      applyFilters();
    });

    $modalOverlay.addEventListener('click', (e) => {
      if (e.target === $modalOverlay) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

    // Propose dropdown toggle
    $proposeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      $proposeDropdown.classList.toggle('open');
    });

    document.addEventListener('click', () => {
      $proposeDropdown.classList.remove('open');
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

      // Populate type filter dropdown
      const types = [...new Set(allPackets.map(p => p.packetType).filter(Boolean))];
      types.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        $typeFilter.appendChild(opt);
      });
    } catch (err) {
      console.error('Failed to load packets:', err);
      allPackets = [];
    }
  }

  // --- Propose dropdown ---
  function buildProposeDropdown() {
    const templateMap = {};
    allPackets.forEach(p => {
      if (p.packetType && p.issueTemplate) {
        templateMap[p.packetType] = p.issueTemplate;
      }
    });

    let html = '';
    for (const [type, template] of Object.entries(templateMap)) {
      html += `<a href="https://github.com/Devin-Samples/field-kit/issues/new?template=${encodeURIComponent(template)}" target="_blank" rel="noopener">${esc(type)}</a>`;
    }
    if (!html) {
      html = '<a href="https://github.com/Devin-Samples/field-kit/issues/new" target="_blank" rel="noopener">General</a>';
    }
    $proposeDropdown.innerHTML = html;
  }

  // --- Sidebar ---
  function buildSidebar() {
    const counts = { type: {}, industry: {}, domain: {}, allTags: {} };

    allPackets.forEach(p => {
      // Exclude Draft packets from sidebar counts for non-token visitors
      if (!isDraftViewer && p.publishState === 'Draft') return;
      if (p.packetType) counts.type[p.packetType] = (counts.type[p.packetType] || 0) + 1;
      (p.tags.industry || []).forEach(t => { counts.industry[t] = (counts.industry[t] || 0) + 1; });
      (p.tags.technicalDomain || []).forEach(t => { counts.domain[t] = (counts.domain[t] || 0) + 1; });

      Object.values(p.tags).forEach(arr => {
        if (Array.isArray(arr)) {
          arr.forEach(t => { counts.allTags[t] = (counts.allTags[t] || 0) + 1; });
        }
      });
    });

    renderSidebarList($sidebarType, counts.type, 'type');
    renderSidebarList($sidebarIndustry, counts.industry, 'tag');
    renderSidebarList($sidebarDomain, counts.domain, 'tag');
    renderTagCloud(counts.allTags);
  }

  function renderSidebarList($el, countMap, mode) {
    const sorted = Object.entries(countMap).sort((a, b) => b[1] - a[1]);
    $el.innerHTML = sorted.map(([tag, count]) =>
      `<li data-value="${esc(tag)}" data-mode="${mode}" class="${
        (mode === 'type' && activeFilters.packetType === tag) || 
        (mode === 'tag' && activeFilters.tags.includes(tag)) ? 'active' : ''
      }">
        <span>${esc(tag)}</span>
        <span class="count">${count}</span>
      </li>`
    ).join('');

    $el.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', () => {
        if (li.dataset.mode === 'type') {
          activeFilters.packetType = activeFilters.packetType === li.dataset.value ? '' : li.dataset.value;
          $typeFilter.value = activeFilters.packetType;
        } else {
          const idx = activeFilters.tags.indexOf(li.dataset.value);
          if (idx === -1) activeFilters.tags.push(li.dataset.value);
          else activeFilters.tags.splice(idx, 1);
        }
        buildSidebar();
        applyFilters();
      });
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
    if (idx === -1) activeFilters.tags.push(tag);
    else activeFilters.tags.splice(idx, 1);
    buildSidebar();
    applyFilters();
  }

  // --- Filtering ---
  function applyFilters() {
    const q = activeFilters.search.toLowerCase();

    filteredPackets = allPackets.filter(p => {
      // Hide Draft packets from non-token visitors
      if (!isDraftViewer && p.publishState === 'Draft') return false;
      if (activeFilters.publishState && p.publishState !== activeFilters.publishState) return false;
      if (activeFilters.discoverability && p.discoverability !== activeFilters.discoverability) return false;
      if (activeFilters.packetType && p.packetType !== activeFilters.packetType) return false;

      if (activeFilters.tags.length > 0) {
        const packetTags = getAllTags(p).map(t => t.toLowerCase());
        if (!activeFilters.tags.every(ft => packetTags.includes(ft.toLowerCase()))) return false;
      }

      if (q) {
        const haystack = [
          p.title, p.description, p.packetType || '', p.maintainer || '', ...getAllTags(p)
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
          <div class="icon">\u{1F50D}</div>
          <h3>No packets found</h3>
          <p>Try adjusting your search or filters.</p>
        </div>`;
      return;
    }

    $packetGrid.innerHTML = filteredPackets.map(p => {
      const stateBadge = badgeClass(p.publishState);
      const discBadge = discoverabilityBadge(p.discoverability);
      const tags = getAllTags(p).slice(0, 6);
      const contentCount = countContentItems(p);

      return `
        <div class="packet-card" data-id="${esc(p.id)}">
          ${p.packetType ? `<div class="packet-type-label">${esc(p.packetType)}</div>` : ''}
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
            <span>\u{1F4E6} ${contentCount} item${contentCount !== 1 ? 's' : ''}</span>
            <span>\u{1F464} ${esc(p.maintainer || 'Unknown')}</span>
            <span>\u{1F4C5} ${esc(p.updated || p.created || '')}</span>
          </div>
          ${isDraftViewer && p.publishState === 'Draft' ? `
          <div class="draft-actions">
            <a href="${esc(approveUrl(p))}" target="_blank" rel="noopener" class="btn btn-approve" onclick="event.stopPropagation()">Approve</a>
            <a href="${esc(rejectUrl(p))}" target="_blank" rel="noopener" class="btn btn-reject" onclick="event.stopPropagation()">Reject</a>
            ${p.issueNumber ? `<a href="${esc(issueUrl(p))}" target="_blank" rel="noopener" class="btn btn-outline btn-sm" onclick="event.stopPropagation()">#${p.issueNumber}</a>` : ''}
          </div>` : ''}
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
      chips.push(chipHtml('Search: ' + activeFilters.search));
    }
    if (activeFilters.publishState) {
      chips.push(chipHtml('State: ' + activeFilters.publishState));
    }
    if (activeFilters.discoverability) {
      chips.push(chipHtml('Access: ' + activeFilters.discoverability));
    }
    if (activeFilters.packetType) {
      chips.push(chipHtml('Type: ' + activeFilters.packetType));
    }
    activeFilters.tags.forEach(tag => {
      chips.push(chipHtml(tag));
    });

    if (chips.length > 0) {
      chips.push(`<button class="clear-all-btn" id="clear-all-filters">Clear all</button>`);
    }

    $activeFilters.innerHTML = chips.join('');

    // Bind chip remove buttons
    $activeFilters.querySelectorAll('.filter-chip button').forEach(btn => {
      btn.addEventListener('click', () => {
        const chip = btn.parentElement;
        const label = chip.dataset.chip;
        if (label.startsWith('Search: ')) { activeFilters.search = ''; $searchInput.value = ''; }
        else if (label.startsWith('State: ')) { activeFilters.publishState = ''; $stateFilter.value = ''; }
        else if (label.startsWith('Access: ')) { activeFilters.discoverability = ''; $discoverFilter.value = ''; }
        else if (label.startsWith('Type: ')) { activeFilters.packetType = ''; $typeFilter.value = ''; }
        else { toggleTag(label); return; }
        buildSidebar();
        applyFilters();
      });
    });

    const clearBtn = document.getElementById('clear-all-filters');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        activeFilters = { search: '', publishState: '', discoverability: '', packetType: '', tags: [] };
        $searchInput.value = '';
        $stateFilter.value = '';
        $discoverFilter.value = '';
        $typeFilter.value = '';
        buildSidebar();
        applyFilters();
      });
    }
  }

  function chipHtml(label) {
    return `<span class="filter-chip" data-chip="${esc(label)}">${esc(label)} <button>&times;</button></span>`;
  }

  function renderResultsSummary() {
    const total = isDraftViewer ? allPackets.length : allPackets.filter(p => p.publishState !== 'Draft').length;
    const shown = filteredPackets.length;
    $resultsSummary.textContent = shown === total
      ? `Showing all ${total} packet${total !== 1 ? 's' : ''}`
      : `Showing ${shown} of ${total} packets`;
  }

  // --- Modal ---
  function openModal(packetId) {
    const packet = allPackets.find(p => p.id === packetId);
    if (!packet) return;

    // Increment generation to invalidate any pending async loads
    const currentGeneration = ++modalGeneration;

    const stateBadge = badgeClass(packet.publishState);
    const discBadge = discoverabilityBadge(packet.discoverability);

    let html = `
      <div class="modal-header">
        <div>
          ${packet.packetType ? `<div class="packet-type-label">${esc(packet.packetType)}</div>` : ''}
          <h2>${esc(packet.title)}</h2>
          <div class="packet-badges" style="margin-top:0.4rem">
            <span class="badge ${stateBadge}">${esc(packet.publishState)}</span>
            <span class="badge ${discBadge}">${esc(packet.discoverability)}</span>
          </div>
          ${isDraftViewer && packet.publishState === 'Draft' ? `
          <div class="draft-actions" style="margin-top:0.6rem">
            <a href="${esc(approveUrl(packet))}" target="_blank" rel="noopener" class="btn btn-approve">Approve</a>
            <a href="${esc(rejectUrl(packet))}" target="_blank" rel="noopener" class="btn btn-reject">Reject</a>
            ${packet.issueNumber ? `<a href="${esc(issueUrl(packet))}" target="_blank" rel="noopener" class="btn btn-outline btn-sm">View Issue #${packet.issueNumber}</a>` : ''}
          </div>` : ''}
        </div>
        <button class="modal-close" id="modal-close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <div class="modal-section">
          <h3>Description</h3>
          <p style="font-size:0.85rem;color:var(--color-text-secondary);line-height:1.6">${esc(packet.description)}</p>
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
            <span>\u{1F464} Maintainer: ${esc(packet.maintainer || 'Unknown')}</span>
            <span>\u{1F4C5} Created: ${esc(packet.created || 'N/A')}</span>
            <span>\u{1F4C5} Updated: ${esc(packet.updated || 'N/A')}</span>
          </div>
        </div>`;

    // Content Item Groups (dynamic)
    if (packet.contentGroups && packet.contentGroups.length > 0) {
      html += `<div class="modal-section"><h3>Content</h3>`;
      packet.contentGroups.forEach((group, idx) => {
        const groupId = 'content-group-' + idx;
        html += `
          <div class="content-group" id="${groupId}">
            <div class="content-group-header" onclick="document.getElementById('${groupId}').classList.toggle('expanded')">
              <span class="content-group-title">${esc(group.title)}</span>
              <div style="display:flex;align-items:center;gap:0.5rem">
                <span class="content-group-count" id="${groupId}-count">loading...</span>
                <span class="content-group-toggle">\u25B6</span>
              </div>
            </div>
            <div class="content-group-items" id="${groupId}-items">
              <div class="loading-spinner">Loading content...</div>
            </div>
          </div>`;
      });
      html += `</div>`;
    }

    // Traditional resources
    const res = packet.resources || {};
    if (res.labPackage) {
      if (res.labPackage.cognitionEnv && res.labPackage.cognitionEnv.length > 0) {
        html += renderResourceSection('Lab Package - Cognition Env', res.labPackage.cognitionEnv);
      }
      if (res.labPackage.customerEnv && res.labPackage.customerEnv.length > 0) {
        html += renderResourceSection('Lab Package - Customer Env', res.labPackage.customerEnv);
      }
    }
    if (res.setupGuide && res.setupGuide.length > 0) {
      html += renderResourceSection('Setup / Technical Guide', res.setupGuide);
    }
    if (res.media && res.media.length > 0) {
      html += renderResourceSection('Audio / Video', res.media);
    }

    html += `</div>`;

    $modalContent.innerHTML = html;
    $modalOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    document.getElementById('modal-close-btn').addEventListener('click', closeModal);

    // Load dynamic content groups
    if (packet.contentGroups) {
      packet.contentGroups.forEach((group, idx) => {
        loadContentGroup(group, 'content-group-' + idx, currentGeneration);
      });
    }
  }

  // --- Dynamic content loading ---
  async function loadContentGroup(group, groupId, generation) {
    const $items = document.getElementById(groupId + '-items');
    const $count = document.getElementById(groupId + '-count');

    if (!group.sourceUrl) {
      $items.innerHTML = '<div class="loading-spinner">No source configured</div>';
      $count.textContent = '0 items';
      return;
    }

    // Check cache
    if (contentCache[group.sourceUrl]) {
      if (generation !== modalGeneration) return;
      renderContentItems($items, $count, contentCache[group.sourceUrl], group);
      return;
    }

    try {
      const resp = await fetch(group.sourceUrl);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const text = await resp.text();
      contentCache[group.sourceUrl] = text;
      // Check if modal is still showing the same content
      if (generation !== modalGeneration) return;
      renderContentItems($items, $count, text, group);
    } catch (err) {
      console.error('Failed to load content group:', err);
      if (generation !== modalGeneration) return;
      $items.innerHTML = `<div class="loading-spinner">Failed to load content. <a href="${esc(group.sourceUrl)}" target="_blank" style="color:var(--color-accent)">View source</a></div>`;
      $count.textContent = 'error';
    }
  }

  function renderContentItems($el, $countEl, rawText, group) {
    const parser = group.parser || 'markdown-table';
    let items = [];

    if (parser === 'markdown-table') {
      items = parseMarkdownTable(rawText, group);
    } else if (parser === 'directory-list') {
      items = parseDirectoryList(rawText, group);
    }

    $countEl.textContent = items.length + ' item' + (items.length !== 1 ? 's' : '');

    if (items.length === 0) {
      $el.innerHTML = '<div class="loading-spinner">No items found</div>';
      return;
    }

    $el.innerHTML = items.map(item => `
      <div class="content-item">
        <a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.title)}</a>
        ${item.meta ? `<span class="content-item-meta">${esc(item.meta)}</span>` : ''}
      </div>
    `).join('');
  }

  function parseMarkdownTable(text, group) {
    const items = [];
    const lines = text.split('\n');
    const baseUrl = group.baseUrl || '';

    for (const line of lines) {
      // Match markdown table rows with links: | [Name](url) | ... |
      const match = line.match(/\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|(.+)/);
      if (match) {
        const title = match[1].trim();
        let url = match[2].trim();
        const rest = match[3].trim();

        // Skip header separator rows
        if (title.includes('---')) continue;

        // Make relative URLs absolute
        if (!url.startsWith('http') && baseUrl) {
          url = baseUrl + '/' + url.replace(/^\.\//, '');
        }

        // Extract metadata from remaining columns
        const cols = rest.split('|').map(c => c.trim()).filter(c => c && !c.match(/^-+$/));
        const meta = cols.slice(0, 3).join(' | ');

        items.push({ title, url, meta });
      }
    }
    return items;
  }

  function parseDirectoryList(text, group) {
    // Not used currently but available for future parsers
    return [];
  }

  function renderResourceSection(title, resources) {
    // Filter out Draft resources for non-token visitors
    const visibleResources = isDraftViewer ? resources : resources.filter(r => r.state !== 'Draft');
    if (visibleResources.length === 0) return '';
    let html = `<div class="modal-section"><h3>${esc(title)}</h3><ul class="resource-list">`;
    visibleResources.forEach(r => {
      const icon = RESOURCE_ICONS[r.type] || RESOURCE_ICONS['other'];
      const accessClass = (r.access || 'public');
      const isDraft = r.state === 'Draft';
      const titleHtml = r.url
        ? `<a href="${esc(r.url)}" target="_blank" rel="noopener" class="resource-title">${esc(r.title)}</a>`
        : `<span class="resource-title">${esc(r.title)}</span>`;
      html += `
        <li class="resource-item${isDraft ? ' resource-draft' : ''}">
          <div class="resource-icon">${icon}</div>
          <div class="resource-info">
            ${titleHtml}
            ${r.description ? `<div class="resource-desc">${esc(r.description)}</div>` : ''}
          </div>
          <div style="display:flex;gap:0.4rem;align-items:center">
            ${isDraft ? '<span class="badge badge-draft">Draft</span>' : ''}
            <span class="resource-access ${esc(accessClass)}">${esc(accessClass)}</span>
          </div>
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
    return 'badge-' + (state || '').toLowerCase().replace(/[\s\/]/g, '-');
  }

  function discoverabilityBadge(disc) {
    const d = (disc || '').toLowerCase();
    if (d === 'public') return 'badge-public';
    if (d === 'internal') return 'badge-internal';
    return 'badge-partner';
  }

  function countContentItems(packet) {
    let count = 0;
    if (packet.contentGroups) {
      count += packet.contentGroups.length;
    }
    const res = packet.resources || {};
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
