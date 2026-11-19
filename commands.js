import { performLegacy, reconcileLegacy, autoYearbook } from './legacy.js';
import { productionCatalogue } from './catalogue.js';
import { performScan } from './scan.js';
import { performEvent, reconcileEvents, assertEventQueue } from './events.js';
import { performGame, reconcileGame, game } from './game.js';
import { byId, need, date, month, shiftMonth, monthDiff, nextDay, prevDay, key, canonical, validate, slotCount } from './model.js';
export function previewAdvance(s, id, to) { const c = byId(s.careers, id); const se = byId(s.seasons, c.seasonId); date(to); need(to >= c.gameDate && to <= nextDay(se.end), 'Date outside current season or backwards'); const due = []; for (let m = c.nextMonth; m < to.slice(0, 7); m = shiftMonth(m, 1))
    due.push(m); return { from: c.gameDate, to, due, seasonEnd: to > se.end }; }
function newSeason(i, cid, jid, joined) { return { ...structuredClone(i), careerId: cid, journeyId: jid, joined, left: null, closed: false }; }
function live(s, id) { const c = byId(s.careers, id); need(c.status === 'Active', 'Career must be Active'); return c; }
function unique(xs, id) { key(id); need(!xs.some(x => x.id === id), 'ID already exists'); }
function ownership(s, c, pid) { const p = byId(s.players, pid); need(p.careerId === c.id, 'Cross-career player'); return p; }
function upsert(xs, x, match) { const old = xs.find(match); need(!xs.some(r => r.id === x.id && r !== old), 'Record ID collision'); if (old) {
    need(old.id === x.id, 'Use existing stable record ID for corrections');
    Object.assign(old, structuredClone(x));
}
else
    xs.push(structuredClone(x)); }
function setupOnly(s, c) { const configured = game(s).rules.some(x => x.seasonId === c.seasonId); need(!configured || c.gameDate === byId(s.seasons, c.seasonId).joined, 'Use confirmed transfer command after setup'); }
function noDue(c) { need(c.nextMonth >= c.gameDate.slice(0, 7), 'Close due month first'); }
function perform(s, q) {
    switch (q.type) {
        case 'create': {
            unique(s.careers, q.careerId);
            unique(s.journeys, q.journeyId);
            unique(s.seasons, q.season.id);
            const se = newSeason(q.season, q.careerId, q.journeyId, q.gameDate);
            s.careers.push({ id: q.careerId, edition: q.edition, name: q.name, gameDate: q.gameDate, status: 'Active', journeyId: q.journeyId, seasonId: se.id, mode: q.mode, nextMonth: q.gameDate.slice(0, 7), managerXP: 0, catalogVersion: null });
            s.journeys.push({ id: q.journeyId, careerId: q.careerId, club: q.club, start: q.gameDate, end: null, prestige: q.prestige, academyXP: q.academyXP });
            s.seasons.push(se);
            s.profile.activeCareerId = q.careerId;
            if (q.catalogueSeed !== undefined)
                performEvent(s, { type: 'pinCatalogue', careerId: q.careerId, catalogue: productionCatalogue(), seed: q.catalogueSeed });
            break;
        }
        case 'select':
            byId(s.careers, q.careerId);
            s.profile.activeCareerId = q.careerId;
            break;
        case 'status':
            byId(s.careers, q.careerId).status = q.status;
            break;
        case 'advance': {
            const c = live(s, q.careerId);
            assertEventQueue(s, c.id);
            const p = previewAdvance(s, c.id, q.to);
            need(!byId(s.seasons, c.seasonId).closed, 'Season closed');
            need(p.due.length <= 1, 'Close months in order; cannot skip a pending month');
            c.gameDate = q.to;
            break;
        }
        case 'closeMonth': {
            const c = live(s, q.careerId);
            month(q.month);
            need(q.confirmed === true, 'Confirmation required');
            const id = `${c.id}:${q.month}`;
            if (s.closures.some(x => x.id === id))
                break;
            need(q.month === c.nextMonth && q.month < c.gameDate.slice(0, 7), 'Only expected completed month can close');
            const se = byId(s.seasons, c.seasonId);
            need(!se.closed, 'Season closed');
            const ordinal = monthDiff(se.start.slice(0, 7), q.month) + 1;
            const slots = slotCount(c.mode, ordinal);
            if (q.source === 'scan') {
                const im = byId(s.imports, q.importId ?? '');
                need(im.careerId === c.id && im.seasonId === se.id, 'Wrong scan scope');
                need(im.matchIds.every(id => byId(s.matches, id).date.slice(0, 7) === q.month), 'Wrong scan month');
                need(im.matchIds.length > 0, 'Empty month: use manual confirmation');
            }
            else
                need(q.source === 'manual', 'Invalid source');
            s.closures.push({ id, careerId: c.id, seasonId: se.id, month: q.month, ordinal, mode: c.mode, source: q.source, slots });
            for (let i = 0; i < slots; i++)
                s.entitlements.push({ id: `${id}:${i}`, closureId: id, careerId: c.id, slot: i, status: 'pending' });
            c.nextMonth = shiftMonth(q.month, 1);
            break;
        }
        case 'switchClub': {
            const c = live(s, q.careerId);
            assertEventQueue(s, c.id);
            noDue(c);
            const prior = byId(s.seasons, c.seasonId), j = byId(s.journeys, c.journeyId);
            need(c.gameDate > prior.joined && c.gameDate > j.start, 'Cannot switch on join date');
            need(c.gameDate <= nextDay(prior.end), 'Out of season');
            unique(s.journeys, q.journeyId);
            unique(s.seasons, q.season.id);
            const last = prevDay(c.gameDate);
            if (last < prior.end)
                prior.left = last;
            prior.closed = true;
            j.end = last;
            for (const sp of s.spells.filter(x => x.journeyId === j.id && x.end === null)) {
                need(sp.start <= last, 'Same-day membership conflict');
                sp.end = last;
            }
            s.journeys.push({ id: q.journeyId, careerId: c.id, club: q.club, start: c.gameDate, end: null, prestige: q.prestige, academyXP: q.academyXP });
            s.seasons.push(newSeason(q.season, c.id, q.journeyId, c.gameDate));
            c.journeyId = q.journeyId;
            c.seasonId = q.season.id;
            break;
        }
        case 'closeSeason': {
            assertEventQueue(s, q.careerId);
            const c = live(s, q.careerId), se = byId(s.seasons, c.seasonId);
            need(q.confirmed === true, 'Confirmation required');
            if (se.closed)
                break;
            need(c.gameDate > se.end, 'Season still open');
            noDue(c);
            se.closed = true;
            break;
        }
        case 'seasonReview': {
            const c = live(s, q.careerId), se = byId(s.seasons, q.seasonId);
            need(q.confirmed && c.seasonId === se.id && se.closed && se.joined === se.start && se.left === null, 'Confirm full closed current season');
            need(!game(s).prestige.some(x => x.seasonId === se.id), 'Season review already finalized');
            need(q.facts.promotion === q.sports.includes('promotion') && q.facts.league === q.sports.includes('league') && q.facts.domesticCup === q.sports.includes('domesticCup') && q.facts.europa === q.sports.includes('europa'), 'Sport and prestige facts conflict');
            performGame(s, { type: 'seasonRewards', careerId: c.id, seasonId: se.id, sports: q.sports, parts: q.parts });
            performGame(s, { type: 'prestigeReview', careerId: c.id, seasonId: se.id, facts: q.facts });
            if (c.catalogVersion)
                performEvent(s, { type: 'settleGoals', careerId: c.id, seasonId: se.id });
            break;
        }
        case 'nextSeason': {
            assertEventQueue(s, q.careerId);
            const c = live(s, q.careerId), old = byId(s.seasons, c.seasonId);
            need(old.closed && c.gameDate === nextDay(old.end) && q.season.start === c.gameDate, 'Close prior season and start on next day');
            unique(s.seasons, q.season.id);
            s.seasons.push(newSeason(q.season, c.id, c.journeyId, c.gameDate));
            c.seasonId = q.season.id;
            break;
        }
        case 'addPlayer': {
            const c = live(s, q.careerId);
            unique(s.players, q.playerId);
            s.players.push({ id: q.playerId, careerId: c.id, name: q.name, nationality: q.nationality });
            if (q.spellId) {
                setupOnly(s, c);
                unique(s.spells, q.spellId);
                s.spells.push({ id: q.spellId, playerId: q.playerId, journeyId: c.journeyId, start: c.gameDate, end: null });
            }
            break;
        }
        case 'joinPlayer': {
            const c = live(s, q.careerId);
            setupOnly(s, c);
            ownership(s, c, q.playerId);
            unique(s.spells, q.spellId);
            need(!s.spells.some(x => x.playerId === q.playerId && x.end === null), 'Player already at club');
            s.spells.push({ id: q.spellId, playerId: q.playerId, journeyId: c.journeyId, start: c.gameDate, end: null });
            break;
        }
        case 'leavePlayer': {
            const c = live(s, q.careerId);
            setupOnly(s, c);
            ownership(s, c, q.playerId);
            const sp = s.spells.find(x => x.playerId === q.playerId && x.journeyId === c.journeyId && x.end === null);
            need(sp && c.gameDate > sp.start, 'No active prior-day membership');
            sp.end = prevDay(c.gameDate);
            break;
        }
        case 'snapshot': {
            const c = live(s, q.careerId), r = q.record;
            ownership(s, c, r.playerId);
            need(byId(s.seasons, r.seasonId).careerId === c.id && r.date <= c.gameDate, 'Snapshot scope/date');
            upsert(s.snapshots, r, x => x.playerId === r.playerId && x.seasonId === r.seasonId && x.date === r.date);
            break;
        }
        case 'stats': {
            const c = live(s, q.careerId), r = q.record;
            ownership(s, c, r.playerId);
            need(byId(s.seasons, r.seasonId).careerId === c.id, 'Stats scope');
            upsert(s.stats, r, x => x.playerId === r.playerId && x.seasonId === r.seasonId && x.scope === r.scope);
            break;
        }
        case 'importCalendar': {
            const c = live(s, q.careerId), se = byId(s.seasons, q.seasonId);
            need(q.confirmed === true && se.careerId === c.id, 'Import not confirmed / wrong scope');
            if (s.imports.some(x => x.careerId === c.id && x.seasonId === se.id && x.sourceHash === q.sourceHash)) {
                break;
            }
            unique(s.imports, q.importId);
            need(new Set(q.matches.map(m => m.id)).size === q.matches.length, 'Duplicate match ID in batch');
            for (const m of q.matches) {
                need(m.careerId === c.id && m.seasonId === se.id && m.date.slice(0, 7) < c.gameDate.slice(0, 7), 'Not completed historical month');
                const old = s.matches.find(x => x.id === m.id);
                if (old)
                    need(old.careerId === c.id && old.seasonId === se.id, 'Match identity conflict');
                const candidates = s.matches.filter(x => x.id !== m.id && x.careerId === c.id && x.date === m.date);
                need(candidates.length === 0, 'Possible duplicate match; resolve stable ID in review');
                upsert(s.matches, { ...m, source: q.sourceHash }, x => x.id === m.id);
            }
            s.imports.push({ id: q.importId, careerId: c.id, seasonId: se.id, sourceHash: q.sourceHash, kind: 'calendar', matchIds: q.matches.map(x => x.id) });
            break;
        }
        case 'commitScan': {
            if (q.advanceTo !== undefined) {
                const c = live(s, q.careerId);
                need(q.confirmed === true && q.seasonId === c.seasonId && q.closeMonth !== null && q.documents.some(d => d.kind === 'calendar' && d.month === q.closeMonth), 'Explicit current monthly review required for date advance');
                date(q.advanceTo);
                need(q.advanceTo >= c.gameDate, 'Date cannot move backwards');
                if (q.advanceTo > c.gameDate) {
                    need(c.nextMonth === q.closeMonth && q.closeMonth < q.advanceTo.slice(0, 7), 'Advance must close the next due month');
                    perform(s, { type: 'advance', careerId: c.id, to: q.advanceTo });
                }
            }
            performScan(s, q, importId => perform(s, { type: 'closeMonth', careerId: q.careerId, month: q.closeMonth, source: 'scan', confirmed: true, importId }));
            break;
        }
        case 'pinCatalogue':
        case 'drawEvent':
        case 'openPack':
        case 'resolveCard':
        case 'completeCard':
        case 'advanceStory':
        case 'setGoals':
        case 'addLegacyGoal':
        case 'confirmGoal':
        case 'settleGoals':
        case 'confirmAchievement':
            performEvent(s, q);
            break;
        case 'legacyFact':
        case 'confirmAwardCoverage':
        case 'manualAward':
        case 'captureYearbook':
        case 'jerseyLegacy':
            performLegacy(s, q);
            break;
        default: performGame(s, q);
    }
}
export function apply(state, req) { validate(state); key(req.id); const sig = canonical(req.command); const old = state.audit.find(x => x.id === req.id); if (old) {
    need(old.signature === sig, 'Command ID reused with different payload');
    return { state, duplicate: true };
} need(req.expectedRevision === state.revision, 'Revision conflict'); const s = structuredClone(state); perform(s, req.command); reconcileGame(s); for (let pass = 0;; pass++) {
    const before = canonical([s.game ?? null, s.events ?? null]);
    reconcileEvents(s);
    reconcileGame(s);
    if (before === canonical([s.game ?? null, s.events ?? null]))
        break;
    need(pass < 20, 'Reward reconciliation did not converge');
} reconcileLegacy(s); if (req.command.type === 'seasonReview')
    performLegacy(s, { type: 'captureYearbook', careerId: req.command.careerId, seasonId: req.command.seasonId, confirmed: true }); if (req.command.type === 'closeSeason' || req.command.type === 'switchClub') {
    const before = byId(state.careers, req.command.careerId);
    autoYearbook(s, before.seasonId);
} s.revision++; s.audit.push({ id: req.id, type: req.command.type, signature: sig, revision: s.revision }); validate(s); return { state: s, duplicate: false }; }
// Total rows are authoritative; only explicit non-overlapping scopes may be summed by future coverage-aware engine.
export function playerTotals(s, careerId) { byId(s.careers, careerId); return s.stats.filter(x => x.scope === 'total' && byId(s.players, x.playerId).careerId === careerId); }
export function calendarSummary(s, careerId, monthKey) { byId(s.careers, careerId); month(monthKey); const ms = s.matches.filter(x => x.careerId === careerId && x.date.slice(0, 7) === monthKey); return { played: ms.length, wins: ms.filter(x => x.gf > x.ga).length, draws: ms.filter(x => x.gf === x.ga).length, losses: ms.filter(x => x.gf < x.ga).length, gf: ms.reduce((a, x) => a + x.gf, 0), ga: ms.reduce((a, x) => a + x.ga, 0), coverage: 'unverified' }; }
