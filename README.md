# HiveCatch

HiveCatch is a Reddit Devvit moderation dashboard for tracking coordinated abuse, surfacing report activity, and taking cluster-based moderator actions.

It is built for real subreddit use, not simulation. The app records report-like signals, builds a live cluster graph, and lets moderators review, ban, delete, and clean up clusters directly from the dashboard.

## What It Does

- Tracks report-like events from native Reddit reports and report phrases such as `!report`, `!scam`, `!spam`, and `!harass`.
- Builds a cluster view from shared thread activity and mention patterns.
- Shows a live incident feed with direct links back to the source post.
- Supports selective banning, full-cluster banning, and cluster cleanup from the dashboard.
- Persists activity in Redis for live refreshes and incident auditing.

## Requirements

- Node.js 22+
- A Devvit app installed on a subreddit
- Moderator permissions for the target subreddit

## Setup

1. Install dependencies.

```bash
npm install
```

2. Build the app.

```bash
npm run build
```

3. Run a Devvit playtest or install the app into a subreddit using the Devvit CLI.

## Devvit Workflow

- `devvit playtest hive_catch_testing` for local preview in a subreddit-like environment.
- `devvit install hive_catch_testing` to install the app in a subreddit for live testing.
- `npm run build` before each deploy or playtest change.

## Dashboard Guide

- `Refresh` pulls the latest Redis-backed snapshot.
- `Review Ban` previews the cluster candidates before any moderator action runs.
- `Remove cluster` removes a cluster from the dashboard and incident feed.
- Clicking an incident opens the source post in a new tab.
- The incident feed and cluster list are based on current live data, so the view updates as reports are recorded.

## Data Handling

HiveCatch stores moderation telemetry in Redis so the dashboard can refresh live without external services.

Data includes:

- usernames involved in incidents
- report counts and cluster links
- incident metadata such as post IDs, reporters, and reasons
- raw mod-action payloads for debugging

Privacy details are documented in [Privacy Policy](privacy.md).
Terms of use are documented in [Terms of Service](terms.md).

## Commands

- `npm run dev`: Builds the client in watch mode for development.
- `npm run build`: Builds the client and server bundles.
- `npm run deploy`: Uploads a new version of the app.
- `npm run launch`: Publishes the app for review.
- `npm run login`: Logs the CLI into Reddit.
- `npm run type-check`: Runs type checking and formatting checks.

## Troubleshooting

- If `Review Ban` shows zero accounts, the current snapshot likely has no eligible ban candidates in the selected cluster.
- If incidents open in the same tab, make sure the app has been rebuilt and the new client bundle is loaded.
- If `git add` or `git commit` behaves oddly from `e:/reddit2`, check whether you are inside the nested `e:/reddit2/hivecatch` repository instead of the parent workspace repository.

## Project Files

- [Privacy Policy](privacy.md)
- [Terms of Service](terms.md)
