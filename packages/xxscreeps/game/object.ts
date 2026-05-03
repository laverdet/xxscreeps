import type { GameConstructor } from './index.js';
import type { RoomPosition } from './position.js';
import type { Room } from './room/index.js';
import type { InspectOptionsStylized } from 'node:util';
import type { BufferView, TypeOf } from 'xxscreeps/schema/index.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { enumeratedForPath } from 'xxscreeps/engine/schema/index.js';
import * as BufferObject from 'xxscreeps/schema/buffer-object.js';
import { compose, declare, enumerated, struct, union, vector, withOverlay } from 'xxscreeps/schema/index.js';
import { ReadOnlyView } from 'xxscreeps/schema/overlay.js';
import { expandGetters } from 'xxscreeps/utility/inspect.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { format as roomPositionFormat } from './position.js';
import { Game, registerGlobal } from './index.js';

const getPrototypeOf = Object.getPrototypeOf as (value: object) => object | null;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Schema {}

export const format = declare('RoomObject', () => compose(shape, RoomObject));
const shape = struct({
	id: Id.format,
	pos: roomPositionFormat,
	'#posId': union({ pos: 'int32' }),
});

export abstract class RoomObject extends withOverlay(BufferObject.BufferObject, shape) {
	/**
	 * The link to the Room object. May be `undefined` in case if an object is a flag or a construction
	 * site and is placed in a room that is not visible to you.
	 */
	declare room: Room;

	/** Set on id-string-constructed views to the canonical handle from the registry. */
	declare '#liveHandle'?: RoomObject;

	/** @internal */
	constructor(id: string);
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
		} else if (typeof viewOrXx === 'string') {
			const object = Game.getObjectById(viewOrXx);
			if (object === null) {
				throw new Error('Could not find an object with ID ' + viewOrXx);
			}
			const pos = object.pos;
			super(BufferObject.getBuffer(object), BufferObject.getOffset(object));
			installReadOnlyView(this, object, new.target.prototype, viewOrXx, pos);
			(this as RoomObject & { [ReadOnlyView]?: true })[ReadOnlyView] = true;
			this.room = object.room;
			this['#liveHandle'] = object;
		} else {
			super(viewOrXx as BufferView, offsetOrYy as number);
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
	get '#user'(): string | null { return null; }
	abstract get ['#lookType'](): string | null;

	set '#user'(_user: string | null) { throw new Error('Setting `#user` on unownable object'); }

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

function defineReadOnlyGetter(object: object, key: string, enumerable: boolean, get: () => unknown) {
	Object.defineProperty(object, key, {
		enumerable,
		configurable: true,
		get,
		set() {},
	});
}

function enumerableGetterKeys(prototype: object) {
	const keys = new Set<string>();
	for (
		let current: object | null = prototype;
		current !== null && current !== Object.prototype;
		current = getPrototypeOf(current)
	) {
		for (const key of Object.getOwnPropertyNames(current)) {
			if (key === 'constructor' || key.startsWith('#')) {
				continue;
			}
			const descriptor = Object.getOwnPropertyDescriptor(current, key)!;
			if (descriptor.enumerable && descriptor.get !== undefined) {
				keys.add(key);
			}
		}
	}
	return keys;
}

function installReadOnlyView(target: RoomObject, source: RoomObject, prototype: object, id: string, pos: RoomPosition) {
	const sourceRecord = source as unknown as Record<string, unknown>;
	const expanded = expandGetters(source) as Record<string, unknown>;
	const copied = new Set<string>();
	const copy = (key: string) => {
		if (key === 'room') {
			return;
		}
		let value: unknown;
		try {
			value = sourceRecord[key];
		} catch {
			return;
		}
		if (value === undefined || copied.has(key)) {
			return;
		}
		copied.add(key);
		defineReadOnlyGetter(target, key, true, () => sourceRecord[key]);
	};
	copied.add('id');
	defineReadOnlyGetter(target, 'id', true, () => id);
	copied.add('pos');
	defineReadOnlyGetter(target, 'pos', true, () => pos);
	for (const key of Object.keys(expanded)) {
		copy(key);
	}
	const sourcePrototype = getPrototypeOf(source);
	if (sourcePrototype !== null) {
		for (const key of enumerableGetterKeys(sourcePrototype)) {
			copy(key);
		}
	}
	for (const key of enumerableGetterKeys(prototype)) {
		if (copied.has(key) || key === 'room') {
			continue;
		}
		defineReadOnlyGetter(target, key, true, () => undefined);
	}
}

// Type-only merge: exposes `hits`/`hitsMax`/`my` at the base type without installing getters on the prototype.
export declare interface RoomObject {
	get hits(): number | undefined;
	set hits(hits: number);
	get hitsMax(): number | undefined;
	get my(): boolean | undefined;
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

type RoomObjectConstructor<Type extends RoomObject = RoomObject> = abstract new (...args: never[]) => Type;

export function getById<Type extends RoomObject>(Type: RoomObjectConstructor<Type>, id: string): Type {
	const object = Game.getObjectById(id);
	if (object !== null && object instanceof Type) {
		return object;
	}
	throw new Error('Could not find an object with ID ' + id);
}
