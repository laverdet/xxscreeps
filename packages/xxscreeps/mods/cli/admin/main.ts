/**
 * Lightweight admin CLI — translates shell-style `xxscreeps admin <group>
 * <command> [args] [flags]` invocations into socket calls against the running
 * server. The full command schema is fetched at runtime so third-party mods
 * that register command groups are reachable with zero client-side work.
 *
 * This is the friendly surface for new users and one-shot admin tasks. The
 * interactive REPL (`xxscreeps`) and offline direct-DB mode (`xxscreeps cli`)
 * remain the tools for power users who want JavaScript expressions.
 */

import readline from 'node:readline';
import { buildCallArgs, parseArgv, toKebab } from './argv.js';
import { bashCompletionScript, commandHelp, completeWords, groupHelp, topHelp } from './help.js';
import { callOnce, fetchSchema } from './socket.js';

function confirmDestructive(group: string, command: string): Promise<boolean> {
	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		return Promise.resolve(false);
	}
	return new Promise(resolve => {
		const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
		rl.question(
			`DESTRUCTIVE: \`${group} ${toKebab(command)}\` irreversibly alters server state. Continue? [y/N] `,
			answer => {
				rl.close();
				resolve(/^y(es)?$/i.test(answer.trim()));
			},
		);
	});
}

async function main() {
	const raw = process.argv.slice(2);
	const parsed = parseArgv(raw);

	// Completion runs first so tab-complete stays snappy; fall back silently
	// when the server is down so the shell doesn't spam errors.
	if (parsed.globals.complete) {
		try {
			const groups = await fetchSchema(parsed.globals.socket);
			process.stdout.write(completeWords(parsed, groups));
		} catch { /* ignore */ }
		return;
	}

	if (parsed.positionals[0] === 'completion' && parsed.positionals[1] === 'bash') {
		process.stdout.write(bashCompletionScript() + '\n');
		return;
	}

	if (parsed.positionals.length === 0) {
		try {
			const groups = await fetchSchema(parsed.globals.socket);
			console.log(topHelp(groups));
		} catch (err: unknown) {
			// Fall back to static help so `admin --help` works without a server.
			console.log(topHelp([]));
			if (parsed.globals.verbose) console.error(err instanceof Error ? err.message : String(err));
		}
		return;
	}

	const groups = await fetchSchema(parsed.globals.socket);
	const groupName = parsed.positionals[0];
	const group = groups.find(candidate => candidate.name === groupName);
	if (group === undefined) {
		console.error(`Unknown group "${groupName}". Groups: ${groups.map(candidate => candidate.name).join(', ')}`);
		process.exit(2);
	}

	if (parsed.positionals.length === 1) {
		console.log(groupHelp(group));
		return;
	}

	const commandKebab = parsed.positionals[1];
	const cmd = group.commands.find(candidate => toKebab(candidate.name) === commandKebab);
	if (cmd === undefined) {
		const names = group.commands.map(candidate => toKebab(candidate.name)).join(', ');
		console.error(`Unknown command "${groupName} ${commandKebab}". Commands in this group: ${names}`);
		process.exit(2);
	}

	if (parsed.globals.help) {
		console.log(commandHelp(group, cmd));
		return;
	}

	// Admin disconnects after each call, so interactive-only effects would
	// auto-release immediately.
	if (cmd.interactiveOnly) {
		console.error(`'${group.name} ${toKebab(cmd.name)}' is interactive-only — its effect is tied to the CLI session and releases on disconnect. Use the interactive REPL instead:\n  xxscreeps`);
		process.exit(2);
	}

	if (cmd.destructive && !parsed.globals.force) {
		const ok = await confirmDestructive(group.name, cmd.name);
		if (!ok) {
			console.error(process.stdin.isTTY && process.stdout.isTTY
				? 'Aborted.'
				: 'Refusing to run destructive command non-interactively without --force.');
			process.exit(process.stdin.isTTY && process.stdout.isTTY ? 1 : 2);
		}
	}

	const callArgs = buildCallArgs(cmd, {
		...parsed,
		positionals: parsed.positionals.slice(2),
	});
	const jsArgs = callArgs.map(arg => JSON.stringify(arg)).join(', ');
	const call = `${group.name}.${cmd.name}(${jsArgs})`;
	// requiresPause demands pause+call+resume within one socket lifetime, since
	// pause releases on disconnect and admin reconnects per invocation.
	const inner = cmd.requiresPause
		? `(async () => { await system.pauseSimulation(); try { return await ${call}; } finally { await system.resumeSimulation(); } })()`
		: call;
	const expression = parsed.globals.json ? `JSON.stringify(await ${inner})` : inner;
	const response = await callOnce(parsed.globals.socket, expression);

	if (response.ok === false || response.result === undefined) {
		const error = response.error ?? 'Server returned no result';
		if (parsed.globals.json) {
			console.log(JSON.stringify({ ok: false, error }));
		} else {
			console.error(parsed.globals.verbose && response.stack !== undefined ? response.stack : error);
		}
		process.exit(1);
	}

	if (parsed.globals.json) {
		let value: unknown;
		try {
			value = JSON.parse(response.result);
		} catch {
			// Handler returned a non-JSON-serializable value (e.g., Map). Pass the
			// display string through so `--json` at least produces valid JSON.
			console.log(JSON.stringify({ ok: true, result: response.result }));
			return;
		}
		console.log(JSON.stringify({ ok: true, result: value }));
	} else {
		console.log(response.result);
	}
}

main().catch((err: unknown) => {
	const message = err instanceof Error ? err.message : String(err);
	console.error(message);
	process.exit(2);
});
