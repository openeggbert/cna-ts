# Normative XNA 4.0 to TypeScript/JavaScript mapping

This document defines the language projection applied by the CNA-TS API verifier. XNA reference
assembly metadata remains the API authority. A difference described here is a machine-applied
language transformation; differences not described here are diagnostics, not implied exceptions.

The first profile is **XNA 4.0 Windows runtime**:

- `Microsoft.Xna.Framework.dll`
- `Microsoft.Xna.Framework.Game.dll`
- `Microsoft.Xna.Framework.Graphics.dll`
- `Microsoft.Xna.Framework.Storage.dll`
- `Microsoft.Xna.Framework.Video.dll`
- `Microsoft.Xna.Framework.Input.Touch.dll`
- `Microsoft.Xna.Framework.Xact.dll`

The measured reference contract contains 257 visible types and 2,964 declared public/protected
members. GamerServices, networking, Avatar, Windows Phone, Xbox-specific APIs, and the build-time
Content Pipeline are separate profiles.

## Identity and names

Visible CLR namespace and nested-type identity maps to the `Microsoft.Xna.Framework.*` runtime
object tree and generated TypeScript declarations. XNA casing is preserved: `Game.Run()`,
`SpriteBatch.Begin()`, `Matrix.CreateScale()`, `Vector2.X`, and `GraphicsDevice.Viewport`.

The npm root may re-export a type as a convenient named import. Such an alias must reference the
same constructor or enum object as its strict namespace member and is not an unexpected XNA
member.

## Types and inheritance

| CLR concept | TypeScript/JavaScript projection |
| --- | --- |
| class | `class`, preserving visible base class and abstract state |
| sealed class | class with no public extension promise; verifier records sealed state |
| interface | `interface`; runtime-symbol checks do not require an erased interface object |
| struct | mutable value-oriented `class` unless an enum-specific rule applies |
| enum | runtime numeric enum object with exact names and values |
| delegate | typed callback signature |
| nested type | same enclosing identity in the contract model; deterministic exported name when JS nesting is impractical |

`System.Boolean`, integral primitives, `Single`, and `Double` map to `boolean` or `number`.
`Int64`/`UInt64` map to `bigint` when the full range is part of the contract. `System.String` maps to
`string`, `System.Object` to `unknown`, and arrays to mutable or readonly arrays according to the
member contract. `any` is not a general CLR-object mapping.

## Properties and fields

An XNA property maps to a same-cased JavaScript accessor. Getter and setter visibility and static
state remain part of the expected contract. An indexer maps to overloads of `Get(...)` and
`Set(...)` because JavaScript has no typed CLR indexer metadata.

Visible XNA fields remain same-cased mutable or readonly TypeScript fields. In particular the
public fields `Vector2.X` and `Vector2.Y` are mutable. Get-only static properties that return a
mutable struct produce a fresh value so mutating `Vector2.Zero` or `Color.White` cannot mutate a
shared named value.

## Mutable CLR value types

JavaScript assignment aliases objects, while CLR struct assignment copies values:

```ts
const a = b; // a and b refer to the same JavaScript object
```

This unavoidable difference is explicit. Constructors, retained properties, collections, event
payloads, and native/backend boundaries snapshot mutable value objects where XNA would copy a
struct. Named arithmetic returns a new value and does not mutate inputs. XNA public-field mutation
remains available.

`System.Single` is represented by a JavaScript `number`. Constructors and XNA single-precision
math operations use `Math.fround` at result boundaries. Direct writes to mutable public fields
cannot force the JavaScript engine to store an IEEE-754 binary32 value; the next XNA operation or
native snapshot normalizes it.

## Operators

JavaScript cannot project arbitrary CLR operators. Operator metadata maps to the existing XNA
named family:

| CLR operator | Expected XNA method |
| --- | --- |
| `op_Addition` | `Add` |
| `op_Subtraction` | `Subtract` |
| `op_Multiply` | `Multiply` |
| `op_Division` | `Divide` |
| `op_UnaryNegation` | `Negate` |
| equality operators | `Equals` plus the mapped static equality contract |

Overloads made redundant by a named return-value overload, such as many `ref/ref/out` math forms,
are deduplicated by an explicit operator/ref rule. No JavaScript convenience operators are added
to the strict projection.

## Methods and overloads

XNA method names and parameter order are preserved. Generated declarations use TypeScript
overload signatures and one validated JavaScript dispatcher. A significantly overloaded API such
as `SpriteBatch.Draw` must not collapse to `(...args: any[])`.

Optional CLR parameters become optional TypeScript parameters only when metadata supplies a
default. `null` maps to an explicit `null` union where the XNA contract accepts it; absence and
undefined are not silently treated as equivalent.

The browser-compatible lifecycle adaptation maps blocking `Game.Run(): void` to
`Game.Run(): Promise<void>` so asynchronous backend initialization and shutdown are observable.
This is recorded as `LANGUAGE_MAPPING_MISMATCH` until the verifier applies the specific rule.
Lifecycle method names and order remain XNA-shaped.

## Generics and content loading

Type parameters and constraints are kept in declarations where TypeScript can express them.
When erased runtime type information is needed, CNA-TS adds a class token consistently:

```ts
interface XnaType<T> extends Function {
  readonly prototype: T;
}

Content.Load(Texture2D, "logo"); // inferred Texture2D
```

The mapped contract is `Load<T>(assetType: XnaType<T>, assetName: string): T`. Every content type
uses this convention. It does not pretend that JavaScript has CLR generic reflection. Raw PNG
files use the mapped `Texture2D.FromStream`/raw-image route, not `Content.Load` unless they have
actually been compiled to XNB.

## Delegates and events

A delegate becomes a strongly typed callback. An event named `Foo` becomes a same-named readonly
event object:

```ts
type XnaEventHandler<TSender, TArgs> = (sender: TSender, args: TArgs) => void;

interface XnaEvent<TSender, TArgs> {
  Add(handler: XnaEventHandler<TSender, TArgs>): void;
  Remove(handler: XnaEventHandler<TSender, TArgs>): boolean;
}
```

Handlers run in subscription order. Duplicates remain duplicates. `Remove` removes the last
matching registration, consistent with multicast delegate subtraction. Dispatch uses a stable
snapshot, so subscription changes during dispatch apply to the next dispatch. Native callback
IDs and trampolines remain private.

## `ref` and `out`

No public holder class simulates CLR references. A return-value overload wins when XNA already has
one. Otherwise a method-specific readonly result object carries named outputs, for example:

```ts
interface MatrixDecomposeResult {
  readonly Success: boolean;
  readonly Scale: Vector3;
  readonly Rotation: Quaternion;
  readonly Translation: Vector3;
}
```

`Try*` methods use `{ Success, Value }`. Other multi-output methods use same-cased parameter names
as result properties. Every conversion is a mapping rule; an unmapped by-reference signature is a
`LANGUAGE_MAPPING_MISMATCH` and fails the strict gate.

## `System.TimeSpan` and `GameTime`

`System.TimeSpan` maps to the CNA-TS `TimeSpan` value abstraction. It stores signed 64-bit CLR
ticks in `bigint`, exposes same-cased component/total properties, and rejects overflow. Numeric
factory inputs are normalized toward zero to the nearest 100-nanosecond tick.

`GameTime` exposes `TotalGameTime`, `ElapsedGameTime`, and `IsRunningSlowly`. It never replaces
those properties with unrelated millisecond fields. Constructor inputs are snapshotted.

## Enums and flags

Enum names and signed numeric values must match metadata. Flags remain bitwise-usable numeric
values and keep their `[Flags]` meaning in the contract model. Reverse numeric lookup is a module
implementation detail and is not required. Enum value differences are `ENUM_VALUE_MISMATCH`.

## Disposal and native ownership

XNA `Dispose()` remains `Dispose()`. Native wrappers make it idempotent and reject substantive use
after disposal. `Symbol.dispose` or `FinalizationRegistry` may be opt-in safety mechanisms but do
not replace explicit disposal. Owned, borrowed, parent-owned, and adopted states never appear in
the public strict types.

## Verification consequences

The verifier compares the mapped expected contract with generated `dist/**/*.d.ts` using the
TypeScript compiler API. Runtime verification separately checks constructors, static values,
prototype methods, accessors, enum values, and namespace objects. Internal-leak checks reject
`internal`, backend, pointer, handle, memory, N-API, or WebAssembly implementation types in public
signatures. The allowlist starts and remains empty; intentional language changes belong in mapping
rules.
