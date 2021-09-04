import { checkArguments } from 'xxscreeps/config/arguments';

type Callback = () => void | Promise<void>;
type Context = {
	name: string | undefined;
	children: Callback[];
	tests: Callback[];
};
const makeFrame = (name?: string) => ({ name, children: [], tests: [] });
const { argv } = checkArguments({ argv: true });
const checkFilter = (name: string) => {
	if (argv.length) {
		const index = stack.filter(name => Boolean(name)).length;
		return index < argv.length && argv[index] !== name;
	} else {
		return false;
	}
};

let context: Context | undefined = makeFrame();
const stack: Context[] = [];

export async function flush() {
	if (!context) {
		throw new Error('Called `flush` without context');
	}
	for (const test of context.tests) {
		await test();
	}
	console.log();
	for (const child of context.children) {
		await child();
	}
	context = undefined;
}

export function describe(name: string, fn: Callback): void {
	if (!context) {
		throw new Error('Called `describe` within `test`');
	} else if (checkFilter(name)) {
		return;
	}
	context.children.push(async() => {
		if (argv.length === 0) {
			process.stdout.write('  '.repeat(stack.length) + name);
		}
		const frame = makeFrame(name);
		stack.push(context!);
		context = frame;
		try {
			await fn();
			await flush();
		} finally {
			context = stack.pop();
		}
	});
}

export function test(name: string, fn: Callback) {
	if (!context) {
		throw new Error('Called `test` within `test`');
	} else if (checkFilter(name)) {
		return;
	}
	context.tests.push(async() => {
		try {
			await fn();
			if (argv.length === 0) {
				process.stdout.write('.');
			}
		} catch (err: any) {
			const names = [ ...stack.map(frame => frame.name), context?.name, name ].filter(name => name);
			if (argv.length === 0) {
				console.log(`\nTest "${name}" failed. Isolate with: npx xxscreeps test ${names.map(name => `"${name}"`).join(' ')}`);
			}
			console.log(err.stack);
		}
	});
}
