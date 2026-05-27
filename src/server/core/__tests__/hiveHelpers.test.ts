import { describe, it, expect } from 'vitest';
import { normalizeUsername, extractMentionedUsers, containsAny } from '../hive';

describe('hive helpers', () => {
  it('normalizeUsername strips prefixes and invalid chars', () => {
    expect(normalizeUsername('u/SomeUser')).toBe('someuser');
    expect(normalizeUsername('/u/Another-User')).toBe('another-user');
    expect(normalizeUsername('@bad!name')).toBe('badname');
  });

  it('extractMentionedUsers finds u/ and @ mentions', () => {
    const text = 'This mentions u/user_a and @user_b and /u/user_c.';
    const users = extractMentionedUsers(text);
    expect(users).toEqual(
      expect.arrayContaining(['user_a', 'user_b', 'user_c'])
    );
  });

  it('containsAny detects report phrases and defense phrases', () => {
    expect(containsAny('This is a scam ring', ['!scam', 'scam ring'])).toBe(
      true
    );
    expect(
      containsAny('This is coordinated abuse', ['coordinated abuse'])
    ).toBe(true);
    expect(containsAny('not a scam, trusted seller', ['not a scam'])).toBe(
      true
    );
    expect(containsAny('nothing here', ['!report'])).toBe(false);
  });
});
