import {
  BoundingBox,
  BoundingFrustum,
  BoundingSphere,
  Color,
  Game,
  GameTime,
  MathHelper,
  Matrix,
  Microsoft,
  Plane,
  Point,
  Quaternion,
  Ray,
  Rectangle,
  TimeSpan,
  Vector2,
  Vector3,
  Vector4,
} from "cna-ts";
import { GetRendererInfo } from "cna-ts/extensions";
import { GetRuntimeStatus } from "cna-ts/runtime";
import { Vector2 as StrictVector2 } from "cna-ts/xna";

const vector: Vector2 = Vector2.Add(new Vector2(1), new StrictVector2(2, 3));
vector.X = 4;
const color: Color = Microsoft.Xna.Framework.Color.CornflowerBlue;
color.A = 128;
const time = new GameTime(TimeSpan.FromSeconds(1), TimeSpan.FromMilliseconds(16));
const game: Game = new Microsoft.Xna.Framework.Game();

void vector;
void color;
void time;
void game;
void GetRuntimeStatus;
void GetRendererInfo;
void new BoundingBox(Vector3.Zero, Vector3.One);
void new BoundingSphere(Vector3.Zero, 1);
void new BoundingFrustum(Matrix.Identity);
void new Plane(Vector3.Up, 0);
void new Point(1, 2);
void Quaternion.Identity;
void new Ray(Vector3.Zero, Vector3.Forward);
void new Rectangle(0, 0, 10, 10);
void new Vector4(new Vector3(1), 1);
void MathHelper.Pi;
