import type { Context, State } from 'xxscreeps/backend/index.js';
import * as OpenId from 'openid';
import * as User from 'xxscreeps/engine/db/user/index.js';
import config from 'xxscreeps/config/index.js';
import Passport from 'koa-passport';
import Router from 'koa-router';
import { hooks } from 'xxscreeps/backend/index.js';
import { Strategy as SteamStrategy } from 'passport-steam';
const { RelyingParty } = (OpenId as never as Record<'default', typeof OpenId>).default;

// Hack in dynamic host support for abandoned Steam OpenId module
SteamStrategy.prototype.authenticate = function(authenticate) {
	return function(this: any, ...args: any) {
		const req = args[0];
		this._relyingParty.update = function() {
			this.returnUrl = `${new URL('/api/auth/steam/return', req.href)}`;
			this.realm = req.origin;
		};
		return authenticate.apply(this, args as any);
	};
}(SteamStrategy.prototype.authenticate);

declare module 'openid' {
	interface RelyingParty {
		update(): void;
	}
}

RelyingParty.prototype.authenticate = function(authenticate): typeof authenticate {
	return function(this: InstanceType<typeof RelyingParty>, ...args) {
		this.update();
		return authenticate.apply(this, args);
	};
}(RelyingParty.prototype.authenticate);

RelyingParty.prototype.verifyAssertion = function(verifyAssertion): typeof verifyAssertion {
	return function(this: InstanceType<typeof RelyingParty>, ...args) {
		this.update();
		return verifyAssertion.apply(this, args);
	};
}(RelyingParty.prototype.verifyAssertion);

const { steamApiKey } = config.backend;
if (steamApiKey) {
	hooks.register('middleware', (koa, router) => {

		// Set up passport
		Passport.use('steam', new SteamStrategy({
			apiKey: steamApiKey,
			profile: false,
			realm: '',
			returnURL: 'http:///',
		} as any, (identifier: string, profile: unknown, done: (err: null | Error, value?: string) => void) => {
			const steamId = /https:\/\/steamcommunity.com\/openid\/id\/(?<id>[^/]+)/.exec(identifier)?.groups!.id;
			done(null, steamId);
		}));

		// `/api/auth/steam` endpoints
		const steam = new Router<State, Context>();
		steam.get('/');
		steam.all('/return', async context => {
			const steamid = (context.state as { user: string }).user; // this is set by koa-passport
			await context.authenticateForProvider('steam', steamid);
			const token = await context.flushToken();
			const username = await async function() {
				const userId = context.state.newUserId ?? context.state.userId;
				if (userId !== undefined) {
					const key = User.infoKey(userId);
					const username = await context.db.data.hget(key, 'username');
					return username ?? 'New User';
				}
			}();
			const json = JSON.stringify(JSON.stringify({ steamid, token, username }));
			context.body = `<html><body><script type="text/javascript">opener.postMessage(${json}, '*'); window.close();</script></body>`;
		});

		// Plug steam router into koa backend
		router.use('/api/auth/steam',
			Passport.initialize(),
			Passport.authenticate('steam', {
				session: false,
				failureRedirect: '/',
			}),
			steam.routes(), steam.allowedMethods());
	});
}
