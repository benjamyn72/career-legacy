import { need, integer } from './model.js';
export const PHILOSOPHIES = ['The Patriots', 'Regional Roots', 'Academy Builders', 'Talent Factory', 'Moneyball', 'Sleeping Giants', 'Underdogs', 'Galacticos', 'Global Football'];
const limits = [[4, 2, 6], [4, 2, 8], [2, 1, 10], [5, 3, 12], [5, 2, 6], [5, 3, 6], [4, 2, 6], [4, 2, 4], [6, 3, 8]];
export const PH_PRESSURE = [-10, -5, -10, 10, 5, 0, 5, -5, 0];
export function preset(primary, domestic, region = [], secondary = null) { const i = PHILOSOPHIES.indexOf(primary); need(i >= 0, 'Philosophy'); const [summer, winter, academy] = limits[i]; const r = { primary, secondary, domestic, region: [...new Set([domestic, ...region])], scoutCountries: null, signCountries: null, outsideRegionMax: null, summer, winter, academy, promotion: null, reportLimit: null, ageMax: null, ovrAboveAverage: null, budgetPct: null, wageMax: null, loanMax: null, domesticPct: null, regionalPct: null, homegrownPct: null, domesticCaptain: false, integrationMin: null, positiveBalance: false }; switch (primary) {
    case 'The Patriots':
        Object.assign(r, { domesticPct: 90, homegrownPct: 20, scoutCountries: [domestic], signCountries: [domestic], domesticCaptain: true });
        break;
    case 'Regional Roots':
        Object.assign(r, { regionalPct: 80, domesticPct: 50, scoutCountries: r.region, outsideRegionMax: 1 });
        break;
    case 'Academy Builders':
        Object.assign(r, { homegrownPct: 40, promotion: 5, integrationMin: 2 });
        break;
    case 'Talent Factory':
        Object.assign(r, { ageMax: 23, promotion: 6 });
        break;
    case 'Moneyball':
        Object.assign(r, { ageMax: 27, budgetPct: 80, positiveBalance: true });
        break;
    case 'Sleeping Giants':
        Object.assign(r, { domesticPct: 40, homegrownPct: 15 });
        break;
    case 'Underdogs':
        Object.assign(r, { ovrAboveAverage: 3, budgetPct: 70, loanMax: 3 });
        break;
} validateRule(r); return r; }
export function validateRule(r) { need(PHILOSOPHIES.includes(r.primary) && (r.secondary === null || PHILOSOPHIES.includes(r.secondary) && r.secondary !== r.primary), 'Philosophy'); need(typeof r.domestic === 'string' && r.domestic.trim().length > 0, 'Domestic'); for (const a of [r.region, r.scoutCountries, r.signCountries])
    if (a !== null)
        need(Array.isArray(a) && a.every(x => typeof x === 'string' && x.trim()) && new Set(a).size === a.length, 'Country list'); for (const n of [r.summer, r.winter, r.academy])
    integer(n, 0, 100); for (const n of [r.promotion, r.reportLimit, r.outsideRegionMax, r.wageMax, r.loanMax, r.integrationMin])
    if (n !== null)
        integer(n); if (r.ageMax !== null)
    integer(r.ageMax, 14, 60); if (r.ovrAboveAverage !== null)
    integer(r.ovrAboveAverage, 0, 99); for (const n of [r.domesticPct, r.regionalPct, r.homegrownPct, r.budgetPct])
    if (n !== null)
        integer(n, 0, 100); need(typeof r.domesticCaptain === 'boolean' && typeof r.positiveBalance === 'boolean', 'Rule flag'); }
export const blankSkills = () => ({ academy: 0, transfer: 0, tactical: 0, leader: 0 });
export function effective(sk, m = {}) { for (const x of Object.values(sk))
    integer(x, 0, 5); for (const x of Object.values(m))
    integer(x, -1000, 1000); const cap = (v, min, max) => Math.max(min, Math.min(v, max)); return { academyXP: cap(sk.academy * 5 + (m.academyXP ?? 0), 0, 75), adultSlots: cap((sk.transfer >= 4 ? 2 : sk.transfer >= 2 ? 1 : 0) + (m.adultSlots ?? 0), -100, 3), academySlots: cap((sk.academy >= 5 ? 2 : sk.academy >= 3 ? 1 : 0) + (m.academySlots ?? 0), -100, 4), pressureReduction: cap((sk.transfer >= 5 ? 15 : sk.transfer >= 3 ? 10 : sk.transfer >= 1 ? 5 : 0) + (m.pressureReduction ?? 0), 0, 30), protection: cap(2 + (sk.leader >= 5 ? 2 : sk.leader >= 3 ? 1 : 0) + (m.protection ?? 0), 0, 4), jokers: cap(sk.tactical + (m.jokers ?? 0), 0, 10), promotions: Math.max(-100, m.promotions ?? 0), identityXP: [0, 5, 10, 10, 20, 25][sk.leader], transferVeto: sk.transfer === 5 }; }
export function allowedScout(r, country, eaAvailable, exception = false) { return eaAvailable && (r.scoutCountries === null || r.scoutCountries.includes(country) || exception); }
export function identity(parts) { let total = 0, known = 0, value = 0; for (const p of parts) {
    need(typeof p.active === 'boolean' && Number.isFinite(p.weight) && p.weight >= 0, 'Identity weight');
    if (p.score !== null)
        need(Number.isFinite(p.score) && p.score >= 0 && p.score <= 100, 'Identity score');
    if (!p.active)
        continue;
    total += p.weight;
    if (p.score !== null) {
        known += p.weight;
        value += p.score * p.weight;
    }
} const score = known ? Math.floor(value / known) : null; return { score, coverage: total ? known / total : null, final: total > 0 && known === total, xp: total > 0 && known === total && score !== null ? (score >= 95 ? 300 : score >= 80 ? 200 : score >= 60 ? 100 : score >= 40 ? 25 : 0) : null }; }
export function quotaTarget(initial, target, completed) { integer(initial, 0, 100); integer(target, 0, 100); integer(completed); return initial >= target ? target : Math.ceil(initial + (target - initial) * Math.min(3, completed) / 3); }
export function matchDecision(x) { need(typeof x.required === 'boolean' && typeof x.joker === 'boolean' && typeof x.eaAllows === 'boolean', 'Match flags'); integer(x.minute, 1, 120); integer(x.difference, -99, 99); if (x.aggregate !== undefined)
    integer(x.aggregate, -99, 99); need(['league', 'derby', 'domesticCup', 'international', 'semiFinal', 'final'].includes(x.kind), 'Match kind'); if (!x.eaAllows || x.required || x.kind === 'final')
    return { allowed: false, jokerUsed: false, reason: 'hard-rule' }; const band = x.minute <= 45 ? 0 : x.minute <= 74 ? 1 : 2; const t = ({ league: [3, 2, 2], derby: [4, 3, 2], domesticCup: [4, 3, 2], international: [4, 4, 3], semiFinal: [null, 4, 3] })[x.kind][band]; const regular = t !== null && t !== undefined && Math.abs(x.difference) >= t && (x.aggregate === undefined || Math.sign(x.aggregate) === Math.sign(x.difference) && Math.abs(x.aggregate) >= t); return { allowed: regular || x.joker, jokerUsed: !regular && x.joker, reason: regular ? 'threshold' : x.joker ? 'joker' : 'threshold-not-met' }; }
export function scoutLimit(level, adult = false) { integer(level, 1, adult ? 6 : 5); return adult ? { count: [2, 3, 4, 5, 6, 6][level - 1], stars: [4, 5, 7, 8, 10, 10][level - 1] } : { count: [1, 2, 2, 3, 3][level - 1], stars: [3, 5, 7, 9, 10][level - 1] }; }
export function scoutStaffAllowed(level, scouts, eaMax, adult = false) { integer(eaMax, 0, 100); const l = scoutLimit(level, adult); return scouts.length <= Math.min(l.count, eaMax) && scouts.every(x => { integer(x.experience, 1, 5); integer(x.judgment, 1, 5); return x.experience + x.judgment <= l.stars; }); }
