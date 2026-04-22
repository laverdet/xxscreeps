/**
 * Extensibility surface for CLI commands. Third-party mods register command
 * groups via `hooks.register('commands', ...)`; everything the server needs
 * to build help, tab-completion, and the VM sandbox tree comes from this one
 * schema.
 *
 * The runtime helpers at the bottom (`withGameLock`, `clearAllWorldCaches`)
 * are exported because any third-party command that writes shard state or
 * mutates world membership must use them to preserve invariants that the
 * schema itself can't enforce.
 */

import type { PauseCoordinator, Sandbox } from './sandbox.js';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import { Mutex } from 'xxscreeps/engine/db/mutex.js';

/**
 * Operator-facing error: handlers throw this to reject invalid input or report
 * a missing target. Sandbox renders it as `message` alone (no stack), since
 * the location of the throw is noise to the operator. Plain `Error` is still
 * right for unexpected failures — those want the stack trace.
 */
export class CliError extends Error {
	override name = 'CliError';
}

/** Concrete kinds understood by the admin CLI flag translator. */
export type CommandArgKind =
	| 'string' |
	'number' |
	'boolean' |
	/** Nested object whose fields are described by `shape`; each field becomes a flag in admin CLI. */
	'object' |
	/** User-supplied JavaScript callback — expressible in the REPL, rejected by admin CLI. */
	'callback' |
	/** Raw JSON — admin CLI parses the flag value with JSON.parse. */
	'json';

export interface CommandArgField {
	readonly kind: Exclude<CommandArgKind, 'object' | 'callback'>;
	readonly required?: boolean;
	readonly description?: string;
	/**
	 * Fields sharing a `oneOf` key form an exclusive group: exactly one may be
	 * set. Used for `{ modules | codeDir | package }`-style arg bundles.
	 */
	readonly oneOf?: string;
}

export interface CommandArg {
	/** Positional argument name shown in signatures and admin --help. */
	readonly name: string;
	readonly kind: CommandArgKind;
	readonly optional?: boolean;
	readonly description?: string;
	/**
	 * Display-only signature override (e.g., `"(room, Game) => any"` for callbacks).
	 * If absent, a signature is derived from `kind` + `shape`.
	 */
	readonly type?: string;
	/** Required when kind === 'object'. Describes each flag field. */
	readonly shape?: Readonly<Record<string, CommandArgField>>;
}

export interface Command {
	/** Short name within the group, e.g. `pauseSimulation`. */
	readonly name: string;
	/** One-line description shown in `help()` and `admin --help`. */
	readonly description: string;
	readonly args?: readonly CommandArg[];
	/** Returned value = success; throw to signal failure. Admin CLI maps throws to exit 1. */
	// `never[]` so specific-typed handlers remain assignable to this shape.
	readonly handler: (...args: never[]) => unknown;
	/**
	 * If true, the admin CLI requires `--force` (or an interactive TTY
	 * confirmation prompt) before invoking. Destructive = irrecoverable or
	 * server-wide — single-target removes like bots.remove don't need this
	 * because the operator already named the target.
	 */
	readonly destructive?: boolean;
	/**
	 * If true, the command's effect requires the CLI connection to stay open
	 * for meaningful behavior (e.g., `pauseSimulation` — released on socket
	 * close). The admin CLI disconnects after each command, so it refuses these
	 * with a hint to use the interactive REPL.
	 */
	readonly interactiveOnly?: boolean;
	/**
	 * If true, the handler requires `system.pauseSimulation` to be held. The
	 * admin CLI auto-wraps such commands in a single pause/resume IIFE since
	 * pause releases on socket close.
	 */
	readonly requiresPause?: boolean;
	/**
	 * Usage example(s) shown in `xxscreeps admin <group> <cmd> --help`.
	 * Multiple examples may be joined with newlines.
	 */
	readonly example?: string;
}

export interface CommandGroup {
	/** Group name exposed as a top-level sandbox property, e.g. `system`. */
	readonly name: string;
	/** Short description of the group (shown above its command list in help). */
	readonly description?: string;
	readonly commands: readonly Command[];
}

/** Snapshot of a group suitable for JSON transport to the REPL and admin CLI. */
export interface CommandSchemaGroup {
	readonly name: string;
	readonly description?: string;
	readonly commands: readonly {
		readonly name: string;
		readonly description: string;
		readonly args: readonly CommandArg[];
		readonly destructive?: boolean;
		readonly interactiveOnly?: boolean;
		readonly requiresPause?: boolean;
		readonly example?: string;
	}[];
}

/**
 * Convert the registered schema into the nested plain-object tree that the
 * VM sandbox exposes. If two mods register the same `group.command` name the
 * first one wins and the duplicate is logged — silently overwriting would
 * hide conflicts that the operator should know about.
 */
export function buildCommandTree(groups: Iterable<CommandGroup>): Record<string, Record<string, Command['handler']>> {
	const tree: Record<string, Record<string, Command['handler']>> = {};
	for (const group of groups) {
		const members = tree[group.name] ??= {};
		for (const cmd of group.commands) {
			if (Object.hasOwn(members, cmd.name)) {
				console.warn(`CLI: duplicate command ${group.name}.${cmd.name} ignored`);
				continue;
			}
			members[cmd.name] = cmd.handler;
		}
	}
	return tree;
}

/** Machine-readable snapshot for REPL tab completion, admin CLI, and tooling. */
export function commandSchema(groups: readonly CommandGroup[]): readonly CommandSchemaGroup[] {
	return groups.map(group => ({
		name: group.name,
		...group.description === undefined ? {} : { description: group.description },
		commands: group.commands.map(cmd => ({
			name: cmd.name,
			description: cmd.description,
			args: cmd.args ?? [],
			...cmd.destructive ? { destructive: true } : {},
			...cmd.interactiveOnly ? { interactiveOnly: true } : {},
			...cmd.requiresPause ? { requiresPause: true } : {},
			...cmd.example === undefined ? {} : { example: cmd.example },
		})),
	}));
}

/** Default display type for an arg when `type` isn't overridden on the arg. */
function defaultArgType(arg: CommandArg): string {
	if (arg.kind === 'object' && arg.shape) {
		// Render shape as `{ field1, field2, fieldA|fieldB|fieldC }` — collapse
		// `oneOf` groups into a single pipe-delimited slot.
		const byGroup = new Map<string | undefined, string[]>();
		for (const [ name, field ] of Object.entries(arg.shape)) {
			const key = field.oneOf;
			const existing = byGroup.get(key);
			if (existing === undefined) byGroup.set(key, [ name ]);
			else existing.push(name);
		}
		const parts: string[] = [];
		for (const [ key, names ] of byGroup) {
			parts.push(key === undefined ? names.join(', ') : names.join('|'));
		}
		return `{ ${parts.join(', ')} }`;
	}
	return arg.kind;
}

function formatSignature(group: CommandGroup, cmd: Command) {
	const args = cmd.args?.map(arg => {
		const typeStr = arg.type ?? defaultArgType(arg);
		const base = `${arg.name}: ${typeStr}`;
		return arg.optional ? `${base}?` : base;
	}).join(', ') ?? '';
	return `${group.name}.${cmd.name}(${args})`;
}

/**
 * Soft-wrap at word boundaries, indenting continuation lines to `descCol`.
 * Single words wider than the budget pass through intact to avoid mangling
 * identifiers.
 */
function wrapDescription(text: string, descCol: number, maxWidth: number): string {
	const available = Math.max(20, maxWidth - descCol);
	const indent = ' '.repeat(descCol);
	const out: string[] = [];
	for (const paragraph of text.split('\n')) {
		const words = paragraph.split(/\s+/).filter(word => word !== '');
		if (words.length === 0) {
			out.push('');
			continue;
		}
		let current = words[0];
		const wrapped: string[] = [];
		for (let idx = 1; idx < words.length; ++idx) {
			const word = words[idx];
			if (current.length + 1 + word.length <= available) {
				current += ' ' + word;
			} else {
				wrapped.push(current);
				current = word;
			}
		}
		wrapped.push(current);
		out.push(wrapped.join(`\n${indent}`));
	}
	return out.join(`\n${indent}`);
}

/**
 * Human-readable help, optionally filtered by case-insensitive substring match
 * against the full command name, group name, or description.
 */
export function formatHelp(
	groups: readonly CommandGroup[],
	builtins: readonly { readonly name: string; readonly description: string }[],
	pattern?: string,
): string {
	const needle = pattern?.toLowerCase();
	const matches = (text: string) => needle === undefined || text.toLowerCase().includes(needle);

	const lines: string[] = [];
	// Signature column is 2 (indent) + 42 (sig) + 2 (gap) = description starts at 46.
	// Long sigs wrap onto their own line and the next line aligns the description
	// to the same column 46 so continuations look uniform regardless of sig length.
	const SIG_WIDTH = 42;
	const DESC_COL = 46;
	// Fixed maximum: the server has no view of the client's terminal width (output
	// goes to the socket, not a TTY), so we pick a readable default rather than
	// emitting unbounded single-line descriptions.
	const MAX_WIDTH = 100;
	const pad = (sig: string) => sig.length < SIG_WIDTH
		? sig.padEnd(SIG_WIDTH)
		: `${sig}\n${' '.repeat(DESC_COL - 2)}`;

	// Built-ins first so users see `help`/`print`/`exit` without scrolling.
	const visibleBuiltins = builtins.filter(item => matches(item.name) || matches(item.description));
	if (visibleBuiltins.length > 0) {
		lines.push('Built-ins');
		for (const item of visibleBuiltins) {
			lines.push(`  ${pad(item.name)}  ${wrapDescription(item.description, DESC_COL, MAX_WIDTH)}`);
		}
	}

	for (const group of groups) {
		const groupMatchedByName = needle !== undefined && matches(group.name);
		const visible = group.commands.filter(cmd =>
			groupMatchedByName ||
			matches(`${group.name}.${cmd.name}`) ||
			matches(cmd.description));
		if (visible.length === 0) continue;
		if (lines.length > 0) lines.push('');
		const header = group.description === undefined ? group.name : `${group.name} — ${group.description}`;
		lines.push(header);
		for (const cmd of visible) {
			lines.push(`  ${pad(formatSignature(group, cmd))}  ${wrapDescription(cmd.description, DESC_COL, MAX_WIDTH)}`);
		}
	}

	if (lines.length === 0) {
		return needle === undefined
			? 'No commands registered.'
			: `No commands matched "${pattern}".`;
	}
	return lines.join('\n');
}

/**
 * Serialize a destructive CLI action against the processor's tick loop. If an
 * operator has already called `system.pauseSimulation()`, the existing hold
 * is reused; otherwise the `game` mutex is acquired for the duration of
 * `action`. Any third-party command that writes shard state (rooms, users,
 * intents, scratch) should wrap its work in this — writing without it races
 * `main.ts`'s tick and trips `checkTime` on `saveRoom`.
 */
export async function withGameLock<T>(pause: PauseCoordinator, shard: Shard, action: () => Promise<T>): Promise<T> {
	if (pause.mutex !== undefined) return action();
	const mutex = await Mutex.connect('game', shard.data, shard.pubsub);
	try {
		return await mutex.scope(action);
	} finally {
		await mutex.disconnect();
	}
}

/**
 * Invalidate the cached `World` on every shard the sandbox has opened. Call
 * after any command that mutates terrain, the active-rooms set, or room
 * blobs — otherwise a follow-up `rooms.peek` in the same session operates on
 * stale terrain/exits. Cheap: forces a single `loadWorld()` on next access.
 */
export function clearAllWorldCaches(getSandbox: () => Sandbox) {
	for (const shardEntry of getSandbox().shardEntries.values()) {
		delete shardEntry.worldCache;
	}
}
