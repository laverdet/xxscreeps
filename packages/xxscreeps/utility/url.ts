/**
 * Return a string that is the relative path from `from` to `to`. It will always begin with a ".".
 */
export function makeRelativeFragment(from: URL, to: URL) {
	if (
		from.host !== to.host ||
    from.protocol !== to.protocol ||
		from.username !== to.username ||
		from.password !== to.password
	) {
		throw new Error('URLs are not relative');
	}
	const { pathname } = to;
	const fromPathname = from.pathname;
	const extra = `${to.search}${to.hash}`;
	// Find common parent
	let ii = 0;
	for (
		let jj = 1;
		jj < fromPathname.length &&
        jj < pathname.length &&
        fromPathname[jj] === pathname[jj];
		++jj
	) {
		if (pathname[jj] === '/') {
			ii = jj;
		}
	}
	const toRelativePath = pathname.slice(ii + 1);
	// Count `from` depth
	let depth = 0;
	for (let jj = ii + 1; jj < fromPathname.length; ++jj) {
		if (fromPathname[jj] === '/') {
			++depth;
		}
	}
	// Make relative
	if (depth === 0) {
		return `./${toRelativePath}${extra}`;
	} else {
		return `${'../'.repeat(depth)}${toRelativePath}${extra}`;
	}
}

/**
 * Ensures the given URL is a directory, so that relative paths can be consumed with `new
 * URL(relative, url)`.
 */
export function urlAsDirectory(url: URL) {
	if (url.pathname.endsWith('/')) {
		return url;
	} else {
		const next = new URL(url.href);
		next.pathname += '/';
		return next;
	}
}
