import type { InspectOptions } from 'node:util';
import { formatWithOptions, inspect } from 'node:util';

export function setupConsole(write: (fd: number, payload: string) => void) {
	const format = (args: unknown[]) =>
		formatWithOptions({ colors: true }, ...args);

	Object.assign(console, {
		log(...args: unknown[]) {
			write(1, format(args));
		},

		logUnsafe(...args: unknown[]) {
			// see unescapedFd in print.ts
			write(3, format(args));
		},

		warn(...args: unknown[]) {
			if (args.length === 1 && typeof args[0] === 'string') {
				args[0] = `⚠️${args[0]}`;
			} else {
				args.unshift('⚠️');
			}
			write(2, format(args));
		},

		error(...args: any[]) {
			write(2, format(args));
		},

		dir(object: unknown, options?: InspectOptions) {
			write(1, inspect(object, {
				customInspect: false,
				colors: true,
				...options,
			}));
		},

		trace: function trace(...args: unknown[]) {
			const holder = {
				name: 'Trace',
				message: format(args),
				stack: undefined,
			};
			Error.captureStackTrace(holder, trace);
			this.error(holder.stack);
		},

		assert(expression: boolean, ...args: unknown[]) {
			if (!expression) {
				args[0] = `Assertion failed${args.length === 0 ? '' : `: ${String(args[0])}`}`;
				this.error(...args);
				throw new Error(String(args[0]));
			}
		},
	});
}
