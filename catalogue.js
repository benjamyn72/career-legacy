import { CONTENT } from './catalogue-data.js';
import { validateCatalogue, RARITIES, PACK_ODDS } from './events.js';
import { need } from './model.js';
export const CONTENT_VERSION = CONTENT.version;
export function productionCatalogue() { return structuredClone(CONTENT); }
export function validateProductionCatalogue(c = CONTENT) {
    validateCatalogue(c);
    const counts = { Academy: 30, Transfers: 35, Matchday: 30, Club: 25, Squad: 30, Manager: 20, 'Story Chain': 20 };
    need(c.version === CONTENT_VERSION && c.cards.length === 190 && c.goals.length === 90 && c.achievements.length === 120, 'Catalogue size');
    for (const [k, n] of Object.entries(counts))
        need(c.cards.filter(x => x.category === k).length === n, 'Category count');
    const all = [...c.cards, ...c.goals, ...c.achievements];
    need(new Set(all.map(x => x.id)).size === 400 && all.every(x => x.text.trim() && x.title?.trim()), 'Global ID/title/content validation');
    need(new Set(c.cards.map(x => x.title)).size === 190 && new Set(c.goals.map(x => x.title)).size === 90, 'Duplicate titles');
    need(c.cards.every(x => x.completion?.trim() && x.visualKey?.trim()), 'Missing card instructions or visual key');
    need(c.goals.filter(x => x.kind === 'legacy').length === 30, 'Legacy count');
    for (const k of ['sport', 'identity', 'development', 'variable'])
        need(c.goals.filter(x => x.kind === 'seasonal' && x.category === k).length === 15, 'Season goal category count');
    const series = new Set(c.achievements.map(x => x.series));
    need(series.size === 24 && !series.has(undefined), 'Achievement series');
    for (const k of series) {
        const a = c.achievements.filter(x => x.series === k);
        need(a.length === 5 && new Set(a.map(x => x.tier)).size === 5 && new Set(a.map(x => x.scope)).size === 1, 'Achievement tier coverage');
        if (a.every(x => x.predicate))
            need(a.slice(1).every((x, i) => x.predicate.metric === a[i].predicate.metric && x.predicate.min > a[i].predicate.min), 'Achievement threshold order');
    }
    const stories = c.cards.filter(x => x.type === 'story'), successors = new Set(stories.flatMap(x => x.next ? [x.next] : []));
    const roots = stories.filter(x => !successors.has(x.id));
    const visited = new Set();
    for (const root of roots) {
        let cur = root;
        let n = 0;
        while (cur) {
            need(!visited.has(cur.id) && !cur.pending, 'Broken story graph');
            visited.add(cur.id);
            n++;
            const next = cur.next;
            cur = next ? stories.find(x => x.id === next) : undefined;
        }
        need(n === 4, 'Story arc length');
    }
    need(roots.length === 5 && visited.size === 20, 'Story reachability');
    // Each rarity must have an unconditional drawable, non-window-dependent positive card,
    // even with no active timed slots. Reward draws need no extra context to honor pity.
    for (const r of RARITIES)
        need(c.cards.some(x => x.rarity === r && x.type === 'positive' && !x.pending && !x.eligibility && x.effect.kind === 'none' && !x.next), 'No safe rarity fallback');
    for (const k of Object.keys(PACK_ODDS))
        need(PACK_ODDS[k].reduce((a, b) => a + b, 0) === 100, 'Odds total');
    return { version: c.version, counts, total: all.length, storyArcs: roots.length, enabledCards: c.cards.filter(x => !x.pending).length, pendingCards: c.cards.filter(x => x.pending).length, automaticGoals: c.goals.filter(x => !x.manual).length, manualGoals: c.goals.filter(x => x.manual).length, automaticAchievements: c.achievements.filter(x => !x.manual).length, manualAchievements: c.achievements.filter(x => x.manual).length, secretAchievements: c.achievements.filter(x => x.secret).length, globalAchievements: c.achievements.filter(x => x.scope === 'global').length };
}
