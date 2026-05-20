import type { GameConstructor } from './index.js';
import type { RoomPosition } from './position.js';
import type { Room } from './room/index.js';
import type { InspectOptionsStylized } from 'node:util';
import type { BufferView, TypeOf } from 'xxscreeps/schema/index.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { enumeratedForPath } from 'xxscreeps/engine/schema/index.js';
import { GameBase } from 'xxscreeps/game/game.js';
import * as BufferObject from 'xxscreeps/schema/buffer-object.js';
import { compose, declare, enumerated, struct, union, vector, withOverlay } from 'xxscreeps/schema/index.js';
import { expandGetters } from 'xxscreeps/utility/inspect.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { ObjectGetPrototypeOf, ObjectSetPrototypeOf } from './intrinsics.js';
import { format as roomPositionFormat } from './position.js';
import { Game, registerGlobal } from './index.js';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Schema {}

export const format = declare('RoomObject', () => compose(shape, RoomObject));
const shape = struct({
	id: Id.format,
	pos: roomPositionFormat,
	'#posId': union({ pos: 'int32' }),
});

export interface RoomObjectEffect {
	effect: number;
	power?: number;
	level?: number;
	ticksRemaining: number;
}

export abstract class RoomObject extends withOverlay(BufferObject.BufferObject, shape) {
	/**
	 * The link to the Room object. May be `undefined` in case if an object is a flag or a construction
	 * site and is placed in a room that is not visible to you.
	 */
	declare room: Room;

	/** @internal */
	constructor(buffer?: BufferView, offset?: number);
	/** @deprecated */
	constructor(xx: number, yy: number, roomName: string);

	constructor(viewOrIdOrXx?: unknown, offsetOrYy?: unknown, roomName?: unknown) {
		if (typeof viewOrIdOrXx === 'number') {
			// Undocumented constructor of fake object
			super();
			this.pos.x = viewOrIdOrXx;
			this.pos.y = offsetOrYy as number;
			this.pos.roomName = roomName as string;
			this.room = Game.rooms[roomName as string]!;
		} else if (typeof viewOrIdOrXx === 'string') {
			// The terrible id-string constructor
			const object = Game.getObjectById(viewOrIdOrXx);
			if (object && object instanceof new.target) {
				super(BufferObject.getBuffer(object), BufferObject.getOffset(object));
				const prototype = ObjectGetPrototypeOf(object) as object;
				if (ObjectGetPrototypeOf(this) !== prototype) {
					ObjectSetPrototypeOf(this, prototype);
				}
				this.room = object.room;
			} else {
				super();
			}
		} else {
			super(viewOrIdOrXx as BufferView, offsetOrYy as number);
		}
	}

	get '#extraUsers'(): string[] { return []; }
	// eslint-disable-next-line @typescript-eslint/class-literal-property-style
	get '#hasIntent'() { return false; }
	// eslint-disable-next-line @typescript-eslint/class-literal-property-style
	get '#layer'(): number | undefined { return 0.5; }
	get '#pathCost'(): undefined | number { return undefined; }
	// eslint-disable-next-line @typescript-eslint/class-literal-property-style
	get '#providesVision'() { return false; }
	// eslint-disable-next-line @typescript-eslint/class-literal-property-style
	get '#secondaryLookType'(): string | null { return null; }
	get '#user'(): string | null { return null; }
	abstract get ['#lookType'](): string | null;

	set '#user'(_user: string | null) { throw new Error('Setting `#user` on unownable object'); }

	'#addToMyGame'(_game: GameConstructor) {}

	'#afterRemove'() {
		this.room = undefined as never;
	}

	'#beforeInsert'(room: Room) {
		this.room = room;
	}

	'#applyDamage'(power: number, type: number, _source?: RoomObject) {
		if (this.hits! > 0 && (this.hits! -= power) <= 0) {
			this['#destroy'](type);
		}
	}

	'#captureDamage'(power: number, _type: number, _source: RoomObject | null) {
		return power;
	}

	'#destroy'(_type?: number) {
		return this.room['#removeObject'](this);
	}

	private [Symbol.for('nodejs.util.inspect.custom')](depth: number, options: InspectOptionsStylized): unknown {
		if (BufferObject.check(this)) {
			return expandGetters(this);
		} else {
			return `${options.stylize(`[${this.constructor.name}]`, 'special')} ${options.stylize('{released}', 'null')}`;
		}
	}
}

// Typing-only declarations on the base; runtime getters live on subclasses.
export declare interface RoomObject {
	get hits(): number | undefined;
	get effects(): RoomObjectEffect[] | undefined;
	set hits(hits: number);
	get hitsMax(): number | undefined;
	get my(): boolean | undefined;
}

export function hasEffect(object: RoomObject, effectType: number) {
	return object.effects?.some(effect => effect.effect === effectType && effect.ticksRemaining > 0) ?? false;
}

export function create<Type extends RoomObject>(instance: Type, pos: RoomPosition): Type {
	const object = assign<Type, RoomObject>(instance, {
		id: Id.generateId(),
		pos,
	});
	object['#posId'] = pos['#id'];
	return object;
}

export function cooldownTime(Game: GameBase, time: number) {
	// Cooldowns are not reset at expiry
	return time > Game.time ? time - Game.time : 0;
}

export function untilTime(Game: GameBase, time: number) {
	// Untils expire at 0
	return time > Game.time ? time - Game.time : undefined;
}

export function requiredExpiryTime(Game: GameBase, time: number) {
	// An overdue expiry time represents invalid game state
	if (time >= Game.time) {
		// nb: An expiry time of `0` should only be seen by the processor.
		return cooldownTime(Game, time);
	} else {
		throw new Error(`Invalid expiry time ${time} vs ${Game.time}`);
	}
}

export function optionalExpiryTime(Game: GameBase, time: number) {
	// Optional expiry times may be `undefined`
	return time === 0 ? undefined : requiredExpiryTime(Game, time);
}

// Export `RoomObject` to runtime globals
registerGlobal(RoomObject);
declare module 'xxscreeps/game/runtime.js' {
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
