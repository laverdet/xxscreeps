import type { Implementation } from 'xxscreeps/util/types';
import type { AnyEventLog } from 'xxscreeps/game/room/event-log';
import type { RoomObject } from 'xxscreeps/game/objects/room-object';
import { eventRenderers, MapRender, Render } from './symbols';
import { getOrSet } from 'xxscreeps/util/utility';

// `RoomObject` render symbols
type RenderedRoomObject = {
	_id: string;
	type: string;
	x: number;
	y: number;
};
declare module 'xxscreeps/game/objects/room-object' {
	interface RoomObject {
		[Render]: () => RenderedRoomObject;
		[MapRender]: (object: any) => string | undefined;
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

export function bindEventRenderer(event: AnyEventLog['event'], fn: NonNullable<ReturnType<typeof eventRenderers['get']>>[number]) {
	getOrSet(eventRenderers, event, () => []).push(fn);
}

export function bindMapRenderer<Type extends RoomObject>(object: Implementation<Type>, render: (object: Type) => string | undefined) {
	object.prototype[MapRender] = render;
}
