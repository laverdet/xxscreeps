import type { GameConstructor } from './index.js';
import type { InspectOptionsStylized } from 'util';
import type { Room } from './room/index.js';
import type { RoomPosition } from './position.js';
import type { BufferView, TypeOf } from 'xxscreeps/schema/index.js';
import * as BufferObject from 'xxscreeps/schema/buffer-object.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { format as roomPositionFormat } from './position.js';
import { compose, declare, enumerated, struct, union, vector, withOverlay } from 'xxscreeps/schema/index.js';
import { enumeratedForPath } from 'xxscreeps/engine/schema/index.js';
import { expandGetters } from 'xxscreeps/utility/inspect.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { Game, registerGlobal } from './index.js';

export interface Schema {}

export const format = declare('RoomObject', () => compose(shape, RoomObject));
const shape = struct({
	id: Id.format,
	pos: roomPositionFormat,
	'#posId': union({ pos: 'int32' }),
});

export abstract class RoomObject extends withOverlay(BufferObject.BufferObject, shape) {
	abstract get ['#lookType'](): string | null;

	/**
	 * The link to the Room object. May be `undefined` in case if an object is a flag or a construction
	 * site and is placed in a room that is not visible to you.
	 */
	declare room: Room;

	/** @internal */
	constructor(buffer?: BufferView, offset?: number);
	/** @deprecated */
	constructor(xx: number, yy: number, roomName: string);

	constructor(viewOrXx?: unknown, offsetOrYy?: unknown, roomName?: unknown) {
		if (typeof viewOrXx === 'number') {
			// Undocumented constructor of fake object
			super();
			this.pos.x = viewOrXx;
			this.pos.y = offsetOrYy as number;
			this.pos.roomName = roomName as string;
			this.room = Game.rooms[roomName as string];
		} else {
			super(viewOrXx as BufferView, offsetOrYy as number);
		}
	}

	get '#extraUsers'(): string[] { return [] }
	get '#hasIntent'() { return false }
	get '#layer'(): number | undefined { return 0.5 }
	get '#pathCost'(): undefined | number { return undefined }
	get '#providesVision'() { return false }
	get '#user'(): string | null { return null }
	set '#user'(_user: string | null) { throw new Error('Setting `#user` on unownable object') }
	get hits(): number | undefined { return undefined }
	set hits(_hits: number | undefined) { throw new Error('Setting `hits` on indestructible object') }
	get hitsMax(): number | undefined { return undefined }
	get my(): boolean | undefined { return undefined }

	'#addToMyGame'(_game: GameConstructor) {}
	'#afterInsert'(room: Room) {
		this.room = room;
	}

	'#beforeRemove'() {
		this.room = undefined as never;
	}

	'#applyDamage'(power: number, _type: number, _source?: RoomObject) {
		if ((this.hits! -= power) <= 0) {
			this['#destroy']();
		}
	}

	'#captureDamage'(power: number, _type: number, _source: RoomObject | null) {
		return power;
	}

	'#destroy'() {
		this.room['#removeObject'](this);
	}

	private [Symbol.for('nodejs.util.inspect.custom')](depth: number, options: InspectOptionsStylized) {
		if (BufferObject.check(this)) {
			return expandGetters(this);
		} else {
			return `${options.stylize(`[${this.constructor.name}]`, 'special')} ${options.stylize('{released}', 'null')}`;
		}
	}
}

export function create<Type extends RoomObject>(instance: Type, pos: RoomPosition): Type {
	const object = assign<Type, RoomObject>(instance, {
		id: Id.generateId(),
		pos,
	});
	object['#posId'] = pos['#id'];
	return object;
}

// Export `RoomObject` to runtime globals
registerGlobal(RoomObject);
declare module 'xxscreeps/game/runtime' {
	interface Global {
		RoomObject: typeof RoomObject;
	}
}

export const actionLogFormat = declare('ActionLog', () => vector(struct({
	type: enumerated(...enumeratedForPath<Schema>()('ActionLog.action')),
	x: 'int8',
	y: 'int8',
	time: 'int32',
})));

export type ActionLog = TypeOf<typeof actionLogFormat>;
type WithActionLog = Record<'#actionLog', ActionLog>;

export function saveAction(object: WithActionLog, type: ActionLog[number]['type'], pos: RoomPosition) {
	const actionLog = object['#actionLog'];
	for (const action of actionLog) {
		if (action.type === type) {
			action.time = Game.time;
			action.x = pos.x;
			action.y = pos.y;
			return;
		}
	}
	actionLog.push({ type, x: pos.x, y: pos.y, time: Game.time });
}
