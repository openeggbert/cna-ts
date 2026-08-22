/** Buffer masks accepted by GraphicsDevice.Clear. */
export enum ClearOptions {
  Target = 1,
  DepthBuffer = 2,
  Stencil = 4,
}

export enum DepthFormat {
  None = 0,
  Depth16 = 1,
  Depth24 = 2,
  Depth24Stencil8 = 3,
}

export enum GraphicsDeviceStatus {
  Normal = 0,
  Lost = 1,
  NotReset = 2,
}

export enum GraphicsProfile {
  Reach = 0,
  HiDef = 1,
}

export enum PresentInterval {
  Default = 0,
  One = 1,
  Two = 2,
  Immediate = 3,
}

export enum RenderTargetUsage {
  DiscardContents = 0,
  PreserveContents = 1,
  PlatformContents = 2,
}

export enum SurfaceFormat {
  Color = 0,
  Bgr565 = 1,
  Bgra5551 = 2,
  Bgra4444 = 3,
  Dxt1 = 4,
  Dxt3 = 5,
  Dxt5 = 6,
  NormalizedByte2 = 7,
  NormalizedByte4 = 8,
  Rgba1010102 = 9,
  Rg32 = 10,
  Rgba64 = 11,
  Alpha8 = 12,
  Single = 13,
  Vector2 = 14,
  Vector4 = 15,
  HalfSingle = 16,
  HalfVector2 = 17,
  HalfVector4 = 18,
  HdrBlendable = 19,
}
