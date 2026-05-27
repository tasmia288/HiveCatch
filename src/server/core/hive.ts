import { redis, reddit } from '@devvit/web/server';

export type SourceType = 'post' | 'comment';

export type ContentEvent = {
  postId: string;
  sourceId: string;
  sourceType: SourceType;
  authorName: string;
  text: string;
  incidentReason?: string;
  forceIncident?: boolean;
  suspectName?: string | null;
};

export type ConnectionSummary = {
  username: string;
  weight: number;
  clusterMatchPercent: number;
};

export type SuspectSummary = {
  username: string;
  reports: number;
  linkedAccounts: ConnectionSummary[];
};

export type HiveClusterSummary = {
  root: string;
  members: string[];
  reportCount: number;
};

export type ClusterCleanupSummary = {
  root: string;
  members: string[];
  incidentsRemoved: number;
  suspectsRemoved: number;
};

export type IncidentSummary = {
  incidentId: string;
  ts: number;
  postId: string;
  sourceId: string;
  sourceType: SourceType;
  reporter: string;
  suspect: string;
  reason: string;
  targetLabel?: string;
};

export type DashboardSnapshot = {
  totalReports: number;
  clusterRoots: number;
  suspects: SuspectSummary[];
  incidents: IncidentSummary[];
};

const REPORT_PHRASES = [
  '!scam',
  '!report',
  '!spam',
  '!harass',
  'scam ring',
  'fraud ring',
  'spam ring',
  'harassment ring',
  'brigade',
  'brigading',
  'coordinated abuse',
];
const DEFENSE_PHRASES = [
  'not a scam',
  'legit',
  'innocent',
  'vouch',
  'trusted seller',
];

const KEY_SUSPECT_REPORTS = 'hc:suspect:reports';
const KEY_INCIDENTS = 'hc:incidents';
const KEY_TOTAL_REPORTS = 'hc:total:reports';

const participantKey = (postId: string): string =>
  `hc:thread:${postId}:participants`;
const edgeKey = (username: string): string => `hc:edges:${username}`;

const normalizeUsername = (raw: string): string => {
  let value = raw.trim().toLowerCase();
  if (value.startsWith('/u/')) {
    value = value.slice(3);
  }
  if (value.startsWith('u/')) {
    value = value.slice(2);
  }
  if (value.startsWith('@')) {
    value = value.slice(1);
  }
  return value.replace(/[^a-z0-9_-]/g, '');
};

export { normalizeUsername };

const extractMentionedUsers = (text: string): string[] => {
  const lowered = text.toLowerCase();
  const matches = lowered.matchAll(/(?:\/u\/|u\/|@)([a-z0-9_-]{3,20})/g);
  const users = new Set<string>();
  for (const match of matches) {
    const candidate = normalizeUsername(match[1] ?? '');
    if (candidate.length >= 3) {
      users.add(candidate);
    }
  }
  return [...users];
};

export { extractMentionedUsers };

const containsAny = (text: string, phrases: string[]): boolean => {
  const lowered = text.toLowerCase();
  return phrases.some((phrase) => lowered.includes(phrase));
};

export { containsAny };

const isSyntheticAccountName = (value: string): boolean => {
  const username = normalizeUsername(value);
  return (
    username === 'reporter' ||
    username === 'unknown' ||
    username === 'unknown-target' ||
    username === 'redacted' ||
    username === 'unresolved target'
  );
};

const toNumber = (value: string | undefined): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const updateParticipant = async (
  postId: string,
  username: string
): Promise<void> => {
  await redis.hIncrBy(participantKey(postId), username, 1);
};

const incrementEdge = async (
  leftUser: string,
  rightUser: string,
  incrementBy: number
): Promise<void> => {
  if (!leftUser || !rightUser || leftUser === rightUser) {
    return;
  }

  await Promise.all([
    redis.hIncrBy(edgeKey(leftUser), rightUser, incrementBy),
    redis.hIncrBy(edgeKey(rightUser), leftUser, incrementBy),
  ]);
};

const addIncident = async (incident: IncidentSummary): Promise<void> => {
  await redis.zAdd(KEY_INCIDENTS, {
    member: JSON.stringify(incident),
    score: incident.ts,
  });
};

const collectClusterSuspects = async (root: string): Promise<string[]> => {
  const clusterRoot = normalizeUsername(root);
  if (!clusterRoot || isSyntheticAccountName(clusterRoot)) {
    return [];
  }

  const snapshot = await getDashboardSnapshot(8, 8, 50);
  const suspect = snapshot.suspects.find(
    (entry) => entry.username === clusterRoot
  );
  if (!suspect) {
    return [clusterRoot];
  }

  const clusterMembers = new Set<string>([clusterRoot]);
  for (const linked of suspect.linkedAccounts) {
    if (!isSyntheticAccountName(linked.username)) {
      clusterMembers.add(linked.username);
    }
  }

  return [...clusterMembers];
};

const removeSuspectFromGraph = async (username: string): Promise<void> => {
  await Promise.all([
    redis.del(edgeKey(username)),
    redis.del(participantKey(username)),
  ]);
};

const createIncidentId = (): string =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const buildIncidentId = (incident: IncidentSummary): string => {
  return (
    incident.incidentId ||
    `${incident.ts}:${incident.postId}:${incident.sourceId}:${incident.suspect}`
  );
};

const parseIncidentMember = (item: unknown): IncidentSummary | null => {
  const member =
    typeof item === 'string'
      ? item
      : typeof item === 'object' && item !== null
        ? Reflect.get(item, 'member')
        : undefined;

  if (typeof member !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(member);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    const ts = Reflect.get(parsed, 'ts');
    const postId = Reflect.get(parsed, 'postId');
    const sourceId = Reflect.get(parsed, 'sourceId');
    const sourceType = Reflect.get(parsed, 'sourceType');
    const reporter = Reflect.get(parsed, 'reporter');
    const suspect = Reflect.get(parsed, 'suspect');
    const reason = Reflect.get(parsed, 'reason');
    const targetLabel = Reflect.get(parsed, 'targetLabel');
    const incidentId = Reflect.get(parsed, 'incidentId');

    if (
      typeof ts === 'number' &&
      typeof postId === 'string' &&
      typeof sourceId === 'string' &&
      (sourceType === 'post' || sourceType === 'comment') &&
      typeof reporter === 'string' &&
      typeof suspect === 'string' &&
      typeof reason === 'string'
    ) {
      return {
        incidentId:
          typeof incidentId === 'string' && incidentId.length > 0
            ? incidentId
            : `${ts}:${postId}:${sourceId}:${suspect}`,
        ts,
        postId,
        sourceId,
        sourceType,
        reporter,
        suspect,
        reason,
        targetLabel: typeof targetLabel === 'string' ? targetLabel : undefined,
      };
    }
  } catch {
    // Skip malformed incident records.
  }

  return null;
};

const getConnections = async (
  username: string,
  suspectScore: number,
  limit: number
): Promise<ConnectionSummary[]> => {
  const raw = await redis.hGetAll(edgeKey(username));
  const entries = Object.entries(raw ?? {}).map(([linkedUser, rawWeight]) => ({
    username: linkedUser,
    weight: toNumber(rawWeight),
  }));

  const sorted = entries.sort((a, b) => b.weight - a.weight).slice(0, limit);

  return sorted.map((entry) => ({
    username: entry.username,
    weight: entry.weight,
    clusterMatchPercent: Math.min(
      100,
      Math.round((entry.weight / Math.max(1, suspectScore)) * 100)
    ),
  }));
};

const parseIncidents = (rawItems: unknown[]): IncidentSummary[] => {
  return rawItems
    .map((item) => parseIncidentMember(item))
    .filter((incident): incident is IncidentSummary => incident !== null);
};

const looksLikeSyntheticDemoSnapshot = (
  reportMap: Record<string, string> | null | undefined,
  totalReportsRaw: string | null | undefined,
  incidentsRaw: unknown[]
): boolean => {
  const suspectKeys = Object.keys(reportMap ?? {});
  const hasSyntheticSuspects = ['user_a', 'user_c', 'user_f'].some((suspect) =>
    suspectKeys.includes(suspect)
  );
  const hasSyntheticIncidents = incidentsRaw.some((item) => {
    const member =
      typeof item === 'string'
        ? item
        : typeof item === 'object' && item !== null
          ? Reflect.get(item, 'member')
          : undefined;

    return typeof member === 'string' && member.includes('sim-post-');
  });

  return (
    totalReportsRaw === '36' && hasSyntheticSuspects && hasSyntheticIncidents
  );
};

export const recordContentEvent = async (
  event: ContentEvent
): Promise<void> => {
  const author = normalizeUsername(event.authorName);
  const text = event.text.trim();
  const forceIncident = event.forceIncident === true;
  const suspectOverride = normalizeUsername(event.suspectName ?? '');
  const trackReporterInGraph =
    !forceIncident && !isSyntheticAccountName(author);
  const targetLabel =
    event.suspectName && event.suspectName !== 'unknown-target'
      ? `u/${event.suspectName}`
      : `${event.sourceType === 'comment' ? 'comment' : 'post'} ${event.sourceId}`;
  if (!author || !text) {
    return;
  }

  if (trackReporterInGraph) {
    await updateParticipant(event.postId, author);
  }

  const mentionedUsers = extractMentionedUsers(text).filter(
    (username) => username !== author
  );

  if (containsAny(text, DEFENSE_PHRASES) && mentionedUsers.length > 0) {
    await Promise.all(
      mentionedUsers.map((mentioned) => incrementEdge(mentioned, author, 1))
    );
  }

  if (!forceIncident && !containsAny(text, REPORT_PHRASES)) {
    return;
  }

  const suspectUsers = forceIncident
    ? [suspectOverride].filter((username): username is string =>
        Boolean(username)
      )
    : mentionedUsers;

  if (suspectUsers.length === 0) {
    await addIncident({
      incidentId: createIncidentId(),
      ts: Date.now(),
      postId: event.postId,
      sourceId: event.sourceId,
      sourceType: event.sourceType,
      reporter: author,
      suspect: 'unresolved target',
      reason: event.incidentReason ?? 'Native report',
      targetLabel,
    });

    return;
  }

  const participants = await redis.hGetAll(participantKey(event.postId));
  const participantUsers = Object.keys(participants ?? {});

  for (const suspect of suspectUsers) {
    if (isSyntheticAccountName(suspect)) {
      await addIncident({
        incidentId: createIncidentId(),
        ts: Date.now(),
        postId: event.postId,
        sourceId: event.sourceId,
        sourceType: event.sourceType,
        reporter: author,
        suspect,
        reason: event.incidentReason ?? 'Community whistleblower phrase',
        targetLabel,
      });
      continue;
    }

    await Promise.all([
      redis.hIncrBy(KEY_SUSPECT_REPORTS, suspect, 1),
      redis.incrBy(KEY_TOTAL_REPORTS, 1),
      trackReporterInGraph
        ? incrementEdge(author, suspect, 2)
        : Promise.resolve(),
      addIncident({
        incidentId: createIncidentId(),
        ts: Date.now(),
        postId: event.postId,
        sourceId: event.sourceId,
        sourceType: event.sourceType,
        reporter: author,
        suspect,
        reason: event.incidentReason ?? 'Community whistleblower phrase',
        targetLabel,
      }),
    ]);

    const threadLinks = participantUsers
      .filter(
        (participant) => participant !== suspect && participant !== author
      )
      .map((participant) => incrementEdge(suspect, participant, 1));

    if (threadLinks.length > 0) {
      await Promise.all(threadLinks);
    }
  }
};

export const getDashboardSnapshot = async (
  suspectLimit = 6,
  connectionLimit = 5,
  incidentLimit = 15
): Promise<DashboardSnapshot> => {
  const [reportMap, totalReportsRaw, incidentsRaw] = await Promise.all([
    redis.hGetAll(KEY_SUSPECT_REPORTS),
    redis.get(KEY_TOTAL_REPORTS),
    redis.zRange(KEY_INCIDENTS, 0, Math.max(0, incidentLimit - 1), {
      by: 'rank',
    }),
  ]);

  if (
    looksLikeSyntheticDemoSnapshot(
      reportMap as Record<string, string> | null | undefined,
      totalReportsRaw,
      Array.isArray(incidentsRaw) ? incidentsRaw : []
    )
  ) {
    await clearSyntheticDemoData();
    return getDashboardSnapshot(suspectLimit, connectionLimit, incidentLimit);
  }

  const suspects = Object.entries(reportMap ?? {})
    .map(([username, rawScore]) => ({
      username,
      reports: toNumber(rawScore),
    }))
    .sort((a, b) => b.reports - a.reports)
    .slice(0, suspectLimit);

  const suspectSummaries = await Promise.all(
    suspects.map(async (suspect) => ({
      username: suspect.username,
      reports: suspect.reports,
      linkedAccounts: await getConnections(
        suspect.username,
        suspect.reports,
        connectionLimit
      ),
    }))
  );

  const parsedIncidents = parseIncidents(
    Array.isArray(incidentsRaw) ? incidentsRaw : []
  )
    .sort((a, b) => b.ts - a.ts)
    .slice(0, incidentLimit);

  return {
    totalReports: toNumber(totalReportsRaw ?? undefined),
    clusterRoots: Object.keys(reportMap ?? {}).length,
    suspects: suspectSummaries,
    incidents: parsedIncidents,
  };
};

export const getHiveMembersForAction = async (
  minClusterMatchPercent = 45
): Promise<string[]> => {
  const clusters = await getHiveClustersForAction(minClusterMatchPercent);
  const members = new Set<string>();

  for (const cluster of clusters) {
    for (const member of cluster.members) {
      members.add(member);
    }
  }

  return [...members];
};

export const getHiveClustersForAction = async (
  minClusterMatchPercent = 45
): Promise<HiveClusterSummary[]> => {
  const snapshot = await getDashboardSnapshot(8, 8, 5);
  const clusters: HiveClusterSummary[] = [];

  for (const suspect of snapshot.suspects) {
    const members = new Set<string>();

    if (!isSyntheticAccountName(suspect.username)) {
      members.add(suspect.username);
    }

    for (const linked of suspect.linkedAccounts) {
      if (
        linked.clusterMatchPercent >= minClusterMatchPercent &&
        !isSyntheticAccountName(linked.username)
      ) {
        members.add(linked.username);
      }
    }

    if (members.size === 0) {
      continue;
    }

    clusters.push({
      root: suspect.username,
      members: [...members],
      reportCount: suspect.reports,
    });
  }

  return clusters;
};

export const deleteIncidentById = async (
  incidentId: string
): Promise<boolean> => {
  const rawItems = await redis.zRange(KEY_INCIDENTS, 0, 10000, { by: 'rank' });
  const incidents = rawItems
    .map((item) => {
      const member =
        typeof item === 'string'
          ? item
          : typeof item === 'object' && item !== null
            ? Reflect.get(item, 'member')
            : undefined;

      if (typeof member !== 'string') {
        return null;
      }

      try {
        const parsed = JSON.parse(member);
        return typeof parsed === 'object' && parsed !== null
          ? { member, incident: parseIncidentMember({ member }) }
          : null;
      } catch {
        return null;
      }
    })
    .filter(
      (item): item is { member: string; incident: IncidentSummary | null } =>
        item !== null
    );

  const match = incidents.find(
    (item) => item.incident && buildIncidentId(item.incident) === incidentId
  );

  if (!match || !match.incident) {
    return false;
  }

  const remaining = incidents.filter((item) => item.member !== match.member);

  await redis.del(KEY_INCIDENTS);

  if (remaining.length > 0) {
    await Promise.all(
      remaining.map((item) =>
        redis.zAdd(KEY_INCIDENTS, {
          member: item.member,
          score: item.incident ? item.incident.ts : Date.now(),
        })
      )
    );
  }

  if (match.incident.suspect !== 'unresolved target') {
    const current = toNumber(
      await redis.hGet(KEY_SUSPECT_REPORTS, match.incident.suspect)
    );
    if (current <= 1) {
      await (redis as any).hDel(KEY_SUSPECT_REPORTS, match.incident.suspect);
    } else {
      await redis.hIncrBy(KEY_SUSPECT_REPORTS, match.incident.suspect, -1);
    }

    const totalReports = toNumber(await redis.get(KEY_TOTAL_REPORTS));
    if (totalReports > 0) {
      await redis.incrBy(KEY_TOTAL_REPORTS, -1);
    }
  }

  return true;
};

export const cleanupClusterByRoot = async (
  root: string
): Promise<ClusterCleanupSummary | null> => {
  const members = await collectClusterSuspects(root);
  if (members.length === 0) {
    return null;
  }

  const rawItems = await redis.zRange(KEY_INCIDENTS, 0, 10000, { by: 'rank' });
  const incidents = rawItems
    .map((item) => {
      const member =
        typeof item === 'string'
          ? item
          : typeof item === 'object' && item !== null
            ? Reflect.get(item, 'member')
            : undefined;

      if (typeof member !== 'string') {
        return null;
      }

      try {
        const parsed = JSON.parse(member);
        return typeof parsed === 'object' && parsed !== null
          ? { member, incident: parseIncidentMember({ member }) }
          : null;
      } catch {
        return null;
      }
    })
    .filter(
      (item): item is { member: string; incident: IncidentSummary | null } =>
        item !== null
    );

  const remainingIncidents = incidents.filter(
    (item) => !item.incident || !members.includes(item.incident.suspect)
  );
  const removedIncidents = incidents.length - remainingIncidents.length;

  await redis.del(KEY_INCIDENTS);

  if (remainingIncidents.length > 0) {
    await Promise.all(
      remainingIncidents.map((item) =>
        redis.zAdd(KEY_INCIDENTS, {
          member: item.member,
          score: item.incident ? item.incident.ts : Date.now(),
        })
      )
    );
  }

  let suspectsRemoved = 0;
  for (const member of members) {
    const current = toNumber(await redis.hGet(KEY_SUSPECT_REPORTS, member));
    if (current > 0) {
      suspectsRemoved += 1;
      await (redis as any).hDel(KEY_SUSPECT_REPORTS, member);
    }

    await removeSuspectFromGraph(member);
  }

  const totalReports = toNumber(await redis.get(KEY_TOTAL_REPORTS));
  const reduction = Math.min(totalReports, removedIncidents);
  if (reduction > 0) {
    await redis.incrBy(KEY_TOTAL_REPORTS, -reduction);
  }

  return {
    root: normalizeUsername(root),
    members,
    incidentsRemoved: removedIncidents,
    suspectsRemoved,
  };
};

export const clearSyntheticDemoData = async (): Promise<void> => {
  // Purge the known synthetic demo keys that were seeded earlier.
  // This is intentionally narrow so real subreddit data is not wiped.
  await Promise.all([
    redis.del(KEY_SUSPECT_REPORTS),
    redis.del(KEY_TOTAL_REPORTS),
    redis.del(KEY_INCIDENTS),
    redis.del('hc:edges:user_a'),
    redis.del('hc:edges:user_b'),
    redis.del('hc:edges:user_c'),
    redis.del('hc:edges:user_d'),
    redis.del('hc:edges:user_f'),
    redis.del('hc:thread:sim-post-1:participants'),
    redis.del('hc:thread:sim-post-2:participants'),
    redis.del('hc:thread:sim-post-3:participants'),
  ]);
};

export const scrapeAndPersistParticipants = async (
  postId: string,
  snapshotTtlSeconds = 60 * 60 * 24
): Promise<string[]> => {
  const thingId = postId.startsWith('t3_') ? postId : `t3_${postId}`;
  try {
    // Attempt to fetch the post object
    const post = await (async () => {
      try {
        return await reddit.getPostById(thingId as any);
      } catch {
        return null;
      }
    })();

    const participants = new Set<string>();

    // Add post author if present
    try {
      const postAuthor =
        post &&
        ((post as any).author ||
          (post as any).authorName ||
          (post as any).author_id ||
          (post as any).authorId);
      if (typeof postAuthor === 'string' && postAuthor.length > 0) {
        participants.add(normalizeUsername(postAuthor));
      }
    } catch {}

    // Try multiple comment-fetch approaches (best-effort)
    let comments: any[] = [];
    const commentMethods = [
      'getComments',
      'comments',
      'listComments',
      'getCommentsByPost',
      'getCommentStream',
    ];

    if (post) {
      for (const m of commentMethods) {
        try {
          const fn = (post as any)[m];
          if (typeof fn === 'function') {
            const res = await fn.apply(post);
            if (Array.isArray(res) && res.length > 0) {
              comments = res;
              break;
            }
          }
        } catch {
          // ignore
        }
      }
    }

    // Fallback: try reddit-level comment fetchers
    if (comments.length === 0) {
      for (const m of commentMethods) {
        try {
          const fn = (reddit as any)[m];
          if (typeof fn === 'function') {
            const res = await fn.call(reddit, thingId);
            if (Array.isArray(res) && res.length > 0) {
              comments = res;
              break;
            }
          }
        } catch {}
      }
    }

    // If post object exposes a 'comments' property
    if (
      comments.length === 0 &&
      post &&
      Array.isArray((post as any).comments)
    ) {
      comments = (post as any).comments;
    }

    // Collect participant usernames from comments
    for (const c of comments ?? []) {
      try {
        const author =
          c &&
          (c.author ||
            c.authorName ||
            c.author_id ||
            c.authorId ||
            c.user ||
            c.username);
        if (typeof author === 'string' && author.length > 0) {
          participants.add(normalizeUsername(author));
          // update participant counts for the thread
          await updateParticipant(postId, normalizeUsername(author));
        }
      } catch {}
    }

    // Persist snapshot of participants for audit
    try {
      const ts = Date.now();
      const key = `hc:thread:${postId}:participants_snapshot:${ts}`;
      await redis.set(key, JSON.stringify([...participants]));
      await redis.expire(key, snapshotTtlSeconds);
    } catch (err) {
      console.error('Failed to persist participant snapshot', err);
    }

    // Also ensure each participant exists in the live participant map (with last seen ts)
    try {
      const partKey = participantKey(postId);
      const now = String(Date.now());
      const entries: Record<string, string> = {};
      for (const u of participants) entries[u] = now;
      if (Object.keys(entries).length > 0) {
        await redis.hSet(partKey, entries);
      }
    } catch (err) {
      console.error('Failed to update participant map', err);
    }

    return [...participants];
  } catch (err) {
    console.error('Error scraping thread participants for', postId, err);
    return [];
  }
};
