import type { CommandArgField, CommandSchemaGroup } from '../commands.js';
import { socketPath as defaultSocketPath } from '../socket.js';

export interface GlobalFlags {
	json: boolean;
	force: boolean;
	verbose: boolean;
	help: boolean;
	socket: string;
	shard: string | undefined;
	complete: boolean;
	completeIndex: number;
}

export interface ParsedArgv {
	globals: GlobalFlags;
	positionals: string[];
	flags: Map<string, string | true>;
}

export type SchemaCommand = CommandSchemaGroup['commands'][number];

const GLOBAL_FLAGS = new Set([
	'--json', '--force', '--verbose', '--help', '-h', '--socket', '--shard', '--complete',
]);

export function toKebab(camel: string): string {
	return camel.replace(/[A-Z]/g, ch => `-${ch.toLowerCase()}`);
}

export function parseArgv(raw: readonly string[]): ParsedArgv {
	const globals: GlobalFlags = {
		json: false, force: false, verbose: false, help: false,
		socket: defaultSocketPath,
		shard: undefined,
		complete: false, completeIndex: -1,
	};
	const positionals: string[] = [];
	const flags = new Map<string, string | true>();

	let idx = 0;
	while (idx < raw.length) {
		const arg = raw[idx++];
		if (arg === '--help' || arg === '-h') { globals.help = true; continue; }
		if (arg === '--json') { globals.json = true; continue; }
		if (arg === '--force') { globals.force = true; continue; }
		if (arg === '--verbose') { globals.verbose = true; continue; }
		if (arg === '--socket') { globals.socket = raw[idx++] ?? ''; continue; }
		if (arg === '--shard') { globals.shard = raw[idx++]; continue; }
		if (arg === '--complete') {
			globals.complete = true;
			const parsedIdx = Number.parseInt(raw[idx++] ?? '', 10);
			globals.completeIndex = Number.isFinite(parsedIdx) ? parsedIdx : raw.length - 2;
			continue;
		}
		if (arg.startsWith('--')) {
			// Per-command flag: `--flag=value`, `--flag value`, or bare boolean.
			const eq = arg.indexOf('=');
			if (eq === -1) {
				// GLOBAL_FLAGS.has catches short-form globals like `-h` that don't start with `--`.
				const next = raw.at(idx);
				if (next !== undefined && !next.startsWith('--') && !GLOBAL_FLAGS.has(next)) {
					flags.set(arg.slice(2), next);
					++idx;
				} else {
					flags.set(arg.slice(2), true);
				}
			} else {
				flags.set(arg.slice(2, eq), arg.slice(eq + 1));
			}
			continue;
		}
		positionals.push(arg);
	}
	return { globals, positionals, flags };
}

function coerceValue(raw: string, kind: CommandArgField['kind'] | 'object' | 'callback', where: string): unknown {
	if (kind === 'string') return raw;
	if (kind === 'number') {
		const num = Number(raw);
		if (!Number.isFinite(num)) throw new Error(`${where}: expected number, got "${raw}"`);
		return num;
	}
	if (kind === 'boolean') {
		if (raw === 'true' || raw === '1') return true;
		if (raw === 'false' || raw === '0') return false;
		throw new Error(`${where}: expected boolean (true|false), got "${raw}"`);
	}
	if (kind === 'json') {
		try { return JSON.parse(raw); } catch {
			throw new Error(`${where}: expected JSON, got "${raw}"`);
		}
	}
	throw new Error(`${where}: kind "${kind}" cannot be supplied via admin CLI`);
}

export function buildCallArgs(cmd: SchemaCommand, parsed: ParsedArgv): unknown[] {
	const out: unknown[] = [];
	const positional = [ ...parsed.positionals ];
	const used = new Set<string>();

	for (const arg of cmd.args) {
		if (arg.kind === 'callback') {
			throw new Error(`Command takes a JavaScript callback "${arg.name}" — use the REPL instead`);
		}
		if (arg.kind === 'object') {
			const shape = arg.shape ?? {};
			const obj: Record<string, unknown> = {};
			const oneOfSeen = new Map<string, string>();
			for (const [ fieldName, field ] of Object.entries(shape)) {
				const flagName = toKebab(fieldName);
				used.add(flagName);
				const value = parsed.flags.get(flagName);
				if (value === undefined) {
					if (field.required) {
						throw new Error(`Missing required option: --${flagName}`);
					}
					continue;
				}
				if (value === true) {
					// Bare boolean-ish flag; only valid for boolean fields.
					if (field.kind !== 'boolean') {
						throw new Error(`Option --${flagName} needs a value`);
					}
					obj[fieldName] = true;
				} else {
					obj[fieldName] = coerceValue(value, field.kind, `--${flagName}`);
				}
				if (field.oneOf !== undefined) {
					const existing = oneOfSeen.get(field.oneOf);
					if (existing !== undefined) throw new Error(`--${toKebab(existing)} and --${flagName} are mutually exclusive`);
					oneOfSeen.set(field.oneOf, fieldName);
				}
			}
			out.push(obj);
			continue;
		}
		const token = positional.shift();
		if (token === undefined) {
			if (arg.optional) continue;
			throw new Error(`Missing required argument: <${arg.name}>`);
		}
		out.push(coerceValue(token, arg.kind, `<${arg.name}>`));
	}

	if (positional.length > 0) {
		throw new Error(`Unexpected extra argument: "${positional[0]}"`);
	}
	// Warn about unknown --flags so typos don't silently disappear.
	for (const flag of parsed.flags.keys()) {
		if (!used.has(flag)) {
			throw new Error(`Unknown option: --${flag}`);
		}
	}
	return out;
}
