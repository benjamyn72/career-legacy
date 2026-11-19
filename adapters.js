import { byId, need, date, month, integer } from './model.js';
export const editions = { FC26: { id: 'FC26', calendar: 'WP00-V0.2-reference', ocr: 'calibration-only' }, FC27: { id: 'FC27', calendar: null, ocr: 'unverified' } };
export function editionProfile(id) { return id === 'FC26' || id === 'FC27' ? editions[id] : { id, calendar: null, ocr: 'manual-only' }; }
export function activeWindows(s, careerId) { const c = byId(s.careers, careerId); return byId(s.seasons, c.seasonId).windows.filter(w => w.start <= c.gameDate && c.gameDate <= w.end); }
// Consumes an already-reviewed payload; no OCR or automatic approval in the browser.
export function calendarCommand(s, payload, ctx) {
    const c = byId(s.careers, ctx.careerId);
    const se = byId(s.seasons, ctx.seasonId);
    need(se.careerId === c.id && ctx.confirmed === true, 'Review confirmation required');
    month(payload.month);
    need(payload.unresolved.length === 0, 'Resolve calendar rows first');
    need(payload.month < c.gameDate.slice(0, 7), 'Month not completed');
    const rows = payload.matches.map(r => { date(r.date); integer(r.gf, 0, 99); integer(r.ga, 0, 99); need(r.date.slice(0, 7) === payload.month, 'Month mismatch'); need(r.outcome === (r.gf > r.ga ? 'W' : r.gf < r.ga ? 'L' : 'D'), 'Score/outcome mismatch; penalties unsupported'); const id = ctx.ids[r.date]; need(id, 'Stable identity selection needed'); return { id, careerId: c.id, seasonId: se.id, date: r.date, gf: r.gf, ga: r.ga, competition: r.competition, opponent: r.opponent, venue: r.home_away }; });
    return { type: 'importCalendar', careerId: c.id, seasonId: se.id, sourceHash: ctx.sourceHash, importId: ctx.importId, confirmed: true, matches: rows };
}
