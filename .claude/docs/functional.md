# Functional Style Guidelines

How and when to use the `Fn` namespace (`packages/xxscreeps/functional/`).

---

## The module

- Every function lives in its own file, re-exported through the `functional.ts` barrel so the result
  is (in theory) tree-shakable.
- Consumers import the whole namespace through the `fn.ts` wrapper:

  ```ts
  import { Fn } from 'xxscreeps/functional/fn.js';
  ```

  This is the only sanctioned spelling — never `import * as Fn from ...` at a call site, and never
  deep imports of individual iterable helpers.
- The exceptions are the combinator modules, which are imported by name, not through `Fn`:
  - `xxscreeps/functional/comparator.js` — `numericComparator`, `mappedNumericComparator`,
    `compositeComparator`, inverted variants…
  - `xxscreeps/functional/predicate.js` — `instanceOfPredicate`, `nonNullPredicate`,
    `everyPredicate`, `somePredicate`…


## Core principles

### Lazy by default, materialize once at the end

Sequence operators (`map`, `filter`, `reject`, `transform`, `concat`, `take`, `takeWhile`, `scan`,
`intersperse`, `range`, `slice`, `reverse`) return lazy iterables. Terminal folds (`accumulate`, `reduce`, `fold`,
`first`, `find`, `some`, `every`, `minimum`, `maximum`, `groupBy`, `join`, `fromEntries`) iterate
eagerly.

Chain lazily and materialize exactly once at the end — into `[ ...$$ ]`, `new Map($$)`, `new
Set($$)`, or `Fn.fromEntries($$)`:

```ts
// game/game.ts
this.objects = Fn.pipe(
	rooms,
	$$ => Fn.transform($$, room => Fn.map(room['#objects'], object => [ object.id, object ] as const)),
	$$ => new Map($$));
```

Don't materialize at all when the consumer just iterates — many functions return the lazy iterable
directly (`Room#lookForAtArea`, hook mappers, etc.).


### `Fn` is for iterables, not a replacement for array methods

The point of `Fn` is that it works on *anything* iterable — `Map`, `Set`, generators, schema vectors
— and avoids intermediate array allocations. When you already hold an array and the operation is a
single step, plain array methods are fine and common:

```ts
// backend/endpoints/game/map-stats.ts
const mineral = room['#objects'].find(instanceOfPredicate(Mineral));
```

Reach for `Fn` when the source isn't an array, when you're chaining multiple steps, or when the
result doesn't need to be an array.


### `Fn.pipe` replaces the pipeline operator

Multi-step sequences use `Fn.pipe`. The conventions are strict:

- The piped value is always named `$$`.
- One operation per stage, each on its own line.
- Materialization, if needed, is the final stage.

```ts
// game/room/sector.ts
sectors: Fn.pipe(
	iterateRoomArea(rx, ry, 5),
	$$ => Fn.filter($$, ([ xx, yy ]) => isCentralAxis(xx) && isCentralAxis(yy)),
	$$ => Fn.map($$, ([ xx, yy ]) => makeSignedRoomName(xx, yy)),
	$$ => Fn.filter($$, name => rooms.has(name)),
	$$ => [ ...$$ ]),
```

For one or two operations, plain nesting is preferred over a pipe:

```ts
this.rooms = Fn.fromEntries(Fn.map(rooms, room => [ room.name, room ]));
```


## Idioms

### Truthy filtering

`Fn.filter($$)` with no predicate keeps only truthy elements and narrows the type (`Type |
undefined` → `Type`). This is the standard way to drop holes after a `map` that can return
`undefined`:

```ts
// backend/endpoints/game/terrain.ts
rooms: Fn.pipe(
	context.request.body.rooms,
	$$ => Fn.map($$, roomQuery => getTerrainPayload(context.backend.world, roomQuery)),
	$$ => Fn.filter($$),
	$$ => [ ...$$ ]),
```


### `reject` over negated `filter`

When the predicate names the thing you *don't* want, use `Fn.reject` — it also `Exclude`s type-guard
predicates from the element type:

```ts
// game/processor.ts
$$ => Fn.reject($$, object => object['#layer'] === undefined || object.hits === undefined),
```


### Sums via `accumulate`

Never `reduce((a, b) => a + b)` — `Fn.accumulate` is the sum fold, with an optional mapper. It is
everywhere in game code:

```ts
return Fn.accumulate(creep.body, bodyPart => C.BODYPART_COST[bodyPart.type]);
if (Fn.accumulate(structures, structure => structure.store[C.RESOURCE_ENERGY]) < amount) { ...
```


### Extrema via `minimum` / `maximum` + comparators

Don't sort-and-take-first. `Fn.minimum` / `Fn.maximum` take a comparator; build comparators from the
combinators in `comparator.js` rather than writing subtraction inline when a mapper expresses it
better:

```ts
// schema/layout.ts
$$ => Fn.minimum($$, mappedNumericComparator(([ , padding ]) => padding)),

// mods/classic/invader/loop/shoot-at-will.ts — inline is fine for trivial cases
const target = Fn.minimum(targets, (left, right) => left.hits! - right.hits!)!;
```


### Concurrent async fan-out via `mapAwait`

`Fn.mapAwait(iterable, asyncFn)` is `Promise.all(Fn.map(...))` — it runs concurrently and returns
`Promise<Result[]>`. This is the house style for "load all of these":

```ts
const rows = await Fn.mapAwait(ids.sort(primitiveComparator), async id => { ... });
const blobList = await Fn.mapAwait(outgoing, id => loadTransactionBlob(shard, id));
```

Async *iterable* variants carry an `Async` suffix (`mapAsync`, `filterAsync`, `concatAsync`,
`shiftAsync`, `transformAsync`, `collect`, `divide`, `distribute`) and mirror their sync
counterparts.


### `concat` to walk several collections without allocating

```ts
// backend/sockets/room.ts
for (const userId of Fn.concat<string>([ users.presence, users.extra ])) { ...
```

Note the explicit type parameter — inference across heterogeneous iterables often needs the hint
(`Fn.concat<Structure | ConstructionSite>([...])`). `Fn.transform` (lazy flatMap) is the
map-then-concat fusion:

```ts
$$ => Fn.transform($$, pos => this['#lookAt'](pos)),
```


### `range` for index iteration

`Fn.range(count)` or `Fn.range(start, end)` instead of C-style `for` loops when the body is
expression-shaped. A reversed range (`start > end`) iterates downward.

```ts
Fn.some(Fn.range(1, 49), ii => terrain.get(...fn(ii)) !== C.TERRAIN_MASK_WALL);
```


### `slice` / `reverse` — lazy array views

Unlike the rest of `Fn`, these two require a real array (they index by position) rather than any
iterable. Both return a lazy iterable over the array *in place* — no copy, and no mutation. Use them
instead of `Array#slice` (which allocates) and `Array#reverse` (which mutates) when the result is
only going to be iterated:

```ts
// mods/classic/creep/creep.ts — sum a prefix without copying it
const boostedDelta = Fn.accumulate(Fn.slice(deltas, 0, sliceCount));
```

Since the views are lazy, mutating the array before iteration completes will be visible through
them.


### `fromEntries` builds well-typed objects

`Fn.fromEntries` is `Object.fromEntries` plus an optional entry mapper. The type of the return value
tends to produce objects with a better shape than the built-in `Object.fromEntries`. Also, the
returned object has a **null prototype**. Generally `Fn.fromEntries` is preferred but
`Object.fromEntries` is also fine if the types work out.


### `fold` vs `reduce`

- `Fn.reduce(iterable, initial, reducer)` — classic accumulator fold.
- `Fn.fold(iterable, identity, operation)` — the *first element* is the seed; `identity` is returned
  only when the iterable is empty. Use it to combine homogeneous values, especially composing
  functions:

```ts
// driver/runtime/index.ts — merge nullable hooks into one function
$$ => Fn.fold($$, () => {}, (left, right) => Fn.chain(left, right, Fn.chainSequenceVoid1)));
```


### Predicate & comparator factories compose with everything

`instanceOfPredicate`, `nonNullPredicate` etc. work with both `Fn` folds and native array methods:

```ts
return Fn.find(room['#objects'], instanceOfPredicate(StructurePowerBank));
const mineral = room['#objects'].find(instanceOfPredicate(Mineral));
```


### `shift` for head/rest splits

`Fn.shift` peels the first element and returns `{ head, rest }`; it is disposable-aware (`using
shift = Fn.shift(range)`), and `rest` is `undefined` for the empty iterable. Combined with `scan` it
makes pairwise windows:

```ts
// game/map.ts — route steps as [prev, next] pairs
$$ => Fn.scan($$, [ origin, origin ] as const, (prev, next) => [ prev[1], next ] as const),
$$ => Fn.shift($$).rest ?? [],
```

## Expression-oriented style

### `.entries()` over index-based loops

When a statement-shaped loop needs both the index and the element, iterate `array.entries()` rather
than writing a C-style `for (let ii = 0; ...)` — no `let` counter, no manual indexing, and both
bindings are fresh `const`s each iteration:

```ts
// mods/classic/structure/structure.ts
for (const [ ii, structure ] of structures.entries()) {
	structure['#active'] = ii < maxCount && structure['#user'] === userId;
}
```

Nested loops read the same way (`driver/pathfinder/profile.ts` walks all position pairs with two
`.entries()` loops). If only the index is needed, use `Fn.range(array.length)`; if only the
elements, plain `for...of`.


### Generators over push loops

When a production is too complicated for `Fn.map` / `Fn.transform` — stateful loops, multiple yields
per step, early bail-out — write a `function*` generator instead of pushing into a mutable array. If
an array is needed, spread an inline generator IIFE; loop state stays private to the generator:

```ts
// schema/layout.ts — greedy struct packing
const structMembers = [ ...function*() {
	while (entries.length !== 0) {
		// ...
		yield { key, layout, traits };
	}
}() ];
```

If the consumer just iterates, return the generator itself and keep the whole thing lazy:

```ts
// engine/db/storage/local/keyval.ts
return new SortedSet(function*(): Iterable<[ number, string ]> { ... }());
```


## Things to avoid

- **Don't re-iterate a lazy result.** These are single-pass iterators; spread into an array first if
  you need two passes.
- **Don't hand-roll what a fold already does** — sums (`accumulate`), extrema (`minimum`/`maximum`),
  existence (`some`/`every`), grouping (`groupBy`), string building (`join`).
- **Don't use bare `.map().filter()` array chains** or as multi-step pipelines that allocate an
  array per step. If you already have an array, and the result should be an array, and the operation
  is only one stage, then you should use the native Array functions.
- **Don't import individual iterable helpers directly** — go through `Fn`; only
  comparators/predicates/`nil` are imported by name.
