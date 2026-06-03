#!/usr/bin/env node

// ============================================================================
// Follow Builders - Summarize Digest
// ============================================================================
// Reads the JSON produced by prepare-digest.js and asks the OpenAI API to turn
// it into a concise Chinese Markdown digest.
//
// Usage:
//   node prepare-digest.js | node summarize.js
//   node summarize.js --file /path/to/prepared-digest.json
// ============================================================================

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { config as loadEnv } from 'dotenv';

const USER_DIR = join(homedir(), '.follow-builders');
const ENV_PATH = join(USER_DIR, '.env');

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-5-mini';
const DEFAULT_MAX_OUTPUT_TOKENS = 2200;

const MAX_TWEETS_PER_BUILDER = 8;
const MAX_TWEET_CHARS = 1200;
const MAX_TRANSCRIPT_CHARS = 30000;
const MAX_BLOG_CHARS = 12000;

function getArgValue(flag) {
  const args = process.argv.slice(2);
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : undefined;
}

async function readInputJSON() {
  const filePath = getArgValue('--file');
  if (filePath) {
    return readFile(filePath, 'utf-8');
  }

  if (process.stdin.isTTY) {
    throw new Error('No input JSON. Pipe prepare-digest.js output or pass --file.');
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function truncate(value, maxChars) {
  if (!value) return value;
  const text = String(value);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated]`;
}

function compactTweet(tweet) {
  return {
    text: truncate(tweet.text, MAX_TWEET_CHARS),
    createdAt: tweet.createdAt,
    url: tweet.url,
    likes: tweet.likes,
    retweets: tweet.retweets,
    replies: tweet.replies,
    isQuote: tweet.isQuote
  };
}

function compactBlog(blog) {
  return {
    name: blog.name,
    title: blog.title,
    url: blog.url,
    publishedAt: blog.publishedAt,
    summary: truncate(blog.summary, MAX_BLOG_CHARS),
    content: truncate(blog.content || blog.text || blog.body || blog.markdown, MAX_BLOG_CHARS)
  };
}

function compactPodcast(podcast) {
  return {
    name: podcast.name,
    title: podcast.title,
    url: podcast.url,
    publishedAt: podcast.publishedAt,
    transcript: truncate(podcast.transcript, MAX_TRANSCRIPT_CHARS)
  };
}

function buildModelInput(data) {
  return {
    generatedAt: data.generatedAt,
    stats: data.stats,
    errors: data.errors,
    x: (data.x || []).map((builder) => ({
      name: builder.name,
      handle: builder.handle,
      bio: builder.bio,
      tweets: (builder.tweets || [])
        .slice()
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, MAX_TWEETS_PER_BUILDER)
        .map(compactTweet)
    })).filter((builder) => builder.tweets.length > 0),
    podcasts: (data.podcasts || []).map(compactPodcast),
    blogs: (data.blogs || []).map(compactBlog)
  };
}

function buildInstructions() {
  return [
    '你是一名面向中文 AI builders 的每日情报编辑。',
    '你的任务是把输入 JSON 中的 AI builders 最新内容整理成有行动价值的中文 Markdown 摘要。',
    '只允许使用输入 JSON 里的事实、观点和 URL，不要编造、不要补充外部信息。',
    '优先关注 AI coding、agent、SaaS、个人开发者、产品发布、技术趋势。',
    '不要机械翻译原文，要提炼信号、判断重要性，并指出对独立开发者或产品 builder 的启发。',
    '每条重要判断都要能在输入内容中找到依据。证据弱时用谨慎措辞。',
    '输出必须是中文 Markdown，不要包裹在代码块中。',
    '固定使用以下栏目，栏目名和顺序不能变：',
    '## 1. 今日重点',
    '## 2. 产品信号',
    '## 3. 技术信号',
    '## 4. 值得关注的人/项目',
    '## 5. 对我的启发',
    '## 6. 原文链接',
    '内容要简洁，优先用短段落和项目符号。原文链接栏目列出被引用或值得继续阅读的 URL。'
  ].join('\n');
}

function buildPrompt(data) {
  const compactInput = buildModelInput(data);
  return [
    '请根据下面的 follow-builders feed JSON 生成今日中文 digest。',
    '',
    '额外要求：',
    '- 今日重点控制在 3-5 条。',
    '- 产品信号和技术信号分别给出最值得行动或观察的信号。',
    '- 对我的启发要具体到可以尝试的产品、技术或内容动作。',
    '- 原文链接不要遗漏你在正文中重点引用的内容。',
    '',
    'JSON:',
    JSON.stringify(compactInput, null, 2)
  ].join('\n');
}

function extractOutputText(responseBody) {
  if (typeof responseBody.output_text === 'string') {
    return responseBody.output_text.trim();
  }

  const parts = [];
  for (const item of responseBody.output || []) {
    if (item.type === 'message') {
      for (const content of item.content || []) {
        if (content.type === 'output_text' && content.text) parts.push(content.text);
        if (content.type === 'text' && content.text) parts.push(content.text);
      }
    }
  }

  return parts.join('\n').trim();
}

async function createSummary(data) {
  if (existsSync(ENV_PATH)) {
    loadEnv({ path: ENV_PATH });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required.');
  }

  const model = getArgValue('--model') || process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const maxOutputTokens = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || DEFAULT_MAX_OUTPUT_TOKENS);

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      instructions: buildInstructions(),
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: buildPrompt(data)
            }
          ]
        }
      ],
      max_output_tokens: maxOutputTokens
    })
  });

  const responseText = await response.text();
  let responseBody;
  try {
    responseBody = responseText ? JSON.parse(responseText) : {};
  } catch {
    responseBody = { raw: responseText };
  }

  if (!response.ok) {
    const detail = responseBody.error?.message || responseBody.message || responseText;
    throw new Error(`OpenAI API error (${response.status} ${response.statusText}): ${detail}`);
  }

  const output = extractOutputText(responseBody);
  if (!output) {
    throw new Error(`OpenAI API returned no output text: ${responseText}`);
  }

  return output;
}

async function main() {
  const rawInput = await readInputJSON();
  let data;
  try {
    data = JSON.parse(rawInput);
  } catch (err) {
    throw new Error(`Invalid prepare-digest JSON: ${err.message}`);
  }

  const summary = await createSummary(data);
  console.log(summary);
}

main().catch((err) => {
  console.error(JSON.stringify({
    status: 'error',
    script: 'summarize',
    message: err.message
  }));
  process.exit(1);
});
