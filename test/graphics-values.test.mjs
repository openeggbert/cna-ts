import assert from "node:assert/strict";
import test from "node:test";

import {
  DisplayOrientation,
  Graphics,
  Rectangle,
} from "../dist/index.js";
import { createDisplayModeForInternalUse } from
  "../dist/Microsoft/Xna/Framework/Graphics/DisplayMode.js";
import { createDisplayModeCollectionForInternalUse } from
  "../dist/Microsoft/Xna/Framework/Graphics/DisplayModeCollection.js";

test("graphics device enums retain the XNA 4.0 numeric contract", () => {
  assert.deepEqual(
    [Graphics.ClearOptions.Target, Graphics.ClearOptions.DepthBuffer, Graphics.ClearOptions.Stencil],
    [1, 2, 4],
  );
  assert.deepEqual(
    [Graphics.DepthFormat.None, Graphics.DepthFormat.Depth16, Graphics.DepthFormat.Depth24Stencil8],
    [0, 1, 3],
  );
  assert.deepEqual([Graphics.GraphicsProfile.Reach, Graphics.GraphicsProfile.HiDef], [0, 1]);
  assert.deepEqual(
    [Graphics.PresentInterval.Default, Graphics.PresentInterval.One, Graphics.PresentInterval.Two,
      Graphics.PresentInterval.Immediate],
    [0, 1, 2, 3],
  );
  assert.equal(Graphics.SurfaceFormat.HdrBlendable, 19);
});

test("PresentationParameters defaults, bounds, mutation, and cloning are managed values", () => {
  const parameters = new Graphics.PresentationParameters();
  assert.equal(parameters.IsFullScreen, true);
  assert.equal(parameters.BackBufferFormat, Graphics.SurfaceFormat.Color);
  assert.equal(parameters.DepthStencilFormat, Graphics.DepthFormat.None);
  assert.equal(parameters.PresentationInterval, Graphics.PresentInterval.Default);
  assert.equal(parameters.RenderTargetUsage, Graphics.RenderTargetUsage.DiscardContents);
  assert.equal(parameters.DeviceWindowHandle, 0n);
  assert.ok(parameters.Bounds.Equals(Rectangle.Empty));

  parameters.BackBufferWidth = 1280;
  parameters.BackBufferHeight = 720;
  parameters.BackBufferFormat = Graphics.SurfaceFormat.HdrBlendable;
  parameters.DepthStencilFormat = Graphics.DepthFormat.Depth24Stencil8;
  parameters.MultiSampleCount = 4;
  parameters.DisplayOrientation = DisplayOrientation.LandscapeRight;
  parameters.PresentationInterval = Graphics.PresentInterval.Immediate;
  parameters.RenderTargetUsage = Graphics.RenderTargetUsage.PreserveContents;
  parameters.DeviceWindowHandle = 91n;
  parameters.IsFullScreen = false;

  const clone = parameters.Clone();
  assert.ok(clone.Bounds.Equals(new Rectangle(0, 0, 1280, 720)));
  assert.deepEqual(
    [clone.BackBufferFormat, clone.DepthStencilFormat, clone.MultiSampleCount,
      clone.DisplayOrientation, clone.PresentationInterval, clone.RenderTargetUsage,
      clone.DeviceWindowHandle, clone.IsFullScreen],
    [Graphics.SurfaceFormat.HdrBlendable, Graphics.DepthFormat.Depth24Stencil8, 4,
      DisplayOrientation.LandscapeRight, Graphics.PresentInterval.Immediate,
      Graphics.RenderTargetUsage.PreserveContents, 91n, false],
  );
  clone.BackBufferWidth = 640;
  assert.equal(parameters.BackBufferWidth, 1280);
});

test("DisplayMode snapshots compute XNA values and collections filter without a fake adapter", () => {
  const color = createDisplayModeForInternalUse(1920, 960, Graphics.SurfaceFormat.Color);
  const hdr = createDisplayModeForInternalUse(1280, 720, Graphics.SurfaceFormat.HdrBlendable);
  const collection = createDisplayModeCollectionForInternalUse([color, hdr]);

  assert.deepEqual(
    [color.Width, color.Height, color.Format, color.AspectRatio],
    [1920, 960, Graphics.SurfaceFormat.Color, 2],
  );
  assert.ok(color.TitleSafeArea.Equals(new Rectangle(0, 0, 1920, 960)));
  assert.equal(color.ToString(), "{Width:1920 Height:960 Format:Color AspectRatio:2}");
  assert.deepEqual([...collection], [color, hdr]);
  assert.deepEqual([...collection.Get(Graphics.SurfaceFormat.Color)], [color]);
  assert.deepEqual([...collection.GetEnumerator()], [color, hdr]);
  assert.throws(() => new Graphics.DisplayMode(), { name: "InvalidOperationException" });
});
