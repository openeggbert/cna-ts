/** XNA's private input hash helper XORs four-byte words and avoids returning zero. */
export function smartInputHash(...words: number[]): number {
  let result = 0;
  for (const word of words) result = (result ^ word) | 0;
  return result === 0 ? 0x7fffffff : result;
}

export function int32(value: number): number {
  return Math.trunc(value) | 0;
}

export function boolString(value: boolean): string {
  return value ? "True" : "False";
}

const rawFloatView = new DataView(new ArrayBuffer(4));

/** Four bytes used by XNA's pinned-struct SmartGetHashCode helper. */
export function rawFloatBits(value: number): number {
  rawFloatView.setFloat32(0, Math.fround(value), true);
  return rawFloatView.getInt32(0, true);
}

export interface GamePadCapabilitiesSnapshot {
  readonly IsConnected: boolean;
  readonly GamePadType: number;
  readonly HasAButton: boolean;
  readonly HasBButton: boolean;
  readonly HasXButton: boolean;
  readonly HasYButton: boolean;
  readonly HasBackButton: boolean;
  readonly HasStartButton: boolean;
  readonly HasBigButton: boolean;
  readonly HasDPadUpButton: boolean;
  readonly HasDPadDownButton: boolean;
  readonly HasDPadLeftButton: boolean;
  readonly HasDPadRightButton: boolean;
  readonly HasLeftShoulderButton: boolean;
  readonly HasRightShoulderButton: boolean;
  readonly HasLeftStickButton: boolean;
  readonly HasRightStickButton: boolean;
  readonly HasLeftXThumbStick: boolean;
  readonly HasLeftYThumbStick: boolean;
  readonly HasRightXThumbStick: boolean;
  readonly HasRightYThumbStick: boolean;
  readonly HasLeftTrigger: boolean;
  readonly HasRightTrigger: boolean;
  readonly HasLeftVibrationMotor: boolean;
  readonly HasRightVibrationMotor: boolean;
  readonly HasVoiceSupport: boolean;
}

export interface TouchPanelCapabilitiesSnapshot {
  readonly IsConnected: boolean;
  readonly MaximumTouchCount: number;
}
