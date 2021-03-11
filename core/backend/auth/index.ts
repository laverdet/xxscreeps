import { RequestHandler } from 'express';
import { declare, makeReader, makeWriter, struct, vector, TypeOf } from 'xxscreeps/schema';
import * as Id from 'xxscreeps/engine/schema/id';
import { checkToken, makeToken } from './token';

import type {} from 'xxscreeps/backend/endpoint';
declare module 'xxscreeps/backend/endpoint' {
	interface Locals {
		token?: string;
		userid?: string;
	}
}

export function useAuth(handler: RequestHandler): RequestHandler {
	const withToken = useToken((req, res, next) => {
		if (req.locals.userid === undefined) {
			res.status(401).send({ error: 'unauthorized' });
		} else {
			handler(req, res, next);
		}
	});
	return (req, res, next) => {
		const auth64 = req.headers.authorization && /^Basic (?<auth>.+)$/.exec(req.headers.authorization)?.groups?.auth;
		if (auth64) {
			// Passwordless auth
			// TODO(important): Remove this :)
			const auth = Buffer.from(auth64, 'base64').toString();
			const user = req.locals.context.lookupUserByProvider(auth);
			if (user) {
				req.locals.userid = user;
				handler(req, res, next);
				return;
			}
		}
		withToken(req, res, next);
	};
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
				req.locals.userid = tokenValue;
			} else {
				const newReg = /^new:(?<id>[^:]+):(?<provider>.+)$/.exec(tokenValue);
				if (newReg) {
					req.locals.token = newReg.groups!.provider;
					req.locals.userid = newReg.groups!.id;
				} else {
					req.locals.token = tokenValue;
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
export const format = declare('Entries', vector(struct({
	key: 'string',
	user: Id.format,
})));

export type Shape = TypeOf<typeof format>;

export const read = makeReader(format);
export const write = makeWriter(format);
