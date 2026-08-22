/** Structural projection used where XNA exposes System.IEquatable<T>. */
export interface IEquatable<T> {
  Equals(other: T): boolean;
}

/** Structural projection used where XNA exposes System.IDisposable. */
export interface IDisposable {
  Dispose(): void;
}
