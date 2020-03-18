import express from 'express';
export type Method = 'delete' | 'get' | 'post' | 'put';

export type Endpoint = {
	path: string;
	method: Method;

	execute(req: express.Request, res: express.Response): any;
};
