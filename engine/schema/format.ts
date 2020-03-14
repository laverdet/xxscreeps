import { kPointerSize, getTraits, Integral, Layout, StructLayout, Traits } from './layout';
const { entries } = Object;

type StructFormat = {
	[key: string]: Format;
}

type ArrayFormat = [ 'array', number, Format ];
type VectorFormat = [ 'vector', Format ];

type Format = Integral | StructFormat | ArrayFormat | VectorFormat;

const Tuple = <Args extends any[]>(...args: Args): Args => args;

function getStructLayout<Type extends StructFormat>(format: Type) {
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
		const elementSize = (member: WithTraits) => isPointer(member) ? member.traits.size : 0;
		return (
			size(right) - size(left) ||
			elementSize(right) - elementSize(left) ||
			left.key.localeCompare(right.key)
		);
	});

	// Build layout
	const layout: Partial<StructLayout> = {};
	let offset = 0;
	for (const member of members) {
		const pointer = isPointer(member);
		const align = pointer ? kPointerSize : member.traits.align;
		const remainder = offset % align;
		offset += remainder ? align - remainder : 0;
		layout[member.key] = {
			layout: member.layout,
			offset,
			...pointer && { pointer: true as const },
		};
		offset += pointer ? kPointerSize : member.traits.size;
	}
	return layout as RequiredAndNonNullable<typeof layout>;
}

function getLayout(format: Format): Layout {
	if (typeof format === 'string') {
		// Integral types
		return format;

	} else if (Array.isArray(format)) {
		// Arrays (fixed size) & vectors (dynamic size)
		if (format[0] === 'array') {
			return Tuple('array' as const, format[1], getLayout(format[2]));
		} else if (format[0] === 'vector') {
			return Tuple('vector' as const, getLayout(format[1]));
		}
		throw TypeError(`Invalid array type: ${format[0]}`);

	} else {
		// Structures
		return getStructLayout(format);
	}
}
