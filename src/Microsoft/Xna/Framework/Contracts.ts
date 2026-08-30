/** Structural projection used where XNA exposes System.IEquatable<T>. */
export interface IEquatable<T> {
  Equals(other: T): boolean;
}

/** Structural projection used where XNA exposes System.IComparable<T>. */
export interface IComparable<T> {
  CompareTo(other: T): number;
}

/** Structural projection used where XNA exposes System.IDisposable. */
export interface IDisposable {
  Dispose(): void;
}

/** Runtime constructor token used where XNA accepts System.Type. */
export interface XnaType<T> {
  readonly prototype: T;
}

/** Single-argument callback projection used where XNA exposes System.Action<T>. */
export type XnaAction<T> = (value: T) => void;

/** Strongly typed projection of a CLR event handler. */
export type XnaEventHandler<TSender, TArgs> = (sender: TSender, args: TArgs) => void;

/** Subscription-only public view of an XNA event. */
export interface XnaEvent<TSender, TArgs> {
  Add(handler: XnaEventHandler<TSender, TArgs>): void;
  Remove(handler: XnaEventHandler<TSender, TArgs>): boolean;
}

/** Structural projection of System.IServiceProvider. */
export interface IServiceProvider {
  GetService(type: XnaType<unknown>): unknown;
}

/** Named-result projection used for CLR Try-pattern methods with one out value. */
export interface TryResult<T> {
  readonly Success: boolean;
  readonly Value: T;
}

/**
 * Structural projection of `System.IAsyncResult`, the handle XNA's `Begin.../End...` pair passes
 * between them.
 *
 * `AsyncWaitHandle` is deliberately absent: it is a `System.Threading.WaitHandle`, and JavaScript
 * has no blocking wait to project it onto. Everything a game does with one of these -- poll
 * `IsCompleted`, carry `AsyncState`, hand it back to the matching `End...` -- is here.
 */
export interface IAsyncResult {
  /** The caller-supplied state object passed to the `Begin...` call. */
  readonly AsyncState: unknown;
  /** Whether the operation finished before `Begin...` returned. */
  readonly CompletedSynchronously: boolean;
  /** Whether the operation has finished. */
  readonly IsCompleted: boolean;
}

/** Projection of `System.AsyncCallback`, invoked when a `Begin...` operation completes. */
export type AsyncCallback = (result: IAsyncResult) => void;
