import type {
  GamePadCapabilitiesSnapshot,
  GamePadStateSnapshot,
} from "../../../../internal/input.js";
import { boolString, int32, rawFloatBits, smartInputHash } from "../../../../internal/input.js";
import { valueString } from "../../../../internal/value.js";
import { Vector2 } from "../Vector2.js";
import { ButtonState, Buttons, GamePadType } from "./Enums.js";

function state(value: Buttons, flag: Buttons): ButtonState {
  return (value & flag) !== 0 ? ButtonState.Pressed : ButtonState.Released;
}

function pressedNames(values: readonly [ButtonState, string][]): string {
  const names = values.filter(([button]) => button === ButtonState.Pressed).map(([, name]) => name);
  return names.length === 0 ? "None" : names.join(" ");
}

export class GamePadButtons {
  readonly #a: ButtonState;
  readonly #b: ButtonState;
  readonly #x: ButtonState;
  readonly #y: ButtonState;
  readonly #back: ButtonState;
  readonly #start: ButtonState;
  readonly #bigButton: ButtonState;
  readonly #leftShoulder: ButtonState;
  readonly #rightShoulder: ButtonState;
  readonly #leftStick: ButtonState;
  readonly #rightStick: ButtonState;

  public constructor(buttons: Buttons) {
    this.#a = state(buttons, Buttons.A);
    this.#b = state(buttons, Buttons.B);
    this.#x = state(buttons, Buttons.X);
    this.#y = state(buttons, Buttons.Y);
    this.#back = state(buttons, Buttons.Back);
    this.#start = state(buttons, Buttons.Start);
    this.#bigButton = state(buttons, Buttons.BigButton);
    this.#leftShoulder = state(buttons, Buttons.LeftShoulder);
    this.#rightShoulder = state(buttons, Buttons.RightShoulder);
    this.#leftStick = state(buttons, Buttons.LeftStick);
    this.#rightStick = state(buttons, Buttons.RightStick);
  }

  public get A(): ButtonState { return this.#a; }
  public get B(): ButtonState { return this.#b; }
  public get X(): ButtonState { return this.#x; }
  public get Y(): ButtonState { return this.#y; }
  public get Back(): ButtonState { return this.#back; }
  public get Start(): ButtonState { return this.#start; }
  public get BigButton(): ButtonState { return this.#bigButton; }
  public get LeftShoulder(): ButtonState { return this.#leftShoulder; }
  public get RightShoulder(): ButtonState { return this.#rightShoulder; }
  public get LeftStick(): ButtonState { return this.#leftStick; }
  public get RightStick(): ButtonState { return this.#rightStick; }

  public Equals(obj: unknown): boolean {
    return obj instanceof GamePadButtons && this.A === obj.A && this.B === obj.B &&
      this.X === obj.X && this.Y === obj.Y && this.Back === obj.Back &&
      this.Start === obj.Start && this.BigButton === obj.BigButton &&
      this.LeftShoulder === obj.LeftShoulder && this.RightShoulder === obj.RightShoulder &&
      this.LeftStick === obj.LeftStick && this.RightStick === obj.RightStick;
  }

  public GetHashCode(): number {
    return smartInputHash(
      this.A, this.B, this.X, this.Y, this.LeftShoulder, this.RightShoulder,
      this.LeftStick, this.RightStick, this.Start, this.Back, this.BigButton,
    );
  }

  public ToString(): string {
    return `{Buttons:${pressedNames([
      [this.A, "A"], [this.B, "B"], [this.X, "X"], [this.Y, "Y"],
      [this.LeftShoulder, "LeftShoulder"], [this.RightShoulder, "RightShoulder"],
      [this.LeftStick, "LeftStick"], [this.RightStick, "RightStick"],
      [this.Start, "Start"], [this.Back, "Back"], [this.BigButton, "BigButton"],
    ])}}`;
  }
}

export class GamePadDPad {
  readonly #up: ButtonState;
  readonly #down: ButtonState;
  readonly #left: ButtonState;
  readonly #right: ButtonState;

  public constructor(
    upValue: ButtonState,
    downValue: ButtonState,
    leftValue: ButtonState,
    rightValue: ButtonState,
  ) {
    this.#up = upValue;
    this.#down = downValue;
    this.#left = leftValue;
    this.#right = rightValue;
  }

  public get Up(): ButtonState { return this.#up; }
  public get Down(): ButtonState { return this.#down; }
  public get Left(): ButtonState { return this.#left; }
  public get Right(): ButtonState { return this.#right; }

  public Equals(obj: unknown): boolean {
    return obj instanceof GamePadDPad && this.Up === obj.Up && this.Down === obj.Down &&
      this.Left === obj.Left && this.Right === obj.Right;
  }

  public GetHashCode(): number { return smartInputHash(this.Up, this.Down, this.Left, this.Right); }

  public ToString(): string {
    return `{DPad:${pressedNames([
      [this.Up, "Up"], [this.Down, "Down"], [this.Left, "Left"], [this.Right, "Right"],
    ])}}`;
  }
}

export class GamePadTriggers {
  readonly #left: number;
  readonly #right: number;

  public constructor(leftTrigger: number, rightTrigger: number) {
    this.#left = Math.fround(Math.max(Math.min(Math.fround(leftTrigger), 1), 0));
    this.#right = Math.fround(Math.max(Math.min(Math.fround(rightTrigger), 1), 0));
  }

  public get Left(): number { return this.#left; }
  public get Right(): number { return this.#right; }

  public Equals(obj: unknown): boolean {
    return obj instanceof GamePadTriggers && this.Left === obj.Left && this.Right === obj.Right;
  }

  public GetHashCode(): number { return smartInputHash(rawFloatBits(this.Left), rawFloatBits(this.Right)); }
  public ToString(): string { return `{Left:${valueString(this.Left)} Right:${valueString(this.Right)}}`; }
}

export class GamePadThumbSticks {
  readonly #left: Vector2;
  readonly #right: Vector2;

  public constructor(leftThumbstick: Vector2, rightThumbstick: Vector2) {
    this.#left = Vector2.Max(Vector2.Min(leftThumbstick, Vector2.One), Vector2.Negate(Vector2.One));
    this.#right = Vector2.Max(Vector2.Min(rightThumbstick, Vector2.One), Vector2.Negate(Vector2.One));
  }

  public get Left(): Vector2 { return this.#left; }
  public get Right(): Vector2 { return this.#right; }

  public Equals(obj: unknown): boolean {
    return obj instanceof GamePadThumbSticks && this.Left.Equals(obj.Left) && this.Right.Equals(obj.Right);
  }

  public GetHashCode(): number {
    return smartInputHash(
      rawFloatBits(this.Left.X), rawFloatBits(this.Left.Y),
      rawFloatBits(this.Right.X), rawFloatBits(this.Right.Y),
    );
  }

  public ToString(): string { return `{Left:${this.Left.ToString()} Right:${this.Right.ToString()}}`; }
}

function analogButtons(thumbSticks: GamePadThumbSticks, triggers: GamePadTriggers): number {
  const leftX = Math.trunc(Math.fround(thumbSticks.Left.X * 32767));
  const leftY = Math.trunc(Math.fround(thumbSticks.Left.Y * 32767));
  const rightX = Math.trunc(Math.fround(thumbSticks.Right.X * 32767));
  const rightY = Math.trunc(Math.fround(thumbSticks.Right.Y * 32767));
  const leftTrigger = Math.trunc(Math.fround(triggers.Left * 255));
  const rightTrigger = Math.trunc(Math.fround(triggers.Right * 255));
  let result = 0;
  if (leftX < -7849) result |= Buttons.LeftThumbstickLeft;
  if (leftX > 7849) result |= Buttons.LeftThumbstickRight;
  if (leftY < -7849) result |= Buttons.LeftThumbstickDown;
  if (leftY > 7849) result |= Buttons.LeftThumbstickUp;
  if (rightX < -8689) result |= Buttons.RightThumbstickLeft;
  if (rightX > 8689) result |= Buttons.RightThumbstickRight;
  if (rightY < -8689) result |= Buttons.RightThumbstickDown;
  if (rightY > 8689) result |= Buttons.RightThumbstickUp;
  if (leftTrigger > 30) result |= Buttons.LeftTrigger;
  if (rightTrigger > 30) result |= Buttons.RightTrigger;
  return result | 0;
}

function rawButtons(
  thumbSticks: GamePadThumbSticks,
  triggers: GamePadTriggers,
  buttons: GamePadButtons,
  dPad: GamePadDPad,
): number {
  let result = analogButtons(thumbSticks, triggers);
  const values: readonly [Buttons, ButtonState][] = [
    [Buttons.A, buttons.A], [Buttons.B, buttons.B], [Buttons.X, buttons.X], [Buttons.Y, buttons.Y],
    [Buttons.Back, buttons.Back], [Buttons.Start, buttons.Start], [Buttons.BigButton, buttons.BigButton],
    [Buttons.LeftShoulder, buttons.LeftShoulder], [Buttons.RightShoulder, buttons.RightShoulder],
    [Buttons.LeftStick, buttons.LeftStick], [Buttons.RightStick, buttons.RightStick],
    [Buttons.DPadUp, dPad.Up], [Buttons.DPadDown, dPad.Down],
    [Buttons.DPadLeft, dPad.Left], [Buttons.DPadRight, dPad.Right],
  ];
  for (const [flag, value] of values) if (value === ButtonState.Pressed) result |= flag;
  return result | 0;
}

const nativeState = new WeakMap<GamePadState, Pick<GamePadStateSnapshot, "IsConnected" | "PacketNumber">>();

export class GamePadState {
  readonly #isConnected: boolean;
  readonly #packetNumber: number;
  readonly #thumbSticks: GamePadThumbSticks;
  readonly #triggers: GamePadTriggers;
  readonly #buttons: GamePadButtons;
  readonly #dPad: GamePadDPad;
  readonly #rawButtons: number;

  public constructor(
    leftThumbStick: Vector2,
    rightThumbStick: Vector2,
    leftTrigger: number,
    rightTrigger: number,
    buttons: Buttons[],
  );
  public constructor(
    thumbSticks: GamePadThumbSticks,
    triggers: GamePadTriggers,
    buttons: GamePadButtons,
    dPad: GamePadDPad,
  );
  public constructor(
    leftOrThumbs: Vector2 | GamePadThumbSticks,
    rightOrTriggers: Vector2 | GamePadTriggers,
    leftOrButtons: number | GamePadButtons,
    rightOrDPad: number | GamePadDPad,
    suppliedButtons?: Buttons[],
  ) {
    this.#isConnected = true;
    this.#packetNumber = 0;
    if (leftOrThumbs instanceof GamePadThumbSticks) {
      this.#thumbSticks = leftOrThumbs;
      this.#triggers = rightOrTriggers as GamePadTriggers;
      this.#buttons = leftOrButtons as GamePadButtons;
      this.#dPad = rightOrDPad as GamePadDPad;
    } else {
      let mask = 0;
      if (suppliedButtons != null) for (const button of suppliedButtons) mask |= button;
      this.#thumbSticks = new GamePadThumbSticks(leftOrThumbs, rightOrTriggers as Vector2);
      this.#triggers = new GamePadTriggers(leftOrButtons as number, rightOrDPad as number);
      this.#buttons = new GamePadButtons(mask as Buttons);
      this.#dPad = new GamePadDPad(
        state(mask, Buttons.DPadUp), state(mask, Buttons.DPadDown),
        state(mask, Buttons.DPadLeft), state(mask, Buttons.DPadRight),
      );
    }
    this.#rawButtons = rawButtons(this.#thumbSticks, this.#triggers, this.#buttons, this.#dPad);
  }

  public get IsConnected(): boolean { return nativeState.get(this)?.IsConnected ?? this.#isConnected; }
  public get PacketNumber(): number { return nativeState.get(this)?.PacketNumber ?? this.#packetNumber; }
  public get ThumbSticks(): GamePadThumbSticks { return this.#thumbSticks; }
  public get Triggers(): GamePadTriggers { return this.#triggers; }
  public get Buttons(): GamePadButtons { return this.#buttons; }
  public get DPad(): GamePadDPad { return this.#dPad; }

  public IsButtonDown(button: Buttons): boolean {
    const flag = int32(button);
    return (this.#rawButtons & flag) === flag;
  }

  public IsButtonUp(button: Buttons): boolean { return !this.IsButtonDown(button); }

  public Equals(obj: unknown): boolean {
    return obj instanceof GamePadState && this.IsConnected === obj.IsConnected &&
      this.PacketNumber === obj.PacketNumber && this.ThumbSticks.Equals(obj.ThumbSticks) &&
      this.Triggers.Equals(obj.Triggers) && this.Buttons.Equals(obj.Buttons) && this.DPad.Equals(obj.DPad);
  }

  public GetHashCode(): number {
    return this.ThumbSticks.GetHashCode() ^ this.Triggers.GetHashCode() ^
      this.Buttons.GetHashCode() ^ (this.IsConnected ? 1 : 0) ^
      this.DPad.GetHashCode() ^ this.PacketNumber;
  }

  public ToString(): string { return `{IsConnected:${boolString(this.IsConnected)}}`; }
}

/** Internal construction boundary for an exact native controller snapshot. */
export function createGamePadState(snapshot: GamePadStateSnapshot): GamePadState {
  const result = new GamePadState(
    new Vector2(snapshot.LeftX, snapshot.LeftY),
    new Vector2(snapshot.RightX, snapshot.RightY),
    snapshot.LeftTrigger,
    snapshot.RightTrigger,
    [snapshot.PressedButtons as Buttons],
  );
  nativeState.set(result, {
    IsConnected: snapshot.IsConnected,
    PacketNumber: int32(snapshot.PacketNumber),
  });
  return result;
}

/** Backend-produced controller capabilities; XNA exposes no public constructor. */
export class GamePadCapabilities {
  readonly #snapshot: GamePadCapabilitiesSnapshot;

  private constructor(snapshot: GamePadCapabilitiesSnapshot) { this.#snapshot = snapshot; }

  public get IsConnected(): boolean { return this.#snapshot.IsConnected; }
  public get GamePadType(): GamePadType { return this.#snapshot.GamePadType as GamePadType; }
  public get HasAButton(): boolean { return this.#snapshot.HasAButton; }
  public get HasBButton(): boolean { return this.#snapshot.HasBButton; }
  public get HasXButton(): boolean { return this.#snapshot.HasXButton; }
  public get HasYButton(): boolean { return this.#snapshot.HasYButton; }
  public get HasBackButton(): boolean { return this.#snapshot.HasBackButton; }
  public get HasStartButton(): boolean { return this.#snapshot.HasStartButton; }
  public get HasBigButton(): boolean { return this.#snapshot.HasBigButton; }
  public get HasDPadUpButton(): boolean { return this.#snapshot.HasDPadUpButton; }
  public get HasDPadDownButton(): boolean { return this.#snapshot.HasDPadDownButton; }
  public get HasDPadLeftButton(): boolean { return this.#snapshot.HasDPadLeftButton; }
  public get HasDPadRightButton(): boolean { return this.#snapshot.HasDPadRightButton; }
  public get HasLeftShoulderButton(): boolean { return this.#snapshot.HasLeftShoulderButton; }
  public get HasRightShoulderButton(): boolean { return this.#snapshot.HasRightShoulderButton; }
  public get HasLeftStickButton(): boolean { return this.#snapshot.HasLeftStickButton; }
  public get HasRightStickButton(): boolean { return this.#snapshot.HasRightStickButton; }
  public get HasLeftXThumbStick(): boolean { return this.#snapshot.HasLeftXThumbStick; }
  public get HasLeftYThumbStick(): boolean { return this.#snapshot.HasLeftYThumbStick; }
  public get HasRightXThumbStick(): boolean { return this.#snapshot.HasRightXThumbStick; }
  public get HasRightYThumbStick(): boolean { return this.#snapshot.HasRightYThumbStick; }
  public get HasLeftTrigger(): boolean { return this.#snapshot.HasLeftTrigger; }
  public get HasRightTrigger(): boolean { return this.#snapshot.HasRightTrigger; }
  public get HasLeftVibrationMotor(): boolean { return this.#snapshot.HasLeftVibrationMotor; }
  public get HasRightVibrationMotor(): boolean { return this.#snapshot.HasRightVibrationMotor; }
  public get HasVoiceSupport(): boolean { return this.#snapshot.HasVoiceSupport; }
}

/** Internal construction boundary used only by concrete CNA backends. */
export function createGamePadCapabilities(snapshot: GamePadCapabilitiesSnapshot): GamePadCapabilities {
  const Constructor = GamePadCapabilities as unknown as {
    new (value: GamePadCapabilitiesSnapshot): GamePadCapabilities;
  };
  return new Constructor(snapshot);
}
