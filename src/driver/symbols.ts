import type { Sandbox } from 'xxscreeps/driver/sandbox';
import { makeHookRegistration } from 'xxscreeps/utility/hook';

export const hooks = makeHookRegistration<{
	isolateInspector: boolean;
	sandboxCreated: (sandbox: Sandbox, userId: string) => void;
}>();
