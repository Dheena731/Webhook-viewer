/* ============================================================
   Thoondil — app.js
   Studio Webhook Debugger & Inspector
   ============================================================ */

'use strict';

// ── Application State ──────────────────────────────────────
const state = {
  events: [],           // All events recorded
  filtered: [],         // Currently displayed events
  selectedId: null,     // Selected event ID
  activeChannel: 'all', // Active channel filter ('all' or specific path)
  customChannels: JSON.parse(localStorage.getItem('hi:custom_channels') || '["/hooks/orders"]'),
  mockRules: [],        // Configured mock rules
  autoScroll: true,
  replayUrl: localStorage.getItem('hi:replayUrl') || '',
  theme: localStorage.getItem('hi:theme') || 'warm-sand',
  soundEnabled: localStorage.getItem('hi:sound') !== 'false',
  unreadCount: 0,
  jsonAllExpanded: false,
};

// ── DOM References ─────────────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const dom = {
  html:              document.documentElement,
  eventList:         $('#event-list'),
  emptyState:        $('#empty-state'),
  eventCount:        $('#event-count'),
  searchInput:       $('#search-input'),
  methodFilter:      $('#method-filter'),
  statusDot:         $('#status-dot'),
  statusText:        $('#status-text'),
  endpointUrl:       $('#endpoint-url'),
  curlExample:       $('#curl-example'),
  channelList:       $('#channel-list'),
  badgeAll:          $('#badge-all'),
  mockRulesList:     $('#mock-rules-list'),
  chkAutoScroll:     $('#chk-auto-scroll'),

  // Inspector Elements
  inspector:         $('#inspector'),
  inspectorEmpty:    $('#inspector-empty'),
  inspectorContent:  $('#inspector-content'),
  inspMethod:        $('#insp-method'),
  inspStatus:        $('#insp-status'),
  inspPath:          $('#insp-path'),
  inspTime:          $('#insp-time'),
  inspSize:          $('#insp-size'),
  inspClient:        $('#insp-client'),
  inspId:            $('#insp-id'),
  bodyViewer:        $('#body-viewer'),
  bodyFormatBadge:   $('#body-format-badge'),
  headersViewer:     $('#headers-viewer'),
  queryViewer:       $('#query-viewer'),
  rawViewer:         $('#raw-viewer'),
  replayInput:       $('#replay-url'),
  replayResult:      $('#replay-result'),
  tabBodyBadge:      $('#tab-body-badge'),
  tabHeadersCount:   $('#tab-headers-count'),
  tabQueryCount:     $('#tab-query-count'),

  // Modals
  mockModal:         $('#mock-modal'),
  mockPath:          $('#mock-path'),
  mockMethod:        $('#mock-method'),
  mockStatus:        $('#mock-status'),
  mockBody:          $('#mock-body'),
  mockIntercept:     $('#mock-intercept'),
  shortcutsModal:    $('#shortcuts-modal'),
  channelModal:      $('#channel-modal'),
  newChannelName:    $('#new-channel-name'),
  newChannelPreview: $('#new-channel-preview'),

  // Control Buttons
  btnThemeToggle:    $('#btn-theme-toggle'),
  btnSoundToggle:    $('#btn-sound-toggle'),
  soundIconOn:       $('#sound-icon-on'),
  soundIconOff:      $('#sound-icon-off'),
  themeIconSun:      $('#theme-icon-sun'),
  themeIconMoon:     $('#theme-icon-moon'),
};

// ── Web Audio Synthesizer (Chime) ──────────────────────────
let audioCtx = null;
function playChime() {
  if (!state.soundEnabled) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const now = audioCtx.currentTime;

    // First tone (pleasant warm mid-high)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.08, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.18);

    // Second tone (harmonic resolution)
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.08); // A5
    gain2.gain.setValueAtTime(0.07, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.32);
  } catch (_) { /* audio error ignored */ }
}

// ── Theme Switcher ─────────────────────────────────────────
function applyTheme(theme) {
  state.theme = theme;
  dom.html.setAttribute('data-theme', theme);
  localStorage.setItem('hi:theme', theme);
  const isDark = theme === 'obsidian';
  dom.themeIconSun.hidden = isDark;
  dom.themeIconMoon.hidden = !isDark;
}

function toggleTheme() {
  applyTheme(state.theme === 'warm-sand' ? 'obsidian' : 'warm-sand');
}

// ── Sound Toggle ───────────────────────────────────────────
function updateSoundUI() {
  dom.soundIconOn.hidden = !state.soundEnabled;
  dom.soundIconOff.hidden = state.soundEnabled;
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  localStorage.setItem('hi:sound', state.soundEnabled ? 'true' : 'false');
  updateSoundUI();
}

// ── Helpers ────────────────────────────────────────────────
function methodClass(m) {
  return `method-${(m || 'get').toLowerCase()}`;
}

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 5)  return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n/1024).toFixed(1)} KB`;
  return `${(n/1048576).toFixed(2)} MB`;
}

function escapedHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    if (btn) {
      const orig = btn.innerHTML;
      btn.classList.add('copied');
      btn.textContent = '✓ Copied';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = orig;
      }, 1500);
    }
  });
}

// ── JSON Syntax Highlighter & Tree ─────────────────────────
function renderJsonTree(value, depth = 0) {
  if (value === null) return `<span class="json-null">null</span>`;
  if (typeof value === 'boolean') return `<span class="json-boolean">${value}</span>`;
  if (typeof value === 'number') return `<span class="json-number">${value}</span>`;
  if (typeof value === 'string') return `<span class="json-string">"${escapedHtml(value)}"</span>`;

  const isArr = Array.isArray(value);
  const keys = Object.keys(value);
  if (keys.length === 0) return isArr ? '[]' : '{}';

  const open = isArr ? '[' : '{';
  const close = isArr ? ']' : '}';
  const id = `jn-${Math.random().toString(36).slice(2, 9)}`;
  const preview = isArr
    ? `<span class="json-inline-preview"> [${keys.length} items]</span>`
    : `<span class="json-inline-preview"> {${keys.length} keys}</span>`;

  const children = keys.map((k, idx) => {
    const isLast = idx === keys.length - 1;
    const keyLabel = isArr ? '' : `<span class="json-key">"${escapedHtml(k)}"</span><span class="json-punctuation">: </span>`;
    return `<span class="json-node">${keyLabel}${renderJsonTree(value[k], depth + 1)}` +
           `<span class="json-punctuation">${isLast ? '' : ','}</span></span>`;
  }).join('');

  return `<span class="json-node">` +
    `<span class="json-toggle" data-target="${id}" onclick="toggleJsonNode(this)">▼</span>` +
    `<span class="json-punctuation">${open}</span>` +
    `${preview}` +
    `<span class="json-children" id="${id}">${children}</span>` +
    `<span class="json-punctuation">${close}</span>` +
    `</span>`;
}

window.toggleJsonNode = function(btn) {
  const targetId = btn.dataset.target;
  const children = document.getElementById(targetId);
  if (!children) return;
  const node = btn.closest('.json-node');
  const collapsed = node.classList.toggle('json-collapsed');
  btn.textContent = collapsed ? '▶' : '▼';
  const preview = btn.parentElement.querySelector('.json-inline-preview');
  if (preview) preview.style.display = collapsed ? '' : 'none';
};

function toggleAllJsonNodes(expand) {
  const toggles = $$('.json-toggle', dom.bodyViewer);
  toggles.forEach(t => {
    const node = t.closest('.json-node');
    if (expand) {
      node.classList.remove('json-collapsed');
      t.textContent = '▼';
      const preview = t.parentElement.querySelector('.json-inline-preview');
      if (preview) preview.style.display = 'none';
    } else {
      node.classList.add('json-collapsed');
      t.textContent = '▶';
      const preview = t.parentElement.querySelector('.json-inline-preview');
      if (preview) preview.style.display = '';
    }
  });
}

// ── KV Table (Headers & Query) ─────────────────────────────
function renderKvTable(obj, container) {
  const entries = Object.entries(obj || {});
  if (entries.length === 0) {
    container.innerHTML = '<div class="kv-empty">No parameters or headers recorded</div>';
    return;
  }
  container.innerHTML = entries.map(([k, v]) => {
    const val = Array.isArray(v) ? v.join(', ') : v;
    const isRedacted = val === '[redacted]';
    return `<div class="kv-row">
      <div class="kv-key">${escapedHtml(k)}</div>
      <div class="kv-val ${isRedacted ? 'kv-redacted' : ''}">${escapedHtml(String(val))}</div>
    </div>`;
  }).join('');
}

// ── cURL Generator ─────────────────────────────────────────
function eventToCurl(event) {
  if (!event) return '';
  const url = `${window.location.origin}${event.path}`;
  const parts = [`curl -X ${event.method} '${url}'`];

  const headers = event.headers || {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === '[redacted]') continue;
    if (['content-length', 'host'].includes(k.toLowerCase())) continue;
    parts.push(`  -H '${k}: ${v}'`);
  }

  if (event.body) {
    if (event.bodyFormat === 'json') {
      const bodyStr = JSON.stringify(event.body);
      parts.push(`  -H 'Content-Type: application/json'`);
      parts.push(`  -d '${bodyStr.replace(/'/g, "'\"'\"'")}'`);
    } else if (event.bodyFormat === 'form') {
      const pairs = [];
      for (const [k, vals] of Object.entries(event.body)) {
        for (const v of (Array.isArray(vals) ? vals : [vals])) {
          pairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
        }
      }
      parts.push(`  -H 'Content-Type: application/x-www-form-urlencoded'`);
      parts.push(`  -d '${pairs.join('&')}'`);
    } else if (typeof event.body === 'string') {
      parts.push(`  -d '${event.body.replace(/'/g, "'\"'\"'")}'`);
    }
  }
  return parts.join(' \\\n');
}

// ── Channel Navigation ─────────────────────────────────────
function updateChannels() {
  const counts = new Map();
  // Include custom channels (initialized with 0)
  for (const p of state.customChannels) {
    counts.set(p, 0);
  }
  for (const e of state.events) {
    counts.set(e.path, (counts.get(e.path) || 0) + 1);
  }

  dom.badgeAll.textContent = state.events.length;

  const existing = $$('.channel-item[data-channel]', dom.channelList);
  existing.forEach(el => {
    if (el.dataset.channel !== 'all') el.remove();
  });

  for (const [path, count] of [...counts.entries()].sort()) {
    const li = document.createElement('li');
    li.className = 'channel-item' + (state.activeChannel === path ? ' active' : '');
    li.dataset.channel = path;
    li.setAttribute('role', 'button');
    li.setAttribute('tabindex', '0');
    li.innerHTML = `
      <span class="channel-icon">⦿</span>
      <span class="channel-name" title="${escapedHtml(path)}">${escapedHtml(path)}</span>
      <span class="channel-badge">${count}</span>`;
    li.addEventListener('click', () => setChannel(path));
    li.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        li.click();
      }
    });
    dom.channelList.appendChild(li);
  }
}

function setChannel(channel) {
  state.activeChannel = channel;
  $$('.channel-item', dom.channelList).forEach(el => {
    el.classList.toggle('active', el.dataset.channel === channel);
  });

  // Dynamically update the Endpoint URL card to reflect selected channel
  const targetPath = channel === 'all' ? '/hooks/orders' : channel;
  const fullUrl = `${window.location.origin}${targetPath}`;
  dom.endpointUrl.textContent = fullUrl;
  dom.curlExample.textContent = [
    `curl -X POST '${fullUrl}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '{"event": "test.ping", "source": "${targetPath.replace(/^.*\//, '')}"}'`
  ].join('\n');

  applyFilters();
}

function setWorkspaceView(view) {
  const workspace = $('.workspace');
  document.body.classList.remove('mobile-menu-open');
  $('#btn-mobile-menu').setAttribute('aria-expanded', 'false');
  workspace.classList.toggle('show-endpoints', view === 'endpoints');
  workspace.classList.remove('mobile-detail');
  $$('.rail-button').forEach(button => {
    const active = button.dataset.workspaceView === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

// ── Filtering ──────────────────────────────────────────────
let filterTimer = null;
function scheduleFilter() {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(applyFilters, 100);
}

function applyFilters() {
  const q = dom.searchInput.value.trim().toLowerCase();
  const m = dom.methodFilter.value.toUpperCase();
  const ch = state.activeChannel;

  state.filtered = state.events.filter(e => {
    if (ch !== 'all' && e.path !== ch) return false;
    if (m && e.method.toUpperCase() !== m) return false;
    if (q) {
      const bodyStr = JSON.stringify(e.body || '').toLowerCase();
      const headersStr = JSON.stringify(e.headers || {}).toLowerCase();
      if (!e.path.toLowerCase().includes(q) &&
          !e.method.toLowerCase().includes(q) &&
          !bodyStr.includes(q) &&
          !headersStr.includes(q)) return false;
    }
    return true;
  });

  renderEventList();
}

// ── Event Feed Rendering ───────────────────────────────────
function renderEventList() {
  dom.eventCount.textContent = `${state.filtered.length} ${state.filtered.length === 1 ? 'request' : 'requests'}`;
  dom.emptyState.hidden = state.events.length > 0;
  $('#no-results').hidden = state.events.length === 0 || state.filtered.length > 0;

  dom.eventList.innerHTML = '';
  for (let i = 0; i < state.filtered.length; i++) {
    dom.eventList.appendChild(createEventItem(state.filtered[i], i));
  }
}

function createEventItem(event, index) {
  const li = document.createElement('li');
  li.className = 'event-item' +
    (event.id === state.selectedId ? ' selected' : '') +
    (event.pinned ? ' pinned' : '');
  li.dataset.id = event.id;
  li.setAttribute('role', 'option');
  li.setAttribute('aria-selected', event.id === state.selectedId ? 'true' : 'false');
  li.tabIndex = 0;

  const time = relativeTime(event.receivedAt);
  const fullTime = new Date(event.receivedAt).toLocaleString();

  // Generate 1-line body preview
  let preview = '';
  if (event.body) {
    try {
      const raw = typeof event.body === 'object' ? JSON.stringify(event.body) : String(event.body);
      preview = raw.length > 70 ? raw.slice(0, 67) + '…' : raw;
    } catch (_) {}
  }

  li.innerHTML = `
    <span class="event-method">
      <span class="method-badge ${methodClass(event.method)}">${event.method}</span>
    </span>
    <span class="event-info">
      <span class="event-path" title="${escapedHtml(event.path)}">${escapedHtml(event.path)}</span>
      ${preview ? `<span class="event-preview" title="${escapedHtml(preview)}">${escapedHtml(preview)}</span>` : ''}
      <span class="event-meta">
        <span title="${fullTime}">${time}</span>
        <span>•</span>
        <span>${formatBytes(event.sizeBytes)}</span>
      </span>
    </span>`;

  li.addEventListener('click', () => selectEvent(event.id));
  li.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectEvent(event.id);
    }
  });
  return li;
}

function addEventToList(event, flash = false) {
  state.events.unshift(event);
  updateChannels();
  applyFilters();

  if (flash) {
    playChime();
    const item = dom.eventList.querySelector(`[data-id="${event.id}"]`);
    if (item) {
      item.classList.add('new-flash');
      setTimeout(() => item.classList.remove('new-flash'), 800);
    }
    if (state.autoScroll) {
      dom.eventList.scrollTo({ top: 0, behavior: 'smooth' });
    }
    // Auto-select if first event
    if (state.events.length === 1 || !state.selectedId) {
      selectEvent(event.id, false);
    }
  }
}

// ── Inspector Panel ────────────────────────────────────────
let activeTab = 'body';

function closeMobileInspector() {
  $('.workspace').classList.remove('mobile-detail');
  const selected = $$('.event-item', dom.eventList).find(el => el.dataset.id === state.selectedId);
  if (selected) selected.focus();
}

function selectEvent(id, openMobile = true) {
  state.selectedId = id;
  const event = state.events.find(e => e.id === id);
  if (!event) return;

  // Highlight list item
  $$('.event-item', dom.eventList).forEach(el => {
    const isSelected = el.dataset.id === id;
    el.classList.toggle('selected', isSelected);
    el.setAttribute('aria-selected', isSelected ? 'true' : 'false');
  });

  dom.inspectorEmpty.hidden = true;
  dom.inspectorContent.hidden = false;
  if (openMobile && window.matchMedia('(max-width: 680px)').matches) {
    $('.workspace').classList.add('mobile-detail');
    $('#btn-back-feed').focus();
  }

  // Header meta
  dom.inspMethod.className = `method-badge ${methodClass(event.method)}`;
  dom.inspMethod.textContent = event.method;
  dom.inspPath.textContent = event.path;
  $('#workbench-title').textContent = event.path;
  $('#workbench-method').textContent = event.method;
  $('#workbench-method').dataset.method = event.method;
  dom.inspTime.textContent = new Date(event.receivedAt).toLocaleTimeString();
  dom.inspTime.title = event.receivedAt;
  dom.inspSize.textContent = formatBytes(event.sizeBytes);
  dom.inspClient.textContent = event.client;
  dom.inspId.textContent = event.id.slice(0, 8);
  dom.inspId.title = event.id;

  // Status code
  dom.inspStatus.textContent = `HTTP ${event.status || 202}`;

  // Pin button state
  $('#btn-pin').classList.toggle('active', !!event.pinned);

  // Tab count badges
  dom.tabHeadersCount.textContent = Object.keys(event.headers || {}).length;
  dom.tabQueryCount.textContent = Object.keys(event.query || {}).length;
  dom.tabBodyBadge.textContent = (event.bodyFormat || 'empty').toUpperCase();

  // Reset replay status
  dom.replayInput.value = state.replayUrl;
  dom.replayResult.hidden = true;

  renderTab(activeTab, event);
}

function renderTab(tab, event) {
  if (!event) {
    event = state.events.find(e => e.id === state.selectedId);
  }
  if (!event) return;
  activeTab = tab;

  switch (tab) {
    case 'body':
      renderBody(event);
      break;
    case 'headers':
      renderKvTable(event.headers, dom.headersViewer);
      break;
    case 'query':
      renderKvTable(flattenQuery(event.query), dom.queryViewer);
      break;
    case 'raw':
      dom.rawViewer.textContent = JSON.stringify(event, null, 2);
      break;
  }
}

function flattenQuery(query) {
  const out = {};
  for (const [k, v] of Object.entries(query || {})) {
    out[k] = Array.isArray(v) ? v.join(', ') : v;
  }
  return out;
}

function renderBody(event) {
  dom.bodyFormatBadge.className = `format-badge format-${event.bodyFormat || 'empty'}`;
  dom.bodyFormatBadge.textContent = (event.bodyFormat || 'empty').toUpperCase();
  dom.bodyViewer.innerHTML = '';

  if (!event.body && event.body !== 0) {
    dom.bodyViewer.innerHTML = '<span style="color:#8895A5">No payload body received</span>';
    return;
  }

  if (event.bodyFormat === 'json' && typeof event.body === 'object') {
    dom.bodyViewer.innerHTML = renderJsonTree(event.body);
  } else if (event.bodyFormat === 'form') {
    renderKvTable(event.body, dom.bodyViewer);
  } else {
    dom.bodyViewer.textContent = String(event.body);
  }
}

// ── Tab Navigation ─────────────────────────────────────────
$$('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.tab-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
      b.tabIndex = -1;
    });
    $$('.tab-pane').forEach(p => p.hidden = true);

    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    btn.tabIndex = 0;
    const tabId = `tab-${btn.dataset.tab}`;
    const targetPane = $(`#${tabId}`);
    if (targetPane) targetPane.hidden = false;
    renderTab(btn.dataset.tab);
  });
  btn.addEventListener('keydown', e => {
    const tabs = $$('.tab-btn');
    const index = tabs.indexOf(btn);
    let next;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    tabs[next].click();
    tabs[next].focus();
  });
});

// ── Send Demo Webhook (1-Click Test) ───────────────────────
async function sendDemoWebhook() {
  const demoEvents = [
    {
      path: '/hooks/orders?source=shopify',
      body: {
        event: 'order.completed',
        orderId: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
        status: 'paid',
        amount: parseFloat((Math.random() * 150 + 29.99).toFixed(2)),
        currency: 'USD',
        customer: {
          name: 'Alex Rivera',
          email: 'alex.rivera@example.com',
          vip: true
        },
        items: [
          { sku: 'PREMIUM-KIT', qty: 1, price: 99.99 },
          { sku: 'DEV-STICKERS', qty: 3, price: 4.99 }
        ],
        timestamp: new Date().toISOString()
      }
    },
    {
      path: '/hooks/payments?source=stripe',
      body: {
        id: `evt_${Math.random().toString(36).slice(2, 12)}`,
        type: 'payment_intent.succeeded',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: `pi_${Math.random().toString(36).slice(2, 10)}`,
            amount: 4500,
            currency: 'usd',
            payment_method_types: ['card'],
            status: 'succeeded'
          }
        }
      }
    },
    {
      path: '/hooks/github?source=repo',
      body: {
        action: 'push',
        ref: 'refs/heads/main',
        repository: { name: 'hook-inspect', full_name: 'dev/hook-inspect' },
        commits: [
          { id: Math.random().toString(16).slice(2, 9), message: 'feat: add real-time webhook inspection' }
        ]
      }
    }
  ];

  const sample = demoEvents[Math.floor(Math.random() * demoEvents.length)];

  try {
    const resp = await fetch(sample.path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Thoondil-Demo/1.0',
        'X-Demo-Event': 'true'
      },
      body: JSON.stringify(sample.body)
    });
    if (!resp.ok) console.warn('Demo send failed:', resp.status);
  } catch (err) {
    console.error('Error firing demo webhook:', err);
  }
}

// ── Replay Functionality ───────────────────────────────────
async function replayEvent() {
  const event = state.events.find(e => e.id === state.selectedId);
  if (!event) return;

  let targetUrl = dom.replayInput.value.trim();
  if (!targetUrl) {
    dom.replayInput.focus();
    return;
  }
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'http://' + targetUrl;
    dom.replayInput.value = targetUrl;
  }

  localStorage.setItem('hi:replayUrl', targetUrl);
  state.replayUrl = targetUrl;

  const btn = $('#btn-replay');
  const origText = btn.innerHTML;
  btn.innerHTML = 'Replaying…';
  btn.disabled = true;

  try {
    const resp = await fetch('/api/replay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: event.id, targetUrl }),
    });
    const data = await resp.json();
    dom.replayResult.hidden = false;
    if (data.replayed) {
      dom.replayResult.className = 'replay-result success';
      dom.replayResult.textContent = `Response ${data.status} from ${targetUrl}. Credential and connection headers were omitted.`;
    } else {
      dom.replayResult.className = 'replay-result error';
      dom.replayResult.textContent = `✗ Error: ${data.error}`;
    }
  } catch (err) {
    dom.replayResult.hidden = false;
    dom.replayResult.className = 'replay-result error';
    dom.replayResult.textContent = `✗ Replay request failed: ${err.message}`;
  } finally {
    btn.innerHTML = origText;
    btn.disabled = false;
  }
}

// ── Mock Rules Management ──────────────────────────────────
async function loadMockRules() {
  try {
    const resp = await fetch('/api/mock-rules');
    const data = await resp.json();
    state.mockRules = data.rules || [];
    renderMockRules();
  } catch (_) { /* ignore */ }
}

function renderMockRules() {
  if (state.mockRules.length === 0) {
    dom.mockRulesList.innerHTML = '<li class="mock-empty">No active mock rules · <a href="#" class="mock-add-link" onclick="event.preventDefault();document.getElementById(\'mock-modal\').hidden=false;">+ Add one</a></li>';
    return;
  }
  dom.mockRulesList.innerHTML = state.mockRules.map(r => `
    <li class="mock-rule-item" data-id="${r.id}">
      <span class="mock-rule-path" title="${escapedHtml(r.path || 'any')}">${escapedHtml(r.path || '*')}</span>
      <span class="mock-rule-status">${r.status || 200}</span>
      <button class="btn-icon-subtle mock-rule-delete" title="Delete rule" onclick="deleteMockRule('${r.id}')">
        <svg viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      </button>
    </li>`).join('');
}

window.deleteMockRule = async function(id) {
  await fetch(`/api/mock-rules?id=${id}`, { method: 'DELETE' });
  await loadMockRules();
};

async function saveMockRule() {
  const rule = {
    path: dom.mockPath.value.trim(),
    method: dom.mockMethod.value,
    status: parseInt(dom.mockStatus.value) || 200,
    body: dom.mockBody.value.trim(),
    intercept: dom.mockIntercept.checked,
  };
  await fetch('/api/mock-rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule),
  });
  dom.mockModal.hidden = true;
  await loadMockRules();
}

// ── SSE Real-Time Connection ───────────────────────────────
let sseStream = null;

function connectSSE() {
  if (sseStream) {
    try { sseStream.close(); } catch (_) {}
  }
  sseStream = new EventSource('/api/stream');
  sseStream.onopen = () => {
    dom.statusDot.className = 'status-dot online';
    dom.statusText.textContent = 'Live';
  };
  sseStream.addEventListener('webhook', ({ data }) => {
    const event = JSON.parse(data);
    addEventToList(event, true);
  });
  sseStream.onerror = () => {
    dom.statusDot.className = 'status-dot offline';
    dom.statusText.textContent = 'Reconnect';
  };
}

async function loadEvents() {
  const resp = await fetch('/api/events');
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  state.events = data.events || [];
  updateChannels();
  applyFilters();
}

// ── Keyboard Shortcuts ─────────────────────────────────────
document.addEventListener('keydown', e => {
  const tag = document.activeElement.tagName;
  const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);

  if (e.key === 'Escape') {
    if ($('.workspace').classList.contains('mobile-detail')) {
      closeMobileInspector();
      return;
    }
    // Dismiss modals if open
    if (!dom.mockModal.hidden) { dom.mockModal.hidden = true; return; }
    if (!dom.shortcutsModal.hidden) { dom.shortcutsModal.hidden = true; return; }
    if (dom.channelModal && !dom.channelModal.hidden) { dom.channelModal.hidden = true; return; }
    if (isInput) { document.activeElement.blur(); return; }
    if (dom.searchInput.value) { dom.searchInput.value = ''; applyFilters(); }
    return;
  }

  if (isInput) return;

  switch (e.key) {
    case '/':
      e.preventDefault();
      dom.searchInput.focus();
      dom.searchInput.select();
      break;
    case 't':
    case 'T':
      e.preventDefault();
      sendDemoWebhook();
      break;
    case 'e':
    case 'E':
      e.preventDefault();
      window.open('/api/export', '_blank');
      break;
    case '?':
      e.preventDefault();
      dom.shortcutsModal.hidden = false;
      break;
    case 'j':
    case 'ArrowDown': {
      e.preventDefault();
      const idx = state.filtered.findIndex(ev => ev.id === state.selectedId);
      const next = Math.min(idx + 1, state.filtered.length - 1);
      if (state.filtered[next]) selectEvent(state.filtered[next].id);
      break;
    }
    case 'k':
    case 'ArrowUp': {
      e.preventDefault();
      const idx = state.filtered.findIndex(ev => ev.id === state.selectedId);
      const prev = Math.max(idx - 1, 0);
      if (state.filtered[prev]) selectEvent(state.filtered[prev].id);
      break;
    }
  }
});

// ── Event Wireup ───────────────────────────────────────────
function initEvents() {
  $('#btn-back-feed').addEventListener('click', closeMobileInspector);
  // Search & Filter
  dom.searchInput.addEventListener('input', scheduleFilter);
  dom.methodFilter.addEventListener('change', applyFilters);
  dom.chkAutoScroll.addEventListener('change', () => {
    state.autoScroll = dom.chkAutoScroll.checked;
  });

  // Demo Webhooks
  $('#btn-send-demo').addEventListener('click', sendDemoWebhook);
  $('#btn-empty-demo').addEventListener('click', sendDemoWebhook);

  // Theme & Sound
  dom.btnThemeToggle.addEventListener('click', toggleTheme);
  dom.btnSoundToggle.addEventListener('click', toggleSound);

  // Click-to-reconnect on connection pill
  $('#conn-pill').addEventListener('click', () => {
    dom.statusText.textContent = 'Connecting…';
    dom.statusDot.className = 'status-dot';
    connectSSE();
  });

  // Shortcuts Dialog
  $('#btn-shortcuts').addEventListener('click', () => { dom.shortcutsModal.hidden = false; });
  $('#btn-close-shortcuts').addEventListener('click', () => { dom.shortcutsModal.hidden = true; });
  $('#btn-dismiss-shortcuts').addEventListener('click', () => { dom.shortcutsModal.hidden = true; });
  dom.shortcutsModal.addEventListener('click', e => {
    if (e.target === dom.shortcutsModal) dom.shortcutsModal.hidden = true;
  });

  // Channel Modal
  $('#btn-add-channel').addEventListener('click', () => {
    dom.channelModal.hidden = false;
    dom.newChannelName.value = '';
    dom.newChannelPreview.textContent = '/hooks/new-channel';
    setTimeout(() => dom.newChannelName.focus(), 50);
  });
  $('#btn-close-channel-modal').addEventListener('click', () => { dom.channelModal.hidden = true; });
  $('#btn-cancel-channel-modal').addEventListener('click', () => { dom.channelModal.hidden = true; });
  dom.channelModal.addEventListener('click', e => {
    if (e.target === dom.channelModal) dom.channelModal.hidden = true;
  });

  dom.newChannelName.addEventListener('input', () => {
    const raw = dom.newChannelName.value.trim().toLowerCase().replace(/[^a-z0-9_\-\/]/g, '-');
    const path = raw.startsWith('/') ? raw : `/hooks/${raw || 'channel'}`;
    dom.newChannelPreview.textContent = path;
  });

  $('#btn-save-channel').addEventListener('click', () => {
    const raw = dom.newChannelName.value.trim().toLowerCase().replace(/[^a-z0-9_\-\/]/g, '-');
    if (!raw) {
      dom.newChannelName.focus();
      return;
    }
    const path = raw.startsWith('/') ? raw : `/hooks/${raw}`;
    if (!state.customChannels.includes(path)) {
      state.customChannels.push(path);
      localStorage.setItem('hi:custom_channels', JSON.stringify(state.customChannels));
    }
    dom.channelModal.hidden = true;
    updateChannels();
    setChannel(path);
  });

  dom.newChannelName.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('#btn-save-channel').click();
    }
  });

  // Mock Modal
  $('#btn-add-mock').addEventListener('click', () => { dom.mockModal.hidden = false; });
  // Also wire up the "Add one" link in empty mock rules
  const mockEmptyAdd = $('#mock-empty-add');
  if (mockEmptyAdd) {
    mockEmptyAdd.addEventListener('click', (e) => {
      e.preventDefault();
      dom.mockModal.hidden = false;
    });
  }
  $('#btn-close-modal').addEventListener('click', () => { dom.mockModal.hidden = true; });
  $('#btn-cancel-modal').addEventListener('click', () => { dom.mockModal.hidden = true; });
  $('#btn-save-mock').addEventListener('click', saveMockRule);
  dom.mockModal.addEventListener('click', e => {
    if (e.target === dom.mockModal) dom.mockModal.hidden = true;
  });

  // Endpoint URL display & Copy
  const endpoint = `${window.location.origin}/hooks/orders`;
  dom.endpointUrl.textContent = endpoint;
  dom.curlExample.textContent = [
    `curl -X POST '${endpoint}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '{"event": "order.created", "id": 42}'`
  ].join('\n');

  $('#btn-copy-url').addEventListener('click', e => {
    copyToClipboard(endpoint, e.currentTarget);
  });
  $('#btn-copy-curl').addEventListener('click', e => {
    copyToClipboard(dom.curlExample.textContent, e.currentTarget);
  });

  // Inspector Action Buttons
  $('#btn-copy-curl-insp').addEventListener('click', e => {
    const event = state.events.find(ev => ev.id === state.selectedId);
    copyToClipboard(eventToCurl(event), e.currentTarget);
  });
  $('#btn-copy-json-insp').addEventListener('click', e => {
    const event = state.events.find(ev => ev.id === state.selectedId);
    copyToClipboard(JSON.stringify(event, null, 2), e.currentTarget);
  });
  $('#btn-copy-body').addEventListener('click', e => {
    const event = state.events.find(ev => ev.id === state.selectedId);
    const bodyStr = event?.bodyFormat === 'json'
      ? JSON.stringify(event.body, null, 2)
      : String(event?.body || '');
    copyToClipboard(bodyStr, e.currentTarget);
  });
  $('#btn-copy-raw').addEventListener('click', e => {
    copyToClipboard(dom.rawViewer.textContent, e.currentTarget);
  });

  // Expand / Collapse all JSON
  $('#btn-toggle-all-json').addEventListener('click', e => {
    state.jsonAllExpanded = !state.jsonAllExpanded;
    toggleAllJsonNodes(state.jsonAllExpanded);
    e.currentTarget.textContent = state.jsonAllExpanded ? 'Collapse All' : 'Expand All';
  });

  // Replay
  $('#btn-replay').addEventListener('click', replayEvent);

  // Pin
  $('#btn-pin').addEventListener('click', () => {
    const event = state.events.find(e => e.id === state.selectedId);
    if (!event) return;
    event.pinned = !event.pinned;
    $('#btn-pin').classList.toggle('active', event.pinned);
    applyFilters();
  });

  // Export & Clear
  $('#btn-export').addEventListener('click', () => {
    window.open('/api/export', '_blank');
  });
  $('#btn-clear').addEventListener('click', async () => {
    if (!confirm('Clear all captured webhooks?')) return;
    await fetch('/api/events', { method: 'DELETE' });
    state.events = [];
    state.selectedId = null;
    $('#workbench-title').textContent = 'Request inspector';
    $('#workbench-method').textContent = '';
    state.filtered = [];
    $('.workspace').classList.remove('mobile-detail');
    dom.inspectorEmpty.hidden = false;
    dom.inspectorContent.hidden = true;
    updateChannels();
    renderEventList();
  });

  // Channel 'All' click
  $('.channel-item[data-channel="all"]').addEventListener('click', () => setChannel('all'));
  $('.channel-item[data-channel="all"]').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.currentTarget.click();
    }
  });

  // Relative timestamp refresh every 15s
  setInterval(() => {
    $$('.event-item .event-meta span:first-child', dom.eventList).forEach((el, i) => {
      const event = state.filtered[i];
      if (event) el.textContent = relativeTime(event.receivedAt);
    });
  }, 15000);
}

// ── Startup ────────────────────────────────────────────────
applyTheme(state.theme);

const mobileMenuButton = document.getElementById('btn-mobile-menu');
$$('.rail-button').forEach(button => button.addEventListener('click', () => setWorkspaceView(button.dataset.workspaceView)));
$('#btn-clear-filters').addEventListener('click', () => {
  dom.searchInput.value = '';
  dom.methodFilter.value = '';
  setChannel('all');
  dom.searchInput.focus();
});
dom.channelList.addEventListener('click', event => {
  if (event.target.closest('.channel-item')) setWorkspaceView('requests');
});
mobileMenuButton.addEventListener('click', () => {
  const open = document.body.classList.toggle('mobile-menu-open');
  mobileMenuButton.setAttribute('aria-expanded', String(open));
});
document.querySelectorAll('.mobile-utilities [data-action]').forEach(button => {
  button.addEventListener('click', () => {
    document.body.classList.remove('mobile-menu-open');
    mobileMenuButton.setAttribute('aria-expanded', 'false');
    document.getElementById(button.dataset.action).click();
  });
});
updateSoundUI();
initEvents();

loadEvents()
  .then(() => {
    if (state.filtered.length > 0) {
      selectEvent(state.filtered[0].id, false);
    }
  })
  .catch(err => {
    dom.statusText.textContent = 'Offline';
    dom.statusDot.className = 'status-dot offline';
  });

loadMockRules();
connectSSE();
