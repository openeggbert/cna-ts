export interface IGraphicsDeviceManager {
  BeginDraw(): boolean;
  CreateDevice(): void;
  EndDraw(): void;
}
