import { RequestHandler } from 'express';
import { bindName, getReader, getWriter, makeVector, FormatShape } from '~/lib/schema';
import * as Id from '~/engine/util/schema/id';
import { checkToken } from './token';

export function authenticateMiddleware(handler: RequestHandler): RequestHandler {
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
export const format = bindName('Entries', makeVector({
	key: 'string',
	user: Id.format,
}));

export type Shape = FormatShape<typeof format>;

export const read = getReader(format);
export const write = getWriter(format);
