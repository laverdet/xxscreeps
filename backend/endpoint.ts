import express from 'express';
import { BackendContext } from './context';
export type Method = 'delete' | 'get' | 'post' | 'put';
export type RequestContext = { context: BackendContext };

export type Endpoint = {
	path: string;
	method: Method;

	execute(this: RequestContext, req: express.Request, res: express.Response): any;
};
