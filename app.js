'use strict';
// ---- Storage ----
const KEY = 'academy-manager-v1';
const empty = () => ({ players: [], teams: [], sessions: [], payments: [] });
let db;
try { db = Object.assign(empty(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { db = empty(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---- Helpers ----
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = s => document.querySelector(s);
const money = n => '$' + (Number(n) || 0).toFixed(2);
const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => today().slice(0, 7);
const teamName = id => db.teams.find(t => t.id === id)?.name || '—';
const playerName = id => db.players.find(p => p.id === id)?.name || '(removed)';
const age = dob => dob ? Math.floor((Date.now() - new Date(dob)) / 31557600000) : '';
const monthLabel = m => new Date(m + '-01T00:00').toLocaleString(undefined, { month: 'long', year: 'numeric' });

function form(title, fields, values, onSave) {
  const f = $('#modal-form');
  f.innerHTML = `<h3>${esc(title)}</h3>` + fields.map(x => {
    const v = values[x.name] ?? '';
    let input;
    if (x.type === 'select') input = `<select name="${x.name}">${x.options.map(([val, lab]) => `<option value="${esc(val)}" ${val === v ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</select>`;
    else if (x.type === 'textarea') input = `<textarea name="${x.name}" rows="3">${esc(v)}</textarea>`;
    else input = `<input name="${x.name}" type="${x.type || 'text'}" value="${esc(v)}" ${x.required ? 'required' : ''} ${x.step ? `step="${x.step}"` : ''}>`;
    return `<label>${esc(x.label)}${input}</label>`;
  }).join('') + `<div class="row"><button type="button" class="b sec" id="cancel">Cancel</button><button class="b" value="ok">Save</button></div>`;
  $('#cancel').onclick = () => $('#modal').close();
  f.onsubmit = e => {
    if (e.submitter?.value !== 'ok') return;
    const data = Object.fromEntries(new FormData(f));
    onSave(data); save(); render();
  };
  $('#modal').showModal();
}
const teamOptions = (blank = true) => [...(blank ? [['', 'No team']] : []), ...db.teams.map(t => [t.id, t.name])];

// ---- Views ----
const views = {
  dashboard() {
    const m = thisMonth();
    const owed = db.players.map(p => ({ p, bal: Number(p.fee || 0) - paidFor(p.id, m) })).filter(x => x.bal > 0);
    const collected = db.payments.filter(x => x.month === m).reduce((s, x) => s + Number(x.amount), 0);
    const upcoming = db.sessions.filter(s => s.date >= today()).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 5);
    const past = db.sessions.filter(s => s.date < today() && Object.keys(s.att || {}).length);
    const rate = past.length ? Math.round(100 * past.reduce((s, x) => s + Object.values(x.att).filter(Boolean).length, 0) / past.reduce((s, x) => s + Object.keys(x.att).length, 0)) : null;
    return `<div class="bar"><h2>Dashboard</h2></div>
    <div class="grid">
      <div class="stat"><b>${db.players.length}</b><span>Players</span></div>
      <div class="stat"><b>${db.teams.length}</b><span>Teams</span></div>
      <div class="stat"><b>${money(collected)}</b><span>Collected ${esc(monthLabel(m))}</span></div>
      <div class="stat"><b>${money(owed.reduce((s, x) => s + x.bal, 0))}</b><span>Outstanding this month</span></div>
      <div class="stat"><b>${rate === null ? '—' : rate + '%'}</b><span>Attendance rate</span></div>
    </div>
    <div class="card"><h3>Upcoming training</h3>${upcoming.length ? upcoming.map(s => `<div>${esc(s.date)} ${esc(s.time)} — ${esc(teamName(s.team))} <span class="muted">${esc(s.location)}</span></div>`).join('') : '<span class="muted">Nothing scheduled.</span>'}</div>
    <div class="card"><h3>Unpaid this month</h3>${owed.length ? owed.map(x => `<div>${esc(x.p.name)} — ${money(x.bal)}</div>`).join('') : '<span class="muted">Everyone is paid up 🎉</span>'}</div>
    <div class="card"><button class="b sec" onclick="exportData()">Export backup</button> <button class="b sec" onclick="importData()">Import backup</button>
    <p class="muted">Data is stored in this browser. Export regularly to keep a backup.</p></div>`;
  },

  players() {
    const q = (state.q || '').toLowerCase();
    const list = db.players.filter(p => (!state.team || p.team === state.team) && p.name.toLowerCase().includes(q));
    return `<div class="bar"><h2>Players</h2>
      <input placeholder="Search…" value="${esc(state.q || '')}" oninput="state.q=this.value;render(true)">
      <select onchange="state.team=this.value;render()"><option value="">All teams</option>${db.teams.map(t => `<option value="${t.id}" ${state.team === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
      <button class="b" onclick="editPlayer()">+ Add player</button></div>
    <div class="tw"><table><tr><th>Name</th><th>Age</th><th>Pos.</th><th>Team</th><th>Parent / Phone</th><th>Fee</th><th></th></tr>
    ${list.map(p => `<tr><td>${esc(p.name)}</td><td>${age(p.dob)}</td><td>${esc(p.position)}</td><td>${esc(teamName(p.team))}</td>
      <td>${esc(p.parent)}<br><span class="muted">${esc(p.phone)}</span></td><td>${money(p.fee)}</td>
      <td><button class="b sm sec" onclick="editPlayer('${p.id}')">Edit</button> <button class="b sm del" onclick="del('players','${p.id}')">✕</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">No players yet.</td></tr>'}</table></div>`;
  },

  teams() {
    return `<div class="bar"><h2>Teams</h2><button class="b" onclick="editTeam()">+ Add team</button></div>
    <div class="tw"><table><tr><th>Team</th><th>Coach</th><th>Players</th><th></th></tr>
    ${db.teams.map(t => `<tr><td>${esc(t.name)}</td><td>${esc(t.coach)}</td><td>${db.players.filter(p => p.team === t.id).length}</td>
      <td><button class="b sm sec" onclick="editTeam('${t.id}')">Edit</button> <button class="b sm del" onclick="del('teams','${t.id}')">✕</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">No teams yet.</td></tr>'}</table></div>`;
  },

  sessions() {
    const list = [...db.sessions].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    return `<div class="bar"><h2>Training sessions</h2><button class="b" onclick="editSession()">+ Add session</button></div>
    <div class="tw"><table><tr><th>Date</th><th>Team</th><th>Location</th><th>Attended</th><th></th></tr>
    ${list.map(s => { const a = Object.values(s.att || {}); return `<tr><td>${esc(s.date)} ${esc(s.time)}</td><td>${esc(teamName(s.team))}</td><td>${esc(s.location)}</td>
      <td>${a.length ? a.filter(Boolean).length + '/' + a.length : '—'}</td>
      <td><button class="b sm" onclick="attendance('${s.id}')">Attendance</button> <button class="b sm sec" onclick="editSession('${s.id}')">Edit</button> <button class="b sm del" onclick="del('sessions','${s.id}')">✕</button></td></tr>`; }).join('') || '<tr><td colspan="5" class="muted">No sessions yet.</td></tr>'}</table></div>`;
  },

  payments() {
    const m = state.month || thisMonth();
    return `<div class="bar"><h2>Payments</h2><input type="month" value="${m}" onchange="state.month=this.value;render()"></div>
    <div class="tw"><table><tr><th>Player</th><th>Fee</th><th>Paid</th><th>Status</th><th></th></tr>
    ${db.players.map(p => { const paid = paidFor(p.id, m), fee = Number(p.fee || 0);
      const st = paid >= fee ? ['Paid', 'paid'] : paid > 0 ? ['Partial', 'part'] : ['Due', 'due'];
      return `<tr><td>${esc(p.name)}</td><td>${money(fee)}</td><td>${money(paid)}</td><td><span class="tag ${st[1]}">${st[0]}</span></td>
      <td><button class="b sm" onclick="addPayment('${p.id}','${m}')">+ Payment</button></td></tr>`; }).join('') || '<tr><td colspan="5" class="muted">Add players first.</td></tr>'}</table></div>
    <h3>Payments in ${esc(monthLabel(m))}</h3>
    <div class="tw"><table><tr><th>Date</th><th>Player</th><th>Amount</th><th></th></tr>
    ${db.payments.filter(x => x.month === m).map(x => `<tr><td>${esc(x.date)}</td><td>${esc(playerName(x.player))}</td><td>${money(x.amount)}</td>
      <td><button class="b sm del" onclick="del('payments','${x.id}')">✕</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">None recorded.</td></tr>'}</table></div>`;
  },
};

// ---- Actions ----
const state = { view: 'dashboard' };
const paidFor = (pid, m) => db.payments.filter(x => x.player === pid && x.month === m).reduce((s, x) => s + Number(x.amount), 0);

function upsert(coll, id, data) {
  const i = db[coll].findIndex(x => x.id === id);
  if (i >= 0) db[coll][i] = { ...db[coll][i], ...data }; else db[coll].push({ id: uid(), ...data });
}
function editPlayer(id) {
  const v = db.players.find(p => p.id === id) || {};
  form(id ? 'Edit player' : 'Add player', [
    { name: 'name', label: 'Full name', required: true }, { name: 'dob', label: 'Date of birth', type: 'date' },
    { name: 'position', label: 'Position' }, { name: 'team', label: 'Team', type: 'select', options: teamOptions() },
    { name: 'parent', label: 'Parent / guardian' }, { name: 'phone', label: 'Phone', type: 'tel' },
    { name: 'fee', label: 'Monthly fee', type: 'number', step: '0.01' }, { name: 'notes', label: 'Notes (medical, etc.)', type: 'textarea' },
  ], v, d => upsert('players', id, d));
}
function editTeam(id) {
  form(id ? 'Edit team' : 'Add team', [{ name: 'name', label: 'Team name (e.g. U12)', required: true }, { name: 'coach', label: 'Coach' }],
    db.teams.find(t => t.id === id) || {}, d => upsert('teams', id, d));
}
function editSession(id) {
  form(id ? 'Edit session' : 'Add session', [
    { name: 'date', label: 'Date', type: 'date', required: true }, { name: 'time', label: 'Time', type: 'time' },
    { name: 'team', label: 'Team', type: 'select', options: teamOptions() }, { name: 'location', label: 'Location' },
  ], db.sessions.find(s => s.id === id) || { date: today(), time: '17:00' }, d => upsert('sessions', id, d));
}
function attendance(id) {
  const s = db.sessions.find(x => x.id === id);
  const players = db.players.filter(p => !s.team || p.team === s.team);
  const f = $('#modal-form');
  f.innerHTML = `<h3>Attendance — ${esc(s.date)} ${esc(teamName(s.team))}</h3>` +
    (players.map(p => `<label class="att"><input type="checkbox" name="${p.id}" ${s.att?.[p.id] ? 'checked' : ''}> ${esc(p.name)}</label>`).join('') || '<p class="muted">No players on this team.</p>') +
    `<div class="row"><button type="button" class="b sec" id="cancel">Cancel</button><button class="b" value="ok">Save</button></div>`;
  $('#cancel').onclick = () => $('#modal').close();
  f.onsubmit = e => {
    if (e.submitter?.value !== 'ok') return;
    const checked = new FormData(f);
    s.att = Object.fromEntries(players.map(p => [p.id, checked.has(p.id)]));
    save(); render();
  };
  $('#modal').showModal();
}
function addPayment(player, month) {
  const p = db.players.find(x => x.id === player);
  form('Payment — ' + p.name, [{ name: 'amount', label: 'Amount', type: 'number', step: '0.01', required: true }, { name: 'date', label: 'Date', type: 'date' }],
    { amount: Math.max(0, Number(p.fee || 0) - paidFor(player, month)) || '', date: today() }, d => upsert('payments', null, { ...d, player, month }));
}
function del(coll, id) {
  if (!confirm('Delete this entry?')) return;
  db[coll] = db[coll].filter(x => x.id !== id);
  if (coll === 'teams') db.players.forEach(p => { if (p.team === id) p.team = ''; });
  if (coll === 'players') db.payments = db.payments.filter(x => x.player !== id);
  save(); render();
}
function exportData() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
  a.download = `academy-backup-${today()}.json`; a.click();
}
function importData() {
  const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/json';
  i.onchange = async () => {
    try { const d = JSON.parse(await i.files[0].text()); if (!confirm('Replace all current data with this backup?')) return; db = Object.assign(empty(), d); save(); render(); }
    catch { alert('Invalid backup file.'); }
  };
  i.click();
}

// ---- Render ----
function render(keepFocus) {
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
  const focused = keepFocus && document.activeElement;
  const pos = focused?.selectionStart;
  $('#view').innerHTML = views[state.view]();
  if (focused?.tagName === 'INPUT') { const i = $('#view input[placeholder]'); i?.focus(); i?.setSelectionRange(pos, pos); }
}
$('#nav').onclick = e => { const v = e.target.dataset.view; if (v) { state.view = v; render(); } };
render();
