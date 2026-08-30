import assert from "node:assert/strict";
import test from "node:test";

import { Color, Matrix, Microsoft, Quaternion, Vector2, Vector3, Vector4 } from "../dist/index.js";

const { GamerServices, Net } = Microsoft.Xna.Framework;

test("the gamer-services and networking namespaces are reachable from the framework object", () => {
  for (const name of ["Gamer", "SignedInGamer", "Guide", "GamerServicesDispatcher", "AvatarRenderer"]) {
    assert.equal(typeof GamerServices[name], "function", name);
  }
  for (const name of ["NetworkSession", "NetworkGamer", "LocalNetworkGamer", "PacketReader", "PacketWriter"]) {
    assert.equal(typeof Net[name], "function", name);
  }
});

test("the identity enumerations carry the exact XNA numbers", () => {
  // These are the values a game persists, so they are the ones worth pinning without a reference
  // corpus. tools/api-compat proves the whole set against the assemblies.
  assert.equal(GamerServices.GamerZone.Unknown, 0);
  assert.equal(GamerServices.LeaderboardKey.BestScoreLifeTime, 0);
  assert.equal(GamerServices.MessageBoxIcon.Error, 1);
  assert.equal(GamerServices.NotificationPosition.BottomCenter, 7);
  assert.equal(GamerServices.AvatarBodyType.Female, 0);
  assert.equal(Net.NetworkSessionType.PlayerMatch, 2);
  assert.equal(Net.SendDataOptions.ReliableInOrder, 3);
  assert.equal(Net.NetworkSessionEndReason.Disconnected, 3);
});

test("the exception hierarchy is catchable by kind, not collapsed into Error", () => {
  const notAvailable = new GamerServices.GamerServicesNotAvailableException();
  assert.ok(notAvailable instanceof Error);
  assert.equal(notAvailable.name, "GamerServicesNotAvailableException");
  assert.match(notAvailable.message, /not available/);

  const networkDown = new GamerServices.NetworkNotAvailableException("no route");
  assert.ok(networkDown instanceof GamerServices.NetworkException);
  assert.equal(networkDown.message, "no route");

  const joinFailed = new Net.NetworkSessionJoinException("full", Net.NetworkSessionJoinError.SessionFull);
  assert.ok(joinFailed instanceof GamerServices.NetworkException);
  assert.equal(joinFailed.JoinError, Net.NetworkSessionJoinError.SessionFull);

  const caused = new GamerServices.GamerPrivilegeException("denied", notAvailable);
  assert.equal(caused.cause, notAvailable);
  // A privilege failure is not a network failure, which is the whole point of separate classes.
  assert.equal(caused instanceof GamerServices.NetworkException, false);
});

test("every platform operation refuses with the exception XNA raises, not a binding error", () => {
  const refusals = [
    () => GamerServices.Gamer.GetFromGamertag("nobody"),
    () => GamerServices.Gamer.GetPartnerToken("https://example.invalid"),
    () => GamerServices.Guide.ShowSignIn(1, false),
    () => GamerServices.Guide.DelayNotifications(Microsoft.Xna.Framework.TimeSpan.Zero),
    () => GamerServices.GamerServicesDispatcher.Update(),
    () => Net.NetworkSession.Create(Net.NetworkSessionType.Local, 1, 2),
    () => Net.NetworkSession.Find(Net.NetworkSessionType.SystemLink, 1, null),
  ];
  for (const call of refusals) {
    assert.throws(call, GamerServices.GamerServicesNotAvailableException, call.toString());
  }
});

test("no gamer is signed in, and that is an empty collection rather than a failure", () => {
  const gamers = GamerServices.Gamer.SignedInGamers;
  assert.ok(gamers instanceof GamerServices.SignedInGamerCollection);
  assert.equal(gamers.Count, 0);
  assert.deepEqual([...gamers], []);
  const enumerator = gamers.GetEnumerator();
  assert.equal(enumerator.MoveNext(), false);
  enumerator.Dispose();
  assert.throws(() => gamers.Get(0), RangeError);
});

test("Guide title state answers without a platform, because it does in XNA too", () => {
  assert.equal(GamerServices.Guide.IsVisible, false);
  assert.equal(GamerServices.Guide.IsTrialMode, false);
  GamerServices.Guide.SimulateTrialMode = true;
  assert.equal(GamerServices.Guide.IsTrialMode, true, "simulating a trial must change what a game branches on");
  GamerServices.Guide.SimulateTrialMode = false;
  assert.equal(GamerServices.Guide.IsTrialMode, false);

  GamerServices.Guide.NotificationPosition = GamerServices.NotificationPosition.TopLeft;
  assert.equal(GamerServices.Guide.NotificationPosition, GamerServices.NotificationPosition.TopLeft);
  GamerServices.Guide.NotificationPosition = GamerServices.NotificationPosition.BottomCenter;
  GamerServices.Guide.IsScreenSaverEnabled = false;
  assert.equal(GamerServices.Guide.IsScreenSaverEnabled, false);
  GamerServices.Guide.IsScreenSaverEnabled = true;
});

test("AvatarExpression is a mutable value, matching the XNA struct", () => {
  const expression = new GamerServices.AvatarExpression();
  assert.equal(expression.Mouth, GamerServices.AvatarMouth.Neutral);
  expression.Mouth = GamerServices.AvatarMouth.Laughing;
  expression.LeftEye = GamerServices.AvatarEye.Blink;
  assert.equal(expression.Mouth, GamerServices.AvatarMouth.Laughing);
  assert.equal(expression.LeftEye, GamerServices.AvatarEye.Blink);
  assert.equal(expression.RightEye, GamerServices.AvatarEye.Neutral, "the other eye must not move with it");
});

test("LeaderboardIdentity is created by key and carries a game mode", () => {
  const identity = GamerServices.LeaderboardIdentity.Create(GamerServices.LeaderboardKey.BestTimeRecent);
  assert.equal(identity.Key, "BestTimeRecent");
  assert.equal(identity.GameMode, 0);
  const scoped = GamerServices.LeaderboardIdentity.Create(GamerServices.LeaderboardKey.BestScoreLifeTime, 7);
  assert.equal(scoped.GameMode, 7);
  scoped.GameMode = 9;
  assert.equal(scoped.GameMode, 9);
  assert.equal(identity.GameMode, 0, "two identities must not share state");
});

test("the session property bag keeps null distinct from zero", () => {
  const properties = new Net.NetworkSessionProperties();
  assert.equal(properties.Count, 8);
  assert.equal(properties.Get(0), null);
  properties.Set(0, 0);
  assert.equal(properties.Get(0), 0, "zero is a value a search matches on");
  properties.Set(0, null);
  assert.equal(properties.Get(0), null, "null means do not match, which is not zero");
  assert.throws(() => properties.Get(8), RangeError);
  assert.throws(() => properties.Set(-1, 1), RangeError);
});

test("a packet round-trips every framework value it can carry", () => {
  const writer = new Net.PacketWriter();
  writer.Write(1.5);
  writer.Write(new Color(10, 20, 30, 40));
  writer.Write(new Vector2(1, 2));
  writer.Write(new Vector3(3, 4, 5));
  writer.Write(new Vector4(6, 7, 8, 9));
  writer.Write(new Quaternion(0.1, 0.2, 0.3, 0.4));
  writer.Write(Matrix.CreateTranslation(new Vector3(11, 12, 13)));
  assert.equal(writer.Length, 4 + 4 + 8 + 12 + 16 + 16 + 64);

  const reader = new Net.PacketReader();
  reader.resetForInternalUse(writer.BaseStream);
  assert.equal(reader.Length, writer.Length);
  assert.equal(reader.ReadSingle(), 1.5);
  const color = reader.ReadColor();
  assert.deepEqual([color.R, color.G, color.B, color.A], [10, 20, 30, 40]);
  assert.deepEqual([reader.ReadVector2().X, reader.ReadVector2().X], [1, 3]);
  reader.Position = 16;
  const vector3 = reader.ReadVector3();
  assert.deepEqual([vector3.X, vector3.Y, vector3.Z], [3, 4, 5]);
  const vector4 = reader.ReadVector4();
  assert.deepEqual([vector4.X, vector4.Y, vector4.Z, vector4.W], [6, 7, 8, 9]);
  const quaternion = reader.ReadQuaternion();
  assert.ok(Math.abs(quaternion.X - 0.1) < 1e-6);
  const matrix = reader.ReadMatrix();
  assert.deepEqual([matrix.M41, matrix.M42, matrix.M43, matrix.M44], [11, 12, 13, 1]);
  assert.throws(() => reader.ReadSingle(), RangeError);
});

test("a packet writer's position rewinds without losing what was written", () => {
  const writer = new Net.PacketWriter(8);
  writer.Write(1);
  writer.Write(2);
  assert.equal(writer.Length, 8);
  writer.Position = 0;
  writer.Write(3);
  assert.equal(writer.Length, 8, "rewriting inside the packet must not shorten it");
  const reader = new Net.PacketReader();
  reader.resetForInternalUse(writer.BaseStream);
  assert.deepEqual([reader.ReadSingle(), reader.ReadSingle()], [3, 2]);
  assert.throws(() => { writer.Position = 9; }, RangeError);
});

test("the network session's value state answers before any platform does", () => {
  assert.equal(Net.NetworkSession.MaxSupportedGamers, 31);
  assert.equal(Net.NetworkSession.MaxPreviousGamers, 100);
  assert.equal(typeof Net.NetworkSession.InviteAccepted.Add, "function");
  assert.equal(typeof Net.NetworkSession.InviteAccepted.Remove, "function");
});

test("the Net event arguments carry exactly what XNA's carry", () => {
  const ended = new Net.NetworkSessionEndedEventArgs(Net.NetworkSessionEndReason.RemovedByHost);
  assert.equal(ended.EndReason, Net.NetworkSessionEndReason.RemovedByHost);
  assert.ok(ended instanceof Microsoft.Xna.Framework.EventArgs);
  const started = new Net.GameStartedEventArgs();
  assert.ok(started instanceof Microsoft.Xna.Framework.EventArgs);
});
