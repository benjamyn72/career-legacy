import { empty, validate, canonical, need } from './model.js';
import { apply } from './commands.js';
const MAX = 20 * 1024 * 1024;
export async function sha256(s) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(d), v => v.toString(16).padStart(2, '0')).join(''); }
export async function encodeBackup(s) { validate(s); const body = structuredClone(s); const b = { format: 'career-legacy-core', schema: 1, app: 'WP06.0.1', sha256: await sha256(canonical(body)), state: body }; return JSON.stringify(b); }
export async function decodeBackup(raw) { need(new TextEncoder().encode(raw).length <= MAX, 'Backup too large'); const b = JSON.parse(raw); need(b.format === 'career-legacy-core' && b.schema === 1 && (b.app === 'WP06.0.1' || (String(b.app) === 'WP05.0.1' && b.state?.legacy === undefined) || String(b.app) === 'WP04.0.1' || (String(b.app) === 'WP03.0.1' && b.state?.scan === undefined) || (String(b.app) === 'WP02.0.1' && b.state?.events === undefined) || (String(b.app) === 'WP01.0.1' && b.state?.game === undefined && b.state?.events === undefined)), 'Unsupported backup version'); need(await sha256(canonical(b.state)) === b.sha256, 'Backup checksum mismatch'); return validate(b.state); }
export const version = (e) => ({ epoch: e.epoch, revision: e.state.revision });
function ensureVersion(e, v) { need(e.epoch === v.epoch && e.state.revision === v.revision, 'Stale database version; reload'); }
export function openStore(name = 'career-legacy-foundation') { return new Promise((resolve, reject) => { const r = indexedDB.open(name, 1); r.onupgradeneeded = () => { const db = r.result; db.createObjectStore('core'); db.createObjectStore('checkpoints', { keyPath: 'id' }); r.transaction.objectStore('core').put({ epoch: crypto.randomUUID(), state: empty() }, 'root'); }; r.onerror = () => reject(r.error); r.onblocked = () => reject(Error('Database blocked: close other tabs')); r.onsuccess = () => { const db = r.result; db.onversionchange = () => db.close(); resolve(new Repository(db)); }; }); }
export class Repository {
    db;
    constructor(db) {
        this.db = db;
    }
    close() { this.db.close(); }
    read() { return new Promise((res, rej) => { const t = this.db.transaction('core', 'readonly'), r = t.objectStore('core').get('root'); let val; r.onsuccess = () => { val = r.result; }; t.oncomplete = () => { try {
        need(val && typeof val.epoch === 'string', 'Missing root');
        validate(val.state);
        res(val);
    }
    catch (e) {
        rej(e);
    } }; t.onabort = () => rej(t.error); t.onerror = () => rej(t.error); }); }
    checkpoints() { return new Promise((res, rej) => { const t = this.db.transaction('checkpoints', 'readonly'), r = t.objectStore('checkpoints').getAll(); t.oncomplete = () => res(r.result); t.onabort = () => rej(t.error); t.onerror = () => rej(t.error); }); }
    mutate(fn) { return new Promise((resolve, reject) => { const t = this.db.transaction(['core', 'checkpoints'], 'readwrite'), core = t.objectStore('core'), cp = t.objectStore('checkpoints'); let result; let err; const r = core.get('root'); r.onsuccess = () => { try {
        const old = r.result;
        validate(old.state);
        const out = fn(old);
        result = out.result;
        validate(out.next.state);
        if (out.checkpoint) {
            const snap = { id: crypto.randomUUID(), at: new Date().toISOString(), reason: out.checkpoint, envelope: old };
            cp.put(snap);
            const all = cp.getAll();
            all.onsuccess = () => { const a = all.result.filter(x => x.id !== snap.id).sort((a, b) => b.at.localeCompare(a.at)); for (const x of a.slice(2))
                cp.delete(x.id); };
        }
        if (out.next !== old)
            core.put(out.next, 'root');
    }
    catch (e) {
        err = e;
        t.abort();
    } }; t.oncomplete = () => resolve(result); t.onabort = () => reject(err ?? t.error ?? Error('Transaction aborted')); t.onerror = () => { }; }); }
    dispatch(req, epoch) { return this.mutate(old => { need(old.epoch === epoch, 'Stale database epoch'); const out = apply(old.state, req); const next = out.duplicate ? old : { epoch: old.epoch, state: out.state }; return { next, result: { envelope: next, duplicate: out.duplicate }, checkpoint: !out.duplicate && ['commitScan', 'importCalendar', 'closeSeason', 'switchClub', 'snapshot', 'youthMilestone', 'seasonRewards', 'prestigeReview', 'completeExit', 'completeSigning', 'drawEvent', 'openPack', 'resolveCard', 'completeCard', 'settleGoals', 'captureYearbook', 'manualAward', 'confirmAwardCoverage', 'jerseyLegacy', 'legacyFact', 'seasonReview'].includes(req.command.type) ? req.command.type : undefined }; }); }
    async restore(raw, expected) { const incoming = await decodeBackup(raw); return this.mutate(old => { ensureVersion(old, expected); const next = { epoch: crypto.randomUUID(), state: incoming }; return { next, result: next, checkpoint: 'external restore' }; }); }
    async restoreCheckpoint(id, expected) { const picked = (await this.checkpoints()).find(x => x.id === id); need(picked, 'Checkpoint missing'); validate(picked.envelope.state); return this.mutate(old => { ensureVersion(old, expected); const next = { epoch: crypto.randomUUID(), state: picked.envelope.state }; return { next, result: next, checkpoint: 'checkpoint restore' }; }); }
}
