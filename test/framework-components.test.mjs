import assert from "node:assert/strict";
import test from "node:test";

import {
  DisplayOrientation,
  EventArgs,
  Game,
  GameComponent,
  GameComponentCollection,
  GameServiceContainer,
  GameTime,
  GameWindow,
  NativeUnavailableError,
  Rectangle,
  TimeSpan,
} from "../dist/index.js";
import {
  getBackend,
  setBackendForInternalUse,
} from "../dist/internal/backend.js";

class TestEvent {
  #handlers = [];
  Add(handler) { this.#handlers.push(handler); }
  Remove(handler) {
    const index = this.#handlers.lastIndexOf(handler);
    if (index < 0) return false;
    this.#handlers.splice(index, 1);
    return true;
  }
  Raise(sender, args = EventArgs.Empty) {
    for (const handler of [...this.#handlers]) handler(sender, args);
  }
}

class HarnessGame extends Game {
  InitializeComponents() { super.Initialize(); }
  UpdateComponents(gameTime) { super.Update(gameTime); }
  DrawComponents(gameTime) { super.Draw(gameTime); }
}

class OrderedComponent extends GameComponent {
  #drawOrder = 0;
  #visible = true;
  DrawOrderChanged = new TestEvent();
  VisibleChanged = new TestEvent();

  constructor(game, name, log) {
    super(game);
    this.name = name;
    this.log = log;
  }

  get DrawOrder() { return this.#drawOrder; }
  set DrawOrder(value) {
    if (this.#drawOrder === value) return;
    this.#drawOrder = value;
    this.DrawOrderChanged.Raise(this);
  }
  get Visible() { return this.#visible; }
  set Visible(value) {
    if (this.#visible === value) return;
    this.#visible = value;
    this.VisibleChanged.Raise(this);
  }

  Initialize() { this.log.push(`init:${this.name}`); }
  Update() { this.log.push(`update:${this.name}`); }
  Draw() { this.log.push(`draw:${this.name}`); }
}

class HarnessWindow extends GameWindow {
  #resizable = false;
  transitions = [];
  titles = [];

  get Handle() { return 17n; }
  get AllowUserResizing() { return this.#resizable; }
  set AllowUserResizing(value) { this.#resizable = value; }
  get ClientBounds() { return new Rectangle(4, 5, 640, 360); }
  get CurrentOrientation() { return DisplayOrientation.LandscapeLeft; }
  get ScreenDeviceName() { return "screen-1"; }

  BeginScreenDeviceChange(willBeFullScreen) {
    this.transitions.push(["begin", willBeFullScreen]);
  }
  EndScreenDeviceChange(screenDeviceName, clientWidth, clientHeight) {
    if (clientWidth === undefined && clientHeight === undefined) {
      return super.EndScreenDeviceChange(screenDeviceName);
    }
    this.transitions.push(["end", screenDeviceName, clientWidth, clientHeight]);
  }
  SetSupportedOrientations() {}
  SetTitle(value) { this.titles.push(value); }
  RaiseClientSizeChanged() { super.OnClientSizeChanged(); }
  RaiseOrientationChanged() { super.OnOrientationChanged(); }
  RaiseScreenChanged() { super.OnScreenDeviceNameChanged(); }
}

test("component collection preserves mutation events, uniqueness, and inherited operations", () => {
  const collection = new GameComponentCollection();
  const first = { Initialize() {} };
  const second = { Initialize() {} };
  const events = [];
  collection.ComponentAdded.Add((_sender, args) => events.push(`add:${args.GameComponent === first ? "first" : "second"}`));
  collection.ComponentRemoved.Add((_sender, args) => events.push(`remove:${args.GameComponent === first ? "first" : "second"}`));

  collection.Add(first);
  collection.Insert(0, second);
  assert.equal(collection.Count, 2);
  assert.equal(collection.Get(0), second);
  assert.equal(collection.IndexOf(first), 1);
  assert.equal(collection.Contains(second), true);
  assert.throws(() => collection.Add(first), { name: "ArgumentException" });
  assert.throws(() => collection.Set(0, first), { name: "NotSupportedException" });

  const copy = new Array(2);
  collection.CopyTo(copy, 0);
  assert.deepEqual(copy, [second, first]);
  assert.deepEqual([...collection.GetEnumerator()], [second, first]);
  collection.RemoveAt(0);
  collection.Clear();
  assert.deepEqual(events, ["add:first", "add:second", "remove:second", "remove:first"]);
});

test("Game initializes in collection order and updates/draws in stable XNA order", () => {
  const game = new HarnessGame();
  const log = [];
  const first = new OrderedComponent(game, "first", log);
  const second = new OrderedComponent(game, "second", log);
  const equal = new OrderedComponent(game, "equal", log);
  first.UpdateOrder = 10;
  second.UpdateOrder = -2;
  equal.UpdateOrder = 10;
  first.DrawOrder = 5;
  second.DrawOrder = 20;
  equal.DrawOrder = 5;
  game.Components.Add(first);
  game.Components.Add(second);
  game.Components.Add(equal);

  game.InitializeComponents();
  game.UpdateComponents(new GameTime());
  game.DrawComponents(new GameTime());
  assert.deepEqual(log, [
    "init:first", "init:second", "init:equal",
    "update:second", "update:first", "update:equal",
    "draw:first", "draw:equal", "draw:second",
  ]);

  log.length = 0;
  equal.UpdateOrder = -3;
  second.DrawOrder = 4;
  first.Enabled = false;
  equal.Visible = false;
  game.UpdateComponents(new GameTime());
  game.DrawComponents(new GameTime());
  assert.deepEqual(log, ["update:equal", "update:second", "draw:second", "draw:first"]);
});

test("component iteration uses snapshots and disposal removes components", () => {
  const game = new HarnessGame();
  const log = [];
  const first = new OrderedComponent(game, "first", log);
  const second = new OrderedComponent(game, "second", log);
  first.UpdateOrder = 1;
  second.UpdateOrder = 0;
  second.Update = () => {
    log.push("update:second");
    game.Components.Remove(first);
  };
  let disposed = 0;
  first.Disposed.Add(() => disposed += 1);
  game.Components.Add(first);
  game.Components.Add(second);
  game.InitializeComponents();
  game.UpdateComponents(new GameTime());
  assert.deepEqual(log.slice(-2), ["update:second", "update:first"]);

  first.Dispose();
  assert.equal(disposed, 1);
  assert.equal(game.Components.Contains(first), false);
});

test("managed events retain duplicates, remove the last match, and dispatch a stable snapshot", () => {
  const component = new GameComponent(new Game());
  const events = [];
  const duplicate = () => events.push("duplicate");
  const removing = () => {
    events.push("removing");
    component.EnabledChanged.Remove(duplicate);
  };
  component.EnabledChanged.Add(duplicate);
  component.EnabledChanged.Add(removing);
  component.EnabledChanged.Add(duplicate);
  assert.equal(component.EnabledChanged.Remove(duplicate), true);
  component.Enabled = false;
  component.Enabled = true;
  assert.deepEqual(events, ["duplicate", "removing", "removing"]);
});

test("GameWindow preserves title, transition forwarding, and public event behavior", () => {
  const window = new HarnessWindow();
  const events = [];
  window.ClientSizeChanged.Add((sender) => events.push(sender === window ? "size" : "bad"));
  window.OrientationChanged.Add(() => events.push("orientation"));
  window.ScreenDeviceNameChanged.Add(() => events.push("screen"));

  window.Title = "CNA";
  window.Title = "CNA";
  window.AllowUserResizing = true;
  window.BeginScreenDeviceChange(true);
  window.EndScreenDeviceChange("screen-2");
  window.RaiseClientSizeChanged();
  window.RaiseOrientationChanged();
  window.RaiseScreenChanged();

  assert.equal(window.Title, "CNA");
  assert.equal(window.AllowUserResizing, true);
  assert.deepEqual(window.titles, ["CNA"]);
  assert.deepEqual(window.transitions, [
    ["begin", true],
    ["end", "screen-2", 640, 360],
  ]);
  assert.deepEqual(events, ["size", "orientation", "screen"]);
  assert.throws(() => { window.Title = null; }, { name: "ArgumentNullException" });
  assert.throws(() => new Game().Window, NativeUnavailableError);
});

test("service container enforces type identity, assignability, and uniqueness", () => {
  class Service {}
  class Provider extends Service {}
  class Other {}
  const services = new GameServiceContainer();
  const provider = new Provider();
  services.AddService(Service, provider);
  assert.equal(services.GetService(Service), provider);
  assert.throws(() => services.AddService(Service, new Provider()), { name: "ArgumentException" });
  assert.throws(() => services.AddService(Other, provider), { name: "ArgumentException" });
  services.RemoveService(Service);
  assert.equal(services.GetService(Service), null);
});

test("internal backend lifecycle routes are owned and released without exposing handles", async (t) => {
  const previous = getBackend();
  t.after(() => setBackendForInternalUse(previous));
  const calls = [];
  const backend = {
    Kind: "node-native",
    IsAvailable: true,
    AbiVersion: "0.7.0-test",
    Detail: "internal managed test backend",
    async initialize() { calls.push("initialize"); },
    getLastError() { return null; },
    createGame() { calls.push("create:41"); return 41n; },
    async runGame(handle) { calls.push(`run:${handle}`); },
    runGameOneFrame(handle) { calls.push(`frame:${handle}`); },
    exitGame(handle) { calls.push(`exit:${handle}`); },
    destroyGame(handle) { calls.push(`destroy:${handle}`); },
  };
  setBackendForInternalUse(backend);

  class LifecycleGame extends Game {
    BeginRun() { calls.push("begin"); }
    Update(gameTime) { calls.push(`update:${gameTime.ElapsedGameTime.Ticks}`); }
    EndRun() { calls.push("end"); }
  }
  const game = new LifecycleGame();
  let exitingSender = "unset";
  game.Exiting.Add((sender) => { exitingSender = sender; });
  game.Exit();
  await game.Run();
  game.RunOneFrame();
  game.Dispose();

  assert.equal(exitingSender, null);
  assert.deepEqual(calls, [
    "initialize", "create:41", "begin", "update:0", "exit:41", "run:41", "end",
    "frame:41", "destroy:41",
  ]);
  assert.throws(() => game.RunOneFrame(), /already disposed/);
  assert.equal(TimeSpan.FromTicks(game.TargetElapsedTime.Ticks).Ticks, 166_667n);
});
