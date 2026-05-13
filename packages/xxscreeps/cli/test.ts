import type { CliConsole, CliStreams } from './console.js';
import type { EvalEnvelope } from './envelope.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { evaluateOffline, runEval } from './eval-offline.js';
import { recoverableSyntaxError } from './recoverable.js';

const xxscreepsBin = fileURLToPath(new URL('../../bin/xxscreeps.js', import.meta.url));

interface CapturedStreams extends CliStreams {
	stderrText: () => string;
	stdoutText: () => string;
}

function captureStreams(): CapturedStreams {
	const stdoutChunks: string[] = [];
	const stderrChunks: string[] = [];
	return {
		stderr: { write: chunk => stderrChunks.push(chunk) },
		stdout: { write: chunk => stdoutChunks.push(chunk) },
		stderrText: () => stderrChunks.join(''),
		stdoutText: () => stdoutChunks.join(''),
	};
}

interface SpawnResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

function spawnXxscreeps(args: readonly string[], stdin?: string) {
	return new Promise<SpawnResult>((resolve, reject) => {
		const child = spawn(process.execPath, [ xxscreepsBin, ...args ], {
			stdio: [ 'pipe', 'pipe', 'pipe' ],
		});
		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];
		child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
		child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
		child.on('error', reject);
		child.on('exit', code => resolve({
			exitCode: code ?? 1,
			stderr: Buffer.concat(stderrChunks).toString('utf8'),
			stdout: Buffer.concat(stdoutChunks).toString('utf8'),
		}));
		child.stdin.end(stdin ?? '');
	});
}

function installConsole(replacement: CliConsole) {
	const previous = globalThis.console;
	globalThis.console = replacement as unknown as Console;
	return {
		[Symbol.dispose]() {
			globalThis.console = previous;
		},
	};
}

describe('cli', () => {
	test('repl: vars persist across turns', async () => {
		try {
			const first = await evaluateOffline('var __cliReplCounter = 41; __cliReplCounter');
			assert.strictEqual(first, 41);
			const second = await evaluateOffline('__cliReplCounter += 1');
			assert.strictEqual(second, 42);
		} finally {
			delete (globalThis as Record<string, unknown>).__cliReplCounter;
		}
	});

	test('repl: top-level await resolves', async () => {
		const value = await evaluateOffline('await Promise.resolve(99)');
		assert.strictEqual(value, 99);
	});

	test('repl: statement with top-level await falls through to async-block', async () => {
		// Indirect eval rejects await; expression wrap rejects let-statement;
		// only the async-block wrap parses and runs.
		const logs: unknown[][] = [];
		const recordingConsole: CliConsole = {
			error() {}, info() {}, log: (...args) => logs.push(args), warn() {},
		};
		using shared = installConsole(recordingConsole);
		const result = await evaluateOffline('let y = await Promise.resolve(99); console.log(y)');
		assert.strictEqual(result, undefined);
		assert.deepStrictEqual(logs, [ [ 99 ] ]);
	});

	test('repl: top-level await whose awaited callback throws SyntaxError runs source once', async () => {
		// Regression for the wrap-retry double-execution shape: indirect eval rejects
		// for top-level await, so `evaluateOffline` falls through to the AsyncFunction
		// wrap. If that wrap parses but the awaited callback throws a SyntaxError at
		// runtime, the error must propagate — not trigger a wrapBlock retry that
		// re-runs the side effect.
		const logs: unknown[][] = [];
		const recordingConsole: CliConsole = {
			error() {}, info() {}, log: (...args) => logs.push(args), warn() {},
		};
		using shared = installConsole(recordingConsole);
		await assert.rejects(
			() => evaluateOffline(
				'await Promise.resolve().then(() => { console.log("once"); throw new SyntaxError("boom"); })'),
			/boom/);
		assert.deepStrictEqual(logs, [ [ 'once' ] ]);
	});

	test('repl: parenthesised top-level await falls through to async wrap', async () => {
		// In script mode `await` lexes as an identifier, so `(await Promise...)` errors
		// on the next token ("Unexpected identifier 'Promise'") instead of "await is only
		// valid". The cascade must still retry through the async wrap.
		const value = await evaluateOffline('(await Promise.resolve(99)).valueOf()');
		assert.strictEqual(value, 99);
	});

	test('repl: SyntaxError unrelated to top-level await still rejects', async () => {
		// Guard that the cascade doesn't swallow real syntax errors: both async wraps
		// will fail to parse this too, and the final error must propagate.
		await assert.rejects(
			() => evaluateOffline('1 + )'),
			(err: unknown) => err instanceof SyntaxError);
	});

	test('repl: incomplete input is reported recoverable', () => {
		assert.ok(recoverableSyntaxError('if (true) {') instanceof SyntaxError);
		assert.ok(recoverableSyntaxError('await Promise.resolve(') instanceof SyntaxError);
		assert.strictEqual(recoverableSyntaxError('1 + 1'), undefined);
		assert.strictEqual(recoverableSyntaxError('await Promise.resolve(1)'), undefined);
	});

	test('repl: meta-commands work in a real session', async () => {
		const result = await spawnXxscreeps([ 'cli' ], '.exit\n');
		assert.strictEqual(result.exitCode, 0);
	});

	test('eval: runtime SyntaxError does not retrigger console.log', async () => {
		// Regression for the candidate-retry double-execution shape laverdet flagged
		// on an earlier revision: when the source parses cleanly but throws a runtime
		// SyntaxError (here `JSON.parse("}")`), the eval primitive must not mistake
		// the runtime throw for a parse failure and re-execute the source. `1` must
		// log exactly once, not 3-4 times.
		const streams = captureStreams();
		const exitCode = await runEval({
			argv: [],
			json: false,
			source: 'console.log(1); JSON.parse("}");',
			streams,
		});
		assert.strictEqual(exitCode, 1);
		const ones = (streams.stdoutText().match(/^1$/gm) ?? []).length;
		assert.strictEqual(ones, 1, `expected '1' logged exactly once, got stdout: ${JSON.stringify(streams.stdoutText())}`);
	});

	test('eval: -e prints inspected result with exit 0', async () => {
		const streams = captureStreams();
		const exitCode = await runEval({
			argv: [],
			json: false,
			source: 'console.log("hello"); 1 + 41',
			streams,
		});
		assert.strictEqual(exitCode, 0);
		assert.strictEqual(streams.stderrText(), '');
		const stdout = streams.stdoutText();
		assert.match(stdout, /^hello\n/);
		assert.match(stdout, /\n42\n$/);
	});

	test('eval: thrown error writes to stderr with exit 1', async () => {
		const streams = captureStreams();
		const exitCode = await runEval({
			argv: [],
			json: false,
			source: 'throw new Error("boom")',
			streams,
		});
		assert.strictEqual(exitCode, 1);
		assert.strictEqual(streams.stdoutText(), '');
		assert.match(streams.stderrText(), /boom/);
	});

	test('eval: --json envelope shape on success and on throw', async () => {
		const success = captureStreams();
		const okExit = await runEval({
			argv: [],
			json: true,
			source: 'console.log("note"); console.warn("careful"); console.error("oops"); 7',
			streams: success,
		});
		assert.strictEqual(okExit, 0);
		const okEnvelope = JSON.parse(success.stdoutText().trim()) as unknown as EvalEnvelope;
		if (!okEnvelope.ok) {
			assert.fail(`expected ok envelope, got ${JSON.stringify(okEnvelope)}`);
		}
		assert.strictEqual(okEnvelope.result, 7);
		assert.deepStrictEqual(okEnvelope.logs, [ 'note' ]);
		assert.deepStrictEqual(okEnvelope.warnings, [ 'careful' ]);
		assert.deepStrictEqual(okEnvelope.errors, [ 'oops' ]);

		const failure = captureStreams();
		const errExit = await runEval({
			argv: [],
			json: true,
			source: 'throw new Error("kaboom")',
			streams: failure,
		});
		assert.strictEqual(errExit, 1);
		const errEnvelope = JSON.parse(failure.stdoutText().trim()) as unknown as EvalEnvelope;
		if (errEnvelope.ok) {
			assert.fail(`expected err envelope, got ${JSON.stringify(errEnvelope)}`);
		}
		assert.strictEqual(errEnvelope.thrown.name, 'Error');
		assert.strictEqual(errEnvelope.thrown.message, 'kaboom');
		assert.ok(errEnvelope.thrown.stack.includes('kaboom'));
	});

	test('eval: --json marks non-JSON-serializable results', async () => {
		const streams = captureStreams();
		const exitCode = await runEval({
			argv: [],
			json: true,
			source: '1n',
			streams,
		});
		assert.strictEqual(exitCode, 0);
		const envelope = JSON.parse(streams.stdoutText().trim()) as unknown as EvalEnvelope;
		if (!envelope.ok) {
			assert.fail(`expected ok envelope, got ${JSON.stringify(envelope)}`);
		}
		assert.deepStrictEqual(envelope.result, { __nonJsonResult: '1n' });
	});

	test('eval: argv is exposed to the script', async () => {
		const streams = captureStreams();
		const exitCode = await runEval({
			argv: [ 'one', 'two' ],
			json: false,
			source: 'argv.join("|")',
			streams,
		});
		assert.strictEqual(exitCode, 0);
		assert.match(streams.stdoutText(), /'one\|two'/);
	});

	test('eval: --file reads source from the filesystem', async () => {
		const file = fileURLToPath(new URL('../../cli/test-data/eval-source.js', import.meta.url));
		const result = await spawnXxscreeps([ 'eval', '--file', file ]);
		assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);
		assert.match(result.stdout, /from-file/);
	});

	test('eval: --stdin reads source from stdin', async () => {
		const result = await spawnXxscreeps([ 'eval', '--stdin' ], '2 + 3');
		assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);
		assert.match(result.stdout, /^5\n$/);
	});
});
