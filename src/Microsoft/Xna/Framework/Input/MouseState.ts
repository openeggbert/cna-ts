import { int32 } from "../../../../internal/input.js";
import { ButtonState } from "./Enums.js";

/** Immutable XNA mouse snapshot. */
export class MouseState {
  readonly #x: number;
  readonly #y: number;
  readonly #scrollWheelValue: number;
  readonly #leftButton: ButtonState;
  readonly #middleButton: ButtonState;
  readonly #rightButton: ButtonState;
  readonly #xButton1: ButtonState;
  readonly #xButton2: ButtonState;

  public constructor(
    x: number,
    y: number,
    scrollWheel: number,
    leftButton: ButtonState,
    middleButton: ButtonState,
    rightButton: ButtonState,
    xButton1: ButtonState,
    xButton2: ButtonState,
  ) {
    this.#x = int32(x);
    this.#y = int32(y);
    this.#scrollWheelValue = int32(scrollWheel);
    this.#leftButton = leftButton;
    this.#middleButton = middleButton;
    this.#rightButton = rightButton;
    this.#xButton1 = xButton1;
    this.#xButton2 = xButton2;
  }

  public get X(): number { return this.#x; }
  public get Y(): number { return this.#y; }
  public get ScrollWheelValue(): number { return this.#scrollWheelValue; }
  public get LeftButton(): ButtonState { return this.#leftButton; }
  public get MiddleButton(): ButtonState { return this.#middleButton; }
  public get RightButton(): ButtonState { return this.#rightButton; }
  public get XButton1(): ButtonState { return this.#xButton1; }
  public get XButton2(): ButtonState { return this.#xButton2; }

  public Equals(obj: unknown): boolean {
    return obj instanceof MouseState &&
      this.X === obj.X && this.Y === obj.Y && this.ScrollWheelValue === obj.ScrollWheelValue &&
      this.LeftButton === obj.LeftButton && this.MiddleButton === obj.MiddleButton &&
      this.RightButton === obj.RightButton && this.XButton1 === obj.XButton1 &&
      this.XButton2 === obj.XButton2;
  }

  public GetHashCode(): number {
    return this.X ^ this.Y ^ this.LeftButton ^ this.RightButton ^ this.MiddleButton ^
      this.XButton1 ^ this.XButton2 ^ this.ScrollWheelValue;
  }

  public ToString(): string {
    const buttons: string[] = [];
    if (this.LeftButton === ButtonState.Pressed) buttons.push("Left");
    if (this.RightButton === ButtonState.Pressed) buttons.push("Right");
    if (this.MiddleButton === ButtonState.Pressed) buttons.push("Middle");
    if (this.XButton1 === ButtonState.Pressed) buttons.push("XButton1");
    if (this.XButton2 === ButtonState.Pressed) buttons.push("XButton2");
    return `{X:${this.X} Y:${this.Y} Buttons:${buttons.length === 0 ? "None" : buttons.join(" ")} Wheel:${this.ScrollWheelValue}}`;
  }
}
