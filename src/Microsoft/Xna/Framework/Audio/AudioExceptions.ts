function messageAndOptions(
  message: string | undefined,
  inner: Error | undefined,
): [string, ErrorOptions | undefined] {
  return [message ?? "", inner === undefined ? undefined : { cause: inner }];
}

export class InstancePlayLimitException extends Error {
  public constructor();
  public constructor(message: string);
  public constructor(message: string, inner: Error);
  public constructor(message?: string, inner?: Error) {
    const args = messageAndOptions(message, inner);
    super(args[0], args[1]);
    this.name = "InstancePlayLimitException";
  }
}

export class NoAudioHardwareException extends Error {
  public constructor();
  public constructor(message: string);
  public constructor(message: string, inner: Error);
  public constructor(message?: string, inner?: Error) {
    const args = messageAndOptions(message, inner);
    super(args[0], args[1]);
    this.name = "NoAudioHardwareException";
  }
}

export class NoMicrophoneConnectedException extends Error {
  public constructor();
  public constructor(message: string);
  public constructor(message: string, inner: Error);
  public constructor(message?: string, inner?: Error) {
    const args = messageAndOptions(message, inner);
    super(args[0], args[1]);
    this.name = "NoMicrophoneConnectedException";
  }
}
