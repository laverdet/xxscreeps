import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as util from 'node:util';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { runEval } from './eval-offline.js';
import { evaluateUnsafeGlobal, makeUnsafeGlobalEvaluator } from './unsafe.js';

const xxscreepsBin = fileURLToPath(new URL('../../xxscreeps.js', import.meta.url));

class TestConsole {
	readonly #previous;
	readonly #logs: string[] = [];
	readonly #errors: string[] = [];

	constructor() {
		this.#previous = globalThis.console;
		// @ts-expect-error
		globalThis.console = this;
	}

	get logs() { return this.#logs.join('\n'); }
	get errors() { return this.#errors.join('\n'); }

	static flatten(this: void, subject: unknown) {
		if (typeof subject === 'string') {
			return subject;
		} else {
			return util.inspect(subject);
		}
	}

	[Symbol.dispose]() {
		globalThis.console = this.#previous;
	}

	log(...args: unknown[]) {
		this.#logs.push(args.map(TestConsole.flatten).join(' '));
	}

	error(...args: unknown[]) {
		this.#errors.push(args.map(TestConsole.flatten).join(' '));
	}
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

describe('cli', () => {
	test('repl: vars persist across turns', async () => {
		try {
			const first = await evaluateUnsafeGlobal('var __cliReplCounter = 41; __cliReplCounter');
			assert.strictEqual(first, 41);
			const second = await evaluateUnsafeGlobal('__cliReplCounter += 1');
			assert.strictEqual(second, 42);
		} finally {
			delete (globalThis as Record<string, unknown>).__cliReplCounter;
		}
	});

	test('repl: top-level await resolves', async () => {
		const value = await evaluateUnsafeGlobal('await Promise.resolve(99)');
		assert.strictEqual(value, 99);
	});

	test('repl: statement with top-level await falls through to async-block', async () => {
		// Indirect eval rejects await; expression wrap rejects let-statement;
		// only the async-block wrap parses and runs.
		using console = new TestConsole();
		const result = await evaluateUnsafeGlobal('let y = await Promise.resolve(99); console.log(y)');
		assert.strictEqual(result, undefined);
		assert.deepStrictEqual(console.logs, '99');
	});

	test('repl: top-level await whose awaited callback throws SyntaxError runs source once', async () => {
		// Regression for the wrap-retry double-execution shape: indirect eval rejects
		// for top-level await, so `evaluateOffline` falls through to the AsyncFunction
		// wrap. If that wrap parses but the awaited callback throws a SyntaxError at
		// runtime, the error must propagate — not trigger a wrapBlock retry that
		// re-runs the side effect.
		using console = new TestConsole();
		await assert.rejects(
			() => evaluateUnsafeGlobal(
				'await Promise.resolve().then(() => { console.log("once"); throw new SyntaxError("boom"); })'),
			/boom/);
		assert.deepStrictEqual(console.logs, 'once');
	});

	test('repl: parenthesised top-level await falls through to async wrap', async () => {
		// In script mode `await` lexes as an identifier, so `(await Promise...)` errors
		// on the next token ("Unexpected identifier 'Promise'") instead of "await is only
		// valid". The cascade must still retry through the async wrap.
		const value = await evaluateUnsafeGlobal('(await Promise.resolve(99)).valueOf()');
		assert.strictEqual(value, 99);
	});

	test('repl: SyntaxError unrelated to top-level await still rejects', async () => {
		// Guard that the cascade doesn't swallow real syntax errors: both async wraps
		// will fail to parse this too, and the final error must propagate.
		await assert.rejects(
			() => evaluateUnsafeGlobal('1 + )'),
			(err: unknown) => err instanceof SyntaxError);
	});

	test('repl: incomplete input is reported recoverable', () => {
		assert.ok(makeUnsafeGlobalEvaluator('if (true) {') instanceof SyntaxError);
		assert.ok(makeUnsafeGlobalEvaluator('await Promise.resolve(') instanceof SyntaxError);
		assert.ok(makeUnsafeGlobalEvaluator('1 + 1') instanceof Function);
		assert.ok(makeUnsafeGlobalEvaluator('await Promise.resolve(1)') instanceof Function);
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
		using console = new TestConsole();
		const exitCode = await runEval({
			argv: [],
			source: 'console.log(1); JSON.parse("}");',
		});
		assert.strictEqual(exitCode, 1);
		const ones = (console.logs.match(/^1$/gm) ?? []).length;
		assert.strictEqual(ones, 1, `expected '1' logged exactly once, got stdout: ${JSON.stringify(console.logs)}`);
	});

	test('eval: -e prints inspected result with exit 0', async () => {
		using console = new TestConsole();
		const exitCode = await runEval({
			argv: [],
			source: 'console.log("hello"); 1 + 41',
		});
		assert.strictEqual(exitCode, 0);
		assert.strictEqual(console.errors, '');
		assert.match(console.logs, /^hello\n/);
		assert.match(console.logs, /\n42$/);
	});

	test('eval: thrown error writes to stderr with exit 1', async () => {
		using console = new TestConsole();
		const exitCode = await runEval({
			argv: [],
			source: 'throw new Error("boom")',
		});
		assert.strictEqual(exitCode, 1);
		assert.strictEqual(console.logs, '');
		assert.match(console.errors, /boom/);
	});

	test('eval: argv is exposed to the script', async () => {
		using console = new TestConsole();
		const exitCode = await runEval({
			argv: [ 'one', 'two' ],
			source: 'argv.join("|")',
		});
		assert.strictEqual(exitCode, 0);
		assert.strictEqual(console.logs, 'one|two');
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
