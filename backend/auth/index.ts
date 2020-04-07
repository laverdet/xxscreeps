import { RequestHandler } from 'express';
import { declare, getReader, getWriter, vector, TypeOf } from '~/lib/schema';
import * as Id from '~/engine/util/schema/id';
import { checkToken, makeToken } from './token';

export function useAuth(handler: RequestHandler) {
	return useToken((req, res, next) => {
		if (req.userid === undefined) {
			res.status(401).send({ error: 'unauthorized' });
		} else {
			handler(req, res, next);
		}
	});
}

export function useToken(handler: RequestHandler): RequestHandler {
	return (req, res, next) => {
		(async() => {
			const token = req.get('x-token');
			const tokenValue = token === undefined ? undefined : await checkToken(token);
			if (tokenValue === undefined) {
				res.status(401).send({ error: 'unauthorized' });
				return;
			}
			res.set('X-Token', await makeToken(tokenValue));
			if (/^[a-f0-9]+$/.test(tokenValue)) {
				req.userid = tokenValue;
			} else {
				const newReg = /^new:(?<id>[^:]+):(?<provider>.+)$/.exec(tokenValue);
				if (newReg) {
					req.token = newReg.groups!.provider;
					req.userid = newReg.groups!.id;
				} else {
					req.token = tokenValue;
				}
			}
			handler(req, res, next);
		})().catch(error => next(error));
	};
}

export function checkUsername(username: string) {
	return (
		typeof username === 'string' &&
		username.length <= 20 &&
		/^[a-zA-Z0-9][a-zA-Z0-9_-]+[a-zA-Z0-9]$/.test(username)
	);
}

export function flattenUsername(username: string) {
	return username.replace(/[-_]/g, '').toLowerCase();
}

//
// Schema
export const format = declare('Entries', vector({
	key: 'string',
	user: Id.format,
}));

export type Shape = TypeOf<typeof format>;

export const read = getReader(format);
export const write = getWriter(format);
