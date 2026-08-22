import { getBackend } from "../../../../internal/backend.js";
import { PlayerIndex } from "../PlayerIndex.js";
import { GamePadDeadZone } from "./Enums.js";
import type { GamePadCapabilities, GamePadState } from "./GamePadValues.js";
import type { KeyboardState } from "./KeyboardState.js";
import type { MouseState } from "./MouseState.js";

/** Hardware keyboard polling routed through the active private CNA backend. */
export class Keyboard {
  private constructor() {}

  public static GetState(): KeyboardState;
  public static GetState(playerIndex: PlayerIndex): KeyboardState;
  public static GetState(playerIndex?: PlayerIndex): KeyboardState {
    return getBackend().getKeyboardState(playerIndex ?? null);
  }
}

/** Hardware mouse access routed through the active private CNA backend. */
export class Mouse {
  private constructor() {}

  public static GetState(): MouseState { return getBackend().getMouseState(); }
  public static SetPosition(x: number, y: number): void { getBackend().setMousePosition(x, y); }

  public static get WindowHandle(): bigint { return getBackend().mouseWindowHandle; }
  public static set WindowHandle(value: bigint) { getBackend().setMouseWindowHandle(value); }
}

/** Hardware controller access routed through the active private CNA backend. */
export class GamePad {
  private constructor() {}

  public static GetCapabilities(playerIndex: PlayerIndex): GamePadCapabilities {
    return getBackend().getGamePadCapabilities(playerIndex);
  }

  public static GetState(playerIndex: PlayerIndex): GamePadState;
  public static GetState(playerIndex: PlayerIndex, deadZoneMode: GamePadDeadZone): GamePadState;
  public static GetState(
    playerIndex: PlayerIndex,
    deadZoneMode = GamePadDeadZone.IndependentAxes,
  ): GamePadState {
    return getBackend().getGamePadState(playerIndex, deadZoneMode);
  }

  public static SetVibration(
    playerIndex: PlayerIndex,
    leftMotor: number,
    rightMotor: number,
  ): boolean {
    return getBackend().setGamePadVibration(playerIndex, leftMotor, rightMotor);
  }
}
