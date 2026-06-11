import type { LoadTerrain, Search } from './pathfinder.js';
import * as pf from '#pf';
import { makeLoadTerrain, makeSearch } from './pathfinder.js';

export type { Goal, Result, RoomCallback, WorldTerrain } from './pathfinder.js';
export * from '#pf';

/** @internal */
export let _terrain: unknown;
export const loadTerrain: LoadTerrain = makeLoadTerrain(pf.loadTerrain, terrain => _terrain = terrain);
export const search: Search = makeSearch(pf.search);
