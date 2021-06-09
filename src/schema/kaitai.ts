import type { Layout } from './layout';
import jsYaml from 'js-yaml';
import * as Fn from 'xxscreeps/utility/functional';
import { entriesWithSymbols } from 'xxscreeps/schema/symbol';

function toId(name: string | symbol): string {
	if (typeof name === 'symbol') {
		return toId(name.description!);
	} else if (name.startsWith('#')) {
		return toId(name.substr(1));
	} else if (/^[A-Z0-9]+$/.test(name)) {
		return name.toLowerCase();
	} else {
		return name.replace(/.[A-Z]/g, match => `${match[0]}_${match[1].toLowerCase()}`).replace(/^_+/, '').toLowerCase();
	}
}

export class KaitaiArchiver {
	private size = 0;
	private readonly top: KaitaiArchiver;
	private readonly seq: any[] = [];
	private readonly enums = new Map<string, any>();
	private readonly instances = new Map<string, any>();
	private readonly types = new Map<string, KaitaiArchiver>();
	private readonly namedTypes: Set<Layout>;
	constructor(top?: KaitaiArchiver) {
		this.top = top ?? this;
		this.namedTypes = top?.namedTypes ?? new Set;
	}

	static archive(layout: Layout, version: number) {
		const instance = new KaitaiArchiver();
		instance.archive('value', instance.top, layout);
		instance.seq.unshift({
			id: 'magic',
			contents: [ '0x00', '0x5a', '0xf3', '0xff' ],
		}, {
			id: 'version',
			contents: [ ...Fn.map(version.toString(16).padStart(8, '0').matchAll(/../g), match => `0x${match[0]}`) ].reverse(),
		}, {
			id: 'size',
			type: 'u4',
		}, {
			id: 'zero',
			contents: [ 0, 0, 0, 0 ],
		});
		return jsYaml.dump({
			meta: {
				id: 'screeps',
				endian: 'le',
			},
			...instance.top.render(),
		});
	}

	render(): any {
		function sort(map: Map<string, any>) {
			return [ ...map ].sort((left, right) => left[0].localeCompare(right[0]));
		}
		return {
			seq: this.seq,
			...this.enums.size > 0 && {
				enums: Object.fromEntries(sort(this.enums)),
			},
			...this.instances.size > 0 && {
				instances: Object.fromEntries(Fn.map(sort(this.instances), ([ key, value ]) => [ key, {
					...value,
					'-webide-parse-mode': 'eager',
				} ])),
			},
			...this.types.size > 0 && {
				types: Object.fromEntries(Fn.map(sort(this.types), ([ key, value ]) => [ key, value.render() ])),
			},
		};
	}

	private makeType(id: string, child: KaitaiArchiver) {
		if (child.seq.length === 1 && child.enums.size === 0 && child.instances.size === 0) {
			if (child.types.size === 0) {
				return child.seq[0].type;
			} else if (child.types.has(child.seq[0].type)) {
				this.types.set(id, child.types.get(child.seq[0].type)!);
				return id;
			}
		}
		this.types.set(id, child);
		return id;
	}

	private child(id: string) {
		const holder = new KaitaiArchiver(this);
		this.types.set(id, holder);
		return holder;
	}

	private archive(id: string, holder: KaitaiArchiver, layout: Layout): void {
		if (typeof layout === 'string') {
			const { type, size } = {
				bool: { type: 's1', size: 1 },
				double: { type: 'f8', size: 8 },
				int8: { type: 's1', size: 1 },
				int16: { type: 's2', size: 2 },
				int32: { type: 's4', size: 4 },
				uint8: { type: 'u1', size: 1 },
				uint16: { type: 'u2', size: 2 },
				uint32: { type: 'u4', size: 4 },
				buffer: { type: 'buffer', size: 8 },
				string: { type: 'js_str', size: 8 },
			}[layout];
			if (type === 'buffer') {
				if (!this.top.types.has('buffer')) {
					const holder = this.top.child('buffer');
					holder.seq.push({
						id: 'buffer_ofs',
						type: 'u4',
					}, {
						id: 'buffer_len',
						type: 'u4',
					});
					holder.instances.set('buffer', {
						pos: 'buffer_ofs',
						size: 'buffer_len',
					});
				}
			} else if (type === 'js_str') {
				if (!this.top.types.has('js_str')) {
					const holder = this.top.child('js_str');
					holder.seq.push({
						id: 'str_ofs',
						type: 'u4',
					}, {
						id: 'str_len',
						type: 's4',
					});
					holder.instances.set('latin1', {
						type: 'str',
						pos: 'str_ofs',
						size: 'str_len',
						encoding: 'Latin1',
						if: 'str_len >= 0',
					});
					holder.instances.set('utf8', {
						type: 'str',
						pos: 'str_ofs',
						size: 'str_len * -2',
						encoding: 'UTF-16LE',
						if: 'str_len < 0',
					});
				}
			}
			holder.seq.push({ id, type });
			holder.size += size;

		} else if ('array' in layout) {
			const element = new KaitaiArchiver(this);
			this.archive(id, element, layout.array);
			holder.seq.push({
				id,
				type: holder.makeType(id, element),
				repeat: 'expr',
				'repeat-expr': layout.length,
			});
			holder.size += (layout.length - 1) * layout.stride + element.size;

		} else if ('composed' in layout) {
			const { interceptor } = layout;
			if ('kaitai' in interceptor) {
				const { kaitai } = interceptor;
				holder.seq.push(...kaitai!);
				const tmp = new KaitaiArchiver;
				tmp.archive(id, tmp, layout.composed);
				holder.size = tmp.size;
			} else {
				this.archive(id, holder, layout.composed);
			}

		} else if ('constant' in layout) {
			holder.instances.set(id, { value: layout.constant });

		} else if ('enum' in layout) {
			holder.enums.set(id, Fn.fromEntries(layout.enum.map((value, ii) => [ ii, toId(value ?? 'empty') ])));
			holder.seq.push({
				id,
				type: 'u1',
				enum: id,
			});
			holder.size += 1;

		} else if ('list' in layout) {
			holder.seq.push({
				id: `${id}_ofs`,
				type: 'u4',
			});
			holder.instances.set(id, {
				type: id,
				pos: `${id}_ofs - 4`,
				if: `${id}_ofs > 0`,
				repeat: 'until',
				'repeat-until': '_.next_ofs == 0',
			});
			holder.size += 4;

			const type = holder.child(id);
			type.seq.push({
				id: 'next_ofs',
				type: 'u4',
			});
			type.size += 4;
			this.archive('value', type, layout.list);
			type.seq.push({
				size: 'next_ofs == 0 ? 0 : next_ofs - _io.pos - 4',
			});

		} else if ('named' in layout) {
			const nameId = toId(layout.named);
			if (!this.namedTypes.has(layout)) {
				this.namedTypes.add(layout);
				const holder = new KaitaiArchiver(this);
				this.archive(nameId, holder, layout.layout);
				if (holder.seq.length === 1 && holder.seq[0].type === nameId) {
					this.types.set(nameId, holder.types.get(nameId)!);
				} else {
					this.types.set(nameId, holder);
				}
			}
			holder.seq.push({ id, type: nameId });
			holder.size += this.top.types.get(nameId)!.size;

		} else if ('optional' in layout) {
			const element = new KaitaiArchiver(this);
			this.archive(id, element, layout.optional);
			holder.seq.push({
				id,
				type: holder.makeType(id, element),
			}, {
				id: `has_${id}`,
				type: 'b1',
			});
			holder.size += element.size + 1;

		} else if ('pointer' in layout) {
			const element = new KaitaiArchiver(this);
			this.archive(id, element, layout.pointer);
			holder.seq.push({
				id: `${id}_ofs`,
				type: 'u4',
			});
			holder.instances.set(id, {
				type: holder.makeType(id, element),
				pos: `${id}_ofs`,
				if: `${id}_ofs > 0`,
			});
			holder.size += 4;

		} else if ('struct' in layout) {
			const members = entriesWithSymbols(layout.struct).sort((left, right) => left[1].offset - right[1].offset);
			const struct = holder.child(id);
			holder.seq.push({
				id,
				type: id,
			});
			if (layout.inherit) {
				this.archive('super', struct, layout.inherit);
			}
			for (const [ name, member ] of members) {
				if (member.union) {
					continue;
				}
				const id = toId(name);
				if (struct.size < member.offset) {
					struct.seq.push({
						size: member.offset - struct.size,
					});
					struct.size = member.offset;
				}
				this.archive(id, struct, member.member);

			}
			holder.size += struct.size;

		} else if ('variant' in layout) {
			const cases: string[] = [];
			for (const element of layout.variant) {
				const variantHolder = new KaitaiArchiver(this);
				const variantId = `variant${cases.length}`;
				this.archive(variantId, variantHolder, element.layout);
				cases.push(holder.makeType(variantId, variantHolder));
			}
			holder.seq.push({
				id: `${id}_ofs`,
				type: 'u4',
			}, {
				id: `${id}_type`,
				type: 'u1',
			}, {
				size: `${id}_ofs - _io.pos`,
			}, {
				id,
				type: {
					'switch-on': `${id}_type`,
					cases: Object.fromEntries(cases.map((value, ii) => [ ii, value ])),
				},
			});

		} else if ('vector' in layout) {
			const type = new KaitaiArchiver(this);
			this.archive(`${id}_t`, type, layout.vector);
			const typeId = holder.makeType(`${id}_t`, type);

			holder.seq.push({
				id: `${id}_ofs`,
				type: 'u4',
			}, {
				id: `${id}_len`,
				type: 's4',
			});
			holder.instances.set(id, {
				type: typeId,
				pos: `${id}_ofs`,
				repeat: 'expr',
				'repeat-expr': `${id}_len`,
			});
			holder.size += 8;

		} else {
			throw new Error('Unsupported layout');
		}
	}
}

export function archiveStruct(layout: Layout, version: number): string {
	return KaitaiArchiver.archive(layout, version);
}
