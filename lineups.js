import { byId, need, canonical } from './model.js';
import { playerProfile, knownPlayerIds, seasonsIn } from './statistics.js';
export const FORMATIONS = {
    '4-3-3': [['GK'], ['LB', 'CB', 'CB', 'RB'], ['CDM', 'CM', 'CAM'], ['LW', 'ST', 'RW']],
    '4-4-2': [['GK'], ['LB', 'CB', 'CB', 'RB'], ['LM', 'CM', 'CM', 'RM'], ['ST', 'ST']],
    '4-2-3-1': [['GK'], ['LB', 'CB', 'CB', 'RB'], ['CDM', 'CDM'], ['LM', 'CAM', 'RM'], ['ST']],
    '5-3-2': [['GK'], ['LB', 'CB', 'CB', 'CB', 'RB'], ['CM', 'CDM', 'CM'], ['ST', 'ST']],
    '3-5-2': [['GK'], ['CB', 'CB', 'CB'], ['LM', 'CM', 'CDM', 'CM', 'RM'], ['ST', 'ST']],
    '5-4-1': [['GK'], ['LB', 'CB', 'CB', 'CB', 'RB'], ['LM', 'CM', 'CM', 'RM'], ['ST']]
};
const aliases = { GK: ['GK'], LB: ['LB', 'LWB'], RB: ['RB', 'RWB'], CB: ['CB'], CDM: ['CDM', 'CM'], CM: ['CM', 'CDM', 'CAM'], CAM: ['CAM', 'CM', 'CF'], LM: ['LM', 'LW', 'LWB'], RM: ['RM', 'RW', 'RWB'], LW: ['LW', 'LM'], RW: ['RW', 'RM'], ST: ['ST', 'CF'] };
export const lineupKey = (k) => canonical([k.journeyId, k.kind, k.seasonId, k.nationality]);
export function lineupScope(s, k) { byId(s.journeys, k.journeyId); need(['season', 'all-time', 'academy', 'national'].includes(k.kind), 'Invalid lineup type'); need((k.kind === 'season') === (k.seasonId !== null) && (k.kind === 'national') === (k.nationality !== null), 'Invalid lineup filters'); if (k.seasonId !== null)
    need(byId(s.seasons, k.seasonId).journeyId === k.journeyId, 'Wrong lineup season'); if (k.nationality !== null)
    need(typeof k.nationality === 'string' && k.nationality.trim().length > 0, 'Nationality required'); return k.seasonId ? { seasonId: k.seasonId, journeyId: k.journeyId } : { journeyId: k.journeyId }; }
export function lineupCandidates(s, k) { const q = lineupScope(s, k); const ids = [...new Set(seasonsIn(s, q).flatMap(x => knownPlayerIds(s, x.id)))]; return ids.map(id => playerProfile(s, id, q)).filter(p => (k.kind !== 'academy' || p.homegrown) && (k.kind !== 'national' || p.player.nationality === k.nationality)).map(p => ({ playerId: p.player.id, name: p.player.name, position: p.history.filter(x => x.position !== null).at(-1)?.position ?? null, apps: p.totals.apps.value, ovr: p.history.filter(x => x.ovr !== null).at(-1)?.ovr ?? null })).sort((a, b) => a.name.localeCompare(b.name) || a.playerId.localeCompare(b.playerId)); }
export function validateLineup(s, l, strict = true) { need(Object.hasOwn(FORMATIONS, l.formation), 'Unknown formation'); lineupScope(s, l); const cid = byId(s.journeys, l.journeyId).careerId; const available = new Set(strict ? lineupCandidates(s, l).map(x => x.playerId) : s.players.filter(p => p.careerId === cid).map(x => x.id)); need(Array.isArray(l.playerIds) && l.playerIds.length === 11, 'Expected 11 slots'); const ids = l.playerIds.filter(x => x !== null); need(ids.length === new Set(ids).size && ids.every(id => available.has(id)), 'Duplicate or out-of-scope lineup player'); }
export function suggestLineup(s, k, formation = '4-3-3') { need(Object.hasOwn(FORMATIONS, formation), 'Unknown formation'); const a = lineupCandidates(s, k), used = new Set(); const playerIds = FORMATIONS[formation].flat().map(slot => { const p = a.filter(x => !used.has(x.playerId) && x.position !== null && (aliases[slot] ?? [slot]).includes(x.position) && x.apps !== null && x.apps > 0 && x.ovr !== null).sort((a, b) => b.ovr - a.ovr || b.apps - a.apps || a.playerId.localeCompare(b.playerId))[0]; if (p)
    used.add(p.playerId); return p?.playerId ?? null; }); return { ...k, formation, playerIds }; }
export function savedLineup(s, k) { return (s.legacy?.lineups ?? []).find(x => lineupKey(x) === lineupKey(k)); }
