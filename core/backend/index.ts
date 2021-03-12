import type { Implementation } from 'xxscreeps/utility/types';
import type { RoomObject } from 'xxscreeps/game/object';
import { MapRender, Render, TerrainRender } from './symbols';

// `RoomObject` render symbols
type RenderedRoomObject = {
	_id: string;
	type: string;
	x: number;
	y: number;
};
declare module 'xxscreeps/game/object' {
	interface RoomObject {
		[Render]: () => RenderedRoomObject;
		[MapRender]: (object: any) => string | undefined;
		[TerrainRender]: (object: any) => number | undefined;
	}
}

// Backend render hooks
export function bindRenderer<Type extends RoomObject>(
	object: Implementation<Type>,
	render: (object: Type, next: () => RenderedRoomObject) => RenderedRoomObject,
) {
	const { prototype } = object;
	const parent = Object.getPrototypeOf(prototype);
	prototype[Render] = function() {
		return render(this, () => parent[Render].call(this));
	};
}

export function bindMapRenderer<Type extends RoomObject>(object: Implementation<Type>, render: (object: Type) => string | undefined) {
	object.prototype[MapRender] = render;
}

export function bindTerrainRenderer<Type extends RoomObject>(object: Implementation<Type>, render: (object: Type) => number | undefined) {
	object.prototype[TerrainRender] = render;
}
