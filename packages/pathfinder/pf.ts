import * as pf from '#pf';
import { LoadTerrain, Search, makeLoadTerrain, makeSearch } from './pathfinder.js';

export type { Goal, Result, RoomCallback, WorldTerrain } from './pathfinder.js';
export { path, version } from '#pf';
/** @internal */
export let _terrain: unknown;
export const loadTerrain: LoadTerrain = makeLoadTerrain(pf.loadTerrain, terrain => _terrain = terrain);
export const search: Search = makeSearch(pf.search);
