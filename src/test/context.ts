import { checkArguments } from 'xxscreeps/config/arguments.js';
import { nonNullPredicate } from 'xxscreeps/functional/predicate.js';

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
let passed = 0;
let failed = 0;
const testTimeout = 10000;

// Catch unhandled rejections so async failures don't vanish silently
process.on('unhandledRejection', (err: any) => {
	++failed;
	console.error('\nUnhandled rejection:', err?.stack ?? err);
});

export async function flush() {
	if (!context) {
		throw new Error('Called `flush` without context');
	}
	for (const test of context.tests) {
		await test();
	}
	if (argv.length === 0 && context.tests.length > 0) {
		process.stdout.write('\n');
	}
	for (const child of context.children) {
		await child();
	}
	context = undefined;
}

export function summary() {
	console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
	if (failed > 0) {
		process.exitCode = 1;
	}
}

export function describe(name: string, fn: Callback): void {
	if (!context) {
		throw new Error('Called `describe` within `test`');
	} else if (checkFilter(name)) {
		return;
	}
	context.children.push(async () => {
		if (argv.length === 0) {
			process.stdout.write('  '.repeat(stack.length) + name + ' ');
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
	context.tests.push(async () => {
		try {
			let timer: NodeJS.Timeout;
			await Promise.race([
				Promise.resolve(fn()).finally(() => clearTimeout(timer)),
				new Promise((_, reject) => {
					timer = setTimeout(() => reject(new Error(`Test "${name}" timed out after ${testTimeout}ms`)), testTimeout);
				}),
			]);
			++passed;
			if (argv.length === 0) {
				process.stdout.write('.');
			}
		} catch (err: any) {
			++failed;
			const names = [ ...stack.map(frame => frame.name), context?.name, name ].filter(nonNullPredicate);
			if (argv.length === 0) {
				console.log(`\n  FAIL: ${name}`);
				console.log(`  Isolate with: npx xxscreeps test ${names.map(name => `"${name}"`).join(' ')}`);
			}
			console.log(err.stack);
		}
	});
}
