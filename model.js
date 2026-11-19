import { validateRpg } from './rpg.js';
import { validateRoster } from './roster.js';
import { validateLegacy } from './legacy.js';
import { validateScan } from './scan.js';
import { validateEvents } from './events.js';
import { validateGame } from './game.js';
export const empty = () => ({ schema: 1, revision: 0, profile: { id: 'local', activeCareerId: null }, careers: [], journeys: [], seasons: [], players: [], spells: [], snapshots: [], stats: [], matches: [], closures: [], entitlements: [], imports: [], audit: [] });
export const MODES = ['Realistic', 'Balanced', 'Entertainment', 'Chaos'];
export const ODDS = Object.freeze([45, 30, 18, 6, 1]);
export function need(condition, msg) { if (!condition)
    throw Error(msg); }
export const byId = (xs, id) => { const x = xs.find(x => x.id === id); need(x, `Unknown ID: ${id}`); return x; };
export function date(s) { need(typeof s === 'string' && /^\d{4}-\d\d-\d\d$/.test(s) && s >= '1900-01-01' && s <= '2199-12-31', 'Invalid date'); const d = new Date(s + 'T00:00:00Z'); need(!isNaN(+d) && d.toISOString().slice(0, 10) === s, 'Invalid date'); return s; }
export function month(s) { date(s + '-01'); return s; }
export function shiftMonth(s, n) { month(s); const d = new Date(s + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); }
export function monthDiff(a, b) { month(a); month(b); return (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + +b.slice(5) - +a.slice(5); }
export function nextDay(s) { const d = new Date(date(s) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
export function prevDay(s) { const d = new Date(date(s) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }
export function integer(n, min = 0, max = Number.MAX_SAFE_INTEGER) { need(typeof n === 'number' && Number.isSafeInteger(n) && n >= min && n <= max, 'Invalid integer'); }
export function nullableInt(n, min = 0, max = Number.MAX_SAFE_INTEGER) { if (n !== null)
    integer(n, min, max); }
export function label(s) { need(typeof s === 'string' && s.trim().length > 0 && s.length <= 500, 'Invalid label'); }
export function key(s) { need(typeof s === 'string' && /^[A-Za-z0-9_.:-]{1,180}$/.test(s), 'Invalid ID'); }
export function seasonCheck(s) { date(s.start); date(s.end); date(s.joined); need(['European', 'Calendar', 'Custom'].includes(s.model) && s.start <= s.joined && s.joined <= s.end, 'Invalid season'); need(monthDiff(s.start.slice(0, 7), s.end.slice(0, 7)) < 12, 'Prototype supports up to 12 calendar months per season'); if (s.left !== null) {
    date(s.left);
    need(s.left >= s.joined && s.left <= s.end, 'Invalid departure');
} ; need(typeof s.closed === 'boolean', 'Invalid close flag'); need(Array.isArray(s.windows), 'Invalid windows'); const ids = new Set(); for (const w of s.windows) {
    key(w.id);
    label(w.label);
    date(w.start);
    date(w.end);
    need(w.start <= w.end && !ids.has(w.id), 'Invalid window');
    if (w.kind !== undefined)
        need(['summer', 'winter'].includes(w.kind) && w.start <= s.end && w.end >= s.start, 'Window kind/date');
    ids.add(w.id);
} const typed = s.windows.filter(w => w.kind !== undefined); need(new Set(typed.map(w => w.kind)).size === typed.length && typed.every((a, i) => typed.slice(i + 1).every(b => a.end < b.start || b.end < a.start)), 'Overlapping or duplicate typed windows'); }
export function slotCount(mode, ordinal) { integer(ordinal, 1, 12); need(MODES.includes(mode), 'Invalid mode'); return mode === 'Chaos' ? 2 : mode === 'Entertainment' ? 1 : mode === 'Balanced' ? Number(ordinal % 2 === 0) : Number(ordinal % 3 === 0); }
export function canonical(v) { if (v === null || typeof v === 'string' || typeof v === 'boolean')
    return JSON.stringify(v); if (typeof v === 'number') {
    need(Number.isFinite(v), 'Nonfinite');
    return JSON.stringify(v);
} if (Array.isArray(v))
    return '[' + v.map(canonical).join(',') + ']'; need(typeof v === 'object' && v !== null, 'Non-JSON'); const o = v; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}'; }
export function validate(s) {
    need(s?.schema === 1, 'Unsupported schema');
    integer(s.revision);
    key(s.profile.id);
    const tables = [s.careers, s.journeys, s.seasons, s.players, s.spells, s.snapshots, s.stats, s.matches, s.closures, s.entitlements, s.imports, s.audit];
    for (const t of tables) {
        need(Array.isArray(t), 'Missing table');
        const ids = new Set();
        for (const row of t) {
            key(row.id);
            need(!ids.has(row.id), 'Duplicate ID');
            ids.add(row.id);
        }
    }
    if (s.profile.activeCareerId !== null)
        byId(s.careers, s.profile.activeCareerId);
    for (const c of s.careers) {
        label(c.name);
        label(c.edition);
        date(c.gameDate);
        month(c.nextMonth);
        integer(c.managerXP);
        need(c.catalogVersion === null || typeof c.catalogVersion === 'string', 'Catalog version');
        need(MODES.includes(c.mode) && ['Active', 'Paused', 'Completed', 'Abandoned'].includes(c.status), 'Invalid career');
        const j = byId(s.journeys, c.journeyId), se = byId(s.seasons, c.seasonId);
        need(j.careerId === c.id && se.careerId === c.id && se.journeyId === j.id && j.end === null && c.gameDate >= se.joined && c.gameDate <= nextDay(se.end), 'Career pointer');
        need(c.nextMonth >= se.start.slice(0, 7) && c.nextMonth <= c.gameDate.slice(0, 7) && monthDiff(c.nextMonth, c.gameDate.slice(0, 7)) <= 1, 'Month cursor');
    }
    for (const j of s.journeys) {
        byId(s.careers, j.careerId);
        label(j.club);
        date(j.start);
        integer(j.prestige, 1, 6);
        integer(j.academyXP);
        if (j.end !== null) {
            date(j.end);
            need(j.end >= j.start, 'Journey dates');
        }
    }
    for (const c of s.careers) {
        const js = s.journeys.filter(j => j.careerId === c.id).sort((a, b) => a.start.localeCompare(b.start));
        need(js.filter(j => j.end === null).length === 1, 'One current journey');
        for (let i = 1; i < js.length; i++)
            need(js[i - 1].end !== null && js[i - 1].end < js[i].start, 'Overlapping journeys');
    }
    for (const se of s.seasons) {
        seasonCheck(se);
        const j = byId(s.journeys, se.journeyId);
        need(j.careerId === se.careerId && se.joined >= j.start && (j.end === null || (se.left ?? se.end) <= j.end), 'Season ownership');
    }
    for (const j of s.journeys) {
        const ss = s.seasons.filter(x => x.journeyId === j.id).sort((a, b) => a.joined.localeCompare(b.joined));
        for (let i = 1; i < ss.length; i++)
            need((ss[i - 1].left ?? ss[i - 1].end) < ss[i].joined, 'Overlapping seasons');
    }
    const owner = (pid, sid) => { const p = byId(s.players, pid), se = byId(s.seasons, sid); need(p.careerId === se.careerId, 'Cross-career player'); return se; };
    for (const p of s.players) {
        byId(s.careers, p.careerId);
        label(p.name);
        if (p.nationality !== null)
            label(p.nationality);
    }
    for (const sp of s.spells) {
        const p = byId(s.players, sp.playerId), j = byId(s.journeys, sp.journeyId);
        date(sp.start);
        need(p.careerId === j.careerId && sp.start >= j.start && (j.end === null || sp.end !== null && sp.end <= j.end), 'Spell owner');
        if (sp.end !== null) {
            date(sp.end);
            need(sp.end >= sp.start, 'Spell dates');
        }
    }
    for (const p of s.players) {
        const a = s.spells.filter(x => x.playerId === p.id).sort((a, b) => a.start.localeCompare(b.start));
        for (let i = 1; i < a.length; i++)
            need(a[i - 1].end !== null && a[i - 1].end < a[i].start, 'Overlap player membership');
    }
    const sk = new Set();
    for (const x of s.snapshots) {
        const se = owner(x.playerId, x.seasonId);
        date(x.date);
        need(x.date >= se.joined && x.date <= (se.left ?? se.end) && x.date <= byId(s.careers, se.careerId).gameDate, 'Snapshot date');
        nullableInt(x.ovr, 1, 99);
        nullableInt(x.age, 14, 60);
        nullableInt(x.value);
        if (x.position !== null)
            label(x.position);
        if (x.currency !== null)
            need(/^[A-Z]{3}$/.test(x.currency), 'Currency');
        need((x.value === null) === (x.currency === null), 'Currency/value pair');
        const k = canonical([x.playerId, x.seasonId, x.date]);
        need(!sk.has(k), 'Duplicate snapshot');
        sk.add(k);
    }
    const st = new Set();
    for (const x of s.stats) {
        owner(x.playerId, x.seasonId);
        label(x.scope);
        for (const v of [x.apps, x.goals, x.assists, x.cleanSheets])
            nullableInt(v);
        if (x.apps !== null && x.cleanSheets !== null)
            need(x.cleanSheets <= x.apps, 'Clean sheets > apps');
        const k = canonical([x.playerId, x.seasonId, x.scope]);
        need(!st.has(k), 'Duplicate stat');
        st.add(k);
    }
    for (const m of s.matches) {
        const se = byId(s.seasons, m.seasonId);
        date(m.date);
        need(se.careerId === m.careerId && m.date >= se.joined && m.date <= (se.left ?? se.end) && m.date <= byId(s.careers, m.careerId).gameDate, 'Match scope/date');
        integer(m.gf, 0, 99);
        integer(m.ga, 0, 99);
        if (m.opponent !== null)
            label(m.opponent);
        if (m.competition !== null)
            label(m.competition);
        need([null, 'home', 'away'].includes(m.venue), 'Invalid venue');
        label(m.source);
    }
    const ck = new Set();
    for (const cl of s.closures) {
        const se = byId(s.seasons, cl.seasonId), c = byId(s.careers, cl.careerId);
        month(cl.month);
        need(se.careerId === c.id && cl.id === `${c.id}:${cl.month}` && cl.month < c.gameDate.slice(0, 7) && cl.ordinal === monthDiff(se.start.slice(0, 7), cl.month) + 1 && cl.month >= se.joined.slice(0, 7) && cl.month <= (se.left ?? se.end).slice(0, 7) && cl.mode === c.mode && cl.slots === slotCount(cl.mode, cl.ordinal) && ['scan', 'manual'].includes(cl.source), 'Month closure');
        need(!ck.has(cl.id), 'Duplicate month');
        ck.add(cl.id);
        need(s.entitlements.filter(e => e.closureId === cl.id).length === cl.slots, 'Entitlement count');
    }
    for (const e of s.entitlements) {
        const cl = byId(s.closures, e.closureId);
        need(e.careerId === cl.careerId && e.id === `${cl.id}:${e.slot}` && e.status === 'pending', 'Entitlement owner');
        integer(e.slot, 0, cl.slots - 1);
    }
    const ik = new Set();
    for (const x of s.imports) {
        const se = byId(s.seasons, x.seasonId);
        need(se.careerId === x.careerId && x.kind === 'calendar' && /^[a-f0-9]{64}$/.test(x.sourceHash), 'Import scope');
        const k = canonical([x.careerId, x.seasonId, x.sourceHash]);
        need(!ik.has(k), 'Duplicate import');
        ik.add(k);
        need(new Set(x.matchIds).size === x.matchIds.length, 'Duplicate match ref');
        for (const id of x.matchIds)
            need(byId(s.matches, id).seasonId === se.id, 'Import match scope');
    }
    for (const a of s.audit) {
        label(a.type);
        need(typeof a.signature === 'string', 'Audit signature');
        integer(a.revision, 1, s.revision);
    }
    need(s.audit.length === s.revision && s.audit.every((a, i) => a.revision === i + 1), 'Revision log mismatch');
    validateGame(s);
    validateEvents(s);
    validateScan(s);
    validateLegacy(s);
    validateRoster(s);
    validateRpg(s);
    canonical(s);
    return s;
}
