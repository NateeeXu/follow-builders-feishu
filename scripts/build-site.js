#!/usr/bin/env node

// ============================================================================
// Shining Builders - Builder Signals static data builder
// ============================================================================
// Free deterministic pipeline:
//   1. Runs prepare-digest.js to fetch the latest public follow-builders feeds
//   2. Classifies and scores items with keyword/recency/link rules
//   3. Writes public/data/latest.json
//   4. Writes public/index.html
//
// This script does not call OpenAI or any paid API.
// ============================================================================

import { spawn } from 'child_process';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(SCRIPT_DIR, '..');
const PUBLIC_DIR = join(ROOT_DIR, 'public');
const DATA_DIR = join(PUBLIC_DIR, 'data');
const LATEST_JSON_PATH = join(DATA_DIR, 'latest.json');
const INDEX_HTML_PATH = join(PUBLIC_DIR, 'index.html');
const LOCAL_FEED_X_PATH = join(ROOT_DIR, 'feed-x.json');
const LOCAL_FEED_PODCASTS_PATH = join(ROOT_DIR, 'feed-podcasts.json');
const LOCAL_FEED_BLOGS_PATH = join(ROOT_DIR, 'feed-blogs.json');

const SITE_NAME = 'Shining Builders';
const CATEGORIES = [
  'Highlights',
  'AI Coding',
  'Agents / Workflow',
  'Product Launch',
  'SaaS / Startup',
  'Model / Infra',
  'Podcast / Long-form',
  'Blogs'
];

const HIGH_SCORE_THRESHOLD = 65;
const MAX_ITEMS = 240;

const CATEGORY_KEYWORDS = [
  {
    category: 'AI Coding',
    keywords: [
      ['claude code', 24],
      ['cursor', 22],
      ['replit', 22],
      ['codex', 18],
      ['coding', 18],
      ['developer', 16],
      ['github', 14],
      ['pull request', 12],
      ['code', 10],
      ['ide', 10],
      ['devtools', 10]
    ]
  },
  {
    category: 'Agents / Workflow',
    keywords: [
      ['agent', 20],
      ['agents', 20],
      ['multi agent', 18],
      ['workflow', 18],
      ['mcp', 18],
      ['automation', 14],
      ['tool use', 12],
      ['orchestration', 12],
      ['autonomous', 10]
    ]
  },
  {
    category: 'Product Launch',
    keywords: [
      ['launch', 18],
      ['release', 18],
      ['released', 16],
      ['shipping', 14],
      ['ship', 14],
      ['announce', 14],
      ['available', 12],
      ['rollout', 12],
      ['preview', 10],
      ['beta', 10],
      ['open source', 16]
    ]
  },
  {
    category: 'SaaS / Startup',
    keywords: [
      ['startup', 16],
      ['founder', 14],
      ['saas', 16],
      ['customer', 12],
      ['customers', 12],
      ['revenue', 12],
      ['pricing', 12],
      ['enterprise', 10],
      ['gtm', 10],
      ['product market', 10],
      ['vertical ai', 12]
    ]
  },
  {
    category: 'Model / Infra',
    keywords: [
      ['model', 14],
      ['models', 14],
      ['inference', 16],
      ['training', 14],
      ['eval', 14],
      ['benchmark', 12],
      ['rag', 12],
      ['gpu', 12],
      ['reasoning', 12],
      ['post training', 12],
      ['gemini', 12],
      ['claude', 12],
      ['gpt', 12],
      ['llama', 12]
    ]
  },
  {
    category: 'Podcast / Long-form',
    keywords: [
      ['podcast', 18],
      ['episode', 14],
      ['interview', 12],
      ['transcript', 10],
      ['long form', 10],
      ['deep dive', 10]
    ]
  },
  {
    category: 'Blogs',
    keywords: [
      ['blog', 14],
      ['article', 12],
      ['post', 10],
      ['engineering', 10],
      ['case study', 10]
    ]
  }
];

const IMPORTANT_KEYWORDS = new Set([
  'agent',
  'agents',
  'coding',
  'developer',
  'claude code',
  'cursor',
  'replit',
  'mcp',
  'workflow',
  'launch',
  'release',
  'released',
  'open source'
]);

function log(message) {
  console.error(`[build-site] ${message}`);
}

function runPrepareDigest() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(SCRIPT_DIR, 'prepare-digest.js')], {
      cwd: SCRIPT_DIR,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `prepare-digest.js exited with ${code}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        if (parsed.status && parsed.status !== 'ok') {
          reject(new Error(parsed.message || `prepare-digest.js returned status=${parsed.status}`));
          return;
        }
        resolve(parsed);
      } catch (err) {
        reject(new Error(`prepare-digest.js returned invalid JSON: ${err.message}`));
      }
    });
  });
}

async function readJSON(path) {
  return JSON.parse(await readFile(path, 'utf-8'));
}

async function loadPreparedDigest() {
  try {
    return await runPrepareDigest();
  } catch (err) {
    log(`prepare-digest.js failed, using local feed files: ${err.message}`);

    const [feedX, feedPodcasts, feedBlogs] = await Promise.all([
      readJSON(LOCAL_FEED_X_PATH),
      readJSON(LOCAL_FEED_PODCASTS_PATH),
      readJSON(LOCAL_FEED_BLOGS_PATH)
    ]);

    return {
      status: 'ok',
      generatedAt: new Date().toISOString(),
      x: feedX.x || [],
      podcasts: feedPodcasts.podcasts || [],
      blogs: feedBlogs.blogs || [],
      stats: {
        podcastEpisodes: feedPodcasts.podcasts?.length || 0,
        xBuilders: feedX.x?.length || 0,
        totalTweets: (feedX.x || []).reduce((sum, builder) => sum + (builder.tweets?.length || 0), 0),
        blogPosts: feedBlogs.blogs?.length || 0,
        feedGeneratedAt: feedX.generatedAt || feedPodcasts.generatedAt || feedBlogs.generatedAt || null
      },
      errors: [`prepare-digest.js unavailable locally: ${err.message}`]
    };
  }
}

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function stripUrls(value) {
  return normalizeSpace(value).replace(/https?:\/\/\S+/gi, '').trim();
}

function truncate(value, maxLength) {
  const text = normalizeSpace(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function titleFromText(text) {
  const withoutUrls = stripUrls(text);
  const firstLine = withoutUrls.split(/[.!?\n]/).find(Boolean) || withoutUrls;
  return truncate(firstLine, 96) || 'Untitled update';
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function countKeyword(text, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'gi');
  return Array.from(text.matchAll(matcher)).length;
}

function extractMatches(text) {
  const lowerText = ` ${normalizeSpace(text).toLowerCase()} `;
  const categoryScores = new Map();
  const matchedKeywords = [];

  for (const group of CATEGORY_KEYWORDS) {
    for (const [keyword, weight] of group.keywords) {
      const count = countKeyword(lowerText, keyword.toLowerCase());
      if (count === 0) continue;

      const cappedCount = Math.min(count, 3);
      const points = weight + (cappedCount - 1) * Math.ceil(weight / 3);
      categoryScores.set(group.category, (categoryScores.get(group.category) || 0) + points);
      matchedKeywords.push({ keyword, category: group.category, points });
    }
  }

  return { categoryScores, matchedKeywords };
}

function scoreRecency(publishedAt, now) {
  const date = toDate(publishedAt);
  if (!date) return { points: 0, label: null };

  const ageHours = Math.max(0, (now.getTime() - date.getTime()) / 36e5);
  if (ageHours <= 12) return { points: 32, label: 'published within 12 hours' };
  if (ageHours <= 24) return { points: 28, label: 'published within 24 hours' };
  if (ageHours <= 48) return { points: 22, label: 'published within 48 hours' };
  if (ageHours <= 72) return { points: 16, label: 'published within 72 hours' };
  if (ageHours <= 168) return { points: 10, label: 'published this week' };
  return { points: 4, label: 'older signal' };
}

function classifyAndScore(item, now) {
  const searchable = [
    item.title,
    item.text,
    item.author,
    item.source
  ].filter(Boolean).join(' ');

  const { categoryScores, matchedKeywords } = extractMatches(searchable);
  const reasons = [];
  let score = 10;

  for (const match of matchedKeywords) {
    score += match.points;
  }

  const importantMatches = matchedKeywords
    .map((match) => match.keyword.toLowerCase())
    .filter((keyword) => IMPORTANT_KEYWORDS.has(keyword));

  if (importantMatches.length) {
    const uniqueImportant = [...new Set(importantMatches)].slice(0, 5);
    reasons.push(`mentions ${uniqueImportant.join(' / ')}`);
  } else if (matchedKeywords.length) {
    const uniqueMatches = [...new Set(matchedKeywords.map((match) => match.keyword))].slice(0, 4);
    reasons.push(`matches ${uniqueMatches.join(' / ')}`);
  }

  const recency = scoreRecency(item.publishedAt, now);
  score += recency.points;
  if (recency.label) reasons.push(recency.label);

  if (item.url) {
    score += 8;
    reasons.push('source link available');
  }

  if (/https?:\/\/\S+/i.test(item.text || '')) {
    score += 4;
    reasons.push('body includes links');
  }

  if (item.type === 'podcast') {
    score += 8;
    categoryScores.set('Podcast / Long-form', (categoryScores.get('Podcast / Long-form') || 0) + 100);
    reasons.push('long-form source');
  }

  if (item.type === 'blog') {
    score += 8;
    categoryScores.set('Blogs', (categoryScores.get('Blogs') || 0) + 100);
    reasons.push('blog source');
  }

  if (typeof item.likes === 'number') {
    const engagement = Math.min(12, Math.floor(Math.log10(item.likes + 1) * 4));
    score += engagement;
    if (engagement >= 6) reasons.push('strong engagement');
  }

  const category = [...categoryScores.entries()]
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Model / Infra';

  return {
    ...item,
    category,
    score: Math.min(100, Math.round(score)),
    reason: reasons.length ? [...new Set(reasons)].join('; ') : 'ranked by recency and source quality',
    matchedKeywords: [...new Set(matchedKeywords.map((match) => match.keyword))]
  };
}

function normalizeTweet(builder, tweet) {
  const text = normalizeSpace(tweet.text);
  const handle = builder.handle ? `@${builder.handle}` : '';

  return {
    id: `tweet-${tweet.id || `${builder.handle || builder.name}-${tweet.createdAt || text}`}`,
    type: 'tweet',
    title: titleFromText(text),
    text: truncate(text, 700),
    summary: truncate(stripUrls(text) || text, 220),
    author: builder.name || handle || 'X',
    source: handle || builder.source || 'X',
    url: tweet.url || (builder.handle && tweet.id ? `https://x.com/${builder.handle}/status/${tweet.id}` : ''),
    publishedAt: tweet.createdAt || null,
    likes: typeof tweet.likes === 'number' ? tweet.likes : undefined
  };
}

function normalizePodcast(podcast) {
  const title = normalizeSpace(podcast.title || podcast.name || 'Podcast episode');
  const transcript = normalizeSpace(podcast.transcript || podcast.description || podcast.text || '');

  return {
    id: `podcast-${podcast.guid || podcast.url || title}`,
    type: 'podcast',
    title,
    text: truncate(transcript || title, 900),
    summary: truncate(transcript || title, 260),
    author: podcast.name || 'Podcast',
    source: podcast.source || 'podcast',
    url: podcast.url || '',
    publishedAt: podcast.publishedAt || podcast.createdAt || null
  };
}

function normalizeBlog(blog) {
  const title = normalizeSpace(blog.title || blog.name || 'Blog post');
  const body = normalizeSpace(blog.content || blog.text || blog.description || blog.excerpt || blog.summary || '');

  return {
    id: `blog-${blog.id || blog.url || title}`,
    type: 'blog',
    title,
    text: truncate(body || title, 900),
    summary: truncate(body || title, 260),
    author: blog.author || blog.name || blog.source || 'Blog',
    source: blog.source || blog.site || 'blog',
    url: blog.url || blog.link || '',
    publishedAt: blog.publishedAt || blog.createdAt || blog.date || null
  };
}

function flattenPreparedDigest(prepared) {
  const tweets = (prepared.x || []).flatMap((builder) =>
    (builder.tweets || []).map((tweet) => normalizeTweet(builder, tweet))
  );
  const podcasts = (prepared.podcasts || []).map(normalizePodcast);
  const blogs = (prepared.blogs || []).map(normalizeBlog);

  return { tweets, podcasts, blogs, items: [...tweets, ...podcasts, ...blogs] };
}

function getStats(items) {
  const categoryCounts = new Map();
  for (const item of items) {
    categoryCounts.set(item.category, (categoryCounts.get(item.category) || 0) + 1);
  }

  const topCategories = [...categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({ category, count }));

  return {
    totalItems: items.length,
    tweetsCount: items.filter((item) => item.type === 'tweet').length,
    podcastsCount: items.filter((item) => item.type === 'podcast').length,
    blogsCount: items.filter((item) => item.type === 'blog').length,
    topCategories
  };
}

function renderIndexHTML() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Shining Builders discovers what AI builders are saying and what they are building across Builder Signals and GitHub Weekly Stars.">
    <title>Shining Builders</title>
    <link rel="stylesheet" href="./styles.css">
  </head>
  <body>
    <header class="site-header">
      <nav class="topbar" aria-label="Top navigation">
        <a class="brand" href="./" aria-label="Shining Builders home">
          <span class="brand-mark">SB</span>
          <span>Shining Builders</span>
        </a>
        <div class="topnav" aria-label="Sections">
          <a href="#builder-signals">Builder Signals</a>
          <a href="#github-stars">GitHub Weekly Stars</a>
          <a href="#practical-tools">Practical Tools</a>
        </div>
        <div class="status-pill">
          <span class="status-dot"></span>
          <span id="lastUpdated">Loading feeds...</span>
        </div>
      </nav>

      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">AI builder intelligence, rebuilt daily</p>
          <h1>Shining Builders</h1>
          <p class="hero-subtitle">Discover what AI builders are saying and what they are building.</p>
        </div>
        <div class="hero-panel" aria-label="Feed snapshot">
          <span class="panel-label">Signals</span>
          <strong id="heroSignalsTotal">0</strong>
          <span>builder updates</span>
          <span class="panel-divider"></span>
          <span class="panel-label">GitHub</span>
          <strong id="heroReposTotal">0</strong>
          <span>weekly repos</span>
        </div>
      </section>
    </header>

    <main>
      <section class="stats-grid" id="statsGrid" aria-label="Site statistics"></section>

      <section class="section-block" id="builder-signals">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Builder Signals</p>
            <h2>What builders are saying</h2>
          </div>
          <label class="high-score-toggle">
            <input type="checkbox" id="signalsHighScoreOnly">
            <span>High score</span>
          </label>
        </div>

        <div class="signal-highlights" id="signalHighlights"></div>

        <div class="controls">
          <div class="search-wrap">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M10.8 4.5a6.3 6.3 0 1 1 0 12.6 6.3 6.3 0 0 1 0-12.6Zm0 1.8a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm5.2 10 4 4-1.3 1.3-4-4 1.3-1.3Z"></path>
            </svg>
            <input id="signalsSearchInput" type="search" placeholder="Search builders, topics, launches..." autocomplete="off">
          </div>
          <div class="tabs" id="signalsCategoryTabs" role="tablist" aria-label="Builder Signal categories"></div>
        </div>

        <div class="results-meta" id="signalsResultsMeta"></div>
        <div class="items-grid" id="signalsGrid"></div>
      </section>

      <section class="section-block" id="github-stars">
        <div class="section-heading">
          <div>
            <p class="eyebrow">GitHub Weekly Stars</p>
            <h2>Fast-moving AI projects</h2>
          </div>
          <label class="high-score-toggle">
            <input type="checkbox" id="reposHighScoreOnly">
            <span>High score repos</span>
          </label>
        </div>

        <div class="controls">
          <div class="search-wrap">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M10.8 4.5a6.3 6.3 0 1 1 0 12.6 6.3 6.3 0 0 1 0-12.6Zm0 1.8a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm5.2 10 4 4-1.3 1.3-4-4 1.3-1.3Z"></path>
            </svg>
            <input id="reposSearchInput" type="search" placeholder="Search repos, topics, languages..." autocomplete="off">
          </div>
          <div class="tabs" id="reposCategoryTabs" role="tablist" aria-label="GitHub repo categories"></div>
        </div>

        <div class="results-meta" id="reposResultsMeta"></div>
        <div class="repo-grid" id="reposGrid"></div>
      </section>

      <section class="section-block" id="practical-tools">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Practical Tools</p>
            <h2>Useful repos worth trying</h2>
          </div>
        </div>
        <div class="repo-grid compact" id="toolsGrid"></div>
      </section>
    </main>

    <footer class="site-footer">
      <span>Built from public feeds and the GitHub REST API. No OpenAI API. No paid APIs.</span>
    </footer>

    <script src="./app.js" type="module"></script>
  </body>
</html>
`;
}

async function main() {
  log('Fetching latest Builder Signals with prepare-digest.js...');
  const prepared = await loadPreparedDigest();
  const now = new Date();
  const { items } = flattenPreparedDigest(prepared);

  const scoredItems = items
    .map((item) => classifyAndScore(item, now))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (toDate(b.publishedAt)?.getTime() || 0) - (toDate(a.publishedAt)?.getTime() || 0);
    })
    .slice(0, MAX_ITEMS)
    .map((item, index) => ({
      ...item,
      rank: index + 1,
      isHighlight: index < 12 || item.score >= HIGH_SCORE_THRESHOLD
    }));

  const payload = {
    site: SITE_NAME,
    module: 'Builder Signals',
    generatedAt: now.toISOString(),
    timezone: 'Asia/Shanghai',
    feedGeneratedAt: prepared.stats?.feedGeneratedAt || prepared.generatedAt || null,
    categories: CATEGORIES,
    highScoreThreshold: HIGH_SCORE_THRESHOLD,
    stats: getStats(scoredItems),
    highlights: scoredItems.filter((item) => item.isHighlight).slice(0, 12).map((item) => item.id),
    items: scoredItems,
    sourceErrors: prepared.errors || []
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(LATEST_JSON_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  await writeFile(INDEX_HTML_PATH, renderIndexHTML(), 'utf-8');

  log(`Wrote ${scoredItems.length} Builder Signals to ${LATEST_JSON_PATH}`);
  log(`Updated ${INDEX_HTML_PATH}`);
}

main().catch((err) => {
  console.error(JSON.stringify({
    status: 'error',
    script: 'build-site',
    message: err.message
  }));
  process.exit(1);
});
