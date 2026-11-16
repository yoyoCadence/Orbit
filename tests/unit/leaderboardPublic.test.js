// @vitest-environment jsdom
/**
 * PRO-014E2: the public-name rule, the get_leaderboard() read, its cache, and
 * the display_name / is_public write.
 *
 * The rule must refuse exactly what profiles_display_name_check (migration 018)
 * refuses: a name the client accepts but the server rejects only shows a
 * generic error, and a name the client refuses but the server accepts locks a
 * user out. The parity block reads the ranges out of 018 itself.
 *
 * Invisible characters are built with String.fromCodePoint so none sit in this
 * file as literals.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRpc = vi.hoisted(() => vi.fn());
const mockSingle = vi.hoisted(() => vi.fn());
const mockQuery = vi.hoisted(() => ({}));
const mockFrom = vi.hoisted(() => vi.fn(() => mockQuery));

vi.mock('../../pwa/js/supabase.js', () => ({
  supabase: { rpc: mockRpc, from: mockFrom },
}));

import {
  DISPLAY_NAME_EDGE,
  DISPLAY_NAME_FORBIDDEN,
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MESSAGES,
  LEADERBOARD_CACHE_V2_KEY,
  clearLeaderboardCacheV2,
  displayNameProblem,
  leaderboardCacheGeneration,
  fetchLeaderboardRows,
  isNameRuleViolation,
  readLeaderboardCacheV2,
  savePublicSettings,
  writeLeaderboardCacheV2,
} from '../../pwa/js/leaderboardPublic.js';

const cp = (...points) => String.fromCodePoint(...points);

// ─── Parity with migration 018 ────────────────────────────────────────────────

const BS = String.fromCharCode(92);
// A path, not a URL object: under jsdom the global URL is not Node's.
const sql018 = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'pwa', 'db', '018_leaderboard_display_name.sql'),
  'utf8',
);
const check = sql018.slice(sql018.indexOf('ADD CONSTRAINT profiles_display_name_check'));

/** Ranges of a PostgreSQL bracket expression written with \u / \U escapes. */
function parseClass(body) {
  const atoms = [];
  for (let i = 0; i < body.length;) {
    if (body[i] === BS && body[i + 1] === 'u') {
      atoms.push(parseInt(body.slice(i + 2, i + 6), 16));
      i += 6;
    } else if (body[i] === BS && body[i + 1] === 'U') {
      atoms.push(parseInt(body.slice(i + 2, i + 10), 16));
      i += 10;
    } else if (body[i] === '-') {
      atoms.push('-');
      i += 1;
    } else {
      const point = body.codePointAt(i);
      atoms.push(point);
      i += String.fromCodePoint(point).length;
    }
  }
  const ranges = [];
  for (let k = 0; k < atoms.length; k += 1) {
    if (atoms[k + 1] === '-') {
      ranges.push([atoms[k], atoms[k + 2]]);
      k += 2;
    } else {
      ranges.push([atoms[k], atoms[k]]);
    }
  }
  return ranges;
}

function classAfter(prefix) {
  const start = check.indexOf(prefix);
  expect(start, prefix).toBeGreaterThan(-1);
  const open = start + prefix.length;
  const close = check.indexOf(']', open);
  return check.slice(open, close);
}

describe('display-name rule matches profiles_display_name_check (018)', () => {
  it('has the same length bound', () => {
    expect(check).toContain(`char_length(display_name) BETWEEN 1 AND ${DISPLAY_NAME_MAX}`);
    expect(DISPLAY_NAME_MAX).toBe(20);
  });

  it('refuses the same code points anywhere in the name', () => {
    expect(parseClass(classAfter("display_name !~ '["))).toEqual(DISPLAY_NAME_FORBIDDEN.map(r => [...r]));
  });

  it('uses the same edge class at the start and before a trailing space', () => {
    const start = parseClass(classAfter("display_name !~ '^["));
    expect(start[0]).toEqual([0x20, 0x20]);
    expect(start.slice(1)).toEqual(DISPLAY_NAME_EDGE.map(r => [...r]));
    const end = parseClass(classAfter("display_name !~ ' ["));
    expect(end).toEqual(DISPLAY_NAME_EDGE.map(r => [...r]));
    expect(check).toMatch(new RegExp(`display_name !~ ' ${BS}[[^${BS}]]*${BS}]${BS}*${BS}$'`));
  });

  it('has a message for every problem it can report', () => {
    for (const problem of ['empty', 'too_long', 'forbidden', 'edge', 'server', 'network']) {
      expect(DISPLAY_NAME_MESSAGES[problem], problem).toBeTruthy();
    }
  });
});

// ─── displayNameProblem ───────────────────────────────────────────────────────

describe('displayNameProblem', () => {
  it.each([
    ['plain name', 'Bob'],
    ['Chinese', '慢慢來的阿明'],
    ['inner spaces', 'Night Owl 42'],
    ['20 letters', 'a'.repeat(20)],
    ['20 characters outside the BMP (40 UTF-16 units)', '🐢'.repeat(20)],
    ['emoji with a variation selector', cp(0x2764, 0xfe0f)],
    ['England flag (tag sequence)', cp(0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f)],
    ['a tag character between letters', `A${cp(0xe0020)}B`],
    ['a space followed by a selector and a letter', `A ${cp(0xfe0f)}B`],
    ['hyphen and punctuation', "Mr. O'Neil-Smith!"],
  ])('accepts %s', (_label, name) => {
    expect(displayNameProblem(name)).toBeNull();
  });

  it.each([
    [null], [undefined], [''], [42],
  ])('reports empty for %j', value => {
    expect(displayNameProblem(value)).toBe('empty');
  });

  it('counts code points, not UTF-16 units', () => {
    expect(displayNameProblem('a'.repeat(21))).toBe('too_long');
    expect(displayNameProblem('🐢'.repeat(21))).toBe('too_long');
  });

  it.each([
    ['tab', `A${cp(0x09)}B`],
    ['newline', `A${cp(0x0a)}B`],
    ['DEL', `A${cp(0x7f)}B`],
    ['no-break space', `A${cp(0xa0)}B`],
    ['soft hyphen', `A${cp(0xad)}B`],
    ['zero-width space', `A${cp(0x200b)}B`],
    ['right-to-left override', `A${cp(0x202e)}B`],
    ['ideographic space', `A${cp(0x3000)}B`],
    ['Hangul filler', `A${cp(0x3164)}B`],
    ['byte order mark', `A${cp(0xfeff)}B`],
    ['Braille blank', `A${cp(0x2800)}B`],
    ['interlinear annotation', `A${cp(0xfff9)}B`],
    ['Egyptian format control', `A${cp(0x13430)}B`],
    ['shorthand format control', `A${cp(0x1bca0)}B`],
    ['musical symbol format control', `A${cp(0x1d173)}B`],
    ['unassigned tag-block code point', `A${cp(0xe0080)}B`],
    ['code point after the selectors', `A${cp(0xe01f0)}B`],
  ])('refuses a %s anywhere', (_label, name) => {
    expect(displayNameProblem(name)).toBe('forbidden');
  });

  it.each([
    ['a leading space', ' Bob'],
    ['a trailing space', 'Bob '],
    ['only a space', ' '],
    ['a leading variation selector', `${cp(0xfe0f)}Bob`],
    ['a leading tag character', `${cp(0xe0041)}Bob`],
    ['a leading variation selector supplement', `${cp(0xe0100)}Bob`],
    ['a trailing space hidden behind a selector', `Bob ${cp(0xfe0f)}`],
    ['a trailing space hidden behind tags', `Bob ${cp(0xe0041, 0xe007f)}`],
  ])('refuses %s', (_label, name) => {
    expect(displayNameProblem(name)).toBe('edge');
  });

  it('reports forbidden before edge, as the CHECK order does not matter but one message must win', () => {
    expect(displayNameProblem(` A${cp(0x200b)}`)).toBe('forbidden');
  });
});

// ─── fetchLeaderboardRows ─────────────────────────────────────────────────────

describe('fetchLeaderboardRows', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls get_leaderboard() and returns its rows', async () => {
    const rows = [{ display_name: 'Bob', is_me: false }];
    mockRpc.mockResolvedValueOnce({ data: rows, error: null });
    await expect(fetchLeaderboardRows()).resolves.toBe(rows);
    expect(mockRpc).toHaveBeenCalledWith('get_leaderboard');
  });

  it('returns no rows for a NULL result', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(fetchLeaderboardRows()).resolves.toEqual([]);
  });

  it('throws the RPC error', async () => {
    const error = { message: 'permission denied', code: '42501' };
    mockRpc.mockResolvedValueOnce({ data: null, error });
    await expect(fetchLeaderboardRows()).rejects.toBe(error);
  });
});

// ─── Cache ────────────────────────────────────────────────────────────────────

describe('leaderboard cache V2', () => {
  beforeEach(() => localStorage.clear());

  it('writes under its own key, with its owner, and drops the leaderboard_view cache', () => {
    localStorage.setItem('yoyo_leaderboardCache', '{"rows":[]}');
    writeLeaderboardCacheV2('me', [{ display_name: 'Bob', is_me: true }], '2026-11-13T00:00:00Z', '2026-11-13');
    expect(LEADERBOARD_CACHE_V2_KEY).toBe('yoyo_leaderboardCacheV2');
    expect(localStorage.getItem('yoyo_leaderboardCache')).toBeNull();
    expect(readLeaderboardCacheV2('me')).toEqual({
      ownerId: 'me',
      rows: [{ display_name: 'Bob', is_me: true }],
      refreshedAt: '2026-11-13T00:00:00Z',
      refreshDate: '2026-11-13',
    });
  });

  it('is read only by the account that wrote it (is_me is per caller)', () => {
    writeLeaderboardCacheV2('me', [{ display_name: 'Bob', is_me: true }], null, '2026-11-13');
    expect(readLeaderboardCacheV2('someone-else')).toBeNull();
    expect(readLeaderboardCacheV2(null)).toBeNull();
    expect(readLeaderboardCacheV2(undefined)).toBeNull();
  });

  it('writes nothing without an owner', () => {
    writeLeaderboardCacheV2(null, [{ display_name: 'Bob' }], null, '2026-11-13');
    expect(localStorage.getItem(LEADERBOARD_CACHE_V2_KEY)).toBeNull();
  });

  it('reads nothing from a missing, unreadable, malformed or ownerless cache', () => {
    expect(readLeaderboardCacheV2('me')).toBeNull();
    localStorage.setItem(LEADERBOARD_CACHE_V2_KEY, '{not json');
    expect(readLeaderboardCacheV2('me')).toBeNull();
    localStorage.setItem(LEADERBOARD_CACHE_V2_KEY, '{"ownerId":"me","rows":"nope"}');
    expect(readLeaderboardCacheV2('me')).toBeNull();
    localStorage.setItem(LEADERBOARD_CACHE_V2_KEY, '{"rows":[]}');
    expect(readLeaderboardCacheV2('me')).toBeNull();
  });

  it('clears, and moves the generation on so requests already out are not cached', () => {
    writeLeaderboardCacheV2('me', [], null, '2026-11-13');
    const before = leaderboardCacheGeneration();
    clearLeaderboardCacheV2();
    expect(localStorage.getItem(LEADERBOARD_CACHE_V2_KEY)).toBeNull();
    expect(leaderboardCacheGeneration()).toBe(before + 1);
  });

  it('survives storage that throws', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    try {
      expect(() => writeLeaderboardCacheV2('me', [], null, '2026-11-13')).not.toThrow();
    } finally {
      setItem.mockRestore();
    }
  });
});

// ─── savePublicSettings ───────────────────────────────────────────────────────

describe('savePublicSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.update = vi.fn(() => mockQuery);
    mockQuery.eq = vi.fn(() => mockQuery);
    mockQuery.select = vi.fn(() => mockQuery);
    mockQuery.single = mockSingle;
  });

  it("updates only the caller's row and only the fields given, and returns what the server stored", async () => {
    mockSingle.mockResolvedValueOnce({ data: { display_name: 'Night Owl', is_public: true }, error: null });
    await expect(savePublicSettings('me', { displayName: 'Night Owl', isPublic: true }))
      .resolves.toEqual({ displayName: 'Night Owl', isPublic: true });
    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockQuery.update).toHaveBeenCalledWith({ display_name: 'Night Owl', is_public: true });
    expect(mockQuery.eq).toHaveBeenCalledWith('user_id', 'me');
    expect(mockQuery.select).toHaveBeenCalledWith('display_name, is_public');
  });

  it('leaves the name alone when only leaving the leaderboard', async () => {
    mockSingle.mockResolvedValueOnce({ data: { display_name: 'Night Owl', is_public: false }, error: null });
    await expect(savePublicSettings('me', { isPublic: false }))
      .resolves.toEqual({ displayName: 'Night Owl', isPublic: false });
    expect(mockQuery.update).toHaveBeenCalledWith({ is_public: false });
  });

  it('leaves is_public alone when only renaming', async () => {
    mockSingle.mockResolvedValueOnce({ data: { display_name: 'Owl', is_public: true }, error: null });
    await savePublicSettings('me', { displayName: 'Owl' });
    expect(mockQuery.update).toHaveBeenCalledWith({ display_name: 'Owl' });
  });

  it('throws the server error, and recognises a CHECK violation', async () => {
    const error = { code: '23514', message: 'violates check constraint "profiles_display_name_check"' };
    mockSingle.mockResolvedValueOnce({ data: null, error });
    await expect(savePublicSettings('me', { displayName: 'x' })).rejects.toBe(error);
    expect(isNameRuleViolation(error)).toBe(true);
    expect(isNameRuleViolation({ code: 'PGRST116' })).toBe(false);
    expect(isNameRuleViolation(new TypeError('Failed to fetch'))).toBe(false);
    expect(isNameRuleViolation(undefined)).toBe(false);
  });
});
