## Devvit React Starter

A starter to build web applications on Reddit's developer platform

- [Devvit](https://developers.reddit.com/): A way to build and deploy immersive games on Reddit
- [Vite](https://vite.dev/): For compiling the webView
- [React](https://react.dev/): For UI
- [Hono](https://hono.dev/): For backend logic
- [Tailwind](https://tailwindcss.com/): For styles
- [TypeScript](https://www.typescriptlang.org/): For type safety

## Getting Started

> Make sure you have Node 22 downloaded on your machine before running!

1. Run `npm create devvit@latest --template=react`
2. Go through the installation wizard. You will need to create a Reddit account and connect it to Reddit developers
3. Copy the command on the success page into your terminal

## Commands

- `npm run dev`: Starts a development server where you can develop your application live on Reddit.
- `npm run build`: Builds your client and server projects
- `npm run deploy`: Uploads a new version of your app
- `npm run launch`: Publishes your app for review
- `npm run login`: Logs your CLI into Reddit
- `npm run type-check`: Type checks, lints, and prettifies your app

## HiveCatch: Production Readiness

Follow these steps to run HiveCatch on a real subreddit and validate real activity.

1. Build and install the app (Devvit CLI required):

```bash
npm run build
devvit install hive_catch_testing
```

2. Create one or more posts by suspected abuse accounts in the subreddit.

3. Use two supporter accounts to comment on the thread and mention the suspected account(s).
4. Have a reporter use the native report menu (three-dot → Report) or post a comment with `!report u/target`.

5. Open the monitor and click `Refresh` to pull live data. Check `/api/debug/parsed-mod-actions` to verify native reports were captured.

6. Verify `Ban Entire Hive` only when you are ready — it performs moderator actions (ban, lock, modmail) and will be visible in server logs.

## Real-sub runbook

- Use real posts and real user interactions. Do not rely on synthetic simulation data; the app now removes demo-only data paths.
- To build a believable cluster, have accounts interact on multiple posts in the same thread group, mention each other, and then report from a third account.
- A single reporter can trigger the incident feed; multiple supporters strengthen the cluster graph.
- Use `Refresh` after the thread has activity so the dashboard picks up the latest counts.

If you want automated tests added (Vitest/Jest), tell me which runner you prefer and I will scaffold tests for `modActionParser` and the `core/hive` helpers.
