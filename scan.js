import { byId, need, canonical, date, integer, label, key } from './model.js';
const kinds = ['status', 'stats', 'attributes', 'financial', 'league', 'calendar', 'youth', 'transfer'];
const fields = { status: ['name', 'pos', 'number', 'ovr', 'role'], stats: ['name', 'pos', 'apps', 'goals', 'assists', 'clean_sheets'], attributes: ['name', 'pos', 'age', 'ovr', 'plan'], financial: ['name', 'pos', 'age', 'value', 'wage', 'contract'], league: ['club', 'rank', 'played', 'won', 'draw', 'lost', 'gf', 'ga', 'gd', 'points'], calendar: ['date', 'gf', 'ga', 'outcome', 'competition', 'opponent', 'venue'], youth: ['name', 'pos', 'age', 'ovr', 'potential_min', 'potential_max', 'plan'], transfer: ['name', 'date', 'from', 'to', 'fee'] };
export function manualDraft(kind, rowCount, sourceHash, month = null) { need(kinds.includes(kind) && /^[a-f0-9]{64}$/.test(sourceHash), 'Invalid manual source'); integer(rowCount, 1, 100); if (kind === 'calendar') {
    need(month !== null, 'Calendar month required');
    date(month + '-01');
}
else
    need(month === null, 'Unexpected month'); return { kind, sourceHash, filename: 'Manual entry', month, unresolved: 0, rows: Array.from({ length: rowCount }, (_, sourceRow) => ({ sourceRow, cells: Object.fromEntries(fields[kind].map(f => [f, null])), warnings: ['Manual entry – not OCR'], raw: {} })) }; }
export const scanState = (s) => s.scan ?? { version: 1, records: [], batches: [] };
const playerKinds = ['status', 'stats', 'attributes', 'financial', 'youth'];
const numeric = new Set(['number', 'ovr', 'age', 'apps', 'goals', 'assists', 'clean_sheets', 'rank', 'played', 'won', 'draw', 'lost', 'gf', 'ga', 'gd', 'points', 'potential_min', 'potential_max', 'value', 'wage', 'fee']);
const moneyFields = new Set(['value', 'wage', 'fee']);
const text = (v) => typeof v === 'string' && v.trim() ? v.trim() : null;
function parseNumber(s, signed = false) { return (signed ? /^-?\d+$/ : /^\d+$/).test(s.trim()) ? Number(s) : null; }
export function parseMoney(raw) { const s = raw.trim().replace(/\s/g, '').replace(/^[€$£]/, ''); const m = /^(\d+(?:[.,]\d+)?)([KM])?$/i.exec(s); if (!m)
    return null; const n = Number(m[1].replace(',', '.')) * (m[2]?.toUpperCase() === 'M' ? 1e6 : m[2]?.toUpperCase() === 'K' ? 1e3 : 1); return Number.isSafeInteger(n) && n >= 0 ? n : null; }
export function normalizeReview(input) {
    const envelope = input;
    need(envelope?.format === 'cl-scan-review-v1' && Array.isArray(envelope.documents) && envelope.documents.length <= 100, 'Invalid review package');
    return envelope.documents.map((d) => {
        need(kinds.includes(d.kind) && /^[a-f0-9]{64}$/.test(d.sourceHash) && typeof d.filename === 'string', 'Invalid source');
        const k = d.kind;
        const source = k === 'calendar' ? d.calendar?.matches : d.rows;
        need(Array.isArray(source) && source.length <= 300, 'Invalid source rows');
        const month = k === 'calendar' ? text(d.calendar.month) : null;
        const unresolved = k === 'calendar' ? d.calendar.unresolved?.length : 0;
        integer(unresolved, 0, 300);
        const rows = source.map((r, i) => {
            const cells = {}, warnings = [];
            if (k === 'calendar') {
                for (const f of fields[k])
                    cells[f] = r[f === 'venue' ? 'home_away' : f] ?? null;
                warnings.push('Calendar result and date require review; opponent and venue may be unknown.');
            }
            else {
                for (const f of fields[k]) {
                    const raw = r[f]?.raw ?? '';
                    cells[f] = moneyFields.has(f) ? parseMoney(raw) : numeric.has(f) ? parseNumber(raw, f === 'gd') : text(raw);
                    if (r[f] && (r[f].confidence < 85 || r[f].review_required || moneyFields.has(f)))
                        warnings.push(f);
                }
                if (k === 'youth') {
                    const m = /^(\d+)\s*[-–]\s*(\d+)$/.exec(r.potential?.raw ?? '');
                    cells.potential_min = m ? +m[1] : null;
                    cells.potential_max = m ? +m[2] : null;
                    if (!m || r.potential?.confidence < 85)
                        warnings.push('potential');
                }
                if (k === 'transfer') {
                    cells.name = text([r.first?.raw, r.last?.raw].filter(Boolean).join(' '));
                    cells.date = null;
                    warnings.push('date: resolve year from season; original ' + (r.day_month?.raw ?? ''), 'name: verify spelling');
                }
            }
            for (const f of fields[k])
                if (cells[f] === null)
                    warnings.push(f + ': unknown');
            return { sourceRow: i, cells, warnings, raw: k === 'calendar' ? {} : r };
        });
        return { sourceHash: d.sourceHash, filename: d.filename, kind: k, rows, unresolved, month };
    });
}
export function normalizeAssisted(input) {
    const e = input;
    need(e?.format === 'cl-assisted-scan-v1' && e.context && Array.isArray(e.documents) && e.documents.length > 0 && e.documents.length <= 100, 'Invalid assisted scan package');
    const c = e.context;
    label(c.edition);
    label(c.club);
    need(c.observedOn === null || typeof c.observedOn === 'string', 'Observation date required or null');
    if (c.observedOn !== null)
        date(c.observedOn);
    need(c.currency === null || typeof c.currency === 'string' && /^[A-Z]{3}$/.test(c.currency), 'Invalid currency');
    if (c.seasonLabel !== null)
        label(c.seasonLabel);
    const seen = new Set();
    const documents = e.documents.map((d) => {
        need(d && kinds.includes(d.kind) && typeof d.sourceHash === 'string' && /^[a-f0-9]{64}$/.test(d.sourceHash) && !seen.has(d.sourceHash), 'Invalid/duplicate source');
        seen.add(d.sourceHash);
        label(d.filename);
        const k = d.kind;
        need(Array.isArray(d.rows) && d.rows.length > 0 && d.rows.length <= 300, 'Empty/large assisted document');
        if (k === 'calendar') {
            need(typeof d.month === 'string' && /^\d{4}-\d{2}$/.test(d.month), 'Calendar month required');
            date(d.month + '-01');
        }
        else
            need(d.month === null, 'Unexpected month');
        const rows = d.rows.map((r, i) => { need(r?.cells && typeof r.cells === 'object' && !Array.isArray(r.cells), 'Invalid assisted row'); need(Object.keys(r.cells).sort().join(',') === [...fields[k]].sort().join(','), 'Unexpected/missing fields'); const cells = {}; const warnings = ['Externally transcribed; verify against source']; for (const f of fields[k]) {
            const v = r.cells[f];
            if (v === null)
                warnings.push(f + ': unknown');
            else if (numeric.has(f))
                integer(v, f === 'gd' ? -9999 : 0, moneyFields.has(f) ? 1e12 : 99999);
            else
                label(v);
            cells[f] = v;
        } if (r.warnings !== undefined) {
            need(Array.isArray(r.warnings) && r.warnings.length <= 30, 'Invalid warnings');
            for (const w of r.warnings) {
                label(w);
                warnings.push(w);
            }
        } return { sourceRow: i, cells, warnings, raw: {} }; });
        return { kind: k, sourceHash: d.sourceHash, filename: d.filename, month: d.month, rows, unresolved: 0 };
    });
    return { context: { edition: c.edition, club: c.club, observedOn: c.observedOn, currency: c.currency, seasonLabel: c.seasonLabel }, documents };
}
export function assertAssistedScope(s, careerId, ctx, allowFuturePreview = false) { const c = byId(s.careers, careerId), se = byId(s.seasons, c.seasonId), j = byId(s.journeys, c.journeyId); need(c.edition.toLowerCase() === ctx.edition.toLowerCase() && j.club.trim().toLowerCase() === ctx.club.trim().toLowerCase(), 'Assisted package edition/club does not match selected career'); if (ctx.observedOn !== null)
    need(ctx.observedOn >= se.joined && ctx.observedOn <= (se.left ?? se.end) && (allowFuturePreview || ctx.observedOn <= c.gameDate), 'Assisted observation date outside selected season/game time'); }
function cellCheck(k, c) {
    need(Object.keys(c).sort().join(',') === [...fields[k]].sort().join(','), 'Unexpected/missing fields');
    for (const [f, v] of Object.entries(c)) {
        if (v === null)
            continue;
        if (numeric.has(f)) {
            integer(v, f === 'gd' ? -9999 : 0, moneyFields.has(f) ? 1e12 : 99999);
            if (['ovr', 'potential_min', 'potential_max'].includes(f))
                integer(v, 1, 99);
            if (f === 'age')
                integer(v, 14, 60);
            if (f === 'rank')
                integer(v, 1, 300);
            if (f === 'number')
                integer(v, 1, 99);
        }
        else
            label(v);
    }
    if (playerKinds.includes(k) || k === 'transfer')
        label(c.name);
    if (k === 'league') {
        label(c.club);
        const [p, w, d, l, gf, ga, gd] = [c.played, c.won, c.draw, c.lost, c.gf, c.ga, c.gd];
        if ([p, w, d, l].every(x => typeof x === 'number'))
            need(p === w + d + l, 'WDL mismatch');
        if ([gf, ga, gd].every(x => typeof x === 'number'))
            need(gd === gf - ga, 'Goal difference mismatch');
    }
    if (k === 'stats' && c.apps !== null && c.clean_sheets !== null)
        need(c.clean_sheets <= c.apps, 'Clean sheets exceed appearances');
    if (k === 'youth' && c.potential_min !== null && c.potential_max !== null)
        need(c.potential_min <= c.potential_max, 'Potential bounds');
    if (k === 'calendar') {
        date(c.date);
        integer(c.gf, 0, 99);
        integer(c.ga, 0, 99);
        need(c.outcome === (Number(c.gf) > Number(c.ga) ? 'W' : Number(c.gf) < Number(c.ga) ? 'L' : 'D'), 'Outcome mismatch; penalty shootouts unsupported');
        need([null, 'home', 'away'].includes(c.venue), 'Venue');
    }
    ;
    if (k === 'transfer') {
        date(c.date);
        label(c.from);
        label(c.to);
        need(c.from !== c.to, 'Same transfer clubs');
    }
}
function patch(list, next) { const old = list.find(x => x.id === next.id); if (old)
    Object.assign(old, next);
else
    list.push(next); }
function recordId(q, k, e) { return JSON.stringify([q.seasonId, k, k === 'calendar' || k === 'transfer' ? '' : q.observedOn, e]); }
export function performScan(s, q, close) {
    const c = byId(s.careers, q.careerId), se = byId(s.seasons, q.seasonId);
    need(c.status === 'Active' && se.careerId === c.id && q.confirmed === true, 'Confirm active career and season');
    date(q.observedOn);
    need(q.observedOn >= se.joined && q.observedOn <= (se.left ?? se.end) && q.observedOn <= c.gameDate, 'Observation outside season');
    need(q.currency === null || /^[A-Z]{3}$/.test(q.currency), 'Currency');
    need(q.documents.length > 0 && q.documents.length <= 100, 'Empty/large batch');
    const ss = s.scan ?? (s.scan = scanState(s));
    const batchKey = canonical([c.id, se.id, q.observedOn, q.currency, q.documents]);
    if (ss.batches.some(b => canonical([b.careerId, b.seasonId, b.observedOn, b.currency, b.documents]) === batchKey)) {
        need(q.closeMonth === null || s.closures.some(x => x.careerId === c.id && x.month === q.closeMonth), 'Close month separately after duplicate');
        return;
    }
    const seen = new Set();
    let closeImport = null;
    const batchID = `scanbatch:${ss.batches.length + 1}`;
    for (const d of q.documents) {
        need(kinds.includes(d.kind) && /^[a-f0-9]{64}$/.test(d.sourceHash) && !seen.has(d.sourceHash), 'Duplicate/invalid source');
        seen.add(d.sourceHash);
        label(d.filename);
        need(d.unresolved === 0, 'Unresolved OCR rows require resolution or a new scan');
        need(d.rows.length > 0 && d.rows.length <= 300, 'Empty/large document');
        const rowNums = new Set();
        for (const i of d.omitted) {
            integer(i, 0, 299);
            need(!rowNums.has(i), 'Duplicate omitted row');
            rowNums.add(i);
        }
        const entitySeen = new Set();
        const prior = (d.kind === 'calendar' && s.imports.some(x => x.careerId === c.id && x.seasonId === se.id && x.sourceHash === d.sourceHash)) || ss.batches.some(b => b.careerId === c.id && b.seasonId === se.id && b.documents.some(x => x.sourceHash === d.sourceHash));
        need(!prior || d.correction, 'Source already imported; explicit correction required');
        if (d.kind === 'calendar') {
            need(d.month !== null && d.month < c.gameDate.slice(0, 7), 'Calendar month must be completed');
        }
        else
            need(d.month === null, 'Unexpected month');
        const matchIds = [];
        for (const r of d.rows) {
            integer(r.sourceRow, 0, 299);
            need(!rowNums.has(r.sourceRow), 'Duplicate row');
            rowNums.add(r.sourceRow);
            key(r.entityId);
            need(!entitySeen.has(r.entityId), 'Duplicate entity in document');
            entitySeen.add(r.entityId);
            cellCheck(d.kind, r.cells);
            const v = r.cells;
            if (playerKinds.includes(d.kind)) {
                let p = s.players.find(p => p.id === r.entityId);
                if (!p) {
                    need(r.newPlayer === true, 'Explicit new player required');
                    p = { id: r.entityId, careerId: c.id, name: v.name, nationality: null };
                    s.players.push(p);
                }
                need(p.careerId === c.id, 'Cross-career player');
                if (d.kind === 'stats') {
                    const old = s.stats.find(x => x.playerId === p.id && x.seasonId === se.id && x.scope === 'total');
                    const next = { id: old?.id ?? `scanstat:${ss.records.length + 1}`, playerId: p.id, seasonId: se.id, scope: 'total', apps: v.apps, goals: v.goals, assists: v.assists, cleanSheets: v.clean_sheets };
                    if (old && !d.correction)
                        for (const f of ['apps', 'goals', 'assists', 'cleanSheets'])
                            need(next[f] === null || old[f] === null || next[f] === old[f] || !ss.records.some(x => x.kind === 'stats' && x.entityId === p.id && x.seasonId === se.id && x.observedOn >= q.observedOn), 'Same/older stats need explicit correction');
                    if (old)
                        for (const f of ['apps', 'goals', 'assists', 'cleanSheets'])
                            if (next[f] === null)
                                next[f] = old[f];
                    need(!ss.records.some(x => x.kind === 'stats' && x.entityId === p.id && x.seasonId === se.id && x.observedOn > q.observedOn), 'Older stats cannot overwrite latest total');
                    patch(s.stats, next);
                }
                else {
                    const old = s.snapshots.find(x => x.playerId === p.id && x.seasonId === se.id && x.date === q.observedOn);
                    const next = { id: old?.id ?? `scansnapshot:${ss.records.length + 1}`, playerId: p.id, seasonId: se.id, date: q.observedOn, ovr: old?.ovr ?? null, age: old?.age ?? null, position: old?.position ?? null, value: old?.value ?? null, currency: old?.currency ?? null };
                    for (const [f, source] of [['ovr', 'ovr'], ['age', 'age'], ['position', 'pos'], ['value', 'value']]) {
                        const nv = v[source];
                        if (nv !== null && nv !== undefined) {
                            need(next[f] === null || next[f] === nv || d.correction, 'Conflicting snapshot field; review correction');
                            Object.assign(next, { [f]: nv });
                            if (f === 'value') {
                                need(q.currency !== null, 'Currency required');
                                need(next.currency === null || next.currency === q.currency || d.correction, 'Currency conflict');
                                next.currency = q.currency;
                            }
                        }
                    }
                    patch(s.snapshots, next);
                }
            }
            if (d.kind === 'calendar') {
                const day = v.date;
                need(day.slice(0, 7) === d.month && day >= se.joined && day <= (se.left ?? se.end) && day <= q.observedOn, 'Calendar date outside target month/season/observation');
                const old = s.matches.find(x => x.id === r.entityId);
                need(!old || old.careerId === c.id && old.seasonId === se.id && old.date === day, 'Match identity conflict');
                need(!s.matches.some(x => x.careerId === c.id && x.date === day && x.id !== r.entityId), 'Use existing match ID');
                const next = { id: r.entityId, careerId: c.id, seasonId: se.id, date: day, gf: v.gf, ga: v.ga, opponent: v.opponent ?? old?.opponent ?? null, competition: v.competition ?? old?.competition ?? null, venue: v.venue ?? old?.venue ?? null, source: d.sourceHash };
                need(!old || d.correction || old.gf === next.gf && old.ga === next.ga, 'Score correction needs confirmation');
                patch(s.matches, next);
                matchIds.push(r.entityId);
            }
            if (d.kind === 'transfer') {
                const day = v.date;
                need(day >= se.joined && day <= (se.left ?? se.end) && day <= q.observedOn, 'Transfer date out of scope');
                need(v.fee === null || q.currency !== null, 'Currency required');
                need(!ss.records.some(x => x.kind === 'transfer' && x.seasonId === se.id && x.entityId !== r.entityId && x.cells.date === v.date && x.cells.name === v.name && x.cells.from === v.from && x.cells.to === v.to), 'Possible duplicate transfer: use stable ID');
            }
            const id = recordId(q, d.kind, r.entityId), old = ss.records.find(x => x.id === id);
            need(!old || d.correction || canonical(old.cells) === canonical(v), 'Existing observation requires explicit correction');
            patch(ss.records, { id, careerId: c.id, seasonId: se.id, observedOn: q.observedOn, kind: d.kind, entityId: r.entityId, cells: structuredClone(v), sourceHash: d.sourceHash, sourceRow: r.sourceRow, currency: q.currency });
        }
        if (d.kind === 'calendar') {
            const found = s.imports.find(x => x.careerId === c.id && x.seasonId === se.id && x.sourceHash === d.sourceHash);
            const importId = found?.id ?? `scanimport:${ss.batches.length + 1}:${seen.size}`;
            if (found)
                found.matchIds = matchIds;
            else
                s.imports.push({ id: importId, careerId: c.id, seasonId: se.id, sourceHash: d.sourceHash, kind: 'calendar', matchIds });
            if (q.closeMonth === d.month)
                closeImport = importId;
        }
    }
    ss.batches.push({ id: batchID, careerId: c.id, seasonId: se.id, observedOn: q.observedOn, currency: q.currency, documents: structuredClone(q.documents) });
    if (q.closeMonth !== null) {
        need(closeImport, 'Monthly close requires matching reviewed calendar');
        close(closeImport);
    }
}
export function validateScan(s) { if (!s.scan)
    return; const ss = s.scan; need(ss.version === 1 && Array.isArray(ss.records) && Array.isArray(ss.batches), 'Scan schema'); const ids = new Set(); for (const r of ss.records) {
    need(!ids.has(r.id), 'Duplicate scan record');
    ids.add(r.id);
    need(kinds.includes(r.kind) && byId(s.seasons, r.seasonId).careerId === r.careerId && /^[a-f0-9]{64}$/.test(r.sourceHash), 'Scan scope');
    date(r.observedOn);
    cellCheck(r.kind, r.cells);
    if (playerKinds.includes(r.kind))
        need(byId(s.players, r.entityId).careerId === r.careerId, 'Scan player scope');
    need(ss.batches.some(b => b.careerId === r.careerId && b.seasonId === r.seasonId && b.observedOn === r.observedOn && b.documents.some(d => d.sourceHash === r.sourceHash && d.rows.some(x => x.sourceRow === r.sourceRow && x.entityId === r.entityId && canonical(x.cells) === canonical(r.cells)))), 'Missing source provenance');
} for (const b of ss.batches) {
    need(byId(s.seasons, b.seasonId).careerId === b.careerId, 'Batch scope');
    date(b.observedOn);
} canonical(ss); }
