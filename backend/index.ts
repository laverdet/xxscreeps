import { bindRenderer } from './sockets/render';

type MapPosition = [ number, number ];
type MapResult = {
	[Key: string]: MapPosition[];
};

export const MapSerializer = Symbol('mapSerializer');
export function bindMapSerializer<Type>(impl: Constructor<Type>, serializer: (object: Type, map: MapResult) => void) {
	impl.prototype[MapSerializer] = function(map: MapResult) {
		return serializer(this, map);
	};
}

export function bindRoomSerializer<Type>(impl: Constructor<Type>, serializer: (object: Type) => object) {
	bindRenderer(impl, function() {
		return serializer(this);
	});
}
