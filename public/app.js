const DATA_URL = './data/latest.json';
const ALL_CATEGORY = '全部';
const HIGHLIGHTS_CATEGORY = '今日重点';

const state = {
  data: null,
  activeCategory: ALL_CATEGORY,
  query: '',
  highScoreOnly: false
};

const els = {
  lastUpdated: document.querySelector('#lastUpdated'),
  heroTotal: document.querySelector('#heroTotal'),
  statsGrid: document.querySelector('#statsGrid'),
  highlightList: document.querySelector('#highlightList'),
  categoryTabs: document.querySelector('#categoryTabs'),
  searchInput: document.querySelector('#searchInput'),
  highScoreOnly: document.querySelector('#highScoreOnly'),
  resultsMeta: document.querySelector('#resultsMeta'),
  itemsGrid: document.querySelector('#itemsGrid')
};

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(value) {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';

  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatFullDate(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function getScoreClass(score) {
  if (score >= 80) return 'score-hot';
  if (score >= 65) return 'score-high';
  return 'score-normal';
}

function getTypeLabel(type) {
  const labels = {
    tweet: 'X',
    podcast: 'Podcast',
    blog: 'Blog'
  };
  return labels[type] || 'Item';
}

function getSearchBlob(item) {
  return [
    item.title,
    item.text,
    item.summary,
    item.author,
    item.source,
    item.category,
    item.reason,
    ...(item.matchedKeywords || [])
  ].join(' ').toLowerCase();
}

function getVisibleItems() {
  const data = state.data;
  if (!data) return [];

  const query = state.query.trim().toLowerCase();
  const highScoreThreshold = data.highScoreThreshold || 65;
  const highlightIds = new Set(data.highlights || []);

  return data.items.filter((item) => {
    if (state.activeCategory === HIGHLIGHTS_CATEGORY && !highlightIds.has(item.id) && !item.isHighlight) {
      return false;
    }

    if (
      state.activeCategory !== ALL_CATEGORY &&
      state.activeCategory !== HIGHLIGHTS_CATEGORY &&
      item.category !== state.activeCategory
    ) {
      return false;
    }

    if (state.highScoreOnly && item.score < highScoreThreshold) {
      return false;
    }

    if (query && !getSearchBlob(item).includes(query)) {
      return false;
    }

    return true;
  });
}

function renderStats() {
  const stats = state.data.stats || {};
  const topCategory = stats.topCategories?.[0];
  const cards = [
    ['Total items', stats.totalItems || 0, '全部消息'],
    ['Tweets', stats.tweetsCount || 0, 'X builders'],
    ['Podcasts', stats.podcastsCount || 0, 'Long-form'],
    ['Blogs', stats.blogsCount || 0, 'Articles'],
    ['Top category', topCategory?.category || 'N/A', topCategory ? `${topCategory.count} items` : 'No data']
  ];

  els.statsGrid.innerHTML = cards.map(([label, value, meta]) => `
    <article class="stat-card">
      <span>${escapeHTML(label)}</span>
      <strong>${escapeHTML(value)}</strong>
      <small>${escapeHTML(meta)}</small>
    </article>
  `).join('');
}

function renderTabs() {
  const categories = [ALL_CATEGORY, ...(state.data.categories || [])];

  els.categoryTabs.innerHTML = categories.map((category) => {
    const isActive = category === state.activeCategory;
    return `
      <button class="tab-button ${isActive ? 'active' : ''}" type="button" data-category="${escapeHTML(category)}" role="tab" aria-selected="${isActive}">
        ${escapeHTML(category)}
      </button>
    `;
  }).join('');

  els.categoryTabs.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeCategory = button.dataset.category;
      render();
    });
  });
}

function renderHighlights() {
  const highlightIds = new Set(state.data.highlights || []);
  const highlights = state.data.items
    .filter((item) => highlightIds.has(item.id) || item.isHighlight)
    .slice(0, 6);

  if (!highlights.length) {
    els.highlightList.innerHTML = '<p class="empty-state">No highlights yet.</p>';
    return;
  }

  els.highlightList.innerHTML = highlights.map((item) => `
    <a class="highlight-row" href="${escapeHTML(item.url || '#')}" target="_blank" rel="noreferrer">
      <span class="highlight-rank">#${item.rank || ''}</span>
      <span class="highlight-main">
        <strong>${escapeHTML(item.title || item.text)}</strong>
        <small>${escapeHTML(item.author || item.source || '')} · ${escapeHTML(item.category)} · ${formatDate(item.publishedAt)}</small>
      </span>
      <span class="score-badge ${getScoreClass(item.score)}">${item.score}</span>
    </a>
  `).join('');
}

function renderItems(items) {
  if (!items.length) {
    els.itemsGrid.innerHTML = '<p class="empty-state">没有匹配的内容。</p>';
    return;
  }

  els.itemsGrid.innerHTML = items.map((item) => `
    <article class="item-card">
      <div class="item-topline">
        <span class="type-pill">${escapeHTML(getTypeLabel(item.type))}</span>
        <span class="category-pill">${escapeHTML(item.category)}</span>
        <span class="score-badge ${getScoreClass(item.score)}">${item.score}</span>
      </div>
      <h3>${escapeHTML(item.title || item.text)}</h3>
      <p>${escapeHTML(item.summary || item.text || '')}</p>
      <div class="item-meta">
        <span>${escapeHTML(item.author || item.source || 'Unknown')}</span>
        <span>${formatDate(item.publishedAt)}</span>
      </div>
      <div class="reason">${escapeHTML(item.reason || '')}</div>
      <a class="source-link" href="${escapeHTML(item.url || '#')}" target="_blank" rel="noreferrer">
        原文链接
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M14 4h6v6h-2V7.4l-8.3 8.3-1.4-1.4L16.6 6H14V4ZM5 6h6v2H7v9h9v-4h2v6H5V6Z"></path>
        </svg>
      </a>
    </article>
  `).join('');
}

function render() {
  if (!state.data) return;

  const items = getVisibleItems();
  renderStats();
  renderTabs();
  renderHighlights();
  renderItems(items);

  els.heroTotal.textContent = state.data.stats?.totalItems ?? 0;
  els.lastUpdated.textContent = `Updated ${formatFullDate(state.data.generatedAt)} CST`;
  els.resultsMeta.textContent = `${items.length} items · ${state.activeCategory}${state.highScoreOnly ? ' · high score only' : ''}`;
}

async function init() {
  try {
    const response = await fetch(`${DATA_URL}?t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    render();
  } catch (err) {
    els.lastUpdated.textContent = 'Feed unavailable';
    els.itemsGrid.innerHTML = `<p class="empty-state">无法加载 latest.json：${escapeHTML(err.message)}</p>`;
  }
}

els.searchInput.addEventListener('input', (event) => {
  state.query = event.target.value;
  render();
});

els.highScoreOnly.addEventListener('change', (event) => {
  state.highScoreOnly = event.target.checked;
  render();
});

init();
