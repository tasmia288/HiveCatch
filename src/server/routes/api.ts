import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import { redis } from '@devvit/web/server';
import type {
  InitResponse,
  RefreshResponse,
  ActionResponse,
} from '../../shared/api';
import {
  clearSyntheticDemoData,
  cleanupClusterByRoot,
  deleteIncidentById,
  getDashboardSnapshot,
  getHiveClustersForAction,
} from '../core/hive';

type ErrorResponse = {
  status: 'error';
  message: string;
};

export const api = new Hono();

const toThingPostId = (postId: string): string =>
  postId.startsWith('t3_') ? postId : `t3_${postId}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isFunction = (value: unknown): value is (...args: unknown[]) => unknown =>
  typeof value === 'function';

const callMethod = async (
  target: unknown,
  methodName: string,
  args: unknown[]
): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> => {
  if (!isRecord(target)) {
    return { ok: false, error: 'Target is not an object' };
  }

  const method = Reflect.get(target, methodName);
  if (!isFunction(method)) {
    return { ok: false, error: `Method ${methodName} is unavailable` };
  }

  try {
    const value = await method.apply(target, args);
    return { ok: true, value };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown method error',
    };
  }
};

const attemptBanUser = async (
  username: string
): Promise<{ ok: boolean; method?: string; error?: string }> => {
  const subredditName = context.subredditName;

  if (subredditName) {
    const subredditResult = await callMethod(reddit, 'getSubredditByName', [
      subredditName,
    ]);
    if (subredditResult.ok) {
      const subreddit = subredditResult.value;
      const subredditAttempts: Array<{ name: string; args: unknown[] }> = [
        {
          name: 'addBannedUser',
          args: [{ username, note: 'HiveCatch cluster action' }],
        },
        {
          name: 'banUser',
          args: [{ username, note: 'HiveCatch cluster action' }],
        },
      ];

      for (const attempt of subredditAttempts) {
        const result = await callMethod(subreddit, attempt.name, attempt.args);
        if (result.ok) {
          return { ok: true, method: `subreddit.${attempt.name}` };
        }
      }
    }
  }

  const redditAttempts: Array<{ name: string; args: unknown[] }> = [
    {
      name: 'banUser',
      args: [{ username, subredditName: context.subredditName }],
    },
    {
      name: 'banUserFromSubreddit',
      args: [{ username, subredditName: context.subredditName }],
    },
  ];

  for (const attempt of redditAttempts) {
    const result = await callMethod(reddit, attempt.name, attempt.args);
    if (result.ok) {
      return { ok: true, method: `reddit.${attempt.name}` };
    }
  }

  return { ok: false, error: 'All ban attempts failed' };
};

const tryLockPost = async (postId: string): Promise<boolean> => {
  const thingId = toThingPostId(postId);
  const postResult = await callMethod(reddit, 'getPostById', [thingId]);

  if (postResult.ok) {
    const post = postResult.value;
    for (const methodName of ['lock', 'lockPost']) {
      const result = await callMethod(post, methodName, []);
      if (result.ok) {
        return true;
      }
    }
  }

  const lockAttempts: Array<{ name: string; args: unknown[] }> = [
    { name: 'lockPost', args: [{ postId: thingId }] },
    { name: 'lock', args: [{ id: thingId }] },
  ];

  for (const attempt of lockAttempts) {
    const result = await callMethod(reddit, attempt.name, attempt.args);
    if (result.ok) {
      return true;
    }
  }

  return false;
};

const tryReportToAdmins = async (
  usernames: string[],
  postId: string
): Promise<boolean> => {
  const payload = {
    subject: '[HiveCatch] Potential coordinated abuse cluster detected',
    body: `Detected users: ${usernames.join(', ')}\nSource post: ${toThingPostId(postId)}`,
    subredditName: context.subredditName,
  };

  const attempts: Array<{ name: string; args: unknown[] }> = [
    { name: 'sendModMail', args: [payload] },
    { name: 'createModMailConversation', args: [payload] },
    { name: 'submitSubredditReport', args: [payload] },
  ];

  for (const attempt of attempts) {
    const result = await callMethod(reddit, attempt.name, attempt.args);
    if (result.ok) {
      return true;
    }
  }

  return false;
};

const normalizeUserList = (input: unknown): string[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  return [
    ...new Set(
      input.filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0
      )
    ),
  ];
};

api.get('/init', async (c) => {
  const { postId } = context;

  if (!postId) {
    console.error('API Init Error: postId not found in devvit context');
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required but missing from context',
      },
      400
    );
  }

  try {
    const [snapshot, username] = await Promise.all([
      getDashboardSnapshot(),
      reddit.getCurrentUsername(),
    ]);

    return c.json<InitResponse>({
      type: 'init',
      postId: postId,
      snapshot,
      username: username ?? 'anonymous',
    });
  } catch (error) {
    console.error(`API Init Error for post ${postId}:`, error);
    let errorMessage = 'Unknown error during initialization';
    if (error instanceof Error) {
      errorMessage = `Initialization failed: ${error.message}`;
    }
    return c.json<ErrorResponse>(
      { status: 'error', message: errorMessage },
      400
    );
  }
});

api.get('/refresh', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required',
      },
      400
    );
  }

  const snapshot = await getDashboardSnapshot();
  return c.json<RefreshResponse>({ type: 'refresh', postId, snapshot });
});

api.post('/debug/clear-demo-data', async (c) => {
  try {
    await clearSyntheticDemoData();
    const { postId } = context;
    const snapshot = await getDashboardSnapshot();
    return c.json(
      {
        status: 'success',
        message: 'Synthetic demo data cleared.',
        postId: postId ?? '',
        snapshot,
      },
      200
    );
  } catch (error) {
    console.error('Failed to clear synthetic demo data:', error);
    return c.json(
      {
        status: 'error',
        message: 'Failed to clear synthetic demo data.',
      },
      500
    );
  }
});

api.post('/signals/delete', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const incidentId =
    body && typeof body.incidentId === 'string' ? body.incidentId : '';

  if (!incidentId) {
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'incidentId is required',
      },
      400
    );
  }

  const deleted = await deleteIncidentById(incidentId);
  if (!deleted) {
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'Signal not found',
      },
      404
    );
  }

  const snapshot = await getDashboardSnapshot();
  return c.json(
    {
      status: 'success',
      message: 'Signal deleted',
      snapshot,
    },
    200
  );
});

api.post('/mod/ban-hive', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required',
      },
      400
    );
  }

  // Allow dryRun via JSON body or query param
  let dryRun = false;
  let body: Record<string, unknown> = {};
  try {
    body = await c.req.json().catch(() => ({}));
    dryRun = body && body.dryRun === true;
  } catch {
    /* ignore */
  }
  try {
    const url = new URL(c.req.url);
    if (url.searchParams.get('dryRun') === 'true') dryRun = true;
  } catch {}

  const selectedUsers = normalizeUserList(body.selectedUsers);
  const selectedClusters = normalizeUserList(body.selectedClusters);

  const clusterBreakdown = await getHiveClustersForAction(45);
  const clusterMap = new Map(
    clusterBreakdown.map((cluster) => [cluster.root, cluster])
  );
  const computedUsers =
    selectedUsers.length > 0
      ? selectedUsers
      : selectedClusters.length > 0
        ? selectedClusters.flatMap(
            (root) => clusterMap.get(root)?.members ?? [root]
          )
        : clusterBreakdown.flatMap((cluster) => cluster.members);
  const attemptedUsers = [...new Set(computedUsers)];
  const perUserResults: Array<{
    username: string;
    ok: boolean;
    method?: string;
    error?: string;
  }> = [];

  if (!dryRun) {
    for (const username of attemptedUsers) {
      // Try banning with a couple retries and small backoff
      let attempt = 0;
      let result: { ok: boolean; method?: string; error?: string } | null =
        null;
      while (attempt < 3) {
        result = await attemptBanUser(username);
        if (result.ok) break;
        attempt += 1;
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }

      perUserResults.push({
        username,
        ok: !!result?.ok,
        method: result?.method,
        error: result?.error,
      });
      console.log(
        `Ban attempt for ${username}: ${result?.ok} ${result?.method ?? ''} ${result?.error ?? ''}`
      );
    }
  } else {
    for (const username of attemptedUsers) {
      perUserResults.push({ username, ok: false, error: 'dry-run' });
    }
  }

  const bannedUsers = perUserResults.filter((r) => r.ok).map((r) => r.username);

  let threadLocked = false;
  let reportSubmitted = false;

  if (!dryRun) {
    const results = await Promise.all([
      tryLockPost(postId),
      tryReportToAdmins(attemptedUsers, postId),
    ]);
    threadLocked = results[0];
    reportSubmitted = results[1];

    console.log(`Lock attempt for post ${postId}: ${threadLocked}`);
    console.log(
      `Report to admins attempt for post ${postId}: ${reportSubmitted}`
    );
  }

  const response: ActionResponse & { perUserResults?: unknown } = {
    type: 'action',
    postId,
    attemptedUsers,
    bannedUsers,
    threadLocked,
    reportSubmitted,
    dryRun,
    clusterBreakdown,
    message: dryRun
      ? `Preview ready: ${attemptedUsers.length} accounts across ${selectedClusters.length > 0 ? selectedClusters.length : clusterBreakdown.length} hive clusters would be banned.`
      : bannedUsers.length > 0
        ? `Actioned ${bannedUsers.length}/${attemptedUsers.length} users in detected hive.`
        : 'No users were actioned. Verify moderator scope permissions for reddit API actions.',
    perUserResults,
  };

  return c.json(response, 200);
});

api.post('/clusters/cleanup', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const root =
    body && typeof (body as Record<string, unknown>).root === 'string'
      ? (body as Record<string, unknown>).root
      : '';

  if (!root) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'root is required' },
      400
    );
  }

  const result = await cleanupClusterByRoot(root);
  if (!result) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Cluster not found' },
      404
    );
  }

  const snapshot = await getDashboardSnapshot();
  return c.json(
    {
      status: 'success',
      message: `Removed cluster ${result.root} from the dashboard.`,
      snapshot,
      cleanup: result,
    },
    200
  );
});

// Debug: fetch recent raw mod-action payloads captured by triggers
api.get('/debug/mod-actions', async (c) => {
  try {
    const items = await redis.zRange('hc:mod_actions', 0, 200, { by: 'rank' });
    const parsed = items.map((item) => {
      const raw =
        typeof item === 'string'
          ? item
          : typeof item === 'object' && item !== null
            ? String(Reflect.get(item, 'member') ?? '')
            : '';
      try {
        return JSON.parse(raw || '{}');
      } catch {
        return { raw };
      }
    });

    const sorted = parsed
      .filter((entry) => typeof entry === 'object' && entry !== null)
      .sort((a, b) => {
        const aTs = Number((a as Record<string, unknown>).ts ?? 0);
        const bTs = Number((b as Record<string, unknown>).ts ?? 0);
        return bTs - aTs;
      })
      .slice(0, 50);

    return c.json({ items: sorted }, 200);
  } catch (err) {
    console.error('Failed to fetch mod-actions from Redis:', err);
    return c.json({ error: 'Failed to fetch mod-actions' }, 500);
  }
});

// Parsed mod-action view for easier inspection during testing
api.get('/debug/parsed-mod-actions', async (c) => {
  try {
    const items = await redis.zRange('hc:mod_actions', 0, 200, { by: 'rank' });
    const parsed = items.map((item) => {
      const raw =
        typeof item === 'string'
          ? item
          : typeof item === 'object' && item !== null
            ? String(Reflect.get(item, 'member') ?? '')
            : '';

      try {
        const parsedRaw = JSON.parse(raw || '{}');
        const payload = parsedRaw.payload ?? parsedRaw;
        // Lazy import parser to avoid circular imports
        const { parseModAction } = require('../core/modActionParser');
        return parseModAction(payload);
      } catch (err) {
        return { raw };
      }
    });

    const sorted = parsed
      .filter((entry) => typeof entry === 'object' && entry !== null)
      .slice(0, 50);

    return c.json({ items: sorted }, 200);
  } catch (err) {
    console.error('Failed to fetch parsed mod-actions from Redis:', err);
    return c.json({ error: 'Failed to fetch parsed mod-actions' }, 500);
  }
});
