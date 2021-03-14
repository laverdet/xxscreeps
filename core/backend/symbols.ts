import type { Endpoint } from 'xxscreeps/backend/endpoint';
export const eventRenderers = new Map<number, ((...args: any[]) => any)[]>();
export const MapRender = Symbol('mapRender');
export const Render = Symbol('render');
export const TerrainRender = Symbol('terrainRender');
export const routes: Endpoint[] = [];
