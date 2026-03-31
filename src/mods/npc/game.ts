import * as Id from 'xxscreeps/engine/schema/id.js';
import { registerStruct } from 'xxscreeps/engine/schema/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { compose, struct, vector } from 'xxscreeps/schema/index.js';

const schema = registerStruct('Room', {
	'#npcData': struct({
		users: compose(vector(Id.format), {
			compose: value => new Set(value),
			decompose: (value: Set<string>) => value.values(),
		}),
		memory: compose(vector(struct({
			id: Id.format,
			memory: 'buffer',
		})), {
			compose: values => new Map(values.map(value => [ value.id, value.memory ])),
			decompose: (map: Map<string, Readonly<Uint8Array>>) => Fn.map(map, ([ id, memory ]) => ({ id, memory })),
		}),
	}),
});

declare module 'xxscreeps/game/room/index.js' {
	interface Schema { npc: typeof schema }
}
