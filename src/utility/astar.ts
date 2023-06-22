import { Heap } from './heap.js';
import { OpenClosed } from './open-closed.js';
import { typedArrayFor } from './pack.js';

export type Adapter<Type> = {
	id(value: Type): number | null;
	value(id: number): Type;
	sizeof(): number;
};

export function astar<Type>(
	heapSize: number,
	adapter: Adapter<Type>,
	origin: Type[],
	heuristic: (pos: Type) => number,
	look: (to: Type, from: Type) => number,
	visit: (pos: Type, cost: number) => Iterable<Type>,
) {
	const maxId = adapter.sizeof();
	const terminalId = maxId + 1;
	const costs = new Float64Array(maxId);
	const heap = new Heap(maxId, maxId >>> 3, id => costs[id]);
	const openClosed = new OpenClosed(maxId);
	const parents = new (typedArrayFor(terminalId))(terminalId);

	// Initialize origin(s)
	for (const pos of origin) {
		const id = adapter.id(pos);
		if (id === null) {
			continue;
		}
		if (!openClosed.isOpen(id)) {
			openClosed.close(id);
			costs[id] = 0;
			parents[id] = terminalId;
			heap.push(id);
		}
	}
	while (heap.size) {
		// Fetch and close
		const id = heap.pop();
		openClosed.close(id);
		const value = adapter.value(id);
		const fCost = costs[id];
		const hCost = heuristic(value);
		const gCost = fCost - hCost;

		// Check for destination
		if (hCost === 0) {
			const route: Type[] = [ value ];
			let currentId = id;
			while (parents[currentId] !== terminalId) {
				currentId = parents[currentId];
				route.push(adapter.value(currentId));
			}
			route.reverse();
			return route;
		}

		// Visit and add neighbors
		for (const next of visit(value, fCost)) {

			// Check if closed
			const nextId = adapter.id(next);
			if (nextId === null || openClosed.isClosed(nextId)) {
				continue;
			}

			// Check neighbor cost
			const cost = look(next, value);
			if (cost === Infinity) {
				openClosed.close(nextId);
				continue;
			}

			// Update or add to heap
			const fCost = gCost + heuristic(next) + cost;
			if (openClosed.isOpen(nextId)) {
				if (fCost < costs[nextId]) {
					costs[nextId] = fCost;
					parents[nextId] = id;
					heap.update(nextId);
				}
			} else {
				costs[nextId] = fCost;
				parents[nextId] = id;
				openClosed.open(nextId);
				heap.push(nextId);
			}
		}
	}

	return null;
}
