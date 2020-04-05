import { RequestHandler } from 'express';
import { declare, getReader, getWriter, vector, TypeOf } from '~/lib/schema';
import * as Id from '~/engine/util/schema/id';
import { checkToken } from './token';

export function useAuth(handler: RequestHandler) {
	return useToken((req, res, next) => {
		if (req.userid === undefined) {
			next();
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
				next();
				return;
			}
			if (/^[a-f0-9]+$/.test(tokenValue)) {
				req.userid = tokenValue;
			} else {
				req.provider = tokenValue;
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
