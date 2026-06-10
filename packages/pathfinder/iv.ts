import type { LoadTerrain, Search } from './pathfinder.js';
import * as pf from '#iv';
import { makeLoadTerrain, makeSearch } from './pathfinder.js';

export type { Goal, RoomCallback, WorldTerrain } from './pathfinder.js';
export { module, path, version } from '#iv';
/** @internal */
export let _terrain: unknown;
export const loadTerrain: LoadTerrain = makeLoadTerrain(pf.loadTerrain, terrain => _terrain = terrain);
export const search: Search = makeSearch(pf.search);
