import type { Dictionary } from 'xxscreeps/utility/types';
import type { DescribeIntentHandler, IntentListFor } from 'xxscreeps/processor';
import * as C from 'xxscreeps/game/constants';
import * as Fn from 'xxscreeps/utility/functional';
import { compose, declare, makeReaderAndWriter, vector } from 'xxscreeps/schema';
import { checkCreateFlag, format, Color, Flag } from 'xxscreeps/game/flag';
import { fromPositionId } from 'xxscreeps/game/position';
import { instantiate } from 'xxscreeps/utility/utility';

// Flags are stored in a separate blob per user.. this is the schema for the blob
const schema = declare('Flags', compose(vector(format), {
	compose: (flags): Record<string, Flag> => Fn.fromEntries(flags, flag => [ flag.name, flag ]),
	decompose: (flags: Record<string, Flag>) => Object.values(flags),
}));
export const { read, write } = makeReaderAndWriter(schema);

// Flag intents are handled on the runners, so this stuff doesn't fit into the regular intent
// pipeline
declare module 'xxscreeps/processor' {
	interface Intent { flag: Intents }
}
type Intents = [
	DescribeIntentHandler<'flag', 'create', typeof createFlag>,
	DescribeIntentHandler<'flag', 'remove', typeof removeFlag>,
];

export class FlagProcessorContext {
	constructor(public flags: Dictionary<Flag>) {}
}

function createFlag(this: FlagProcessorContext, name: string, posId: number, color: Color, secondaryColor: Color) {
	// Run create / move / setColor intent
	const pos = fromPositionId(posId)!;
	if (checkCreateFlag(this.flags, pos, name, color, secondaryColor) === C.OK) {
		const flag = this.flags[name];
		if (flag) {
			// Modifying an existing flag
			flag.color = color;
			flag.secondaryColor = secondaryColor;
			flag.pos = pos;
		} else {
			// Creating a new flag
			this.flags[name] = instantiate(Flag, {
				id: null as never,
				effects: undefined,
				pos,
				name,
				color, secondaryColor,
			});
		}
	}
}

function removeFlag(this: FlagProcessorContext, name: string) {
	delete this.flags[name];
}

export function execute(flags: Dictionary<Flag>, intents: IntentListFor<'flag'>) {
	const context = new FlagProcessorContext(flags);
	for (const intent of intents.remove ?? []) {
		removeFlag.apply(context, intent);
	}
	for (const intent of intents.create ?? []) {
		createFlag.apply(context, intent);
	}
}
