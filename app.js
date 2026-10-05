/* Football Academy Manager — registrations, attendance, payments, reports.
 * All data is stored in the browser (localStorage). Use Settings → Backup to save a copy. */
(() => {
  'use strict';

  const STORAGE_KEY = 'academy-manager-v1';
  const STATUS = {
    P: { label: 'Present', short: 'P' },
    L: { label: 'Late', short: 'L' },
    E: { label: 'Excused', short: 'E' },
    A: { label: 'Absent', short: 'A' },
  };

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const thisMonth = () => isoDate().slice(0, 7);
  const fmtDate = (s) => (s ? new Date(s + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const fmtMonth = (s) => new Date(s + '-01T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const money = (n) => `${state.settings.currency}${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const pct = (n) => (n == null ? '—' : `${Math.round(n * 100)}%`);

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
    toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function download(filename, content, type = 'text/plain') {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function toCSV(rows) {
    return rows
      .map((r) => r.map((c) => {
        const s = String(c ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(','))
      .join('\n');
  }

  // ---------- State ----------
  function defaultState() {
    return {
      settings: { academyName: 'Football Academy', currency: '$' },
      groups: [
        { id: 'g1', name: 'Under 8', minAge: 5, maxAge: 7, color: '#2e86de', schedule: 'Tue & Thu 4:00pm', fee: 30 },
        { id: 'g2', name: 'Under 12', minAge: 8, maxAge: 11, color: '#13804f', schedule: 'Mon & Wed 5:00pm', fee: 40 },
        { id: 'g3', name: 'Under 16', minAge: 12, maxAge: 15, color: '#e67e22', schedule: 'Tue & Fri 6:00pm', fee: 50 },
      ],
      players: [],
      sessions: [],
      payments: [],
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        return { ...defaultState(), ...data, settings: { ...defaultState().settings, ...data.settings } };
      }
    } catch (e) {
      console.warn('Could not load saved data', e);
    }
    return defaultState();
  }

  let state = load();

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      alert('Could not save data in this browser. Please export a backup from Settings.');
    }
  }

  const groupById = (id) => state.groups.find((g) => g.id === id);
  const playerById = (id) => state.players.find((p) => p.id === id);
  const fullName = (p) => `${p.firstName} ${p.lastName}`.trim();
  const activePlayers = (groupId) =>
    state.players
      .filter((p) => p.status === 'active' && (!groupId || p.groupId === groupId))
      .sort((a, b) => fullName(a).localeCompare(fullName(b)));
  const groupChip = (g) => (g ? `<span class="chip" style="--gc:${esc(g.color)}">${esc(g.name)}</span>` : '<span class="muted">—</span>');

  function suggestGroup(dob) {
    const age = ageOn(dob);
    if (age == null) return null;
    return state.groups.find((g) => age >= g.minAge && age <= g.maxAge) || null;
  }

  // Attendance stats for a player, optionally within a date range.
  function playerAttendance(playerId, from, to) {
    let counted = 0, attended = 0, absent = 0, late = 0, excused = 0;
    for (const s of state.sessions) {
      if (from && s.date < from) continue;
      if (to && s.date > to) continue;
      const st = s.attendance[playerId];
      if (!st) continue;
      if (st === 'E') { excused++; continue; } // excused doesn't count against the rate
      counted++;
      if (st === 'P' || st === 'L') attended++;
      if (st === 'L') late++;
      if (st === 'A') absent++;
    }
    return { counted, attended, absent, late, excused, rate: counted ? attended / counted : null };
  }

  function sessionRate(s) {
    const vals = Object.values(s.attendance).filter((v) => v !== 'E');
    if (!vals.length) return null;
    return vals.filter((v) => v === 'P' || v === 'L').length / vals.length;
  }

  function paidForMonth(playerId, month) {
    return state.payments
      .filter((p) => p.playerId === playerId && p.period === month)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }

  function feeStatus(player, month = thisMonth()) {
    const g = groupById(player.groupId);
    const fee = Number(g?.fee || 0);
    const paid = paidForMonth(player.id, month);
    if (!fee) return { fee, paid, due: 0, status: 'n/a' };
    const due = Math.max(0, fee - paid);
    return { fee, paid, due, status: due === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid' };
  }

  const feeBadge = (fs) =>
    fs.status === 'paid' ? '<span class="badge ok">Paid</span>'
      : fs.status === 'partial' ? `<span class="badge warn">Owes ${money(fs.due)}</span>`
      : fs.status === 'unpaid' ? `<span class="badge bad">Unpaid</span>`
      : '<span class="muted">—</span>';

  // ---------- Modal ----------
  const modal = $('#modal');
  const modalForm = $('#modal-form');

  function openModal(html, onSubmit) {
    modalForm.innerHTML = html;
    modalForm.onsubmit = (e) => {
      const action = e.submitter?.value;
      if (action !== 'save') return; // cancel just closes
      e.preventDefault();
      const data = Object.fromEntries(new FormData(modalForm).entries());
      if (onSubmit(data) !== false) modal.close();
    };
    modal.showModal();
    const first = modalForm.querySelector('input, select, textarea');
    if (first) first.focus();
  }

  const modalActions = (label = 'Save') =>
    `<div class="modal-actions"><button value="cancel" formnovalidate>Cancel</button><button class="primary" value="save">${label}</button></div>`;

  const groupOptions = (selected, includeAll = false) =>
    (includeAll ? `<option value="">All groups</option>` : '') +
    state.groups.map((g) => `<option value="${g.id}" ${g.id === selected ? 'selected' : ''}>${esc(g.name)}</option>`).join('');

  // ---------- Player form ----------
  function editPlayer(id) {
    const p = id ? playerById(id) : null;
    const v = p || { firstName: '', lastName: '', dob: '', groupId: '', guardianName: '', phone: '', email: '', address: '', medical: '', joined: isoDate(), status: 'active', notes: '' };
    openModal(`
      <h2>${p ? 'Edit player' : 'Register new player'}</h2>
      <div class="form-grid">
        <div class="field"><label>First name *</label><input name="firstName" required value="${esc(v.firstName)}"></div>
        <div class="field"><label>Last name *</label><input name="lastName" required value="${esc(v.lastName)}"></div>
        <div class="field"><label>Date of birth *</label><input type="date" name="dob" required value="${esc(v.dob)}" max="${isoDate()}"></div>
        <div class="field"><label>Age group *</label><select name="groupId" required><option value="">Select…</option>${groupOptions(v.groupId)}</select>
          <span class="hint" id="group-hint"></span></div>
        <div class="field"><label>Parent / guardian</label><input name="guardianName" value="${esc(v.guardianName)}"></div>
        <div class="field"><label>Phone</label><input type="tel" name="phone" value="${esc(v.phone)}"></div>
        <div class="field"><label>Email</label><input type="email" name="email" value="${esc(v.email)}"></div>
        <div class="field"><label>Registration date</label><input type="date" name="joined" value="${esc(v.joined)}"></div>
        <div class="field full"><label>Address</label><input name="address" value="${esc(v.address)}"></div>
        <div class="field full"><label>Medical info / allergies</label><textarea name="medical">${esc(v.medical)}</textarea></div>
        <div class="field full"><label>Notes</label><textarea name="notes">${esc(v.notes)}</textarea></div>
        <div class="field"><label>Status</label><select name="status">
          <option value="active" ${v.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="inactive" ${v.status === 'inactive' ? 'selected' : ''}>Inactive / left</option>
        </select></div>
      </div>
      ${modalActions(p ? 'Save changes' : 'Register')}
    `, (data) => {
      data.firstName = data.firstName.trim();
      data.lastName = data.lastName.trim();
      if (p) Object.assign(p, data);
      else state.players.push({ id: uid(), ...data });
      save();
      toast(p ? 'Player updated' : `${data.firstName} registered`);
      render();
    });

    const dobInput = $('[name=dob]', modalForm);
    const groupSel = $('[name=groupId]', modalForm);
    const hint = $('#group-hint', modalForm);
    const updateHint = () => {
      const age = ageOn(dobInput.value);
      const g = suggestGroup(dobInput.value);
      hint.textContent = age == null ? '' : g ? `Age ${age} → suggested: ${g.name}` : `Age ${age} — outside all group ranges`;
      if (g && !groupSel.value) groupSel.value = g.id;
    };
    dobInput.addEventListener('change', updateHint);
    updateHint();
  }

  function deletePlayer(id) {
    const p = playerById(id);
    if (!p || !confirm(`Delete ${fullName(p)}? Their attendance and payment records will also be removed. Tip: set them to "Inactive" instead to keep history.`)) return;
    state.players = state.players.filter((x) => x.id !== id);
    state.payments = state.payments.filter((x) => x.playerId !== id);
    state.sessions.forEach((s) => delete s.attendance[id]);
    save();
    toast('Player deleted');
    render();
  }

  function viewPlayer(id) {
    const p = playerById(id);
    if (!p) return;
    const g = groupById(p.groupId);
    const att = playerAttendance(id);
    const fs = feeStatus(p);
    const history = state.sessions
      .filter((s) => s.attendance[id])
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);
    const pays = state.payments.filter((x) => x.playerId === id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
    openModal(`
      <h2>${esc(fullName(p))} ${groupChip(g)}</h2>
      <div class="form-grid">
        <div><div class="hint">Age</div>${ageOn(p.dob) ?? '—'} <span class="muted">(${fmtDate(p.dob)})</span></div>
        <div><div class="hint">Registered</div>${fmtDate(p.joined)}</div>
        <div><div class="hint">Guardian</div>${esc(p.guardianName) || '—'}</div>
        <div><div class="hint">Phone</div>${p.phone ? `<a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>` : '—'}</div>
        <div><div class="hint">Email</div>${p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : '—'}</div>
        <div><div class="hint">This month's fee</div>${feeBadge(fs)}</div>
        ${p.medical ? `<div class="full"><div class="hint">Medical</div>⚠️ ${esc(p.medical)}</div>` : ''}
        ${p.notes ? `<div class="full"><div class="hint">Notes</div>${esc(p.notes)}</div>` : ''}
      </div>
      <h2 style="margin-top:18px">Attendance: ${pct(att.rate)}</h2>
      <p class="muted" style="margin-top:-8px">${att.attended} attended · ${att.absent} absent · ${att.late} late · ${att.excused} excused</p>
      ${history.length ? `<div class="table-wrap"><table><tbody>${history.map((s) => `<tr><td>${fmtDate(s.date)}</td><td>${esc(s.type)}</td><td>${STATUS[s.attendance[id]].label}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No sessions recorded yet.</p>'}
      <h2 style="margin-top:18px">Recent payments</h2>
      ${pays.length ? `<div class="table-wrap"><table><tbody>${pays.map((x) => `<tr><td>${fmtDate(x.date)}</td><td>${fmtMonth(x.period)}</td><td class="num">${money(x.amount)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No payments recorded.</p>'}
      <div class="modal-actions"><button value="cancel">Close</button></div>
    `, () => {});
  }

  // ---------- Payment form ----------
  function addPayment(playerId) {
    const players = activePlayers();
    if (!players.length) return alert('Register a player first.');
    const pre = playerId ? playerById(playerId) : null;
    openModal(`
      <h2>Record payment</h2>
      <div class="form-grid">
        <div class="field full"><label>Player *</label><select name="playerId" required>
          <option value="">Select…</option>
          ${players.map((p) => `<option value="${p.id}" ${p.id === playerId ? 'selected' : ''}>${esc(fullName(p))} — ${esc(groupById(p.groupId)?.name || '')}</option>`).join('')}
        </select></div>
        <div class="field"><label>Amount *</label><input type="number" name="amount" min="0" step="0.01" required value="${pre ? feeStatus(pre).due || '' : ''}"></div>
        <div class="field"><label>For month *</label><input type="month" name="period" required value="${thisMonth()}"></div>
        <div class="field"><label>Payment date</label><input type="date" name="date" value="${isoDate()}"></div>
        <div class="field"><label>Method</label><select name="method"><option>Cash</option><option>Card</option><option>Bank transfer</option><option>Other</option></select></div>
        <div class="field full"><label>Note</label><input name="note"></div>
      </div>
      ${modalActions('Save payment')}
    `, (data) => {
      state.payments.push({ id: uid(), ...data, amount: Number(data.amount) });
      save();
      toast('Payment recorded');
      render();
    });
    const sel = $('[name=playerId]', modalForm);
    const amt = $('[name=amount]', modalForm);
    sel.addEventListener('change', () => {
      const p = playerById(sel.value);
      if (p) amt.value = feeStatus(p, $('[name=period]', modalForm).value).due || '';
    });
  }

  // ---------- Views ----------
  const views = {};

  views.dashboard = () => {
    const active = activePlayers();
    const today = isoDate();
    const month = thisMonth();
    const monthStart = month + '-01';
    const monthSessions = state.sessions.filter((s) => s.date >= monthStart);
    const rates = monthSessions.map(sessionRate).filter((r) => r != null);
    const avgRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
    const collected = state.payments.filter((p) => p.period === month).reduce((s, p) => s + Number(p.amount || 0), 0);
    const outstanding = active.reduce((s, p) => s + feeStatus(p).due, 0);
    const unpaidCount = active.filter((p) => ['unpaid', 'partial'].includes(feeStatus(p).status)).length;

    // Players with poor attendance over the last 30 days
    const since = isoDate(new Date(Date.now() - 30 * 864e5));
    const lowAtt = active
      .map((p) => ({ p, a: playerAttendance(p.id, since) }))
      .filter((x) => x.a.counted >= 3 && x.a.rate < 0.6)
      .sort((a, b) => a.a.rate - b.a.rate)
      .slice(0, 8);

    const recent = [...state.sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

    return `
      <div class="page-head"><h1>Dashboard</h1>
        <div class="toolbar">
          <button class="primary" data-act="new-player">+ Register player</button>
          <a class="btn" href="#attendance" style="text-decoration:none">Take attendance</a>
        </div>
      </div>
      <div class="grid stats">
        <div class="card stat"><div class="label">Active players</div><div class="value">${active.length}</div><div class="sub">${state.players.length - active.length} inactive</div></div>
        <div class="card stat"><div class="label">Attendance (${fmtMonth(month).split(' ')[0]})</div><div class="value">${pct(avgRate)}</div><div class="sub">${monthSessions.length} sessions</div></div>
        <div class="card stat"><div class="label">Collected this month</div><div class="value">${money(collected)}</div><div class="sub">${fmtMonth(month)}</div></div>
        <div class="card stat"><div class="label">Outstanding fees</div><div class="value">${money(outstanding)}</div><div class="sub">${unpaidCount} player${unpaidCount === 1 ? '' : 's'} owe</div></div>
      </div>
      <div class="grid groups">
        ${state.groups.map((g) => {
          const ps = activePlayers(g.id);
          const gs = state.sessions.filter((s) => s.groupId === g.id);
          const gr = gs.filter((s) => s.date >= monthStart).map(sessionRate).filter((r) => r != null);
          const todays = gs.find((s) => s.date === today);
          return `<div class="card group-card" style="--gc:${esc(g.color)}">
            <h2>${esc(g.name)} <span class="muted" style="font-weight:400;font-size:13px">ages ${g.minAge}–${g.maxAge}</span></h2>
            <div class="row"><span>Players</span><strong>${ps.length}</strong></div>
            <div class="row"><span>Training</span><span>${esc(g.schedule) || '—'}</span></div>
            <div class="row"><span>Attendance this month</span><strong>${pct(gr.length ? gr.reduce((a, b) => a + b, 0) / gr.length : null)}</strong></div>
            <div class="row"><span>Monthly fee</span><span>${money(g.fee)}</span></div>
            <div style="margin-top:10px"><button class="small" data-act="take-att" data-group="${g.id}">${todays ? 'Edit today’s register' : 'Take today’s register'}</button></div>
          </div>`;
        }).join('')}
      </div>
      <div class="grid groups" style="margin-top:16px">
        <div class="card"><h2>Recent sessions</h2>
          ${recent.length ? `<table><tbody>${recent.map((s) => `<tr><td>${fmtDate(s.date)}</td><td>${groupChip(groupById(s.groupId))}</td><td class="num">${pct(sessionRate(s))}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No sessions recorded yet.</p>'}
        </div>
        <div class="card"><h2>Low attendance (last 30 days)</h2>
          ${lowAtt.length ? `<table><tbody>${lowAtt.map(({ p, a }) => `<tr><td><button class="link" data-act="view-player" data-id="${p.id}">${esc(fullName(p))}</button></td><td>${groupChip(groupById(p.groupId))}</td><td class="num">${pct(a.rate)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">Nobody below 60% 👍</p>'}
        </div>
      </div>
    `;
  };

  const ui = { playerSearch: '', playerGroup: '', playerStatus: 'active', attGroup: '', attDate: isoDate(), payMonth: thisMonth(), payGroup: '', repFrom: '', repTo: '', repGroup: '' };

  views.players = () => {
    const q = ui.playerSearch.toLowerCase();
    const list = state.players
      .filter((p) => (!ui.playerGroup || p.groupId === ui.playerGroup) && (!ui.playerStatus || p.status === ui.playerStatus))
      .filter((p) => !q || [fullName(p), p.guardianName, p.phone, p.email].join(' ').toLowerCase().includes(q))
      .sort((a, b) => fullName(a).localeCompare(fullName(b)));
    return `
      <div class="page-head"><h1>Players <span class="muted" style="font-weight:400">(${list.length})</span></h1>
        <div class="toolbar">
          <button data-act="export-players">Export CSV</button>
          <button class="primary" data-act="new-player">+ Register player</button>
        </div>
      </div>
      <div class="card">
        <div class="toolbar" style="margin-bottom:12px">
          <input type="search" placeholder="Search name, guardian, phone…" data-ui="playerSearch" value="${esc(ui.playerSearch)}" style="flex:1;min-width:200px">
          <select data-ui="playerGroup">${groupOptions(ui.playerGroup, true)}</select>
          <select data-ui="playerStatus">
            <option value="active" ${ui.playerStatus === 'active' ? 'selected' : ''}>Active</option>
            <option value="inactive" ${ui.playerStatus === 'inactive' ? 'selected' : ''}>Inactive</option>
            <option value="" ${ui.playerStatus === '' ? 'selected' : ''}>All</option>
          </select>
        </div>
        ${list.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Group</th><th class="num">Age</th><th class="hide-sm">Guardian</th><th class="hide-sm">Phone</th><th class="num">Attendance</th><th>Fee (${fmtMonth(thisMonth()).split(' ')[0]})</th><th></th></tr></thead>
          <tbody>${list.map((p) => {
            const a = playerAttendance(p.id);
            const g = groupById(p.groupId);
            const age = ageOn(p.dob);
            const outOfRange = g && age != null && (age < g.minAge || age > g.maxAge);
            return `<tr>
              <td><button class="link" data-act="view-player" data-id="${p.id}">${esc(fullName(p))}</button>${p.medical ? ' <span title="Has medical info">⚠️</span>' : ''}</td>
              <td>${groupChip(g)}</td>
              <td class="num" ${outOfRange ? 'title="Age is outside this group’s range" style="color:var(--warn);font-weight:600"' : ''}>${age ?? '—'}</td>
              <td class="hide-sm">${esc(p.guardianName)}</td>
              <td class="hide-sm">${p.phone ? `<a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>` : ''}</td>
              <td class="num">${pct(a.rate)}</td>
              <td>${feeBadge(feeStatus(p))}</td>
              <td style="white-space:nowrap;text-align:right">
                <button class="small" data-act="edit-player" data-id="${p.id}">Edit</button>
                <button class="small danger" data-act="delete-player" data-id="${p.id}" aria-label="Delete">✕</button>
              </td></tr>`;
          }).join('')}</tbody></table></div>`
        : `<p class="empty">${state.players.length ? 'No players match your filters.' : 'No players yet — click “Register player” to add your first one.'}</p>`}
      </div>`;
  };

  // Draft attendance being edited on the attendance page (not saved until "Save register").
  let attDraft = null;

  function loadAttDraft() {
    if (!ui.attGroup) ui.attGroup = state.groups[0]?.id || '';
    const existing = state.sessions.find((s) => s.groupId === ui.attGroup && s.date === ui.attDate);
    if (attDraft && attDraft.groupId === ui.attGroup && attDraft.date === ui.attDate) return;
    attDraft = existing
      ? JSON.parse(JSON.stringify(existing))
      : { id: null, groupId: ui.attGroup, date: ui.attDate, type: 'Training', notes: '', attendance: {} };
  }

  views.attendance = () => {
    loadAttDraft();
    const g = groupById(ui.attGroup);
    const players = activePlayers(ui.attGroup);
    // also show inactive players already in an existing register
    const extra = Object.keys(attDraft.attendance).map(playerById).filter((p) => p && !players.includes(p));
    const roster = [...players, ...extra];
    const counts = { P: 0, L: 0, E: 0, A: 0 };
    Object.values(attDraft.attendance).forEach((v) => counts[v]++);
    const unmarked = roster.filter((p) => !attDraft.attendance[p.id]).length;
    const history = state.sessions.filter((s) => s.groupId === ui.attGroup).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);

    return `
      <div class="page-head"><h1>Attendance</h1></div>
      <div class="card">
        <div class="toolbar" style="margin-bottom:14px">
          <select data-ui="attGroup">${groupOptions(ui.attGroup)}</select>
          <input type="date" data-ui="attDate" value="${ui.attDate}">
          <select id="att-type">${['Training', 'Match', 'Tournament', 'Other'].map((t) => `<option ${attDraft.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <span class="muted">${attDraft.id ? 'Editing saved register' : 'New register'}</span>
        </div>
        ${roster.length ? `
          <div class="toolbar" style="justify-content:space-between;margin-bottom:6px">
            <span class="muted">✅ ${counts.P} present · ⏱ ${counts.L} late · 📝 ${counts.E} excused · ❌ ${counts.A} absent${unmarked ? ` · ${unmarked} unmarked` : ''}</span>
            <span class="toolbar">
              <button class="small" data-act="att-all" data-s="P">All present</button>
              <button class="small" data-act="att-rest" data-s="A">Unmarked → absent</button>
            </span>
          </div>
          <div>${roster.map((p) => `
            <div class="att-row">
              <span>${esc(fullName(p))}${p.status !== 'active' ? ' <span class="muted">(inactive)</span>' : ''}${p.medical ? ' <span title="${esc(p.medical)}">⚠️</span>' : ''}</span>
              <span class="att-btns">${Object.keys(STATUS).map((k) => `<button type="button" data-act="att-mark" data-id="${p.id}" data-s="${k}" class="${attDraft.attendance[p.id] === k ? 'on' : ''}" title="${STATUS[k].label}">${k}</button>`).join('')}</span>
            </div>`).join('')}
          </div>
          <div class="field" style="margin-top:12px"><label>Session notes</label><textarea id="att-notes" placeholder="Drills, match result, injuries…">${esc(attDraft.notes)}</textarea></div>
          <div class="toolbar" style="margin-top:12px;justify-content:flex-end">
            ${attDraft.id ? '<button class="danger" data-act="att-delete">Delete register</button>' : ''}
            <button class="primary" data-act="att-save">Save register</button>
          </div>`
        : `<p class="empty">No active players in ${esc(g?.name || 'this group')}. <a href="#players">Register players</a> first.</p>`}
      </div>
      <div class="card"><h2>${esc(g?.name || '')} — session history</h2>
        ${history.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Date</th><th>Type</th><th class="num">Present</th><th class="num">Absent</th><th class="num">Rate</th><th></th></tr></thead>
          <tbody>${history.map((s) => {
            const v = Object.values(s.attendance);
            return `<tr><td>${fmtDate(s.date)}</td><td>${esc(s.type)}</td>
              <td class="num">${v.filter((x) => x === 'P' || x === 'L').length}</td>
              <td class="num">${v.filter((x) => x === 'A').length}</td>
              <td class="num">${pct(sessionRate(s))}</td>
              <td style="text-align:right"><button class="small" data-act="att-open" data-date="${s.date}">Open</button></td></tr>`;
          }).join('')}</tbody></table></div>` : '<p class="empty">No sessions recorded for this group yet.</p>'}
      </div>`;
  };

  function syncAttMeta() {
    if (!attDraft) return;
    const t = $('#att-type'); if (t) attDraft.type = t.value;
    const n = $('#att-notes'); if (n) attDraft.notes = n.value;
  }

  views.payments = () => {
    const month = ui.payMonth || thisMonth();
    const players = activePlayers(ui.payGroup);
    const rows = players.map((p) => ({ p, fs: feeStatus(p, month) }));
    const totalDue = rows.reduce((s, r) => s + r.fs.fee, 0);
    const totalPaid = rows.reduce((s, r) => s + r.fs.paid, 0);
    const log = state.payments
      .filter((x) => x.period === month && (!ui.payGroup || playerById(x.playerId)?.groupId === ui.payGroup))
      .sort((a, b) => b.date.localeCompare(a.date));
    return `
      <div class="page-head"><h1>Payments</h1>
        <div class="toolbar">
          <input type="month" data-ui="payMonth" value="${month}">
          <select data-ui="payGroup">${groupOptions(ui.payGroup, true)}</select>
          <button class="primary" data-act="new-payment">+ Record payment</button>
        </div>
      </div>
      <div class="grid stats">
        <div class="card stat"><div class="label">Expected</div><div class="value">${money(totalDue)}</div><div class="sub">${fmtMonth(month)}</div></div>
        <div class="card stat"><div class="label">Collected</div><div class="value">${money(totalPaid)}</div><div class="sub">${totalDue ? pct(totalPaid / totalDue) : '—'} of expected</div></div>
        <div class="card stat"><div class="label">Outstanding</div><div class="value">${money(rows.reduce((s, r) => s + r.fs.due, 0))}</div><div class="sub">${rows.filter((r) => r.fs.due > 0).length} players</div></div>
      </div>
      <div class="card"><h2>Fee status — ${fmtMonth(month)}</h2>
        ${rows.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Player</th><th>Group</th><th class="num">Fee</th><th class="num">Paid</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows.sort((a, b) => b.fs.due - a.fs.due || fullName(a.p).localeCompare(fullName(b.p))).map(({ p, fs }) => `<tr>
            <td>${esc(fullName(p))}</td><td>${groupChip(groupById(p.groupId))}</td>
            <td class="num">${money(fs.fee)}</td><td class="num">${money(fs.paid)}</td><td>${feeBadge(fs)}</td>
            <td style="text-align:right">${fs.due > 0 ? `<button class="small" data-act="new-payment" data-id="${p.id}">Record</button>` : ''}</td>
          </tr>`).join('')}</tbody></table></div>` : '<p class="empty">No active players.</p>'}
      </div>
      <div class="card"><h2>Payments received</h2>
        ${log.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Date</th><th>Player</th><th>Method</th><th class="hide-sm">Note</th><th class="num">Amount</th><th></th></tr></thead>
          <tbody>${log.map((x) => {
            const p = playerById(x.playerId);
            return `<tr><td>${fmtDate(x.date)}</td><td>${p ? esc(fullName(p)) : '<span class="muted">Deleted player</span>'}</td><td>${esc(x.method)}</td><td class="hide-sm">${esc(x.note)}</td><td class="num">${money(x.amount)}</td>
              <td style="text-align:right"><button class="small danger" data-act="delete-payment" data-id="${x.id}" aria-label="Delete">✕</button></td></tr>`;
          }).join('')}</tbody></table></div>` : '<p class="empty">No payments for this month yet.</p>'}
      </div>`;
  };

  function reportRows() {
    return activePlayers(ui.repGroup).map((p) => ({ p, a: playerAttendance(p.id, ui.repFrom || null, ui.repTo || null) }));
  }

  views.reports = () => {
    const rows = reportRows();
    const sessions = state.sessions.filter((s) => (!ui.repGroup || s.groupId === ui.repGroup) && (!ui.repFrom || s.date >= ui.repFrom) && (!ui.repTo || s.date <= ui.repTo));
    return `
      <div class="page-head"><h1>Attendance report</h1>
        <div class="toolbar">
          <button data-act="export-report">Export CSV</button>
          <button data-act="print">Print</button>
        </div>
      </div>
      <div class="card">
        <div class="toolbar" style="margin-bottom:12px">
          <select data-ui="repGroup">${groupOptions(ui.repGroup, true)}</select>
          <label class="muted">From <input type="date" data-ui="repFrom" value="${ui.repFrom}"></label>
          <label class="muted">To <input type="date" data-ui="repTo" value="${ui.repTo}"></label>
          <button class="small" data-act="rep-range" data-days="30">Last 30 days</button>
          <button class="small" data-act="rep-range" data-days="90">Last 90 days</button>
          <button class="small" data-act="rep-range" data-days="0">All time</button>
        </div>
        <p class="muted">${sessions.length} sessions in range. Excused absences don't count against the rate.</p>
        ${rows.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Player</th><th>Group</th><th class="num">Attended</th><th class="num">Late</th><th class="num">Absent</th><th class="num">Excused</th><th>Rate</th></tr></thead>
          <tbody>${rows.sort((x, y) => (y.a.rate ?? -1) - (x.a.rate ?? -1)).map(({ p, a }) => `<tr>
            <td>${esc(fullName(p))}</td><td>${groupChip(groupById(p.groupId))}</td>
            <td class="num">${a.attended}</td><td class="num">${a.late}</td><td class="num">${a.absent}</td><td class="num">${a.excused}</td>
            <td><div style="display:flex;align-items:center;gap:8px"><div class="bar" style="flex:1"><div style="width:${Math.round((a.rate || 0) * 100)}%"></div></div><span style="width:40px;text-align:right">${pct(a.rate)}</span></div></td>
          </tr>`).join('')}</tbody></table></div>` : '<p class="empty">No players to report on.</p>'}
      </div>`;
  };

  views.settings = () => `
    <div class="page-head"><h1>Settings</h1></div>
    <div class="card"><h2>Academy</h2>
      <div class="form-grid" style="max-width:520px">
        <div class="field"><label>Academy name</label><input id="set-name" value="${esc(state.settings.academyName)}"></div>
        <div class="field"><label>Currency symbol</label><input id="set-currency" value="${esc(state.settings.currency)}" maxlength="4"></div>
      </div>
      <div class="toolbar" style="margin-top:12px"><button class="primary" data-act="save-settings">Save</button></div>
    </div>
    <div class="card"><h2>Age groups</h2>
      <p class="muted">Rename the groups, set the age ranges used to suggest a group when registering, training times, and the monthly fee.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Min age</th><th>Max age</th><th>Training schedule</th><th>Monthly fee</th><th>Colour</th></tr></thead>
        <tbody>${state.groups.map((g) => `<tr data-group-row="${g.id}">
          <td><input name="name" value="${esc(g.name)}" style="width:120px"></td>
          <td><input name="minAge" type="number" min="0" max="30" value="${g.minAge}" style="width:70px"></td>
          <td><input name="maxAge" type="number" min="0" max="30" value="${g.maxAge}" style="width:70px"></td>
          <td><input name="schedule" value="${esc(g.schedule)}" style="width:180px"></td>
          <td><input name="fee" type="number" min="0" step="0.01" value="${g.fee}" style="width:90px"></td>
          <td><input name="color" type="color" value="${esc(g.color)}" style="width:50px;padding:2px"></td>
        </tr>`).join('')}</tbody>
      </table></div>
      <div class="toolbar" style="margin-top:12px"><button class="primary" data-act="save-groups">Save groups</button></div>
    </div>
    <div class="card"><h2>Backup &amp; restore</h2>
      <p class="muted">Your data is saved in this browser only. Download a backup regularly, and use it to move data to another device.</p>
      <div class="toolbar">
        <button data-act="backup">Download backup</button>
        <label class="btn">Restore from backup<input type="file" accept="application/json,.json" id="restore-file" hidden></label>
        <button data-act="demo">Load demo data</button>
        <button class="danger" data-act="reset">Erase all data</button>
      </div>
    </div>`;

  // ---------- Actions ----------
  const actions = {
    'new-player': () => editPlayer(),
    'edit-player': (el) => editPlayer(el.dataset.id),
    'view-player': (el) => viewPlayer(el.dataset.id),
    'delete-player': (el) => deletePlayer(el.dataset.id),
    'take-att': (el) => { ui.attGroup = el.dataset.group; ui.attDate = isoDate(); attDraft = null; location.hash = '#attendance'; },
    'att-mark': (el) => {
      syncAttMeta();
      const { id, s } = el.dataset;
      if (attDraft.attendance[id] === s) delete attDraft.attendance[id];
      else attDraft.attendance[id] = s;
      render();
    },
    'att-all': () => { syncAttMeta(); activePlayers(ui.attGroup).forEach((p) => (attDraft.attendance[p.id] = 'P')); render(); },
    'att-rest': () => { syncAttMeta(); activePlayers(ui.attGroup).forEach((p) => { if (!attDraft.attendance[p.id]) attDraft.attendance[p.id] = 'A'; }); render(); },
    'att-save': () => {
      syncAttMeta();
      if (!Object.keys(attDraft.attendance).length) return alert('Mark at least one player before saving.');
      const roster = activePlayers(ui.attGroup);
      const unmarked = roster.filter((p) => !attDraft.attendance[p.id]).length;
      if (unmarked && !confirm(`${unmarked} player(s) are unmarked and won't be counted. Save anyway?`)) return;
      if (attDraft.id) {
        const i = state.sessions.findIndex((s) => s.id === attDraft.id);
        state.sessions[i] = JSON.parse(JSON.stringify(attDraft));
      } else {
        attDraft.id = uid();
        state.sessions.push(JSON.parse(JSON.stringify(attDraft)));
      }
      save();
      toast('Register saved');
      render();
    },
    'att-delete': () => {
      if (!confirm('Delete this register?')) return;
      state.sessions = state.sessions.filter((s) => s.id !== attDraft.id);
      attDraft = null;
      save();
      toast('Register deleted');
      render();
    },
    'att-open': (el) => { ui.attDate = el.dataset.date; attDraft = null; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    'new-payment': (el) => addPayment(el.dataset.id),
    'delete-payment': (el) => {
      if (!confirm('Delete this payment?')) return;
      state.payments = state.payments.filter((x) => x.id !== el.dataset.id);
      save();
      render();
    },
    'export-players': () => {
      const rows = [['First name', 'Last name', 'Date of birth', 'Age', 'Group', 'Guardian', 'Phone', 'Email', 'Address', 'Medical', 'Registered', 'Status', 'Attendance %', 'Notes']];
      state.players.forEach((p) => {
        const a = playerAttendance(p.id);
        rows.push([p.firstName, p.lastName, p.dob, ageOn(p.dob), groupById(p.groupId)?.name, p.guardianName, p.phone, p.email, p.address, p.medical, p.joined, p.status, a.rate == null ? '' : Math.round(a.rate * 100), p.notes]);
      });
      download(`players-${isoDate()}.csv`, toCSV(rows), 'text/csv');
    },
    'export-report': () => {
      const rows = [['Player', 'Group', 'Attended', 'Late', 'Absent', 'Excused', 'Rate %']];
      reportRows().forEach(({ p, a }) => rows.push([fullName(p), groupById(p.groupId)?.name, a.attended, a.late, a.absent, a.excused, a.rate == null ? '' : Math.round(a.rate * 100)]));
      download(`attendance-${ui.repFrom || 'all'}-${ui.repTo || isoDate()}.csv`, toCSV(rows), 'text/csv');
    },
    'rep-range': (el) => {
      const days = Number(el.dataset.days);
      ui.repFrom = days ? isoDate(new Date(Date.now() - days * 864e5)) : '';
      ui.repTo = '';
      render();
    },
    print: () => window.print(),
    'save-settings': () => {
      state.settings.academyName = $('#set-name').value.trim() || 'Football Academy';
      state.settings.currency = $('#set-currency').value;
      save();
      toast('Settings saved');
      render();
    },
    'save-groups': () => {
      for (const row of $$('[data-group-row]')) {
        const g = groupById(row.dataset.groupRow);
        const val = (n) => $(`[name=${n}]`, row).value;
        g.name = val('name').trim() || g.name;
        g.minAge = Number(val('minAge'));
        g.maxAge = Number(val('maxAge'));
        g.schedule = val('schedule');
        g.fee = Number(val('fee'));
        g.color = val('color');
      }
      save();
      toast('Age groups saved');
      render();
    },
    backup: () => download(`academy-backup-${isoDate()}.json`, JSON.stringify(state, null, 2), 'application/json'),
    demo: () => {
      if (state.players.length && !confirm('Replace current data with demo data?')) return;
      state = demoState();
      attDraft = null;
      save();
      toast('Demo data loaded');
      render();
    },
    reset: () => {
      if (!confirm('Erase ALL players, attendance and payments? This cannot be undone. (Download a backup first!)')) return;
      state = defaultState();
      attDraft = null;
      save();
      toast('All data erased');
      render();
    },
  };

  function demoState() {
    const s = defaultState();
    const first = ['Adam', 'Ali', 'Omar', 'Yusuf', 'Leo', 'Noah', 'Sami', 'Karim', 'Zain', 'Hadi', 'Jad', 'Rami', 'Elias', 'Malik', 'Tariq', 'Ibrahim', 'Lucas', 'Hassan', 'Nour', 'Rayan', 'Bilal', 'Khalil', 'Fadi', 'Ziad'];
    const last = ['Haddad', 'Khoury', 'Saleh', 'Nasser', 'Farah', 'Mansour', 'Aziz', 'Darwish', 'Hamdan', 'Issa'];
    const now = new Date();
    let n = 0;
    s.groups.forEach((g) => {
      for (let i = 0; i < 8; i++) {
        const age = g.minAge + (i % (g.maxAge - g.minAge + 1));
        const dob = new Date(now.getFullYear() - age, (i * 3 + n) % 12, 1 + ((i * 7) % 27));
        const fn = first[n % first.length];
        const ln = last[(n * 3) % last.length];
        s.players.push({
          id: uid() + n, firstName: fn, lastName: ln, dob: isoDate(dob), groupId: g.id,
          guardianName: `${['Ahmad', 'Sara', 'Maya', 'Khaled'][n % 4]} ${ln}`, phone: `+1 555 01${pad(n)}`, email: '',
          address: '', medical: n % 9 === 0 ? 'Asthma — inhaler in bag' : '', joined: isoDate(new Date(now - (60 + n) * 864e5)),
          status: 'active', notes: '',
        });
        n++;
      }
    });
    // ~6 weeks of twice-weekly sessions per group
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
        s.sessions.push({ id: uid() + d + gi, groupId: g.id, date: isoDate(date), type: 'Training', notes: '', attendance });
      }
    });
    const month = thisMonth();
    s.players.forEach((p, i) => {
      if (i % 5 === 4) return; // a few unpaid
      const g = s.groups.find((x) => x.id === p.groupId);
      s.payments.push({ id: uid() + i, playerId: p.id, amount: i % 7 === 0 ? g.fee / 2 : g.fee, period: month, date: isoDate(), method: i % 2 ? 'Cash' : 'Bank transfer', note: '' });
    });
    return s;
  }

  // ---------- Routing & events ----------
  function currentRoute() {
    const r = location.hash.slice(1);
    return views[r] ? r : 'dashboard';
  }

  function render() {
    const route = currentRoute();
    $('#academy-name').textContent = state.settings.academyName;
    document.title = `${state.settings.academyName} — Manager`;
    $$('#tabs a').forEach((a) => a.classList.toggle('active', a.dataset.route === route));
    const view = $('#view');
    // Preserve focus/caret for the search input across re-renders
    const focused = document.activeElement?.dataset?.ui;
    const caret = document.activeElement?.selectionStart;
    view.innerHTML = views[route]();
    if (focused) {
      const el = $(`[data-ui="${focused}"]`, view);
      if (el) { el.focus(); if (caret != null && el.setSelectionRange && el.type === 'search') el.setSelectionRange(caret, caret); }
    }
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !actions[el.dataset.act]) return;
    if (el.closest('dialog')) return;
    e.preventDefault();
    actions[el.dataset.act](el);
  });

  document.addEventListener('input', (e) => {
    const key = e.target.dataset?.ui;
    if (!key || e.target.tagName !== 'INPUT' || e.target.type !== 'search') return;
    ui[key] = e.target.value;
    render();
  });

  document.addEventListener('change', (e) => {
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
      if (!file) return;
      file.text().then((txt) => {
        try {
          const data = JSON.parse(txt);
          if (!Array.isArray(data.players) || !Array.isArray(data.groups)) throw new Error('Not a backup file');
          if (!confirm(`Restore backup with ${data.players.length} players? Current data will be replaced.`)) return;
          state = { ...defaultState(), ...data };
          attDraft = null;
          save();
          toast('Backup restored');
          render();
        } catch (err) {
          alert('That file could not be restored: ' + err.message);
        }
      });
    }
  });

  window.addEventListener('hashchange', render);
  render();
})();
