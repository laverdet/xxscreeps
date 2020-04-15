import * as C from '~/game/constants';
import { checkCreateFlag, Color, Flag } from '~/game/flag';
import { fromPositionId } from '~/game/position';
import { instantiate } from '~/lib/utility';

export type Parameters = {
	create: {
		name: string;
		pos: number;
		color: Color;
		secondaryColor: Color;
	}[];
	remove: { name: string }[];
};

export type Intents = {
	receiver: 'flags';
	parameters: Parameters;
};

export type OneIntent = Partial<{
	[Key in keyof Parameters]: Parameters[Key][number];
}>;

// Flag intents are handled on the runners so this stuff doesn't fit into the regular intent
// pipeline
export function execute(flags: Dictionary<Flag>, intents: Partial<Parameters>) {

	// Intents for flag removal
	for (const intent of intents.remove ?? []) {
		delete flags[intent.name];
	}

	// Run create / move / setColor intent
	for (const intent of intents.create ?? []) {
		const pos = fromPositionId(intent.pos)!;
		const { name, color, secondaryColor } = intent;
		if (checkCreateFlag(flags, pos, name, color, secondaryColor) === C.OK) {
			const flag = flags[name];
			if (flag) {
				// Modifying an existing flag
				flag.color = color;
				flag.secondaryColor = secondaryColor;
				flag.pos = pos;
			} else {
				// Creating a new flag
				flags[name] = instantiate(Flag, {
					id: undefined as never,
					effects: undefined,
					pos,
					name,
					color, secondaryColor,
				});
			}
		}
	}
}
