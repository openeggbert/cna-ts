/** Internal CLR-semantic errors. They remain ordinary JS RangeError/TypeError subclasses. */
export class ArgumentException extends RangeError {
  public constructor(message: string) { super(message); this.name = "ArgumentException"; }
}

export class ArgumentNullException extends TypeError {
  public constructor(message = "Value cannot be null") {
    super(message);
    this.name = "ArgumentNullException";
  }
}

export class ArgumentOutOfRangeException extends RangeError {
  public constructor(message: string) { super(message); this.name = "ArgumentOutOfRangeException"; }
}

export class IndexOutOfRangeException extends RangeError {
  public constructor(message = "Index was outside the bounds of the array") {
    super(message);
    this.name = "IndexOutOfRangeException";
  }
}

export class InvalidOperationException extends Error {
  public constructor(message = "Operation is not valid due to the current state") {
    super(message);
    this.name = "InvalidOperationException";
  }
}

export class NotSupportedException extends Error {
  public constructor(message = "Operation is not supported") {
    super(message);
    this.name = "NotSupportedException";
  }
}

export class ObjectDisposedException extends Error {
  public constructor(message = "Cannot access a disposed object") {
    super(message);
    this.name = "ObjectDisposedException";
  }
}

export class NullReferenceException extends TypeError {
  public constructor(message = "Object reference was null") {
    super(message);
    this.name = "NullReferenceException";
  }
}

export function transformArray<T>(
  sourceArray: T[],
  sourceIndex: number,
  destinationArray: T[],
  destinationIndex: number,
  length: number,
  transform: (value: T) => T,
): void {
  if (sourceArray == null) throw new TypeError("sourceArray cannot be null");
  if (destinationArray == null) throw new TypeError("destinationArray cannot be null");
  sourceIndex = Math.trunc(sourceIndex);
  destinationIndex = Math.trunc(destinationIndex);
  length = Math.trunc(length);
  if (sourceArray.length < sourceIndex + length) throw new ArgumentException("sourceArray is too small");
  if (destinationArray.length < destinationIndex + length) {
    throw new ArgumentException("destinationArray is too small");
  }
  while (length > 0) {
    if (sourceIndex < 0 || sourceIndex >= sourceArray.length ||
        destinationIndex < 0 || destinationIndex >= destinationArray.length) {
      throw new IndexOutOfRangeException();
    }
    destinationArray[destinationIndex] = transform(sourceArray[sourceIndex]);
    sourceIndex += 1;
    destinationIndex += 1;
    length -= 1;
  }
}
