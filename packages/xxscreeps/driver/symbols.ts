import type { Sandbox } from 'xxscreeps/driver/sandbox/index.js';
import { makeHookRegistration } from 'xxscreeps/utility/hook.js';

export const hooks = makeHookRegistration<{
	isolateInspector: boolean;
	sandboxCreated: (sandbox: Sandbox, userId: string) => void;
}>();
