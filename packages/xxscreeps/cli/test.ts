import type { CliStreams } from './console.js';
import type { ContextConsole } from './context.js';
import type { EvalEnvelope } from './envelope.js';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { createCuratedContext } from './context.js';
import { evaluateInContext, recoverableSyntaxError, runEval } from './evaluate.js';

const xxscreepsBin = fileURLToPath(new URL('../../bin/xxscreeps.js', import.meta.url));

const noopConsole: ContextConsole = { error() {}, info() {}, log() {}, warn() {} };

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

describe('cli', () => {
	test('repl: vars persist across turns', async () => {
		const context = createCuratedContext({ console: noopConsole });
		const first = await evaluateInContext(context, 'var counter = 41; counter');
		assert.strictEqual(first, 41);
		const second = await evaluateInContext(context, 'counter += 1');
		assert.strictEqual(second, 42);
	});

	test('repl: top-level await resolves', async () => {
		const context = createCuratedContext({ console: noopConsole });
		const value = await evaluateInContext(context, 'await Promise.resolve(99)');
		assert.strictEqual(value, 99);
	});

	test('repl: statement with top-level await falls through to async-block', async () => {
		// Raw fails (await outside async), expression fails (`let` in expression position),
		// only the async-block candidate compiles and runs.
		const logs: unknown[][] = [];
		const recordingConsole: ContextConsole = {
			error() {}, info() {}, log: (...args) => logs.push(args), warn() {},
		};
		const context = createCuratedContext({ console: recordingConsole });
		const result = await evaluateInContext(context, 'let y = await Promise.resolve(99); console.log(y)');
		assert.strictEqual(result, undefined);
		assert.deepStrictEqual(logs, [ [ 99 ] ]);
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

	test('eval: curated context omits host globals', async () => {
		const streams = captureStreams();
		const exitCode = await runEval({
			argv: [],
			json: false,
			source: '[ typeof process, typeof require, typeof Buffer ]',
			streams,
		});
		assert.strictEqual(exitCode, 0);
		assert.match(streams.stdoutText(), /'undefined',\s*'undefined',\s*'undefined'/);
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
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xxscreeps-cli-'));
		const file = path.join(dir, 'fixture.js');
		try {
			await fs.writeFile(file, 'console.log("from-file"); 6 * 7\n', 'utf8');
			const result = await spawnXxscreeps([ 'eval', '--file', file ]);
			assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);
			assert.match(result.stdout, /from-file/);
			assert.match(result.stdout, /\n42\n$/);
		} finally {
			await fs.rm(dir, { force: true, recursive: true });
		}
	});

	test('eval: --stdin reads source from stdin', async () => {
		const result = await spawnXxscreeps([ 'eval', '--stdin' ], '2 + 3');
		assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);
		assert.match(result.stdout, /^5\n$/);
	});
});
