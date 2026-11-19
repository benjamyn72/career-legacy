import { byId, need, canonical, integer, label, date, key } from './model.js';
import { game } from './game.js';
import { knownPlayerIds, playerProfile, playerLeaderboard, leagueStats, calendarStats, squadTrend, bestXI, trophies, transferStats, recordRoom, academyStats, measure } from './statistics.js';
import { playerTraits } from './squad.js';
export const AUTO = ['Golden Boot', 'Golden Glove', 'Playmaker', 'Most Improved', 'Iron Man'];
export const MANUAL = ['Player of the Season', 'Golden Boy', 'Signing of the Season', 'Puskás'];
const FACT_KINDS = ['Captain', 'Club Legend', 'Record Breaker', 'Farewell'];
const fresh = () => ({ version: 1, coverage: [], awards: [], cards: [], portraits: [], jerseys: [], yearbooks: [] });
export const legacy = (s) => s.legacy ?? fresh();
const seasonPlayers = (s, sid) => knownPlayerIds(s, sid);
function fullAwards(s, sid) { const se = byId(s.seasons, sid), l = legacy(s), cov = l.coverage.find(x => x.seasonId === sid); if (!se.closed || !cov)
    return []; const ids = seasonPlayers(s, sid); if (!ids.length || canonical([...cov.playerIds].sort()) !== canonical(ids))
    return []; const rows = ids.map(id => { const p = playerProfile(s, id, { seasonId: sid }); const hist = p.history.filter(x => x.ovr !== null); const pos = p.history.filter(x => x.position !== null).at(-1)?.position ?? null; return { id, stat: p.rows[0]?.stat ?? null, pos, growth: hist.length >= 2 && hist[0].date === se.joined && hist.at(-1).date === (se.left ?? se.end) ? p.ovrGrowth : null }; }); const elect = (kind, data, positive = true) => { if (!data.length || data.some(x => x.v === null))
    return []; const best = Math.max(...data.map(x => x.v)); if (positive && best <= 0)
    return []; return [{ seasonId: sid, kind, playerIds: data.filter(x => x.v === best).map(x => x.id).sort(), manual: false }]; }; const gk = rows.every(x => x.pos !== null) ? rows.filter(x => x.pos === 'GK') : []; return [...elect('Golden Boot', rows.map(x => ({ id: x.id, v: x.stat?.goals ?? null }))), ...elect('Playmaker', rows.map(x => ({ id: x.id, v: x.stat?.assists ?? null }))), ...elect('Golden Glove', gk.map(x => ({ id: x.id, v: x.stat?.cleanSheets ?? null }))), ...elect('Most Improved', rows.map(x => ({ id: x.id, v: x.growth }))), ...(cov.teamMatches !== null && cov.teamMatches > 0 && rows.every(x => x.stat?.apps !== null && x.stat?.apps !== undefined && x.stat.apps <= cov.teamMatches) ? elect('Iron Man', rows.map(x => ({ id: x.id, v: x.stat.apps }))) : [])]; }
export function seasonAwards(s, sid) { byId(s.seasons, sid); return [...fullAwards(s, sid), ...legacy(s).awards.filter(x => x.seasonId === sid && x.manual)]; }
export function traitsFor(s, pid, sid) { const se = byId(s.seasons, sid), p = playerProfile(s, pid, { seasonId: sid }), st = p.rows[0]?.stat; const j = playerProfile(s, pid, { journeyId: se.journeyId }); const cov = legacy(s).coverage.find(x => x.seasonId === sid); const prior = s.seasons.filter(x => x.journeyId === se.journeyId && x.end < se.joined).sort((a, b) => a.end.localeCompare(b.end)).at(-1); const past = prior ? s.stats.find(x => x.playerId === pid && x.seasonId === prior.id && x.scope === 'total') : null; const history = p.history.filter(x => x.ovr !== null); const full = s.seasons.filter(x => x.journeyId === se.journeyId && x.closed && !x.left && x.joined === x.start && s.spells.some(sp => sp.playerId === pid && sp.journeyId === se.journeyId && sp.start <= x.start && (sp.end === null || sp.end >= x.end)) && x.end <= se.end).length; return playerTraits({ age: p.history.at(-1)?.age ?? null, ovrStart: history[0]?.date === se.joined ? history[0].ovr : null, ovrEnd: history.at(-1)?.date === (se.left ?? se.end) ? history.at(-1).ovr : null, apps: st?.apps ?? null, teamMatches: cov?.teamMatches ?? null, priorApps: past?.apps ?? null, priorTeamMatches: legacy(s).coverage.find(x => x.seasonId === prior?.id)?.teamMatches ?? null, goals: st?.goals ?? null, assists: st?.assists ?? null, cleanSheets: st?.cleanSheets ?? null, goalkeeper: p.history.filter(x => x.position !== null).at(-1)?.position === 'GK', homegrown: j.homegrown, clubApps: measure(j.rows.filter(r => byId(s.seasons, r.seasonId).joined <= se.joined).map(r => r.stat?.apps ?? null)).value, fullSeasons: full }); }
export function buildYearbook(s, sid) { const se = byId(s.seasons, sid), j = byId(s.journeys, se.journeyId), c = byId(s.careers, se.careerId), q = { seasonId: sid }; return { seasonId: sid, club: j.club, edition: c.edition, start: se.joined, end: se.left ?? se.end, partial: se.joined !== se.start || se.left !== null, league: leagueStats(s, sid), calendar: calendarStats(s, q), leaderboards: { goals: playerLeaderboard(s, 'goals', q), assists: playerLeaderboard(s, 'assists', q), apps: playerLeaderboard(s, 'apps', q) }, awards: seasonAwards(s, sid), bestXI: bestXI(s, q), trophies: trophies(s, q), transfers: transferStats(s, q), squadTrend: squadTrend(s, sid), coverage: 'Known observations; league and calendar not added' }; }
export function performLegacy(s, q) { const c = byId(s.careers, q.careerId); need(c.status === 'Active', 'Career must be Active'); const l = s.legacy ?? (s.legacy = fresh()); if (q.type === 'legacyFact') {
    const se = byId(s.seasons, q.seasonId);
    need(se.careerId === c.id && seasonPlayers(s, se.id).includes(q.playerId), 'Legacy fact scope');
    need(FACT_KINDS.includes(q.kind) && typeof q.confirmed === 'boolean', 'Legacy fact kind');
    if (q.kind === 'Farewell' && q.confirmed)
        need(game(s).transfers.some(t => t.seasonId === se.id && t.playerId === q.playerId && t.direction === 'out'), 'Confirmed departure required');
    const rows = l.facts ?? (l.facts = []);
    const old = rows.find(x => x.seasonId === se.id && x.playerId === q.playerId && x.kind === q.kind);
    if (old)
        old.confirmed = q.confirmed;
    else
        rows.push({ seasonId: se.id, playerId: q.playerId, kind: q.kind, confirmed: q.confirmed, date: c.gameDate });
    return;
} if (q.type === 'jerseyLegacy') {
    integer(q.number, 1, 99);
    need(['retire', 'inherit', 'free'].includes(q.action), 'Jersey action');
    need(q.action === 'free' ? q.playerId === null : q.playerId !== null, 'Jersey target');
    if (q.playerId !== null) {
        need(byId(s.players, q.playerId).careerId === c.id && seasonPlayers(s, c.seasonId).includes(q.playerId), 'Jersey player scope');
    }
    l.jerseys.push({ journeyId: c.journeyId, number: q.number, playerId: q.playerId, action: q.action, date: c.gameDate });
    return;
} const se = byId(s.seasons, q.seasonId); need(se.careerId === c.id && se.closed, 'Closed season required'); const ids = seasonPlayers(s, se.id); switch (q.type) {
    case 'confirmAwardCoverage':
        need(q.confirmed && ids.length > 0 && canonical([...q.playerIds].sort()) === canonical(ids), 'Confirm all known eligible players');
        if (q.teamMatches !== null)
            integer(q.teamMatches, 0, 999);
        l.coverage = l.coverage.filter(x => x.seasonId !== se.id);
        l.coverage.push({ seasonId: se.id, playerIds: [...ids], teamMatches: q.teamMatches });
        break;
    case 'manualAward':
        need(MANUAL.includes(q.kind), 'Manual award kind');
        l.awards = l.awards.filter(x => x.seasonId !== se.id || x.kind !== q.kind);
        if (q.playerId !== null) {
            need(ids.includes(q.playerId), 'Award player scope');
            l.awards.push({ seasonId: se.id, kind: q.kind, playerIds: [q.playerId], manual: true });
        }
        break;
    case 'captureYearbook':
        need(q.confirmed, 'Yearbook confirmation required');
        l.yearbooks = l.yearbooks.filter(x => x.seasonId !== se.id);
        l.yearbooks.push({ seasonId: se.id, revision: s.revision + 1, data: buildYearbook(s, se.id) });
        break;
} }
// Cards preserve the original snapshot; automatic factual corrections revoke eligibility rather than rewriting history.
export function cardGallery(s) { const l = legacy(s); return l.cards.map(c => ({ ...c, valid: cardFacts(s, c.seasonId).some(f => f.playerId === c.playerId && f.kind === c.kind) })); }
function cardFacts(s, sid) {
    const se = byId(s.seasons, sid);
    const l = legacy(s), g = game(s);
    const f = [];
    for (const y of g.youth.filter(x => x.journeyId === se.journeyId)) {
        const p = playerProfile(s, y.playerId, { seasonId: sid });
        const fact = g.facts.find(x => x.playerId === y.playerId && x.journeyId === se.journeyId && x.milestone === 'debut' && x.achieved);
        if (fact && p.rows[0]?.stat?.apps !== null && (p.rows[0]?.stat?.apps ?? 0) > 0)
            f.push({ playerId: y.playerId, kind: 'Rookie' }); // debut date not stored: earliest supported season only
        const hist = s.seasons.filter(z => z.journeyId === se.journeyId && z.joined <= se.joined).map(z => s.stats.find(x => x.playerId === y.playerId && x.seasonId === z.id && x.scope === 'total')?.apps ?? 0);
        if (hist.reduce((a, b) => a + b, 0) >= 25)
            f.push({ playerId: y.playerId, kind: 'Breakthrough' });
    }
    // Honor-system facts use explicit confirmation; factual youth milestones retain their own source.
    for (const x of (l.facts ?? []).filter(x => x.seasonId === sid && x.confirmed && (x.kind !== 'Farewell' || g.transfers.some(t => t.seasonId === sid && t.playerId === x.playerId && t.direction === 'out'))))
        f.push({ playerId: x.playerId, kind: x.kind });
    for (const pid of seasonPlayers(s, sid)) {
        const j = playerProfile(s, pid, { journeyId: se.journeyId });
        const asOf = j.rows.filter(r => byId(s.seasons, r.seasonId).joined <= se.joined);
        const apps = asOf.reduce((a, r) => a + (r.stat?.apps ?? 0), 0);
        const full = s.seasons.filter(x => x.journeyId === se.journeyId && x.closed && x.left === null && x.joined === x.start && x.end <= se.end && s.spells.some(sp => sp.playerId === pid && sp.journeyId === se.journeyId && sp.start <= x.start && (sp.end === null || sp.end >= x.end))).length;
        const youthLegend = g.facts.some(x => x.playerId === pid && x.journeyId === se.journeyId && x.milestone === 'legend' && x.achieved);
        const youthCaptain = g.facts.some(x => x.playerId === pid && x.journeyId === se.journeyId && x.milestone === 'captain' && x.achieved);
        const current = byId(s.careers, se.careerId).seasonId === sid || l.cards.some(c => c.playerId === pid && c.seasonId === sid && (c.kind === 'Captain' || c.kind === 'Club Legend' || c.kind === 'Immortal'));
        const legend = full >= 4 && apps >= 150 || current && youthLegend || (l.facts ?? []).some(x => x.playerId === pid && x.kind === 'Club Legend' && x.confirmed && byId(s.seasons, x.seasonId).journeyId === se.journeyId && byId(s.seasons, x.seasonId).joined <= se.joined);
        if (legend)
            f.push({ playerId: pid, kind: 'Club Legend' });
        if (current && youthCaptain)
            f.push({ playerId: pid, kind: 'Captain' });
        if (legend && s.snapshots.some(x => x.playerId === pid && x.seasonId === sid && (x.ovr ?? 0) >= 90))
            f.push({ playerId: pid, kind: 'Immortal' });
    }
    if (se.closed && l.coverage.some(x => x.seasonId === sid && canonical(x.playerIds) === canonical(seasonPlayers(s, sid))) && seasonPlayers(s, sid).every(id => { const p = playerProfile(s, id, { seasonId: sid }); return p.totals.apps.complete && p.history.some(x => x.ovr !== null && x.position !== null); }))
        for (const x of bestXI(s, { seasonId: sid }))
            if (x.player)
                f.push({ playerId: x.player.playerId, kind: 'Team of the Season' });
    return f;
}
export function reconcileLegacy(s) { if (!s.legacy)
    s.legacy = fresh(); const l = s.legacy; for (const se of [...s.seasons].sort((a, b) => a.joined.localeCompare(b.joined))) {
    for (const f of cardFacts(s, se.id)) {
        const unique = ['Team of the Season', 'Record Breaker', 'Farewell'].includes(f.kind) ? `${se.id}:${f.playerId}:${f.kind}` : `${se.journeyId}:${f.playerId}:${f.kind}`;
        if (l.cards.some(x => x.id === unique))
            continue;
        const p = byId(s.players, f.playerId), snap = s.snapshots.filter(x => x.playerId === p.id && x.seasonId === se.id).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
        l.cards.push({ id: unique, seasonId: se.id, journeyId: se.journeyId, playerId: p.id, name: p.name, kind: f.kind, date: byId(s.careers, se.careerId).gameDate, ovr: snap?.ovr ?? null, position: snap?.position ?? null, portraitId: l.portraits.find(x => x.playerId === p.id)?.mediaId ?? null });
    }
} }
export function autoYearbook(s, seasonId) { const se = byId(s.seasons, seasonId); need(se.closed, 'Closed season required'); const l = s.legacy ?? (s.legacy = fresh()); if (!l.yearbooks.some(x => x.seasonId === seasonId))
    l.yearbooks.push({ seasonId, revision: s.revision + 1, data: buildYearbook(s, seasonId) }); }
export function validateLegacy(s) { if (!s.legacy)
    return; const l = s.legacy; need(l.version === 1, 'Legacy schema'); for (const a of [l.coverage, l.awards, l.cards, l.portraits, l.jerseys, l.yearbooks])
    need(Array.isArray(a), 'Legacy table'); const unique = (a) => need(a.length === new Set(a).size, 'Duplicate legacy entry'); unique(l.coverage.map(x => x.seasonId)); unique(l.awards.map(x => JSON.stringify([x.seasonId, x.kind]))); unique(l.cards.map(x => x.id)); unique(l.yearbooks.map(x => x.seasonId)); unique(l.portraits.map(x => x.playerId)); if (l.facts !== undefined) {
    need(Array.isArray(l.facts), 'Legacy facts table');
    unique(l.facts.map(x => canonical([x.seasonId, x.playerId, x.kind])));
    for (const x of l.facts) {
        const se = byId(s.seasons, x.seasonId);
        need(byId(s.players, x.playerId).careerId === se.careerId && FACT_KINDS.includes(x.kind) && typeof x.confirmed === 'boolean', 'Legacy fact scope');
        date(x.date);
    }
} for (const x of l.coverage) {
    const se = byId(s.seasons, x.seasonId);
    need(se.closed, 'Coverage before closure');
    unique(x.playerIds);
    for (const id of x.playerIds)
        need(byId(s.players, id).careerId === se.careerId, 'Coverage scope');
    if (x.teamMatches !== null)
        integer(x.teamMatches, 0, 999);
} for (const x of l.awards) {
    const se = byId(s.seasons, x.seasonId);
    need(se.closed && x.manual && MANUAL.includes(x.kind) && x.playerIds.length === 1 && byId(s.players, x.playerIds[0]).careerId === se.careerId, 'Award scope');
} for (const x of l.cards) {
    const se = byId(s.seasons, x.seasonId);
    need(se.journeyId === x.journeyId && byId(s.players, x.playerId).careerId === se.careerId, 'Card scope');
    label(x.name);
    date(x.date);
    if (x.ovr !== null)
        integer(x.ovr, 1, 99);
} for (const x of l.portraits) {
    byId(s.players, x.playerId);
    key(x.mediaId);
} for (const x of l.jerseys) {
    const j = byId(s.journeys, x.journeyId);
    integer(x.number, 1, 99);
    date(x.date);
    need(['retire', 'inherit', 'free'].includes(x.action) && (x.action === 'free' ? x.playerId === null : x.playerId !== null && byId(s.players, x.playerId).careerId === j.careerId), 'Jersey scope');
} for (const y of l.yearbooks) {
    need(byId(s.seasons, y.seasonId).closed && y.data.seasonId === y.seasonId, 'Yearbook scope');
    integer(y.revision, 1, s.revision);
} canonical(l); }
export function museum(s, journeyId) { const j = byId(s.journeys, journeyId), q = { journeyId }, ss = s.seasons.filter(x => x.journeyId === journeyId); const ids = new Set(ss.map(x => x.id)); return { club: j.club, trophies: trophies(s, q), records: recordRoom(s, q), academy: academyStats(s, q), cards: cardGallery(s).filter(x => x.journeyId === journeyId), hallOfFame: game(s).facts.filter(x => x.journeyId === journeyId && x.milestone === 'legend' && x.achieved).map(x => byId(s.players, x.playerId)), timeline: ss.map(x => ({ seasonId: x.id, start: x.joined, end: x.left ?? x.end, closed: x.closed, league: leagueStats(s, x.id), prestige: game(s).prestige.find(p => p.seasonId === x.id) ?? null })), yearbooks: legacy(s).yearbooks.filter(x => ids.has(x.seasonId)).map(x => ({ ...x, stale: canonical(x.data) !== canonical(buildYearbook(s, x.seasonId)) })), jerseys: legacy(s).jerseys.filter(x => x.journeyId === journeyId) }; }
export function yearbookHTML(s, sid) { const entry = legacy(s).yearbooks.find(x => x.seasonId === sid); need(entry, 'Capture yearbook first'); const b = entry.data; const esc = (x) => String(x ?? '—').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); const row = (a) => '<tr>' + a.map(x => '<td>' + esc(x) + '</td>').join('') + '</tr>'; const table = (head, rows) => '<table><thead>' + row(head) + '</thead><tbody>' + rows.map(row).join('') + '</tbody></table>'; return '<!doctype html><html lang="en"><meta charset="utf-8"><title>Career Legacy Yearbook</title><style>body{font:15px system-ui;color:#142e23;max-width:850px;margin:32px auto;padding:20px}h1{color:#24503b;border-bottom:3px solid #d4b477}table{border-collapse:collapse;width:100%;margin:16px 0}td{padding:8px;border-bottom:1px solid #ddd}thead{font-weight:bold}section{break-inside:avoid}small{color:#555}@media print{button{display:none}body{margin:0;padding:0}}</style><h1>' + esc(b.club) + ' · Season Yearbook</h1><p>' + esc(b.edition) + ' | ' + esc(b.start) + ' — ' + esc(b.end) + (b.partial ? ' · partial tenure' : '') + '</p><small>' + esc(b.coverage) + '</small><h2>League</h2>' + table(['Played', 'W', 'D', 'L', 'GF', 'GA', 'Pts', 'Rank'], [[b.league?.played, b.league?.wins, b.league?.draws, b.league?.losses, b.league?.gf, b.league?.ga, b.league?.points, b.league?.rank]]) + '<h2>Observed calendar</h2>' + table(['Played', 'W', 'D', 'L', 'GF', 'GA'], [[b.calendar.played, b.calendar.wins, b.calendar.draws, b.calendar.losses, b.calendar.gf, b.calendar.ga]]) + '<h2>Scorers · observed</h2>' + table(['Player', 'Goals', 'Known rows'], b.leaderboards.goals.map(x => [x.name, x.value, x.known + '/' + x.expected])) + '<h2>Playmakers · observed</h2>' + table(['Player', 'Assists'], b.leaderboards.assists.map(x => [x.name, x.value])) + '<h2>Awards</h2>' + table(['Award', 'Player'], b.awards.map(a => [a.kind, a.playerIds.map(id => byId(s.players, id).name).join(', ')])) + '<h2>Trophies</h2>' + table(['Competition'], b.trophies.map(t => [t.kind])) + '<h2>Best XI suggestion</h2>' + table(['Position', 'Player', 'OVR'], b.bestXI.map(x => [x.slot, x.player?.name, x.player?.ovr])) + '<h2>Transfers · reviewed sources</h2>' + table(['Player', 'Date', 'Direction', 'Fee', 'Currency'], b.transfers.observations.map(t => [t.name, t.date, t.direction, t.fee, t.currency])) + '</html>'; }
export function newsroom(s, journeyId) { const j = byId(s.journeys, journeyId); const q = { journeyId }; return [...trophies(s, q).map(t => ({ id: `trophy:${t.seasonId}:${t.kind}`, date: byId(s.seasons, t.seasonId).end, title: `${j.club} · ${t.kind}`, type: 'trophy' })), ...transferStats(s, q).observations.map(t => ({ id: `transfer:${t.seasonId}:${t.id}`, date: t.date, title: `${t.name} · ${t.direction === 'in' ? 'Arrival' : 'Departure'}`, type: 'transfer' }))].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)); }
