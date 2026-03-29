import { hooks } from 'xxscreeps/backend/index.js';
import { executeCommand } from './sandbox.js';

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let body = '';
		req.setEncoding('utf8');
		req.on('data', (chunk: string) => { body += chunk; });
		req.on('end', () => resolve(body));
		req.on('error', reject);
	});
}

// Greeting
hooks.register('route', {
	path: '/cli',

	execute() {
		return 'Screeps CLI connected. Use help() for a list of commands.';
	},
});

// Command execution
hooks.register('route', {
	method: 'post',
	path: '/cli',

	async execute(context) {
		// Extract expression: support text/plain (traditional) and JSON { expression }
		let expression: string;
		const body = context.request.body;
		if (typeof body === 'string' && body.length > 0) {
			expression = body;
		} else if (body && typeof body === 'object' && typeof body.expression === 'string') {
			expression = body.expression;
		} else {
			// koa-bodyparser doesn't parse text/plain by default — read raw stream
			expression = await readBody(context.req);
		}

		return executeCommand(context.db, context.shard, expression);
	},
});
