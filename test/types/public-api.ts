import {
  Color,
  Game,
  GameTime,
  Microsoft,
  TimeSpan,
  Vector2,
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
