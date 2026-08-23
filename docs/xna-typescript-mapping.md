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
`string`, `System.Object` to `unknown`, and `System.IntPtr` to `bigint`; an opaque native handle is
never projected as that public integer. Arrays map to mutable or readonly arrays according to the
member contract. `System.Exception` maps to `Error`, and `System.EventArgs` to the synthetic
`EventArgs` value used by event contracts. `any` is not a general CLR-object mapping.

`System.IComparable<T>` and `System.IEquatable<T>` use explicit structural interfaces in the
projection. CLR `ICollection<T>`/`IList<T>` implementation heritage on XNA's named collection
classes is erased: those classes are not JavaScript arrays, while every declared XNA collection
member remains verified. A `Collection<T>` base is likewise erased, but its inherited public
collection surface is projected and verified on the named class. `ReadOnlyCollection<T>` follows
the same rule for Model collections: mutation stays absent while `Count`, index access, lookup,
copy, and enumeration remain explicit. A `Dictionary<K,V>` base maps to JavaScript `Map<K,V>`.
Public `GetEnumerator()` results map to `IterableIterator<T>`; an
`IEnumerable<T>` class also implements `Iterable<T>` and its required `[Symbol.iterator]()` is a
machine-recognized JavaScript protocol adaptation rather than an unexpected XNA member.

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

CLR numeric overloads can collapse to the same TypeScript signature. The important current case is
`Color`: `new Color(r, g, b[, a])` means integral 0–255 channels, while normalized 0–1 inputs use
the XNA `Vector3`/`Vector4` constructor or `PackFromVector4`. This deterministic dispatch rule is
recorded in `mapping-rules.json` and behavior-tested; runtime JavaScript cannot distinguish a CLR
`int` from a CLR `float` when both arrive as `number`.

Finite binary32 results, infinities, and signed zero are compared bit-for-bit. JavaScript does not
promise preservation of a CLR NaN payload or sign through arithmetic, so NaN observations compare
classification while still detecting finite/NaN divergence.

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
The verifier applies this one named rule. Lifecycle method names and order remain XNA-shaped.

CLR finalizers are omitted because JavaScript garbage collection cannot expose deterministic
`Finalize()` dispatch. The protected formatter-serialization constructor on exception types is
also omitted; JavaScript errors use their ordinary constructor and optional `cause`. Where CLR
declares a public `Dispose()` and protected `Dispose(bool)` overload on the same class, TypeScript
projects the public overload because it cannot express overload-specific accessibility.
The same limitation applies to `Effect`'s protected clone constructor beside its public byte-code
constructor, so both constructor signatures are callable in the TypeScript projection; `Clone()`
remains the ordinary public cloning API.

## Generics and content loading

Generic arity, parameter identity/order, generic-method parameters, named base/interface
constraints, and nested substitution through mapped interfaces are verifier inputs. Named
constraints become TypeScript intersections. A CLR reference-type constraint maps to `object`.
CLR value-type and parameterless-constructor constraints are counted and reported but erased from
the declaration because TypeScript has no faithful `struct`/`new()` equivalent for these numeric
XNA overloads. The verifier therefore reports separate measured counts instead of implying those
constraints were never inspected.

Type parameters and expressible constraints are kept in declarations. For example, the mapped
graphics transfer overloads preserve `T extends IVertexType`. When erased runtime type information
is needed, CNA-TS adds a class token consistently:
When erased runtime type information is needed, CNA-TS adds a class token consistently:

```ts
interface XnaType<T> {
  readonly prototype: T;
}

Content.Load(Texture2D, "logo"); // inferred Texture2D
```

The mapped contract is `Load<T>(assetType: XnaType<T>, assetName: string): T`. Likewise,
`ContentReader.ReadExternalReference<T>()` maps to
`ReadExternalReference<T>(assetType: XnaType<T>): T`, because the external target reader also needs
the erased runtime type. Every content type
uses this convention. It does not pretend that JavaScript has CLR generic reflection. Raw PNG
files use the mapped `Texture2D.FromStream`/raw-image route, not `Content.Load` unless they have
actually been compiled to XNB.

`System.Action<T>` maps to `XnaAction<T> = (value: T) => void`. The protected synchronous
`System.IO.Stream` surface used by `ContentManager`, `Texture2D.FromStream`, and texture save
methods maps to `Uint8Array`, the deterministic byte representation available in Node and
browsers. Inputs are snapshotted. Save methods accept caller-owned writable capacity and copy the
encoded result into it; insufficient capacity is an argument error.

Managed `ContentManager` implements Windows XNB v5 framing, reader tables and
versions, reader indexes, shared-resource fixups, cache/unload, disposable tracking, and built-in
Texture2D/SpriteFont/Model resource readers. `Content.Load(Type, name)` and nested reader dispatch
use the same class-token model. CLR reflection cannot discover a TypeScript reader constructor by
assembly-qualified string, so `cna-ts/extensions` provides `RegisterContentTypeReader(name,
readerType, targetType)`; this is a CNA-TS language bridge outside the strict XNA namespace.

Compressed XNB uses the XNA LZX framing contract, not a bare generic LZX stream: declared
decompressed size, short/extended frame headers, compressed block lengths, persistent decoder
state across frames, truncation, and exact final byte count are all validated. This container
compression is independent of GPU texture compression such as DXT; compressed texture bytes are
never reinterpreted as pixels.

Non-empty external references resolve relative to the referring asset name, normalize separators,
`.` and `..` through the same case-insensitive ContentManager cache, and recursively use the class
token. Repeated references preserve identity; cycles, missing/malformed targets, and type mismatch
fail explicitly. Nested successes keep ordinary cache ownership even if the referring asset later
fails, and `Unload` disposes the complete cache once. These are asset identities supplied to
`OpenStream`, not exposure of Node filesystem paths.

Texture transfer generics retain their XNA overload declarations. At runtime, the binding accepts
only deterministic mapped representations: `Color[]`, supported typed arrays, and supported
packed-vector arrays. Each representation supplies a fixed element size and native byte codec;
surface-format compatibility, mip/region bounds, source offsets, and counts are validated before
the synchronous CNA call. Arbitrary JavaScript objects are not treated as generic texture data.
`System.Text.StringBuilder` parameters map to `string`: a JavaScript caller supplies an immutable
text value, which the binding snapshots at the call boundary.

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

`System.IServiceProvider` maps to a structural `IServiceProvider` whose `GetService` accepts the
same `XnaType` token used elsewhere. `System.Type` parameters therefore never become string names.

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

A CLR `ref` parameter used only as input maps to an ordinary TypeScript value parameter. This is
especially important for array transform overloads: JavaScript passes the array object directly,
and the verifier deduplicates it only when the projected signature truly matches a value overload.

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
