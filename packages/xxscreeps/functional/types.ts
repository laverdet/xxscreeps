/**
 * Yeah, ok whatever.
 * https://github.com/microsoft/TypeScript/issues/39522
 */
export type Nullable<Type = never> = Type | null | undefined;

/**
 * This should match the allowed values in an `if (...)` statement.
 */
export type BooleanConvertible = Nullable | boolean | object;

/**
 * Remove all non-truthy elements from a type
 */
export type Truthy<Type> = Type extends undefined | null | false | '' | 0 ? never : Type;
