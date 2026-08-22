/** Error raised when an XNA content asset cannot be loaded or has the wrong runtime type. */
export class ContentLoadException extends Error {
  public constructor();
  public constructor(message: string);
  public constructor(message: string, innerException: Error);
  public constructor(message = "", innerException?: Error) {
    super(message, innerException === undefined ? undefined : { cause: innerException });
    this.name = "ContentLoadException";
  }
}
