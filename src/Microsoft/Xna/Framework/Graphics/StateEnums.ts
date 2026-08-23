export enum Blend {
  One = 0,
  Zero = 1,
  SourceColor = 2,
  InverseSourceColor = 3,
  SourceAlpha = 4,
  InverseSourceAlpha = 5,
  DestinationColor = 6,
  InverseDestinationColor = 7,
  DestinationAlpha = 8,
  InverseDestinationAlpha = 9,
  BlendFactor = 10,
  InverseBlendFactor = 11,
  SourceAlphaSaturation = 12,
}

export enum BlendFunction {
  Add = 0,
  Subtract = 1,
  ReverseSubtract = 2,
  Min = 3,
  Max = 4,
}

export enum ColorWriteChannels {
  None = 0,
  Red = 1,
  Green = 2,
  Blue = 4,
  Alpha = 8,
  All = 15,
}

export enum CompareFunction {
  Always = 0,
  Never = 1,
  Less = 2,
  LessEqual = 3,
  Equal = 4,
  GreaterEqual = 5,
  Greater = 6,
  NotEqual = 7,
}

export enum StencilOperation {
  Keep = 0,
  Zero = 1,
  Replace = 2,
  Increment = 3,
  Decrement = 4,
  IncrementSaturation = 5,
  DecrementSaturation = 6,
  Invert = 7,
}

export enum CullMode {
  None = 0,
  CullClockwiseFace = 1,
  CullCounterClockwiseFace = 2,
}

export enum FillMode {
  Solid = 0,
  WireFrame = 1,
}

export enum TextureAddressMode {
  Wrap = 0,
  Clamp = 1,
  Mirror = 2,
}

export enum TextureFilter {
  Linear = 0,
  Point = 1,
  Anisotropic = 2,
  LinearMipPoint = 3,
  PointMipLinear = 4,
  MinLinearMagPointMipLinear = 5,
  MinLinearMagPointMipPoint = 6,
  MinPointMagLinearMipLinear = 7,
  MinPointMagLinearMipPoint = 8,
}
