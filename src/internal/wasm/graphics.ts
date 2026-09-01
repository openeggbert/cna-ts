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
import type {
  DepthStencilStateSnapshot,
  RasterizerStateSnapshot,
  RenderTargetBindingSnapshot,
  RenderTargetInfo,
  VertexBufferBindingSnapshot,
} from "../backend.js";
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

  public override setGraphicsDeviceVertexBuffers(
    device: NativeHandle, bindings: readonly VertexBufferBindingSnapshot[],
  ): void {
    const scope = this.#routes.scope();
    try {
      const layout = WASM_STRUCT_LAYOUTS.CNA_VertexBufferBinding;
      const pointer = scope.allocate(Math.max(layout.size * bindings.length, 1));
      bindings.forEach((binding, index) => {
        const entry = new WasmStruct(
          this.#routes.module, "CNA_VertexBufferBinding", pointer + layout.size * index,
        );
        entry.setU64("vertex_buffer", binding.VertexBuffer ?? 0n)
          .setI32("vertex_offset", binding.VertexOffset)
          .setI32("instance_frequency", binding.InstanceFrequency);
      });
      this.#routes.invoke(
        "cna_graphics_device_set_vertex_buffers", device, pointer, BigInt(bindings.length),
      );
    } finally {
      scope.dispose();
    }
  }

  public override setGraphicsDeviceIndexBuffer(
    device: NativeHandle, buffer: NativeHandle | null,
  ): void {
    this.#routes.invoke("cna_graphics_device_set_index_buffer", device, buffer ?? 0n);
  }

  public override drawPrimitives(
    device: NativeHandle, primitiveType: number, startVertex: number, primitiveCount: number,
  ): void {
    this.#routes.invoke(
      "cna_graphics_device_draw_primitives", device, primitiveType, startVertex, primitiveCount,
    );
  }

  public override drawIndexedPrimitives(
    device: NativeHandle, primitiveType: number, baseVertex: number, minVertexIndex: number,
    numVertices: number, startIndex: number, primitiveCount: number,
  ): void {
    this.#routes.invoke(
      "cna_graphics_device_draw_indexed_primitives", device, primitiveType, baseVertex,
      minVertexIndex, numVertices, startIndex, primitiveCount,
    );
  }


  /**
   * The typed vertex upload, which is what `VertexBuffer.SetData` uses: it names the built-in
   * vertex type so CNA can check the element width rather than trusting a byte count.
   */
  public override setVertexBufferData(
    buffer: NativeHandle, vertexType: number, options: number, startIndex: number,
    elementCount: number, capacity: number, bytes: Uint8Array,
  ): void {
    const scope = this.#routes.scope();
    try {
      const transfer = allocateStruct(this.#routes.module, scope, "CNA_VertexBufferTransfer");
      transfer.setU32("vertex_type", vertexType)
        .setU32("options", options)
        .setU64("start_index", BigInt(startIndex))
        .setU64("element_count", BigInt(elementCount));
      this.#routes.invoke(
        "cna_vertex_buffer_set_data", buffer, transfer.pointer,
        scope.allocateBytes(bytes), BigInt(capacity),
      );
    } finally {
      scope.dispose();
    }
  }

  /** The typed index upload, which is what `IndexBuffer.SetData` uses. */
  public override setIndexBufferData(
    buffer: NativeHandle, elementSize: number, options: number, offsetInBytes: number | null,
    startIndex: number, elementCount: number, capacity: number, bytes: Uint8Array,
  ): void {
    const scope = this.#routes.scope();
    try {
      const transfer = allocateStruct(this.#routes.module, scope, "CNA_IndexBufferTransfer");
      transfer.setU32("index_element_size", elementSize)
        .setU32("options", options)
        .setU64("start_index", BigInt(startIndex))
        .setU64("element_count", BigInt(elementCount));
      const data = scope.allocateBytes(bytes);
      if (offsetInBytes == null) {
        this.#routes.invoke(
          "cna_index_buffer_set_data", buffer, transfer.pointer, data, BigInt(capacity),
        );
      } else {
        this.#routes.invoke(
          "cna_index_buffer_set_data_at", buffer, BigInt(offsetInBytes), transfer.pointer,
          data, BigInt(capacity),
        );
      }
    } finally {
      scope.dispose();
    }
  }

  /**
   * The two device states a 3D draw has to set, and the reason the first version of this slice
   * drew nothing: XNA culls counter-clockwise by default, so a triangle wound that way vanishes
   * unless the caller says otherwise.
   */
  public override setGraphicsDeviceRasterizerState(
    device: NativeHandle, state: RasterizerStateSnapshot,
  ): void {
    const scope = this.#routes.scope();
    try {
      const info = allocateStruct(this.#routes.module, scope, "CNA_RasterizerState");
      info.setU32("cull_mode", state.CullMode)
        .setU32("fill_mode", state.FillMode)
        .setF32("depth_bias", state.DepthBias)
        .setF32("slope_scale_depth_bias", state.SlopeScaleDepthBias)
        .setU8("multi_sample_anti_alias", state.MultiSampleAntiAlias ? 1 : 0)
        .setU8("scissor_test_enable", state.ScissorTestEnable ? 1 : 0);
      this.#routes.invoke("cna_graphics_device_set_rasterizer_state", device, info.pointer);
    } finally {
      scope.dispose();
    }
  }

  public override setGraphicsDeviceDepthStencilState(
    device: NativeHandle, state: DepthStencilStateSnapshot,
  ): void {
    const scope = this.#routes.scope();
    try {
      const info = allocateStruct(this.#routes.module, scope, "CNA_DepthStencilState");
      info.setU8("depth_buffer_enable", state.DepthBufferEnable ? 1 : 0)
        .setU8("depth_buffer_write_enable", state.DepthBufferWriteEnable ? 1 : 0)
        .setU8("stencil_enable", state.StencilEnable ? 1 : 0)
        .setU8("two_sided_stencil_mode", state.TwoSidedStencilMode ? 1 : 0)
        .setU32("depth_buffer_function", state.DepthBufferFunction)
        .setU32("stencil_function", state.StencilFunction)
        .setI32("stencil_mask", state.StencilMask)
        .setI32("stencil_write_mask", state.StencilWriteMask)
        .setI32("reference_stencil", state.ReferenceStencil)
        .setU32("stencil_fail", state.StencilFail)
        .setU32("stencil_depth_buffer_fail", state.StencilDepthBufferFail)
        .setU32("stencil_pass", state.StencilPass)
        .setU32("counter_clockwise_stencil_function", state.CounterClockwiseStencilFunction)
        .setU32("counter_clockwise_stencil_fail", state.CounterClockwiseStencilFail)
        .setU32(
          "counter_clockwise_stencil_depth_buffer_fail",
          state.CounterClockwiseStencilDepthBufferFail,
        )
        .setU32("counter_clockwise_stencil_pass", state.CounterClockwiseStencilPass);
      this.#routes.invoke("cna_graphics_device_set_depth_stencil_state", device, info.pointer);
    } finally {
      scope.dispose();
    }
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
