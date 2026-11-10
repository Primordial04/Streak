// test/logic.test.js - Unit tests for Streakline logic using node:test
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  pad, ymd, toD, addDays, TODAY, safeId, isValidId, esc,
  normalizeHabit, normalizeProfile, normalizeState,
  isHabitScheduled, getDayStatus, calculateStreaks, getHabitStats, calculateWeeklyReview
} from '../logic.js';

test('ID validation and sanitization', () => {
  assert.equal(isValidId('h123'), true);
  assert.equal(isValidId('user_alpha-1'), true);
  assert.equal(isValidId('x onmouseover=alert(1)'), false);
  assert.equal(isValidId('<script>'), false);

  const safe = safeId('bad id with spaces', 'h');
  assert.match(safe, /^h_\d+_[a-z0-9]+$/);
});

test('State normalization on load & import', () => {
  // Completely empty input
  const empty = normalizeState(null);
  assert.deepEqual(empty.p, {});
  assert.equal(empty.cur, null);
  assert.equal(empty.version, 2);

  // Missing habits and invalid cur
  const raw = {
    p: {
      'p1': { name: 'Alice' },
      'p2': { name: 'Bob', habits: null, logs: null, tasks: null }
    },
    cur: 'missing_profile'
  };

  const normalized = normalizeState(raw);
  assert.equal(normalized.cur, 'p1', 'cur should fall back to first profile when target is missing');
  assert.ok(Array.isArray(normalized.p.p1.habits), 'habits must be array');
  assert.ok(Array.isArray(normalized.p.p2.tasks), 'tasks must be array');
  assert.equal(typeof normalized.p.p2.logs, 'object', 'logs must be object');

  // Explicit signed-out state (cur is null)
  const loggedOut = normalizeState({
    p: { 'p1': { name: 'Alice' } },
    cur: null
  });
  assert.equal(loggedOut.cur, null, 'explicitly signed-out state (cur: null) must be preserved');
});

test('Habit scheduling respects start, end/archive dates, and days', () => {
  const habit = {
    id: 'h1',
    name: 'Gym',
    start: '2026-11-01',
    end: '2026-11-05',
    days: [1, 2, 3, 4, 5], // Monday through Friday
    archived: true
  };

  // 2026-10-31 is Saturday before start date
  assert.equal(isHabitScheduled(habit, '2026-10-31'), false);

  // 2026-11-02 is Monday (weekday 1) within range
  assert.equal(isHabitScheduled(habit, '2026-11-02'), true);

  // 2026-11-06 is Friday after end/archive date
  assert.equal(isHabitScheduled(habit, '2026-11-06'), false);
});

test('Archiving a habit preserves past streak history', () => {
  const profile = {
    name: 'Tester',
    habits: [
      {
        id: 'h_read',
        name: 'Read',
        start: '2026-11-01',
        end: '2026-11-04', // archived on Nov 4
        archived: true,
        days: [0, 1, 2, 3, 4, 5, 6]
      }
    ],
    logs: {
      '2026-11-01': { 'h_read': { ok: true, t: '08:00' } },
      '2026-11-02': { 'h_read': { ok: true, t: '08:00' } },
      '2026-11-03': { 'h_read': { ok: true, t: '08:00' } },
      '2026-11-04': { 'h_read': { ok: true, t: '08:00' } }
    },
    tasks: []
  };

  // Streaks evaluated up to 2026-11-06
  const s = calculateStreaks(profile, '2026-11-06');
  // From Nov 1 to Nov 4, 4 consecutive full days
  // Nov 5 and Nov 6 have no scheduled habits (status 'none'), which doesn't break the active streak
  assert.equal(s.best, 4);
  assert.equal(s.runs['2026-11-04'], 4);
});

test('Weekly review keys by habit ID and protects against low sample size', () => {
  // Day 1: habit started today, 1 check-in
  const profile = {
    name: 'Dual Habits',
    habits: [
      { id: 'h_read_morning', name: 'Read', start: '2026-11-07', days: [0, 1, 2, 3, 4, 5, 6] },
      { id: 'h_read_evening', name: 'Read', start: '2026-11-07', days: [0, 1, 2, 3, 4, 5, 6] }
    ],
    logs: {
      '2026-11-07': {
        'h_read_morning': { ok: true, t: '09:00' }
      }
    },
    tasks: []
  };

  const review = calculateWeeklyReview(profile, '2026-11-07');
  // Day one (1 check-in out of 1-2 opportunities) should NOT say "100% - Outstanding week"
  assert.match(review.message, /Just starting out/);

  // Top habit must be identified by ID, keeping instances distinct
  assert.equal(review.topHabit.id, 'h_read_morning');
  assert.equal(review.topHabit.count, 1);
});

test('Day status calculations', () => {
  const profile = {
    habits: [
      { id: 'h1', start: '2026-11-01', days: [0, 1, 2, 3, 4, 5, 6] },
      { id: 'h2', start: '2026-11-01', days: [0, 1, 2, 3, 4, 5, 6] }
    ],
    logs: {
      '2026-11-05': { h1: { ok: true }, h2: { ok: true } },
      '2026-11-06': { h1: { ok: true } }
    }
  };

  assert.equal(getDayStatus(profile, '2026-11-05', '2026-11-07'), 'full');
  assert.equal(getDayStatus(profile, '2026-11-06', '2026-11-07'), 'part');
  assert.equal(getDayStatus(profile, '2026-11-04', '2026-11-07'), 'miss');
  assert.equal(getDayStatus(profile, '2026-11-08', '2026-11-07'), 'fut');
});
