export {}; // fake module

declare global {
	type RequiredAndNonNullable<Type> = {
		[Key in keyof Type]-?: NonNullable<Type[Key]>;
	};
}
