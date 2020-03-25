import creep from './creep';
import source from './source';

export const Render: unique symbol = Symbol('render');
export function bindRenderer<Type>(impl: Constructor<Type>, renderer: (this: Type) => object) {
	impl.prototype[Render] = renderer;
}

export function bindRenderers() {
	creep();
	source();
}
