# xxscreeps Architecture Overview

A visual guide for new contributors.

This document is a repo-level mental model, not a full implementation
reference. Read it to understand how the major parts fit together, then
open the source files listed at the end.

---

## The Big Picture

```text
      ┌──────────────────────────────────────────────────────────────┐
      │                          Database                            │
      │                      (keyval / binary)                       │
      └────────┬──────────────────▲──────────────────┬───────────────┘
               │                  │                  │
           read blob          save blob          read blob
               │                  │                  │
               ▼                  │                  ▼
      ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
      │     Runner      │  │    Processor    │  │     Backend     │
      │  (player code)  │  │   (game logic)  │  │   (HTTP + WS)   │
      │                 │  │                 │  │                 │
      │  binary blob    │  │  binary blob    │  │  subscribes to  │
      │    ▼            │  │    ▼            │  │  room channels  │
      │  withOverlay    │  │  withOverlay    │  │                 │
      │  ┌───────────┐  │  │  ┌───────────┐  │  │  loads blob     │
      │  │ Creep     │  │  │  │ Creep     │  │  │    ▼            │
      │  │ .hits     │  │  │  │ .hits     │  │  │  pushes diffs   │
      │  │ .name     │  │  │  │ .tickRaw  │  │  │  to browser     │
      │  └───────────┘  │  │  │  Damage   │  │  │  via websocket  │
      │                 │  │  └───────────┘  │  │                 │
      │  player code    │  │                 │  └─────────────────┘
      │  runs here      │  │  intent procs   │          ▲
      │                 │  │  tick procs      │          │
      └────────┬────────┘  └────────┬─────────┘   didUpdate
               │ intents          ▲ └──────────►  (channel)
               └──────────────────┘
```
```

- Three separate services with separate JS heaps.
- Binary room blobs are the only shared state.
- Each service rebuilds its own overlay-backed objects over the shared
  bytes. JS object instances never cross the boundary.
- Processor publishes `didUpdate` on room channels after saving. The
  backend subscribes, loads the new blob, and pushes diffs to the client.

---

## Tick Flow

```text
  main loop
     │
     ├─ advance tick
     ├─ publish `run` ─────────────► runner
     └─ publish `process` ─────────► processor
          │                            │
          │  (both run concurrently)   │
          │                            │
          │  runner:                   │  processor:
          │   load room blobs T-1     │   wait for intents or timeout
          │   execute player code     │   pre-tick hooks
          │   publish intents ────────►   intent processors
          │                           │   movement + tick processors
          │                           │   finalize room
          │                           │   save room blob at T
          │                           │
          └─ wait for both to finish ─┘
```

- Player code runs inside `isolated-vm`, a separate V8 isolate with its
  own heap. This is how CPU limits are enforced and why the runner can
  be safely abandoned — crashing player code cannot affect the engine.
- Runner work is best-effort. It can crash or miss the deadline.
- Processor work is authoritative. Rooms must always be processed.
- Slow runner intents can be abandoned so the shard keeps moving.
- Runner and processor can run on different machines.

---

## Intents

Player actions (move, attack, build, etc.) don't modify game state
directly. Player code calls `creep.move(TOP)`, which records an
**intent**. Intents are published through the keyval store and picked
up by the processor, which is the only thing that actually mutates room
state.

```text
  player code          runner           store           processor
      │                  │                │                  │
      │ creep.move(TOP)  │                │                  │
      │─────────────────►│                │                  │
      │ (records intent) │                │                  │
      │                  │ push intents   │                  │
      │                  │───────────────►│                  │
      │                  │                │  acquire intents │
      │                  │                │◄─────────────────│
      │                  │                │                  │ apply move
      │                  │                │                  │ update blob
```

### Registration and Ordering

Mods register intent processors with ordering constraints and conflict
groups:

```ts
registerIntentProcessor(Creep, 'attack', {
    before: 'harvest',    // attack resolves before harvest
    type: 'primary',      // conflict group
}, (creep, context, targetId: string) => {
    // ...
    context.didUpdate();  // signal that room state changed
});
```

At startup, all registered intents are topologically sorted into a
deterministic execution order. Conflict groups use bitmasks to prevent
incompatible intents on the same object in the same tick (e.g., a creep
can't `attack` and `rangedAttack` if both are `primary`).

### Pre-Tick and Tick Processors

Not all per-object logic is intent-driven. Tick processors handle
things that happen every tick regardless of player actions:

```ts
// before intents: flush stale state
registerObjectPreTickProcessor(Creep, (creep, context) => { ... });

// after intents: resolve accumulated damage, check death
registerObjectTickProcessor(Creep, (creep, context) => { ... });
```

### Inter-Room Intents

When an action in one room affects another (e.g., a creep crossing a
room border), the processor queues an inter-room intent. These are
applied in a finalize phase after all rooms have completed their primary
processing, preventing race conditions between rooms.

---

## Why Blobs Matter

```text
  database blob for one room
            │
            ▼
     binary buffer in memory
            │
            ▼
   `withOverlay()` installs getters
            │
            ▼
      `creep.hits` reads bytes
      `creep.name` may decode data
      untouched fields stay unmaterialized
```

Each room is stored as a compact binary blob rather than a sea of loose
JS objects. The runner and processor each create their own object
instances on top of those bytes.

Only schema-backed fields live in the blob. Ordinary JS properties do
not cross the runner/processor boundary.

The DB also double-buffers room blobs as `room0/` and `room1/`, keyed by
`time % 2`, so the current tick and the previous tick do not fight over
the same slot.

Schema fields cost real bytes. Zero is the default state, so booleans
should be designed so the common case is represented by `0`.

---

## Schemas

Schemas define the binary layout of game objects. Each field maps to a
fixed-size type at a specific offset in the buffer:

```ts
const shape = struct(objectFormat, {
    hits: 'int32',           // 4 bytes
    fatigue: 'int16',        // 2 bytes
    '#ageTime': 'int32',     // 4 bytes, engine-internal
    '#user': Id.format,      // player ID
});

export class Creep extends withOverlay(RoomObject, shape) {
    declare hits: number;
    declare fatigue: number;
    // ...
}
```

Available types include `'int8'`, `'int16'`, `'int32'`, `'uint8'`,
`'uint16'`, `'uint32'`, `'bool'`, `'string'`, and `Id.format`.

`optional()` wraps a type to allow null/undefined, but costs an extra
byte for the presence flag. `'bool'` is 1 byte, `optional('bool')` is
2 bytes. With ~500KB room payloads this adds up.

All schema fields initialize to zero (`0`, `false`, empty string).
Design flags so the zero value is the common/default case — e.g.,
`#inactive` (default `false` = active) rather than `#active` (which
would need to be set on every object).

---

## Overlay-Backed Fields Need `declare`

```ts
class Creep extends withOverlay(RoomObject, shape) {
    hits: number;         // wrong: creates this.hits = undefined
    declare fatigue: number; // right: type only, no emitted field
}
```

`withOverlay()` installs getters and setters on the prototype. A normal
class field emits an own property on the instance, which shadows the
prototype getter and makes the buffer-backed field invisible.

Rule of thumb: if the value comes from the schema or is filled in later
by engine lifecycle code, use `declare`.

---

## Mod System

```text
  mods declare:
    - dependencies
    - what they provide

  loader topologically sorts mods
            │
            ▼
  imports contributions for:
    - constants
    - game
    - processor
    - backend
    - storage
    - test
```

The engine core is intentionally small. Most gameplay and a large amount
of repo structure come from mods under `src/mods/`.

Dependencies form a directed acyclic graph: A can depend on B, but
circular dependencies are not allowed. A mod should only import from
its declared dependencies, not reach across the graph arbitrarily.

### Cross-Mod Communication

```text
  caller knows a shared base type
              │
              ▼
  call hook on `RoomObject`
              │
              ├── extension override runs
              ├── source override runs
              └── other mod override runs
```

The important pattern is "communicate through hooks on shared base
types", not "import the concrete mod you want to affect".

Common hook surfaces in this architecture:

- `environment`: one-time setup after mod loading
- `gameInitializer`: populate a new `Game` each tick
- `roomInitializer`: prepare a `Room` instance for use
- `flushContext`: clear per-phase processor state
- prototype hooks like `'#roomStatusDidChange'`

---

## `#private`, `declare`, and `'#quoted'`

| Form | Visible to player code | Accessible across files | Runtime effect |
| --- | --- | --- | --- |
| `#field` | No | No (class-scoped only) | True JS private slot |
| `declare field` | Depends on who assigns it | Yes | None (TypeScript-only) |
| `this['#field']` | No (babel strips from enumeration) | Yes | Regular property, hidden by convention |

**`#field`** is true JS privacy — only the class that defines it can
touch it. Too restrictive for engine state that multiple mods or
processor files need to coordinate on.

**`this['#field']`** solves that. It's a normal string-keyed property
that any file can read or write (`this['#ageTime']` is set in
`creep.ts`, read in `processor.ts`). A babel transform converts these
to symbol-based access at runtime — symbols don't appear in
enumeration, so player code won't see them. It's hidden, not enforced.
This is the workhorse for cross-file engine internals.

**`declare field`** has no runtime presence at all. It tells TypeScript
a property exists without emitting constructor code, so it won't shadow
a prototype getter installed by `withOverlay()`.

---

## Room Lifecycle

```text
  active room
     │
     │ no players and no pending wake time
     ▼
  sleeping room
     │
     │ inter-room intent or `wakeAt(time)`
     ▼
  active room
```

- `didUpdate()` marks room state dirty so it will be saved
- `setActive()` marks dirty and requests processing next tick
- `wakeAt(time)` schedules future processing without staying active
- unchanged sleeping rooms can be copied forward with
  `copyRoomFromPreviousTick()`

---

## Read Next

| Area | Files |
| --- | --- |
| Main loop | `src/engine/service/main.ts` |
| Mod loading | `src/config/mods/index.ts` |
| Runner | `src/engine/runner/instance.ts` |
| Processor | `src/engine/processor/room.ts` |
| Room persistence | `src/engine/db/shard.ts` |
| Overlay system | `src/schema/overlay.ts` |
| Backend room socket | `src/backend/sockets/room.ts` |
| Backend server | `src/backend/server.ts` |
| Base game object | `src/game/object.ts` |
