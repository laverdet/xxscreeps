import minimist from 'minimist';
export function checkArguments<Type extends {
	boolean?: readonly string[];
	string?: readonly string[];
}>(options: Type): {
	_: string[];
} & {
	[Key in NonNullable<Type['boolean']>[number]]: boolean;
} & {
	[Key in NonNullable<Type['string']>[number]]: string;
} {
	const argv = minimist(process.argv.slice(2), {
		stopEarly: true,
		...options as any,
	});
	const unknown = Object.keys(argv).find(key =>
		key !== '_' &&
		!options.boolean?.includes(key) &&
		!options.string?.includes(key));
	if (unknown !== undefined) {
		throw new TypeError(`Unknown argument: ${unknown}`);
	}
	return argv as never;
}
