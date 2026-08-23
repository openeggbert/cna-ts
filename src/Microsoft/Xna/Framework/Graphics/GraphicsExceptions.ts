export class DeviceLostException extends Error {
  public constructor();
  public constructor(message: string);
  public constructor(message: string, inner: Error);
  public constructor(message = "The graphics device was lost", inner?: Error) {
    super(message, inner ? { cause: inner } : undefined);
    this.name = "DeviceLostException";
  }
}

export class DeviceNotResetException extends Error {
  public constructor();
  public constructor(message: string);
  public constructor(message: string, inner: Error);
  public constructor(message = "The graphics device has not been reset", inner?: Error) {
    super(message, inner ? { cause: inner } : undefined);
    this.name = "DeviceNotResetException";
  }
}

export class NoSuitableGraphicsDeviceException extends Error {
  public constructor();
  public constructor(message: string);
  public constructor(message: string, inner: Error);
  public constructor(message = "No suitable graphics device was found", inner?: Error) {
    super(message, inner ? { cause: inner } : undefined);
    this.name = "NoSuitableGraphicsDeviceException";
  }
}
