import { Implementation } from 'xxscreeps/util/types';
import { EnumFormat, Format, Interceptor, Primitive } from './format';
import { injectGetters } from './overlay';

export const kPointerSize = 4;

export function alignTo(address: number, align: number) {
	const alignMinusOne = align - 1;
	return ~alignMinusOne & (address + alignMinusOne);
}

type ResolvedFormat<Type> =
	(Type extends () => infer First ? First : never) |
	(Type extends () => any ? never : Type);
function resolve<Type>(declaration: Type): ResolvedFormat<Type> {
	if (typeof declaration === 'function') {
		return resolve(declaration());
	}
	return declaration as never;
}

export type Layout =
	Primitive | ComposedLayout | NamedLayout |
	ArrayLayout | EnumLayout | OptionalLayout | StructLayout | VariantLayout | VectorLayout;

type ArrayLayout = {
	array: Layout;
	length: number;
	size: number;
	stride?: number;
};

type ComposedLayout = {
	composed: Layout;
	interceptor: Interceptor | Implementation;
};

type EnumLayout = EnumFormat;

type NamedLayout = {
	named: string;
	layout: Layout;
};

type OptionalLayout = {
	optional: Layout;
	align: number;
};

export type StructLayout = {
	struct: Record<string, {
		align: number;
		offset: number;
		pointer?: true;
		name?: string | symbol;
		layout: Layout;
	}>;
	inherit?: StructLayout;
	size: number;
	variant?: number | string;
};

type VariantLayout = {
	variant: StructLayout[];
};

type VectorLayout = {
	vector: Layout;
	size: number;
	stride?: number;
};

type Traits = {
	align: number;
	size: number;
	stride?: number;
};

export function getLayout(unresolvedFormat: Format): { layout: Layout; traits: Traits } {
	const format = resolve(unresolvedFormat);
	if (typeof format === 'string') {
		// Check for integral types
		const integralSizes = {
			bool: 1,
			int8: 1,
			int16: 2,
			int32: 4,
			uint8: 1,
			uint16: 2,
			uint32: 4,
		};
		if (format in integralSizes) {
			const key = format as keyof typeof integralSizes;
			const size = integralSizes[key];
			return {
				layout: format,
				traits: {
					align: size,
					size,
					stride: size,
				},
			};
		}

		// Other basic type
		return {
			layout: format,
			traits: {
				align: kPointerSize,
				size: kPointerSize,
			},
		};

	} else if ('array' in format) {
		const length = format.length;
		const { layout, traits } = getLayout(format.array);
		const size = alignTo(traits.size, traits.align) * (length - 1) + traits.size;
		const stride = traits.stride && (traits.stride * (length - 1) + traits.size);
		return {
			layout: {
				array: layout,
				length,
				size,
				stride,
			},
			traits: {
				align: traits.align,
				size,
				stride,
			},
		};

	} else if ('composed' in format) {
		const { interceptor } = format;
		const { layout, traits } = getLayout(format.composed);
		if ('prototype' in interceptor) {
			// Inject prototype getters into overlay
			injectGetters(unpackWrappedStruct(layout), interceptor.prototype);
		}
		return {
			layout: {
				composed: layout,
				interceptor,
			},
			traits,
		};

	} else if ('enum' in format) {
		return {
			layout: format,
			traits: { align: 1, size: 1, stride: 1 },
		};

	} else if ('named' in format) {
		const { layout, traits } = getLayout(format.format);
		return {
			layout: {
				named: format.named,
				layout,
			},
			traits,
		};

	} else if ('optional' in format) {
		const { layout, traits } = getLayout(format.optional);
		return {
			layout: {
				optional: layout,
				align: traits.align,
			},
			traits: {
				align: 1,
				size: 1,
			},
		};

	} else if ('struct' in format) {
		// Grab layout for structure members
		const members = Object.entries(format.struct).map(([ key, member ]) => ({
			key,
			...typeof member === 'object' && 'member' in member ? {
				...getLayout(member.member),
				name: member.name,
			} : {
				...getLayout(member),
				name: undefined,
			},
		}));

		// Simple struct pack algorithm by sorting by size largest to smallest
		type MemberDescriptor = typeof members[number];
		const isPointer = (member: MemberDescriptor) => member.traits.stride === undefined;
		members.sort((left, right) => {
			const size = (member: MemberDescriptor) => isPointer(member) ? kPointerSize : member.traits.size;
			const elementSize = (member: MemberDescriptor) => isPointer(member) ? member.traits.size : Infinity;
			return (
				size(right) - size(left) ||
				elementSize(right) - elementSize(left) ||
				left.key.localeCompare(right.key)
			);
		});

		// Arrange member layout
		const baseLayout = format.inherit && getLayout(format.inherit);
		let offset = baseLayout?.traits.size ?? 0;
		const arrangedMembers = members.map(member => {
			const pointer = isPointer(member);
			const { layout, traits } = member;
			const memberOffset = alignTo(offset, pointer ? kPointerSize : traits.align);
			offset += pointer ? kPointerSize : traits.size;
			return {
				key: member.key,
				info: {
					align: traits.align,
					name: member.name,
					offset: memberOffset,
					...pointer && { pointer: true as const },
					layout,
				},
				traits,
			};
		});

		// Calculate struct traits
		const hasPointerElement = arrangedMembers.some(member => member.info.pointer);
		const align = Math.max(...arrangedMembers.map(member =>
			member.info.pointer ? kPointerSize : member.traits.align));
		const lastMember = arrangedMembers[arrangedMembers.length - 1];
		const size = lastMember.info.offset + (lastMember.info.pointer ? kPointerSize : lastMember.traits.size);
		const isFixedSize = !hasPointerElement && (!baseLayout || baseLayout.traits.stride !== undefined);
		return {
			layout: {
				struct: Object.fromEntries(arrangedMembers.map(member => [ member.key, member.info ])),
				inherit: baseLayout?.layout as StructLayout,
				size,
				variant: format.variant,
			},
			traits: {
				align,
				size,
				stride: isFixedSize ? alignTo(size, align) : undefined,
			},
		};

	} else if ('variant' in format) {
		return {
			layout: {
				variant: format.variant.map(variant => getLayout(variant).layout as StructLayout),
			},
			traits: {
				align: kPointerSize,
				size: kPointerSize,
			},
		};

	} else if ('vector' in format) {
		const { layout, traits } = getLayout(format.vector);
		return {
			layout: {
				vector: layout,
				size: traits.size,
				stride: traits.stride,
			},
			traits: {
				align: kPointerSize,
				size: kPointerSize,
			},
		};

	} else {
		throw new Error('Invalid format');
	}
}

export function unpackWrappedStruct(layout: Layout): StructLayout {
	if (typeof layout !== 'string') {
		if ('composed' in layout) {
			return unpackWrappedStruct(layout.composed);
		} else if ('named' in layout) {
			return unpackWrappedStruct(layout.layout);
		} else if ('struct' in layout) {
			return layout;
		}
	}
	throw new Error('Couldn\'t find struct');
}
