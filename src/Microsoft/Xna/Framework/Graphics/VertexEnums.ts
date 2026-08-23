export enum BufferUsage { None = 0, WriteOnly = 1 }
export enum IndexElementSize { SixteenBits = 0, ThirtyTwoBits = 1 }
export enum SetDataOptions { None = 0, Discard = 1, NoOverwrite = 2 }
export enum PrimitiveType { TriangleList = 0, TriangleStrip = 1, LineList = 2, LineStrip = 3 }

export enum VertexElementFormat {
  Single = 0,
  Vector2 = 1,
  Vector3 = 2,
  Vector4 = 3,
  Color = 4,
  Byte4 = 5,
  Short2 = 6,
  Short4 = 7,
  NormalizedShort2 = 8,
  NormalizedShort4 = 9,
  HalfVector2 = 10,
  HalfVector4 = 11,
}

export enum VertexElementUsage {
  Position = 0,
  Color = 1,
  TextureCoordinate = 2,
  Normal = 3,
  Binormal = 4,
  Tangent = 5,
  BlendIndices = 6,
  BlendWeight = 7,
  Depth = 8,
  Fog = 9,
  PointSize = 10,
  Sample = 11,
  TessellateFactor = 12,
}
