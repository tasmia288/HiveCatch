import { Hono } from 'hono';
import { redis, reddit } from '@devvit/web/server';
import { parseModAction } from '../core/modActionParser';
import { scrapeAndPersistParticipants } from '../core/hive';
import type {
  OnCommentSubmitRequest,
  OnPostSubmitRequest,
  TriggerResponse,
} from '@devvit/web/shared';
import { recordContentEvent } from '../core/hive';

export const triggers = new Hono();

const readStringField = (value: unknown, key: string): string => {
  if (typeof value !== 'object' || value === null) {
    return '';
  }

  const field = Reflect.get(value, key);
  return typeof field === 'string' ? field : '';
};

const normalizeThingId = (value: string | undefined): string => {
  if (!value) {
    return '';
  }

  return value.startsWith('t3_') || value.startsWith('t1_')
    ? value.slice(3)
    : value;
};

const readAnyStringField = (value: unknown, keys: string[]): string => {
  if (typeof value !== 'object' || value === null) {
    return '';
  }

  for (const key of keys) {
    const field = Reflect.get(value, key);
    if (typeof field === 'string' && field.length > 0) {
      return field;
    }
  }

  return '';
};

const getReportedContent = (input: unknown): Record<string, unknown> => {
  if (typeof input !== 'object' || input === null) {
    return {};
  }

  const post = Reflect.get(input, 'post');
  if (post && typeof post === 'object') {
    return post as Record<string, unknown>;
  }

  const comment = Reflect.get(input, 'comment');
  if (comment && typeof comment === 'object') {
    return comment as Record<string, unknown>;
  }

  return {};
};

const getReportedContentType = (
  input: unknown,
  fallback: 'post' | 'comment'
): 'post' | 'comment' => {
  if (typeof input !== 'object' || input === null) {
    return fallback;
  }

  const post = Reflect.get(input, 'post');
  if (post && typeof post === 'object') {
    return 'post';
  }

  const comment = Reflect.get(input, 'comment');
  if (comment && typeof comment === 'object') {
    return 'comment';
  }

  return fallback;
};

const resolveReportedAuthor = (content: Record<string, unknown>): string => {
  return (
    readAnyStringField(content, [
      'author',
      'authorName',
      'author_name',
      'username',
      'user',
    ]) || ''
  );
};

const recordNativeReport = async (
  input: unknown,
  fallbackType: 'post' | 'comment'
): Promise<void> => {
  const content = getReportedContent(input);
  const reportedType = getReportedContentType(input, fallbackType);
  const targetId = normalizeThingId(
    readAnyStringField(content, [
      'id',
      'postId',
      'linkId',
      'thingId',
      'fullname',
    ])
  );
  const reporterName =
    readAnyStringField(input, ['reporter', 'user']) || 'reporter';
  const reason =
    readAnyStringField(input, ['reason', 'reportReason']) || 'Native report';
  const suspectName = resolveReportedAuthor(content);

  if (targetId) {
    try {
      await scrapeAndPersistParticipants(targetId);
    } catch (err) {
      console.error(
        'Failed to scrape participants before recording report',
        err
      );
    }
  }

  await recordContentEvent({
    postId: targetId || `report-${Date.now()}`,
    sourceId: targetId || `report-${Date.now()}`,
    sourceType: reportedType,
    authorName: reporterName,
    text: reason,
    incidentReason: reason,
    forceIncident: true,
    suspectName: suspectName || null,
  });
};

const resolveTargetAuthor = async (
  parsed: ReturnType<typeof parseModAction>
): Promise<string | null> => {
  if (parsed.targetAuthor) {
    return parsed.targetAuthor;
  }

  const thingId = parsed.targetId
    ? parsed.targetId.startsWith('t3_') || parsed.targetId.startsWith('t1_')
      ? parsed.targetId
      : parsed.sourceType === 'comment'
        ? `t1_${parsed.targetId}`
        : `t3_${parsed.targetId}`
    : '';

  if (!thingId) {
    return null;
  }

  try {
    if (parsed.sourceType === 'comment') {
      const commentResult = await (reddit as any).getCommentById?.(thingId);
      const author =
        commentResult?.author ||
        commentResult?.authorName ||
        commentResult?.user ||
        commentResult?.username;
      return typeof author === 'string' && author.length > 0 ? author : null;
    }

    const postResult = await (reddit as any).getPostById?.(thingId);
    const author =
      postResult?.author ||
      postResult?.authorName ||
      postResult?.user ||
      postResult?.username;
    return typeof author === 'string' && author.length > 0 ? author : null;
  } catch {
    return null;
  }
};

triggers.post('/on-comment-submit', async (c) => {
  try {
    const input = await c.req.json<OnCommentSubmitRequest>();
    const comment = input.comment;
    const author = input.author;

    if (!comment || !author) {
      return c.json<TriggerResponse>(
        {
          status: 'error',
          message: 'Invalid comment trigger payload',
        },
        400
      );
    }

    const body = comment.body ?? '';
    const authorName = author.name ?? '';
    const postId = normalizeThingId(
      comment.postId ?? readStringField(comment, 'linkId')
    );
    const sourceId = normalizeThingId(comment.id);

    if (postId && sourceId && authorName && body) {
      await recordContentEvent({
        postId,
        sourceId,
        sourceType: 'comment',
        authorName,
        text: body,
      });
    }

    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: 'Comment trigger processed',
      },
      200
    );
  } catch (error) {
    console.error('Error in on-comment-submit trigger:', error);
    return c.json<TriggerResponse>(
      {
        status: 'error',
        message: 'Failed to process comment trigger',
      },
      400
    );
  }
});

triggers.post('/on-post-submit', async (c) => {
  try {
    const input = await c.req.json<OnPostSubmitRequest>();
    const post = input.post;
    const author = input.author;

    if (!post || !author) {
      return c.json<TriggerResponse>(
        {
          status: 'error',
          message: 'Invalid post trigger payload',
        },
        400
      );
    }

    const title = readStringField(post, 'title');
    const bodyText =
      readStringField(post, 'body') || readStringField(post, 'selftext');
    const authorName = author.name ?? '';
    const postId = normalizeThingId(post.id);
    const combinedText = `${title}\n${bodyText}`.trim();

    if (postId && authorName && combinedText) {
      await recordContentEvent({
        postId,
        sourceId: postId,
        sourceType: 'post',
        authorName,
        text: combinedText,
      });
    }

    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: 'Post trigger processed',
      },
      200
    );
  } catch (error) {
    console.error('Error in on-post-submit trigger:', error);
    return c.json<TriggerResponse>(
      {
        status: 'error',
        message: 'Failed to process post trigger',
      },
      400
    );
  }
});

triggers.post('/on-mod-action', async (c) => {
  try {
    const input = await c.req.json<any>();
    console.log('on-mod-action payload:', JSON.stringify(input));

    const parsed = parseModAction(input);

    if (!parsed.isReport) {
      console.log('on-mod-action ignored: not a report-like action', parsed);
      return c.json<TriggerResponse>(
        { status: 'success', message: 'Mod action ignored (not a report)' },
        200
      );
    }

    const resolvedTargetId = parsed.targetId || `mod-action-${Date.now()}`;
    const suspectName =
      (await resolveTargetAuthor(parsed)) ||
      parsed.targetId ||
      'unknown-target';

    if (parsed.targetId) {
      // Scrape the thread immediately to capture participants (helps with fast-deletes)
      try {
        await scrapeAndPersistParticipants(parsed.targetId);
      } catch (err) {
        console.error(
          'Failed to scrape participants before recording report',
          err
        );
      }
    }

    await recordContentEvent({
      postId: resolvedTargetId,
      sourceId: resolvedTargetId,
      sourceType: (parsed.sourceType ?? 'post') as 'comment' | 'post',
      authorName: parsed.reporter ?? 'reporter',
      text: parsed.reason ?? 'Native report',
      forceIncident: true,
      suspectName,
    });
    console.log(
      `Recorded native report for ${resolvedTargetId} by ${parsed.reporter} targeting ${suspectName}`
    );

    // Store raw mod-action payload to Redis for later inspection (debug only)
    try {
      await redis.zAdd('hc:mod_actions', {
        member: JSON.stringify({ ts: Date.now(), payload: input }),
        score: Date.now(),
      });
    } catch (err) {
      console.error('Failed to persist mod-action payload to Redis:', err);
    }

    return c.json<TriggerResponse>(
      { status: 'success', message: 'Mod action processed' },
      200
    );
  } catch (error) {
    console.error('Error in on-mod-action trigger:', error);
    return c.json<TriggerResponse>(
      { status: 'error', message: 'Failed to process mod action' },
      400
    );
  }
});

triggers.post('/on-post-report', async (c) => {
  try {
    const input = await c.req.json<any>();
    console.log('on-post-report payload:', JSON.stringify(input));

    // Persist raw report payload for debugging (same store as mod-actions)
    try {
      await redis.zAdd('hc:mod_actions', {
        member: JSON.stringify({ ts: Date.now(), payload: input }),
        score: Date.now(),
      });
    } catch (err) {
      console.error('Failed to persist post-report payload to Redis:', err);
    }

    await recordNativeReport(input, 'post');

    return c.json<TriggerResponse>(
      { status: 'success', message: 'Post report processed' },
      200
    );
  } catch (error) {
    console.error('Error in on-post-report trigger:', error);
    return c.json<TriggerResponse>(
      { status: 'error', message: 'Failed to process post report' },
      400
    );
  }
});

triggers.post('/on-comment-report', async (c) => {
  try {
    const input = await c.req.json<any>();
    console.log('on-comment-report payload:', JSON.stringify(input));

    // Persist raw report payload for debugging (same store as mod-actions)
    try {
      await redis.zAdd('hc:mod_actions', {
        member: JSON.stringify({ ts: Date.now(), payload: input }),
        score: Date.now(),
      });
    } catch (err) {
      console.error('Failed to persist comment-report payload to Redis:', err);
    }

    await recordNativeReport(input, 'comment');

    return c.json<TriggerResponse>(
      { status: 'success', message: 'Comment report processed' },
      200
    );
  } catch (error) {
    console.error('Error in on-comment-report trigger:', error);
    return c.json<TriggerResponse>(
      { status: 'error', message: 'Failed to process comment report' },
      400
    );
  }
});
