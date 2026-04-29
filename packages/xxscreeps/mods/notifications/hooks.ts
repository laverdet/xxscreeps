import type { NotificationRow } from './model.js';

export type SendUserNotifications = (userId: string, notifications: NotificationRow[]) => void | Promise<void>;

interface Hooks {
	sendUserNotifications: SendUserNotifications;
}

const hooksByName: { [Name in keyof Hooks]: Hooks[Name][] } = {
	sendUserNotifications: [],
};

export const notifyHooks = {
	register<Name extends keyof Hooks>(name: Name, fn: Hooks[Name]): Disposable {
		const arr = hooksByName[name];
		arr.push(fn);
		return {
			[Symbol.dispose]() {
				const idx = arr.indexOf(fn);
				if (idx >= 0) {
					arr.splice(idx, 1);
				}
			},
		};
	},
};

export function getHooks<Name extends keyof Hooks>(name: Name): readonly Hooks[Name][] {
	return hooksByName[name];
}
