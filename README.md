# Shining Builders

Shining Builders is a free static website for discovering what AI builders are saying and what they are building.

Version 2.0 keeps the original builder information feed as **Builder Signals** and adds **GitHub Weekly Stars**, a daily GitHub REST API scan for fast-moving, practical AI tools, skills, agents, MCP projects, AI coding projects, RAG tools, workflow automation projects, and developer tools.

No paid APIs are used. The default website workflow does not use the OpenAI API and does not require `OPENAI_API_KEY`.

## What It Shows

- **Builder Signals**: latest public X/Twitter builder messages, podcasts, long-form items, and blog posts from the existing follow-builders feeds.
- **GitHub Weekly Stars**: public GitHub repositories matching AI builder keywords, filtered for active non-fork, non-archived repos with meaningful stars and recent pushes.
- **Practical Tools**: high-scoring GitHub repos that look useful for builders, including AI coding, agents, MCP, workflow automation, developer tools, SaaS starter kits, and skills.
- Search, category filtering, high-score filtering, score reasons, repo metadata, topics, and source links.

## GitHub Weekly Stars

The GitHub scanner lives in `scripts/build-github-stars.js`.

It searches public repositories with keywords including:

```text
ai agent, llm agent, mcp, claude code, cursor, ai coding, coding agent, rag,
workflow automation, ai tool, llm app, openai, anthropic, langchain,
llamaindex, browser agent, developer tool, ai skill
```

The script prioritizes:

- `fork:false`
- `archived:false`
- pushed within the last 30 days
- stars greater than 20

`GITHUB_TOKEN` is optional. If present, the script adds it to the GitHub request headers for higher rate limits. If it is not present, the script still runs in unauthenticated mode with fewer grouped searches.

Generated files:

- `public/data/latest.json`
- `public/data/github-weekly.json`
- `public/data/github-stars-history.json`

`github-stars-history.json` stores the previous star count for each seen repo. On later runs, `weeklyStars` is calculated as the current star count minus the previous stored star count. First-time repos are marked as `newCandidate` and get `weeklyStars: 0`.

## Local Run

From the repo root:

```bash
cd scripts
npm install
cd ..
node scripts/build-site.js
node scripts/build-github-stars.js
```

Optional syntax check:

```bash
node --check scripts/build-github-stars.js
```

The static site is written under `public/`. You can serve that folder with any static server, or open `public/index.html` directly if your browser allows local `fetch`.

## Deploy To GitHub Pages

The default workflow is `.github/workflows/daily-site.yml`.

It runs every day at `00:00 UTC`, which is `08:00` in Beijing, and can also be started manually with `workflow_dispatch`.

The workflow:

1. Checks out the repo.
2. Sets up Node.js.
3. Installs script dependencies.
4. Runs `node scripts/build-site.js`.
5. Runs `node scripts/build-github-stars.js` with the GitHub Actions `GITHUB_TOKEN`.
6. Commits generated data and static files.
7. Deploys `public/` to GitHub Pages.

To enable GitHub Pages:

1. Open the repository `Settings`.
2. Open `Pages`.
3. Set `Source` to `GitHub Actions`.
4. Run the `Daily Shining Builders Site` workflow once, or wait for the daily schedule.

## Scripts

- `scripts/prepare-digest.js` fetches the latest follow-builders feed JSON.
- `scripts/build-site.js` builds Builder Signals and writes the static HTML shell.
- `scripts/build-github-stars.js` builds GitHub Weekly Stars and updates star history.
- `scripts/summarize.js` is retained only for the optional Feishu digest flow.

## Optional Feishu Flow

`.github/workflows/daily-feishu.yml` is kept as a manual-only optional workflow. It is not the default daily website workflow and still requires OpenAI plus Feishu secrets if you choose to run it.

For the free website flow, use `Daily Shining Builders Site`.

## License

MIT
