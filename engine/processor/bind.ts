import type { ProcessorContext } from './context';
export const Process: unique symbol = Symbol('process');

export type ProcessorSpecification<Type> = {
	process: (this: Type, context: ProcessorContext) => void;
};

export function bindProcessor<Type>(impl: Constructor<Type>, processor: ProcessorSpecification<Type>) {
	impl.prototype[Process] = processor.process;
}
