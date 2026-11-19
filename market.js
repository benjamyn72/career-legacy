import { byId, need, key, label, integer } from './model.js';
import { game, windowView, performGame } from './game.js';
import { signingCheck } from './transfer.js';
import { includesCountry, sameCountry } from './identity.js';
import { nameCandidates, playerCard, activeAcademy, gameplayStats } from './roster.js';
import { loyalty } from './progression.js';
import { scanState } from './scan.js';
export function signingView(s, cid, wid, x, eaAllows) { const c = byId(s.careers, cid), v = windowView(s, cid, wid), rows = game(s).transfers.filter(t => t.seasonId === c.seasonId && t.journeyId === c.journeyId && t.direction === 'in'); const outsideUsed = rows.filter(t => { const n = byId(s.players, t.playerId).nationality; return n !== null && !includesCountry(v.r.region, n); }).length; const loansUsed = rows.filter(t => t.loan).length; return { ...signingCheck(v.r, { ...x, outsideUsed, loansUsed }, v.slots, eaAllows), outsideUsed, loansUsed, slots: v.slots }; }
export function performMarket(s, q) {
    const c = byId(s.careers, q.careerId);
    need(c.status === 'Active' && q.confirmed === true && typeof q.existing === 'boolean', 'Confirm actual signing');
    label(q.name);
    label(q.position);
    key(q.playerId);
    key(q.id);
    key(q.spellId);
    if (q.currency !== null)
        need(/^[A-Z]{3}$/.test(q.currency), 'Currency');
    if (q.signing.ovr !== null)
        integer(q.signing.ovr, 1, 99);
    if (q.signing.age !== null)
        integer(q.signing.age, 15, 60);
    if (q.signing.country !== null)
        label(q.signing.country);
    need(signingView(s, c.id, q.windowId, q.signing, q.eaAllows).allowed, 'Signing disallowed or incomplete');
    if (q.existing) {
        const p = byId(s.players, q.playerId);
        need(p.careerId === c.id && p.name === q.name, 'Player identity mismatch');
        need(!activeAcademy(s, c.journeyId).some(x => x.playerId === p.id), 'Use academy promotion');
        if (p.nationality === null)
            p.nationality = q.signing.country;
        else
            need(q.signing.country !== null && sameCountry(p.nationality, q.signing.country), 'Nationality mismatch');
    }
    else {
        need(!s.players.some(x => x.id === q.playerId) && nameCandidates(s, c.id, q.name).length === 0, 'Existing or ambiguous player: select known player');
        s.players.push({ id: q.playerId, careerId: c.id, name: q.name, nationality: q.signing.country });
    }
    performGame(s, { type: 'completeSigning', careerId: c.id, id: q.id, windowId: q.windowId, playerId: q.playerId, position: q.position, signing: q.signing, eaAllows: q.eaAllows, spellId: q.spellId, currency: q.currency });
    // Fee is not market value. Unknown price remains null until a squad import.
    const old = s.snapshots.find(x => x.playerId === q.playerId && x.seasonId === c.seasonId && x.date === c.gameDate);
    if (old) {
        if (q.signing.ovr !== null)
            old.ovr = q.signing.ovr;
        if (q.signing.age !== null)
            old.age = q.signing.age;
        old.position = q.position;
    }
    else
        s.snapshots.push({ id: `market:${q.id}`, playerId: q.playerId, seasonId: c.seasonId, date: c.gameDate, ovr: q.signing.ovr, age: q.signing.age, position: q.position, value: null, currency: null });
}
export function memberContext(s, cid, pid) { const c = byId(s.careers, cid), p = byId(s.players, pid); need(p.careerId === cid, 'Cross-career player'); const spells = s.spells.filter(x => x.playerId === pid && x.journeyId === c.journeyId); need(spells.some(x => x.end === null), 'Not at current club'); const seasons = s.seasons.filter(x => x.journeyId === c.journeyId && x.closed && x.left === null && x.joined === x.start && spells.some(sp => sp.start <= x.start && (sp.end === null || sp.end >= x.end))); const rows = gameplayStats(s, s.stats.filter(x => x.playerId === pid && x.scope === 'total' && s.seasons.some(se => se.id === x.seasonId && se.journeyId === c.journeyId))); const required = s.seasons.filter(x => x.journeyId === c.journeyId && spells.some(sp => sp.start <= x.end && (sp.end === null || sp.end >= x.joined))); const apps = required.every(se => rows.some(x => x.seasonId === se.id && x.apps !== null)) ? rows.reduce((a, b) => a + (b.apps ?? 0), 0) : null; const fullSeasons = seasons.length; return { card: playerCard(s, pid, c.seasonId), fullSeasons, clubApps: apps, loyalty: loyalty(fullSeasons, apps), homegrown: game(s).youth.some(y => y.playerId === pid && y.journeyId === c.journeyId), firstSeason: spells.some(sp => sp.end === null && sp.start >= byId(s.seasons, c.seasonId).start) }; }
export function marketReconciliation(s, cid) { const c = byId(s.careers, cid), j = byId(s.journeys, c.journeyId), norm = (v) => String(v ?? '').trim().toLowerCase(), actual = game(s).transfers.filter(t => t.seasonId === c.seasonId && t.journeyId === j.id); const observed = scanState(s).records.filter(r => r.kind === 'transfer' && r.seasonId === c.seasonId).flatMap(r => { const from = norm(r.cells.from) === norm(j.club), to = norm(r.cells.to) === norm(j.club); if (from === to)
    return []; const candidates = nameCandidates(s, c.id, String(r.cells.name)); return [{ id: r.entityId, name: String(r.cells.name), date: String(r.cells.date), direction: from ? 'out' : 'in', fee: typeof r.cells.fee === 'number' ? r.cells.fee : null, currency: r.currency, pid: candidates.length === 1 ? candidates[0].id : null }]; }); const possible = (a, b) => a.playerId === b.pid && a.date === b.date && a.direction === b.direction; const matched = new Set(); const rows = actual.map(a => { const options = observed.filter(b => possible(a, b)); const b = options.length === 1 && actual.filter(t => possible(t, options[0])).length === 1 ? options[0] : undefined; if (b)
    matched.add(b.id); return { id: a.id, name: byId(s.players, a.playerId).name, date: a.date, direction: a.direction, status: !b ? 'manual-only' : a.currency && b.currency && a.currency !== b.currency || a.fee !== null && b.fee !== null && a.fee !== b.fee ? 'conflict' : 'matched' }; }); return [...rows, ...observed.filter(b => !matched.has(b.id)).map(b => ({ id: b.id, name: b.name, date: b.date, direction: b.direction, status: 'import-only' }))]; }
