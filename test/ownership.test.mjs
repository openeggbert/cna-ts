import assert from "node:assert/strict";
import test from "node:test";

import {
  NativeConstructionScope,
  NativeResourceLifetime,
} from "../dist/internal/ownership.js";

test("owned disposal tears down callbacks and children before the parent exactly once", () => {
  const events = [];
  const parent = new NativeResourceLifetime({
    Handle: 1n,
    Ownership: "owned",
    Release: (handle) => events.push(`release:${handle}`),
    Label: "game",
  });
  const borrowed = new NativeResourceLifetime({
    Handle: 2n,
    Ownership: "borrowed",
    Parent: parent,
    Label: "graphics device",
  });
  const parentOwned = new NativeResourceLifetime({
    Handle: 3n,
    Ownership: "parent-owned",
    Parent: parent,
    Label: "window",
  });
  const ownedChild = new NativeResourceLifetime({
    Handle: 4n,
    Ownership: "owned",
    Parent: parent,
    Release: (handle) => events.push(`release:${handle}`),
    Label: "sprite batch",
  });
  parent.TrackCallback(() => events.push("unsubscribe"));

  parent.Dispose();
  parent.Dispose();

  assert.deepEqual(events, ["unsubscribe", "release:4", "release:1"]);
  assert.equal(parent.State, "disposed");
  assert.equal(borrowed.State, "disposed");
  assert.equal(parentOwned.State, "disposed");
  assert.equal(ownedChild.State, "disposed");
  assert.throws(() => borrowed.Handle, /disposed/);
});

test("borrowed handles never release and owned handles can be transferred for adoption", () => {
  let releases = 0;
  const borrowed = new NativeResourceLifetime({ Handle: 7n, Ownership: "borrowed" });
  borrowed.Dispose();
  borrowed.Dispose();
  assert.equal(releases, 0);

  const original = new NativeResourceLifetime({
    Handle: 8n,
    Ownership: "owned",
    Release: () => releases += 1,
  });
  const handle = original.Transfer();
  original.Dispose();
  assert.equal(original.State, "transferred");
  assert.equal(releases, 0);

  const adopted = new NativeResourceLifetime({
    Handle: handle,
    Ownership: "adopted",
    Release: () => releases += 1,
  });
  adopted.Dispose();
  assert.equal(releases, 1);
});

test("partial native construction rolls acquired resources back in reverse order", () => {
  const releases = [];
  const construction = new NativeConstructionScope();
  construction.Add(new NativeResourceLifetime({
    Handle: 10n,
    Ownership: "owned",
    Release: (handle) => releases.push(handle),
  }));
  construction.Add(new NativeResourceLifetime({
    Handle: 11n,
    Ownership: "owned",
    Release: (handle) => releases.push(handle),
  }));

  construction.Rollback();
  construction.Rollback();
  assert.deepEqual(releases, [11n, 10n]);
});

test("release failure retains ownership for a safe retry before releasing the parent", () => {
  const events = [];
  let attempts = 0;
  const parent = new NativeResourceLifetime({
    Handle: 20n,
    Ownership: "owned",
    Release: () => events.push("parent"),
  });
  new NativeResourceLifetime({
    Handle: 21n,
    Ownership: "owned",
    Parent: parent,
    Release: () => {
      events.push("flaky-child");
      attempts += 1;
      if (attempts === 1) throw new Error("child release failed");
    },
  });
  new NativeResourceLifetime({
    Handle: 22n,
    Ownership: "owned",
    Parent: parent,
    Release: () => events.push("other-child"),
  });
  parent.TrackCallback(() => {
    events.push("callback");
    throw new Error("unsubscribe failed");
  });

  assert.throws(
    () => parent.Dispose(),
    (error) => error instanceof AggregateError && error.errors.length === 2,
  );
  assert.deepEqual(events, ["callback", "other-child", "flaky-child"]);
  assert.equal(parent.State, "release-failed");

  parent.Dispose();
  assert.deepEqual(events, ["callback", "other-child", "flaky-child", "flaky-child", "parent"]);
  assert.equal(parent.State, "disposed");
});

test("failed partial-construction rollback retains only resources needing retry", () => {
  const releases = [];
  let attempts = 0;
  const construction = new NativeConstructionScope();
  construction.Add(new NativeResourceLifetime({
    Handle: 30n,
    Ownership: "owned",
    Release: () => releases.push("stable"),
  }));
  construction.Add(new NativeResourceLifetime({
    Handle: 31n,
    Ownership: "owned",
    Release: () => {
      releases.push("flaky");
      attempts += 1;
      if (attempts === 1) throw new Error("temporary failure");
    },
  }));

  assert.throws(() => construction.Rollback(), AggregateError);
  construction.Rollback();
  assert.deepEqual(releases, ["flaky", "stable", "flaky"]);
});

test("ownership construction rejects invalid states", () => {
  assert.throws(
    () => new NativeResourceLifetime({ Handle: 0n, Ownership: "borrowed" }),
    RangeError,
  );
  assert.throws(
    () => new NativeResourceLifetime({ Handle: 1n, Ownership: "owned" }),
    /require a release/,
  );
  assert.throws(
    () => new NativeResourceLifetime({ Handle: 1n, Ownership: "parent-owned" }),
    /require a parent/,
  );
});
