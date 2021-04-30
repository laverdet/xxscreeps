import type ivm from 'isolated-vm';
import type { InitializationPayload } from 'xxscreeps/driver';
import * as Runtime from 'xxscreeps/driver/runtime';
export { tick } from 'xxscreeps/driver/runtime';

export function initialize(
	isolate: ivm.Isolate,
	context: ivm.Context,
	printRef: ivm.Reference<Runtime.Print>,
	data: InitializationPayload,
) {
	const evaluate: Runtime.Evaluate = (source, filename) => {
		const script = isolate.compileScriptSync(source, { filename });
		return script.runSync(context, { reference: true }).deref();
	};
	const print: Runtime.Print = (fd, payload) => printRef.applySync(undefined, [ fd, payload ]);
	Runtime.initialize(evaluate, print, data);
}
