// Branded type for constants
const BrandOf = Symbol('brand');
const BrandValue = Symbol('brand');

interface Brand<Key extends string> {
	readonly [BrandOf]: Key;
}

export interface BrandVal<Key extends string, Value> extends Brand<Key> {
	readonly [BrandValue]: Value;
}

export type RemoveBrand<Type> = Type extends BrandVal<any, infer Value> ? Value : never;

export function makeBrand<Key extends string>() {
	return <Type extends number | string>(value: Type): Type & BrandVal<Key, Type> => value as Type & BrandVal<Key, Type>;
}
