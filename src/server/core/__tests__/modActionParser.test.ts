import { describe, it, expect } from 'vitest';
import { parseModAction } from '../modActionParser';

describe('parseModAction', () => {
  it('ignores non-report mod action', () => {
    const payload = {
      action: 'dev_platform_app_changed',
      moderator: { name: 'Prestigious-Bison656' },
    };

    const parsed = parseModAction(payload as any);
    expect(parsed.isReport).toBe(false);
    expect(parsed.targetId).toBe('');
  });

  it('parses a report with targetPost.numReports', () => {
    const payload = {
      action: 'ModAction',
      targetPost: { id: 't3_abc123', numReports: 2 },
      actor: { name: 'watchdog_1' },
    };

    const parsed = parseModAction(payload as any);
    expect(parsed.isReport).toBe(true);
    expect(parsed.targetId).toBe('abc123');
    expect(parsed.reporter).toBe('watchdog_1');
    expect(parsed.sourceType).toBe('post');
  });

  it('parses a report when report fields present', () => {
    const payload = {
      report: true,
      targetComment: { id: 't1_c1', numReports: 1 },
      reporter: 'watchdog_2',
    };

    const parsed = parseModAction(payload as any);
    expect(parsed.isReport).toBe(true);
    expect(parsed.targetId).toBe('c1');
    expect(parsed.reporter).toBe('watchdog_2');
    expect(parsed.sourceType).toBe('comment');
  });
});
