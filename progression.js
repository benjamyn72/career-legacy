import { need, integer } from './model.js';
export const ACADEMY_THRESHOLDS = [0, 100, 300, 650, 1200];
export const academyLevel = (xp) => { integer(xp); return ACADEMY_THRESHOLDS.filter(v => xp >= v).length; };
export const managerLevel = (xp) => { integer(xp); return 1 + Math.min(29, Math.floor(xp / 500)); };
export const skillPoints = (xp) => Math.floor(managerLevel(xp) / 2);
export const managerRank = (xp) => { const n = managerLevel(xp); return n === 30 ? 'Immortal' : n >= 26 ? 'Football Legend' : n >= 21 ? 'Elite' : n >= 16 ? 'Master Tactician' : n >= 11 ? 'Established' : n >= 6 ? 'Rising Manager' : 'Rookie'; };
export const ACADEMY_XP = { debut: 25, ovr70: 50, ovr80: 100, ovr90: 250, apps50: 75, apps100: 150, apps200: 250, nationalDebut: 150, captain: 100, playerOfSeason: 75, goldenBoy: 50, legend: 200 };
export const MANAGER_YOUTH = { debut: 50, ovr80: 150, ovr90: 300, captain: 100, legend: 200 };
export const SPORT_XP = { promotion: 350, league: 500, domesticCup: 300, supercup: 100, qualification: 200, conference: 500, europa: 750, champions: 1000 };
export function sportXP(kind, prestige) { integer(prestige, 1, 6); need(Object.hasOwn(SPORT_XP, kind), 'Unknown sport reward'); return Math.round(SPORT_XP[kind] * [1.5, 1.4, 1.3, 1.2, 1.1, 1][prestige - 1]); }
export function loyalty(seasons, apps) { integer(seasons); if (apps !== null)
    integer(apps); if (seasons >= 4 && apps !== null && apps >= 150)
    return { name: 'Club Legend', reduction: 30 }; if (seasons >= 3 && apps !== null && apps >= 100)
    return { name: 'Club Icon', reduction: 20 }; if (seasons >= 2 && apps !== null && apps >= 50)
    return { name: 'Fan Favourite', reduction: 10 }; if (seasons >= 1)
    return { name: 'Established', reduction: 5 }; return { name: 'Newcomer', reduction: 0 }; }
export function prestigeNext(level, f) { integer(level, 1, 6); for (const k of ['qualifications', 'topFlightTitles', 'championsTitles', 'badSeasons'])
    integer(f[k]); for (const k of ['promotion', 'cupSemi', 'topHalf', 'league', 'domesticCup', 'continentalQF', 'europa', 'championsSemi', 'relegated'])
    need(typeof f[k] === 'boolean', 'Invalid prestige fact'); if (f.relegated || f.badSeasons >= 2)
    return Math.max(1, level - 1); const up = [f.promotion || f.cupSemi || f.topHalf, f.league || f.domesticCup || f.qualifications >= 2, f.topFlightTitles >= 2 || f.continentalQF, f.europa || f.championsSemi, f.championsTitles >= 2 || f.championsTitles >= 1 && f.topFlightTitles >= 3][level - 1]; return level + (up ? 1 : 0); }
export function stadiumUnlocked(prestige) { integer(prestige, 1, 6); return Math.min(5, prestige); }
