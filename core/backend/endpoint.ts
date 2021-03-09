import type express from 'express';
import { BackendContext } from './context';

export type Method = 'delete' | 'get' | 'post' | 'put';
export interface Locals {}
type RequestContext = { context: BackendContext };

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Express {
		interface Request {
			locals: Locals;
		}
	}
}

export type Endpoint = {
	path: string;
	method?: Method;

	execute(this: RequestContext, req: express.Request, res: express.Response): any;
};

export function Response(payload: any): AbstractResponse;
export function Response(status: number, payload: any): AbstractResponse;
export function Response(...args: [ any ] | [ number, any ]) {
	const { status, payload } = function() {
		if (args.length === 1) {
			return { status: 200, payload: args[0] };
		} else {
			return { status: args[0], payload: args[1] };
		}
	}();
	return new JsonResponse(status, payload);
}

export abstract class AbstractResponse {
	abstract send(res: express.Response): void;
}

class JsonResponse extends AbstractResponse {
	constructor(
		private readonly status: number,
		private readonly payload: any,
	) {
		super();
	}

	send(res: express.Response) {
		res.writeHead(this.status);
		res.end(JSON.stringify(this.payload));
	}
}
