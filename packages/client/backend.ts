import { Transform } from 'node:stream';
import JSZip from 'jszip';
import { hooks } from 'xxscreeps/backend/index.js';
import { loadScreepsClientPackage } from './find.js';

// Locate and read `package.nw`
const clientPackage = await loadScreepsClientPackage();
if (!clientPackage) {
	console.error('@xxscreeps/client error: Could not find Screeps client package.');
	console.error('Please set `browserClient.package` in `.screepsrc.yaml` to the full path of your package.nw file');
}

if (clientPackage) {
	const { data, stat } = clientPackage;
	// Read package zip metadata
	const zip = new JSZip();
	await zip.loadAsync(data);
	const { files } = zip;
	// HTTP header is only accurate to the minute
	const lastModified = stat.mtime;

	hooks.register('middleware', koa => {

		// Serve client assets directly from steam package
		koa.use(async (context, next): Promise<unknown> => {
			const path = context.request.path === '/' ? 'index.html' : context.request.path.slice(1);
			const file = files[path];
			if (file === undefined) {
				return next();
			}

			// Check cached response based on zip file modification
			context.lastModified = lastModified;
			if (context.fresh) {
				return;
			}

			context.body = await async function() {
				if (path === 'index.html') {
					let body = await file.async('text');
					// Inject startup shim
					const header = '<title>Screeps</title>';
					body = body.replace(header, `<script>
		if (
			(localStorage.auth === 'null' && localStorage.prevAuth === 'null') ||
			!(Date.now() - localStorage.lastToken < 2 * 60000) ||
			(localStorage.prevAuth !== '"guest"' && (localStorage.auth === 'null' || !localStorage.auth))
		) {
			localStorage.auth = '"guest"';
		}
		localStorage.tutorialVisited = 'true';
		localStorage.placeSpawnTutorialAsked = '1';
		localStorage.prevAuth = localStorage.auth;
		localStorage.lastToken = Date.now();
		(function() {
			let auth = localStorage.auth;
			setInterval(() => {
				if (auth !== localStorage.auth) {
					auth = localStorage.auth;
					localStorage.lastToken = Date.now();
				}
			}, 1000);
		})();
		// The client will just fill this up with data until the application breaks.
		if (localStorage['users.code.activeWorld']?.length > 1024 * 1024) {
			try {
				const code = JSON.parse(localStorage['users.code.activeWorld']);
				localStorage['users.code.activeWorld'] = JSON.stringify(code.sort((left, right) => right.timestamp - left.timestamp).slice(0, 2))
			} catch (err) {
				delete localStorage['users.code.activeWorld']
			}
		}
		// Send the user to map after login from /register
		addEventListener('message', event => {
			setTimeout(() => {
				if (localStorage.auth && localStorage.auth !== '"guest"' && document.location.hash === '#!/register') {
					document.location.hash = '#!/'
				}
			});
		});
					</script>` + header);
					// Remove tracking pixels
					body = body.replace(/<script[^>]*>[^>]*xsolla[^>]*<\/script>/g, '<script>xnt = new Proxy(() => xnt, { get: () => xnt })</script>');
					body = body.replace(/<script[^>]*>[^>]*facebook[^>]*<\/script>/g, '<script>fbq = new Proxy(() => fbq, { get: () => fbq })</script>');
					body = body.replace(/<script[^>]*>[^>]*google[^>]*<\/script>/g, '<script>ga = new Proxy(() => ga, { get: () => ga })</script>');
					body = body.replace(/<script[^>]*>[^>]*mxpnl[^>]*<\/script>/g, '<script>mixpanel = new Proxy(() => mixpanel, { get: () => mixpanel })</script>');
					body = body.replace(/<script[^>]*>[^>]*twttr[^>]*<\/script>/g, '<script>twttr = new Proxy(() => twttr, { get: () => twttr })</script>');
					body = body.replace(/<script[^>]*>[^>]*onRecaptchaLoad[^>]*<\/script>/g, '<script>function onRecaptchaLoad(){}</script>');
					return body;
				} else if (path === 'config.js') {
					return `
						var HISTORY_URL = undefined;
						var API_URL = '/api/';
						var WEBSOCKET_URL = '/socket/';
						var CONFIG = {
							API_URL: API_URL,
							HISTORY_URL: HISTORY_URL,
							WEBSOCKET_URL: WEBSOCKET_URL,
							PREFIX: '',
							IS_PTR: false,
							DEBUG: false,
							XSOLLA_SANDBOX: false,
						};
					`;
				} else if (path === 'build.min.js') {
					// Replace official CDN with local assets
					const content = await file.async('text');
					return content.replace(/https:\/\/d3os7yery2usni\.cloudfront\.net\//g, '/assets/');
				} else if (path === 'components/game/room/effect-icon/effect-icon.html') {
					// The effect icon's countdown lives in a native `title`, which the browser
					// re-arms on every tick the text changes, so the tooltip never settles long
					// enough to render. Reuse the same expression as a `uib-tooltip`
					// directive — the tooltip directive this client's ui-bootstrap 2.5.0 actually
					// registers (legacy unprefixed `tooltip-html-unsafe` is not), which shows on
					// mouseenter and re-interpolates each digest so the countdown stays live.
					const content = await file.async('text');
					return content.replace(
						/(<div class='effect-icon')\s+title="([^"]*)"/,
						(full: string, div: string, expr: string) => `${div} tooltip-append-to-body='true' tooltip-placement='top' uib-tooltip="${expr.replace(/\\n/g, ' ')}"`);
				} else {
					// JSZip doesn't implement their read stream correctly and it causes EPIPE crashes. Pass it
					// through a no-op transform stream first to iron that out.
					const stream = new Transform();
					stream._transform = function(chunk, encoding, done) {
						this.push(chunk, encoding);
						done();
					};
					file.nodeStream().pipe(stream);
					return stream;
				}
			}();

			// Set content type
			context.set('Content-Type', {
				'.css': 'text/css',
				'.html': 'text/html',
				'.js': 'text/javascript',
				'.map': 'application/json',
				'.png': 'image/png',
				'.svg': 'image/svg+xml',
				'.ttf': 'font/ttf',
				'.woff': 'font/woff',
				'.woff2': 'font/woff2',
			}[/\.[^.]+$/.exec(path.toLowerCase())?.[0] ?? '.html']!);

			// We can safely cache explicitly-versioned resources forever
			if (Boolean(context.query.bust)) {
				context.set('Cache-Control', 'public,max-age=31536000,immutable');
			}
			context.set('Last-Modified', `${new Date(lastModified)}`);

			// Don't send any auth tokens for these requests
			// eslint-disable-next-line @typescript-eslint/prefer-ts-expect-error
			// @ts-ignore -- Mismatching result from ci/cd, language server, and tsc
			context.state.token = false;
		});
	});
}
