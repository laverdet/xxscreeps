// Stupid declaration to make node and dom version of `URL` compatible
interface URLSearchParams {
	entries(): IterableIterator<[ string, string ]>;
	keys(): IterableIterator<string>;
	values(): IterableIterator<string>;
	[Symbol.iterator](): IterableIterator<[ string, string ]>;
}
