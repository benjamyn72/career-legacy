import { includesCountry, sameCountry } from './identity.js';
import { eventModifiers } from './events.js';
import { byId, need, integer, canonical, date, key, prevDay } from './model.js';
import { validateRule, blankSkills, effective, identity, matchDecision, allowedScout } from './rules.js';
import { ACADEMY_XP, MANAGER_YOUTH, ACADEMY_THRESHOLDS, skillPoints, academyLevel, sportXP, prestigeNext, stadiumUnlocked } from './progression.js';
import { forcedDecision, signingCheck } from './transfer.js';
const fresh = () => ({ version: 1, rules: [], skills: [], bases: [], xp: [], youth: [], facts: [], protectionLocks: [], protections: [], windows: [], transfers: [], seasonStart: [], prestige: [], stadiums: [], vetoes: [], jokers: [], academyActions: [] });
export function game(s) { return s.game ?? fresh(); }
function init(s) { const g = s.game ?? (s.game = fresh()); for (const c of s.careers) {
    if (!g.bases.some(b => b.kind === 'manager' && b.scope === c.id))
        g.bases.push({ kind: 'manager', scope: c.id, xp: c.managerXP });
    if (!g.skills.some(x => x.careerId === c.id))
        g.skills.push({ careerId: c.id, levels: blankSkills() });
} for (const j of s.journeys)
    if (!g.bases.some(b => b.kind === 'academy' && b.scope === j.id))
        g.bases.push({ kind: 'academy', scope: j.id, xp: j.academyXP }); for (const se of s.seasons)
    if (!g.seasonStart.some(x => x.seasonId === se.id)) {
        const j = byId(s.journeys, se.journeyId);
        g.seasonStart.push({ seasonId: se.id, prestige: j.prestige });
    } return g; }
export const currentSkills = (s, cid) => game(s).skills.find(x => x.careerId === cid)?.levels ?? blankSkills();
export function currentRule(s, sid) { const r = game(s).rules.find(x => x.seasonId === sid); need(r, 'Configure Rulebook first'); return r.rule; }
export function award(g, id, kind, scope, amount, active = true) { integer(amount); const old = g.xp.find(x => x.id === id); if (old) {
    need(old.kind === kind && old.scope === scope, 'Reward scope');
    old.active = active;
    old.amount = amount;
}
else
    g.xp.push({ id, kind, scope, amount, active }); }
const sum = (g, kind, scope) => g.bases.find(x => x.kind === kind && x.scope === scope).xp + g.xp.filter(x => x.kind === kind && x.scope === scope && x.active).reduce((a, b) => a + b.amount, 0);
export function reconcileGame(s) {
    const g = init(s);
    for (const y of g.youth) {
        const j = byId(s.journeys, y.journeyId);
        const max = Math.max(y.baselineOVR ?? 0, ...s.snapshots.filter(x => x.playerId === y.playerId && byId(s.seasons, x.seasonId).journeyId === j.id && x.date > y.enrolled && x.ovr !== null).map(x => x.ovr));
        for (const n of [70, 80, 90]) {
            const m = `ovr${n}`;
            const observed = y.baselineOVR !== null && y.baselineOVR < n && max >= n;
            const f = g.facts.find(x => x.playerId === y.playerId && x.journeyId === j.id && x.milestone === m);
            if (observed || f || g.xp.some(x => x.id === `a:${j.id}:${y.playerId}:${m}`)) {
                const active = f ? f.achieved : observed;
                const percent = f?.multiplier ?? 0;
                award(g, `a:${j.id}:${y.playerId}:${m}`, 'academy', j.id, Math.round(ACADEMY_XP[m] * (100 + percent) / 100), active);
                if (MANAGER_YOUTH[m])
                    award(g, `m:${j.careerId}:${y.playerId}:${m}`, 'manager', j.careerId, MANAGER_YOUTH[m], active);
            }
        }
        for (const f of g.facts.filter(x => x.playerId === y.playerId && x.journeyId === j.id && !x.milestone.startsWith('ovr'))) {
            const m = f.milestone;
            award(g, `a:${j.id}:${y.playerId}:${m}`, 'academy', j.id, Math.round(ACADEMY_XP[m] * (100 + f.multiplier) / 100), f.achieved);
            if (MANAGER_YOUTH[m])
                award(g, `m:${j.careerId}:${y.playerId}:${m}`, 'manager', j.careerId, MANAGER_YOUTH[m], f.achieved);
        }
    }
    for (const j of s.journeys) {
        j.academyXP = sum(g, 'academy', j.id);
        const start = g.bases.find(x => x.kind === 'academy' && x.scope === j.id).xp;
        for (let n = academyLevel(start) + 1; n <= 5; n++) {
            const id = `academy-level:${j.id}:${n}`;
            if (j.academyXP >= ACADEMY_THRESHOLDS[n - 1] || g.xp.some(x => x.id === id))
                award(g, id, 'manager', j.careerId, 150, j.academyXP >= ACADEMY_THRESHOLDS[n - 1]);
        }
    }
    for (const c of s.careers) {
        c.managerXP = sum(g, 'manager', c.id);
        need(Object.values(currentSkills(s, c.id)).reduce((a, b) => a + b, 0) <= skillPoints(c.managerXP), 'Correction would invalidate spent skill points; review required');
    }
}
export function windowView(s, cid, wid) { const g = game(s), c = byId(s.careers, cid), w = g.windows.find(x => x.journeyId === c.journeyId && x.windowId === wid); need(w && c.gameDate >= w.start && c.gameDate <= w.end, 'No active window'); const r = currentRule(s, c.seasonId); const rows = g.transfers.filter(x => x.journeyId === c.journeyId && x.windowId === wid), departures = rows.filter(x => x.direction === 'out' && x.type !== 'voluntary'), used = rows.filter(x => x.direction === 'in').length; const skills = currentSkills(s, cid), mod = effective(skills, eventModifiers(s, cid)), skill = effective(skills).adultSlots; const base = r[w.kind], cardBonus = mod.adultSlots - skill, ordinaryUsed = rows.filter(x => x.direction === 'in' && !x.skillSlot).length, ordinary = Math.max(0, Math.max(0, base + cardBonus) + departures.length - ordinaryUsed); const annualUsed = g.transfers.filter(x => x.seasonId === c.seasonId && x.skillSlot).length; const extra = Math.max(0, skill - annualUsed); return { w, r, departures, used, ordinary, slots: ordinary + extra, mod }; }
function activeMember(s, cid, pid) { const c = byId(s.careers, cid); need(byId(s.players, pid).careerId === cid, 'Cross-career player'); const sp = s.spells.find(x => x.playerId === pid && x.journeyId === c.journeyId && x.end === null); need(sp, 'Not at current club'); return sp; }
export function offerView(s, cid, wid, x) { const c = byId(s.careers, cid), g = game(s), v = windowView(s, cid, wid); activeMember(s, cid, x.playerId); const offerPlayerId = x.playerId; const protectedPlayer = g.vetoes.some(x => x.seasonId === c.seasonId && x.windowId === wid && x.playerId === offerPlayerId) || g.protections.some(p => p.playerId === x.playerId && (p.permanent ? p.scope === c.journeyId : p.scope === c.seasonId)); const offer = { ...x, lastThreeDays: (+new Date(v.w.end) - +new Date(c.gameDate)) / 86400000 < 3 }; return forcedDecision(offer, byId(s.journeys, c.journeyId).prestige, v.r, v.mod.pressureReduction, protectedPlayer, v.departures, v.w.kind); }
export function performGame(s, q) {
    const c = byId(s.careers, q.careerId);
    need(c.status === 'Active', 'Career must be Active');
    const g = init(s), se = byId(s.seasons, c.seasonId), j = byId(s.journeys, c.journeyId);
    const sk = currentSkills(s, c.id), eff = effective(sk, eventModifiers(s, c.id));
    const owned = (pid) => need(byId(s.players, pid).careerId === c.id, 'Cross-career player');
    const open = () => need(!se.closed, 'Season closed');
    switch (q.type) {
        case 'configureRules': {
            open();
            validateRule(q.rule);
            need(!g.rules.some(x => x.seasonId === se.id), 'Rulebook locked');
            const old = g.rules.filter(x => byId(s.seasons, x.seasonId).journeyId === j.id).at(-1);
            need(!old || old.rule.primary === q.rule.primary, 'Primary DNA locked');
            if (old?.rule.dna)
                need(q.rule.dna && q.rule.dna.homeCountryId === old.rule.dna.homeCountryId && q.rule.dna.regionId === old.rule.dna.regionId && q.rule.dna.regionCountryIds.slice().sort().join(',') === old.rule.dna.regionCountryIds.slice().sort().join(','), 'Geographical DNA locked');
            need(c.gameDate === se.joined, 'Rulebook setup only at season start');
            g.rules.push({ seasonId: se.id, rule: structuredClone(q.rule) });
            break;
        }
        case 'upgradeSkill': {
            need(Object.hasOwn(sk, q.branch) && sk[q.branch] < 5, 'Skill max/unknown');
            need(Object.values(sk).reduce((a, b) => a + b, 0) < skillPoints(c.managerXP), 'No skill point');
            sk[q.branch]++;
            break;
        }
        case 'enrollYouth': {
            open();
            owned(q.playerId);
            if (q.baselineOVR !== null)
                integer(q.baselineOVR, 1, 99);
            need(!g.youth.some(x => x.playerId === q.playerId), 'Youth origin already recorded');
            g.youth.push({ playerId: q.playerId, journeyId: j.id, baselineOVR: q.baselineOVR, enrolled: c.gameDate, multiplier: eff.academyXP });
            break;
        }
        case 'youthMilestone': {
            owned(q.playerId);
            need(Object.hasOwn(ACADEMY_XP, q.milestone) && typeof q.achieved === 'boolean', 'Milestone');
            const y = g.youth.find(x => x.playerId === q.playerId && x.journeyId === j.id);
            need(y, 'Not homegrown here');
            const old = g.facts.find(x => x.playerId === q.playerId && x.journeyId === j.id && x.milestone === q.milestone);
            if (old)
                old.achieved = q.achieved;
            else
                g.facts.push({ playerId: q.playerId, journeyId: j.id, milestone: q.milestone, achieved: q.achieved, multiplier: eff.academyXP });
            break;
        }
        case 'seasonRewards': {
            const ss = byId(s.seasons, q.seasonId);
            need(ss.id === se.id && ss.closed && ss.left === null && ss.joined === ss.start, 'Full closed season required');
            const start = g.seasonStart.find(x => x.seasonId === ss.id);
            award(g, `season:${ss.id}`, 'manager', c.id, 200);
            need(new Set(q.sports).size === q.sports.length && q.sports.every(x => ['promotion', 'league', 'domesticCup', 'supercup', 'qualification', 'conference', 'europa', 'champions'].includes(x)), 'Sport list');
            for (const k of ['promotion', 'league', 'domesticCup', 'supercup', 'qualification', 'conference', 'europa', 'champions'])
                if (q.sports.includes(k) || g.xp.some(x => x.id === `sport:${ss.id}:${k}`))
                    award(g, `sport:${ss.id}:${k}`, 'manager', c.id, sportXP(k, start.prestige), q.sports.includes(k));
            if (q.parts !== null) {
                const result = identity(q.parts);
                need(result.final && result.xp !== null, 'Incomplete identity');
                const old = g.xp.find(x => x.id === `identity:${ss.id}`);
                const amount = Math.round(result.xp * (100 + eff.identityXP) / 100);
                need(!old || old.amount === amount, 'Identity already credited; correction workflow pending');
                award(g, `identity:${ss.id}`, 'manager', c.id, amount);
            }
            break;
        }
        case 'prestigeReview': {
            const ss = byId(s.seasons, q.seasonId);
            need(ss.id === se.id && ss.closed && ss.left === null && ss.joined === ss.start, 'Current full closed season required');
            need(!g.prestige.some(x => x.seasonId === ss.id), 'Prestige already reviewed');
            const before = j.prestige, after = prestigeNext(before, q.facts);
            g.prestige.push({ seasonId: ss.id, before, after });
            j.prestige = after;
            if (after > before) {
                const id = `prestige:${j.id}:${after}`;
                const initial = g.seasonStart.find(x => byId(s.seasons, x.seasonId).journeyId === j.id).prestige;
                if (after > initial && !g.xp.some(x => x.id === id))
                    award(g, id, 'manager', c.id, 250);
            }
            const level = stadiumUnlocked(Math.max(before, after));
            const st = g.stadiums.find(x => x.journeyId === j.id);
            if (st)
                st.level = Math.max(st.level, level);
            else
                g.stadiums.push({ journeyId: j.id, level });
            break;
        }
        case 'protect': {
            open();
            need(c.gameDate === se.joined, 'Select at season start');
            need(!g.protectionLocks.includes(se.id), 'Already selected');
            g.protectionLocks.push(se.id);
            need(new Set(q.playerIds).size === q.playerIds.length && q.playerIds.length <= eff.protection, 'Protection cap');
            for (const p of q.playerIds) {
                activeMember(s, c.id, p);
                g.protections.push({ scope: se.id, playerId: p, permanent: false });
            }
            break;
        }
        case 'registerWindow': {
            open();
            const w = byId(se.windows, q.windowId);
            need(['summer', 'winter'].includes(q.kind), 'Window kind');
            const old = g.windows.find(x => x.journeyId === j.id && x.windowId === w.id);
            if (old)
                need(old.start === w.start && old.end === w.end && old.kind === q.kind, 'Window identity conflict');
            else
                g.windows.push({ journeyId: j.id, windowId: w.id, start: w.start, end: w.end, kind: q.kind });
            break;
        }
        case 'completeExit': {
            open();
            key(q.id);
            need(!g.transfers.some(x => x.id === q.id), 'Transfer ID exists');
            const v = windowView(s, c.id, q.windowId);
            const sp = activeMember(s, c.id, q.playerId);
            if (q.fee !== null)
                integer(q.fee);
            need(['voluntary', 'pressure', 'eaForced'].includes(q.exitType) && q.position.trim(), 'Exit');
            if (q.exitType === 'pressure') {
                need(q.offer && q.offer.playerId === q.playerId && q.offer.position === q.position && q.negotiationSucceeded === true, 'Offer and successful negotiation required');
                need(offerView(s, c.id, q.windowId, q.offer).required && q.fee !== null && q.fee >= q.offer.value, 'Pressure exit not mandatory / fee too low');
            }
            need(c.gameDate > sp.start, 'Same-day membership review required');
            sp.end = prevDay(c.gameDate);
            g.transfers.push({ id: q.id, careerId: c.id, journeyId: j.id, seasonId: se.id, windowId: v.w.windowId, playerId: q.playerId, position: q.position, direction: 'out', type: q.exitType, date: c.gameDate, fee: q.fee, ...(q.currency !== undefined ? { currency: q.currency } : {}), skillSlot: false, loan: false });
            break;
        }
        case 'completeSigning': {
            open();
            key(q.id);
            key(q.spellId);
            owned(q.playerId);
            const v = windowView(s, c.id, q.windowId);
            need(!g.transfers.some(x => x.id === q.id) && !s.spells.some(x => x.id === q.spellId || x.playerId === q.playerId && x.end === null), 'Duplicate signing');
            const previous = g.transfers.filter(x => x.journeyId === j.id && x.seasonId === se.id && x.direction === 'in');
            const outsideUsed = previous.filter(x => { const n = byId(s.players, x.playerId).nationality; return n !== null && !includesCountry(v.r.region, n); }).length;
            const nationality = byId(s.players, q.playerId).nationality;
            need(nationality === q.signing.country || nationality !== null && q.signing.country !== null && sameCountry(nationality, q.signing.country), 'Nationality mismatch');
            need(signingCheck(v.r, { ...q.signing, outsideUsed, loansUsed: previous.filter(x => x.loan).length }, v.slots, q.eaAllows).allowed, 'Signing disallowed or incomplete');
            need(q.position.trim(), 'Position');
            s.spells.push({ id: q.spellId, playerId: q.playerId, journeyId: j.id, start: c.gameDate, end: null });
            g.transfers.push({ id: q.id, careerId: c.id, journeyId: j.id, seasonId: se.id, windowId: v.w.windowId, playerId: q.playerId, position: q.position, direction: 'in', type: 'voluntary', date: c.gameDate, fee: q.signing.fee, ...(q.currency !== undefined ? { currency: q.currency } : {}), skillSlot: v.ordinary === 0, loan: q.signing.loan });
            break;
        }
        case 'useTransferVeto': {
            open();
            need(eff.transferVeto && !g.vetoes.some(x => x.seasonId === se.id), 'No veto remaining');
            need(offerView(s, c.id, q.windowId, q.offer).required, 'No mandatory pressure sale');
            g.vetoes.push({ seasonId: se.id, windowId: q.windowId, playerId: q.offer.playerId });
            break;
        }
        case 'useJoker': {
            open();
            key(q.matchId);
            need(!g.jokers.some(x => x.seasonId === se.id && x.matchId === q.matchId), 'Joker already used');
            need(g.jokers.filter(x => x.seasonId === se.id).length < eff.jokers, 'No joker remaining');
            need(matchDecision({ ...q, joker: true }).jokerUsed, 'Joker forbidden or unnecessary');
            g.jokers.push({ seasonId: se.id, matchId: q.matchId });
            break;
        }
        case 'academyAction': {
            open();
            key(q.id);
            owned(q.playerId);
            need(q.eaAllows === true && !g.academyActions.some(x => x.id === q.id), 'Academy action unavailable');
            const r = currentRule(s, se.id), rows = g.academyActions.filter(x => x.seasonId === se.id && x.kind === q.kind);
            need(!g.academyActions.some(x => x.playerId === q.playerId && x.kind === q.kind && byId(s.seasons, x.seasonId).journeyId === j.id), 'Academy action duplicate');
            if (q.kind === 'sign') {
                need(q.country !== null && byId(s.players, q.playerId).nationality !== null && sameCountry(q.country, byId(s.players, q.playerId).nationality) && allowedScout(r, q.country, true), 'Academy geography');
                need(rows.length < Math.max(0, r.academy + eff.academySlots), 'Academy limit');
                if (r.reportLimit !== null)
                    need(q.reportId !== null && rows.filter(x => x.reportId === q.reportId).length < r.reportLimit, 'Report limit');
            }
            else {
                need(q.kind === 'promote' && g.youth.some(x => x.playerId === q.playerId && x.journeyId === j.id), 'Not academy player');
                if (r.promotion !== null)
                    need(rows.length < Math.max(0, r.promotion + eff.promotions), 'Promotion limit');
                need(q.spellId, 'Promotion membership ID required');
                key(q.spellId);
                need(!s.spells.some(x => x.id === q.spellId || x.playerId === q.playerId && x.end === null), 'Player already has membership');
                s.spells.push({ id: q.spellId, playerId: q.playerId, journeyId: j.id, start: c.gameDate, end: null });
            }
            g.academyActions.push({ id: q.id, seasonId: se.id, playerId: q.playerId, kind: q.kind, reportId: q.reportId, country: q.country });
            break;
        }
        default: throw Error('Unknown game command');
    }
    reconcileGame(s);
}
export function validateGame(s) { if (s.game === undefined)
    return; const g = s.game; need(g.version === 1, 'Game schema'); for (const k of Object.keys(fresh()))
    if (k !== 'version')
        need(Array.isArray(g[k]), 'Game table missing'); const unique = (xs) => need(new Set(xs).size === xs.length, 'Duplicate game key'); unique(g.rules.map(x => x.seasonId)); unique(g.skills.map(x => x.careerId)); unique(g.bases.map(x => `${x.kind}:${x.scope}`)); unique(g.xp.map(x => x.id)); unique(g.youth.map(x => x.playerId)); unique(g.facts.map(x => `${x.playerId}:${x.journeyId}:${x.milestone}`)); unique(g.transfers.map(x => x.id)); unique(g.prestige.map(x => x.seasonId)); unique(g.seasonStart.map(x => x.seasonId)); unique(g.stadiums.map(x => x.journeyId)); unique(g.windows.map(x => `${x.journeyId}:${x.windowId}`)); unique(g.protectionLocks); for (const id of g.protectionLocks)
    byId(s.seasons, id); unique(g.protections.map(x => `${x.scope}:${x.playerId}`)); unique(g.vetoes.map(x => x.seasonId)); unique(g.jokers.map(x => `${x.seasonId}:${x.matchId}`)); unique(g.academyActions.map(x => x.id)); for (const x of g.rules) {
    byId(s.seasons, x.seasonId);
    validateRule(x.rule);
} for (const x of g.skills) {
    byId(s.careers, x.careerId);
    need(Object.keys(x.levels).sort().join(',') === 'academy,leader,tactical,transfer', 'Skill schema');
    for (const v of Object.values(x.levels))
        integer(v, 0, 5);
} for (const x of [...g.bases, ...g.xp]) {
    need(x.kind === 'academy' || x.kind === 'manager', 'XP kind');
    x.kind === 'academy' ? byId(s.journeys, x.scope) : byId(s.careers, x.scope);
    integer('amount' in x ? x.amount : x.xp);
    if ('active' in x)
        need(typeof x.active === 'boolean', 'Reward flag');
} for (const c of s.careers) {
    need(g.skills.some(x => x.careerId === c.id) && g.bases.some(x => x.kind === 'manager' && x.scope === c.id), 'Missing manager base');
    need(c.managerXP === sum(g, 'manager', c.id) && Object.values(currentSkills(s, c.id)).reduce((a, b) => a + b, 0) <= skillPoints(c.managerXP), 'Manager ledger mismatch');
} for (const j of s.journeys)
    need(g.bases.some(x => x.kind === 'academy' && x.scope === j.id) && j.academyXP === sum(g, 'academy', j.id), 'Academy ledger mismatch'); for (const x of g.youth) {
    need(byId(s.players, x.playerId).careerId === byId(s.journeys, x.journeyId).careerId, 'Youth ownership');
    date(x.enrolled);
    if (x.baselineOVR !== null)
        integer(x.baselineOVR, 1, 99);
    integer(x.multiplier, 0, 75);
} for (const x of g.facts) {
    need(g.youth.some(y => y.playerId === x.playerId && y.journeyId === x.journeyId) && Object.hasOwn(ACADEMY_XP, x.milestone) && typeof x.achieved === 'boolean', 'Youth fact');
    integer(x.multiplier, 0, 75);
} for (const x of g.seasonStart) {
    byId(s.seasons, x.seasonId);
    integer(x.prestige, 1, 6);
} for (const x of g.prestige) {
    byId(s.seasons, x.seasonId);
    integer(x.before, 1, 6);
    integer(x.after, 1, 6);
    need(Math.abs(x.after - x.before) <= 1, 'Prestige step');
} for (const x of g.stadiums) {
    byId(s.journeys, x.journeyId);
    integer(x.level, 1, 5);
} for (const x of g.windows) {
    byId(s.journeys, x.journeyId);
    date(x.start);
    date(x.end);
    need(x.start <= x.end && ['summer', 'winter'].includes(x.kind), 'Window record');
} for (const x of g.transfers) {
    const se = byId(s.seasons, x.seasonId);
    need(se.careerId === x.careerId && se.journeyId === x.journeyId && byId(s.players, x.playerId).careerId === x.careerId, 'Transfer ownership');
    const w = g.windows.find(w => w.journeyId === x.journeyId && w.windowId === x.windowId);
    need(w && date(x.date) >= w.start && x.date <= w.end && ['in', 'out'].includes(x.direction) && ['voluntary', 'pressure', 'eaForced'].includes(x.type), 'Transfer scope');
    if (x.fee !== null)
        integer(x.fee);
    need(x.currency === undefined || x.currency === null || /^[A-Z]{3}$/.test(x.currency), 'Transfer currency');
    need(typeof x.skillSlot === 'boolean' && typeof x.loan === 'boolean', 'Transfer flags');
} for (const x of g.protections) {
    const scope = x.permanent ? byId(s.journeys, x.scope) : byId(s.seasons, x.scope);
    need(scope.careerId === byId(s.players, x.playerId).careerId, 'Protection scope');
} for (const x of g.vetoes)
    need(byId(s.seasons, x.seasonId).careerId === byId(s.players, x.playerId).careerId, 'Veto scope'); for (const x of g.jokers)
    byId(s.seasons, x.seasonId); for (const x of g.academyActions)
    need(byId(s.seasons, x.seasonId).careerId === byId(s.players, x.playerId).careerId && ['sign', 'promote'].includes(x.kind), 'Academy action scope'); canonical(g); }
