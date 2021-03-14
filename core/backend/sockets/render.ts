import { bindRenderer } from 'xxscreeps/backend';
import { RoomObject } from 'xxscreeps/game/object';
import { Variant } from 'xxscreeps/schema';

// Base object renderer
bindRenderer(RoomObject, object => ({
	_id: object.id,
	type: object[Variant as never],
	x: object.pos.x,
	y: object.pos.y,
}));
