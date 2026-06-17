const SIGNALS_URL = './data/latest.json';
const REPOS_URL = './data/github-weekly.json';
const ALL_CATEGORY = 'All';
const HIGHLIGHTS_CATEGORY = 'Highlights';
const PRACTICAL_CATEGORIES = new Set([
  'AI Coding',
  'Agents',
  'MCP',
  'Workflow',
  'Developer Tools',
  'SaaS Starter Kits',
  'Skills'
]);

const state = {
  signals: null,
  repos: null,
  signalsCategory: ALL_CATEGORY,
  signalsQuery: '',
  signalsHighScoreOnly: false,
  reposCategory: ALL_CATEGORY,
  reposQuery: '',
  reposHighScoreOnly: false,
  errors: []
};

const els = {
  lastUpdated: document.querySelector('#lastUpdated'),
  heroSignalsTotal: document.querySelector('#heroSignalsTotal'),
  heroReposTotal: document.querySelector('#heroReposTotal'),
  statsGrid: document.querySelector('#statsGrid'),
  signalHighlights: document.querySelector('#signalHighlights'),
  signalsCategoryTabs: document.querySelector('#signalsCategoryTabs'),
  signalsSearchInput: document.querySelector('#signalsSearchInput'),
  signalsHighScoreOnly: document.querySelector('#signalsHighScoreOnly'),
  signalsResultsMeta: document.querySelector('#signalsResultsMeta'),
  signalsGrid: document.querySelector('#signalsGrid'),
  reposCategoryTabs: document.querySelector('#reposCategoryTabs'),
  reposSearchInput: document.querySelector('#reposSearchInput'),
  reposHighScoreOnly: document.querySelector('#reposHighScoreOnly'),
  reposResultsMeta: document.querySelector('#reposResultsMeta'),
  reposGrid: document.querySelector('#reposGrid'),
  toolsGrid: document.querySelector('#toolsGrid')
};

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function formatDate(value) {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';

  return new Intl.DateTimeFormat('en', {
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

  return new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatNumber(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat('en', { notation: number >= 10000 ? 'compact' : 'standard' }).format(number);
}

function scoreClass(score) {
  if (score >= 85) return 'score-hot';
  if (score >= 70) return 'score-high';
  if (score >= 55) return 'score-warm';
  return 'score-normal';
}

function getTypeLabel(type) {
  const labels = {
    tweet: 'X',
    podcast: 'Podcast',
    blog: 'Blog'
  };
  return labels[type] || 'Signal';
}

function getSignalSearchBlob(item) {
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

function getRepoSearchBlob(repo) {
  return [
    repo.name,
    repo.fullName,
    repo.description,
    repo.language,
    repo.category,
    repo.reason,
    ...(repo.topics || []),
    ...(repo.matchedKeywords || [])
  ].join(' ').toLowerCase();
}

function getVisibleSignals() {
  if (!state.signals) return [];

  const query = state.signalsQuery.trim().toLowerCase();
  const threshold = state.signals.highScoreThreshold || 65;
  const highlightIds = new Set(state.signals.highlights || []);

  return (state.signals.items || []).filter((item) => {
    if (state.signalsCategory === HIGHLIGHTS_CATEGORY && !highlightIds.has(item.id) && !item.isHighlight) {
      return false;
    }

    if (
      state.signalsCategory !== ALL_CATEGORY &&
      state.signalsCategory !== HIGHLIGHTS_CATEGORY &&
      item.category !== state.signalsCategory
    ) {
      return false;
    }

    if (state.signalsHighScoreOnly && item.score < threshold) return false;
    if (query && !getSignalSearchBlob(item).includes(query)) return false;

    return true;
  });
}

function getVisibleRepos() {
  if (!state.repos) return [];

  const query = state.reposQuery.trim().toLowerCase();
  const threshold = state.repos.highScoreThreshold || 80;

  return (state.repos.items || []).filter((repo) => {
    if (state.reposCategory !== ALL_CATEGORY && repo.category !== state.reposCategory) return false;
    if (state.reposHighScoreOnly && repo.shiningScore < threshold) return false;
    if (query && !getRepoSearchBlob(repo).includes(query)) return false;
    return true;
  });
}

function getPracticalTools() {
  if (!state.repos) return [];
  const threshold = state.repos.highScoreThreshold || 80;

  return (state.repos.items || [])
    .filter((repo) => PRACTICAL_CATEGORIES.has(repo.category))
    .filter((repo) => repo.shiningScore >= Math.max(62, threshold - 8))
    .sort((a, b) => {
      if (b.shiningScore !== a.shiningScore) return b.shiningScore - a.shiningScore;
      if ((b.weeklyStars || 0) !== (a.weeklyStars || 0)) return (b.weeklyStars || 0) - (a.weeklyStars || 0);
      return b.stars - a.stars;
    })
    .slice(0, 9);
}

function renderStats() {
  const signalStats = state.signals?.stats || {};
  const repoStats = state.repos?.stats || {};
  const topRepoCategory = repoStats.topCategories?.[0];
  const topSignalCategory = signalStats.topCategories?.[0];

  const cards = [
    ['Builder Signals', signalStats.totalItems || 0, topSignalCategory ? `Top: ${topSignalCategory.category}` : 'Latest builder feed'],
    ['Weekly repos', repoStats.totalRepos || 0, 'GitHub REST API'],
    ['High score repos', repoStats.highScoreRepos || 0, `Score ${state.repos?.highScoreThreshold || 80}+`],
    ['New candidates', repoStats.newCandidates || 0, 'First seen in history'],
    ['Top repo category', topRepoCategory?.category || 'N/A', topRepoCategory ? `${topRepoCategory.count} repos` : 'No repo data']
  ];

  els.statsGrid.innerHTML = cards.map(([label, value, meta]) => `
    <article class="stat-card">
      <span>${escapeHTML(label)}</span>
      <strong>${escapeHTML(value)}</strong>
      <small>${escapeHTML(meta)}</small>
    </article>
  `).join('');
}

function renderTabs(container, categories, activeCategory, onSelect) {
  container.innerHTML = categories.map((category) => {
    const isActive = category === activeCategory;
    return `
      <button class="tab-button ${isActive ? 'active' : ''}" type="button" data-category="${escapeHTML(category)}" role="tab" aria-selected="${isActive}">
        ${escapeHTML(category)}
      </button>
    `;
  }).join('');

  container.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => onSelect(button.dataset.category));
  });
}

function renderSignalTabs() {
  const dataCategories = state.signals?.categories || [];
  const categories = unique([ALL_CATEGORY, HIGHLIGHTS_CATEGORY, ...dataCategories.filter((item) => item !== HIGHLIGHTS_CATEGORY)]);

  renderTabs(els.signalsCategoryTabs, categories, state.signalsCategory, (category) => {
    state.signalsCategory = category;
    render();
  });
}

function renderRepoTabs() {
  const categories = unique([ALL_CATEGORY, ...(state.repos?.categories || [])]);

  renderTabs(els.reposCategoryTabs, categories, state.reposCategory, (category) => {
    state.reposCategory = category;
    render();
  });
}

function renderSignalHighlights() {
  if (!state.signals) {
    els.signalHighlights.innerHTML = '<p class="empty-state">Builder Signals data is not available yet.</p>';
    return;
  }

  const highlightIds = new Set(state.signals.highlights || []);
  const highlights = (state.signals.items || [])
    .filter((item) => highlightIds.has(item.id) || item.isHighlight)
    .slice(0, 5);

  if (!highlights.length) {
    els.signalHighlights.innerHTML = '<p class="empty-state">No highlights yet.</p>';
    return;
  }

  els.signalHighlights.innerHTML = highlights.map((item) => `
    <a class="highlight-row" href="${escapeHTML(item.url || '#')}" target="_blank" rel="noreferrer">
      <span class="highlight-rank">#${escapeHTML(item.rank || '')}</span>
      <span class="highlight-main">
        <strong>${escapeHTML(item.title || item.text)}</strong>
        <small>${escapeHTML(item.author || item.source || '')} / ${escapeHTML(item.category)} / ${formatDate(item.publishedAt)}</small>
      </span>
      <span class="score-badge ${scoreClass(item.score)}">${escapeHTML(item.score)}</span>
    </a>
  `).join('');
}

function renderSignals(items) {
  if (!state.signals) {
    els.signalsGrid.innerHTML = '<p class="empty-state">Builder Signals data is not available yet.</p>';
    els.signalsResultsMeta.textContent = '';
    return;
  }

  if (!items.length) {
    els.signalsGrid.innerHTML = '<p class="empty-state">No Builder Signals match the current filters.</p>';
    els.signalsResultsMeta.textContent = '0 signals';
    return;
  }

  els.signalsResultsMeta.textContent = `${items.length} signals / ${state.signalsCategory}${state.signalsHighScoreOnly ? ' / high score only' : ''}`;
  els.signalsGrid.innerHTML = items.map((item) => `
    <article class="item-card">
      <div class="item-topline">
        <span class="type-pill">${escapeHTML(getTypeLabel(item.type))}</span>
        <span class="category-pill">${escapeHTML(item.category)}</span>
        <span class="score-badge ${scoreClass(item.score)}">${escapeHTML(item.score)}</span>
      </div>
      <h3>${escapeHTML(item.title || item.text)}</h3>
      <p>${escapeHTML(item.summary || item.text || '')}</p>
      <div class="item-meta">
        <span>${escapeHTML(item.author || item.source || 'Unknown')}</span>
        <span>${formatDate(item.publishedAt)}</span>
      </div>
      <div class="reason">${escapeHTML(item.reason || '')}</div>
      <a class="source-link" href="${escapeHTML(item.url || '#')}" target="_blank" rel="noreferrer">
        Source
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M14 4h6v6h-2V7.4l-8.3 8.3-1.4-1.4L16.6 6H14V4ZM5 6h6v2H7v9h9v-4h2v6H5V6Z"></path>
        </svg>
      </a>
    </article>
  `).join('');
}

function renderRepoMetrics(repo) {
  const weekly = repo.weeklyStars ?? 0;
  const weeklyLabel = weekly > 0 ? `+${formatNumber(weekly)}` : formatNumber(weekly);

  return `
    <div class="repo-metrics">
      <span><strong>${formatNumber(repo.stars)}</strong> stars</span>
      <span><strong>${weeklyLabel}</strong> weekly</span>
      <span><strong>${formatNumber(repo.forks)}</strong> forks</span>
      <span><strong>${escapeHTML(repo.language || 'Unknown')}</strong></span>
    </div>
  `;
}

function renderTopicList(topics) {
  const visibleTopics = (topics || []).slice(0, 6);
  if (!visibleTopics.length) return '<div class="topic-list empty-topics"><span>No topics</span></div>';

  return `
    <div class="topic-list">
      ${visibleTopics.map((topic) => `<span>${escapeHTML(topic)}</span>`).join('')}
    </div>
  `;
}

function repoCard(repo) {
  return `
    <article class="repo-card">
      <div class="repo-topline">
        <span class="category-pill">${escapeHTML(repo.category)}</span>
        ${repo.newCandidate ? '<span class="type-pill">New</span>' : ''}
        <span class="score-badge ${scoreClass(repo.shiningScore)}">${escapeHTML(repo.shiningScore)}</span>
      </div>
      <h3>
        <a href="${escapeHTML(repo.url || '#')}" target="_blank" rel="noreferrer">${escapeHTML(repo.name)}</a>
        <small>${escapeHTML(repo.fullName)}</small>
      </h3>
      <p>${escapeHTML(repo.description || 'No description provided.')}</p>
      ${renderRepoMetrics(repo)}
      ${renderTopicList(repo.topics)}
      <div class="reason">${escapeHTML(repo.reason || '')}</div>
      <a class="source-link" href="${escapeHTML(repo.url || '#')}" target="_blank" rel="noreferrer">
        GitHub
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M14 4h6v6h-2V7.4l-8.3 8.3-1.4-1.4L16.6 6H14V4ZM5 6h6v2H7v9h9v-4h2v6H5V6Z"></path>
        </svg>
      </a>
    </article>
  `;
}

function renderRepos(items) {
  if (!state.repos) {
    els.reposGrid.innerHTML = '<p class="empty-state">GitHub Weekly Stars data is not available yet.</p>';
    els.reposResultsMeta.textContent = '';
    return;
  }

  if (!items.length) {
    els.reposGrid.innerHTML = '<p class="empty-state">No GitHub repos match the current filters.</p>';
    els.reposResultsMeta.textContent = '0 repos';
    return;
  }

  els.reposResultsMeta.textContent = `${items.length} repos / ${state.reposCategory}${state.reposHighScoreOnly ? ' / high score only' : ''}`;
  els.reposGrid.innerHTML = items.map(repoCard).join('');
}

function renderPracticalTools() {
  const tools = getPracticalTools();

  if (!state.repos) {
    els.toolsGrid.innerHTML = '<p class="empty-state">GitHub Weekly Stars data is not available yet.</p>';
    return;
  }

  if (!tools.length) {
    els.toolsGrid.innerHTML = '<p class="empty-state">No practical tools met the current score threshold yet.</p>';
    return;
  }

  els.toolsGrid.innerHTML = tools.map(repoCard).join('');
}

function getLatestGeneratedAt() {
  const dates = [state.signals?.generatedAt, state.repos?.generatedAt]
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());

  return dates[0]?.toISOString() || null;
}

function renderStatus() {
  const latest = getLatestGeneratedAt();
  const suffix = state.errors.length ? ` / ${state.errors.length} feed issue${state.errors.length > 1 ? 's' : ''}` : '';
  els.lastUpdated.textContent = latest ? `Updated ${formatFullDate(latest)} CST${suffix}` : `Feeds unavailable${suffix}`;
  els.heroSignalsTotal.textContent = state.signals?.stats?.totalItems ?? 0;
  els.heroReposTotal.textContent = state.repos?.stats?.totalRepos ?? 0;
}

function render() {
  const visibleSignals = getVisibleSignals();
  const visibleRepos = getVisibleRepos();

  renderStatus();
  renderStats();
  renderSignalTabs();
  renderRepoTabs();
  renderSignalHighlights();
  renderSignals(visibleSignals);
  renderRepos(visibleRepos);
  renderPracticalTools();
}

async function fetchJSON(url) {
  const response = await fetch(`${url}?t=${Date.now()}`);
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

async function init() {
  const [signalsResult, reposResult] = await Promise.allSettled([
    fetchJSON(SIGNALS_URL),
    fetchJSON(REPOS_URL)
  ]);

  if (signalsResult.status === 'fulfilled') {
    state.signals = signalsResult.value;
  } else {
    state.errors.push(signalsResult.reason.message);
  }

  if (reposResult.status === 'fulfilled') {
    state.repos = reposResult.value;
  } else {
    state.errors.push(reposResult.reason.message);
  }

  render();
}

els.signalsSearchInput.addEventListener('input', (event) => {
  state.signalsQuery = event.target.value;
  render();
});

els.signalsHighScoreOnly.addEventListener('change', (event) => {
  state.signalsHighScoreOnly = event.target.checked;
  render();
});

els.reposSearchInput.addEventListener('input', (event) => {
  state.reposQuery = event.target.value;
  render();
});

els.reposHighScoreOnly.addEventListener('change', (event) => {
  state.reposHighScoreOnly = event.target.checked;
  render();
});

init();
