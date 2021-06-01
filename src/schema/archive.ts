import type { Layout, StructLayout } from './layout';
import { unpackWrappedStruct } from './layout';
import * as Fn from 'xxscreeps/utility/functional';
import { entriesWithSymbols } from 'xxscreeps/schema/symbol';

class ModuleArchiver {
	private readonly dependencies = new Map<string, Set<string>>();
	private readonly layoutToIdentifier = new Map<any, string>();
	private readonly rendered = new Map<string, string>();
	private current = '';

	static archive(layout: Layout) {
		const instance = new ModuleArchiver;
		const exports = `export default ${render(instance.archive(layout))};\n`;
		const sorted = new Map([ ...instance.dependencies.entries() ]
			.sort((left, right) => left[0].localeCompare(right[0])));
		const resolved = new Set<string>();
		let rendered = '';
		while (sorted.size) {
			for (const [ name, dependencies ] of sorted) {
				const satisfied = Fn.every(dependencies, name => resolved.has(name));
				if (satisfied) {
					resolved.add(name);
					rendered += instance.rendered.get(name);
					sorted.delete(name);
					break;
				}
			}
		}
		return rendered + exports;
	}

	private archive(layout: Layout): any {
		const identifier = this.layoutToIdentifier.get(layout);
		if (identifier) {
			this.dependencies.get(this.current)?.add(identifier);
			// eslint-disable-next-line no-new-wrappers
			return new String(identifier);
		}
		if (typeof layout === 'object') {
			if ('composed' in layout) {
				return this.archive(layout.composed);
			} else if ('named' in layout) {
				const name = layout.named;
				if (!this.dependencies.has(name)) {
					this.dependencies.set(name, new Set);
					this.layoutToIdentifier.set(layout, name);
					const previous = this.current;
					this.current = name;
					const archived = this.archive(layout.layout);
					// Archive primitive types as named format to avoid equality collision between different
					// composed types.
					const archivedFormat = typeof archived === 'object' ? archived : {
						named: name,
						layout: archived,
					};
					this.rendered.set(name, `export const ${name} = ${render(archivedFormat)};\n`);
					this.current = previous;
				}
				return this.archive(layout);
			} else if ('struct' in layout) {
				return {
					...layout,
					...layout.inherit && { inherit: this.archive(layout.inherit) },
					struct: Object.fromEntries(entriesWithSymbols(layout.struct).map(([ key, value ]) => {
						const result = [ key, {
							// eslint-disable-next-line no-new-wrappers
							offset: new String(`0x${value.offset.toString(16)}`),
							member: this.archive(value.member),
						} ];
						return result;
					})),
				};
			} else if ('variant' in layout) {
				return {
					variant: layout.variant.map(element => ({
						...element,
						layout: this.archive(element.layout),
					})),
				};
			} else {
				const nested = [ 'array', 'list', 'optional', 'pointer', 'vector' ].find(key => key in layout);
				if (nested) {
					return {
						...layout,
						[nested]: this.archive(layout[nested as keyof typeof layout]),
					};
				}
			}
		}
		return layout;
	}
}

function render(value: any, indent = 1): string {
	if (
		typeof value === 'boolean' || typeof value === 'number' ||
		value === undefined || value === null ||
		value instanceof String
	) {
		return `${value}`;
	} else if (typeof value === 'string') {
		return JSON.stringify(value);
	} else if (typeof value === 'symbol') {
		return `"%${value.description}"`;
	} else if (Array.isArray(value)) {
		if (value.length === 0) {
			return '[]';
		}
		const rendered = value.map(element => render(element, indent + 1));
		const useNewLines = !rendered.every(string => string.includes('\n')) &&
			value.every(element => typeof element === 'object' && !(element instanceof String));
		if (useNewLines) {
			const pad = '\t'.repeat(indent);
			return `[\n${pad}${rendered.join(`,\n${pad}`)},\n${'\t'.repeat(indent - 1)}]`;
		} else {
			return `[ ${rendered.map(value => value.replace(/^\t/gm, '')).join(', ')} ]`;
		}
	} else if (value) {
		const entries = entriesWithSymbols(value).filter(entry => entry[1] !== undefined);
		const preRendered = entries.map(([ key, value ]) => [ key, render(value, indent + 1) ] as const);
		preRendered.sort((left, right) => {
			const hasNewLine = (value: typeof left) => value[1].includes('\n') ? 1 : 0;
			const asString = (value: typeof left) => typeof value[0] === 'symbol' ? `%${value[0].description}` : `${value[0]}`;
			return hasNewLine(left) - hasNewLine(right) ||
				asString(left).localeCompare(asString(right));
		});
		const rendered = preRendered.map(tuple => `${render(tuple[0])}: ${tuple[1]}`);
		const useNewLines = entries.some(entry => typeof entry[1] === 'object' && !(entry[1] instanceof String));
		if (useNewLines) {
			const pad = '\t'.repeat(indent);
			return `{\n${pad}${rendered.join(`,\n${pad}`)},\n${'\t'.repeat(indent - 1)}}`;
		} else {
			return `{ ${rendered.join(', ')} }`;
		}
	}
	throw new Error('Unknown value');
}

export function archiveLayout(layout: Layout): string {
	return ModuleArchiver.archive(layout);
}

export function restoreLayout(archive: string, layoutTemplate: Layout) {

	// Crawl layout template for compositions and named layouts
	const compositions = new Map<string, Extract<Layout, { 'composed': any }>>();
	mapLayout(layoutTemplate, (layout, path) => {
		if (typeof layout === 'object') {
			if ('composed' in layout) {
				compositions.set(path, layout);
			}
		}
		return layout;
	});

	// Evaluate archive code string
	// eslint-disable-next-line @typescript-eslint/no-implied-eval
	const exec = new Function(
		'exports',
		archive
			.replace(/export default /, 'exports.default = ')
			.replace(/export const (?<id>[a-zA-Z0-9]+) = /g, 'const $<id> = exports.$<id> = '));
	const exports: Record<string, Layout> = {};
	exec(exports);
	const exportedLayout = exports.default;
	delete exports.default;
	const namedExports = new Map<Layout, string>(Object.entries(exports).map(entry => [ entry[1], entry[0] ]));

	// Add compositions to restore layout
	return mapLayout(exportedLayout, (layout, path) => {
		const named = namedExports.get(layout);
		if (named && path !== named && path !== `${named}.`) {
			return { named, layout };
		}
		const composition = compositions.get(path);
		if (composition) {
			return { ...composition, composed: layout };
		}
		return layout;
	});
}

function mapLayout(layout: Layout, fn: (layout: Layout, path: string) => Layout) {
	let path: string[] = [];
	const layouts = new Map<Layout, Layout>();
	const walk = (layoutParam: Layout): Layout => {
		// Recurse *before* checking for repeated layout. This way aliases can be saved.
		let layout = fn(layoutParam, path.join('.'));

		// Check for repeated layouts
		const previous = layouts.get(layoutParam);
		if (previous) {
			return previous;
		}

		path.push('');
		if (typeof layout === 'object') {
			if ('array' in layout) {
				layout = {
					...layout,
					array: walk(layout.array),
				};
			} else if ('composed' in layout) {
				layout = {
					...layout,
					composed: walk(layout.composed),
				};
			} else if ('list' in layout) {
				layout = {
					...layout,
					list: walk(layout.list),
				};
			} else if ('named' in layout) {
				const prev = path;
				path = [ layout.named ];
				layout = {
					...layout,
					layout: walk(layout.layout),
				};
				path = prev;
			} else if ('optional' in layout) {
				layout = {
					...layout,
					optional: walk(layout.optional),
				};
			} else if ('pointer' in layout) {
				layout = {
					...layout,
					pointer: walk(layout.pointer),
				};
			} else if ('struct' in layout) {
				layout = {
					...layout,
					...layout.inherit ? {
						inherit: (path[path.length - 1] = '^', walk(layout.inherit) as StructLayout),
					} : undefined,
					struct: Fn.fromEntries(Fn.map(entriesWithSymbols(layout.struct), ([ key, value ]) => {
						const str = typeof key === 'symbol' ? `%${key.description}` : key;
						path[path.length - 1] = str;
						const next = walk(value.member);
						return [ key, { ...value, member: next } ];
					})),
				};
			} else if ('variant' in layout) {
				layout = {
					...layout,
					variant: layout.variant.map(member => {
						path[path.length - 1] = `${unpackWrappedStruct(member.layout).variant}`;
						return {
							...member,
							layout: walk(member.layout) as StructLayout,
						};
					}),
				};
			} else if ('vector' in layout) {
				layout = {
					...layout,
					vector: walk(layout.vector),
				};
			} else if ('constant' in layout || 'enum' in layout) {
				// Nothing
			} else {
				throw new Error(`Unhandled layout: ${path.join('.')}`);
			}
		}
		path.pop();
		layouts.set(layoutParam, layout);
		return layout;
	};
	return walk(layout);
}
