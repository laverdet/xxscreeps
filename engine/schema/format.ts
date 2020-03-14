import { kPointerSize, alignTo, getTraits, Integral, Layout, StructLayout, Traits } from './layout';
const { isArray } = Array;
const { entries } = Object;

// Format used to specify basic fields and types. `getLayout` will generate a stable binary layout
// from this information.
type StructFormat = {
	[key: string]: Format;
}
type ArrayFormat = [ 'array', number, Format ];
type VectorFormat = [ 'vector', Format ];

type Format = Integral | StructFormat | ArrayFormat | VectorFormat;

// Generates types for `getLayout`
type ArrayFormatToLayout<Type extends ArrayFormat> = [ 'array', number, FormatToLayout<Type[2]> ];
type VectorFormatToLayout<Type extends VectorFormat> = [ 'vector', FormatToLayout<Type[1]> ];
type StructFormatToLayout<Type extends StructFormat> = {
	[Key in keyof Type]: {
		layout: FormatToLayout<Type[Key]>;
		offset: number;
		pointer?: true;
	};
};
type FormatToLayout<Type extends Format> =
	Type extends Integral ? Type :
	Type extends ArrayFormat ? ArrayFormatToLayout<Type> :
	Type extends VectorFormat ? VectorFormatToLayout<Type> :
	Type extends StructFormat ? StructFormatToLayout<Type> :
	never;

export function makeArray<Type extends Format>(length: number, format: Type):
		[ 'array', number, Type ] {
	return [ 'array', length, format ];
}

export function makeVector<Type extends Format>(format: Type):
		[ 'vector', Type ] {
	return [ 'vector', format ];
}

function getStructLayout(format: StructFormat): Layout {
	// Fetch memory layout for each member
	type WithTraits = { traits: Traits };
	const members: (WithTraits & { key: string, layout: Layout })[] = [];
	for (const [ key, memberFormat ] of entries(format)) {
		const layout = getLayout(memberFormat);
		members.push({
			key,
			layout,
			traits: getTraits(layout),
		});
	}

	// Simple struct pack algorithm by sorting by size largest to smallest
	const isPointer = (member: WithTraits) => member.traits.stride === undefined;
	members.sort((left, right) => {
		const size = (member: WithTraits) => isPointer(member) ? kPointerSize : member.traits.size;
		const elementSize = (member: WithTraits) => isPointer(member) ? member.traits.size : Infinity;
		return (
			size(right) - size(left) ||
			elementSize(right) - elementSize(left) ||
			left.key.localeCompare(right.key)
		);
	});

	// Build layout
	const layout: StructLayout = { struct: {} };
	let offset = 0;
	for (const member of members) {
		const pointer = isPointer(member);
		offset = alignTo(offset, pointer ? kPointerSize : member.traits.align);
		layout.struct[member.key] = {
			layout: member.layout,
			offset,
			...pointer && { pointer: true as const },
		};
		offset += pointer ? kPointerSize : member.traits.size;
	}
	return layout;
}

// This crashes TypeScript =o
// export function getLayout<Type extends Format>(format: Type): FormatToLayout<Type>;
export function getLayout(format: Format): Layout {
	if (typeof format === 'string') {
		// Integral types
		return format;

	} else if (isArray(format)) {
		// Arrays (fixed size) & vectors (dynamic size)
		if (format[0] === 'array') {
			return {
				array: getLayout(format[2]),
				size: format[1],
			};
		} else if (format[0] === 'vector') {
			return {
				vector: getLayout(format[1]),
			};
		}
		throw TypeError(`Invalid array type: ${format[0]}`);

	} else {
		// Structures
		return getStructLayout(format);
	}
}
