import { integer, need } from './model.js';
export function playerTraits(x) {
    for (const v of [x.age, x.ovrStart, x.ovrEnd, x.apps, x.teamMatches, x.priorApps, x.priorTeamMatches, x.goals, x.assists, x.cleanSheets, x.clubApps])
        if (v !== null)
            integer(v);
    integer(x.fullSeasons);
    const ratio = (a, b) => a !== null && b !== null && b > 0 && a <= b ? a / b : null;
    const p = ratio(x.apps, x.teamMatches), prior = ratio(x.priorApps, x.priorTeamMatches);
    const delta = x.ovrStart !== null && x.ovrEnd !== null ? x.ovrEnd - x.ovrStart : null;
    const n = (a, b) => a !== null && a >= b;
    return [
        ['Rising Star', x.age !== null && x.age <= 21 && n(delta, 5)], ['Goal Machine', n(x.goals, 25)], ['Creative Genius', n(x.assists, 15)], ['Iron Man', n(p, .9)], ['Mr. Reliable', n(p, .8) && n(prior, .8)], ['The Wall', x.goalkeeper === true && n(x.cleanSheets, 15)], ['Late Bloomer', x.age !== null && x.age >= 28 && n(delta, 4)], ['One of Our Own', x.homegrown === true && n(x.clubApps, 100)], ['Veteran', n(x.age, 33) && n(x.clubApps, 150)], ['Living Legend', x.fullSeasons >= 4 && n(x.clubApps, 150)]
    ].filter(([, v]) => v).map(([k]) => k);
}
export function difficultySuggestion(wins, played) { if (wins === null || played === null || played === 0)
    return null; integer(wins); integer(played, 1); need(wins <= played, 'Wins exceed matches'); const p = wins / played; return p > .85 ? 'increase' : p >= .70 ? 'review-up' : p >= .35 ? 'keep' : p >= .20 ? 'review-down' : 'decrease'; }
export function hierarchy(role, captain) { return captain ? 'Leaders' : role === 'Crucial' || role === 'Important' ? 'Core' : role === 'Rotation' || role === 'Sporadic' ? 'Rotation' : role === 'Prospect' ? 'Prospects' : null; }
