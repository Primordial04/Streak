// app.js - Application controller, UI rendering, accessibility, and storage management
import {
  pad, ymd, toD, addDays, TODAY, nowT, isValidId, safeId, esc,
  normalizeHabit, normalizeProfile, normalizeState,
  isHabitScheduled, getDayStatus, calculateStreaks, getHabitStats, calculateWeeklyReview
} from './logic.js';
import { confetti, initRipples } from './fx.js';
initRipples();
const BADGES = [3, 7, 14, 30, 60, 100, 365];

const K = 'streakline.v2';
const LEGACY_K = 'streakline.v1';

// Request persistent storage
if (navigator.storage?.persist) {
  navigator.storage.persist().catch(() => {});
}

// Load state with fallback & normalization
let S;
try {
  const raw = localStorage.getItem(K) || localStorage.getItem(LEGACY_K);
  if (raw) S = normalizeState(JSON.parse(raw));
} catch (e) {
  console.error('Failed to parse saved state:', e);
}
S = normalizeState(S);
const DEFAULT_ACCENTS = { light: '#177F6D', dark: '#4FD1B5' };
const validHex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
function normalizeAccentColors(colors) {
  return {
    light: validHex(colors?.light) ? colors.light.toUpperCase() : DEFAULT_ACCENTS.light,
    dark: validHex(colors?.dark) ? colors.dark.toUpperCase() : DEFAULT_ACCENTS.dark
  };
}
S.colors = normalizeAccentColors(S.colors);

function luminance(hex) {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

function activeColorMode() {
  if (S.theme !== 'auto') return S.theme;
  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
}

function applyThemeColors() {
  const root = document.documentElement;
  const mode = activeColorMode();
  const accent = S.colors[mode];
  root.style.setProperty('--custom-accent', accent);
  root.style.setProperty('--acc-btn-text', contrast(accent, '#FFFFFF') >= contrast(accent, '#0E1513') ? '#FFFFFF' : '#0E1513');
}

function updateAccent(mode, value) {
  if (!['light', 'dark'].includes(mode)) return;
  const error = document.getElementById(`accent-error-${mode}`);
  const hexInput = document.getElementById(`accent-hex-${mode}`);
  const picker = document.getElementById(`accent-picker-${mode}`);
  if (!validHex(value)) {
    if (error) error.textContent = 'Enter a hex code in #RRGGBB format.';
    return;
  }
  const backgrounds = mode === 'dark' ? ['#0E1513', '#15201C'] : ['#F4F7F5', '#FFFFFF'];
  if (Math.min(...backgrounds.map(background => contrast(value, background))) < 4.5) {
    if (error) error.textContent = 'Choose a color with at least 4.5:1 contrast against this mode’s background.';
    return;
  }
  const color = value.toUpperCase();
  S.colors[mode] = color;
  if (error) error.textContent = '';
  if (hexInput && hexInput.value !== color) hexInput.value = color;
  if (picker) picker.value = color;
  if (mode === activeColorMode()) applyThemeColors();
  save();
}

// In-memory UI state
let tab = 'day';
let sel = TODAY();
let cm = null;
let ed = null;
let tempAvatar = null;
let isCreatingProfile = false;
let lastToday = TODAY();
let memoizedStreaks = null;
let lastStreaksProfileKey = null;
let tourStep = -1;
let isGuideOpen = false;

const TOUR_STEPS = [
  {
    title: 'Welcome to Streakline! 🎯',
    tab: 'day',
    desc: 'Streakline is your personal habit & consistency tracker. Let’s take a quick 1-minute tour to see how each tab, button, and streak works so you can build habits effectively!',
    highlight: null
  },
  {
    title: '1. Day Tab — Daily Habit Hub ☀️',
    tab: 'day',
    desc: 'Your scheduled habits for today appear here. Click "Done" before the deadline to keep your streak intact. You can also write reflection notes and manage daily to-dos.',
    highlight: '.nav-day'
  },
  {
    title: '2. Visual Streak Heatmap 🟩',
    tab: 'day',
    desc: 'The heatmap visualizes your consistency across weeks, just like GitHub commits. Fainter to stronger tints of your selected heading color show longer runs. Partial days show a dot (·), and missed days show a cross (×). Tap any cell to view that date.',
    highlight: '.hw'
  },
  {
    title: '3. Habits Tab — Creating & Customizing 📝',
    tab: 'habits',
    desc: 'Add habits here! Select active weekdays (e.g. Mon–Fri or daily), set optional deadline times (e.g. 09:00), and write why it matters. To change a habit without breaking past streaks, always use "Archive" rather than deleting.',
    highlight: '#hn'
  },
  {
    title: '4. Calendar Tab — Month Overview 📅',
    tab: 'cal',
    desc: 'Explore your full monthly calendar with an extended 53-week heatmap. Tap any date on the calendar to jump to it, review completed habits, and inspect past check-ins.',
    highlight: '.grid'
  },
  {
    title: '5. Stats Tab & Milestone Badges 🏆',
    tab: 'stats',
    desc: 'Track your 7-day completion rate, view your most consistent habit, and unlock milestone badges for streaks of 3, 7, 14, 30, 60, 100, and 365 days!',
    highlight: '.badges'
  },
  {
    title: '6. Settings, Themes & Offline Backups ⚙️',
    tab: 'set',
    desc: 'Switch between Dark and Light mode, upload a custom profile photo or animated GIF, switch profiles, and export local JSON backups to keep your data safe and portable.',
    highlight: null
  },
  {
    title: 'You’re All Set! 🚀',
    tab: 'day',
    desc: 'Small steps, taken daily, move mountains! Click "💡 Guide" at any time in the header if you want to review the manual or restart the tour.',
    highlight: null
  }
];

const draftNotes = {};
let draftTask = '';

const P = () => S.p[S.cur] || null;

// Quotes of the day
const Q = [
  "Small steps, taken daily, move mountains.",
  "You don't need a perfect day. You need a completed one.",
  "Show up today. Tomorrow's you will say thanks.",
  "Discipline is a promise you keep with yourself.",
  "Progress is quiet. Keep going.",
  "The streak is proof of who you're becoming.",
  "Start before you feel ready.",
  "Consistency beats intensity.",
  "Every check mark is a vote for the person you want to be.",
  "Be a little better than yesterday."
];
const qod = () => Q[[...TODAY()].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % Q.length];

// Helper: query selector
const $ = s => document.querySelector(s);

// Toast notification system
export function showToast(message, type = 'info', duration = 4000) {
  let box = $('#toast-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast-box';
    box.setAttribute('role', 'alert');
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  box.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Inline accessible modal confirmation (replaces browser confirm)
export function showConfirm(message, title = 'Confirmation') {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');

    backdrop.innerHTML = `
      <div class="modal-card">
        <h3>${esc(title)}</h3>
        <p>${esc(message)}</p>
        <div class="modal-actions">
          <button type="button" class="ghost" id="m-cancel">Cancel</button>
          <button type="button" class="danger" id="m-ok">Confirm</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    const okBtn = backdrop.querySelector('#m-ok');
    const cancelBtn = backdrop.querySelector('#m-cancel');
    okBtn.focus();

    const cleanup = val => {
      backdrop.remove();
      resolve(val);
    };

    okBtn.addEventListener('click', () => cleanup(true));
    cancelBtn.addEventListener('click', () => cleanup(false));
    backdrop.addEventListener('keydown', e => {
      if (e.key === 'Escape') cleanup(false);
    });
  });
}

// Inline accessible modal alert (replaces browser alert)
export function showAlert(message, title = 'Notice') {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');

    backdrop.innerHTML = `
      <div class="modal-card">
        <h3>${esc(title)}</h3>
        <p>${esc(message)}</p>
        <div class="modal-actions">
          <button type="button" id="m-close">OK</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    const closeBtn = backdrop.querySelector('#m-close');
    closeBtn.focus();

    const cleanup = () => {
      backdrop.remove();
      resolve();
    };

    closeBtn.addEventListener('click', cleanup);
    backdrop.addEventListener('keydown', e => {
      if (e.key === 'Escape' || e.key === 'Enter') cleanup();
    });
  });
}

// Save with error detection (QuotaExceeded)
export const save = () => {
  memoizedStreaks = null;
  try {
    localStorage.setItem(K, JSON.stringify(S));
  } catch (err) {
    console.error('Storage save error:', err);
    showToast('Failed to save data. Storage quota may be full.', 'error');
  }
};

// Canvas-based image resizing for avatars (limits to ~256px max, highly compressed)
export function resizeImage(file, maxDim = 256) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return reject(new Error('Selected file is not an image.'));
    }

    // If it's an animated GIF under 400KB, allow keeping directly for animations
    if (file.type === 'image/gif' && file.size <= 450 * 1024) {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      return reader.readAsDataURL(file);
    }

    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to efficient JPEG/PNG data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Memoized streak calculation for current render cycle
function getStreaks() {
  const p = P();
  if (!p) return { cur: 0, best: 0, runs: {} };
  const key = `${S.cur}_${TODAY()}_${JSON.stringify(p.logs)}`;
  if (memoizedStreaks && lastStreaksProfileKey === key) {
    return memoizedStreaks;
  }
  memoizedStreaks = calculateStreaks(p, TODAY());
  lastStreaksProfileKey = key;
  return memoizedStreaks;
}

// Heatmap renderer (26 or 53 weeks)
function heat(n) {
  const p = P();
  const s = getStreaks();
  const t = TODAY();
  const a = addDays(t, -toD(t).getDay() - (n - 1) * 7);
  let c = '';
  let lb = '';
  let pm = -1;

  for (let w = 0; w < n; w++) {
    const D = toD(addDays(a, w * 7));
    const m = D.getMonth();
    lb += `<i>${m !== pm ? D.toLocaleDateString(undefined, { month: 'short' }) : ''}</i>`;
    pm = m;
  }

  for (let i = 0; i < n * 7; i++) {
    const d = addDays(a, i);
    const q = getDayStatus(p, d, t);
    const r = s.runs[d] || 0;
    const k = q === 'full' ? 'g' + (r >= 14 ? 4 : r >= 7 ? 3 : r >= 3 ? 2 : 1) : q;
    const isToday = d === t;
    c += `<button type="button" class="hc ${k} ${isToday ? 'tod' : ''}" data-a="pick" data-v="${esc(d)}" title="${esc(d)}" aria-label="${esc(d)} status ${k}"></button>`;
  }

  return `
    <div class="card">
      <div class="sum">
        <span><b>${s.cur}</b>day streak</span>
        <span><b>${s.best}</b>longest</span>
        <span><b>${Object.keys(s.runs).length}</b>perfect days</span>
      </div>
      <div class="hw">
        <div class="hl">${lb}</div>
        <div class="hm">${c}</div>
      </div>
      <div class="leg">
        <span><i style="background:var(--g1)"></i>short run</span>
        <span><i style="background:var(--g4)"></i>long run</span>
        <span><i style="background:var(--part-bg);border:1px solid var(--part)"></i>partly done</span>
        <span><i style="background:var(--bad-bg);border:1px solid var(--bad)"></i>missed</span>
      </div>
    </div>
  `;
}

// Views
function vDay() {
  const p = P();
  const t = TODAY();
  const isT = sel === t;
  const s = getStreaks();
  const activeHabits = p.habits.filter(h => isHabitScheduled(h, sel));
  const st = getDayStatus(p, sel, t);

  let h = heat(26) + `
    <div class="nav-day">
      <button type="button" class="ghost" data-a="nav" data-v="-1" aria-label="Previous day">‹</button>
      <div>${toD(sel).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <button type="button" class="ghost" data-a="nav" data-v="1" aria-label="Next day">›</button>
      ${isT ? '' : '<button type="button" data-a="now">Today</button>'}
    </div>
  `;

  const dn = activeHabits.filter(x => p.logs?.[sel]?.[x.id]?.ok).length;
  if (activeHabits.length) {
    h += `
      <div class="mute">${dn} of ${activeHabits.length} habits done</div>
      <div class="prog"><div style="width:${Math.round((100 * dn) / activeHabits.length)}%"></div></div>
    `;
  }

  if (st === 'full') {
    h += `<div class="win">All habits done${isT ? ' — day ' + s.cur + ' of your streak' : ''}! ${esc(qod())}</div>`;
  } else if (isT) {
    h += `<p class="q">“${esc(qod())}”</p>`;
  }

  if (activeHabits.length) {
    h += activeHabits.map(x => {
      const l = p.logs?.[sel]?.[x.id];
      const late = isT && !l && x.dl && nowT() > x.dl;
      let b;
      if (l) {
        b = `
          <div class="res ${l.ok ? 'ok' : 'late'}">
            ${l.ok ? 'Done' : 'Late'} at ${esc(l.t)}${l.ok ? '' : ' — does not count towards streak'}
            ${l.note ? `<i>${esc(l.note)}</i>` : ''}
          </div>
          ${isT ? `<button type="button" class="ghost" data-a="undo" data-id="${esc(x.id)}">Undo</button>` : ''}
        `;
      } else if (isT) {
        const savedNote = draftNotes['n' + x.id] || '';
        b = `
          ${late ? '<div class="warn">Deadline passed. Logging now will not count toward your streak.</div>' : ''}
          <div class="row">
            <input id="n${esc(x.id)}" placeholder="Quick note (optional)" aria-label="Note for ${esc(x.name)}" value="${esc(savedNote)}">
            <button type="button" data-a="done" data-id="${esc(x.id)}">Done</button>
          </div>
        `;
      } else {
        b = sel < t ? '<div class="res miss">Missed</div>' : '<div class="res miss">Upcoming</div>';
      }
      return `
        <div class="card ${l ? (l.ok ? 'ok' : 'late') : ''}">
          <h3>${esc(x.name)}${x.dl ? `<small>before ${esc(x.dl)}</small>` : ''}</h3>
          ${x.why ? `<p class="why">${esc(x.why)}</p>` : ''}
          ${b}
        </div>
      `;
    }).join('');
  } else {
    h += '<p class="mute">No habits scheduled for this day. Add or customize them in the Habits tab.</p>';
  }

  // To-do tasks
  const dayTasks = p.tasks.filter(x => x.date === sel);
  h += `
    <h2>To-do for this day</h2>
    ${dayTasks.map(x => `
      <div class="task ${x.done ? 'dn' : ''}">
        <button type="button" class="chk" data-a="tg" data-id="${esc(x.id)}" aria-label="Toggle task ${esc(x.text)}">${x.done ? '✓' : ''}</button>
        <span>${esc(x.text)}</span>
        <button type="button" class="ghost" data-a="delt" data-id="${esc(x.id)}" aria-label="Delete task">✕</button>
      </div>
    `).join('')}
    <div class="row" style="margin-top:10px">
      <input id="tt" placeholder="Add a task for this day" aria-label="Add a task for this day" value="${esc(draftTask)}">
      <button type="button" data-a="addt">Add</button>
    </div>
  `;

  return h;
}

function vCal() {
  cm ??= new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const p = P();
  const s = getStreaks();
  const y = cm.getFullYear();
  const m = cm.getMonth();
  const first = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();

  let g = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<i class="wd">${d}</i>`).join('') + '<i></i>'.repeat(first);

  for (let d = 1; d <= dim; d++) {
    const k = `${y}-${pad(m + 1)}-${pad(d)}`;
    const st = getDayStatus(p, k, TODAY());
    const r = s.runs[k] || 0;
    const c = st === 'full' ? 'g' + (r >= 14 ? 4 : r >= 7 ? 3 : r >= 3 ? 2 : 1) : st;
    g += `<button type="button" class="cell ${c} ${k === TODAY() ? 'tod' : ''}" data-a="pick" data-v="${esc(k)}" aria-label="${esc(k)} status ${c}">${d}</button>`;
  }

  return heat(53) + `
    <div class="nav-day">
      <button type="button" class="ghost" data-a="mon" data-v="-1" aria-label="Previous month">‹</button>
      <div>${cm.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
      <button type="button" class="ghost" data-a="mon" data-v="1" aria-label="Next month">›</button>
    </div>
    <div class="grid">${g}</div>
    <div class="leg">
      <span><i style="background:var(--g1)"></i>1–2 days</span>
      <span><i style="background:var(--g2)"></i>3–6</span>
      <span><i style="background:var(--g3)"></i>7–13</span>
      <span><i style="background:var(--g4)"></i>14+</span>
      <span><i style="background:var(--part-bg);border:1px solid var(--part)"></i>partly</span>
      <span><i style="background:var(--bad-bg);border:1px solid var(--bad)"></i>missed</span>
    </div>
    <p class="mute" style="text-align:center;margin-top:14px">Select any date to review its habits and to-dos.</p>
  `;
}

function vHab() {
  const p = P();
  const N = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const e = p.habits.find(h => h.id === ed) || { days: [0, 1, 2, 3, 4, 5, 6] };

  const active = p.habits.filter(h => !h.archived);
  const archived = p.habits.filter(h => h.archived);

  return `
    <h2>${ed ? 'Edit habit' : 'New habit'}</h2>
    <div class="card">
      <label class="mute" for="hn">Habit Name</label>
      <input id="hn" value="${esc(e.name || '')}" placeholder="e.g. Morning meditation" aria-label="Habit Name">
      <label class="mute" for="hw">Why it matters to you (optional)</label>
      <input id="hw" value="${esc(e.why || '')}" placeholder="e.g. Keeps my mind centered and calm" aria-label="Why does it matter">
      <label class="mute" for="hd">Must be done before (optional)</label>
      <input id="hd" type="time" value="${esc(e.dl || '')}" aria-label="Deadline time">
      <div class="days" role="group" aria-label="Days of week">
        ${[0, 1, 2, 3, 4, 5, 6].map(i => `
          <label>
            <input type="checkbox" class="dy" value="${i}" ${e.days?.includes(i) ? 'checked' : ''}>
            ${N[i]}
          </label>
        `).join('')}
      </div>
      <div class="row">
        <button type="button" data-a="addh">${ed ? 'Save changes' : 'Add habit'}</button>
        ${ed ? '<button type="button" class="ghost" data-a="cancel">Cancel</button>' : ''}
      </div>
    </div>

    <h2>Your Active Habits (${active.length})</h2>
    ${active.length ? active.map(h => `
      <div class="card">
        <h3>${esc(h.name)}${h.dl ? `<small>before ${esc(h.dl)}</small>` : ''}</h3>
        ${h.why ? `<p class="why">${esc(h.why)}</p>` : ''}
        <p class="mute">${h.days.length === 7 ? 'Every day' : h.days.map(d => N[d]).join(', ')}</p>
        <div class="row">
          <button type="button" class="ghost" data-a="edit" data-id="${esc(h.id)}">Edit</button>
          <button type="button" class="ghost" data-a="archh" data-id="${esc(h.id)}" title="Archive habit and retain streak history">Archive</button>
        </div>
      </div>
    `).join('') : '<p class="mute">No active habits yet. Create your first one above!</p>'}

    ${archived.length ? `
      <h2>Archived Habits (${archived.length})</h2>
      <p class="mute">Archived habits retain past streak records but are not scheduled going forward.</p>
      ${archived.map(h => `
        <div class="card archived">
          <h3>${esc(h.name)} <small>(Archived on ${esc(h.end || 'past')})</small></h3>
          <div class="row" style="margin-top:8px">
            <button type="button" class="ghost" data-a="unarchh" data-id="${esc(h.id)}">Unarchive</button>
            <button type="button" class="ghost danger" data-a="delh" data-id="${esc(h.id)}">Permanently Delete</button>
          </div>
        </div>
      `).join('')}
    ` : ''}
  `;
}

function vStats() {
  const p = P();
  const review = calculateWeeklyReview(p, TODAY());
  const streaks = getStreaks();

  const B = [3, 7, 14, 30, 60, 100, 365];
  const bd = hasEarned => {
    const list = B.filter(n => (streaks.best >= n) === hasEarned);
    return list.length
      ? `<div class="badges">${list.map(n => `<span class="${hasEarned ? 'got' : ''}">${n}-day streak</span>`).join('')}</div>`
      : `<p class="mute">${hasEarned ? 'None yet. Your first milestone arrives at 3 days!' : 'Congratulations! You have unlocked all streak badges.'}</p>`;
  };

  return `
    <h2>Last 7 days</h2>
    <div class="card">
      <div class="hero" style="margin:0">
        <div><b>${review.percent}%</b><span>habits completed</span></div>
        <div><b>${review.perfectDays}</b><span>perfect days</span></div>
      </div>
      <p style="margin-top:14px">
        ${esc(review.message)}
        ${review.topHabit && review.topHabit.count > 0 ? ` Most consistent: <b>${esc(review.topHabit.name)}</b>.` : ''}
      </p>
    </div>

    <h2>Badges earned</h2>
    ${bd(true)}
    <h2>Can be earned</h2>
    ${bd(false)}

    <h2>Per habit</h2>
    ${p.habits.length ? `
      <table>
        <thead>
          <tr>
            <th scope="col">Habit</th>
            <th scope="col">Current</th>
            <th scope="col">Best</th>
            <th scope="col">30 days</th>
          </tr>
        </thead>
        <tbody>
          ${p.habits.map(h => {
            const x = getHabitStats(p, h, TODAY());
            return `
              <tr>
                <td>${esc(h.name)}${h.archived ? ' <small class="mute">(archived)</small>' : ''}</td>
                <td>${x.cur}</td>
                <td>${x.best}</td>
                <td>${x.rate}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    ` : '<p class="mute">No habits yet.</p>'}
  `;
}

function vSet() {
  const p = P();
  return `
    <h2>Current Profile</h2>
    <div class="card" style="margin-bottom:18px">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <button type="button" class="avatar-preview-btn" data-a="pickpic" data-id="upic_edit" aria-label="Change profile photo or GIF">
          ${p?.avatar
            ? `<img class="avatar-preview" style="width:76px;height:76px" src="${esc(p.avatar)}" alt="Profile avatar">`
            : `<div class="avatar-ph-box" style="width:76px;height:76px;font-size:24px">📷</div>`}
          <span class="avatar-badge-icon" aria-hidden="true">✎</span>
        </button>
        <input type="file" id="upic_edit" data-mode="edit" accept="image/*,.gif" style="display:none" aria-label="Upload profile image">
        <div style="flex:1;min-width:210px">
          <label class="mute" for="pedit_name" style="font-size:13px;display:block;margin-bottom:2px">Profile Name</label>
          <div class="row">
            <input id="pedit_name" value="${esc(p?.name || '')}" placeholder="Your name" aria-label="Profile name">
            <button type="button" data-a="renamep">Rename</button>
          </div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button type="button" class="ghost" data-a="pickpic" data-id="upic_edit" style="font-size:12px;padding:4px 10px">Change Photo/GIF</button>
            ${p?.avatar ? `<button type="button" class="ghost" data-a="rmpic" data-mode="edit" style="font-size:12px;padding:4px 10px">Remove</button>` : ''}
          </div>
        </div>
      </div>
    </div>

    <h2>Account & Session</h2>
    <div class="card">
      <p class="mute" style="margin-top:0">Signed in as <strong>${esc(p?.name || 'User')}</strong>.</p>
      <div class="row" style="flex-wrap:wrap;gap:10px">
        <button type="button" class="ghost" data-a="logout">Sign Out / Log Out</button>
        <button type="button" class="ghost" data-a="switchprofile">Switch Profile</button>
        <button type="button" class="ghost danger" data-a="delp">Delete Profile</button>
      </div>
    </div>

    <h2>Switch or Add Profile</h2>
    <label class="mute" for="ps">Active Profile</label>
    <select id="ps" aria-label="Select profile">
      ${Object.entries(S.p).map(([k, v]) => `
        <option value="${esc(k)}" ${k === S.cur ? 'selected' : ''}>${esc(v.name)}</option>
      `).join('')}
    </select>
    <div class="row" style="margin-top:8px">
      <input id="pn" placeholder="New profile name" aria-label="New profile name">
      <button type="button" data-a="newp">Add Profile</button>
    </div>

    <h2>Theme</h2>
    <div class="row" role="group" aria-label="Color Theme">
      ${['auto', 'light', 'dark'].map(t => `
        <button type="button" class="${S.theme === t ? '' : 'ghost'}" data-a="theme" data-v="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</button>
      `).join('')}
    </div>

    <h2>Accent Color</h2>
    <p class="mute">Choose a heading color for each mode. It also colors buttons, the active tab, links, and heatmap shades. Hex colors need 4.5:1 contrast with that mode’s background.</p>
    ${['dark', 'light'].map(mode => `
      <div class="color-setting card">
        <label for="accent-hex-${mode}">${mode === 'dark' ? 'Dark mode' : 'Light mode'} accent</label>
        <div class="color-controls">
          <input id="accent-picker-${mode}" type="color" value="${S.colors[mode]}" aria-label="Choose ${mode} mode accent color">
          <input id="accent-hex-${mode}" type="text" value="${S.colors[mode]}" maxlength="7" pattern="#[0-9a-fA-F]{6}" spellcheck="false" aria-label="Hex code for ${mode} mode accent">
          <button type="button" class="ghost" data-a="resetaccent" data-v="${mode}">Return to default</button>
        </div>
        <span class="color-error" id="accent-error-${mode}" aria-live="polite"></span>
      </div>
    `).join('')}

    <h2>Help & Interactive Tour</h2>
    <div class="card">
      <p class="mute" style="margin-top:0">Need a refresher on how habits, streaks, heatmaps, badges, or archives work?</p>
      <div class="row" style="flex-wrap:wrap;gap:10px">
        <button type="button" data-a="starttour">Start Interactive Tour</button>
        <button type="button" class="ghost" data-a="openguide">Read User Guide</button>
      </div>
    </div>

    <h2>Backup & Restore</h2>
    <p class="mute">Streakline runs 100% offline. Export backups to safeguard or transfer your streaks across devices.</p>
    <div class="row">
      <button type="button" data-a="exp">Export Backup</button>
      <button type="button" class="ghost" data-a="imp">Import Backup</button>
      <input type="file" id="imf" accept=".json" style="display:none" aria-label="Import backup file">
    </div>
  `;
}

function vSignIn() {
  const profileEntries = Object.entries(S.p);
  return `
    <header style="justify-content:center;margin-bottom:12px">
      <h1>Streakline</h1>
    </header>
    <p class="q">Build habits one day at a time.</p>
    <div class="card" style="text-align:center;padding:24px 20px">
      <h2 style="margin:0 0 6px">Sign In</h2>
      <p class="mute" style="margin-top:0">Choose your profile to sign in and continue your streaks.</p>
      <div class="profile-auth-grid">
        ${profileEntries.map(([k, p]) => {
          const s = calculateStreaks(p, TODAY());
          const habitCount = p.habits.filter(h => !h.archived).length;
          return `
            <div class="profile-auth-card">
              ${p.avatar
                ? `<img class="profile-auth-avatar" src="${esc(p.avatar)}" alt="${esc(p.name)}">`
                : `<span class="profile-auth-avatar-ph">${esc(p.name[0]?.toUpperCase() || '?')}</span>`}
              <strong style="font-size:16px;margin-bottom:2px">${esc(p.name)}</strong>
              <span class="mute" style="font-size:13px;margin-bottom:14px">
                ${s.cur > 0 ? `🔥 ${s.cur}-day streak` : 'Ready to start'} • ${habitCount} habit${habitCount === 1 ? '' : 's'}
              </span>
              <button type="button" data-a="signin" data-id="${esc(k)}" style="width:100%;margin-top:auto">Sign In</button>
            </div>
          `;
        }).join('')}
      </div>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap">
        <button type="button" class="ghost" data-a="togglesignup">＋ Add New Profile</button>
        <button type="button" class="ghost" data-a="openguide">💡 Quick Guide</button>
        <button type="button" class="ghost" data-a="imp">Import Backup</button>
        <input type="file" id="imf" accept=".json" style="display:none" aria-label="Import backup file">
      </div>
    </div>
  `;
}

function vSignUp() {
  const av = tempAvatar;
  const hasProfiles = Object.keys(S.p).length > 0;
  return `
    <header style="justify-content:center;margin-bottom:12px">
      <h1>Streakline</h1>
    </header>
    <p class="q">Build habits one day at a time.</p>
    <div class="card" style="text-align:center;padding:26px 20px">
      <h2 style="margin:0 0 6px">Create Your Profile</h2>
      <p class="mute" style="margin-top:0">Set your name and an optional photo or animated GIF. Everything stays on this device.</p>
      <div class="avatar-picker">
        <button type="button" class="avatar-preview-btn" data-a="pickpic" data-id="upic" aria-label="Upload photo or GIF">
          <img id="avprev" class="avatar-preview" src="${av || ''}" style="${av ? 'display:block' : 'display:none'}" alt="Avatar preview">
          <div id="avph" class="avatar-ph-box" style="${av ? 'display:none' : 'display:flex'}">
            <span>📷</span>
            <span style="font-size:11px;margin-top:4px">Photo / GIF</span>
          </div>
          <span class="avatar-badge-icon" aria-hidden="true">＋</span>
        </button>
        <input type="file" id="upic" data-mode="new" accept="image/*,.gif" style="display:none" aria-label="Upload avatar image">
        <div style="display:flex;gap:8px;justify-content:center;margin-top:6px">
          <button type="button" class="ghost" data-a="pickpic" data-id="upic" style="font-size:13px;padding:5px 12px">Upload Photo / GIF</button>
          <button type="button" id="avrm" class="ghost" data-a="rmpic" style="font-size:13px;padding:5px 12px;${av ? 'display:inline-block' : 'display:none'}">Remove</button>
        </div>
      </div>
      <div class="row" style="max-width:380px;margin:16px auto 0">
        <input id="pn" placeholder="Your name" aria-label="Your name" autofocus>
        <button type="button" data-a="newp">Start</button>
      </div>
      ${hasProfiles ? `
        <div style="margin-top:16px">
          <button type="button" class="ghost" data-a="togglesignup" style="font-size:13px">← Back to Sign In</button>
        </div>
      ` : ''}
    </div>
  `;
}

function vAuth() {
  if (Object.keys(S.p).length > 0 && !isCreatingProfile) {
    return vSignIn();
  }
  return vSignUp();
}

function vTourModal() {
  if (tourStep < 0 || tourStep >= TOUR_STEPS.length) return '';
  const step = TOUR_STEPS[tourStep];
  const isLast = tourStep === TOUR_STEPS.length - 1;
  const isFirst = tourStep === 0;

  return `
    <div class="tour-backdrop" role="dialog" aria-modal="true" aria-label="Interactive Tour: ${esc(step.title)}">
      <div class="tour-card">
        <div class="tour-header">
          <span class="tour-badge">Step ${tourStep + 1} of ${TOUR_STEPS.length}</span>
          <button type="button" class="ghost" data-a="endtour" aria-label="Skip tour" style="border:0;font-size:14px;padding:2px 8px;color:var(--mute)">✕ Skip</button>
        </div>
        <h3>${esc(step.title)}</h3>
        <p>${esc(step.desc)}</p>
        <div class="tour-footer">
          <div class="tour-dots">
            ${TOUR_STEPS.map((_, i) => `<span class="tour-dot ${i === tourStep ? 'active' : ''}"></span>`).join('')}
          </div>
          <div class="tour-actions">
            ${!isFirst ? `<button type="button" class="ghost" data-a="prevtour" style="font-size:13px;padding:6px 14px">Back</button>` : ''}
            <button type="button" data-a="nexttour" style="font-size:13px;padding:6px 16px">${isLast ? 'Get Started 🚀' : 'Next →'}</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function vGuideModal() {
  return `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Streakline User Guide">
      <div class="modal-card" style="max-width:580px;max-height:85vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 style="margin:0;font-size:20px">📖 Streakline Guide & Manual</h3>
          <button type="button" class="ghost" data-a="closeguide" aria-label="Close guide" style="padding:4px 10px;font-size:16px">✕</button>
        </div>
        <p class="mute" style="margin-top:0">Learn how to build habits consistently and get the most out of Streakline.</p>

        <details class="guide-details" open>
          <summary>☀️ 1. Daily Check-Ins & Deadlines</summary>
          <p>Your habits for the current date are listed in the <strong>Day</strong> tab. Click <strong>Done</strong> to check them in.</p>
          <ul>
            <li><strong>On-Time Logging:</strong> If a habit has an optional deadline (e.g. 09:00 AM), check in before that time for it to count toward your active streak.</li>
            <li><strong>Streak Calculation:</strong> A day is scored as <em>Full (Streak +1)</em> when all scheduled habits for that day are completed on time.</li>
            <li><strong>Quick Notes:</strong> Type reflection notes in the input field before clicking Done to keep a log of how your habit went.</li>
          </ul>
        </details>

        <details class="guide-details">
          <summary>🟩 2. Visual Streak Heatmap & Indicators</summary>
          <p>Streakline includes a 26-week (Day view) and 53-week (Calendar view) heatmap:</p>
          <ul>
            <li><strong>Faint to full accent tint:</strong> Shows completed streak lengths, from 1–2 days to 14+ days.</li>
            <li><strong>Outlined cell with a dot (·):</strong> Partly completed day.</li>
            <li><strong>Outlined cell with a cross (×):</strong> Missed day.</li>
            <li><strong>Accent outline:</strong> Highlights today's active cell.</li>
          </ul>
        </details>

        <details class="guide-details">
          <summary>📝 3. Adding, Editing & Archiving Habits</summary>
          <p>Go to the <strong>Habits</strong> tab to manage your routines:</p>
          <ul>
            <li><strong>Active Weekdays:</strong> Choose which days (e.g. Mon–Fri for work routines, daily for meditation).</li>
            <li><strong>Why It Matters:</strong> Adding your intrinsic motivation helps you stay committed when friction arises.</li>
            <li><strong>Archive vs. Delete:</strong> Always prefer <em>Archive</em>! Archiving stops future scheduling while keeping all your historical streak data intact. Delete is permanent.</li>
          </ul>
        </details>

        <details class="guide-details">
          <summary>📅 4. Calendar & Historical Browsing</summary>
          <p>The <strong>Calendar</strong> tab gives you a full month view. Tap any past day to see what habits were done, inspect past notes, and review your consistency.</p>
        </details>

        <details class="guide-details">
          <summary>🏆 5. Milestone Badges & 7-Day Review</summary>
          <p>In the <strong>Stats</strong> tab, you can unlock milestone badges for streaks reaching <strong>3, 7, 14, 30, 60, 100, and 365 days</strong>. You will also see your 7-day completion percentage and most consistent habit.</p>
        </details>

        <details class="guide-details">
          <summary>💾 6. Offline Data, Profiles & Backups</summary>
          <p>Streakline is 100% offline-first. Your data is stored locally in your browser. You can export a <code>.json</code> backup anytime in <strong>Settings</strong> to safeguard or transfer your streaks across devices.</p>
        </details>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:20px;border-top:1px solid var(--line);padding-top:14px;flex-wrap:wrap;gap:10px">
          <button type="button" data-a="starttour">Start Interactive Tour</button>
          <button type="button" class="ghost" data-a="closeguide">Close Guide</button>
        </div>
      </div>
    </div>
  `;
}

// Action handlers
const A = {
  tab: x => { tab = x.v; draw(); },
  pick: x => { sel = x.v; tab = 'day'; draw(); },
  nav: x => { sel = addDays(sel, +x.v); draw(); },
  now: () => { sel = TODAY(); draw(); },
  mon: x => { cm = new Date(cm.getFullYear(), cm.getMonth() + +x.v, 1); draw(); },

  done: x => {
    const t = nowT();
    const h = P()?.habits.find(item => item.id === x.id);
    if (!h) return;
    const noteInput = $('#n' + x.id);
    const note = noteInput ? noteInput.value.trim() : (draftNotes['n' + x.id] || '');
    delete draftNotes['n' + x.id];
    const before = getStreaks().best, wasFull = getDayStatus(P(), TODAY()) === 'full';
    (P().logs[TODAY()] ??= {})[x.id] = { t, note, ok: !h.dl || t <= h.dl };
    save();
    draw();
    const after = getStreaks().best;
    const badge = BADGES.find(n => before < n && after >= n);
    if (badge) { confetti(220); showToast(`🏆 ${badge}-day streak badge unlocked!`, 'success'); }
    else if (!wasFull && getDayStatus(P(), TODAY()) === 'full') confetti(90);
  },

  undo: x => {
    if (P()?.logs?.[TODAY()]) {
      delete P().logs[TODAY()][x.id];
      save();
      draw();
    }
  },

  addh: async () => {
    const nm = $('#hn')?.value.trim();
    if (!nm) return showAlert('Please give your habit a name.');
    const days = [...document.querySelectorAll('.dy:checked')].map(c => +c.value);
    if (!days.length) return showAlert('Please select at least one day of the week.');

    const o = {
      name: nm,
      why: $('#hw')?.value.trim() || '',
      dl: $('#hd')?.value || '',
      days
    };

    const existing = P().habits.find(h => h.id === ed);
    if (existing) {
      Object.assign(existing, o);
    } else {
      P().habits.push(normalizeHabit({
        id: safeId(null, 'h'),
        start: TODAY(),
        ...o
      }));
    }
    ed = null;
    save();
    draw();
  },

  edit: x => {
    ed = x.id;
    draw();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  cancel: () => {
    ed = null;
    draw();
  },

  archh: async x => {
    const habit = P()?.habits.find(h => h.id === x.id);
    if (!habit) return;
    const confirmed = await showConfirm(`Archive "${habit.name}"? Past streaks will remain intact, but it will no longer be scheduled.`, 'Archive Habit');
    if (!confirmed) return;
    habit.archived = true;
    habit.end = TODAY();
    save();
    draw();
    showToast(`Archived "${habit.name}".`);
  },

  unarchh: x => {
    const habit = P()?.habits.find(h => h.id === x.id);
    if (!habit) return;
    habit.archived = false;
    delete habit.end;
    save();
    draw();
    showToast(`Reactivated "${habit.name}".`);
  },

  delh: async x => {
    const habit = P()?.habits.find(h => h.id === x.id);
    if (!habit) return;
    const confirmed = await showConfirm(`Permanently delete "${habit.name}" and remove all past logs for it? (Consider Archiving instead to preserve streaks).`, 'Delete Permanently');
    if (!confirmed) return;
    P().habits = P().habits.filter(h => h.id !== x.id);
    save();
    draw();
    showToast(`Deleted "${habit.name}".`);
  },

  addt: () => {
    const v = $('#tt')?.value.trim();
    if (!v) return;
    draftTask = '';
    P().tasks.push({
      id: safeId(null, 't'),
      date: sel,
      text: v,
      done: false
    });
    save();
    draw();
    // Maintain focus on task input after adding
    setTimeout(() => {
      const input = $('#tt');
      if (input) input.focus();
    }, 10);
  },

  tg: x => {
    const t = P()?.tasks.find(item => item.id === x.id);
    if (t) {
      t.done = !t.done;
      save();
      draw();
    }
  },

  delt: x => {
    P().tasks = P().tasks.filter(t => t.id !== x.id);
    save();
    draw();
  },

  signin: x => {
    if (S.p[x.id]) {
      S.cur = x.id;
      tab = 'day';
      isCreatingProfile = false;
      save();
      draw();
      showToast(`Signed in as ${P().name}.`, 'success');
    }
  },

  logout: async () => {
    const confirmed = await showConfirm('Are you sure you want to sign out?', 'Sign Out');
    if (!confirmed) return;
    S.cur = null;
    isCreatingProfile = false;
    tab = 'day';
    save();
    draw();
    showToast('Signed out successfully.');
  },

  switchprofile: () => {
    S.cur = null;
    isCreatingProfile = false;
    tab = 'day';
    save();
    draw();
  },

  togglesignup: () => {
    isCreatingProfile = !isCreatingProfile;
    tempAvatar = null;
    draw();
  },

  delp: async x => {
    const targetId = x.id || S.cur;
    const profile = S.p[targetId];
    if (!profile) return;
    const confirmed = await showConfirm(
      `Permanently delete profile "${profile.name}" and all associated habits, streaks, and tasks?`,
      'Delete Profile'
    );
    if (!confirmed) return;
    delete S.p[targetId];
    if (S.cur === targetId) {
      S.cur = Object.keys(S.p)[0] || null;
    }
    save();
    draw();
    showToast(`Deleted profile "${profile.name}".`);
  },

  starttour: () => {
    isGuideOpen = false;
    tourStep = 0;
    tab = TOUR_STEPS[0].tab;
    draw();
  },

  nexttour: () => {
    if (tourStep < TOUR_STEPS.length - 1) {
      tourStep++;
      tab = TOUR_STEPS[tourStep].tab;
      draw();
    } else {
      A.endtour();
    }
  },

  prevtour: () => {
    if (tourStep > 0) {
      tourStep--;
      tab = TOUR_STEPS[tourStep].tab;
      draw();
    }
  },

  endtour: () => {
    document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
    tourStep = -1;
    draw();
    showToast('Tour completed! Click "💡 Guide" anytime if you need help.');
  },

  openguide: () => {
    isGuideOpen = true;
    draw();
  },

  closeguide: () => {
    isGuideOpen = false;
    draw();
  },

  newp: async () => {
    const n = $('#pn')?.value.trim();
    if (!n) return showAlert('Please enter a profile name.');
    const id = safeId(null, 'u');
    S.p[id] = normalizeProfile({
      name: n,
      avatar: tempAvatar || null
    });
    S.cur = id;
    tempAvatar = null;
    isCreatingProfile = false;
    tab = 'day';
    save();
    // Launch interactive tour for new profile
    tourStep = 0;
    draw();
    showToast(`Welcome, ${n}! Let's take a quick tour.`);
  },

  renamep: () => {
    const n = $('#pedit_name')?.value.trim();
    if (!n) return showAlert('Profile name cannot be empty.');
    if (P()) {
      P().name = n;
      save();
      draw();
      showToast('Profile renamed.');
    }
  },

  pickpic: x => {
    const el = document.getElementById(x.id || 'upic');
    if (el) el.click();
  },

  rmpic: x => {
    if (x.mode === 'edit' && P()) {
      delete P().avatar;
      save();
      draw();
      showToast('Profile photo removed.');
    } else {
      tempAvatar = null;
      const img = $('#avprev');
      const ph = $('#avph');
      const rm = $('#avrm');
      if (img) { img.src = ''; img.style.display = 'none'; }
      if (ph) ph.style.display = 'flex';
      if (rm) rm.style.display = 'none';
      const inp = $('#upic');
      if (inp) inp.value = '';
    }
  },

  theme: x => {
    S.theme = x.v;
    save();
    draw();
  },

  resetaccent: x => {
    if (!['light', 'dark'].includes(x.v)) return;
    S.colors[x.v] = DEFAULT_ACCENTS[x.v];
    save();
    draw();
    showToast(`${x.v === 'dark' ? 'Dark' : 'Light'} mode color restored to default.`, 'success');
  },

  exp: () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
    a.download = `streakline-backup-${TODAY()}.json`;
    a.click();
    showToast('Backup downloaded successfully.');
  },

  imp: () => $('#imf')?.click()
};

// Global click delegation
document.addEventListener('click', e => {
  const b = e.target.closest('[data-a]');
  if (b && A[b.dataset.a]) {
    A[b.dataset.a](b.dataset);
  }
});

document.addEventListener('input', e => {
  const match = e.target.id.match(/^accent-hex-(light|dark)$/);
  if (match) updateAccent(match[1], e.target.value.trim());
});

document.addEventListener('change', e => {
  const match = e.target.id.match(/^accent-picker-(light|dark)$/);
  if (match) updateAccent(match[1], e.target.value);
});

// Keydown handler
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const id = e.target.id || '';
  if (id === 'tt') {
    A.addt();
  } else if (id.startsWith('n') && id !== 'pn') {
    A.done({ id: id.slice(1) });
  } else if (id === 'pn') {
    A.newp();
  } else if (id === 'pedit_name') {
    A.renamep();
  }
});

// File upload & select change listeners
document.addEventListener('change', async e => {
  const i = e.target;

  if ((i.id === 'upic' || i.id === 'upic_edit') && i.files?.[0]) {
    const file = i.files[0];
    try {
      const resized = await resizeImage(file, 256);
      if (i.dataset.mode === 'edit' && P()) {
        P().avatar = resized;
        save();
        draw();
        showToast('Profile photo updated.');
      } else {
        tempAvatar = resized;
        const img = $('#avprev');
        const ph = $('#avph');
        const rm = $('#avrm');
        if (img) { img.src = resized; img.style.display = 'block'; }
        if (ph) ph.style.display = 'none';
        if (rm) rm.style.display = 'inline-block';
      }
    } catch (err) {
      console.error(err);
      showAlert('Could not process image. Please try another image file.');
    }
  }

  if (i.id === 'ps') {
    S.cur = i.value;
    save();
    draw();
  }

  if (i.id === 'imf' && i.files?.[0]) {
    const file = i.files[0];
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON');
        const confirmed = await showConfirm(
          'Replace all data on this device with this backup?',
          'Import Backup'
        );
        if (confirmed) {
          S = normalizeState(parsed);
          S.colors = normalizeAccentColors(S.colors);
          save();
          draw();
          showToast('Backup restored successfully!', 'success');
        }
      } catch (err) {
        console.error(err);
        showAlert('That file is not a valid Streakline backup.');
      }
    };
    reader.readAsText(file);
  }
});

// Input preservation & focus management
function preserveInputState() {
  const active = document.activeElement;
  const activeId = active?.id || null;
  const selectionStart = active?.selectionStart ?? null;
  const selectionEnd = active?.selectionEnd ?? null;

  document.querySelectorAll('input[id^="n"]').forEach(input => {
    if (input.id !== 'pn') {
      draftNotes[input.id] = input.value;
    }
  });

  const taskInput = $('#tt');
  if (taskInput) {
    draftTask = taskInput.value;
  }

  return { activeId, selectionStart, selectionEnd };
}

function restoreInputState(saved) {
  if (!saved || !saved.activeId) return;
  const el = document.getElementById(saved.activeId);
  if (el) {
    el.focus();
    if (saved.selectionStart !== null && saved.selectionEnd !== null && typeof el.setSelectionRange === 'function') {
      el.setSelectionRange(saved.selectionStart, saved.selectionEnd);
    }
  }
}

// Master draw function
export function draw() {
  const root = document.documentElement;
  const isDarkPref = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
  const activeTheme = S.theme === 'auto' ? (isDarkPref ? 'dark' : 'light') : S.theme;
  root.dataset.theme = activeTheme;
  applyThemeColors();

  const savedFocus = preserveInputState();

  let h;
  if (!P()) {
    h = vAuth();
  } else {
    const tabs = { day: 'Day', cal: 'Calendar', habits: 'Habits', stats: 'Stats', set: 'Settings' };
    const NAV_ICONS = { day: '☀️', cal: '📅', habits: '📝', stats: '📊', set: '⚙️' };
    const p = P();
    h = `
      <header>
        <h1>Streakline</h1>
        <div class="header-actions">
          <button type="button" class="ghost guide-btn" data-a="openguide" aria-label="Open App Guide" title="App Guide &amp; Tour">
            💡 Guide
          </button>
          <button type="button" class="user-badge-btn" data-a="tab" data-v="set" aria-label="Profile and Settings: ${esc(p.name)}">
            ${p.avatar
              ? `<img class="u-avatar" src="${esc(p.avatar)}" alt="Profile photo">`
              : `<span class="u-avatar-ph">${esc(p.name[0]?.toUpperCase() || '?')}</span>`}
            <span class="user-badge-name">${esc(p.name)}</span>
          </button>
          <button type="button" class="ghost signout-btn" data-a="logout" aria-label="Sign out of current profile" title="Sign Out">
            ⏏ Out
          </button>
        </div>
      </header>
      ${({ day: vDay, cal: vCal, habits: vHab, stats: vStats, set: vSet }[tab])()}
      <div class="pill-nav" role="navigation" aria-label="Main Navigation">
        <div class="pill-nav-container">
          ${Object.entries(tabs).map(([k, label]) => `
            <button type="button" class="pill-nav-btn ${tab === k ? 'active' : ''} nav-${k}" data-a="tab" data-v="${k}" aria-current="${tab === k ? 'page' : 'false'}" aria-label="${label}">
              <span class="pill-nav-icon" aria-hidden="true">${NAV_ICONS[k]}</span>
              <span class="pill-nav-label">${label}</span>
            </button>
          `).join('')}
          <button type="button" class="pill-nav-add" data-a="tab" data-v="habits" aria-label="Add habit or go to Habits tab" title="Add Habit">＋</button>
        </div>
      </div>
    `;
  }

  $('#app').innerHTML = h;

  // Render overlay modals into body (avoids fixed-position stacking issues inside #app)
  document.querySelectorAll('.tour-backdrop, .guide-modal-overlay').forEach(el => el.remove());
  if (isGuideOpen) {
    const guideEl = document.createElement('div');
    guideEl.className = 'guide-modal-overlay';
    guideEl.innerHTML = vGuideModal();
    document.body.appendChild(guideEl);
  }
  if (tourStep >= 0) {
    const tourEl = document.createElement('div');
    tourEl.className = 'tour-modal-host';
    tourEl.innerHTML = vTourModal();
    document.body.appendChild(tourEl);
  }

  // Tour highlight management
  document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
  if (tourStep >= 0 && TOUR_STEPS[tourStep]?.highlight) {
    setTimeout(() => {
      const target = document.querySelector(TOUR_STEPS[tourStep].highlight);
      if (target) {
        target.classList.add('tour-highlight');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 80);
  }

  // Scroll heatmaps to rightmost column
  document.querySelectorAll('.hw').forEach(e => {
    e.scrollLeft = 1e5;
  });

  restoreInputState(savedFocus);
}

// Live auto-theme updater
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (S.theme === 'auto') draw();
  });
}

// Midnight rollover & visibility checks
setInterval(() => {
  const currentToday = TODAY();
  if (currentToday !== lastToday) {
    lastToday = currentToday;
    if (sel === lastToday) sel = currentToday;
    draw();
  }
}, 20000);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    const currentToday = TODAY();
    if (currentToday !== lastToday) {
      lastToday = currentToday;
      if (sel === lastToday) sel = currentToday;
    }
    draw();
  }
});

// PWA Service Worker Registration
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.log('ServiceWorker registration skipped:', err);
    });
  });
}

// Initial draw
draw();
