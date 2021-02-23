import type { ProcessorContext } from './context';
export const Process = Symbol('process');
export const Tick = Symbol('tick');

export type ProcessorSpecification<Type> = {
	process?: (this: Type, intents: Dictionary<object>, context: ProcessorContext) => boolean;
	tick?: (this: Type, context: ProcessorContext) => boolean;
};

export function bindProcessor<Type>(impl: { prototype: Type }, processor: ProcessorSpecification<Type>) {
	(impl.prototype as any)[Process] = processor.process;
	(impl.prototype as any)[Tick] = processor.tick;
}
