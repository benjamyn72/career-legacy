import { calendarStats, matchSummary } from './statistics.js';
import { byId, need, integer, canonical } from './model.js';
import { game, currentSkills } from './game.js';
import { managerLevel, managerRank, skillPoints, academyLevel, stadiumUnlocked, ACADEMY_THRESHOLDS } from './progression.js';
import { effective, identity, scoutLimit } from './rules.js';
import { eventModifiers } from './events.js';
import { trophies } from './statistics.js';
const full = (s) => s.closed && s.joined === s.start && s.left === null;
export const TRAITS = [['Architect', 'Két különböző presztízsszint feloldása ugyanazon klubidőszakban.'], ['Professor', 'Tíz igazolt saját nevelésű játékosdebütálás.'], ['Patriot', 'Három teljes Patriots-szezon legalább 95 Identity Score-ral.'], ['Giant Slayer', 'Megnyert döntő magasabb presztízsű klub ellen.'], ['Collector', 'Öt igazolt trófea.'], ['Businessman', 'Három egymást követő teljes szezon pozitív átigazolási egyenleggel.'], ['Loyalist', 'Öt teljes szezon ugyanazon klubidőszakban.'], ['Journeyman', 'Három különböző klub ugyanazon karrierben.'], ['Kingmaker', 'Két saját nevelésű játékos eléri a 85 OVR-t.']];
const fresh = () => ({ version: 1, highlights: [], evidence: [], archive: [] });
const get = (s) => s.rpg ?? fresh();
// Older saves already preserve the exact accepted season review command in the audit ledger.
export function identityHistory(s, cid) { const rows = new Map(); for (const a of s.audit) {
    if (a.type !== 'seasonReview' && a.type !== 'seasonRewards')
        continue;
    try {
        const q = JSON.parse(a.signature);
        if (q.careerId !== cid || q.type !== a.type || !Array.isArray(q.parts) || !s.seasons.some(x => x.id === q.seasonId && x.careerId === cid && full(x)))
            continue;
        const parts = q.parts;
        const v = identity(parts);
        if (!v.final)
            continue;
        const t = parts.length === 5 && parts[3]?.weight === 15 && parts[3].active ? parts[3].score : null;
        rows.set(q.seasonId, { seasonId: q.seasonId, score: v.score, tactics: t });
    }
    catch { /* legacy malformed audit: no evidence */ }
} return [...rows.values()]; }
export function managerTraits(s, cid) {
    byId(s.careers, cid);
    const g = game(s), js = s.journeys.filter(x => x.careerId === cid), ss = s.seasons.filter(x => x.careerId === cid && full(x)).sort((a, b) => a.start.localeCompare(b.start)), ids = new Set(js.map(x => x.id)), evidence = get(s).evidence.filter(x => s.seasons.some(z => z.id === x.seasonId && z.careerId === cid)), hist = identityHistory(s, cid);
    const debuts = new Set(g.facts.filter(x => ids.has(x.journeyId) && x.milestone === 'debut' && x.achieved).map(x => x.playerId)).size;
    const architecture = Math.max(0, ...js.map(j => new Set(g.prestige.filter(x => x.after > x.before && ss.some(z => z.id === x.seasonId && z.journeyId === j.id)).map(x => x.after)).size));
    let streak = 0, best = 0, previous;
    for (const se of ss) {
        if (previous && new Date(se.start).getTime() - new Date(previous.end).getTime() !== 86400000)
            streak = 0;
        streak = evidence.find(x => x.seasonId === se.id)?.positiveBalance === true ? streak + 1 : 0;
        best = Math.max(best, streak);
        previous = se;
    }
    const counts = [architecture, debuts, hist.filter(x => (x.score ?? 0) >= 95 && g.rules.find(r => r.seasonId === x.seasonId)?.rule.primary === 'The Patriots').length, Number(evidence.some(x => x.finalWin && x.finalWin.opponent > x.finalWin.own && g.xp.some(y => y.active && ['domesticCup', 'supercup', 'conference', 'europa', 'champions'].some(k => y.id === `sport:${x.seasonId}:${k}`)))), trophies(s, { careerId: cid }).length, best, Math.max(0, ...js.map(j => ss.filter(x => x.journeyId === j.id).length)), new Set(js.map(j => j.club.normalize('NFKC').trim().toLowerCase())).size, new Set(g.youth.filter(y => ids.has(y.journeyId) && s.snapshots.some(x => x.playerId === y.playerId && x.date > y.enrolled && (x.ovr ?? 0) >= 85 && s.seasons.some(se => se.id === x.seasonId && se.journeyId === y.journeyId))).map(y => y.playerId)).size];
    const targets = [2, 10, 3, 1, 5, 3, 5, 3, 2];
    const r = get(s);
    return TRAITS.map(([name, description], i) => ({ name, description, progress: counts[i], target: targets[i], earned: counts[i] >= targets[i], highlighted: r.highlights.find(x => x.careerId === cid)?.traits.includes(name) ?? false, firstEarned: r.archive.find(x => x.careerId === cid && x.trait === name)?.date ?? null }));
}
export function reconcileRpg(s) { const r = s.rpg ?? (s.rpg = fresh()); for (const c of s.careers) {
    const ts = managerTraits(s, c.id);
    for (const t of ts.filter(x => x.earned))
        if (!r.archive.some(x => x.careerId === c.id && x.trait === t.name))
            r.archive.push({ careerId: c.id, trait: t.name, date: c.gameDate });
    const h = r.highlights.find(x => x.careerId === c.id);
    if (h)
        h.traits = h.traits.filter(n => ts.some(t => t.name === n && t.earned));
} }
export function performRpg(s, q) { const c = byId(s.careers, q.careerId); need(c.status === 'Active', 'Career must be Active'); const r = s.rpg ?? (s.rpg = fresh()); if (q.type === 'setManagerHighlights') {
    need(Array.isArray(q.traits) && q.traits.length <= 3 && new Set(q.traits).size === q.traits.length && q.traits.every(n => managerTraits(s, c.id).some(t => t.name === n && t.earned)), 'Maximum three earned traits');
    const old = r.highlights.find(x => x.careerId === c.id);
    if (old)
        old.traits = [...q.traits];
    else
        r.highlights.push({ careerId: c.id, traits: [...q.traits] });
    return;
} const se = byId(s.seasons, q.seasonId); need(q.confirmed === true && se.careerId === c.id, 'Evidence scope / confirmation'); need(q.positiveBalance === null || typeof q.positiveBalance === 'boolean' && full(se), 'Full closed season for balance'); if (q.finalWin !== null) {
    integer(q.finalWin.own, 1, 6);
    integer(q.finalWin.opponent, 1, 6);
    need(q.finalWin.opponent > q.finalWin.own, 'Opponent must have higher prestige');
    need(game(s).xp.some(x => x.active && ['domesticCup', 'supercup', 'conference', 'europa', 'champions'].some(k => x.id === `sport:${se.id}:${k}`)), 'Confirmed cup trophy required');
} const old = r.evidence.find(x => x.seasonId === se.id); const newRow = { seasonId: se.id, positiveBalance: q.positiveBalance, finalWin: q.finalWin }; if (old)
    Object.assign(old, structuredClone(newRow));
else
    r.evidence.push(structuredClone(newRow)); }
export function validateRpg(s) { if (!s.rpg)
    return; const r = s.rpg; need(r.version === 1 && Array.isArray(r.highlights) && Array.isArray(r.evidence) && Array.isArray(r.archive), 'RPG schema'); const unique = (a) => need(a.length === new Set(a).size, 'Duplicate RPG key'); const names = TRAITS.map(t => t[0]); unique(r.highlights.map(x => x.careerId)); unique(r.evidence.map(x => x.seasonId)); unique(r.archive.map(x => canonical([x.careerId, x.trait]))); for (const h of r.highlights) {
    byId(s.careers, h.careerId);
    need(Array.isArray(h.traits) && h.traits.length <= 3 && h.traits.every(t => names.includes(t)), 'Highlight selection');
    unique(h.traits);
} for (const x of r.evidence) {
    const se = byId(s.seasons, x.seasonId);
    need(x.positiveBalance === null || typeof x.positiveBalance === 'boolean' && full(se), 'Balance evidence');
    if (x.finalWin !== null) {
        integer(x.finalWin.own, 1, 6);
        integer(x.finalWin.opponent, 1, 6);
        need(x.finalWin.opponent > x.finalWin.own, 'Final evidence');
    }
} for (const x of r.archive) {
    const c = byId(s.careers, x.careerId);
    need(names.includes(x.trait) && /^\d{4}-\d\d-\d\d$/.test(x.date) && x.date <= c.gameDate, 'Trait archive');
} canonical(r); }
export function managerProfile(s, cid) { const c = byId(s.careers, cid), g = game(s), sk = currentSkills(s, cid), level = managerLevel(c.managerXP), used = Object.values(sk).reduce((a, b) => a + b, 0), ss = s.seasons.filter(x => x.careerId === cid && full(x)), hist = identityHistory(s, cid), traits = managerTraits(s, cid); const reviewed = ss.filter(se => g.xp.some(x => x.id === `season:${se.id}` && x.active)); const winTrophies = trophies(s, { careerId: cid }).length; const debuts = traits.find(x => x.name === 'Professor').progress, ups = g.prestige.filter(x => x.after > x.before && ss.some(se => se.id === x.seasonId)).length; const balances = get(s).evidence.filter(x => ss.some(se => se.id === x.seasonId) && x.positiveBalance !== null); const average = (a) => { const v = a.filter((x) => x !== null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; }; const cap = (v) => Math.min(100, Math.round(v)); const observed = matchSummary(calendarStats(s, { careerId: cid }).matches.filter(x => x.competition && x.competition.toLowerCase() !== 'friendly')); const trophyScore = reviewed.length ? cap(winTrophies / reviewed.length * 100) : null; const matchScore = observed.winRate === null ? null : cap(observed.winRate * 100); const axes = [{ name: 'Sportsiker', value: average([trophyScore, matchScore]), detail: 'Trófea / értékelt teljes szezon és rögzített mérkőzések győzelmi aránya; részleges adat, kozmetikai mutató.' }, { name: 'Akadémia', value: debuts ? cap(debuts / 10 * 100) : null, detail: 'Igazolt debütálások; 10 = 100.' }, { name: 'Transzferek', value: balances.length ? cap(balances.filter(x => x.positiveBalance).length / balances.length * 100) : null, detail: 'Pozitív egyenlegű / igazolt szezonok.' }, { name: 'Identitás', value: average(hist.map(x => x.score)), detail: 'Elfogadott szezonális Identity Score átlaga.' }, { name: 'Taktika', value: average(hist.map(x => x.tactics)), detail: 'Rögzített taktikai önértékelések átlaga.' }, { name: 'Klubépítés', value: ss.some(se => g.prestige.some(x => x.seasonId === se.id)) ? cap(ups / 5 * 100) : null, detail: 'Presztízsemelkedések; 5 = 100.' }]; return { level, rank: managerRank(c.managerXP), xp: c.managerXP, nextXP: level === 30 ? null : level * 500, used, available: skillPoints(c.managerXP) - used, skills: sk, effective: effective(sk, eventModifiers(s, cid)), traits, axes, identity: hist, reviewed: reviewed.length, evidence: get(s).evidence.filter(x => ss.some(se => se.id === x.seasonId)) }; }
export const PRESTIGE_NAMES = ['Local Club', 'Established Club', 'National Elite', 'Continental Power', 'World Elite', 'Football Dynasty'];
export const PRESTIGE_REQUIREMENTS = ['Kiindulási szint', 'Feljutás VAGY hazai kupaelődöntő VAGY felsőházi helyezés', 'Bajnoki cím VAGY hazai kupagyőzelem VAGY 2 nemzetközi kvalifikáció', '2 élvonalbeli bajnoki cím VAGY nemzetközi kupa-negyeddöntő', 'Europa League-győzelem VAGY BL-elődöntő', '2 BL-cím VAGY 1 BL-cím + 3 élvonalbeli bajnoki cím'];
export const STADIUMS = [['Local Ground', '3–8 ezer'], ['Community Stadium', '8–15 ezer'], ['National Arena', '15–30 ezer'], ['Continental Arena', '30–50 ezer'], ['Football Cathedral', '50 ezer+']];
export function clubRpg(s, cid) { const c = byId(s.careers, cid), j = byId(s.journeys, c.journeyId), g = game(s), history = g.prestige.filter(x => s.seasons.some(z => z.id === x.seasonId && z.journeyId === j.id)).map(x => ({ ...x, date: byId(s.seasons, x.seasonId).end })); const start = g.seasonStart.find(x => s.seasons.some(z => z.id === x.seasonId && z.journeyId === j.id))?.prestige ?? j.prestige; const high = Math.max(start, j.prestige, ...history.map(x => Math.max(x.before, x.after))); return { level: j.prestige, highest: high, history, stadium: Math.max(stadiumUnlocked(high), g.stadiums.find(x => x.journeyId === j.id)?.level ?? 1), academyLevel: academyLevel(j.academyXP), academyXP: j.academyXP, academyNext: ACADEMY_THRESHOLDS[academyLevel(j.academyXP)] ?? null, adult: scoutLimit(j.prestige, true), youth: scoutLimit(academyLevel(j.academyXP)), sportMultiplier: [1.5, 1.4, 1.3, 1.2, 1.1, 1][(g.seasonStart.find(x => x.seasonId === c.seasonId)?.prestige ?? j.prestige) - 1] }; }
