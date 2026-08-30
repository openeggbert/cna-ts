/**
 * The WebAssembly backend's `CnaGraphicsBackend` facade.
 *
 * `Microsoft.Xna.Framework.Graphics` reaches the private boundary through two objects: the ones on
 * `CnaBackend` itself -- `Clear`, `Texture2D`, `SpriteBatch` -- and the ones on this interface,
 * which is everything a `GraphicsDevice` owns rather than everything a game does. Implementing it
 * as its own class rather than folding it into {@link WasmBackend} keeps each refusal accurate: an
 * unreached member here names itself through the generated `CnaGraphicsBackendBase` instead of
 * borrowing a message about a boundary it is not part of.
 *
 * What this slice reaches is render targets: creation, description, binding and destruction, which
 * is what makes off-screen rendering -- and therefore readable, asserted pixels -- possible in a
 * browser.
 */

import { CnaGraphicsBackendBase } from "../backend-base.js";
import type { RenderTargetBindingSnapshot, RenderTargetInfo } from "../backend.js";
import type { NativeHandle } from "../ownership.js";
import { WASM_STRUCT_LAYOUTS } from "./layout.js";
import { allocateStruct, WasmStruct, type WasmRouteTable } from "./module.js";

export class WasmGraphicsBackend extends CnaGraphicsBackendBase {
  readonly #routes: WasmRouteTable;

  public constructor(routes: WasmRouteTable) {
    super();
    this.#routes = routes;
  }

  protected override unsupported(member: string): never {
    throw new Error(
      `${member} is not part of the CNA-TS WebAssembly backend's graphics slice; ` +
      "the Node-API backend implements it",
    );
  }

  public override createRenderTarget2D(
    device: NativeHandle, width: number, height: number, mipMap: boolean, format: number,
    depthFormat: number, multiSampleCount: number, usage: number,
  ): NativeHandle {
    const scope = this.#routes.scope();
    try {
      const info = allocateStruct(this.#routes.module, scope, "CNA_RenderTarget2DCreateInfo");
      info.setU32("width", width).setU32("height", height)
        .setU8("mip_map", mipMap ? 1 : 0)
        .setU32("format", format).setU32("depth_format", depthFormat)
        .setI32("multi_sample_count", multiSampleCount).setU32("usage", usage);
      return this.#routes.outHandle("cna_render_target2d_create", device, info.pointer);
    } finally {
      scope.dispose();
    }
  }

  public override createRenderTargetCube(
    device: NativeHandle, size: number, mipMap: boolean, format: number,
    depthFormat: number, multiSampleCount: number, usage: number,
  ): NativeHandle {
    const scope = this.#routes.scope();
    try {
      const info = allocateStruct(this.#routes.module, scope, "CNA_RenderTargetCubeCreateInfo");
      info.setU32("size", size).setU8("mip_map", mipMap ? 1 : 0)
        .setU32("format", format).setU32("depth_format", depthFormat)
        .setI32("multi_sample_count", multiSampleCount).setU32("usage", usage);
      return this.#routes.outHandle("cna_render_target_cube_create", device, info.pointer);
    } finally {
      scope.dispose();
    }
  }

  public override getRenderTargetInfo(target: NativeHandle): RenderTargetInfo {
    const scope = this.#routes.scope();
    try {
      const info = allocateStruct(this.#routes.module, scope, "CNA_RenderTargetInfo");
      this.#routes.invoke("cna_render_target_get_info", target, info.pointer);
      return {
        Kind: info.getU32("kind"),
        Width: info.getU32("width"),
        Height: info.getU32("height"),
        LevelCount: info.getU32("level_count"),
        Format: info.getU32("format"),
        DepthFormat: info.getU32("depth_format"),
        MultiSampleCount: info.getI32("multi_sample_count"),
        Usage: info.getU32("usage"),
        IsContentLost: info.getU8("is_content_lost") !== 0,
        RendererAvailable: info.getU8("renderer_available") !== 0,
      };
    } finally {
      scope.dispose();
    }
  }

  public override destroyRenderTarget(target: NativeHandle): void {
    this.#routes.invoke("cna_render_target_destroy", target);
  }

  public override setGraphicsDeviceRenderTargets(
    device: NativeHandle, bindings: readonly RenderTargetBindingSnapshot[],
  ): void {
    if (bindings.length === 0) {
      // A null array and a zero count is how this ABI spells "restore the backbuffer"; allocating
      // a zero-length buffer would be a different call.
      this.#routes.invoke("cna_graphics_device_set_render_targets", device, 0, 0n);
      return;
    }
    const scope = this.#routes.scope();
    try {
      // The measured wasm32 element size, not a restated one: an MRT array written at the native
      // stride puts every binding after the first somewhere CNA does not read.
      const stride = WASM_STRUCT_LAYOUTS.CNA_RenderTargetBinding.size;
      const base = scope.allocate(stride * bindings.length);
      for (let index = 0; index < bindings.length; index += 1) {
        const binding = bindings[index] as RenderTargetBindingSnapshot;
        const entry = new WasmStruct(this.#routes.module, "CNA_RenderTargetBinding", base + index * stride);
        entry.setU32("struct_size", stride).setU32("struct_version", 1);
        entry.setU64("render_target", binding.RenderTarget);
        entry.setI32("array_slice", binding.ArraySlice);
        entry.setU32("cube_map_face", binding.CubeMapFace);
      }
      this.#routes.invoke(
        "cna_graphics_device_set_render_targets", device, base, BigInt(bindings.length),
      );
    } finally {
      scope.dispose();
    }
  }
}
