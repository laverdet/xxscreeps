import type { BaseContext } from 'koa';
import type { SteamStrategyOptions } from 'passport-steam';
import type { ContextType } from 'xxscreeps/utility/types.js';
import type { Context, State } from 'xxscreeps:backend';
import Passport from 'koa-passport';
import Router from 'koa-router';
import * as OpenId from 'openid';
import { Strategy as SteamStrategy } from 'passport-steam';
import { hooks } from 'xxscreeps/backend/index.js';
import { config } from 'xxscreeps/config/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';

const { RelyingParty } = (OpenId as never as Record<'default', typeof OpenId>).default;

declare module 'openid' {
	interface RelyingParty {
		realm: string;
		returnUrl: string;
	}
}

declare module 'passport-steam' {
	interface Strategy {
		_relyingParty: OpenId.RelyingParty;
	}
}

declare module 'xxscreeps:backend' {
	interface State {
		/**
		 * This is the Steam openid user. Don't use it!
		 * @deprecated
		 */
		user?: string;
	}
}

// Hack in dynamic host support for abandoned Steam OpenId module
SteamStrategy.prototype.authenticate = function(authenticate) {
	type This = ContextType<typeof authenticate>;

	return function(this: SteamStrategy, ...args: [ BaseContext, SteamStrategyOptions ]): unknown {
		const [ req ] = args;
		this._relyingParty.update = function() {
			this.returnUrl = `${new URL('/api/auth/steam/return', req.href)}`;
			this.realm = req.origin;
		};
		return authenticate.apply(this as unknown as This, args as unknown as Parameters<typeof authenticate>);
	} as unknown as typeof authenticate;
// eslint-disable-next-line @typescript-eslint/unbound-method
}(SteamStrategy.prototype.authenticate);

declare module 'openid/index.js' {
	interface RelyingParty {
		update: () => void;
	}
}

RelyingParty.prototype.authenticate = function(authenticate) {
	return function(this: InstanceType<typeof RelyingParty>, ...args) {
		this.update();
		authenticate.apply(this, args);
	};
// eslint-disable-next-line @typescript-eslint/unbound-method
}(RelyingParty.prototype.authenticate);

RelyingParty.prototype.verifyAssertion = function(verifyAssertion) {
	return function(this: InstanceType<typeof RelyingParty>, ...args) {
		this.update();
		verifyAssertion.apply(this, args);
	};
// eslint-disable-next-line @typescript-eslint/unbound-method
}(RelyingParty.prototype.verifyAssertion);

const { steamApiKey } = config.backend;
if (steamApiKey !== undefined) {
	hooks.register('middleware', (koa, router) => {
		// Set up passport
		Passport.use('steam', new SteamStrategy({
			apiKey: steamApiKey,
			profile: false,
			realm: '',
			returnURL: 'http:///',
		}, (identifier: string, profile: unknown, done: (err: null | Error, value?: string) => void) => {
			const steamId = /https:\/\/steamcommunity.com\/openid\/id\/(?<id>[^/]+)/.exec(identifier)?.groups!.id;
			done(null, steamId);
		}));

		// `/api/auth/steam` endpoints
		const steam = new Router<State, Context>();
		steam.get('/');
		steam.all('/return', async context => {
			const steamid = context.state.user; // this is set by koa-passport
			if (steamid !== undefined) {
				await context.authenticateForProvider('steam', steamid);
				const token = await context.flushToken();
				const username = await async function() {
					const userId = context.state.newUserId ?? context.state.userId;
					if (userId !== undefined) {
						const key = User.infoKey(userId);
						const username = await context.db.data.hGet(key, 'username');
						return username ?? 'New User';
					}
				}();
				context.body =
					`<html>
						<head>
							<meta http-equiv="refresh" content="1; url=/">
							<style>:root{background:#131520}</style>
						</head>
						<body>
							<script type="text/javascript">
							const payloadString = ${JSON.stringify(JSON.stringify({ steamid, token, username }))};
							try {
								opener.postMessage(payloadString, '*');
								window.close();
							} catch (error) {
							 	// Fallback for when 'opener.postMessage' doesn't work, which is the at least on
							 	// Safari while on a non-localhost insecure domain. We stash the auth token directly
							 	// in localStorage which becomes X-Token. The meta redirect above then forwards us
							 	// to the app.
								console.error(error);
								const payload = JSON.parse(payloadString);
								localStorage.auth = JSON.stringify(payload.token);
								localStorage.lastToken = Date.now();
								localStorage.prevAuth = "null";
							}
							</script>
						</body>
					</html>`;
			}
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
