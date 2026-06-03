#!/usr/bin/env node

// ============================================================================
// Follow Builders - Daily Feishu Runner
// ============================================================================
// Runs the full daily pipeline:
//   1. prepare-digest.js -> feed JSON
//   2. summarize.js -> Chinese Markdown digest
//   3. deliver.js --method feishu -> Feishu group webhook
// ============================================================================

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

function log(message) {
  console.error(`[follow-builders] ${message}`);
}

function runNodeScript(scriptName, args = [], input = undefined) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(SCRIPT_DIR, scriptName), ...args], {
      cwd: SCRIPT_DIR,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe']
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
        const output = stderr.trim() || stdout.trim() || `exit code ${code}`;
        reject(new Error(`${scriptName} failed: ${output}`));
        return;
      }

      resolve({ stdout, stderr });
    });

    child.stdin.end(input || '');
  });
}

function assertPreparedDigest(rawJSON) {
  let data;
  try {
    data = JSON.parse(rawJSON);
  } catch (err) {
    throw new Error(`prepare-digest.js returned invalid JSON: ${err.message}`);
  }

  if (data.status && data.status !== 'ok') {
    throw new Error(`prepare-digest.js returned status=${data.status}: ${data.message || 'unknown error'}`);
  }

  return data;
}

async function main() {
  log('Preparing latest feed JSON...');
  const prepared = await runNodeScript('prepare-digest.js');
  const preparedData = assertPreparedDigest(prepared.stdout);
  const stats = preparedData.stats || {};
  log(`Prepared feed: ${stats.totalTweets || 0} tweets, ${stats.podcastEpisodes || 0} podcast episodes, ${stats.blogPosts || 0} blog posts.`);

  log('Generating Chinese digest with OpenAI...');
  const summary = await runNodeScript('summarize.js', [], prepared.stdout);
  const digestText = summary.stdout.trim();
  if (!digestText) {
    throw new Error('summarize.js returned an empty digest.');
  }
  log(`Generated digest (${digestText.length} characters).`);

  log('Sending digest to Feishu...');
  const delivery = await runNodeScript('deliver.js', ['--method', 'feishu'], digestText);
  if (delivery.stdout.trim()) {
    log(delivery.stdout.trim());
  }

  log('Daily Feishu digest completed.');
}

main().catch((err) => {
  console.error(JSON.stringify({
    status: 'error',
    script: 'run-daily',
    message: err.message
  }));
  process.exit(1);
});
