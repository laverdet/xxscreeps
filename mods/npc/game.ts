import * as Id from 'xxscreeps/engine/util/schema/id';
import { compose, member, struct, vector } from 'xxscreeps/schema';
import { registerSchema } from 'xxscreeps/engine/schema';
import { mapInPlace } from 'xxscreeps/util/utility';

export const NPCData = Symbol('npcData');

const schema = registerSchema('Room', struct({
	npc: member(NPCData, struct({
		users: compose(vector(Id.format), {
			compose: value => new Set(value),
			decompose: (value: Set<string>) => value.values(),
		}),
		memory: compose(vector(struct({
			id: Id.format,
			memory: 'buffer',
		})), {
			compose: values => new Map(values.map(value => [ value.id, value.memory ])),
			decompose: (map: Map<string, Readonly<Uint8Array>>) => mapInPlace(map, ([ id, memory ]) => ({ id, memory })),
		}),
	})),
}));

declare module 'xxscreeps/engine/schema' {
	interface Schema { npc: typeof schema }
}
