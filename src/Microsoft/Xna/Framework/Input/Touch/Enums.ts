export enum GestureType {
  None = 0,
  Tap = 1,
  DoubleTap = 2,
  Hold = 4,
  HorizontalDrag = 8,
  VerticalDrag = 16,
  FreeDrag = 32,
  Pinch = 64,
  Flick = 128,
  DragComplete = 256,
  PinchComplete = 512,
}

export enum TouchLocationState {
  Invalid = 0,
  Released = 1,
  Pressed = 2,
  Moved = 3,
}
