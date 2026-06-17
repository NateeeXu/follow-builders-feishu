#!/usr/bin/env node

// ============================================================================
// Shining Builders - GitHub Weekly Stars builder
// ============================================================================
// Uses only the public GitHub REST API. GITHUB_TOKEN is optional; if present it
// is used for higher rate limits, otherwise the script runs unauthenticated.
// ============================================================================

import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(SCRIPT_DIR, '..');
const DATA_DIR = join(ROOT_DIR, 'public', 'data');
const WEEKLY_JSON_PATH = join(DATA_DIR, 'github-weekly.json');
const HISTORY_JSON_PATH = join(DATA_DIR, 'github-stars-history.json');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const GITHUB_API = 'https://api.github.com';
const USER_AGENT = 'shining-builders-github-stars';

const SEARCH_KEYWORDS = [
  'ai agent',
  'llm agent',
  'mcp',
  'claude code',
  'cursor',
  'ai coding',
  'coding agent',
  'rag',
  'workflow automation',
  'ai tool',
  'llm app',
  'openai',
  'anthropic',
  'langchain',
  'llamaindex',
  'browser agent',
  'developer tool',
  'ai skill'
];

const UNAUTHENTICATED_QUERY_GROUPS = [
  ['ai agent', 'llm agent', 'coding agent', 'browser agent'],
  ['mcp', 'claude code', 'cursor'],
  ['ai coding', 'developer tool', 'ai skill'],
  ['rag', 'langchain', 'llamaindex'],
  ['workflow automation', 'ai tool', 'llm app'],
  ['openai', 'anthropic']
];

const GITHUB_CATEGORIES = [
  'AI Coding',
  'Agents',
  'MCP',
  'RAG',
  'Workflow',
  'Developer Tools',
  'SaaS Starter Kits',
  'Skills',
  'Model / Infra',
  'Other'
];

const CATEGORY_RULES = [
  {
    category: 'AI Coding',
    terms: [
      ['coding agent', 28],
      ['ai coding', 26],
      ['claude code', 26],
      ['cursor', 22],
      ['codegen', 18],
      ['code generation', 18],
      ['programming assistant', 18],
      ['pair programming', 16],
      ['ide', 12]
    ]
  },
  {
    category: 'Agents',
    terms: [
      ['ai agent', 28],
      ['llm agent', 26],
      ['agent', 20],
      ['agents', 20],
      ['multi-agent', 20],
      ['multi agent', 20],
      ['autonomous', 14],
      ['browser agent', 22],
      ['tool use', 14]
    ]
  },
  {
    category: 'MCP',
    terms: [
      ['mcp', 30],
      ['model context protocol', 30],
      ['mcp server', 28],
      ['mcp-server', 28],
      ['mcp client', 24]
    ]
  },
  {
    category: 'RAG',
    terms: [
      ['rag', 30],
      ['retrieval augmented generation', 28],
      ['retrieval', 18],
      ['vector database', 18],
      ['embeddings', 14],
      ['semantic search', 14]
    ]
  },
  {
    category: 'Workflow',
    terms: [
      ['workflow automation', 30],
      ['workflow', 22],
      ['automation', 18],
      ['orchestration', 16],
      ['n8n', 16],
      ['zapier', 12],
      ['pipeline', 10]
    ]
  },
  {
    category: 'Developer Tools',
    terms: [
      ['developer tool', 26],
      ['developer tools', 26],
      ['devtool', 22],
      ['devtools', 22],
      ['cli', 18],
      ['sdk', 16],
      ['api', 10],
      ['terminal', 12],
      ['browser extension', 14]
    ]
  },
  {
    category: 'SaaS Starter Kits',
    terms: [
      ['saas starter', 30],
      ['starter kit', 26],
      ['boilerplate', 22],
      ['template', 16],
      ['nextjs', 12],
      ['stripe', 12],
      ['supabase', 12],
      ['auth', 10]
    ]
  },
  {
    category: 'Skills',
    terms: [
      ['ai skill', 30],
      ['skill', 20],
      ['skills', 20],
      ['prompt pack', 16],
      ['playbook', 12],
      ['codex skill', 22]
    ]
  },
  {
    category: 'Model / Infra',
    terms: [
      ['openai', 18],
      ['anthropic', 18],
      ['langchain', 18],
      ['llamaindex', 18],
      ['llm app', 16],
      ['llm', 14],
      ['model', 12],
      ['inference', 16],
      ['eval', 12],
      ['benchmark', 12],
      ['fine tuning', 12],
      ['training', 12]
    ]
  }
];

const SCORE_KEYWORDS = [
  'agent',
  'coding',
  'mcp',
  'workflow',
  'skill',
  'skills',
  'cli',
  'sdk',
  'devtool',
  'devtools',
  'developer tool',
  'automation',
  'rag',
  'browser agent',
  'openai',
  'anthropic',
  'langchain',
  'llamaindex'
];

const LOW_PRACTICALITY_PATTERNS = [
  /\bpaper\b/i,
  /\breproduction\b/i,
  /\breimplementation\b/i,
  /\bdataset\b/i,
  /\bcourse\b/i,
  /\bhomework\b/i,
  /\bassignment\b/i,
  /\blecture\b/i,
  /\btutorial-only\b/i
];

const DAYS_BACK = Number.parseInt(process.env.GITHUB_STARS_DAYS_BACK || '30', 10);
const MIN_STARS = Number.parseInt(process.env.GITHUB_STARS_MIN_STARS || '20', 10);
const MAX_ITEMS = Number.parseInt(process.env.GITHUB_STARS_MAX_ITEMS || '120', 10);
const PER_PAGE = Number.parseInt(process.env.GITHUB_STARS_PER_PAGE || (GITHUB_TOKEN ? '40' : '50'), 10);
const HIGH_SCORE_THRESHOLD = Number.parseInt(process.env.GITHUB_STARS_HIGH_SCORE || '80', 10);

function log(message) {
  console.error(`[github-stars] ${message}`);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function quoteSearchTerm(term) {
  return /\s/.test(term) ? `"${term}"` : term;
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function daysAgoDate(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysSince(value, now) {
  const date = toDate(value);
  if (!date) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - date.getTime()) / 864e5);
}

function includesTerm(text, term) {
  const lowerText = ` ${text.toLowerCase()} `;
  const lowerTerm = term.toLowerCase();
  if (lowerTerm.length <= 3) {
    const escaped = lowerTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(lowerText);
  }
  return lowerText.includes(lowerTerm);
}

async function readJSONIfExists(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf-8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

function normalizeHistory(rawHistory) {
  if (!rawHistory || typeof rawHistory !== 'object') {
    return { updatedAt: null, repos: {} };
  }

  if (rawHistory.repos && typeof rawHistory.repos === 'object' && !Array.isArray(rawHistory.repos)) {
    return {
      updatedAt: rawHistory.updatedAt || null,
      repos: rawHistory.repos
    };
  }

  return { updatedAt: rawHistory.updatedAt || null, repos: {} };
}

function buildSearchQueries() {
  const cutoff = formatDateOnly(daysAgoDate(DAYS_BACK));
  const qualifiers = `fork:false archived:false pushed:>=${cutoff} stars:>${MIN_STARS}`;

  if (GITHUB_TOKEN) {
    return SEARCH_KEYWORDS.map((keyword) => ({
      label: keyword,
      query: `${quoteSearchTerm(keyword)} ${qualifiers}`
    }));
  }

  return UNAUTHENTICATED_QUERY_GROUPS.map((group) => ({
    label: group.join(', '),
    query: `${group.map(quoteSearchTerm).join(' OR ')} ${qualifiers}`
  }));
}

async function githubFetchJson(url) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': USER_AGENT
  };

  if (GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  }

  const response = await fetch(url, { headers });
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    const message = data?.message || `HTTP ${response.status}`;
    throw new Error(`${response.status} ${message}`);
  }

  return data;
}

async function searchRepositories() {
  const queries = buildSearchQueries();
  const reposByFullName = new Map();
  const sourceErrors = [];

  for (const { label, query } of queries) {
    const url = new URL(`${GITHUB_API}/search/repositories`);
    url.searchParams.set('q', query);
    url.searchParams.set('sort', 'updated');
    url.searchParams.set('order', 'desc');
    url.searchParams.set('per_page', String(PER_PAGE));

    try {
      log(`Searching ${label}`);
      const payload = await githubFetchJson(url);
      for (const repo of payload.items || []) {
        if (!repo?.full_name) continue;

        const existing = reposByFullName.get(repo.full_name);
        if (existing) {
          existing._matchedQueries.add(label);
        } else {
          reposByFullName.set(repo.full_name, {
            ...repo,
            _matchedQueries: new Set([label])
          });
        }
      }
    } catch (err) {
      const message = `${label}: ${err.message}`;
      sourceErrors.push(message);
      log(`Search failed for ${message}`);

      if (/rate limit|secondary rate|abuse/i.test(err.message)) {
        break;
      }
    }
  }

  return {
    repos: [...reposByFullName.values()],
    sourceErrors,
    attemptedQueries: queries.length
  };
}

function getRepoSearchText(repo) {
  return [
    repo.name,
    repo.full_name,
    repo.description,
    repo.language,
    repo.homepage,
    ...(repo.topics || [])
  ].filter(Boolean).join(' ').toLowerCase();
}

function classifyRepo(repo) {
  const text = getRepoSearchText(repo);
  const scores = new Map();

  for (const rule of CATEGORY_RULES) {
    for (const [term, points] of rule.terms) {
      if (includesTerm(text, term)) {
        scores.set(rule.category, (scores.get(rule.category) || 0) + points);
      }
    }
  }

  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Other';
}

function getKeywordHits(repo) {
  const text = getRepoSearchText(repo);
  return [...new Set([...SEARCH_KEYWORDS, ...SCORE_KEYWORDS].filter((keyword) => includesTerm(text, keyword)))];
}

function hasUsefulLink(repo, text) {
  if (normalizeSpace(repo.homepage)) return true;
  if (repo.has_pages) return true;
  return /\b(docs|documentation|demo|playground|example|examples|quickstart)\b/i.test(text);
}

function looksLowPracticality(repo, text) {
  const topics = new Set((repo.topics || []).map((topic) => String(topic).toLowerCase()));
  if (LOW_PRACTICALITY_PATTERNS.some((pattern) => pattern.test(text))) return true;
  if (topics.has('dataset') && !/\b(tool|app|agent|cli|sdk|server|workflow|mcp)\b/i.test(text)) return true;
  return false;
}

function buildReason(parts) {
  return parts.filter(Boolean).slice(0, 5).join('; ') || 'active AI repository matching Shining Builders search criteria';
}

function scoreRepo(repo, weeklyStars, newCandidate, now) {
  const text = getRepoSearchText(repo);
  const keywordHits = getKeywordHits(repo);
  const reasons = [];
  let score = 20;

  const positiveWeeklyStars = Math.max(0, weeklyStars || 0);
  if (positiveWeeklyStars > 0) {
    const weeklyPoints = Math.min(40, Math.round(Math.log2(positiveWeeklyStars + 1) * 8));
    score += weeklyPoints;
    reasons.push(`gained ${positiveWeeklyStars} stars since previous run`);
  } else if (newCandidate) {
    score += 4;
    reasons.push('new candidate in Shining Builders history');
  } else {
    reasons.push('no star growth since previous run');
  }

  const totalStarPoints = Math.min(18, Math.round(Math.log10((repo.stargazers_count || 0) + 1) * 5));
  score += totalStarPoints;
  if ((repo.stargazers_count || 0) >= 1000) {
    reasons.push('strong total stars');
  } else if ((repo.stargazers_count || 0) >= 100) {
    reasons.push('solid total stars');
  }

  const pushedAge = daysSince(repo.pushed_at, now);
  if (pushedAge <= 1) {
    score += 18;
    reasons.push('pushed within 24 hours');
  } else if (pushedAge <= 7) {
    score += 14;
    reasons.push('pushed this week');
  } else if (pushedAge <= 30) {
    score += 8;
    reasons.push('pushed within 30 days');
  } else {
    score -= 18;
    reasons.push('not updated recently');
  }

  if (keywordHits.length) {
    score += Math.min(18, keywordHits.length * 4);
    reasons.push(`matches ${keywordHits.slice(0, 5).join(' / ')}`);
  }

  if (hasUsefulLink(repo, text)) {
    score += 6;
    reasons.push('homepage/demo/docs signal');
  }

  if (repo.fork) {
    score -= 25;
    reasons.push('fork penalty');
  }

  if (repo.archived) {
    score -= 35;
    reasons.push('archived penalty');
  }

  if (!normalizeSpace(repo.description)) {
    score -= 12;
    reasons.push('missing description');
  }

  if (looksLowPracticality(repo, text)) {
    score -= 24;
    reasons.push('lower practical-tool signal');
  }

  return {
    shiningScore: clamp(Math.round(score), 0, 100),
    reason: buildReason(reasons),
    matchedKeywords: keywordHits
  };
}

function isEligible(repo, cutoffDate) {
  if (repo.fork || repo.archived) return false;
  if ((repo.stargazers_count || 0) <= MIN_STARS) return false;

  const pushedAt = toDate(repo.pushed_at);
  if (!pushedAt || pushedAt < cutoffDate) return false;

  return true;
}

function normalizeRepo(repo, history, now) {
  const previous = history.repos?.[repo.full_name];
  const previousStars = typeof previous?.stars === 'number' ? previous.stars : null;
  const currentStars = repo.stargazers_count || 0;
  const newCandidate = previousStars === null;
  const weeklyStars = newCandidate ? 0 : currentStars - previousStars;
  const category = classifyRepo(repo);
  const scored = scoreRepo(repo, weeklyStars, newCandidate, now);

  return {
    name: repo.name || '',
    fullName: repo.full_name || '',
    description: normalizeSpace(repo.description),
    url: repo.html_url || '',
    homepage: normalizeSpace(repo.homepage),
    stars: currentStars,
    forks: repo.forks_count || 0,
    language: repo.language || 'Unknown',
    topics: Array.isArray(repo.topics) ? repo.topics : [],
    createdAt: repo.created_at || null,
    updatedAt: repo.updated_at || null,
    pushedAt: repo.pushed_at || null,
    category,
    weeklyStars,
    shiningScore: scored.shiningScore,
    reason: scored.reason,
    newCandidate,
    previousStars,
    matchedKeywords: scored.matchedKeywords,
    searchQueries: [...(repo._matchedQueries || [])]
  };
}

function getStats(items) {
  const categories = new Map();
  const languages = new Map();
  let highScoreRepos = 0;
  let newCandidates = 0;

  for (const item of items) {
    categories.set(item.category, (categories.get(item.category) || 0) + 1);
    if (item.language) languages.set(item.language, (languages.get(item.language) || 0) + 1);
    if (item.shiningScore >= HIGH_SCORE_THRESHOLD) highScoreRepos += 1;
    if (item.newCandidate) newCandidates += 1;
  }

  return {
    totalRepos: items.length,
    highScoreRepos,
    newCandidates,
    topCategories: [...categories.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({ category, count })),
    topLanguages: [...languages.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([language, count]) => ({ language, count }))
  };
}

function updateHistory(previousHistory, repos, now) {
  const nextRepos = { ...(previousHistory.repos || {}) };

  for (const repo of repos) {
    const existing = nextRepos[repo.full_name] || {};
    nextRepos[repo.full_name] = {
      name: repo.name || '',
      fullName: repo.full_name || '',
      url: repo.html_url || '',
      stars: repo.stargazers_count || 0,
      forks: repo.forks_count || 0,
      language: repo.language || null,
      topics: Array.isArray(repo.topics) ? repo.topics : [],
      firstSeenAt: existing.firstSeenAt || now.toISOString(),
      lastSeenAt: now.toISOString(),
      pushedAt: repo.pushed_at || null,
      updatedAt: repo.updated_at || null
    };
  }

  return {
    site: 'Shining Builders',
    updatedAt: now.toISOString(),
    repos: nextRepos
  };
}

async function main() {
  const now = new Date();
  const cutoffDate = daysAgoDate(DAYS_BACK);
  const rawHistory = await readJSONIfExists(HISTORY_JSON_PATH, { repos: {} });
  const history = normalizeHistory(rawHistory);
  const { repos, sourceErrors, attemptedQueries } = await searchRepositories();

  const eligibleRepos = repos.filter((repo) => isEligible(repo, cutoffDate));
  const items = eligibleRepos
    .map((repo) => normalizeRepo(repo, history, now))
    .sort((a, b) => {
      if ((b.weeklyStars || 0) !== (a.weeklyStars || 0)) return (b.weeklyStars || 0) - (a.weeklyStars || 0);
      if (b.shiningScore !== a.shiningScore) return b.shiningScore - a.shiningScore;
      return b.stars - a.stars;
    })
    .slice(0, MAX_ITEMS);

  const payload = {
    site: 'Shining Builders',
    module: 'GitHub Weekly Stars',
    generatedAt: now.toISOString(),
    timezone: 'Asia/Shanghai',
    source: 'GitHub REST API search/repositories',
    unauthenticated: !GITHUB_TOKEN,
    searchKeywords: SEARCH_KEYWORDS,
    searchFilters: {
      fork: false,
      archived: false,
      pushedWithinDays: DAYS_BACK,
      minStarsExclusive: MIN_STARS
    },
    highScoreThreshold: HIGH_SCORE_THRESHOLD,
    categories: GITHUB_CATEGORIES,
    stats: getStats(items),
    sourceErrors,
    attemptedQueries,
    fetchedRepos: repos.length,
    eligibleRepos: eligibleRepos.length,
    items
  };

  const nextHistory = updateHistory(history, eligibleRepos, now);

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(WEEKLY_JSON_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  await writeFile(HISTORY_JSON_PATH, `${JSON.stringify(nextHistory, null, 2)}\n`, 'utf-8');

  log(`Fetched ${repos.length} repos, kept ${items.length} GitHub Weekly Stars.`);
  log(`Wrote ${WEEKLY_JSON_PATH}`);
  log(`Updated ${HISTORY_JSON_PATH}`);

  if (!items.length && sourceErrors.length >= attemptedQueries) {
    throw new Error('GitHub API search returned no usable repositories. See sourceErrors in github-weekly.json.');
  }
}

main().catch((err) => {
  console.error(JSON.stringify({
    status: 'error',
    script: 'build-github-stars',
    message: err.message
  }));
  process.exit(1);
});
