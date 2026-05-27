export type ParsedModAction = {
  isReport: boolean;
  targetId: string;
  sourceType: 'post' | 'comment' | null;
  targetAuthor: string | null;
  reporter: string | null;
  reason: string | null;
  raw: unknown;
};

const readStringField = (value: unknown, key: string): string => {
  if (typeof value !== 'object' || value === null) return '';
  const field = Reflect.get(value, key);
  return typeof field === 'string' ? field : '';
};

const normalizeThingId = (value: string | undefined): string => {
  if (!value) return '';
  return value.startsWith('t3_') || value.startsWith('t1_')
    ? value.slice(3)
    : value;
};

const readAnyStringField = (value: unknown, keys: string[]): string => {
  if (typeof value !== 'object' || value === null) return '';

  for (const key of keys) {
    const field = Reflect.get(value, key);
    if (typeof field === 'string' && field.length > 0) {
      return field;
    }
  }

  return '';
};

export const parseModAction = (input: any): ParsedModAction => {
  const parsed: ParsedModAction = {
    isReport: false,
    targetId: '',
    sourceType: null,
    targetAuthor: null,
    reporter: null,
    reason: null,
    raw: input,
  };

  if (!input || typeof input !== 'object') return parsed;

  const rawAction = input.action || input.type || input.kind || '';
  const actionStr =
    typeof rawAction === 'string' ? rawAction.toLowerCase() : '';

  const targetPost =
    typeof input.targetPost === 'object' ? input.targetPost : undefined;
  const targetComment =
    typeof input.targetComment === 'object' ? input.targetComment : undefined;

  const hasReportCountOnTarget =
    (targetPost &&
      typeof targetPost.numReports === 'number' &&
      targetPost.numReports > 0) ||
    (targetComment &&
      typeof targetComment.numReports === 'number' &&
      targetComment.numReports > 0);

  const hasReportFields =
    !!input.report ||
    !!input.reported ||
    !!input.report_reason ||
    !!input.reportReason ||
    (typeof input === 'object' &&
      Object.keys(input).some((k) => k.toLowerCase().includes('report')));

  parsed.isReport =
    hasReportCountOnTarget || actionStr.includes('report') || hasReportFields;

  // Determine target id
  if (typeof input.targetId === 'string') {
    parsed.targetId = normalizeThingId(input.targetId);
  } else if (input.target && typeof input.target === 'object') {
    parsed.targetId = normalizeThingId(
      readStringField(input.target, 'id') ||
        readStringField(input.target, 'postId') ||
        readStringField(input.target, 'linkId') ||
        readStringField(input.target, 'thingId') ||
        readStringField(input.target, 'fullname') ||
        readStringField(input.target, 'reportedThingId')
    );
  } else if (targetPost && typeof targetPost.id === 'string') {
    parsed.targetId = normalizeThingId(targetPost.id);
  } else if (targetComment && typeof targetComment.id === 'string') {
    parsed.targetId = normalizeThingId(targetComment.id);
  } else if (typeof input.postId === 'string') {
    parsed.targetId = normalizeThingId(input.postId);
  } else {
    parsed.targetId = normalizeThingId(
      readAnyStringField(input, [
        'itemId',
        'thingId',
        'contentId',
        'reportedThingId',
        'targetThingId',
        'fullname',
        'id',
      ])
    );
  }

  parsed.sourceType = targetComment
    ? 'comment'
    : targetPost
      ? 'post'
      : parsed.targetId
        ? 'post'
        : null;

  parsed.targetAuthor =
    readStringField(input, 'targetAuthor') ||
    readStringField(input, 'author') ||
    readStringField(input, 'authorName') ||
    readStringField(input, 'author_name') ||
    readStringField(targetPost, 'author') ||
    readStringField(targetPost, 'authorName') ||
    readStringField(targetPost, 'author_name') ||
    readStringField(targetComment, 'author') ||
    readStringField(targetComment, 'authorName') ||
    readStringField(targetComment, 'author_name') ||
    readStringField(input.target, 'author') ||
    readStringField(input.target, 'authorName') ||
    readStringField(input.target, 'author_name') ||
    null;

  parsed.reporter =
    readStringField(input, 'reporter') ||
    readStringField(input, 'user') ||
    (input.actor && input.actor.name) ||
    null;
  parsed.reason =
    readStringField(input, 'reason') ||
    readStringField(input, 'report_reason') ||
    readStringField(input, 'reportReason') ||
    null;

  return parsed;
};
