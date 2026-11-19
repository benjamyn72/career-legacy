import { currentRule } from './game.js';
import { scoutStaffAllowed, allowedScout } from './rules.js';
import { academyLevel } from './progression.js';
import { byId, need, date, key, label, integer, canonical, prevDay } from './model.js';
import { normalizeAssisted, assertAssistedScope, performScan, scanState } from './scan.js';
import { game, performGame } from './game.js';
import { legacy } from './legacy.js';
export const roster = (s) => s.roster ?? { version: 1, reviews: [], academy: [], media: [] };
const init = (s) => s.roster ?? (s.roster = roster(s));
const norm = (s) => s.trim().normalize('NFKC').toLocaleLowerCase();
const ascii = (v) => norm(v).normalize('NFD').replace(/\p{M}/gu, '').replace(/\./g, '').replace(/\s+/g, ' ');
export function nameCandidates(s, cid, name) { const all = s.players.filter(x => x.careerId === cid), exact = all.filter(x => norm(x.name) === norm(name)); if (exact.length && ascii(name).split(' ')[0].length > 1)
    return exact; const short = (v) => { const p = ascii(v).split(' '); return p.length >= 2 ? p[0].slice(0, 1) + ' ' + p.slice(1).join(' ') : null; }; const a = short(name); return all.filter(x => ascii(x.name) === ascii(name) || (a !== null && short(x.name) === a && (ascii(name).split(' ')[0].length === 1 || ascii(x.name).split(' ')[0].length === 1))); }
export function gameplayStats(s, rows) { return rows.map(r => { const b = roster(s).baselines?.find(x => x.seasonId === r.seasonId && x.playerId === r.playerId); if (!b)
    return r; return { ...r, ...Object.fromEntries(['apps', 'goals', 'assists', 'cleanSheets'].map(f => [f, b[f] === null || r[f] === null ? null : Math.max(0, r[f] - b[f])])) }; }); }
export const seasonLabel = (start, end) => start.slice(0, 4) === end.slice(0, 4) ? start.slice(0, 4) : `${start.slice(0, 4)}/${end.slice(2, 4)}`;
const types = ['career_start', 'transfer_window_end', 'season_end'];
const required = { career_start: ['status', 'attributes', 'financial', 'youth'], transfer_window_end: ['status', 'transfer', 'youth'], season_end: ['status', 'stats', 'attributes', 'financial', 'youth', 'league', 'transfer'] };
const optional = { career_start: ['stats', 'league', 'transfer'], transfer_window_end: ['attributes', 'financial'], season_end: [] };
function checkKinds(t, docs, empty) { need(types.includes(t) && Array.isArray(empty) && new Set(empty).size === empty.length && empty.every(x => x === 'youth' || x === 'transfer'), 'Invalid import type or empty sections'); const set = new Set(docs.map(x => x.kind)); need(empty.every(x => !set.has(x)), 'Empty section also has rows'); need(required[t].every(x => set.has(x) || empty.includes(x)), 'Missing required source: ' + required[t].filter(x => !set.has(x) && !empty.includes(x)).join(', ')); need([...set, ...empty].every(k => required[t].includes(k) || optional[t].includes(k)), 'Source not valid for import type'); }
// Data URLs only, never executable SVG or remotely linked images. Browser decodes before rendering; cap keeps existing JSON backup practical.
export function checkPortrait(v) { need(typeof v === 'string' && v.length <= 180000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(v), 'Invalid or oversized portrait (JPEG/PNG/WebP, max ~130 KB)'); const [mime, encoded] = v.split(','); let bytes; try {
    bytes = atob(encoded);
}
catch {
    throw Error('Invalid portrait encoding');
} need((mime.includes('jpeg') && bytes.startsWith('\xff\xd8\xff')) || (mime.includes('png') && bytes.startsWith('\x89PNG\r\n\x1a\n')) || (mime.includes('webp') && bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP'), 'Portrait image header mismatch'); }
export function normalizeCycle(raw) { const e = raw; need(e?.format === 'cl-assisted-scan-v2' && types.includes(e.importType), 'Invalid typed assisted package'); const a = normalizeAssisted({ ...e, format: 'cl-assisted-scan-v1' }); const meta = { importType: e.importType, context: a.context, windowId: e.windowId ?? null, emptyKinds: e.emptyKinds ?? [], portraits: e.portraits ?? [] }; checkKinds(meta.importType, a.documents, meta.emptyKinds); need((meta.importType === 'transfer_window_end') === (typeof meta.windowId === 'string'), 'Transfer window ID required only for window review'); need(Array.isArray(meta.portraits) && meta.portraits.length <= 100, 'Invalid portraits'); for (const p of meta.portraits) {
    label(p.name);
    checkPortrait(p.image);
    need(p.playerId === undefined, 'External package cannot assign internal player IDs');
} return { ...a, meta }; }
function putPortrait(s, pid, image) { checkPortrait(image); const r = init(s), l = s.legacy ?? (s.legacy = legacy(s)); const existing = r.media.find(m => m.playerId === pid && m.image === image); let id = existing?.id; if (!id) {
    id = `portrait:${r.media.length + 1}`;
    need(r.media.reduce((n, m) => n + m.image.length, 0) + image.length <= 6000000, 'Portrait storage limit reached; export before adding more');
    r.media.push({ id, playerId: pid, image });
} const p = l.portraits.find(x => x.playerId === pid); if (p)
    p.mediaId = id;
else
    l.portraits.push({ playerId: pid, mediaId: id }); }
export function portraitFor(s, pid, mediaId) { const id = mediaId === undefined ? legacy(s).portraits.find(x => x.playerId === pid)?.mediaId : mediaId; return roster(s).media.find(x => x.id === id && x.playerId === pid)?.image ?? null; }
const stable = (s, pid, jid, day) => { const active = s.spells.find(x => x.playerId === pid && x.end === null); if (active) {
    need(active.journeyId === jid, 'Player already belongs to another club');
    return;
} const prior = s.spells.filter(x => x.playerId === pid).sort((a, b) => a.start.localeCompare(b.start)).at(-1); need(!prior || prior.end !== null && prior.end < day, 'Membership history conflicts; review'); s.spells.push({ id: `roster-spell:${s.spells.length + 1}`, playerId: pid, journeyId: jid, start: day, end: null }); };
function addAcademyObserved(s, q, pid, pos, ovr) {
    const c = byId(s.careers, q.careerId), r = init(s);
    if (r.academy.some(x => x.playerId === pid && x.journeyId === c.journeyId))
        return;
    need(!s.spells.some(x => x.playerId === pid && x.end === null), 'First-team player cannot be imported as academy member');
    r.academy.push({ playerId: pid, journeyId: c.journeyId, joined: q.observedOn, promoted: null, position: pos, observed: true });
    if (!game(s).youth.some(y => y.playerId === pid)) { // Historical observation is a baseline, not a fresh signing or debut.
        if (!byId(s.seasons, c.seasonId).closed)
            performGame(s, { type: 'enrollYouth', careerId: c.id, playerId: pid, baselineOVR: ovr });
    }
}
export function performCycle(s, q, meta) {
    const c = byId(s.careers, q.careerId), se = byId(s.seasons, c.seasonId), j = byId(s.journeys, c.journeyId);
    need(q.confirmed && q.seasonId === se.id && !se.closed && q.closeMonth === null && q.advanceTo === undefined, 'Typed import requires open selected season; no monthly close');
    assertAssistedScope(s, c.id, meta.context);
    need(meta.context.observedOn === q.observedOn && meta.context.currency === q.currency, 'Import date/currency mismatch');
    const sl = seasonLabel(se.start, se.end);
    need(meta.context.seasonLabel === sl || meta.context.seasonLabel === `${se.start.slice(0, 4)}/${se.end.slice(0, 4)}`, 'Season label mismatch');
    checkKinds(meta.importType, q.documents.filter(d => d.rows.length), meta.emptyKinds);
    need((meta.importType === 'transfer_window_end') === (typeof meta.windowId === 'string'), 'Invalid window');
    const r = init(s);
    const prior = r.reviews.find(x => x.journeyId === j.id && x.type === meta.importType && (meta.importType === 'career_start' || x.seasonId === se.id && x.windowId === meta.windowId));
    if (prior)
        need(prior.seasonId === se.id && prior.date === q.observedOn, 'Review already recorded at another date');
    if (meta.importType === 'career_start')
        need(se.joined === q.observedOn, 'Career start must use club join date');
    if (meta.importType === 'season_end')
        need(q.observedOn <= se.end, 'Final data belongs to selected season');
    if (meta.importType === 'transfer_window_end') {
        const w = byId(se.windows, meta.windowId);
        need(q.observedOn >= w.end, 'Transfer window has not ended');
    }
    const senior = new Set(q.documents.filter(d => d.kind === 'status').flatMap(d => d.rows.map(x => x.entityId)));
    const young = new Set(q.documents.filter(d => d.kind === 'youth').flatMap(d => d.rows.map(x => x.entityId)));
    need([...young].every(x => !senior.has(x)), 'Player appears in first team and academy');
    for (const pid of young)
        need(!r.academy.some(x => x.playerId === pid && x.journeyId === j.id && x.promoted !== null), 'Promoted player cannot return to academy by import');
    performScan(s, q, () => { throw Error('Typed import cannot close month'); });
    if (meta.importType === 'career_start') {
        const baselines = r.baselines ?? (r.baselines = []);
        const statRows = q.documents.filter(d => d.kind === 'stats').flatMap(d => d.rows);
        for (const pid of new Set([...senior, ...statRows.map(x => x.entityId)])) {
            const a = statRows.find(x => x.entityId === pid)?.cells;
            if (!a && se.joined === se.start)
                continue;
            const b = { seasonId: se.id, playerId: pid, apps: a?.apps ?? null, goals: a?.goals ?? null, assists: a?.assists ?? null, cleanSheets: a?.clean_sheets ?? null };
            const old = baselines.find(x => x.playerId === pid && x.seasonId === se.id);
            if (old)
                Object.assign(old, b);
            else
                baselines.push(b);
        }
    }
    for (const d of q.documents.filter(d => d.kind === 'youth'))
        for (const row of d.rows)
            addAcademyObserved(s, q, row.entityId, row.cells.pos, row.cells.ovr);
    for (const pid of new Set([...senior, ...young])) {
        const y = game(s).youth.find(x => x.playerId === pid && x.journeyId === j.id);
        if (y && y.baselineOVR === null) {
            const observed = s.snapshots.find(x => x.playerId === pid && x.seasonId === se.id && x.date === q.observedOn && x.ovr !== null);
            if (observed)
                y.baselineOVR = observed.ovr;
        }
    }
    for (const pid of senior) {
        const y = r.academy.find(x => x.playerId === pid && x.journeyId === j.id);
        if (y && !y.promoted)
            y.promoted = q.observedOn;
        stable(s, pid, j.id, q.observedOn);
    }
    // A verified outgoing transfer, not mere absence, can close a spell. Never add pressure compensation or duplicate decision ledger.
    for (const d of q.documents.filter(d => d.kind === 'transfer'))
        for (const row of d.rows) {
            const v = row.cells;
            if (norm(String(v.from)) !== norm(j.club))
                continue;
            const players = nameCandidates(s, c.id, String(v.name));
            if (players.length !== 1)
                continue;
            const p = players[0], sp = s.spells.find(x => x.playerId === p.id && x.journeyId === j.id && x.end === null);
            if (sp && !senior.has(p.id) && String(v.date) > sp.start) {
                sp.end = prevDay(String(v.date));
            }
        }
    need(Array.isArray(meta.portraits) && meta.portraits.length <= 100, 'Invalid portraits');
    const seen = new Set();
    for (const p of meta.portraits) {
        label(p.name);
        const candidates = p.playerId ? s.players.filter(x => x.careerId === c.id && x.id === p.playerId) : nameCandidates(s, c.id, p.name);
        need(candidates.length === 1, 'Portrait matching ambiguous: ' + p.name);
        const pid = candidates[0].id;
        need(!seen.has(pid), 'Duplicate portrait');
        seen.add(pid);
        putPortrait(s, pid, p.image);
    }
    if (!prior)
        r.reviews.push({ careerId: c.id, journeyId: j.id, seasonId: se.id, type: meta.importType, windowId: meta.windowId, date: q.observedOn });
}
export function performRoster(s, q) { const c = byId(s.careers, q.careerId), se = byId(s.seasons, c.seasonId), r = init(s); need(c.status === 'Active' && q.confirmed, 'Confirm active career'); if (q.type === 'setPortrait') {
    need(byId(s.players, q.playerId).careerId === c.id, 'Cross-career portrait');
    putPortrait(s, q.playerId, q.image);
    return;
} need(!se.closed && c.gameDate <= se.end, 'Season closed'); if (q.type === 'configureAcademyScouts') {
    const j = byId(s.journeys, c.journeyId), rule = currentRule(s, se.id);
    need(Array.isArray(q.assignments) && scoutStaffAllowed(academyLevel(j.academyXP), q.assignments, 3), 'Academy scout number/star limit');
    for (const a of q.assignments)
        if (a.country !== null) {
            label(a.country);
            need(allowedScout(rule, a.country, true), 'Academy scouting geography');
        }
    const list = r.scouts ?? (r.scouts = []);
    const prior = list.find(x => x.journeyId === j.id);
    if (prior)
        prior.assignments = structuredClone(q.assignments);
    else
        list.push({ journeyId: j.id, assignments: structuredClone(q.assignments) });
    return;
} if (q.type === 'newTalent') {
    key(q.playerId);
    label(q.name);
    label(q.position);
    label(q.country);
    if (q.ovr !== null)
        integer(q.ovr, 1, 99);
    need(!s.players.some(x => x.id === q.playerId), 'Duplicate player ID');
    s.players.push({ id: q.playerId, careerId: c.id, name: q.name, nationality: q.country });
    performGame(s, { type: 'academyAction', careerId: c.id, id: `sign:${q.playerId}`, playerId: q.playerId, kind: 'sign', country: q.country, reportId: q.reportId, eaAllows: true });
    performGame(s, { type: 'enrollYouth', careerId: c.id, playerId: q.playerId, baselineOVR: q.ovr });
    r.academy.push({ playerId: q.playerId, journeyId: c.journeyId, joined: c.gameDate, promoted: null, position: q.position, observed: false });
    s.snapshots.push({ id: `talent:${q.playerId}`, playerId: q.playerId, seasonId: se.id, date: c.gameDate, ovr: q.ovr, age: null, position: q.position, value: null, currency: null });
    if (q.portrait)
        putPortrait(s, q.playerId, q.portrait);
    return;
} const y = r.academy.find(x => x.playerId === q.playerId && x.journeyId === c.journeyId); need(y && y.promoted === null, 'Not active academy talent'); performGame(s, { type: 'academyAction', careerId: c.id, id: `promote:${q.playerId}`, playerId: q.playerId, kind: 'promote', country: null, reportId: null, eaAllows: true, spellId: q.spellId }); y.promoted = c.gameDate; }
export function activeAcademy(s, jid) { return roster(s).academy.filter(x => x.journeyId === jid && x.promoted === null); }
export function playerCard(s, pid, sid) { const se = byId(s.seasons, sid), p = byId(s.players, pid); need(p.careerId === se.careerId, 'Card scope'); const hist = s.snapshots.filter(x => x.playerId === pid && byId(s.seasons, x.seasonId).journeyId === se.journeyId && x.date <= (se.left ?? se.end)).sort((a, b) => a.date.localeCompare(b.date)); const last = (f) => hist.filter(x => x[f] !== null).at(-1); const ov = last('ovr'), val = last('value'), a = last('age'), pos = last('position'); const status = scanState(s).records.filter(x => x.entityId === pid && x.kind === 'status' && byId(s.seasons, x.seasonId).journeyId === se.journeyId && x.observedOn <= (se.left ?? se.end)).sort((a, b) => a.observedOn.localeCompare(b.observedOn)).at(-1); const y = roster(s).academy.find(x => x.playerId === pid && x.journeyId === se.journeyId); return { player: p, ovr: ov?.ovr ?? null, ovrDate: ov?.date ?? null, age: a?.age ?? null, position: pos?.position ?? y?.position ?? null, value: val?.value ?? null, currency: val?.currency ?? null, role: status?.cells.role ?? null, number: status?.cells.number ?? null, observedOn: hist.at(-1)?.date ?? null, portrait: portraitFor(s, pid), pendingFirstTeam: !!y?.promoted && !status, stat: s.stats.find(x => x.playerId === pid && x.seasonId === sid && x.scope === 'total') ?? null }; }
export function validateRoster(s) { if (!s.roster)
    return; const r = s.roster; need(r.version === 1 && Array.isArray(r.reviews) && Array.isArray(r.academy) && Array.isArray(r.media), 'Roster schema'); const unique = (a) => need(new Set(a).size === a.length, 'Duplicate roster key'); unique(r.academy.map(x => canonical([x.journeyId, x.playerId]))); unique(r.reviews.map(x => canonical([x.journeyId, x.type, x.type === 'career_start' ? null : x.seasonId, x.windowId]))); unique(r.media.map(x => x.id)); let bytes = 0; for (const m of r.media) {
    key(m.id);
    byId(s.players, m.playerId);
    checkPortrait(m.image);
    bytes += m.image.length;
} need(bytes <= 6000000, 'Portrait storage limit'); for (const y of r.academy) {
    const p = byId(s.players, y.playerId), j = byId(s.journeys, y.journeyId);
    need(p.careerId === j.careerId, 'Academy ownership');
    date(y.joined);
    need(y.joined >= j.start, 'Academy date');
    if (y.promoted !== null) {
        date(y.promoted);
        need(y.promoted >= y.joined, 'Promotion date');
    }
    if (y.position !== null)
        label(y.position);
} for (const v of r.reviews) {
    const se = byId(s.seasons, v.seasonId);
    need(se.careerId === v.careerId && se.journeyId === v.journeyId && types.includes(v.type), 'Review scope');
    date(v.date);
    if (v.windowId !== null)
        byId(se.windows, v.windowId);
} unique((r.scouts ?? []).map(x => x.journeyId)); for (const x of r.scouts ?? []) {
    byId(s.journeys, x.journeyId);
    need(Array.isArray(x.assignments) && x.assignments.length <= 3, 'Scout table');
    for (const a of x.assignments) {
        integer(a.experience, 1, 5);
        integer(a.judgment, 1, 5);
        if (a.country !== null)
            label(a.country);
    }
} for (const b of r.baselines ?? []) {
    need(byId(s.players, b.playerId).careerId === byId(s.seasons, b.seasonId).careerId, 'Baseline scope');
    for (const f of [b.apps, b.goals, b.assists, b.cleanSheets])
        if (f !== null)
            integer(f);
} unique((r.baselines ?? []).map(x => canonical([x.seasonId, x.playerId]))); for (const p of legacy(s).portraits) {
    const m = r.media.find(x => x.id === p.mediaId);
    if (m)
        need(m.playerId === p.playerId, 'Portrait ownership');
} }
