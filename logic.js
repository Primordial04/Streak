// logic.js - Pure streak, scheduling, and habit logic for Streakline

export const pad = n => String(n).padStart(2, '0');

export const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

export const toD = s => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (s, n) => {
  const d = toD(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};

export const TODAY = () => ymd(new Date());

export const nowT = () => {
  const n = new Date();
  return pad(n.getHours()) + ':' + pad(n.getMinutes());
};

export const isValidId = id => typeof id === 'string' && /^[\w-]+$/.test(id);

export const safeId = (id, prefix = 'id') => {
  if (isValidId(id)) return id;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

export const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

// Normalization for profile & state
export function normalizeHabit(h) {
  if (!h || typeof h !== 'object') return null;
  const id = safeId(h.id, 'h');
  const name = String(h.name || 'Unnamed habit').trim();
  const start = (typeof h.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(h.start)) ? h.start : TODAY();
  const days = Array.isArray(h.days) && h.days.length ? h.days.map(Number).filter(d => d >= 0 && d <= 6) : [0, 1, 2, 3, 4, 5, 6];
  const dl = (typeof h.dl === 'string' && /^\d{2}:\d{2}$/.test(h.dl)) ? h.dl : '';
  const why = typeof h.why === 'string' ? h.why : '';
  const end = (typeof h.end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(h.end)) ? h.end : null;
  const archived = Boolean(h.archived || (end && end <= TODAY()));
  return { id, name, start, days, dl, why, end, archived };
}

export function normalizeProfile(p) {
  if (!p || typeof p !== 'object') p = {};
  const name = String(p.name || 'User').trim();
  const avatar = typeof p.avatar === 'string' ? p.avatar : null;
  const habits = Array.isArray(p.habits) ? p.habits.map(normalizeHabit).filter(Boolean) : [];
  const logs = (p.logs && typeof p.logs === 'object' && !Array.isArray(p.logs)) ? p.logs : {};
  const tasks = Array.isArray(p.tasks) ? p.tasks.map(t => ({
    id: safeId(t?.id, 't'),
    date: (typeof t?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date)) ? t.date : TODAY(),
    text: String(t?.text || '').trim(),
    done: Boolean(t?.done)
  })).filter(t => t.text.length > 0) : [];
  return { name, avatar, habits, logs, tasks };
}

export function normalizeState(raw) {
  let s = raw;
  if (!s || typeof s !== 'object') {
    s = { p: {}, cur: null, theme: 'auto', version: 2 };
  }
  s.p = (s.p && typeof s.p === 'object') ? s.p : {};
  for (const k of Object.keys(s.p)) {
    if (!isValidId(k)) {
      const safe = safeId(k, 'u');
      s.p[safe] = s.p[k];
      delete s.p[k];
    }
  }
  for (const [k, v] of Object.entries(s.p)) {
    s.p[k] = normalizeProfile(v);
  }
  const profileKeys = Object.keys(s.p);
  if (s.cur !== null && (!s.cur || !s.p[s.cur])) {
    s.cur = profileKeys.length ? profileKeys[0] : null;
  }
  if (!['auto', 'light', 'dark'].includes(s.theme)) {
    s.theme = 'auto';
  }
  s.version = 2;
  return s;
}

// Scheduling check: respects start date, end/archive date, and scheduled weekdays
export function isHabitScheduled(h, d) {
  if (!h || !h.days) return false;
  if (d < h.start) return false;
  if (h.end && d > h.end) return false;
  const dayOfWeek = toD(d).getDay();
  return h.days.includes(dayOfWeek);
}

export function getHabitLog(profile, d, id) {
  return profile?.logs?.[d]?.[id] || null;
}

export function getDayStatus(profile, d, todayStr = TODAY()) {
  if (!profile || !profile.habits) return 'none';
  const scheduled = profile.habits.filter(h => isHabitScheduled(h, d));
  if (!scheduled.length) return 'none';

  const completed = scheduled.filter(h => getHabitLog(profile, d, h.id)?.ok).length;
  if (completed === scheduled.length) return 'full';
  if (d > todayStr) return 'fut';
  if (d === todayStr) return completed > 0 ? 'part' : 'pend';
  return completed > 0 ? 'part' : 'miss';
}

// Streaks calculation with memoization support
export function calculateStreaks(profile, todayStr = TODAY()) {
  if (!profile || !profile.habits || !profile.habits.length) {
    return { cur: 0, best: 0, runs: {} };
  }

  // Find the earliest habit start date
  const starts = profile.habits.map(h => h.start).filter(Boolean).sort();
  if (!starts.length) return { cur: 0, best: 0, runs: {} };

  let d = starts[0];
  let run = 0;
  let best = 0;
  const runs = {};

  while (d <= todayStr) {
    const s = getDayStatus(profile, d, todayStr);
    if (s === 'full') {
      run++;
      best = Math.max(best, run);
      runs[d] = run;
    } else if (s === 'none' || d === todayStr) {
      // no scheduled habits or pending today doesn't break the active streak
    } else {
      run = 0;
    }
    d = addDays(d, 1);
  }

  return { cur: run, best, runs };
}

// Per-habit statistics (30-day window)
export function getHabitStats(profile, h, todayStr = TODAY()) {
  if (!profile || !h) return { cur: 0, best: 0, rate: '–' };
  const from = addDays(todayStr, -30);
  let run = 0;
  let best = 0;
  let tot = 0;
  let ok = 0;

  const start = h.start || todayStr;
  for (let d = start; d <= todayStr; d = addDays(d, 1)) {
    if (!isHabitScheduled(h, d)) continue;
    const isOk = Boolean(getHabitLog(profile, d, h.id)?.ok);
    if (isOk) {
      run++;
      best = Math.max(best, run);
    } else if (d !== todayStr) {
      run = 0;
    }

    if (d > from && (isOk || d !== todayStr)) {
      tot++;
      if (isOk) ok++;
    }
  }

  return {
    cur: run,
    best,
    rate: tot ? Math.round((100 * ok) / tot) + '%' : '–'
  };
}

// Weekly review with ID-keyed aggregation and sample-size guard
export function calculateWeeklyReview(profile, todayStr = TODAY()) {
  if (!profile || !profile.habits) {
    return { totalScheduled: 0, completed: 0, perfectDays: 0, percent: 0, topHabit: null, message: 'No habits yet.' };
  }

  let totalScheduled = 0;
  let completed = 0;
  let perfectDays = 0;
  const perHabit = {}; // keyed by habit ID

  for (let i = 6; i >= 0; i--) {
    const d = addDays(todayStr, -i);
    if (getDayStatus(profile, d, todayStr) === 'full') {
      perfectDays++;
    }
    const scheduled = profile.habits.filter(h => isHabitScheduled(h, d));
    for (const h of scheduled) {
      const ok = Boolean(getHabitLog(profile, d, h.id)?.ok);
      if (d === todayStr && !ok) continue; // pending today doesn't count against rate
      totalScheduled++;
      if (!perHabit[h.id]) perHabit[h.id] = { id: h.id, name: h.name, count: 0 };
      if (ok) {
        completed++;
        perHabit[h.id].count++;
      }
    }
  }

  const percent = totalScheduled > 0 ? Math.round((100 * completed) / totalScheduled) : 0;
  const topHabit = Object.values(perHabit).sort((a, b) => b.count - a.count)[0] || null;

  let message = '';
  if (totalScheduled < 3) {
    message = 'Just starting out! Check in over the next few days to see your weekly momentum.';
  } else if (percent >= 90) {
    message = 'Outstanding week! Protect this rhythm.';
  } else if (percent >= 70) {
    message = 'Solid week. Tighten up the habit you miss most.';
  } else if (percent >= 40) {
    message = 'Mixed week. Try fewer habits or easier deadlines.';
  } else {
    message = 'Rough week. Start again today with one core habit.';
  }

  return { totalScheduled, completed, perfectDays, percent, topHabit, message };
}
