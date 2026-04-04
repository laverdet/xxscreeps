# xxscreeps Architecture Overview

A visual guide for new contributors.

This document is a repo-level mental model, not a full implementation
reference. Read it to understand how the major parts fit together, then
open the source files listed at the end.

---

## The Big Picture

```text
                            ┌───────────────┐
                            │   Main Loop   │
                            │  (tick clock) │
                            │               │
                            │ advances time │
                            │ sends events  │
                            │ to services   │
                            └──┬─────┬────┬─┘
                       run     │  process │ tick
                 ┌─────────────┘     │    └──────────────┐
                 ▼                   ▼                   ▼
      ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
      │     Runner      │  │    Processor    │  │     Backend     │
      │  (player code)  │  │   (game logic)  │  │   (HTTP + WS)   │
      │                 │  │                 │  │                 │
      │  binary blob    │  │  binary blob    │  │  loads blob     │
      │    ▼            │  │    ▼            │  │    ▼            │
      │  withOverlay    │  │  withOverlay    │  │  pushes diffs   │
      │  ┌───────────┐  │  │  ┌───────────┐  │  │  to browser     │
      │  │ Creep     │  │  │  │ Creep     │  │  │  via websocket  │
      │  │ .hits     │  │  │  │ .hits     │  │  │                 │
      │  │ .name     │  │  │  │ .tickRaw  │  │  │  uses didUpdate │
      │  └───────────┘  │  │  │  Damage   │  │  │  to skip rooms  │
      │                 │  │  └───────────┘  │  │  that didn't    │
      │  player code    │  │                 │  │  change         │
      │  runs here      │  │  intent procs   │  └────────▲────────┘
      │                 │  │  tick procs     │           │
      └────────▲────────┘  └────────▲────────┘           │
               │                    │                    │
         read blobs +      read blobs + intents       read blobs
         write intents        save blobs                 │
               │                    │                    │
      ┌────────▼────────────────────▼────────────────────┴───────────┐
      │                          Database                            │
      │                      (keyval / binary)                       │
      └──────────────────────────────────────────────────────────────┘
```

- Four services, each with its own JS heap: main loop, runner,
  processor, and backend.
- The main loop is the tick clock. It is the only service that updates
  the shard's `"time"` and sends tick events to the other three.
- Binary room blobs are the data exchange format — each service loads
  its own readonly copy. `withOverlay()` lazily materializes JS objects
  from the binary buffer (see [Why Blobs Matter](#why-blobs-matter)).
  JS object instances never cross service boundaries.
- Backend listens to the main loop's `tick` event to know when to
  refresh. It uses `didUpdate` as an optimization to skip refetching
  rooms that haven't changed. Backend is optional — the launcher
  supports `--no-backend` for headless operation.
- All services can run on different machines. All except the main loop
  can have multiple instances.
- The **launcher** (`npx xxscreeps start`) bootstraps everything: reads
  the config, sets up the database, and spawns the services. It is not
  a service itself — once started, the main loop takes over tick
  orchestration. Flags like `--no-backend` control which services the
  launcher starts.

---

## Tick Flow

```text
  main loop (src/engine/service/main.ts)
     │
     ├─ advance shard time (only service that writes time)
     ├─ publish `tick` ────────────► backend (push new state to browser)
     ├─ publish `run` ─────────────► runner
     └─ publish `process` ─────────► processor
          │                            │
          │  (runner + processor run   │
          │    concurrently)           │
          │                            │
          │  runner:                   │  processor:
          │   load room blobs T-1      │   load room blobs T-1
          │   execute player code      │   wait for intents or timeout
          │   publish intents ─────────►   pre-tick hooks
          │                            │   intent processors
          │                            │   movement + tick processors
          │                            │   finalize room
          │                            │   save room blob at T
          │                            │
          └─ wait for both to finish  ─┘
```

- Player code runs inside `isolated-vm`, a separate V8 isolate with its
  own heap. This is how CPU limits are enforced and why the runner can
  be safely abandoned — crashing player code cannot affect the engine.
- There is also an `unsafeSandbox` mode that runs player code in `vm`
  instead of `isolated-vm`. This is faster and useful when you're only
  running your own code, but it uses regular `Symbol` primitives instead
  of private symbols, so the player could access otherwise-hidden
  engine state.
- Runner work is best-effort. It can crash or miss the deadline.
- Processor work is authoritative. Rooms must always be processed.
- Slow runner intents can be abandoned so the shard keeps moving.

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

### Schema Archive

The schema system archives previously-seen binary formats in
`screeps/archive/`. If you touch any part of a schema — by modifying
the source or changing which mods are loaded — the binary format will be
unrecognizable to code expecting the old layout.

Each room blob stores a version alongside its data. When a service
encounters a blob with an outdated format, it uses the archive to
transparently upgrade: removed fields are dropped, new fields are
zero-initialized. This keeps rooms readable across schema changes
without requiring a manual migration step.

The archive also contains [Kaitai](https://kaitai.io/) (`.ksy`) format
descriptors. You can take a blob and its `.ksy` file to
https://ide.kaitai.io and visually inspect every field in the binary
layout — a very useful debugging tool.

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
| `this['#field']` | No | Yes | Private-symbol property, truly hidden |

**`#field`** is true JS privacy — only the class that defines it can
touch it. Too restrictive for engine state that multiple mods or
processor files need to coordinate on.

**`this['#field']`** solves that. It's readable and writable from any
file (`this['#ageTime']` is set in `creep.ts`, read in
`processor.ts`). A babel transform converts these to **private symbol**
access at runtime. Private symbols are a v8 / `isolated-vm` feature
distinct from regular `Symbol` primitives — they are accessible only if
you hold a handle to the symbol and cannot be discovered through
enumeration or any other mechanism. This is important because it
protects sensitive engine state (room observers, `creep.saying`, etc.)
from player code.

In `unsafeSandbox` mode (`vm` instead of `isolated-vm`), regular
`Symbol` primitives are used instead. The properties are still hidden
from enumeration, but a determined player could discover them.

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
| Launcher | `src/engine/service/launcher.ts` |
| Main loop | `src/engine/service/main.ts` |
| Mod loading | `src/config/mods/index.ts` |
| Runner | `src/engine/runner/instance.ts` |
| Processor | `src/engine/processor/room.ts` |
| Room persistence | `src/engine/db/shard.ts` |
| Overlay system | `src/schema/overlay.ts` |
| Schema archive | `screeps/archive/` |
| Backend room socket | `src/backend/sockets/room.ts` |
| Backend server | `src/backend/server.ts` |
| Base game object | `src/game/object.ts` |
