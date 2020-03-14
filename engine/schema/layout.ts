import { BufferView } from './buffer-view';
const { isArray } = Array;
const { entries, values } = Object;

// This specifies memory layout in a hopefully stable format
export type Integral = 'int8' | 'int16' | 'int32' | 'uint8' | 'uint16' | 'uint32';

type StructMember = {
	layout: Layout;
	offset: number;
	pointer?: true;
};

export type StructLayout = {
	[key: string]: StructMember;
};

type ArrayLayout = [ 'array', number, Layout ];
type VectorLayout = [ 'vector', Layout ];

export type Layout = Integral | StructLayout | ArrayLayout | VectorLayout;

export type Traits = {
	align: number;
	size: number;
	stride?: number;
};

// Convert a memory layout declaration to the corresponding data type
type ArrayShape<Type extends ArrayLayout> = Shape<Type[2]>[];
type VectorShape<Type extends VectorLayout> = Shape<Type[1]>[];
type StructShape<Type extends StructLayout> = {
	[Key in keyof Type]: Shape<Type[Key]['layout']>;
};
type Shape<Type extends Layout> =
	Type extends Integral ? number :
	Type extends ArrayLayout ? ArrayShape<Type> :
	Type extends VectorLayout ? VectorShape<Type> :
	Type extends StructLayout ? StructShape<Type> : never;

export const kPointerSize = 4;

export function getTraits<Type extends Layout>(layout: Type): Traits {
	if (typeof layout === 'string') {
		// Integral types
		const integerTraits = (sizeof: number) =>
			({ align: sizeof, size: sizeof, stride: sizeof });
		switch (layout) {
			case 'int8': return integerTraits(1);
			case 'int16': return integerTraits(2);
			case 'int32': return integerTraits(4);

			case 'uint8': return integerTraits(1);
			case 'uint16': return integerTraits(2);
			case 'uint32': return integerTraits(4);

			default: throw TypeError(`Invalid literal layout: ${layout}`);
		}
	} else if (isArray(layout)) {
		throw new TypeError;
	} else {
		// Structures
		const members = values(layout as StructLayout).map(member => ({
			...member,
			traits: getTraits(member.layout),
		}));
		const traits: Traits = {
			align: Math.max(...members.map(member =>
				Math.max(member.pointer ? kPointerSize : 0, member.traits.align)
			)),
			size: Math.max(...members.map(member =>
				member.offset + (member.pointer ? kPointerSize : member.traits.size)
			)),
		};
		const hasPointerElement = members.some(member => member.pointer);
		if (!hasPointerElement) {
			const remainder = traits.size % traits.align;
			traits.stride = traits.size + (remainder ? traits.align - remainder : 0);
		}
		return traits;
	}
}

export function getWriter<Type extends Layout>(layout: Type, base: number):
		(value: Shape<Type>, view: BufferView, offset: number) => void {

	if (typeof layout === 'string') {
		// Integral types
		switch (layout) {
			case 'int8': return (value, view, offset) => { view.int8[base + offset] = value as number };
			case 'int16': return (value, view, offset) => { view.int16[(base + offset) >>> 1] = value as number };
			case 'int32': return (value, view, offset) => { view.int32[(base + offset) >>> 2] = value as number };

			case 'uint8': return (value, view, offset) => { view.uint8[base + offset] = value as number };
			case 'uint16': return (value, view, offset) => { view.uint16[(base + offset) >>> 1] = value as number };
			case 'uint32': return (value, view, offset) => { view.uint32[(base + offset) >>> 2] = value as number };

			default: throw TypeError(`Invalid literal layout: ${layout}`);
		}
	} else if (isArray(layout)) {
		throw new TypeError('Invalid layout');
	} else {
		// Structures
		let writer: ((value: any, view: BufferView, offset: number) => void) | undefined;
		entries(layout as StructLayout).map(([ key, prop ]) => {
			const next = function(): typeof writer {
				const writer = getWriter(prop.layout, base + prop.offset);
				return (value: any, view, offset) => writer(value[key], view, offset);
			}();
			const prev = writer;
			if (prev) {
				writer = (value, view, offset) => {
					prev(value, view, offset);
					next(value, view, offset);
				};
			} else {
				writer = next;
			}
		});
		return writer!;
	}
}
