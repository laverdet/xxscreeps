import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { text } from 'node:stream/consumers';
import { ArgumentParser } from 'argparse';
import { runEval } from './eval-offline.js';

interface ParsedArgs {
	expression: string | null;
	file: string | null;
	stdin: boolean;
	json: boolean;
	argv: string[];
}

const parser = new ArgumentParser({
	description: 'Evaluate one program in the host JS realm.',
	prog: 'xxscreeps eval',
});
const sourceGroup = parser.add_mutually_exclusive_group({ required: true });
sourceGroup.add_argument('-e', '--expression', { dest: 'expression' });
sourceGroup.add_argument('--file', { dest: 'file' });
sourceGroup.add_argument('--stdin', { action: 'store_true', dest: 'stdin' });
parser.add_argument('--json', { action: 'store_true', dest: 'json' });
parser.add_argument('argv', { help: 'Positional arguments exposed to the script as `argv`', nargs: '*' });

const args = parser.parse_args() as unknown as ParsedArgs;

async function readSource() {
	if (args.expression != null) {
		return args.expression;
	}
	if (args.file != null) {
		const filePath = path.isAbsolute(args.file) ? args.file : path.resolve(process.cwd(), args.file);
		return fs.readFile(filePath, 'utf8');
	}
	return text(process.stdin);
}

let source: string;
try {
	source = await readSource();
} catch (err) {
	const message = err instanceof Error ? err.message : String(err);
	process.stderr.write(`xxscreeps eval: ${message}\n`);
	process.exit(1);
}

const exitCode = await runEval({
	argv: args.argv,
	json: args.json,
	source,
	streams: { stderr: process.stderr, stdout: process.stdout },
});
process.exit(exitCode);
