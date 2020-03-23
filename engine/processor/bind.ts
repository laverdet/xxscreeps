import type { ProcessorContext } from './context';
export const Process: unique symbol = Symbol('process');
export const Tick: unique symbol = Symbol('tick');

export type ProcessorSpecification<Type> = {
	process?: (this: Type, intents: Dictionary<object>, context: ProcessorContext) => boolean;
	tick?: (this: Type, context: ProcessorContext) => boolean;
};

export function bindProcessor<Type>(impl: Constructor<Type>, processor: ProcessorSpecification<Type>) {
	impl.prototype[Process] = processor.process;
	impl.prototype[Tick] = processor.tick;
}
