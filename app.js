/* Football Academy Manager — registrations, attendance, fees, expenses, reports.
 *
 * Storage has two modes:
 *  - cloud: when opened as a published claude.ai page, data lives in the page's shared
 *    database so every coach sees the same players, registers and payments live.
 *  - local: when index.html is opened directly, data is kept in this browser (localStorage).
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'academy-manager-v2';
  const LEGACY_KEY = 'academy-manager-v1';
  const COLLECTIONS = ['groups', 'players', 'sessions', 'payments', 'expenses'];
  const STATUS = {
    P: { label: 'Present' },
    L: { label: 'Late' },
    E: { label: 'Excused' },
    A: { label: 'Absent' },
  };
  const EXPENSE_CATEGORIES = ['Pitch rental', 'Equipment', 'Kits & uniforms', 'Coach pay', 'Transport', 'Tournament fees', 'Medical & first aid', 'Refreshments', 'Marketing', 'Other'];

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const thisMonth = () => isoDate().slice(0, 7);
  const fmtDate = (s) => (s ? new Date(s + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const fmtMonth = (s) => new Date(s + '-01T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const shortMonth = (s) => new Date(s + '-01T00:00:00').toLocaleDateString(undefined, { month: 'short' });
  const money = (n) => `${state.settings.currency}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const pct = (n) => (n == null ? '—' : `${Math.round(n * 100)}%`);
  const sum = (arr, f) => arr.reduce((s, x) => s + Number(f(x) || 0), 0);
  const monthsBack = (n) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - n);
    return isoDate(d).slice(0, 7);
  };

  function ageOn(dob, on = new Date()) {
    if (!dob) return null;
    const b = new Date(dob + 'T00:00:00');
    let age = on.getFullYear() - b.getFullYear();
    const m = on.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && on.getDate() < b.getDate())) age--;
    return age;
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function toCSV(rows) {
    return rows
      .map((r) => r.map((c) => {
        const s = String(c ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(','))
      .join('\n');
  }

  // ---------- Confirmation dialog (browser confirm() is blocked on hosted pages) ----------
  function ask(message, { ok = 'OK', danger = false, cancel = 'Cancel' } = {}) {
    return new Promise((resolve) => {
      const d = $('#confirm');
      $('#confirm-msg').textContent = message;
      const okBtn = $('#confirm-ok');
      const cancelBtn = $('#confirm-cancel');
      okBtn.textContent = ok;
      okBtn.className = danger ? 'danger-solid' : 'primary';
      cancelBtn.hidden = cancel === null;
      cancelBtn.textContent = cancel || '';
      const done = (v) => {
        okBtn.onclick = cancelBtn.onclick = d.oncancel = null;
        d.close();
        resolve(v);
      };
      okBtn.onclick = () => done(true);
      cancelBtn.onclick = () => done(false);
      d.oncancel = (e) => { e.preventDefault(); done(false); };
      d.showModal();
      okBtn.focus();
    });
  }
  const notify = (message) => ask(message, { cancel: null });

  // ---------- State ----------
  function defaultSettings() {
    return { academyName: 'Football Academy', currency: '₦', monthlyFee: 50000, sessionsPerMonth: 8, chargeAbsences: false };
  }
  function defaultGroups() {
    return [
      { id: 'g1', name: 'Under 8', minAge: 5, maxAge: 7, color: '#2f6fd6', schedule: 'Tue & Thu 4:00pm' },
      { id: 'g2', name: 'Under 12', minAge: 8, maxAge: 11, color: '#13804f', schedule: 'Mon & Wed 5:00pm' },
      { id: 'g3', name: 'Under 16', minAge: 12, maxAge: 15, color: '#d9771f', schedule: 'Tue & Fri 6:00pm' },
    ];
  }
  function defaultState() {
    return { settings: defaultSettings(), groups: defaultGroups(), players: [], sessions: [], payments: [], expenses: [] };
  }

  function normalize(data) {
    const s = { ...defaultState(), ...data, settings: { ...defaultSettings(), ...(data.settings || {}) } };
    COLLECTIONS.forEach((c) => { if (!Array.isArray(s[c])) s[c] = []; });
    if (!s.groups.length) s.groups = defaultGroups();
    return s;
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalize(JSON.parse(raw));
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const data = JSON.parse(legacy);
        // v1 used per-group fees in dollars; v2 uses one monthly fee in naira.
        data.settings = { ...(data.settings || {}), currency: '₦', monthlyFee: 50000, sessionsPerMonth: 8 };
        return normalize(data);
      }
    } catch (e) {
      console.warn('Could not load saved data', e);
    }
    return defaultState();
  }

  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('This browser would not save your data. Download a backup from Settings.');
    }
  }

  let state = window.claude?.use ? defaultState() : loadLocal();

  // ---------- Store: one API, local or shared database ----------
  const Store = {
    mode: window.claude?.use ? 'connecting' : 'local',
    db: null,
    downloads: null,
    user: null,
    me: { id: null, name: '' },
    canWrite: true,
    isOwner: true,
    isCoach: true,
    loaded: new Set(),
    groupsSaved: false,
    notice: '',

    get ready() {
      if (this.mode === 'parent') return true;
      return this.mode !== 'connecting' && (this.mode !== 'cloud' || this.loaded.size >= COLLECTIONS.length + 1);
    },

    async put(coll, obj) {
      obj = clone(obj);
      const list = state[coll];
      const i = list.findIndex((x) => x.id === obj.id);
      if (i >= 0) list[i] = obj; else list.push(obj);
      if (this.mode !== 'cloud') return saveLocal();
      try {
        await this.db.collection(coll).doc(obj.id).set(obj);
        scheduleFamilySync();
      } catch (e) {
        writeFailed(e);
        throw e;
      }
    },

    async remove(coll, id) {
      state[coll] = state[coll].filter((x) => x.id !== id);
      if (this.mode !== 'cloud') return saveLocal();
      try {
        await this.db.collection(coll).doc(id).delete();
        scheduleFamilySync();
      } catch (e) {
        writeFailed(e);
        throw e;
      }
    },

    async putSettings() {
      if (this.mode !== 'cloud') return saveLocal();
      try {
        await this.db.doc('config/settings').set(clone(state.settings));
        scheduleFamilySync();
      } catch (e) {
        writeFailed(e);
        throw e;
      }
    },

    // Replace everything (restore, demo, erase).
    async replaceAll(next) {
      next = normalize(clone(next));
      if (this.mode !== 'cloud') {
        state = next;
        saveLocal();
        return;
      }
      const old = clone(state);
      let done = 0;
      const total = sum(COLLECTIONS, (c) => old[c].length + next[c].length);
      for (const c of COLLECTIONS) {
        const keep = new Set(next[c].map((x) => x.id));
        for (const x of old[c]) {
          if (!keep.has(x.id)) await this.db.collection(c).doc(x.id).delete();
          if (++done % 20 === 0) toast(`Working… ${Math.round((done / total) * 100)}%`);
        }
        for (const x of next[c]) {
          await this.db.collection(c).doc(x.id).set(x);
          if (++done % 20 === 0) toast(`Working… ${Math.round((done / total) * 100)}%`);
        }
      }
      state.settings = next.settings;
      await this.db.doc('config/settings').set(next.settings);
      scheduleFamilySync();
    },
  };

  function writeFailed(e) {
    console.warn('Write failed', e);
    if (e?.code === 'invalid_argument' && Store.mode === 'cloud') {
      Store.canWrite = false;
      Store.notice = 'You can view this academy but not change it. Ask the academy owner to give you edit access.';
      render();
    } else if (e?.code === 'quota_exceeded') {
      notify('The shared database is full. Delete old registers or expenses, then try again.');
    } else {
      toast('That change was not saved. Check your connection and try again.');
    }
  }

  async function saveFile(filename, content, type = 'text/plain') {
    if (window.claude?.use) {
      const dl = Store.downloads;
      if (!dl) return notify('Downloads are not available in this view.');
      try {
        await dl.save({ filename, data: content });
      } catch (e) {
        if (e?.code !== 'declined') toast('The file could not be saved.');
      }
      return;
    }
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- Coach names ----------
  const names = {};
  function coachName(id) {
    if (!id) return '';
    if (id === Store.me.id) return 'you';
    return names[id] || 'a coach';
  }
  async function resolveNames() {
    if (!Store.user) return;
    const ids = new Set();
    for (const c of ['sessions', 'payments', 'expenses']) state[c].forEach((x) => x.by && ids.add(x.by));
    const missing = [...ids].filter((id) => !(id in names) && id !== Store.me.id);
    if (!missing.length) return;
    const ps = await Store.user.profiles(missing);
    missing.forEach((id) => { names[id] = ps[id]?.name || ''; });
    scheduleRender();
  }

  // ---------- Parent access ----------
  // Each player can have a private parent code. For every coded player the coach's app writes a
  // summary (balance, recent attendance) to family/<hash of code>, encrypted with a key derived from
  // the code. Parents can read the family collection but only decrypt their own child's summary.
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const te = new TextEncoder();
  const td = new TextDecoder();
  const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const fmtCode = (c) => normCode(c).replace(/^(.{5})(.+)$/, '$1-$2');

  function newParentCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    return [...bytes].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
  }

  const familyIdCache = new Map();
  const familyKeyCache = new Map();
  async function familyDocId(code) {
    const c = normCode(code);
    if (!familyIdCache.has(c)) familyIdCache.set(c, toHex(await crypto.subtle.digest('SHA-256', te.encode('academy-family:' + c))).slice(0, 40));
    return familyIdCache.get(c);
  }
  async function familyKey(code) {
    const c = normCode(code);
    if (!familyKeyCache.has(c)) {
      const base = await crypto.subtle.importKey('raw', te.encode(c), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: te.encode(await familyDocId(c)), iterations: 150000, hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      familyKeyCache.set(c, key);
    }
    return familyKeyCache.get(c);
  }
  async function sealSummary(code, summary) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await familyKey(code), te.encode(JSON.stringify(summary)));
    return { v: 1, iv: toB64(iv), ct: toB64(ct) };
  }
  async function openSummary(code, doc) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(doc.iv) }, await familyKey(code), fromB64(doc.ct));
    return JSON.parse(td.decode(pt));
  }

  function familySummary(p) {
    const b = playerBalance(p);
    const month = thisMonth();
    const recent = state.sessions
      .filter((s) => s.attendance?.[p.id])
      .sort((a, b2) => b2.date.localeCompare(a.date))
      .slice(0, 10)
      .map((s) => ({ d: s.date, s: s.attendance[p.id], t: s.type }));
    const lp = state.payments.filter((x) => x.playerId === p.id).sort((a, b2) => b2.date.localeCompare(a.date))[0];
    return {
      academy: state.settings.academyName,
      currency: state.settings.currency,
      fee: Number(state.settings.monthlyFee || 0),
      perMonth: Number(state.settings.sessionsPerMonth || 0),
      name: `${p.firstName} ${(p.lastName || '').slice(0, 1)}${p.lastName ? '.' : ''}`.trim(),
      group: groupById(p.groupId)?.name || '',
      active: p.status === 'active',
      balance: b.balance,
      owed: Math.round(b.owed),
      attendedThisMonth: attendedInMonth(p.id, month),
      month,
      recent,
      lastPayment: lp ? { date: lp.date, amount: Number(lp.amount || 0), sessions: round1(paymentSessions(lp)) } : null,
    };
  }

  // Bring family/* in line with the players' current balances. Runs after coaches change data.
  const familySync = { docs: [], loaded: false, running: false, again: false, timer: null };
  function scheduleFamilySync(delay = 1200) {
    if (Store.mode !== 'cloud' || !Store.isCoach) return;
    clearTimeout(familySync.timer);
    familySync.timer = setTimeout(runFamilySync, delay);
  }
  async function runFamilySync() {
    if (!familySync.loaded || !Store.ready) return scheduleFamilySync();
    if (familySync.running) { familySync.again = true; return; }
    familySync.running = true;
    try {
      const db = Store.db;
      const synced = new Map(familySync.docs.map((d) => [d.id, d]));
      const wanted = new Set();
      for (const p of state.players) {
        if (!p.parentCode) continue;
        wanted.add(p.id);
        const docId = await familyDocId(p.parentCode);
        const summary = familySummary(p);
        const sig = toHex(await crypto.subtle.digest('SHA-256', te.encode(docId + JSON.stringify(summary))));
        const prev = synced.get(p.id);
        if (prev && prev.sig === sig && prev.docId === docId) continue;
        if (prev && prev.docId !== docId) await db.collection('family').doc(prev.docId).delete();
        await db.collection('family').doc(docId).set(await sealSummary(p.parentCode, { ...summary, updated: Date.now() }));
        await db.collection('familySync').doc(p.id).set({ docId, sig });
      }
      for (const [pid, d] of synced) {
        if (wanted.has(pid)) continue;
        await db.collection('family').doc(d.docId).delete();
        await db.collection('familySync').doc(pid).delete();
      }
    } catch (e) {
      console.warn('Parent summaries not updated', e);
    } finally {
      familySync.running = false;
      if (familySync.again) { familySync.again = false; scheduleFamilySync(300); }
    }
  }

  // ---------- WhatsApp ----------
  function waNumber(phone) {
    let d = String(phone || '').replace(/[^\d+]/g, '');
    if (d.startsWith('+')) return d.slice(1);
    if (d.startsWith('00')) return d.slice(2);
    if (d.startsWith('0') && d.length === 11) return '234' + d.slice(1); // Nigerian local format
    return d;
  }
  const waLink = (phone, text) => `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;

  function balanceMessage(p) {
    const b = playerBalance(p);
    const hi = p.guardianName ? `Hello ${p.guardianName}, ` : 'Hello, ';
    const who = p.firstName;
    const month = attendedInMonth(p.id, thisMonth());
    let line;
    if (b.balance < 0) line = `${who} has attended ${fmtSessions(-b.balance)} more than paid for, so the balance owed is ${money(b.owed)}. Please pay to keep ${who} training.`;
    else if (b.balance === 0) line = `${who} has used all paid sessions. Please renew (${money(state.settings.monthlyFee)} for ${state.settings.sessionsPerMonth} sessions) before the next session.`;
    else line = `${who} has ${fmtSessions(b.balance)} left.`;
    const so = month ? ` ${who} has attended ${fmtSessions(month)} so far this month.` : '';
    return `${hi}this is ${state.settings.academyName}. ${line}${so} Thank you!`;
  }

  function codeMessage(p) {
    const link = state.settings.appLink || '';
    return `Hello${p.guardianName ? ' ' + p.guardianName : ''}, you can now check ${p.firstName}'s sessions left and attendance any time${link ? ` at ${link}` : ''}. Sign in with a free claude.ai account using the email we invited, then enter this code: ${fmtCode(p.parentCode)}. Please keep the code private.`;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Message copied');
    } catch (e) {
      notify(text);
    }
  }

  // ---------- Lookups & calculations ----------
  const groupById = (id) => state.groups.find((g) => g.id === id);
  const playerById = (id) => state.players.find((p) => p.id === id);
  const fullName = (p) => `${p.firstName} ${p.lastName}`.trim();
  const sortedGroups = () => [...state.groups].sort((a, b) => a.minAge - b.minAge);
  const activePlayers = (groupId) =>
    state.players
      .filter((p) => p.status === 'active' && (!groupId || p.groupId === groupId))
      .sort((a, b) => fullName(a).localeCompare(fullName(b)));
  const groupChip = (g) => (g ? `<span class="chip" style="--gc:${esc(g.color)}">${esc(g.name)}</span>` : '<span class="muted">—</span>');
  const medFlag = (p) => (p.medical ? ` <span class="flag" title="${esc(p.medical)}">Medical</span>` : '');

  function suggestGroup(dob) {
    const age = ageOn(dob);
    if (age == null) return null;
    return state.groups.find((g) => age >= g.minAge && age <= g.maxAge) || null;
  }

  function sessionsIn(month, groupId) {
    return state.sessions.filter((s) => s.date.startsWith(month) && (!groupId || s.groupId === groupId));
  }

  // Attendance stats for a player, optionally within a date range (inclusive ISO dates).
  function playerAttendance(playerId, from, to) {
    let counted = 0, attended = 0, absent = 0, late = 0, excused = 0;
    for (const s of state.sessions) {
      if (from && s.date < from) continue;
      if (to && s.date > to) continue;
      const st = s.attendance?.[playerId];
      if (!st) continue;
      if (st === 'E') { excused++; continue; } // excused doesn't count against the rate
      counted++;
      if (st === 'P' || st === 'L') attended++;
      if (st === 'L') late++;
      if (st === 'A') absent++;
    }
    return { counted, attended, absent, late, excused, rate: counted ? attended / counted : null };
  }

  const attendedInMonth = (playerId, month) => playerAttendance(playerId, month + '-01', month + '-31').attended;

  function sessionRate(s) {
    const vals = Object.values(s.attendance || {}).filter((v) => v !== 'E');
    if (!vals.length) return null;
    return vals.filter((v) => v === 'P' || v === 'L').length / vals.length;
  }
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  // ---------- Session balances ----------
  // Each player has a running balance of sessions: payments add sessions, attended
  // sessions use them up. A negative balance means the player owes for sessions taken.
  const sessionPrice = () => Number(state.settings.monthlyFee || 0) / Math.max(1, Number(state.settings.sessionsPerMonth || 1));
  const round1 = (n) => Math.round(n * 10) / 10;
  const fmtSessions = (n) => {
    const r = round1(n);
    return `${r.toLocaleString()} session${Math.abs(r) === 1 ? '' : 's'}`;
  };
  // Sessions a payment buys. Stored on the payment so a later price change doesn't rewrite history.
  const paymentSessions = (x) => (x.sessions != null && x.sessions !== '' ? Number(x.sessions) : sessionPrice() ? Number(x.amount || 0) / sessionPrice() : 0);
  const paymentMonth = (x) => (x.date || x.period || '').slice(0, 7);

  function usesSession(mark) {
    return mark === 'P' || mark === 'L' || (mark === 'A' && state.settings.chargeAbsences);
  }

  function playerBalance(p) {
    const opening = Number(p.openingBalance || 0);
    const bought = sum(state.payments.filter((x) => x.playerId === p.id), paymentSessions);
    const used = state.sessions.filter((s) => usesSession(s.attendance?.[p.id])).length;
    const balance = round1(opening + bought - used);
    return { opening, bought: round1(bought), used, balance, owed: balance < 0 ? -balance * sessionPrice() : 0 };
  }

  const LOW_BALANCE = 2;
  // Small warning shown next to a name on the register when a player owes or is about to run out.
  function balanceTag(p) {
    const b = playerBalance(p);
    if (b.balance < 0) return ` <span class="tag bad">owes ${fmtSessions(-b.balance)}</span>`;
    if (b.balance <= LOW_BALANCE) return ` <span class="tag warn">${fmtSessions(b.balance)} left</span>`;
    return '';
  }
  function balanceBadge(b) {
    if (b.balance < 0) return `<span class="badge bad" title="Owes ${money(b.owed)}">Owes ${fmtSessions(-b.balance)}</span>`;
    if (b.balance === 0) return '<span class="badge warn">0 left</span>';
    if (b.balance <= LOW_BALANCE) return `<span class="badge warn">${fmtSessions(b.balance)} left</span>`;
    return `<span class="badge ok">${fmtSessions(b.balance)} left</span>`;
  }

  function monthFinance(month) {
    const pays = state.payments.filter((x) => paymentMonth(x) === month);
    const collected = sum(pays, (x) => x.amount);
    const sessionsSold = round1(sum(pays, paymentSessions));
    const spent = sum(state.expenses.filter((x) => x.date?.startsWith(month)), (x) => x.amount);
    return { collected, sessionsSold, spent, net: collected - spent };
  }

  function owingSummary(players = activePlayers()) {
    const rows = players.map((p) => ({ p, b: playerBalance(p) }));
    const owing = rows.filter((r) => r.b.balance < 0);
    return {
      rows,
      owingCount: owing.length,
      owedAmount: sum(owing, (r) => r.b.owed),
      owedSessions: round1(sum(owing, (r) => -r.b.balance)),
      prepaidSessions: round1(sum(rows.filter((r) => r.b.balance > 0), (r) => r.b.balance)),
    };
  }

  // ---------- Modal ----------
  const modal = $('#modal');
  const modalForm = $('#modal-form');

  function openModal(html, onSubmit) {
    modalForm.innerHTML = html;
    modalForm.onsubmit = async (e) => {
      e.preventDefault();
      if (e.submitter?.value !== 'save') return modal.close();
      const data = Object.fromEntries(new FormData(modalForm).entries());
      if ((await onSubmit(data)) !== false) modal.close();
    };
    modal.showModal();
    const first = modalForm.querySelector('input, select, textarea');
    if (first) first.focus();
  }

  const modalActions = (label = 'Save') =>
    `<div class="modal-actions"><button value="cancel" formnovalidate>Cancel</button><button class="primary" value="save">${label}</button></div>`;

  const groupOptions = (selected, includeAll = false) =>
    (includeAll ? '<option value="">All groups</option>' : '') +
    sortedGroups().map((g) => `<option value="${g.id}" ${g.id === selected ? 'selected' : ''}>${esc(g.name)}</option>`).join('');

  // ---------- Players ----------
  function editPlayer(id) {
    const p = id ? playerById(id) : null;
    const v = p || { firstName: '', lastName: '', dob: '', groupId: '', guardianName: '', phone: '', email: '', address: '', medical: '', joined: isoDate(), status: 'active', notes: '', openingBalance: 0 };
    openModal(`
      <h2>${p ? 'Edit player' : 'Register new player'}</h2>
      <div class="form-grid">
        <div class="field"><label for="f-first">First name *</label><input id="f-first" name="firstName" required value="${esc(v.firstName)}"></div>
        <div class="field"><label for="f-last">Last name *</label><input id="f-last" name="lastName" required value="${esc(v.lastName)}"></div>
        <div class="field"><label for="f-dob">Date of birth *</label><input id="f-dob" type="date" name="dob" required value="${esc(v.dob)}" max="${isoDate()}"></div>
        <div class="field"><label for="f-group">Age group *</label><select id="f-group" name="groupId" required><option value="">Select…</option>${groupOptions(v.groupId)}</select>
          <span class="hint" id="group-hint"></span></div>
        <div class="field"><label for="f-guardian">Parent / guardian</label><input id="f-guardian" name="guardianName" value="${esc(v.guardianName)}"></div>
        <div class="field"><label for="f-phone">Phone</label><input id="f-phone" type="tel" name="phone" value="${esc(v.phone)}"></div>
        <div class="field"><label for="f-email">Email</label><input id="f-email" type="email" name="email" value="${esc(v.email)}"></div>
        <div class="field"><label for="f-joined">Registration date</label><input id="f-joined" type="date" name="joined" value="${esc(v.joined)}"></div>
        <div class="field full"><label for="f-address">Address</label><input id="f-address" name="address" value="${esc(v.address)}"></div>
        <div class="field full"><label for="f-medical">Medical info / allergies</label><textarea id="f-medical" name="medical">${esc(v.medical)}</textarea></div>
        <div class="field full"><label for="f-notes">Notes</label><textarea id="f-notes" name="notes">${esc(v.notes)}</textarea></div>
        <div class="field"><label for="f-status">Status</label><select id="f-status" name="status">
          <option value="active" ${v.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="inactive" ${v.status === 'inactive' ? 'selected' : ''}>Inactive / left</option>
        </select></div>
        <div class="field"><label for="f-opening">Starting balance (sessions)</label><input id="f-opening" type="number" step="any" name="openingBalance" value="${esc(v.openingBalance ?? 0)}">
          <span class="hint">Sessions owed or prepaid before using this app. Use a minus for owed, e.g. -3.</span></div>
      </div>
      ${modalActions(p ? 'Save changes' : 'Register')}
    `, (data) => {
      data.firstName = data.firstName.trim();
      data.lastName = data.lastName.trim();
      data.openingBalance = Number(data.openingBalance || 0);
      const rec = p ? { ...p, ...data } : { id: uid(), ...data };
      Store.put('players', rec).then(() => toast(p ? 'Player updated' : `${data.firstName} registered`), () => {});
      render();
    });

    const dobInput = $('[name=dob]', modalForm);
    const groupSel = $('[name=groupId]', modalForm);
    const hint = $('#group-hint', modalForm);
    const updateHint = () => {
      const age = ageOn(dobInput.value);
      const g = suggestGroup(dobInput.value);
      hint.textContent = age == null ? '' : g ? `Age ${age}: suggested group is ${g.name}` : `Age ${age} is outside every group's range`;
      if (g && !groupSel.value) groupSel.value = g.id;
    };
    dobInput.addEventListener('change', updateHint);
    updateHint();
  }

  async function deletePlayer(id) {
    const p = playerById(id);
    if (!p) return;
    const ok = await ask(`Delete ${fullName(p)}? Their attendance marks and payments are deleted too. To keep their history, edit them and set Status to Inactive instead.`, { ok: 'Delete player', danger: true });
    if (!ok) return;
    try {
      for (const pay of state.payments.filter((x) => x.playerId === id)) await Store.remove('payments', pay.id);
      for (const s of state.sessions.filter((x) => x.attendance?.[id])) {
        const next = clone(s);
        delete next.attendance[id];
        await Store.put('sessions', next);
      }
      await Store.remove('players', id);
      toast('Player deleted');
    } catch (e) { /* writeFailed already told the user */ }
    render();
  }

  function viewPlayer(id) {
    const p = playerById(id);
    if (!p) return;
    const g = groupById(p.groupId);
    const att = playerAttendance(id);
    const month = thisMonth();
    const b = playerBalance(p);
    const history = state.sessions.filter((s) => s.attendance?.[id]).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
    const pays = state.payments.filter((x) => x.playerId === id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
    openModal(`
      <h2>${esc(fullName(p))} ${groupChip(g)}</h2>
      <div class="form-grid">
        <div><div class="hint">Age</div>${ageOn(p.dob) ?? '—'} <span class="muted">(born ${fmtDate(p.dob)})</span></div>
        <div><div class="hint">Registered</div>${fmtDate(p.joined)}</div>
        <div><div class="hint">Parent / guardian</div>${esc(p.guardianName) || '—'}</div>
        <div><div class="hint">Phone</div>${p.phone ? `<a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>` : '—'}</div>
        <div><div class="hint">Email</div>${esc(p.email) || '—'}</div>
        <div><div class="hint">Session balance</div>${balanceBadge(b)}${b.owed ? ` <span class="muted">(${money(b.owed)})</span>` : ''}</div>
        <div><div class="hint">Sessions attended this month</div>${attendedInMonth(id, month)}</div>
        <div class="full hint">${b.opening ? `${fmtSessions(b.opening)} starting balance · ` : ''}${fmtSessions(b.bought)} paid for · ${fmtSessions(b.used)} used</div>
        ${p.medical ? `<div class="full"><div class="hint">Medical</div><span class="flag">Medical</span> ${esc(p.medical)}</div>` : ''}
        ${p.notes ? `<div class="full"><div class="hint">Notes</div>${esc(p.notes)}</div>` : ''}
      </div>
      <h3>Attendance: ${pct(att.rate)}</h3>
      <p class="muted tight">${att.attended} attended · ${att.absent} absent · ${att.late} late · ${att.excused} excused</p>
      ${history.length ? `<div class="table-wrap"><table><tbody>${history.map((s) => `<tr><td>${fmtDate(s.date)}</td><td>${esc(s.type)}</td><td><span class="mark m-${s.attendance[id]}">${STATUS[s.attendance[id]].label}</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No sessions recorded yet.</p>'}
      <h3>Parent</h3>
      <div class="toolbar">
        <a class="btn small-btn" href="${esc(waLink(p.phone, balanceMessage(p)))}" target="_blank" rel="noopener">Send balance on WhatsApp</a>
        <button type="button" class="small" id="pv-copy">Copy balance message</button>
      </div>
      ${Store.mode === 'cloud' ? `<div class="parent-box">
        ${p.parentCode
          ? `<div>Parent code <strong class="code">${esc(fmtCode(p.parentCode))}</strong></div>
             <p class="hint tight">The parent enters this code on the app to see ${esc(p.firstName)}'s sessions. Invite their email from the Share menu as a viewer first.</p>
             <div class="toolbar">
               <a class="btn small-btn" href="${esc(waLink(p.phone, codeMessage(p)))}" target="_blank" rel="noopener">Send code on WhatsApp</a>
               <button type="button" class="small" id="pv-copy-code">Copy code message</button>
               <button type="button" class="small danger" id="pv-new-code">Replace code</button>
             </div>`
          : `<p class="tight">Give the parent a private code so they can check ${esc(p.firstName)}'s sessions themselves.</p>
             <div class="toolbar"><button type="button" class="small primary" id="pv-new-code">Create parent code</button></div>`}
      </div>` : ''}
      <h3>Recent payments</h3>
      ${pays.length ? `<div class="table-wrap"><table><tbody>${pays.map((x) => `<tr><td>${fmtDate(x.date)}</td><td>${fmtSessions(paymentSessions(x))}</td><td class="num">${money(x.amount)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No payments recorded.</p>'}
      <div class="modal-actions"><button value="cancel">Close</button></div>
    `, () => {});
    $('#pv-copy', modalForm)?.addEventListener('click', () => copyText(balanceMessage(p)));
    $('#pv-copy-code', modalForm)?.addEventListener('click', () => copyText(codeMessage(p)));
    $('#pv-new-code', modalForm)?.addEventListener('click', async () => {
      if (!Store.canWrite) return toast('You have view-only access.');
      if (p.parentCode && !(await ask(`Replace ${p.firstName}'s parent code? The old code stops working and you'll need to send the new one.`, { ok: 'Replace code', danger: true }))) return;
      try {
        await Store.put('players', { ...p, parentCode: newParentCode() });
        toast('Parent code created');
      } catch (e) { /* reported */ }
      viewPlayer(id);
    });
  }

  // ---------- Payments ----------
  function addPayment(playerId) {
    const players = activePlayers();
    if (!players.length) return notify('Register a player first.');
    const fee = Number(state.settings.monthlyFee || 0);
    const per = Number(state.settings.sessionsPerMonth || 0);
    openModal(`
      <h2>Record payment</h2>
      <div class="form-grid">
        <div class="field full"><label for="p-player">Player *</label><select id="p-player" name="playerId" required>
          <option value="">Select…</option>
          ${players.map((p) => `<option value="${p.id}" ${p.id === playerId ? 'selected' : ''}>${esc(fullName(p))} (${esc(groupById(p.groupId)?.name || '')})</option>`).join('')}
        </select>
        <span class="hint" id="p-current"></span></div>
        <div class="field full"><span class="label-like">Quick fill</span>
          <div class="toolbar">
            ${[1, 2, 3].map((m) => `<button type="button" class="small" data-months="${m}">${m} month${m > 1 ? 's' : ''} · ${money(fee * m)}</button>`).join('')}
            <button type="button" class="small" id="p-clear" hidden>Clear debt</button>
          </div></div>
        <div class="field"><label for="p-amount">Amount (${esc(state.settings.currency)}) *</label><input id="p-amount" type="number" name="amount" min="0" step="any" required></div>
        <div class="field"><label for="p-sessions">Sessions this pays for *</label><input id="p-sessions" type="number" name="sessions" step="any" required>
          <span class="hint">Filled in from the amount at ${money(sessionPrice())} a session. Change it for discounts or free sessions.</span></div>
        <div class="field"><label for="p-date">Date received</label><input id="p-date" type="date" name="date" value="${isoDate()}"></div>
        <div class="field"><label for="p-method">Method</label><select id="p-method" name="method"><option>Cash</option><option>Bank transfer</option><option>POS / card</option><option>Other</option></select></div>
        <div class="field full"><label for="p-note">Note</label><input id="p-note" name="note" placeholder="e.g. October to December"></div>
      </div>
      <p class="after" id="p-after"></p>
      ${modalActions('Save payment')}
    `, (data) => {
      const sessions = Number(data.sessions);
      if (!Number.isFinite(sessions)) return false;
      Store.put('payments', { id: uid(), ...data, amount: Number(data.amount), sessions: round1(sessions), period: (data.date || isoDate()).slice(0, 7), by: Store.me.id || null })
        .then(() => toast('Payment recorded'), () => {});
      render();
    });
    const sel = $('#p-player', modalForm);
    const amt = $('#p-amount', modalForm);
    const ses = $('#p-sessions', modalForm);
    const cur = $('#p-current', modalForm);
    const after = $('#p-after', modalForm);
    const clearBtn = $('#p-clear', modalForm);
    let sessionsEdited = false;
    const update = () => {
      const p = playerById(sel.value);
      const b = p ? playerBalance(p) : null;
      cur.innerHTML = b ? `Current balance: ${balanceBadge(b)}${b.owed ? ` which is ${money(b.owed)}` : ''}` : '';
      clearBtn.hidden = !(b && b.balance < 0);
      if (b && b.balance < 0) clearBtn.textContent = `Clear debt · ${money(b.owed)}`;
      const add = Number(ses.value);
      after.innerHTML = b && ses.value !== '' && Number.isFinite(add)
        ? `After this payment: ${balanceBadge({ ...b, balance: round1(b.balance + add) })}`
        : '';
    };
    const setAmount = (amount, sessions) => {
      amt.value = amount;
      ses.value = sessions;
      sessionsEdited = false;
      update();
    };
    amt.addEventListener('input', () => {
      if (!sessionsEdited && sessionPrice()) ses.value = round1(Number(amt.value || 0) / sessionPrice());
      update();
    });
    ses.addEventListener('input', () => { sessionsEdited = true; update(); });
    sel.addEventListener('change', update);
    $$('[data-months]', modalForm).forEach((btn) => btn.addEventListener('click', () => {
      const m = Number(btn.dataset.months);
      setAmount(fee * m, per * m);
    }));
    clearBtn.addEventListener('click', () => {
      const b = playerBalance(playerById(sel.value));
      setAmount(Math.round(b.owed), -b.balance);
    });
    setAmount(fee, per);
  }

  // ---------- Expenses ----------
  function editExpense(id) {
    const x = id ? state.expenses.find((e) => e.id === id) : null;
    const v = x || { date: isoDate(), category: 'Pitch rental', description: '', amount: '', method: 'Cash', groupId: '' };
    openModal(`
      <h2>${x ? 'Edit expense' : 'Add expense'}</h2>
      <div class="form-grid">
        <div class="field"><label for="x-date">Date *</label><input id="x-date" type="date" name="date" required value="${esc(v.date)}"></div>
        <div class="field"><label for="x-amount">Amount (${esc(state.settings.currency)}) *</label><input id="x-amount" type="number" name="amount" min="0" step="any" required value="${esc(v.amount)}"></div>
        <div class="field"><label for="x-cat">Category *</label><select id="x-cat" name="category" required>${EXPENSE_CATEGORIES.map((c) => `<option ${c === v.category ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="field"><label for="x-group">For group</label><select id="x-group" name="groupId"><option value="">Whole academy</option>${groupOptions(v.groupId)}</select></div>
        <div class="field full"><label for="x-desc">Description *</label><input id="x-desc" name="description" required value="${esc(v.description)}" placeholder="e.g. 10 match balls, pitch hire for October"></div>
        <div class="field"><label for="x-method">Paid by</label><select id="x-method" name="method">${['Cash', 'Bank transfer', 'POS / card', 'Other'].map((m) => `<option ${m === v.method ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
      </div>
      ${modalActions(x ? 'Save changes' : 'Add expense')}
    `, (data) => {
      const rec = { ...(x || { id: uid(), by: Store.me.id || null }), ...data, amount: Number(data.amount) };
      Store.put('expenses', rec).then(() => toast(x ? 'Expense updated' : 'Expense added'), () => {});
      render();
    });
  }

  // ---------- Views ----------
  const views = {};
  const ui = {
    playerSearch: '', playerGroup: '', playerStatus: 'active',
    attGroup: '', attDate: isoDate(),
    payMonth: thisMonth(), payGroup: '', payFilter: '',
    expMonth: thisMonth(), expCat: '',
    repFrom: '', repTo: '', repGroup: '',
  };

  const stat = (label, value, sub, tone = '') =>
    `<div class="stat ${tone}"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;

  views.dashboard = () => {
    const active = activePlayers();
    const today = isoDate();
    const month = thisMonth();
    const per = state.settings.sessionsPerMonth;
    const monthSessions = sessionsIn(month);
    const avgRate = avg(monthSessions.map(sessionRate).filter((r) => r != null));
    const f = monthFinance(month);
    const owe = owingSummary(active);

    const since = isoDate(new Date(Date.now() - 30 * 864e5));
    const lowAtt = active
      .map((p) => ({ p, a: playerAttendance(p.id, since) }))
      .filter((x) => x.a.counted >= 3 && x.a.rate < 0.6)
      .sort((a, b) => a.a.rate - b.a.rate)
      .slice(0, 8);
    const recent = [...state.sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

    return `
      <div class="page-head"><h1>${esc(fmtMonth(month))}</h1>
        <div class="toolbar">
          <button data-act="new-expense">Add expense</button>
          <button class="primary" data-act="new-player">Register player</button>
        </div>
      </div>
      <div class="stats">
        ${stat('Active players', active.length, `${state.players.length - active.length} inactive`)}
        ${stat('Attendance', pct(avgRate), `${monthSessions.length} sessions this month`)}
        ${stat('Fees collected', money(f.collected), `${fmtSessions(f.sessionsSold)} paid for this month`)}
        ${stat('Owed to academy', money(owe.owedAmount), `${owe.owingCount} player${owe.owingCount === 1 ? '' : 's'} owe ${fmtSessions(owe.owedSessions)}`, owe.owedAmount ? 'bad' : '')}
        ${stat('Expenses', money(f.spent), `${state.expenses.filter((x) => x.date?.startsWith(month)).length} items`)}
        ${stat('Net this month', money(f.net), 'fees collected minus expenses', f.net < 0 ? 'bad' : 'good')}
      </div>
      <div class="grid groups">
        ${sortedGroups().map((g) => {
          const ps = activePlayers(g.id);
          const gs = sessionsIn(month, g.id);
          const todays = state.sessions.find((s) => s.groupId === g.id && s.date === today);
          return `<section class="card group-card" style="--gc:${esc(g.color)}">
            <h2>${esc(g.name)} <span class="muted small">ages ${g.minAge}–${g.maxAge}</span></h2>
            <div class="row"><span>Players</span><strong>${ps.length}</strong></div>
            <div class="row"><span>Training</span><span>${esc(g.schedule) || '—'}</span></div>
            <div class="row"><span>Sessions this month</span><strong>${gs.length} of ${per}</strong></div>
            <div class="pips" aria-hidden="true">${Array.from({ length: Math.max(per, gs.length) }, (_, i) => `<i class="${i < gs.length ? 'on' : ''}"></i>`).join('')}</div>
            <div class="row"><span>Attendance</span><strong>${pct(avg(gs.map(sessionRate).filter((r) => r != null)))}</strong></div>
            <button class="small" data-act="take-att" data-group="${g.id}">${todays ? 'Edit today’s register' : 'Take today’s register'}</button>
          </section>`;
        }).join('')}
      </div>
      <div class="grid two">
        <section class="card"><h2>Recent sessions</h2>
          ${recent.length ? `<div class="table-wrap"><table><tbody>${recent.map((s) => `<tr><td>${fmtDate(s.date)}</td><td>${groupChip(groupById(s.groupId))}</td><td class="muted small">${s.by ? esc(coachName(s.by)) : ''}</td><td class="num">${pct(sessionRate(s))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No registers yet. Take the first one from a group card above.</p>'}
        </section>
        <section class="card"><h2>Low attendance, last 30 days</h2>
          ${lowAtt.length ? `<div class="table-wrap"><table><tbody>${lowAtt.map(({ p, a }) => `<tr><td><button class="link" data-act="view-player" data-id="${p.id}">${esc(fullName(p))}</button></td><td>${groupChip(groupById(p.groupId))}</td><td class="num">${pct(a.rate)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Every player with 3 or more sessions is at 60% or above.</p>'}
        </section>
      </div>
    `;
  };

  views.players = () => {
    const q = ui.playerSearch.toLowerCase();
    const month = thisMonth();
    const list = state.players
      .filter((p) => (!ui.playerGroup || p.groupId === ui.playerGroup) && (!ui.playerStatus || p.status === ui.playerStatus))
      .filter((p) => !q || [fullName(p), p.guardianName, p.phone, p.email].join(' ').toLowerCase().includes(q))
      .sort((a, b) => fullName(a).localeCompare(fullName(b)));
    return `
      <div class="page-head"><h1>Players <span class="muted count">${list.length}</span></h1>
        <div class="toolbar">
          <button data-act="export-players">Export CSV</button>
          <button class="primary" data-act="new-player">Register player</button>
        </div>
      </div>
      <section class="card">
        <div class="toolbar filters">
          <input id="player-search" type="search" placeholder="Search name, guardian, phone" data-ui="playerSearch" value="${esc(ui.playerSearch)}" aria-label="Search players">
          <select id="player-group" data-ui="playerGroup" aria-label="Group">${groupOptions(ui.playerGroup, true)}</select>
          <select id="player-status" data-ui="playerStatus" aria-label="Status">
            <option value="active" ${ui.playerStatus === 'active' ? 'selected' : ''}>Active</option>
            <option value="inactive" ${ui.playerStatus === 'inactive' ? 'selected' : ''}>Inactive</option>
            <option value="" ${ui.playerStatus === '' ? 'selected' : ''}>All</option>
          </select>
        </div>
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Group</th><th class="num">Age</th><th class="hide-sm">Guardian</th><th class="hide-sm">Phone</th><th class="num">Attendance</th><th>Balance</th><th></th></tr></thead>
          <tbody>${list.map((p) => {
            const a = playerAttendance(p.id);
            const g = groupById(p.groupId);
            const age = ageOn(p.dob);
            const outOfRange = g && age != null && (age < g.minAge || age > g.maxAge);
            return `<tr>
              <td><button class="link" data-act="view-player" data-id="${p.id}">${esc(fullName(p))}</button>${medFlag(p)}</td>
              <td>${groupChip(g)}</td>
              <td class="num${outOfRange ? ' out' : ''}" ${outOfRange ? 'title="Age is outside this group’s range"' : ''}>${age ?? '—'}</td>
              <td class="hide-sm">${esc(p.guardianName)}</td>
              <td class="hide-sm">${esc(p.phone)}</td>
              <td class="num">${pct(a.rate)}</td>
              <td>${balanceBadge(playerBalance(p))}</td>
              <td class="actions">
                <button class="small" data-act="edit-player" data-id="${p.id}">Edit</button>
                <button class="small danger" data-act="delete-player" data-id="${p.id}" aria-label="Delete ${esc(fullName(p))}">Delete</button>
              </td></tr>`;
          }).join('')}</tbody></table></div>`
        : `<p class="empty">${state.players.length ? 'No players match these filters.' : 'No players yet. Click Register player to add the first one.'}</p>`}
      </section>`;
  };

  // Draft register being edited (saved only on "Save register").
  let attDraft = null;

  function loadAttDraft() {
    if (!groupById(ui.attGroup)) ui.attGroup = sortedGroups()[0]?.id || '';
    if (attDraft && attDraft.groupId === ui.attGroup && attDraft.date === ui.attDate) return;
    const existing = state.sessions.find((s) => s.groupId === ui.attGroup && s.date === ui.attDate);
    attDraft = existing
      ? { ...clone(existing), loadedAt: existing.updatedAt || 0, isNew: false }
      : { id: `${ui.attGroup}_${ui.attDate}`, groupId: ui.attGroup, date: ui.attDate, type: 'Training', notes: '', attendance: {}, loadedAt: 0, isNew: true };
  }

  function syncAttMeta() {
    if (!attDraft) return;
    const t = $('#att-type'); if (t) attDraft.type = t.value;
    const n = $('#att-notes'); if (n) attDraft.notes = n.value;
  }

  views.attendance = () => {
    loadAttDraft();
    const g = groupById(ui.attGroup);
    const players = activePlayers(ui.attGroup);
    const extra = Object.keys(attDraft.attendance).map(playerById).filter((p) => p && !players.includes(p));
    const roster = [...players, ...extra];
    const counts = { P: 0, L: 0, E: 0, A: 0 };
    Object.values(attDraft.attendance).forEach((v) => counts[v]++);
    const unmarked = roster.filter((p) => !attDraft.attendance[p.id]).length;
    const history = state.sessions.filter((s) => s.groupId === ui.attGroup).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
    const month = ui.attDate.slice(0, 7);
    const monthCount = sessionsIn(month, ui.attGroup).filter((s) => s.date <= ui.attDate).length + (attDraft.isNew ? 1 : 0);
    const saved = state.sessions.find((s) => s.id === attDraft.id || (s.groupId === ui.attGroup && s.date === ui.attDate));

    return `
      <div class="page-head"><h1>Attendance</h1></div>
      <section class="card">
        <div class="toolbar filters">
          <select id="att-group" data-ui="attGroup" aria-label="Group">${groupOptions(ui.attGroup)}</select>
          <input id="att-date" type="date" data-ui="attDate" value="${ui.attDate}" aria-label="Date">
          <select id="att-type" aria-label="Session type">${['Training', 'Match', 'Tournament', 'Other'].map((t) => `<option ${attDraft.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
        </div>
        <p class="muted tight">${saved ? `Saved register${saved.by ? `, last saved by ${esc(coachName(saved.by))}` : ''}.` : 'New register, not saved yet.'}
          Session ${monthCount} of ${state.settings.sessionsPerMonth} for ${esc(g?.name || '')} in ${esc(fmtMonth(month))}.</p>
        ${roster.length ? `
          <div class="toolbar between">
            <span class="tally"><span class="mark m-P">${counts.P} present</span><span class="mark m-L">${counts.L} late</span><span class="mark m-E">${counts.E} excused</span><span class="mark m-A">${counts.A} absent</span>${unmarked ? `<span class="muted">${unmarked} unmarked</span>` : ''}</span>
            <span class="toolbar">
              <button class="small" data-act="att-all">All present</button>
              <button class="small" data-act="att-rest">Unmarked to absent</button>
            </span>
          </div>
          <div class="roster">${roster.map((p) => `
            <div class="att-row">
              <span class="att-name">${esc(fullName(p))}${p.status !== 'active' ? ' <span class="muted">(inactive)</span>' : ''}${medFlag(p)}${balanceTag(p)}</span>
              <span class="att-btns">${Object.keys(STATUS).map((k) => `<button type="button" data-act="att-mark" data-id="${p.id}" data-s="${k}" class="${attDraft.attendance[p.id] === k ? 'on' : ''}" title="${STATUS[k].label}" aria-pressed="${attDraft.attendance[p.id] === k}">${k}</button>`).join('')}</span>
            </div>`).join('')}
          </div>
          <div class="field"><label for="att-notes">Session notes</label><textarea id="att-notes" placeholder="Drills, match score, injuries">${esc(attDraft.notes)}</textarea></div>
          <div class="toolbar end">
            ${saved ? '<button class="danger" data-act="att-delete">Delete register</button>' : ''}
            <button class="primary" data-act="att-save">Save register</button>
          </div>`
        : `<p class="empty">No active players in ${esc(g?.name || 'this group')}. <a href="#players">Register players</a> first.</p>`}
      </section>
      <section class="card"><h2>${esc(g?.name || '')} session history</h2>
        ${history.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Date</th><th>Type</th><th class="hide-sm">Taken by</th><th class="num">Present</th><th class="num">Absent</th><th class="num">Rate</th><th></th></tr></thead>
          <tbody>${history.map((s) => {
            const v = Object.values(s.attendance || {});
            return `<tr><td>${fmtDate(s.date)}</td><td>${esc(s.type)}</td><td class="hide-sm muted">${esc(coachName(s.by))}</td>
              <td class="num">${v.filter((x) => x === 'P' || x === 'L').length}</td>
              <td class="num">${v.filter((x) => x === 'A').length}</td>
              <td class="num">${pct(sessionRate(s))}</td>
              <td class="actions"><button class="small" data-act="att-open" data-date="${s.date}">Open</button></td></tr>`;
          }).join('')}</tbody></table></div>` : '<p class="empty">No registers saved for this group yet.</p>'}
      </section>`;
  };

  views.payments = () => {
    const month = ui.payMonth || thisMonth();
    const per = state.settings.sessionsPerMonth;
    const sumry = owingSummary(activePlayers(ui.payGroup));
    const filters = {
      '': () => true,
      owing: (b) => b.balance < 0,
      low: (b) => b.balance >= 0 && b.balance <= LOW_BALANCE,
      ahead: (b) => b.balance > LOW_BALANCE,
    };
    const rows = sumry.rows.filter((r) => (filters[ui.payFilter] || filters[''])(r.b));
    const f = monthFinance(month);
    const log = state.payments
      .filter((x) => paymentMonth(x) === month && (!ui.payGroup || playerById(x.playerId)?.groupId === ui.payGroup))
      .sort((a, b) => b.date.localeCompare(a.date));
    const lastPay = (id) => state.payments.filter((x) => x.playerId === id).sort((a, b) => b.date.localeCompare(a.date))[0];
    return `
      <div class="page-head"><h1>Fees</h1>
        <div class="toolbar">
          <select id="pay-group" data-ui="payGroup" aria-label="Group">${groupOptions(ui.payGroup, true)}</select>
          ${sumry.owingCount ? '<button data-act="remind-all">Message parents who owe</button>' : ''}
          <button class="primary" data-act="new-payment">Record payment</button>
        </div>
      </div>
      <p class="muted tight">${money(state.settings.monthlyFee)} buys ${per} sessions (${money(sessionPrice())} a session). Each session a player attends uses one${state.settings.chargeAbsences ? ', and so does an unexcused absence' : ''}. A negative balance means they owe.</p>
      <div class="stats">
        ${stat('Players owing', sumry.owingCount, `${fmtSessions(sumry.owedSessions)} in total`, sumry.owingCount ? 'bad' : '')}
        ${stat('Amount owed', money(sumry.owedAmount), `at ${money(sessionPrice())} a session`, sumry.owedAmount ? 'bad' : '')}
        ${stat('Prepaid', fmtSessions(sumry.prepaidSessions), `worth ${money(sumry.prepaidSessions * sessionPrice())}`)}
        ${stat('Collected', money(f.collected), `in ${esc(fmtMonth(month))}`, 'good')}
      </div>
      <section class="card">
        <div class="between"><h2>Session balances</h2>
          <div class="toolbar seg" role="group" aria-label="Show">
            ${[['', 'All'], ['owing', 'Owing'], ['low', `${LOW_BALANCE} or fewer left`], ['ahead', 'Paid ahead']].map(([k, label]) => `<button class="small ${ui.payFilter === k ? 'on' : ''}" data-act="pay-filter" data-f="${k}" aria-pressed="${ui.payFilter === k}">${label}</button>`).join('')}
          </div>
        </div>
        ${rows.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Player</th><th>Group</th><th class="num hide-sm">Paid for</th><th class="num hide-sm">Used</th><th>Balance</th><th class="num">Owes</th><th class="hide-sm">Last paid</th><th></th></tr></thead>
          <tbody>${rows.sort((a, b) => a.b.balance - b.b.balance || fullName(a.p).localeCompare(fullName(b.p))).map(({ p, b }) => {
            const lp = lastPay(p.id);
            return `<tr>
            <td><button class="link" data-act="view-player" data-id="${p.id}">${esc(fullName(p))}</button></td><td>${groupChip(groupById(p.groupId))}</td>
            <td class="num hide-sm">${round1(b.bought + b.opening)}</td>
            <td class="num hide-sm">${b.used}</td>
            <td>${balanceBadge(b)}</td>
            <td class="num ${b.owed ? 'neg' : 'muted'}">${b.owed ? money(b.owed) : '—'}</td>
            <td class="hide-sm muted">${lp ? fmtDate(lp.date) : 'Never'}</td>
            <td class="actions">${b.balance <= LOW_BALANCE ? `<a class="btn small-btn" href="${esc(waLink(p.phone, balanceMessage(p)))}" target="_blank" rel="noopener" title="Send balance to parent on WhatsApp">Remind</a> ` : ''}<button class="small" data-act="new-payment" data-id="${p.id}">Record</button></td>
          </tr>`;
          }).join('')}</tbody></table></div>` : `<p class="empty">${sumry.rows.length ? 'No players match this filter.' : 'No active players.'}</p>`}
      </section>
      <div class="between"><h2 class="flush">Payments received</h2><input id="pay-month" type="month" data-ui="payMonth" value="${month}" aria-label="Month"></div>
      <section class="card">
        ${log.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Date</th><th>Player</th><th class="num">Sessions</th><th class="hide-sm">Method</th><th class="hide-sm">Recorded by</th><th class="hide-sm">Note</th><th class="num">Amount</th><th></th></tr></thead>
          <tbody>${log.map((x) => {
            const p = playerById(x.playerId);
            return `<tr><td>${fmtDate(x.date)}</td><td>${p ? esc(fullName(p)) : '<span class="muted">Deleted player</span>'}</td><td class="num">${round1(paymentSessions(x))}</td><td class="hide-sm">${esc(x.method)}</td>
              <td class="hide-sm muted">${esc(coachName(x.by))}</td><td class="hide-sm">${esc(x.note)}</td><td class="num">${money(x.amount)}</td>
              <td class="actions"><button class="small danger" data-act="delete-payment" data-id="${x.id}">Delete</button></td></tr>`;
          }).join('')}</tbody></table></div>` : '<p class="empty">No payments recorded for this month yet.</p>'}
      </section>`;
  };

  views.expenses = () => {
    const month = ui.expMonth || thisMonth();
    const inMonth = state.expenses.filter((x) => x.date?.startsWith(month));
    const list = inMonth.filter((x) => !ui.expCat || x.category === ui.expCat).sort((a, b) => b.date.localeCompare(a.date));
    const f = monthFinance(month);
    const byCat = EXPENSE_CATEGORIES.map((c) => ({ c, total: sum(inMonth.filter((x) => x.category === c), (x) => x.amount) }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);
    const maxCat = byCat[0]?.total || 1;
    return `
      <div class="page-head"><h1>Expenses</h1>
        <div class="toolbar">
          <input id="exp-month" type="month" data-ui="expMonth" value="${month}" aria-label="Month">
          <select id="exp-cat" data-ui="expCat" aria-label="Category"><option value="">All categories</option>${EXPENSE_CATEGORIES.map((c) => `<option ${c === ui.expCat ? 'selected' : ''}>${c}</option>`).join('')}</select>
          <button data-act="export-expenses">Export CSV</button>
          <button class="primary" data-act="new-expense">Add expense</button>
        </div>
      </div>
      <div class="stats three">
        ${stat('Spent', money(f.spent), `${inMonth.length} items in ${esc(fmtMonth(month))}`)}
        ${stat('Fees collected', money(f.collected), esc(fmtMonth(month)))}
        ${stat('Net', money(f.net), f.net < 0 ? 'spent more than collected' : 'collected minus spent', f.net < 0 ? 'bad' : 'good')}
      </div>
      <div class="grid two wide-left">
        <section class="card"><h2>${ui.expCat ? esc(ui.expCat) : 'All expenses'}</h2>
          ${list.length ? `<div class="table-wrap"><table>
            <thead><tr><th>Date</th><th>Description</th><th class="hide-sm">Category</th><th class="hide-sm">Group</th><th class="num">Amount</th><th></th></tr></thead>
            <tbody>${list.map((x) => `<tr>
              <td>${fmtDate(x.date)}</td>
              <td>${esc(x.description)}<div class="muted small">${esc(x.method)}${x.by ? ` · added by ${esc(coachName(x.by))}` : ''}</div></td>
              <td class="hide-sm">${esc(x.category)}</td>
              <td class="hide-sm">${x.groupId ? groupChip(groupById(x.groupId)) : '<span class="muted">Academy</span>'}</td>
              <td class="num">${money(x.amount)}</td>
              <td class="actions"><button class="small" data-act="edit-expense" data-id="${x.id}">Edit</button>
                <button class="small danger" data-act="delete-expense" data-id="${x.id}">Delete</button></td>
            </tr>`).join('')}</tbody></table></div>` : '<p class="empty">No expenses for this month. Add pitch hire, equipment, transport and other costs here.</p>'}
        </section>
        <section class="card"><h2>By category</h2>
          ${byCat.length ? byCat.map((r) => `<div class="catrow"><div class="between"><span>${esc(r.c)}</span><span class="num">${money(r.total)}</span></div><div class="bar"><div style="width:${Math.round((r.total / maxCat) * 100)}%"></div></div></div>`).join('') : '<p class="empty">Nothing spent yet.</p>'}
        </section>
      </div>`;
  };

  function reportRows() {
    return activePlayers(ui.repGroup).map((p) => ({ p, a: playerAttendance(p.id, ui.repFrom || null, ui.repTo || null) }));
  }

  views.reports = () => {
    const rows = reportRows();
    const sessions = state.sessions.filter((s) => (!ui.repGroup || s.groupId === ui.repGroup) && (!ui.repFrom || s.date >= ui.repFrom) && (!ui.repTo || s.date <= ui.repTo));
    const months = Array.from({ length: 6 }, (_, i) => monthsBack(i));
    return `
      <div class="page-head"><h1>Reports</h1></div>
      <section class="card"><div class="between"><h2>Money, last 6 months</h2><button class="small" data-act="export-finance">Export CSV</button></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Month</th><th class="num">Sessions paid for</th><th class="num">Fees collected</th><th class="num">Expenses</th><th class="num">Net</th></tr></thead>
          <tbody>${months.map((m) => {
            const f = monthFinance(m);
            return `<tr><td>${esc(fmtMonth(m))}</td><td class="num">${f.sessionsSold}</td><td class="num">${money(f.collected)}</td><td class="num">${money(f.spent)}</td><td class="num ${f.net < 0 ? 'neg' : ''}">${money(f.net)}</td></tr>`;
          }).join('')}</tbody></table></div>
      </section>
      <section class="card">
        <div class="between"><h2>Attendance by player</h2><button class="small" data-act="export-report">Export CSV</button></div>
        <div class="toolbar filters">
          <select id="rep-group" data-ui="repGroup" aria-label="Group">${groupOptions(ui.repGroup, true)}</select>
          <label class="muted inline">From <input id="rep-from" type="date" data-ui="repFrom" value="${ui.repFrom}"></label>
          <label class="muted inline">To <input id="rep-to" type="date" data-ui="repTo" value="${ui.repTo}"></label>
          <button class="small" data-act="rep-range" data-days="30">Last 30 days</button>
          <button class="small" data-act="rep-range" data-days="90">Last 90 days</button>
          <button class="small" data-act="rep-range" data-days="0">All time</button>
        </div>
        <p class="muted tight">${sessions.length} sessions in this range. Excused absences don't lower the rate.</p>
        ${rows.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Player</th><th>Group</th><th class="num">Attended</th><th class="num">Late</th><th class="num">Absent</th><th class="num">Excused</th><th>Rate</th></tr></thead>
          <tbody>${rows.sort((x, y) => (y.a.rate ?? -1) - (x.a.rate ?? -1)).map(({ p, a }) => `<tr>
            <td>${esc(fullName(p))}</td><td>${groupChip(groupById(p.groupId))}</td>
            <td class="num">${a.attended}</td><td class="num">${a.late}</td><td class="num">${a.absent}</td><td class="num">${a.excused}</td>
            <td><div class="ratecell"><div class="bar"><div style="width:${Math.round((a.rate || 0) * 100)}%"></div></div><span class="num">${pct(a.rate)}</span></div></td>
          </tr>`).join('')}</tbody></table></div>` : '<p class="empty">No players to report on.</p>'}
      </section>`;
  };

  views.settings = () => {
    const cloud = Store.mode === 'cloud';
    return `
    <div class="page-head"><h1>Settings</h1></div>
    <section class="card"><h2>Academy and fees</h2>
      <div class="form-grid narrow">
        <div class="field"><label for="set-name">Academy name</label><input id="set-name" value="${esc(state.settings.academyName)}"></div>
        <div class="field"><label for="set-currency">Currency symbol</label><input id="set-currency" value="${esc(state.settings.currency)}" maxlength="4"></div>
        <div class="field"><label for="set-fee">Monthly fee per player</label><input id="set-fee" type="number" min="0" step="any" value="${state.settings.monthlyFee}"></div>
        <div class="field"><label for="set-per">Sessions per month</label><input id="set-per" type="number" min="1" max="31" value="${state.settings.sessionsPerMonth}"></div>
        <div class="field full"><label for="set-link">App link for parents</label><input id="set-link" type="url" value="${esc(state.settings.appLink || '')}" placeholder="https://claude.ai/artifact/…">
          <span class="hint">Included in the code message sent to parents.</span></div>
        <label class="check full" for="set-absent"><input id="set-absent" type="checkbox" ${state.settings.chargeAbsences ? 'checked' : ''}> Unexcused absences use up a paid session</label>
        <p class="hint full">Present and late always use a session. Excused absences never do. Changing these settings recalculates every player's balance; sessions already paid for stay as recorded.</p>
      </div>
      <div class="toolbar"><button class="primary" data-act="save-settings">Save</button></div>
    </section>
    <section class="card"><h2>Age groups</h2>
      <p class="muted tight">Names, the age range used to suggest a group at registration, and training times.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Min age</th><th>Max age</th><th>Training schedule</th><th>Colour</th></tr></thead>
        <tbody>${sortedGroups().map((g) => `<tr data-group-row="${g.id}">
          <td><input id="g-${g.id}-name" name="name" value="${esc(g.name)}" class="w-name" aria-label="Name"></td>
          <td><input id="g-${g.id}-min" name="minAge" type="number" min="0" max="30" value="${g.minAge}" class="w-num" aria-label="Min age"></td>
          <td><input id="g-${g.id}-max" name="maxAge" type="number" min="0" max="30" value="${g.maxAge}" class="w-num" aria-label="Max age"></td>
          <td><input id="g-${g.id}-sched" name="schedule" value="${esc(g.schedule)}" class="w-sched" aria-label="Training schedule"></td>
          <td><input id="g-${g.id}-color" name="color" type="color" value="${esc(g.color)}" class="w-color" aria-label="Colour"></td>
        </tr>`).join('')}</tbody>
      </table></div>
      <div class="toolbar"><button class="primary" data-act="save-groups">Save groups</button></div>
    </section>
    <section class="card"><h2>${cloud ? 'Coaches and shared data' : 'Your data'}</h2>
      ${cloud
        ? `<p class="tight">Everyone you share this page with sees the same players, registers, fees and expenses, live. To add a coach, open the Share menu, invite them by email, and give them edit access. A coach with view-only access can look but not change anything.</p>
           <p class="muted tight">Download a backup now and then, so you have a copy outside the shared database.</p>`
        : '<p class="muted tight">Data is saved in this browser only. Download a backup regularly, and use it to move your data to another device or into the shared version for coaches.</p>'}
      <div class="toolbar">
        <button data-act="backup">Download backup</button>
        <label class="btn" for="restore-file">Restore from backup</label><input type="file" accept="application/json,.json" id="restore-file" hidden>
        ${cloud ? '' : '<button data-act="demo">Load demo data</button>'}
        ${!cloud || Store.isOwner ? '<button class="danger" data-act="reset">Erase all data</button>' : ''}
      </div>
    </section>`;
  };

  // ---------- Actions ----------
  // Actions that only read data; everything else changes data and needs edit access.
  const READ_ONLY_ACTS = new Set(['view-player', 'att-open', 'att-mark', 'att-all', 'att-rest', 'rep-range', 'export-players', 'export-report', 'export-expenses', 'export-finance', 'backup', 'take-att', 'pay-filter', 'remind-all']);

  const actions = {
    'new-player': () => editPlayer(),
    'edit-player': (el) => editPlayer(el.dataset.id),
    'view-player': (el) => viewPlayer(el.dataset.id),
    'delete-player': (el) => deletePlayer(el.dataset.id),
    'take-att': (el) => { ui.attGroup = el.dataset.group; ui.attDate = isoDate(); attDraft = null; location.hash = '#attendance'; },
    'att-mark': (el) => {
      const { id, s } = el.dataset;
      if (attDraft.attendance[id] === s) delete attDraft.attendance[id];
      else attDraft.attendance[id] = s;
      render();
    },
    'att-all': () => { activePlayers(ui.attGroup).forEach((p) => (attDraft.attendance[p.id] = 'P')); render(); },
    'att-rest': () => { activePlayers(ui.attGroup).forEach((p) => { if (!attDraft.attendance[p.id]) attDraft.attendance[p.id] = 'A'; }); render(); },
    'att-save': async () => {
      syncAttMeta();
      if (!Object.keys(attDraft.attendance).length) return notify('Mark at least one player before saving.');
      const unmarked = activePlayers(ui.attGroup).filter((p) => !attDraft.attendance[p.id]).length;
      if (unmarked && !(await ask(`${unmarked} player${unmarked === 1 ? ' is' : 's are'} unmarked and won't be counted. Save anyway?`, { ok: 'Save register' }))) return;
      const current = state.sessions.find((s) => s.id === attDraft.id);
      if (current && (current.updatedAt || 0) > attDraft.loadedAt && current.by !== Store.me.id) {
        const when = new Date(current.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        if (!(await ask(`${coachName(current.by)} saved this register at ${when}, after you opened it. Replace their version with yours?`, { ok: 'Replace', danger: true }))) return;
      }
      const { loadedAt, isNew, ...rec } = attDraft;
      rec.updatedAt = Date.now();
      rec.by = Store.me.id || null;
      try {
        await Store.put('sessions', rec);
        attDraft = null;
        toast('Register saved');
      } catch (e) { /* reported */ }
      render();
    },
    'att-delete': async () => {
      if (!(await ask('Delete this register? The attendance marks for this session are removed.', { ok: 'Delete register', danger: true }))) return;
      const id = state.sessions.find((s) => s.groupId === ui.attGroup && s.date === ui.attDate)?.id;
      attDraft = null;
      if (id) await Store.remove('sessions', id).then(() => toast('Register deleted'), () => {});
      render();
    },
    'att-open': (el) => { ui.attDate = el.dataset.date; attDraft = null; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    'new-payment': (el) => addPayment(el.dataset.id),
    'pay-filter': (el) => { ui.payFilter = el.dataset.f; render(); },
    'remind-all': () => {
      const rows = owingSummary(activePlayers(ui.payGroup)).rows.filter((r) => r.b.balance < 0).sort((a, b) => a.b.balance - b.b.balance);
      openModal(`
        <h2>Message parents who owe</h2>
        <p class="muted tight">Tap each parent to open WhatsApp with their child's balance filled in, then press send.</p>
        <div class="remind-list">${rows.map(({ p, b }) => `
          <div class="between remind-row"><span><strong>${esc(fullName(p))}</strong> <span class="muted">${esc(p.guardianName || '')}${p.phone ? '' : ' · no phone saved'}</span><br>${balanceBadge(b)} <span class="muted">${money(b.owed)}</span></span>
            <a class="btn small-btn" href="${esc(waLink(p.phone, balanceMessage(p)))}" target="_blank" rel="noopener">WhatsApp</a></div>`).join('')}
        </div>
        <div class="modal-actions"><button value="cancel">Done</button></div>`, () => {});
    },
    'delete-payment': async (el) => {
      const x = state.payments.find((p) => p.id === el.dataset.id);
      if (!x || !(await ask(`Delete this ${money(x.amount)} payment?`, { ok: 'Delete', danger: true }))) return;
      await Store.remove('payments', x.id).then(() => toast('Payment deleted'), () => {});
      render();
    },
    'new-expense': () => editExpense(),
    'edit-expense': (el) => editExpense(el.dataset.id),
    'delete-expense': async (el) => {
      const x = state.expenses.find((e) => e.id === el.dataset.id);
      if (!x || !(await ask(`Delete “${x.description}” (${money(x.amount)})?`, { ok: 'Delete', danger: true }))) return;
      await Store.remove('expenses', x.id).then(() => toast('Expense deleted'), () => {});
      render();
    },
    'export-players': () => {
      const rows = [['First name', 'Last name', 'Date of birth', 'Age', 'Group', 'Guardian', 'Phone', 'Email', 'Address', 'Medical', 'Registered', 'Status', 'Attendance %', 'Session balance', 'Amount owed', 'Notes']];
      state.players.forEach((p) => {
        const a = playerAttendance(p.id);
        const b = playerBalance(p);
        rows.push([p.firstName, p.lastName, p.dob, ageOn(p.dob), groupById(p.groupId)?.name, p.guardianName, p.phone, p.email, p.address, p.medical, p.joined, p.status, a.rate == null ? '' : Math.round(a.rate * 100), b.balance, Math.round(b.owed), p.notes]);
      });
      saveFile(`players-${isoDate()}.csv`, toCSV(rows), 'text/csv');
    },
    'export-report': () => {
      const rows = [['Player', 'Group', 'Attended', 'Late', 'Absent', 'Excused', 'Rate %']];
      reportRows().forEach(({ p, a }) => rows.push([fullName(p), groupById(p.groupId)?.name, a.attended, a.late, a.absent, a.excused, a.rate == null ? '' : Math.round(a.rate * 100)]));
      saveFile(`attendance-${ui.repFrom || 'all'}-to-${ui.repTo || isoDate()}.csv`, toCSV(rows), 'text/csv');
    },
    'export-expenses': () => {
      const month = ui.expMonth || thisMonth();
      const rows = [['Date', 'Category', 'Description', 'Group', 'Method', 'Amount']];
      state.expenses.filter((x) => x.date?.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date))
        .forEach((x) => rows.push([x.date, x.category, x.description, groupById(x.groupId)?.name || 'Academy', x.method, x.amount]));
      saveFile(`expenses-${month}.csv`, toCSV(rows), 'text/csv');
    },
    'export-finance': () => {
      const rows = [['Month', 'Sessions paid for', 'Fees collected', 'Expenses', 'Net']];
      Array.from({ length: 12 }, (_, i) => monthsBack(i)).forEach((m) => {
        const f = monthFinance(m);
        rows.push([m, f.sessionsSold, f.collected, f.spent, f.net]);
      });
      saveFile(`finance-${isoDate()}.csv`, toCSV(rows), 'text/csv');
    },
    'rep-range': (el) => {
      const days = Number(el.dataset.days);
      ui.repFrom = days ? isoDate(new Date(Date.now() - days * 864e5)) : '';
      ui.repTo = '';
      render();
    },
    'save-settings': async () => {
      const fee = Number($('#set-fee').value);
      const per = Math.round(Number($('#set-per').value));
      if (!(fee >= 0) || !(per >= 1)) return notify('Enter a fee of 0 or more and at least 1 session per month.');
      state.settings = {
        ...state.settings,
        academyName: $('#set-name').value.trim() || 'Football Academy',
        currency: $('#set-currency').value,
        monthlyFee: fee,
        sessionsPerMonth: per,
        chargeAbsences: $('#set-absent').checked,
        appLink: $('#set-link').value.trim(),
      };
      await Store.putSettings().then(() => toast('Settings saved'), () => {});
      render();
    },
    'save-groups': async () => {
      try {
        for (const row of $$('[data-group-row]')) {
          const g = clone(groupById(row.dataset.groupRow));
          const val = (n) => $(`[name=${n}]`, row).value;
          g.name = val('name').trim() || g.name;
          g.minAge = Number(val('minAge'));
          g.maxAge = Number(val('maxAge'));
          g.schedule = val('schedule');
          g.color = val('color');
          await Store.put('groups', g);
        }
        toast('Age groups saved');
      } catch (e) { /* reported */ }
      render();
    },
    backup: () => saveFile(`academy-backup-${isoDate()}.json`, JSON.stringify(state, null, 2), 'application/json'),
    demo: async () => {
      if (state.players.length && !(await ask('Replace all current data with demo data?', { ok: 'Load demo data', danger: true }))) return;
      await Store.replaceAll(demoState());
      attDraft = null;
      toast('Demo data loaded');
      render();
    },
    reset: async () => {
      if (!(await ask('Erase all players, registers, fees and expenses? This cannot be undone. Download a backup first if you might need this data.', { ok: 'Erase everything', danger: true }))) return;
      try {
        await Store.replaceAll({ settings: state.settings, groups: state.groups });
        attDraft = null;
        toast('All data erased');
      } catch (e) { writeFailed(e); }
      render();
    },
  };

  function demoState() {
    const s = defaultState();
    const first = ['Adam', 'Tunde', 'Chidi', 'Yusuf', 'Emeka', 'Musa', 'Sola', 'Ibrahim', 'Kelechi', 'Daniel', 'Femi', 'Uche', 'Samuel', 'Bayo', 'Ahmed', 'Obinna', 'David', 'Hassan', 'Ifeanyi', 'Segun', 'Bilal', 'Kunle', 'Tobi', 'Nnamdi'];
    const last = ['Adeyemi', 'Okafor', 'Bello', 'Eze', 'Lawal', 'Okonkwo', 'Abubakar', 'Balogun', 'Nwosu', 'Ogunleye'];
    const now = new Date();
    let n = 0;
    s.groups.forEach((g) => {
      for (let i = 0; i < 8; i++) {
        const age = g.minAge + (i % (g.maxAge - g.minAge + 1));
        const dob = new Date(now.getFullYear() - age, (i * 3 + n) % 12, 1 + ((i * 7) % 27));
        const ln = last[(n * 3) % last.length];
        s.players.push({
          id: `demo-p${n}`, firstName: first[n % first.length], lastName: ln, dob: isoDate(dob), groupId: g.id,
          guardianName: `${['Mrs', 'Mr', 'Mrs', 'Mr'][n % 4]} ${ln}`, phone: `0803 555 ${pad(n)}${pad(n * 3 % 100)}`, email: '',
          address: '', medical: n % 9 === 0 ? 'Asthma, inhaler in bag' : '', joined: isoDate(new Date(now - (60 + n) * 864e5)),
          status: 'active', notes: '',
        });
        n++;
      }
    });
    s.groups.forEach((g, gi) => {
      const ps = s.players.filter((p) => p.groupId === g.id);
      for (let d = 42; d >= 1; d--) {
        const date = new Date(now - d * 864e5);
        if (![1 + gi, 4 + (gi % 2)].includes(date.getDay())) continue;
        const attendance = {};
        ps.forEach((p, i) => {
          const r = (Math.sin(d * 13 + i * 7 + gi) + 1) / 2;
          attendance[p.id] = r < 0.08 + (i === 3 ? 0.4 : 0) ? 'A' : r < 0.14 ? 'E' : r < 0.22 ? 'L' : 'P';
        });
        s.sessions.push({ id: `${g.id}_${isoDate(date)}`, groupId: g.id, date: isoDate(date), type: 'Training', notes: '', attendance, updatedAt: date.getTime() });
      }
    });
    // Mix of payers: monthly, three months up front, behind on payments, and a carried-over debt.
    const fee = s.settings.monthlyFee;
    const per = s.settings.sessionsPerMonth;
    const daysAgo = (d) => isoDate(new Date(now - d * 864e5));
    s.players.forEach((p, i) => {
      const pay = (k, months, d, note = '') => s.payments.push({ id: `demo-pay${i}-${k}`, playerId: p.id, amount: fee * months, sessions: per * months, date: daysAgo(d), period: daysAgo(d).slice(0, 7), method: i % 2 ? 'Cash' : 'Bank transfer', note });
      if (i % 6 === 0) pay(0, 3, 40, 'Three months up front');
      else if (i % 6 === 5) pay(0, 1, 40); // behind: only one month paid
      else { pay(0, 1, 40); pay(1, 1, 1 + (i % 4)); }
      if (i % 11 === 2) p.openingBalance = -3; // owed from before the app
    });
    [
      ['Pitch rental', 'Pitch hire for the month', 300000, '03'],
      ['Equipment', '12 size-4 match balls', 96000, '06'],
      ['Transport', 'Bus to friendly match (U12)', 45000, '11', 'g2'],
      ['Refreshments', 'Water and drinks', 18000, '12'],
      ['Coach pay', 'Assistant coach stipend', 150000, '01'],
    ].forEach(([category, description, amount, day, groupId], i) => {
      [thisMonth(), monthsBack(1)].forEach((m, mi) => {
        if (mi === 0 && i === 2) return;
        s.expenses.push({ id: `demo-x${i}-${mi}`, date: `${m}-${day}`, category, description, amount, method: 'Bank transfer', groupId: groupId || '' });
      });
    });
    return s;
  }

  // ---------- Routing & rendering ----------
  function currentRoute() {
    if (Store.mode === 'parent') return 'parent';
    const r = location.hash.slice(1);
    return views[r] ? r : 'dashboard';
  }

  function banner() {
    if (Store.mode === 'cloud' && !Store.canWrite) return `<div class="banner">${esc(Store.notice || 'You can view this academy but not change it. Ask the academy owner to give you edit access.')}</div>`;
    if (Store.notice) return `<div class="banner">${esc(Store.notice)}</div>`;
    return '';
  }

  function render() {
    const route = currentRoute();
    if (route === 'attendance') syncAttMeta();
    $('#academy-name').textContent = Store.mode === 'parent' ? 'Parent view' : state.settings.academyName;
    document.title = `${state.settings.academyName}`;
    $$('#tabs a').forEach((a) => a.classList.toggle('active', a.dataset.route === route));
    const who = $('#who');
    if (Store.mode === 'cloud') {
      who.hidden = false;
      who.innerHTML = `<span class="dot live"></span>${Store.me.name ? esc(Store.me.name) : 'Shared'}`;
      who.title = 'Connected to the shared academy database';
    } else if (Store.mode === 'parent') {
      who.hidden = false;
      who.innerHTML = `<span class="dot live"></span>${Store.me.name ? esc(Store.me.name) : 'Parent'}`;
      who.title = 'Parent view';
    } else if (Store.mode === 'local') {
      who.hidden = false;
      who.innerHTML = '<span class="dot"></span>This device';
      who.title = 'Data is saved in this browser only';
    }
    const view = $('#view');
    if (!Store.ready) {
      view.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading academy data…</p></div>';
      return;
    }
    const focused = document.activeElement?.dataset?.ui;
    const caret = document.activeElement?.selectionStart;
    view.innerHTML = banner() + views[route]();
    if (focused) {
      const el = $(`[data-ui="${focused}"]`, view);
      if (el) { el.focus(); if (caret != null && el.type === 'search') el.setSelectionRange(caret, caret); }
    }
    resolveNames();
  }

  // Renders triggered by other coaches' changes wait while someone is typing in the page.
  let renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      const a = document.activeElement;
      const typing = a && $('#view').contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !a.dataset.ui;
      if (typing) {
        a.addEventListener('blur', scheduleRender, { once: true });
        return;
      }
      render();
    });
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !actions[el.dataset.act] || el.closest('dialog')) return;
    e.preventDefault();
    if (Store.mode === 'cloud' && !Store.canWrite && !READ_ONLY_ACTS.has(el.dataset.act)) {
      return toast('You have view-only access.');
    }
    actions[el.dataset.act](el);
  });

  document.addEventListener('input', (e) => {
    const key = e.target.dataset?.ui;
    if (!key || e.target.type !== 'search') return;
    ui[key] = e.target.value;
    render();
  });

  document.addEventListener('change', async (e) => {
    const key = e.target.dataset?.ui;
    if (key) {
      if (key === 'attGroup' || key === 'attDate') {
        if (!e.target.value) return;
        attDraft = null;
      }
      ui[key] = e.target.value;
      render();
      return;
    }
    if (e.target.id === 'restore-file') {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      let data;
      try {
        data = JSON.parse(await file.text());
        if (!Array.isArray(data.players) || !Array.isArray(data.groups)) throw new Error('it is not an academy backup file');
      } catch (err) {
        return notify(`That file could not be restored: ${err.message}.`);
      }
      if (!(await ask(`Restore this backup with ${data.players.length} players? Everything currently in the app is replaced.`, { ok: 'Restore backup', danger: true }))) return;
      try {
        await Store.replaceAll(data);
        attDraft = null;
        toast('Backup restored');
      } catch (err) { writeFailed(err); }
      render();
    }
  });

  window.addEventListener('hashchange', render);

  // ---------- Boot ----------
  async function connectCloud() {
    const claude = window.claude;
    const db = await claude.use('db');
    if (!db) {
      Store.mode = 'local';
      Store.notice = 'The shared database is not available right now, so changes are saved on this device only. Sign in to claude.ai and reload to work with your coaches.';
      state = loadLocal();
      render();
      return;
    }
    Store.db = db;
    Store.mode = 'cloud';
    state = { ...defaultState(), groups: [] };
    const [user, downloads] = await Promise.all([claude.use('user'), claude.use('downloads')]);
    Store.user = user;
    Store.downloads = downloads;
    if (user) {
      const [me, canWrite, isOwner, canEdit] = await Promise.all([user.me(), user.can('data.write'), user.isOwner(), user.canEdit()]);
      Store.me = { id: me.id, name: me.name };
      Store.isOwner = isOwner;
      if (canWrite === false) Store.canWrite = false;
      // Coaches are Editors; anyone else who opens the page is a parent.
      Store.isCoach = isOwner || canEdit;
    }
    if (!Store.isCoach) return startParentMode(db);

    const onError = (e) => {
      console.warn('Live updates stopped', e);
      Store.notice = 'Live updates stopped. Reload the page to see the latest changes from other coaches.';
      scheduleRender();
    };
    for (const c of COLLECTIONS) {
      db.collection(c).onSnapshot((snap) => {
        state[c] = snap.docs.map((d) => ({ ...clone(d.data()), id: d.id }));
        if (c === 'groups' && !state.groups.length) state.groups = defaultGroups();
        Store.loaded.add(c);
        scheduleRender();
      }, onError);
    }
    db.doc('config/settings').onSnapshot((snap) => {
      state.settings = { ...defaultSettings(), ...(snap.exists ? clone(snap.data()) : {}) };
      Store.loaded.add('settings');
      scheduleRender();
    }, onError);
    db.collection('familySync').onSnapshot((snap) => {
      familySync.docs = snap.docs.map((d) => ({ ...clone(d.data()), id: d.id }));
      if (!familySync.loaded) {
        familySync.loaded = true;
        scheduleFamilySync(2500); // catch up once after opening, e.g. after a settings change elsewhere
      }
    }, onError);
  }

  // ---------- Parent mode ----------
  const PARENT_KEY = 'academy-parent-codes';
  const parent = { children: new Map(), adding: false, error: '' };

  function savedCodes() {
    try { return JSON.parse(localStorage.getItem(PARENT_KEY) || '[]'); } catch (e) { return []; }
  }
  function storeCodes() {
    try { localStorage.setItem(PARENT_KEY, JSON.stringify([...parent.children.keys()])); } catch (e) { /* convenience only */ }
  }

  async function watchChild(code) {
    const c = normCode(code);
    if (parent.children.has(c)) return true;
    const entry = { code: c, status: 'loading', data: null, unsub: null };
    parent.children.set(c, entry);
    const docId = await familyDocId(c);
    entry.unsub = Store.db.collection('family').doc(docId).onSnapshot(async (snap) => {
      if (!snap.exists) { entry.status = 'missing'; scheduleRender(); return; }
      try {
        entry.data = await openSummary(c, snap.data());
        entry.status = 'ok';
      } catch (e) {
        entry.status = 'missing';
      }
      scheduleRender();
    }, () => { entry.status = 'error'; scheduleRender(); });
    return true;
  }

  function startParentMode(db) {
    Store.mode = 'parent';
    document.body.classList.add('parent-mode');
    savedCodes().forEach(watchChild);
    render();
  }

  function childCard(entry) {
    if (entry.status === 'loading') return `<section class="card child"><div class="loading small-pad"><div class="spinner"></div><p>Looking up code ${esc(fmtCode(entry.code))}…</p></div></section>`;
    if (entry.status !== 'ok') {
      return `<section class="card child"><h2>Code ${esc(fmtCode(entry.code))}</h2>
        <p class="tight">${entry.status === 'error' ? 'This page could not reach the academy. Reload and try again.' : 'No child matches this code. Check it with your coach; codes look like ABCDE-23456.'}</p>
        <div class="toolbar"><button class="small danger" data-act="parent-remove" data-code="${entry.code}">Remove</button></div></section>`;
    }
    const d = entry.data;
    const cur = (n) => `${d.currency}${Number(n || 0).toLocaleString()}`;
    const tone = d.balance < 0 ? 'bad' : d.balance <= LOW_BALANCE ? 'warn' : 'good';
    const big = d.balance < 0 ? `Owes ${fmtSessions(-d.balance)}` : `${fmtSessions(d.balance)} left`;
    const sub = d.balance < 0
      ? `${cur(d.owed)} to pay for sessions already attended`
      : d.balance === 0 ? `Time to renew: ${cur(d.fee)} for ${d.perMonth} sessions` : `${cur(d.fee)} buys ${d.perMonth} sessions`;
    return `<section class="card child">
      <div class="between"><div><h2 class="flush">${esc(d.name)}</h2><span class="muted">${esc(d.group)}${d.active ? '' : ' · not currently active'}</span></div>
        <button class="small" data-act="parent-remove" data-code="${entry.code}">Remove</button></div>
      <div class="balance-big ${tone}"><div class="value">${esc(big)}</div><div class="sub">${esc(sub)}</div></div>
      <div class="facts">
        <div><div class="hint">Attended in ${esc(fmtMonth(d.month))}</div><strong>${fmtSessions(d.attendedThisMonth)}</strong></div>
        <div><div class="hint">Last payment</div><strong>${d.lastPayment ? `${cur(d.lastPayment.amount)}` : 'None yet'}</strong>${d.lastPayment ? ` <span class="muted">on ${fmtDate(d.lastPayment.date)}, ${fmtSessions(d.lastPayment.sessions)}</span>` : ''}</div>
      </div>
      <h3>Recent sessions</h3>
      ${d.recent.length ? `<div class="table-wrap"><table><tbody>${d.recent.map((r) => `<tr><td>${fmtDate(r.d)}</td><td>${esc(r.t)}</td><td><span class="mark m-${esc(r.s)}">${esc(STATUS[r.s]?.label || r.s)}</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted tight">No sessions recorded yet.</p>'}
      <p class="hint tight">Updated ${new Date(d.updated).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}. Questions about this balance? Ask your coach.</p>
    </section>`;
  }

  views.parent = () => {
    const entries = [...parent.children.values()];
    const academy = entries.find((e) => e.data)?.data.academy;
    return `
      <div class="page-head"><h1>${academy ? esc(academy) : 'Your child’s sessions'}</h1></div>
      ${entries.map(childCard).join('')}
      <section class="card">
        <h2>${entries.length ? 'Add another child' : 'Enter your child’s code'}</h2>
        <p class="muted tight">Your coach sends each family a private code. It shows only your own child's sessions and attendance.</p>
        <form class="toolbar" id="parent-form">
          <input id="parent-code" placeholder="ABCDE-23456" autocomplete="off" autocapitalize="characters" aria-label="Child's code" maxlength="14" class="code-input">
          <button class="primary" type="submit">Show sessions</button>
        </form>
        ${parent.error ? `<p class="hint bad-text">${esc(parent.error)}</p>` : ''}
      </section>`;
  };

  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'parent-form') return;
    e.preventDefault();
    const code = normCode($('#parent-code').value);
    if (code.length !== 10) {
      parent.error = 'Codes have 10 letters and numbers, like ABCDE-23456.';
      return render();
    }
    parent.error = '';
    await watchChild(code);
    storeCodes();
    render();
  });

  actions['parent-remove'] = (el) => {
    const entry = parent.children.get(el.dataset.code);
    entry?.unsub?.();
    parent.children.delete(el.dataset.code);
    storeCodes();
    render();
  };
  READ_ONLY_ACTS.add('parent-remove');

  render();
  if (Store.mode === 'connecting') connectCloud().catch((e) => {
    console.error(e);
    Store.mode = 'local';
    Store.notice = 'Could not connect to the shared database, so changes are saved on this device only.';
    state = loadLocal();
    render();
  });
})();
