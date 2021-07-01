import { ArgumentParser } from 'argparse';
export function checkArguments<Type extends {
	argv?: true;
	boolean?: readonly string[];
	string?: readonly string[];
}>(options: Type): {
	[Key in NonNullable<Type['boolean']>[number]]: boolean;
} & {
	[Key in NonNullable<Type['string']>[number]]?: string;
} & {
	argv: Type['argv'] extends true ? (string | undefined)[] : never;
} {
	const parser = new ArgumentParser;
	for (const key of options.boolean ?? []) {
		parser.add_argument(`--${key}`, {
			action: 'store_true',
			default: false,
			dest: key,
		});
	}
	for (const key of options.string ?? []) {
		parser.add_argument(`--${key}`, {
			dest: key,
			nargs: '?',
			type: 'str',
		});
	}
	if (options.argv) {
		parser.add_argument('argv', {
			nargs: '*',
		});
	}
	return parser.parse_args();
}
