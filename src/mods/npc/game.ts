import * as Fn from 'xxscreeps/utility/functional';
import * as Id from 'xxscreeps/engine/schema/id';
import { XSymbol, compose, struct, vector } from 'xxscreeps/schema';
import { registerSchema } from 'xxscreeps/engine/schema';

export const NPCData = XSymbol('npcData');

const schema = registerSchema('Room', struct({
	[NPCData]: struct({
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
}));

declare module 'xxscreeps/engine/schema' {
	interface Schema { npc: typeof schema }
}
