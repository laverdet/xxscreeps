import type { LocalKeyValResponder } from './local/keyval';
import type { Value } from './provider';

/**
 * Represents a script which can be sent to the keyval storage engine and run locally on that
 * service. This is a plain JavaScript function in the local provider, or a lua script on Redis.
 */
export class KeyvalScript<Result extends Value | Value[] | null = any, Keys extends string[] = [], Argv extends Value[] = []> {
	readonly [provider: string]: string;
	readonly local: string;
	constructor(basicImpl: (keyval: LocalKeyValResponder, keys: Keys, argv: Argv) => Result, extra: Record<string, string> = {}) {
		this.local = `${basicImpl}`;
		Object.assign(this, extra);
	}
}
