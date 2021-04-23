import type Koa from 'koa';
import type Router from 'koa-router';
import type { Context, Endpoint, State } from 'xxscreeps/backend';
export const MapRender = Symbol('mapRender');
export const Render = Symbol('render');
export const TerrainRender = Symbol('terrainRender');
export const middleware: ((koa: Koa<State, Context>, router: Router<State, Context>) => void)[] = [];
export const routes: Endpoint[] = [];
