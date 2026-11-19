import { byId, need, integer, key, date, canonical, monthDiff } from './model.js';
import { PHILOSOPHIES } from './rules.js';
import { game, award } from './game.js';
import { managerLevel } from './progression.js';
export const RARITIES = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'];
export const TYPES = ['positive', 'decision', 'negative', 'story'];
export const PACK_ODDS = { Event: [45, 30, 18, 6, 1], Reward: [55, 30, 12, 2.5, .5], Premium: [20, 40, 30, 9, 1], Elite: [0, 20, 45, 30, 5] };
export const TYPE_ODDS = [40, 25, 20, 15];
const EVENT_XP = [25, 50, 75, 100, 150];
export const METRICS = ['prestige', 'academyXP', 'managerLevel', 'seasonGoals', 'seasonApps', 'seasonWins', 'youthDebuts', 'seasonAssists', 'playerSeasonGoals', 'playerSeasonAssists', 'playerSeasonApps', 'playerSeasonCleanSheets', 'careerGoals', 'careerAssists', 'careerApps', 'careerWins', 'fullSeasons', 'clubs', 'trophies', 'leagueTitles', 'continentalTitles', 'promotions', 'youth80', 'youth90', 'youthCaptains', 'academyPromotions', 'signings', 'sales', 'prestigeUpgrades', 'countries', 'editions', 'careers'];
const fresh = () => ({ version: 1, catalogues: [], rng: [], cards: [], draws: [], packs: [], goals: [], achievements: [], stories: [], seasonLocks: [] });
export const events = (s) => s.events ?? fresh();
const ensure = (s) => s.events ?? (s.events = fresh());
const cat = (s, cid) => byId(events(s).catalogues.map(x => ({ ...x, id: x.version })), byId(s.careers, cid).catalogVersion ?? '');
const cardDef = (s, c) => byId(cat(s, c.careerId).cards, c.definitionId);
const uniq = (a) => need(new Set(a).size === a.length, 'Duplicate event key');
const modifierKeys = ['academyXP', 'adultSlots', 'academySlots', 'pressureReduction', 'protection', 'jokers', 'promotions'];
function checkPredicate(p) { if (!p)
    return; need(METRICS.includes(p.metric), 'Unknown predicate'); integer(p.min, 0, 1000000); }
function validateEffect(e) { need(e && ['none', 'academyXP', 'modifier', 'restriction'].includes(e.kind), 'Unknown effect'); if (e.kind === 'academyXP')
    integer(e.amount, 1, 1000); if (e.kind === 'restriction') {
    integer(e.months, 1, 6);
    need(typeof e.instruction === 'string' && e.instruction.trim().length > 0, 'Restriction instruction');
} if (e.kind === 'modifier') {
    need(['season', 'months', 'window'].includes(e.duration), 'Duration');
    if (e.duration === 'months')
        integer(e.months, 1, 6);
    need(Object.keys(e.values).length > 0, 'Empty modifier');
    for (const [k, v] of Object.entries(e.values)) {
        need(modifierKeys.includes(k), 'Unknown modifier');
        integer(v, -100, 100);
    }
    if (e.values.adultSlots !== undefined)
        need(e.duration === 'window', 'Adult slots must be window-scoped'); /* slot budgets must not disappear mid-season */
    if (['academySlots', 'promotions', 'jokers', 'protection'].some(k => Object.hasOwn(e.values, k)))
        need(e.duration === 'season', 'Season counter modifier requires season duration');
    need(e.values.protection === undefined, 'Protection target implementation pending');
} }
export function validateCatalogue(c) { key(c.version); for (const a of [c.cards, c.goals, c.achievements]) {
    need(Array.isArray(a), 'Catalogue table');
    uniq(a.map(x => x.id));
    for (const x of a) {
        key(x.id);
        need(typeof x.text === 'string', 'Catalogue text');
    }
} for (const d of c.cards) {
    need(RARITIES.includes(d.rarity) && TYPES.includes(d.type) && typeof d.category === 'string', 'Card metadata');
    checkPredicate(d.eligibility);
    if (d.eligibility && RESULT_METRICS.includes(d.eligibility.metric))
        need(c.cards.some(x => x.next === d.id), 'Monthly results cannot filter random draws');
    validateEffect(d.effect);
    need(d.reward === undefined || ['Reward', 'Premium', 'Elite'].includes(d.reward), 'Reward kind');
    if (d.type === 'negative') {
        need((d.effect.kind === 'restriction' || d.effect.kind === 'modifier' && Object.values(d.effect.values).every(v => v <= 0)) && !d.next && !d.reward, 'Negative effect must apply immediately');
    }
    if (d.next) {
        need(d.type === 'story' && byId(c.cards, d.next).type === 'story', 'Story successor');
        let n = d.next;
        const seen = new Set([d.id]);
        while (n) {
            need(!seen.has(n), 'Story cycle');
            seen.add(n);
            n = byId(c.cards, n).next;
        }
    }
} for (const d of c.goals) {
    need(['seasonal', 'legacy'].includes(d.kind) && ['sport', 'identity', 'development', 'variable'].includes(d.category) && ['Easy', 'Medium', 'Hard'].includes(d.difficulty) && typeof d.manual === 'boolean' && (d.manual || !!d.predicate), 'Goal schema');
    checkPredicate(d.predicate);
    if (d.availability) {
        const a = d.availability;
        if (a.minPrestige !== undefined)
            integer(a.minPrestige, 1, 6);
        if (a.maxPrestige !== undefined)
            integer(a.maxPrestige, 1, 6);
        need((a.minPrestige ?? 1) <= (a.maxPrestige ?? 6), 'Goal prestige range');
        if (a.philosophies)
            need(a.philosophies.length > 0 && a.philosophies.every(x => PHILOSOPHIES.some(p => p === x)), 'Goal philosophy');
    }
    need(d.manual || d.predicate?.metric !== 'managerLevel', 'Self-rewarding manager XP goal unsupported');
} for (const d of c.achievements) {
    need(['career', 'global'].includes(d.scope) && ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'].includes(d.tier) && typeof d.manual === 'boolean' && typeof d.secret === 'boolean' && (d.manual || !!d.predicate), 'Achievement schema');
    checkPredicate(d.predicate);
    need(d.manual || d.predicate?.metric !== 'managerLevel', 'Self-rewarding manager XP predicate unsupported'); /* global automatic multi-career metrics not yet designed */
    need(d.scope !== 'global' || d.manual && !d.predicate || !d.manual && !!d.predicate && GLOBAL_METRICS.includes(d.predicate.metric), 'Unsupported global metric');
} canonical(c); }
const RESULT_METRICS = ['seasonGoals', 'seasonApps', 'seasonWins', 'seasonAssists', 'playerSeasonGoals', 'playerSeasonAssists', 'playerSeasonApps', 'playerSeasonCleanSheets', 'careerGoals', 'careerAssists', 'careerApps', 'careerWins', 'trophies', 'leagueTitles', 'continentalTitles', 'promotions'];
const GLOBAL_METRICS = ['careerGoals', 'careerAssists', 'careerApps', 'careerWins', 'fullSeasons', 'clubs', 'trophies', 'leagueTitles', 'continentalTitles', 'promotions', 'youthDebuts', 'youth80', 'youth90', 'youthCaptains', 'academyPromotions', 'signings', 'sales', 'prestigeUpgrades', 'editions', 'careers'];
const fullSeason = (x) => x.closed && x.left === null && x.joined === x.start;
function metric(s, cid, p, seasonId) {
    const c = byId(s.careers, cid), j = byId(s.journeys, c.journeyId), sid = seasonId ?? c.seasonId, g = game(s), ss = s.seasons.filter(x => x.careerId === cid), js = s.journeys.filter(x => x.careerId === cid), ids = new Set(ss.map(x => x.id)), rows = s.stats.filter(x => x.scope === 'total' && ids.has(x.seasonId));
    const facts = g.xp.filter(x => x.kind === 'manager' && x.scope === cid && x.active), sport = (k) => facts.filter(x => x.id.startsWith('sport:') && k.some(t => x.id.endsWith(':' + t))).length;
    const sumKnown = (a) => a.some(x => x !== null) ? a.reduce((n, x) => n + (x ?? 0), 0) : null; // observed lower bound for nonnegative cumulative facts, no zero substitution in storage
    const maxKnown = (a) => a.some(x => x !== null) ? Math.max(...a.filter((x) => x !== null)) : null;
    switch (p.metric) {
        case 'prestige': return j.prestige;
        case 'academyXP': return j.academyXP;
        case 'managerLevel': return managerLevel(c.managerXP);
        case 'seasonGoals':
        case 'seasonApps':
        case 'seasonAssists': {
            const f = p.metric === 'seasonGoals' ? 'goals' : p.metric === 'seasonApps' ? 'apps' : 'assists';
            const a = rows.filter(x => x.seasonId === sid);
            return a.length && a.every(x => x[f] !== null) ? sumKnown(a.map(x => x[f])) : null;
        }
        case 'playerSeasonGoals':
        case 'playerSeasonAssists':
        case 'playerSeasonApps':
        case 'playerSeasonCleanSheets': {
            const f = p.metric === 'playerSeasonGoals' ? 'goals' : p.metric === 'playerSeasonAssists' ? 'assists' : p.metric === 'playerSeasonApps' ? 'apps' : 'cleanSheets';
            return maxKnown(rows.filter(x => x.seasonId === sid).map(x => x[f]));
        }
        case 'careerGoals':
        case 'careerApps':
        case 'careerAssists': {
            const f = p.metric === 'careerGoals' ? 'goals' : p.metric === 'careerApps' ? 'apps' : 'assists';
            return sumKnown(rows.map(x => x[f]));
        }
        case 'seasonWins': {
            const ms = s.matches.filter(x => x.seasonId === sid);
            return ms.length ? ms.filter(x => x.gf > x.ga).length : null;
        }
        case 'careerWins': {
            const ms = s.matches.filter(x => x.careerId === cid);
            return ms.length ? ms.filter(x => x.gf > x.ga).length : null;
        }
        case 'youthDebuts': return facts.filter(x => x.id.endsWith(':debut')).length;
        case 'youth80': return facts.filter(x => x.id.endsWith(':ovr80')).length;
        case 'youth90': return facts.filter(x => x.id.endsWith(':ovr90')).length;
        case 'youthCaptains': return facts.filter(x => x.id.endsWith(':captain')).length;
        case 'fullSeasons': return ss.filter(fullSeason).length;
        case 'clubs': return new Set(js.map(x => x.club.trim().toLowerCase())).size;
        case 'careers': return ss.some(fullSeason) ? 1 : 0;
        case 'editions': return ss.some(fullSeason) ? 1 : 0;
        case 'countries': return null; // edition geography not yet available
        case 'trophies': return sport(['league', 'domesticCup', 'supercup', 'conference', 'europa', 'champions']);
        case 'leagueTitles': return sport(['league']);
        case 'continentalTitles': return sport(['conference', 'europa', 'champions']);
        case 'promotions': return sport(['promotion']);
        case 'academyPromotions': return g.academyActions.filter(x => ids.has(x.seasonId) && x.kind === 'promote').length;
        case 'signings':
        case 'sales': return g.transfers.filter(x => x.careerId === cid && x.direction === (p.metric === 'signings' ? 'in' : 'out') && !x.loan).length;
        case 'prestigeUpgrades': return g.prestige.filter(x => ids.has(x.seasonId) && x.after > x.before).length;
    }
}
const met = (s, cid, p, sid) => !p || (metric(s, cid, p, sid) ?? -1) >= p.min;
const SEASON_METRICS = ['seasonGoals', 'seasonApps', 'seasonWins', 'seasonAssists', 'playerSeasonGoals', 'playerSeasonAssists', 'playerSeasonApps', 'playerSeasonCleanSheets'];
function achievementMet(s, cid, p) { if (!p)
    return true; const js = s.journeys.filter(x => x.careerId === cid); if (p.metric === 'prestige')
    return Math.max(...js.map(j => j.prestige), ...game(s).prestige.filter(x => byId(s.seasons, x.seasonId).careerId === cid).map(x => Math.max(x.before, x.after))) >= p.min; if (p.metric === 'academyXP')
    return js.some(j => j.academyXP >= p.min); if (SEASON_METRICS.includes(p.metric))
    return s.seasons.filter(x => x.careerId === cid).some(x => met(s, cid, p, x.id)); return met(s, cid, p); }
function globalMet(s, p) { const eligible = s.careers.filter(c => s.seasons.some(x => x.careerId === c.id && fullSeason(x))); if (p.metric === 'careers')
    return eligible.length >= p.min; if (p.metric === 'editions')
    return new Set(eligible.map(c => c.edition)).size >= p.min; if (p.metric === 'clubs')
    return new Set(s.journeys.filter(j => s.seasons.some(x => x.journeyId === j.id && fullSeason(x))).map(j => j.club.trim().toLowerCase())).size >= p.min; const vals = s.careers.map(c => metric(s, c.id, p)); return vals.some(x => x !== null) && vals.reduce((n, x) => n + (x ?? 0), 0) >= p.min; }
function addMonths(d, n) { const x = new Date(d + 'T00:00:00Z'), day = x.getUTCDate(); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + n); const end = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate(); x.setUTCDate(Math.min(day, end)); return x.toISOString().slice(0, 10); }
const nextDate = (s) => { const d = new Date(s + 'T00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
function activeWindow(s, cid) { const c = byId(s.careers, cid); return game(s).windows.find(w => w.journeyId === c.journeyId && w.start <= c.gameDate && w.end >= c.gameDate); }
const activeAt = (s, x) => { const c = byId(s.careers, x.careerId); return x.status === 'active' && x.journeyId === c.journeyId && x.until !== null && c.gameDate < x.until; };
export function eventModifiers(s, cid) { const m = {}; for (const x of events(s).cards.filter(x => x.careerId === cid && activeAt(s, x))) {
    const e = cardDef(s, x).effect;
    if (e.kind === 'modifier')
        for (const k of Object.keys(e.values))
            m[k] = (m[k] ?? 0) + (e.values[k] ?? 0);
} return m; }
function timedCount(s, cid) { return events(s).cards.filter(x => x.careerId === cid && activeAt(s, x)).length; }
function inventory(s, cid) { return events(s).cards.filter(x => x.careerId === cid && x.status === 'stored'); }
function expire(s) { const ev = events(s); for (const x of ev.cards) {
    const c = byId(s.careers, x.careerId);
    if (x.status === 'active' && !activeAt(s, x)) {
        if (x.journeyId === c.journeyId && x.until !== null && c.gameDate >= x.until && cardDef(s, x).type === 'negative')
            completeCard(s, x);
        x.status = 'expired';
    }
    if (x.status === 'stored' && (x.journeyId !== c.journeyId || s.seasons.filter(y => y.journeyId === x.journeyId && y.joined > byId(s.seasons, x.seasonId).joined && y.joined <= byId(s.seasons, c.seasonId).joined).length >= 2))
        x.status = 'expired';
} for (const x of ev.stories)
    if (x.status === 'active' && byId(s.careers, x.careerId).journeyId !== x.journeyId)
        x.status = 'failed'; }
function random(r) { let n = r.seed >>> 0; n ^= n << 13; n ^= n >>> 17; n ^= n << 5; r.seed = n >>> 0; return r.seed / 4294967296; }
function pick(a, weights, r) { let n = random(r) * weights.reduce((s, x) => s + x, 0); for (let i = 0; i < a.length; i++) {
    n -= weights[i];
    if (n < 0)
        return a[i];
} return a[a.length - 1]; }
function eligible(s, cid, d, kind, story = false) { const c = byId(s.careers, cid); if (d.pending || !met(s, cid, d.eligibility) || !story && d.type === 'story' && events(s).cards.some(x => x.journeyId === c.journeyId && x.definitionId === d.id) || !story && cat(s, cid).cards.some(x => x.next === d.id) || kind !== 'Event' && !['positive', 'decision'].includes(d.type))
    return false; if (d.effect.kind === 'restriction' && timedCount(s, cid) >= 3)
    return false; if (d.effect.kind === 'modifier') {
    if (d.effect.duration === 'window' && !activeWindow(s, cid))
        return false;
    if (d.type !== 'positive' && timedCount(s, cid) >= 3)
        return false;
    if (d.effect.duration === 'season' && (byId(s.seasons, c.seasonId).closed || c.gameDate > byId(s.seasons, c.seasonId).end))
        return false;
} return true; }
export function goalAvailable(s, cid, d) { const c = byId(s.careers, cid), j = byId(s.journeys, c.journeyId), a = d.availability; if (!a)
    return true; const r = game(s).rules.find(x => x.seasonId === c.seasonId)?.rule; return (a.minPrestige === undefined || j.prestige >= a.minPrestige) && (a.maxPrestige === undefined || j.prestige <= a.maxPrestige) && (!a.philosophies || !!r && a.philosophies.includes(r.primary)); }
export function seasonalOptions(s, cid) { return cat(s, cid).goals.filter(d => d.kind === 'seasonal' && goalAvailable(s, cid, d)); }
export function visibleAchievements(s, cid) { const catalogue = cat(s, cid), ev = events(s); return catalogue.achievements.flatMap(d => { const earned = ev.achievements.find(x => x.definitionId === d.id && x.catalogueVersion === catalogue.version && x.careerId === (d.scope === 'global' ? null : cid))?.active ?? false; return d.secret && !earned ? [] : [{ id: d.id, title: d.title ?? d.id, category: d.category ?? '', tier: d.tier, scope: d.scope, text: d.text, earned, manual: d.manual }]; }); }
export function pendingEventCount(s, cid) { return s.entitlements.filter(e => e.careerId === cid && !events(s).draws.some(d => d.id === e.id)).length; }
function grantPack(s, cid, source, kind) { const ev = ensure(s); const old = ev.packs.find(x => x.careerId === cid && x.source === source); if (old) {
    need(old.kind === kind, 'Pack reward mismatch');
    if (old.status === 'revoked')
        old.status = 'unopened';
    return;
} ev.packs.push({ id: `pack:${cid}:${source}`, careerId: cid, kind, source, status: 'unopened' }); }
function completeCard(s, x) { if (x.completed)
    return; const d = cardDef(s, x); x.completed = true; award(game(s), `event:${x.id}`, 'manager', x.careerId, EVENT_XP[RARITIES.indexOf(d.rarity)]); if (d.reward)
    grantPack(s, x.careerId, `event:${x.id}`, d.reward); if (d.next)
    ensure(s).stories.push({ id: `story:${x.id}`, careerId: x.careerId, journeyId: x.journeyId, cardId: x.id, next: d.next, status: 'active' }); }
function activate(s, x) { const c = byId(s.careers, x.careerId), d = cardDef(s, x); need(c.journeyId === x.journeyId && eligible(s, c.id, d, 'Event', true), 'Card no longer eligible'); const e = d.effect; x.activateDate = c.gameDate; if (e.kind === 'restriction') {
    need(timedCount(s, c.id) < 3, 'Active effect slots full');
    x.status = 'active';
    x.until = addMonths(c.gameDate, e.months);
    return;
} if (e.kind === 'modifier') {
    need(timedCount(s, c.id) < 3, 'Active effect slots full');
    const w = e.duration === 'window' ? activeWindow(s, c.id) : undefined;
    need(e.duration !== 'window' || w, 'No active window');
    x.status = 'active';
    x.until = e.duration === 'months' ? addMonths(c.gameDate, e.months) : nextDate(w?.end ?? byId(s.seasons, c.seasonId).end);
    x.windowId = w?.windowId ?? null;
    need(x.until > c.gameDate, 'Effect already expired');
}
else {
    if (e.kind === 'academyXP')
        award(game(s), `card-academy:${x.id}`, 'academy', c.journeyId, e.amount);
    x.status = 'used';
} /* reward is earned on explicit completion, not merely activation. */ }
function receive(s, cid, d, packId) { const c = byId(s.careers, cid), ev = ensure(s), x = { id: `card:${packId}`, careerId: cid, journeyId: c.journeyId, seasonId: c.seasonId, definitionId: d.id, packId, drawDate: c.gameDate, status: 'decision', activateDate: null, until: null, windowId: null, completed: false }; need(!ev.cards.some(y => y.id === x.id), 'Card already received'); ev.cards.push(x); if (d.type === 'negative')
    activate(s, x); return x; }
function draw(s, cid, id, kind) { const ev = ensure(s), c = byId(s.careers, cid), r = ev.rng.find(x => x.careerId === cid); need(r, 'Pin catalogue first'); const old = ev.draws.find(x => x.id === id); if (old) {
    need(old.careerId === cid && old.kind === kind, 'Draw scope');
    return old;
} need(!ev.cards.some(x => x.careerId === cid && x.status === 'decision'), 'Resolve current card first'); let pool = cat(s, cid).cards.filter(d => eligible(s, cid, d, kind) && !(kind === 'Event' && r.negative >= 2 && d.type === 'negative')); const before = r.misses; if (before >= 60)
    pool = pool.filter(d => d.rarity === 'Mythic'); const weights = PACK_ODDS[kind]; let rarities = RARITIES.filter((v, i) => weights[i] > 0 && pool.some(d => d.rarity === v)); if (!rarities.length) {
    if (kind !== 'Event')
        return null;
    const result = { id, careerId: cid, kind, cardId: null, date: c.gameDate, status: 'skipped', pityBefore: before, pityAfter: before, negativeAfter: r.negative };
    ev.draws.push(result);
    return result;
} const rarity = pick([...rarities], rarities.map(v => weights[RARITIES.indexOf(v)]), r); pool = pool.filter(d => d.rarity === rarity); const types = TYPES.filter(t => pool.some(d => d.type === t)); const type = pick([...types], types.map(t => TYPE_ODDS[TYPES.indexOf(t)]), r); const defs = pool.filter(d => d.type === type); const d = defs[Math.floor(random(r) * defs.length)]; const x = receive(s, cid, d, id); r.misses = rarity === 'Mythic' ? 0 : before + 1; if (kind === 'Event')
    r.negative = type === 'negative' ? r.negative + 1 : 0; const result = { id, careerId: cid, kind, cardId: x.id, date: c.gameDate, status: 'drawn', pityBefore: before, pityAfter: r.misses, negativeAfter: r.negative }; ev.draws.push(result); return result; }
export function assertEventQueue(s, cid) { if (!byId(s.careers, cid).catalogVersion)
    return; const ev = events(s); need(!s.entitlements.some(e => e.careerId === cid && !ev.draws.some(d => d.id === e.id)), 'Resolve due events before advancing'); need(!ev.cards.some(x => x.careerId === cid && x.status === 'decision'), 'Resolve current card before advancing'); }
export function performEvent(s, q) {
    const c = byId(s.careers, q.careerId);
    need(c.status === 'Active', 'Career must be Active');
    const ev = ensure(s);
    expire(s);
    if (q.type === 'pinCatalogue') {
        need(c.catalogVersion === null, 'Catalogue already pinned');
        validateCatalogue(q.catalogue);
        integer(q.seed, 1, 4294967295);
        const old = ev.catalogues.find(x => x.version === q.catalogue.version);
        if (old)
            need(canonical(old) === canonical(q.catalogue), 'Catalogue version conflict');
        else
            ev.catalogues.push(structuredClone(q.catalogue));
        c.catalogVersion = q.catalogue.version;
        ev.rng.push({ careerId: c.id, seed: q.seed, misses: 0, negative: 0 });
        for (const e of s.entitlements.filter(x => x.careerId === c.id)) {
            const cl = byId(s.closures, e.closureId);
            if (cl.seasonId !== c.seasonId || monthDiff(cl.month, c.gameDate.slice(0, 7)) > 1)
                ev.draws.push({ id: e.id, careerId: c.id, kind: 'Event', cardId: null, date: c.gameDate, status: 'skipped', pityBefore: 0, pityAfter: 0, negativeAfter: 0 });
        }
        return;
    }
    const catalogue = cat(s, c.id), own = (id) => { const x = byId(ev.cards, id); need(x.careerId === c.id, 'Card owner'); return x; };
    switch (q.type) {
        case 'drawEvent': {
            const e = byId(s.entitlements, q.entitlementId);
            need(e.careerId === c.id, 'Entitlement owner');
            const old = ev.draws.find(x => x.id === e.id);
            if (old)
                break;
            const first = s.entitlements.find(x => x.careerId === c.id && !ev.draws.some(d => d.id === x.id));
            need(first?.id === e.id, 'Resolve oldest event first');
            draw(s, c.id, e.id, 'Event');
            break;
        }
        case 'openPack': {
            const p = byId(ev.packs, q.packId);
            need(p.careerId === c.id && p.status !== 'revoked', 'Pack owner or revoked');
            if (p.status === 'opened')
                break;
            need(!s.entitlements.some(e => e.careerId === c.id && !ev.draws.some(d => d.id === e.id)), 'Resolve due events before opening rewards');
            const result = draw(s, c.id, p.id, p.kind);
            if (result)
                p.status = 'opened';
            break;
        }
        case 'resolveCard': {
            const x = own(q.cardId), d = cardDef(s, x);
            need(x.status === 'decision' || x.status === 'stored', 'Card not actionable');
            if (q.action === 'activate') {
                activate(s, x);
                break;
            }
            if (q.action === 'store') {
                need(x.status === 'decision' && d.type === 'positive', 'Only positive cards can be stored');
                const inv = inventory(s, c.id);
                if (inv.length >= 5) {
                    need(q.replaceId && inv.some(y => y.id === q.replaceId), 'Inventory full: choose card to discard');
                    own(q.replaceId).status = 'discarded';
                }
                x.status = 'stored';
                break;
            }
            if (q.action === 'decline') {
                need(x.status === 'decision' && d.type === 'decision', 'Only a decision can be declined');
                x.status = 'declined';
                break;
            }
            need(q.action === 'discard' && d.type === 'positive', 'Cannot discard this card');
            x.status = 'discarded';
            break;
        }
        case 'completeCard': {
            const x = own(q.cardId);
            need(q.confirmed === true && ['active', 'used'].includes(x.status) && x.journeyId === c.journeyId && cardDef(s, x).type !== 'negative', 'Card completion not confirmed/available');
            completeCard(s, x);
            break;
        }
        case 'advanceStory': {
            const x = byId(ev.stories, q.storyId);
            need(x.careerId === c.id && x.journeyId === c.journeyId && x.status === 'active' && q.confirmed === true, 'Story not available');
            if (q.failed) {
                x.status = 'failed';
                break;
            }
            need(!ev.cards.some(y => y.careerId === c.id && y.status === 'decision'), 'Resolve current card');
            const d = byId(catalogue.cards, x.next);
            need(eligible(s, c.id, d, 'Event', true), 'Story condition unsatisfied');
            receive(s, c.id, d, `chapter:${x.id}`);
            x.status = 'completed';
            break;
        }
        case 'setGoals': {
            need(!ev.seasonLocks.includes(c.seasonId) && c.gameDate === byId(s.seasons, c.seasonId).joined, 'Seasonal goals locked');
            uniq(q.definitionIds);
            const ds = q.definitionIds.map(id => byId(catalogue.goals, id));
            need(ds.length === 4 && ds.every(d => d.kind === 'seasonal' && goalAvailable(s, c.id, d)) && new Set(ds.map(d => d.category)).size === 4, 'Four distinct goal categories required');
            for (const d of ds)
                ev.goals.push({ id: `goal:${c.seasonId}:${d.id}`, careerId: c.id, seasonId: c.seasonId, definitionId: d.id, status: 'active', confirmed: false });
            ev.seasonLocks.push(c.seasonId);
            break;
        }
        case 'addLegacyGoal': {
            const d = byId(catalogue.goals, q.definitionId);
            need(d.kind === 'legacy' && ev.goals.filter(x => x.careerId === c.id && x.seasonId === null && x.status === 'active').length < 3 && !ev.goals.some(x => x.careerId === c.id && x.definitionId === d.id), 'Legacy goals cap/duplicate');
            ev.goals.push({ id: `legacy:${c.id}:${d.id}`, careerId: c.id, seasonId: null, definitionId: d.id, status: 'active', confirmed: false });
            break;
        }
        case 'confirmGoal': {
            const g = byId(ev.goals, q.goalId);
            need(g.careerId === c.id && g.status === 'active' && q.confirmed === true && byId(catalogue.goals, g.definitionId).manual, 'Goal not confirmable');
            g.confirmed = true;
            break;
        }
        case 'settleGoals': {
            const ss = byId(s.seasons, q.seasonId);
            need(ss.careerId === c.id && ss.closed && ss.id === c.seasonId, 'Closed current season required');
            for (const g of ev.goals.filter(x => x.seasonId === ss.id && x.status === 'active')) {
                const d = byId(catalogue.goals, g.definitionId);
                if (goalMet(s, g, d))
                    rewardGoal(s, g, d);
                else
                    g.status = 'failed';
            }
            break;
        }
        case 'confirmAchievement': {
            const d = byId(catalogue.achievements, q.definitionId);
            need(d.manual && q.confirmed === true && met(s, c.id, d.predicate), 'Achievement not confirmable');
            const id = d.scope === 'global' ? `global:${d.id}` : `achievement:${c.id}:${d.id}`;
            if (!ev.achievements.some(x => x.id === id)) {
                ev.achievements.push({ id, careerId: d.scope === 'global' ? null : c.id, catalogueVersion: catalogue.version, definitionId: d.id, confirmed: true, active: true });
                if (d.scope === 'career')
                    award(game(s), id, 'manager', c.id, tierXP(d.tier));
            }
            break;
        }
    }
}
const tierXP = (t) => ({ Bronze: 25, Silver: 50, Gold: 100, Platinum: 200, Diamond: 400 })[t];
function goalMet(s, g, d) { return (!d.manual || g.confirmed) && met(s, g.careerId, d.predicate, g.seasonId); }
function rewardGoal(s, g, d) { g.status = 'completed'; award(game(s), g.id, 'manager', g.careerId, d.kind === 'legacy' ? 500 : ({ Easy: 100, Medium: 200, Hard: 300 })[d.difficulty]); grantPack(s, g.careerId, g.id, d.kind === 'legacy' ? 'Elite' : d.difficulty === 'Hard' ? 'Premium' : 'Reward'); }
export function reconcileEvents(s) {
    if (!s.events)
        return;
    expire(s);
    const ev = events(s);
    for (const catalogue of ev.catalogues)
        for (const d of catalogue.achievements.filter(x => x.scope === 'global' && !x.manual && x.predicate)) {
            const id = `global:${d.id}`, old = ev.achievements.find(x => x.id === id);
            if (old && old.catalogueVersion !== catalogue.version)
                continue;
            const ok = globalMet(s, d.predicate);
            if (old)
                old.active = ok;
            else if (ok)
                ev.achievements.push({ id, careerId: null, catalogueVersion: catalogue.version, definitionId: d.id, confirmed: false, active: true });
        }
    for (const c of s.careers.filter(c => c.catalogVersion !== null)) {
        const catalogue = cat(s, c.id);
        for (const g of ev.goals.filter(x => x.careerId === c.id && x.seasonId === null && x.status === 'active')) {
            const d = byId(catalogue.goals, g.definitionId);
            if (goalMet(s, g, d))
                rewardGoal(s, g, d);
        }
        for (const d of catalogue.achievements.filter(x => x.scope === 'career' && !x.manual)) {
            const id = `achievement:${c.id}:${d.id}`, old = ev.achievements.find(x => x.id === id), ok = achievementMet(s, c.id, d.predicate);
            if (ok || old) {
                if (old)
                    old.active = ok;
                else
                    ev.achievements.push({ id, careerId: c.id, catalogueVersion: catalogue.version, definitionId: d.id, confirmed: false, active: true });
                award(game(s), id, 'manager', c.id, tierXP(d.tier), ok);
            }
        } /* Completed automatic objective correction: fail closed, rather than silently keeping a bad reward. */
        for (const g of ev.goals.filter(x => x.careerId === c.id && x.status === 'completed')) {
            const d = byId(catalogue.goals, g.definitionId);
            if (d.predicate && (RESULT_METRICS.includes(d.predicate.metric) || ['youthDebuts', 'youth80', 'youth90', 'youthCaptains', 'academyPromotions', 'signings', 'sales', 'prestigeUpgrades'].includes(d.predicate.metric))) {
                const ok = g.seasonId === null ? achievementMet(s, c.id, d.predicate) : goalMet(s, g, d);
                need(ok, 'Correction affects completed objective; review required');
            }
        }
        const g = game(s);
        for (const x of g.xp.filter(x => x.kind === 'manager' && x.scope === c.id)) {
            let k;
            if (x.id.startsWith('academy-level:'))
                k = 'Reward';
            else if (x.id.startsWith('prestige:'))
                k = 'Premium';
            else if (/^sport:.*:(promotion|league|domesticCup)$/.test(x.id))
                k = 'Premium';
            else if (/^sport:.*:(conference|europa|champions)$/.test(x.id))
                k = 'Elite';
            if (!k)
                continue;
            if (x.active)
                grantPack(s, c.id, x.id, k);
            else {
                const old = ev.packs.find(p => p.careerId === c.id && p.source === x.id);
                if (old) {
                    need(old.status !== 'opened', 'Correction affects opened reward; review required');
                    old.status = 'revoked';
                }
            }
        }
        const levelPack = ev.packs.find(p => p.careerId === c.id && p.source === 'manager30');
        if (managerLevel(c.managerXP) === 30)
            grantPack(s, c.id, 'manager30', 'Elite');
        else if (levelPack) {
            need(levelPack.status !== 'opened', 'Correction affects opened level reward; review required');
            levelPack.status = 'revoked';
        }
    }
}
export function validateEvents(s) {
    if (!s.events) {
        need(s.careers.every(c => c.catalogVersion === null), 'Missing event catalogue');
        return;
    }
    const e = s.events;
    need(e.version === 1, 'Event schema');
    for (const k of Object.keys(fresh()))
        if (k !== 'version')
            need(Array.isArray(e[k]), 'Missing event table');
    uniq(e.catalogues.map(x => x.version));
    e.catalogues.forEach(validateCatalogue);
    uniq(e.rng.map(x => x.careerId));
    for (const c of s.careers) {
        const r = e.rng.find(r => r.careerId === c.id);
        if (c.catalogVersion) {
            cat(s, c.id);
            need(r, 'Missing RNG');
            integer(r.seed, 1, 4294967295);
            integer(r.misses, 0, 60);
            integer(r.negative, 0, 2);
        }
        else
            need(!r, 'Unpinned RNG');
        need(inventory(s, c.id).length <= 5 && timedCount(s, c.id) <= 3 && e.cards.filter(x => x.careerId === c.id && x.status === 'decision').length <= 1, 'Card capacity');
    }
    for (const a of [e.cards, e.draws, e.packs, e.goals, e.achievements, e.stories])
        uniq(a.map(x => x.id));
    uniq(e.seasonLocks);
    uniq(e.packs.map(x => `${x.careerId}/${x.source}`));
    for (const x of e.cards) {
        const c = byId(s.careers, x.careerId), ss = byId(s.seasons, x.seasonId);
        need(ss.careerId === c.id && ss.journeyId === x.journeyId, 'Card scope');
        cardDef(s, x);
        date(x.drawDate);
        need(x.drawDate <= c.gameDate && ['decision', 'stored', 'active', 'used', 'discarded', 'expired', 'declined'].includes(x.status), 'Card state');
        if (x.activateDate)
            date(x.activateDate);
        if (x.until)
            date(x.until);
        if (x.status === 'active')
            need(x.activateDate && x.until && x.until > x.activateDate, 'Active duration');
        need(typeof x.completed === 'boolean', 'Card completion');
    }
    for (const x of e.draws) {
        byId(s.careers, x.careerId);
        date(x.date);
        integer(x.pityBefore, 0, 60);
        integer(x.pityAfter, 0, 60);
        integer(x.negativeAfter, 0, 2);
        need(x.kind === 'Event' ? byId(s.entitlements, x.id).careerId === x.careerId : byId(e.packs, x.id).careerId === x.careerId, 'Draw source');
        if (x.status === 'drawn') {
            const c = byId(e.cards, x.cardId ?? '');
            need(c.careerId === x.careerId && c.packId === x.id, 'Draw/card link');
        }
        else
            need(x.status === 'skipped' && x.kind === 'Event' && x.cardId === null, 'Skipped draw');
    }
    for (const x of e.packs) {
        cat(s, x.careerId);
        need(['Reward', 'Premium', 'Elite'].includes(x.kind) && ['unopened', 'opened', 'revoked'].includes(x.status), 'Pack state');
        need((x.status === 'opened') === e.draws.some(d => d.id === x.id && d.status === 'drawn'), 'Pack/draw mismatch');
    }
    for (const x of e.goals) {
        const d = byId(cat(s, x.careerId).goals, x.definitionId);
        need(x.seasonId === null ? d.kind === 'legacy' : d.kind === 'seasonal' && byId(s.seasons, x.seasonId).careerId === x.careerId, 'Goal scope');
        need(['active', 'completed', 'failed'].includes(x.status) && typeof x.confirmed === 'boolean', 'Goal state');
    }
    for (const x of e.achievements) {
        const d = byId(byId(e.catalogues.map(c => ({ ...c, id: c.version })), x.catalogueVersion).achievements, x.definitionId);
        need(x.careerId === null ? d.scope === 'global' : d.scope === 'career' && byId(s.careers, x.careerId).catalogVersion === x.catalogueVersion, 'Achievement scope');
    }
    for (const x of e.stories) {
        const card = byId(e.cards, x.cardId);
        need(card.careerId === x.careerId && card.journeyId === x.journeyId && cardDef(s, card).next === x.next && ['active', 'completed', 'failed'].includes(x.status), 'Story scope');
    }
    for (const x of e.seasonLocks)
        byId(s.seasons, x);
    canonical(e);
}
