import { need, integer } from './model.js';
import { PHILOSOPHIES, PH_PRESSURE } from './rules.js';
import { loyalty } from './progression.js';
export function pressure(x, prestige, philosophy, reduction) { integer(prestige, 1, 6); integer(x.buyerPrestige, 1, 6); integer(x.offer); integer(x.value, 1); integer(reduction, 0, 30); if (x.contractMonths !== null)
    integer(x.contractMonths); const i = PHILOSOPHIES.indexOf(philosophy); need(i >= 0, 'Philosophy'); for (const k of ['strongerLeague', 'unhappy', 'lowMinutes', 'homegrown', 'captain', 'keyPlayer', 'firstSeason', 'international', 'lastThreeDays'])
    need(typeof x[k] === 'boolean', 'Offer flag'); const ratio = x.offer / x.value, loy = loyalty(x.fullSeasons, x.clubApps); const diff = x.buyerPrestige - prestige; const points = { prestige: Math.max(0, Math.min(3, diff)) * 15, league: x.strongerLeague ? 15 : 0, offer: ratio >= 2 ? 35 : ratio >= 1.5 ? 20 : ratio >= 1 ? 10 : 0, contract: x.contractMonths !== null && x.contractMonths < 12 ? 15 : 0, unhappy: x.unhappy ? 20 : 0, minutes: x.lowMinutes ? 10 : 0, homegrown: x.homegrown ? -10 : 0, captain: x.captain ? -15 : 0, key: x.keyPlayer ? -10 : 0, first: x.firstSeason ? -20 : 0, europe: x.international ? -10 : 0, late: x.lastThreeDays ? -15 : 0, loyalty: -loy.reduction, philosophy: PH_PRESSURE[i], modifier: -reduction }; const score = Math.max(0, Math.min(100, Object.values(points).reduce((a, b) => a + b, 0))); return { score, points, min: x.value, target: Math.ceil(x.value * 1.2), band: score < 25 ? 'free' : score < 50 ? 'optional' : score < 75 ? 'negotiate' : 'forced' }; }
export function forcedDecision(x, prestige, r, reduction, protectedPlayer, departures, windowType, eaForced = false) { const p = pressure(x, prestige, r.primary, reduction); const cap = windowType === 'summer' ? 2 : 1; const blocked = protectedPlayer || departures.length >= cap || departures.some(d => d.position === x.position); return { ...p, required: eaForced || (!blocked && p.score >= 75 && x.offer >= x.value), negotiate: !eaForced && !blocked && p.score >= 50, blocked: !eaForced && blocked, eaForced }; }
export function signingCheck(r, x, slots, eaAllows, geoException = false) { integer(slots); integer(x.outsideUsed); integer(x.loansUsed); need(typeof x.loan === 'boolean' && typeof eaAllows === 'boolean', 'Signing flags'); for (const n of [x.age, x.ovr, x.fee, x.budget, x.spent, x.wage])
    if (n !== null)
        integer(n); if (x.averageOVR !== null)
    need(Number.isFinite(x.averageOVR) && x.averageOVR >= 1 && x.averageOVR <= 99, 'Squad average'); const denied = [], unknown = []; if (!eaAllows)
    denied.push('EA limitation'); if (slots === 0)
    denied.push('No signing slot'); if (!geoException) {
    if (r.signCountries !== null) {
        if (x.country === null)
            unknown.push('Nationality');
        else if (!r.signCountries.includes(x.country))
            denied.push('Nationality');
    }
    if (r.outsideRegionMax !== null) {
        if (x.country === null)
            unknown.push('Region');
        else if (!r.region.includes(x.country) && x.outsideUsed >= r.outsideRegionMax)
            denied.push('Region quota');
    }
} if (r.ageMax !== null) {
    if (x.age === null)
        unknown.push('Age');
    else if (x.age > r.ageMax)
        denied.push('Age');
} if (r.ovrAboveAverage !== null) {
    if (x.ovr === null || x.averageOVR === null)
        unknown.push('OVR');
    else if (x.ovr > x.averageOVR + r.ovrAboveAverage)
        denied.push('OVR');
} if (r.budgetPct !== null) {
    if (x.fee === null || x.spent === null || x.budget === null)
        unknown.push('Budget');
    else if (x.fee + x.spent > x.budget * r.budgetPct / 100)
        denied.push('Budget');
} if (r.wageMax !== null) {
    if (x.wage === null)
        unknown.push('Wage');
    else if (x.wage > r.wageMax)
        denied.push('Wage');
} if (x.loan && r.loanMax !== null && x.loansUsed >= r.loanMax)
    denied.push('Loan limit'); return { allowed: denied.length === 0 && unknown.length === 0, denied, unknown }; }
