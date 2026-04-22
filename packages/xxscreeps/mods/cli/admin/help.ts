import type { CommandSchemaGroup } from '../commands.js';
import type { ParsedArgv, SchemaCommand } from './argv.js';
import { toKebab } from './argv.js';

export function topHelp(groups: readonly CommandSchemaGroup[]): string {
	return [
		'xxscreeps admin — common server tasks, CLI-style.',
		'',
		'Usage:',
		'  xxscreeps admin <group> <command> [args...] [options]',
		'',
		'Groups:',
		...groups.map(group => `  ${group.name.padEnd(10)} ${group.description ?? ''}`.trimEnd()),
		'',
		'Global options:',
		'  --json               Emit structured JSON instead of formatted text',
		'  --force              Skip confirmation on destructive commands',
		'  --verbose            Include stack traces on errors',
		'  --socket <path>      Connect to a specific CLI socket',
		'  -h, --help           Show help for a group or command',
		'',
		'For group details:     xxscreeps admin <group> --help',
		'For command details:   xxscreeps admin <group> <command> --help',
		'',
		'Power-user REPL:       xxscreeps           (interactive JavaScript)',
		'Offline direct mode:   xxscreeps cli       (direct DB access, no server)',
	].join('\n');
}

export function groupHelp(group: CommandSchemaGroup): string {
	const lines = [ `${group.name} — ${group.description ?? ''}`.trimEnd(), '', 'Commands:' ];
	for (const cmd of group.commands) {
		const tags: string[] = [];
		if (cmd.destructive) tags.push('destructive');
		if (cmd.interactiveOnly) tags.push('interactive-only');
		const suffix = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
		lines.push(`  ${toKebab(cmd.name).padEnd(22)}  ${cmd.description}${suffix}`);
	}
	lines.push('', `For command details: xxscreeps admin ${group.name} <command> --help`);
	return lines.join('\n');
}

export function commandHelp(group: CommandSchemaGroup, cmd: SchemaCommand): string {
	const positional = cmd.args.filter(arg => arg.kind !== 'object' && arg.kind !== 'callback');
	const objectArg = cmd.args.find(arg => arg.kind === 'object');
	const callbackArg = cmd.args.find(arg => arg.kind === 'callback');

	const posSig = positional.map(arg => arg.optional ? `[${arg.name}]` : `<${arg.name}>`).join(' ');
	const usage = `xxscreeps admin ${group.name} ${toKebab(cmd.name)}` +
		(posSig === '' ? '' : ` ${posSig}`) +
		(objectArg ? ' [options]' : '');

	const lines: string[] = [
		`${group.name} ${toKebab(cmd.name)} — ${cmd.description}`,
		'',
		'Usage:',
		`  ${usage}`,
	];

	if (positional.length > 0) {
		lines.push('', 'Arguments:');
		for (const arg of positional) {
			const label = arg.optional ? `[${arg.name}]` : `<${arg.name}>`;
			const suffix = arg.description === undefined ? '' : ` — ${arg.description}`;
			lines.push(`  ${label.padEnd(22)}  (${arg.kind})${suffix}`);
		}
	}

	if (objectArg?.shape) {
		lines.push('', 'Options:');
		for (const [ fieldName, field ] of Object.entries(objectArg.shape)) {
			const flag = `--${toKebab(fieldName)}`;
			const meta: string[] = [ `(${field.kind})` ];
			if (field.required) meta.push('required');
			if (field.oneOf !== undefined) meta.push(`one of: ${field.oneOf}`);
			const suffix = field.description === undefined ? '' : ` — ${field.description}`;
			lines.push(`  ${flag.padEnd(22)}  ${meta.join(' ')}${suffix}`);
		}
	}

	if (callbackArg) {
		lines.push('', `This command takes a JavaScript callback (${callbackArg.type ?? 'function'}).`);
		lines.push('It is not expressible through admin CLI flags — use the interactive REPL:');
		lines.push('  xxscreeps');
	}

	if (cmd.destructive) {
		lines.push('', 'This command is destructive. Pass --force to skip the confirmation prompt.');
	}

	if (cmd.interactiveOnly) {
		lines.push('', 'This command is interactive-only — its effect is tied to the CLI session');
		lines.push('and releases on disconnect. Admin will refuse it; use the interactive REPL.');
	}

	if (cmd.example !== undefined) {
		lines.push('', 'Example:', `  ${cmd.example}`);
	}

	return lines.join('\n');
}

export function bashCompletionScript(): string {
	// Single-quoted strings contain bash `${...}` expansions, not JS templates.
	return [
		'# xxscreeps admin bash completion. Install with:',
		'#   xxscreeps admin completion bash > /etc/bash_completion.d/xxscreeps',
		'# or source it directly from your shell rc.',
		'_xxscreeps_admin() {',
		'  local cur words cword',
		'  COMPREPLY=()',
		// eslint-disable-next-line no-template-curly-in-string
		'  cur="${COMP_WORDS[COMP_CWORD]}"',
		'  # Ask the tool itself what completions it would suggest.',
		'  local suggestions',
		// eslint-disable-next-line no-template-curly-in-string
		'  suggestions="$(xxscreeps admin --complete "$COMP_CWORD" "${COMP_WORDS[@]}" 2>/dev/null)"',
		'  COMPREPLY=( $(compgen -W "$suggestions" -- "$cur") )',
		'  return 0',
		'}',
		'complete -F _xxscreeps_admin xxscreeps',
	].join('\n');
}

export function completeWords(parsed: ParsedArgv, groups: readonly CommandSchemaGroup[]): string {
	// Shell passes the full command line; trim the leading "admin".
	const argv = [ ...parsed.positionals ];
	while (argv.length > 0 && argv[0] !== 'admin') argv.shift();
	if (argv[0] === 'admin') argv.shift();
	if (argv.length <= 1) {
		return groups.map(group => group.name).concat('completion').join(' ');
	}
	const groupName = argv[0];
	if (argv.length === 2) {
		const match = groups.find(group => group.name === groupName);
		return match === undefined ? '' : match.commands.map(cmd => toKebab(cmd.name)).join(' ');
	}
	const matchedGroup = groups.find(group => group.name === groupName);
	const matchedCmd = matchedGroup?.commands.find(cmd => toKebab(cmd.name) === argv[1]);
	if (matchedCmd === undefined) return '';
	const shape = matchedCmd.args.find(arg => arg.kind === 'object')?.shape ?? {};
	return Object.keys(shape).map(field => `--${toKebab(field)}`).join(' ');
}
