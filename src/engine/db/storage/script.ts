import type { LocalKeyValResponder } from './local/keyval';
import type { Value } from './provider';

let id = 0;

/**
 * Represents a script which can be sent to the keyval storage engine and run locally on that
 * service. This is a plain JavaScript function in the local provider, or a lua script on Redis.
 */
export class KeyvalScript<Result extends Value | null = any, Keys extends Value[] = any, Argv extends Value[] = any> {
	readonly [provider: string]: string;
	readonly id: string;
	readonly local: string;
	constructor(basicImpl: (keyval: LocalKeyValResponder, keys: Keys, argv: Argv) => Result, extra: Record<string, string> = {}) {
		this.id = `command${++id}`;
		this.local = `${basicImpl}`;
		Object.assign(this, extra);
	}
}
