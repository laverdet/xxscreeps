import type { Implementation } from 'xxscreeps/utility/types.js';
import { Variant } from 'xxscreeps/schema/index.js';
import { RoomObject } from './object.js';

// Render symbols — shared between backend (browser client) and CLI (room inspection)
export const MapRender = Symbol('mapRender');
export const Render = Symbol('render');
export const TerrainRender = Symbol('terrainRender');

// `RoomObject` render types
export type RenderedRoomObject = {
	_id: string;
	type: string;
	x: number;
	y: number;
};

declare module './object.js' {
	interface RoomObject {
		[Render]: (previousTime?: number) => RenderedRoomObject | undefined;
		[MapRender]: (object: any) => string | undefined;
		[TerrainRender]: (object: any) => number | undefined;
	}
}

// Render registration helpers
export function bindRenderer<Type extends RoomObject>(
	object: Implementation<Type>,
	render: (object: Type, next: () => RenderedRoomObject, ...rest: Parameters<RoomObject[typeof Render]>) => RenderedRoomObject | undefined,
) {
	const { prototype } = object;
	const parent = Object.getPrototypeOf(prototype);
	prototype[Render] = function(...rest) {
		return render(this, () => parent[Render].call(this, ...rest), ...rest);
	};
}

export function bindMapRenderer<Type extends RoomObject>(object: Implementation<Type>, render: (object: Type) => string | undefined) {
	object.prototype[MapRender] = render;
}

export function bindTerrainRenderer<Type extends RoomObject>(object: Implementation<Type>, render: (object: Type) => number | undefined) {
	object.prototype[TerrainRender] = render;
}

// Base RoomObject renderer — root of the render chain that mod renderers extend
bindRenderer(RoomObject, object => ({
	_id: object.id,
	type: object[Variant as never],
	x: object.pos.x,
	y: object.pos.y,
}));
