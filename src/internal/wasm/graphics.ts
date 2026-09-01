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
  BlendStateSnapshot,
  ContentLostResourceKind,
  DepthStencilStateSnapshot,
  RasterizerStateSnapshot,
  RenderTargetBindingSnapshot,
  RenderTargetInfo,
  SamplerStateSnapshot,
  Texture3DInfo,
  TextureCubeInfo,
  VertexBufferBindingSnapshot,
  VertexElementSnapshot,
} from "../backend.js";
import type { NativeHandle } from "../ownership.js";
import { WasmEngineMemory } from "./graphics-ext-core.js";
import { WASM_CALLBACK_SIGNATURES, WASM_STRUCT_LAYOUTS } from "./layout.js";
import { allocateStruct, WasmStruct, type WasmRouteTable, type WasmScope } from "./module.js";

/**
 * The two routes each ContentLost resource kind subscribes and unsubscribes through.
 *
 * Written out rather than composed from a prefix. `tools/wasm/sync-routes.mjs` derives the route
 * table from the `"cna_..."` literals in this directory, so a name built at runtime is a name that
 * never reaches the table -- and `WasmRouteTable` would then fail on the call rather than at load.
 * A prefix plus a suffix is exactly the shape that defeats that check, and it did once here.
 */
const CONTENT_LOST_ROUTES: Readonly<Record<string, readonly [string, string]>> = {
  "render-target": [
    "cna_render_target_subscribe_content_lost", "cna_render_target_unsubscribe_content_lost",
  ],
  "vertex-buffer": [
    "cna_vertex_buffer_subscribe_content_lost", "cna_vertex_buffer_unsubscribe_content_lost",
  ],
  "index-buffer": [
    "cna_index_buffer_subscribe_content_lost", "cna_index_buffer_unsubscribe_content_lost",
  ],
};

export class WasmGraphicsBackend extends CnaGraphicsBackendBase {
  readonly #mem: WasmEngineMemory;

  public constructor(routes: WasmRouteTable) {
    super();
    this.#mem = new WasmEngineMemory(routes);
  }

  get #routes(): WasmRouteTable { return this.#mem.routes; }

  /** Function-table entries rooted for a live ContentLost registration, so each can be removed. */
  readonly #contentLostCallbacks = new Map<NativeHandle, number>();

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
   * `DrawUserPrimitives`: geometry handed to the device per call rather than held in a buffer.
   *
   * This is the draw a compiled effect is exercised through, because it is the one that needs no
   * resource of its own -- the shader, the parameters and the pixels are the subject, and a vertex
   * buffer between them is a second thing that could be wrong.
   *
   * `CNA_UserPrimitives` is where a hand-written wasm32 layout goes wrong in a way nothing
   * reports: its `vertex_data` pointer is four bytes and its `vertex_declaration` handle is eight,
   * so the native offsets place the handle where the padding is. The layout is measured, and the
   * declaration -- when the caller supplied one rather than relying on the built-in source's own
   * -- is created and destroyed around the single call that reads it.
   */
  public override drawUserPrimitives(
    device: NativeHandle, primitiveType: number, vertexSource: number, bytes: Uint8Array,
    vertexStride: number, vertexCapacity: number, vertexOffset: number, numVertices: number,
    primitiveCount: number, declaration: readonly VertexElementSnapshot[] | null,
  ): void {
    const scope = this.#routes.scope();
    let declarationHandle: NativeHandle = 0n;
    try {
      if (declaration != null) {
        declarationHandle = this.#createVertexDeclaration(scope, vertexStride, declaration);
      }
      const primitives = allocateStruct(this.#routes.module, scope, "CNA_UserPrimitives");
      primitives.setU32("primitive_type", primitiveType)
        .setU32("vertex_source", vertexSource)
        .setPointer("vertex_data", scope.allocateBytes(bytes))
        .setU64("vertex_declaration", declarationHandle)
        .setI32("vertex_offset", vertexOffset)
        .setI32("num_vertices", numVertices)
        .setI32("primitive_count", primitiveCount)
        .setU32("reserved", 0);
      void vertexCapacity;
      this.#routes.invoke(
        "cna_graphics_device_draw_user_primitives", device, primitives.pointer,
      );
    } finally {
      if (declarationHandle !== 0n) {
        this.#routes.invoke("cna_vertex_declaration_destroy", declarationHandle);
      }
      scope.dispose();
    }
  }

  /** The caller's own vertex layout, as the array of `CNA_VertexElement` CNA copies. */
  #createVertexDeclaration(
    scope: ReturnType<WasmRouteTable["scope"]>, stride: number,
    elements: readonly VertexElementSnapshot[],
  ): NativeHandle {
    const layout = WASM_STRUCT_LAYOUTS.CNA_VertexElement;
    const pointer = scope.allocate(Math.max(layout.size * elements.length, 1));
    elements.forEach((element, index) => {
      new WasmStruct(this.#routes.module, "CNA_VertexElement", pointer + layout.size * index)
        .setI32("offset", element.Offset)
        .setU32("format", element.VertexElementFormat)
        .setU32("usage", element.VertexElementUsage)
        .setI32("usage_index", element.UsageIndex);
    });
    return this.#routes.outHandle(
      "cna_vertex_declaration_create_with_stride", stride, pointer, BigInt(elements.length),
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
      this.#routes.invoke(
        "cna_graphics_device_set_rasterizer_state", device, this.#rasterizerState(scope, state));
    } finally {
      scope.dispose();
    }
  }

  /** The same bytes a sprite batch under caller-chosen states needs, written once. */
  #rasterizerState(scope: WasmScope, state: RasterizerStateSnapshot): number {
    const info = allocateStruct(this.#routes.module, scope, "CNA_RasterizerState");
      info.setU32("cull_mode", state.CullMode)
        .setU32("fill_mode", state.FillMode)
        .setF32("depth_bias", state.DepthBias)
        .setF32("slope_scale_depth_bias", state.SlopeScaleDepthBias)
        .setU8("multi_sample_anti_alias", state.MultiSampleAntiAlias ? 1 : 0)
        .setU8("scissor_test_enable", state.ScissorTestEnable ? 1 : 0);
    return info.pointer;
  }

  public override setGraphicsDeviceDepthStencilState(
    device: NativeHandle, state: DepthStencilStateSnapshot,
  ): void {
    const scope = this.#routes.scope();
    try {
      this.#routes.invoke(
        "cna_graphics_device_set_depth_stencil_state", device,
        this.#depthStencilState(scope, state));
    } finally {
      scope.dispose();
    }
  }

  #depthStencilState(scope: WasmScope, state: DepthStencilStateSnapshot): number {
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
    return info.pointer;
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
        const entry = new WasmStruct(
          this.#routes.module,
          "CNA_RenderTargetBinding",
          base + index * stride,
        );
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

  // --- the device state a draw is made under ----------------------------------------------------
  //
  // Everything below this line was outside the first vertical slice, and the reason it is inside
  // now is that the engine layer reached it: a skybox is a `TextureCube`, a colour-grade volume is
  // a `Texture3D`, and a page that draws its own geometry sets its own blend, sampler and viewport
  // state. `CNA_Rectangle` and `CNA_Viewport` are taken **by value**, which wasm32 lowers as a
  // pointer to a caller-owned copy -- the same convention `CNA_StringView` follows.

  public override getGraphicsDeviceStatus(device: NativeHandle): number {
    return this.#mem.u32("cna_graphics_device_get_status", device);
  }

  public override setGraphicsDeviceBlendFactor(device: NativeHandle, packedColor: number): void {
    this.#routes.invoke("cna_graphics_device_set_blend_factor", device, packedColor >>> 0);
  }

  public override setGraphicsDeviceMultiSampleMask(device: NativeHandle, value: number): void {
    this.#routes.invoke("cna_graphics_device_set_multi_sample_mask", device, value | 0);
  }

  public override setGraphicsDeviceReferenceStencil(device: NativeHandle, value: number): void {
    this.#routes.invoke("cna_graphics_device_set_reference_stencil", device, value | 0);
  }

  public override setGraphicsDeviceScissorRectangle(
    device: NativeHandle, x: number, y: number, width: number, height: number,
  ): void {
    const scope = this.#routes.scope();
    try {
      const rectangle = allocateStruct(this.#routes.module, scope, "CNA_Rectangle", false);
      rectangle.setI32("x", Math.trunc(x)).setI32("y", Math.trunc(y))
        .setI32("width", Math.trunc(width)).setI32("height", Math.trunc(height));
      this.#routes.invoke(
        "cna_graphics_device_set_scissor_rectangle", device, rectangle.pointer);
    } finally {
      scope.dispose();
    }
  }

  public override setGraphicsDeviceViewport(
    device: NativeHandle, x: number, y: number, width: number, height: number,
    minDepth: number, maxDepth: number,
  ): void {
    const scope = this.#routes.scope();
    try {
      const viewport = allocateStruct(this.#routes.module, scope, "CNA_Viewport", false);
      viewport.setI32("x", Math.trunc(x)).setI32("y", Math.trunc(y))
        .setI32("width", Math.trunc(width)).setI32("height", Math.trunc(height))
        .setF32("min_depth", minDepth).setF32("max_depth", maxDepth);
      this.#routes.invoke("cna_graphics_device_set_viewport", device, viewport.pointer);
    } finally {
      scope.dispose();
    }
  }

  public override setGraphicsDeviceBlendState(
    device: NativeHandle, state: BlendStateSnapshot,
  ): void {
    const scope = this.#routes.scope();
    try {
      const structure = allocateStruct(this.#routes.module, scope, "CNA_BlendState");
      structure
        .setU32("alpha_blend_function", state.AlphaBlendFunction)
        .setU32("alpha_destination_blend", state.AlphaDestinationBlend)
        .setU32("alpha_source_blend", state.AlphaSourceBlend)
        .setU32("color_blend_function", state.ColorBlendFunction)
        .setU32("color_destination_blend", state.ColorDestinationBlend)
        .setU32("color_source_blend", state.ColorSourceBlend)
        .setU32("color_write_channels", state.ColorWriteChannels)
        .setU32("color_write_channels1", state.ColorWriteChannels1)
        .setU32("color_write_channels2", state.ColorWriteChannels2)
        .setU32("color_write_channels3", state.ColorWriteChannels3)
        .setU32("blend_factor", state.BlendFactor >>> 0)
        .setI32("multi_sample_mask", state.MultiSampleMask | 0);
      this.#routes.invoke("cna_graphics_device_set_blend_state", device, structure.pointer);
    } finally {
      scope.dispose();
    }
  }

  public override setGraphicsDeviceSamplerState(
    device: NativeHandle, shaderStage: number, slot: number, state: SamplerStateSnapshot,
  ): void {
    const scope = this.#routes.scope();
    try {
      this.#routes.invoke(
        "cna_graphics_device_set_sampler_state", device, shaderStage, slot >>> 0,
        this.#samplerState(scope, state),
      );
    } finally {
      scope.dispose();
    }
  }

  /** A null texture is `CNA_INVALID_HANDLE`, which is how a slot is cleared rather than emptied. */
  public override setGraphicsDeviceTexture(
    device: NativeHandle, shaderStage: number, slot: number, texture: NativeHandle | null,
  ): void {
    this.#routes.invoke(
      "cna_graphics_device_set_texture", device, shaderStage, slot >>> 0, texture ?? 0n);
  }

  public override drawInstancedPrimitives(
    device: NativeHandle, primitiveType: number, baseVertex: number, minVertexIndex: number,
    numVertices: number, startIndex: number, primitiveCount: number, instanceCount: number,
  ): void {
    this.#routes.invoke(
      "cna_graphics_device_draw_instanced_primitives", device, primitiveType,
      Math.trunc(baseVertex), Math.trunc(minVertexIndex), Math.trunc(numVertices),
      Math.trunc(startIndex), Math.trunc(primitiveCount), Math.trunc(instanceCount),
    );
  }

  public override drawUserIndexedPrimitives(
    device: NativeHandle, primitiveType: number, vertexSource: number, bytes: Uint8Array,
    vertexStride: number, vertexCapacity: number, vertexOffset: number, numVertices: number,
    primitiveCount: number, declaration: readonly VertexElementSnapshot[] | null,
    indexBytes: Uint8Array, indexElementSize: number, indexCapacity: number, indexOffset: number,
  ): void {
    const scope = this.#routes.scope();
    let declarationHandle: NativeHandle = 0n;
    try {
      if (declaration != null) {
        declarationHandle = this.#createVertexDeclaration(scope, vertexStride, declaration);
      }
      const primitives = allocateStruct(this.#routes.module, scope, "CNA_UserPrimitives");
      primitives.setU32("primitive_type", primitiveType)
        .setU32("vertex_source", vertexSource)
        .setPointer("vertex_data", scope.allocateBytes(bytes))
        .setU64("vertex_declaration", declarationHandle)
        .setI32("vertex_offset", Math.trunc(vertexOffset))
        .setI32("num_vertices", Math.trunc(numVertices))
        .setI32("primitive_count", Math.trunc(primitiveCount))
        .setU32("reserved", 0);
      void vertexCapacity;
      void indexCapacity;
      const indices = allocateStruct(this.#routes.module, scope, "CNA_UserIndices");
      indices.setU32("index_element_size", indexElementSize)
        .setI32("index_offset", Math.trunc(indexOffset))
        .setPointer("index_data", scope.allocateBytes(indexBytes));
      this.#routes.invoke(
        "cna_graphics_device_draw_user_indexed_primitives", device,
        primitives.pointer, indices.pointer,
      );
    } finally {
      if (declarationHandle !== 0n) {
        this.#routes.invoke("cna_vertex_declaration_destroy", declarationHandle);
      }
      scope.dispose();
    }
  }

  /**
   * A batch under the caller's own four states.
   *
   * With a transform CNA has no route that takes one without an effect, so this uses the
   * effect-bearing route with `CNA_INVALID_HANDLE` for the effect -- which is what the Node-API
   * bridge does for the same call, and the reason the two backends agree about a transformed batch
   * with no custom shader.
   */
  public override beginSpriteBatchWithStates(
    spriteBatch: NativeHandle, sortMode: number, blend: BlendStateSnapshot,
    sampler: SamplerStateSnapshot, depth: DepthStencilStateSnapshot,
    rasterizer: RasterizerStateSnapshot, transform: readonly number[] | null,
  ): void {
    const scope = this.#routes.scope();
    try {
      const blendPointer = this.#blendState(scope, blend);
      const samplerPointer = this.#samplerState(scope, sampler);
      const depthPointer = this.#depthStencilState(scope, depth);
      const rasterizerPointer = this.#rasterizerState(scope, rasterizer);
      if (transform == null) {
        this.#routes.invoke(
          "cna_sprite_batch_begin_with_states", spriteBatch, sortMode,
          blendPointer, samplerPointer, depthPointer, rasterizerPointer,
        );
        return;
      }
      const matrix = scope.allocate(WASM_STRUCT_LAYOUTS.CNA_Matrix.size);
      const view = this.#routes.view();
      for (let index = 0; index < 16; index += 1) {
        view.setFloat32(matrix + index * 4, transform[index] ?? 0, true);
      }
      this.#routes.invoke(
        "cna_sprite_batch_begin_with_effect", spriteBatch, sortMode,
        blendPointer, samplerPointer, depthPointer, rasterizerPointer, 0n, matrix,
      );
    } finally {
      scope.dispose();
    }
  }

  // --- the two textures the engine layer needed -------------------------------------------------

  public override createTexture3D(
    device: NativeHandle, width: number, height: number, depth: number,
    mipMap: boolean, format: number,
  ): NativeHandle {
    const scope = this.#routes.scope();
    try {
      const info = allocateStruct(this.#routes.module, scope, "CNA_Texture3DCreateInfo");
      info.setI32("width", Math.trunc(width)).setI32("height", Math.trunc(height))
        .setI32("depth", Math.trunc(depth)).setU8("mip_map", mipMap ? 1 : 0)
        .setU32("format", format);
      return this.#routes.outHandle("cna_texture3d_create", device, info.pointer);
    } finally {
      scope.dispose();
    }
  }

  public override getTexture3DInfo(texture: NativeHandle): Texture3DInfo {
    const scope = this.#routes.scope();
    try {
      const info = allocateStruct(this.#routes.module, scope, "CNA_Texture3DInfo");
      this.#routes.invoke("cna_texture3d_get_info", texture, info.pointer);
      return {
        Width: info.getI32("width"), Height: info.getI32("height"), Depth: info.getI32("depth"),
        LevelCount: info.getI32("level_count"), Format: info.getU32("format"),
      };
    } finally {
      scope.dispose();
    }
  }

  public override setTexture3DColors(
    texture: NativeHandle, level: number, left: number, top: number, right: number,
    bottom: number, front: number, back: number, startIndex: number, elementCount: number,
    packedColors: Uint32Array,
  ): void {
    const scope = this.#routes.scope();
    try {
      const transfer = this.#texture3dTransfer(
        scope, level, left, top, right, bottom, front, back, startIndex, elementCount);
      const data = scope.allocateBytes(new Uint8Array(
        packedColors.buffer, packedColors.byteOffset, packedColors.byteLength));
      this.#routes.invoke(
        "cna_texture3d_set_data", texture, transfer, data, BigInt(packedColors.length));
    } finally {
      scope.dispose();
    }
  }

  public override getTexture3DColors(
    texture: NativeHandle, level: number, left: number, top: number, right: number,
    bottom: number, front: number, back: number, startIndex: number, elementCount: number,
    capacity: number,
  ): Uint32Array {
    const scope = this.#routes.scope();
    try {
      const transfer = this.#texture3dTransfer(
        scope, level, left, top, right, bottom, front, back, startIndex, elementCount);
      const destination = scope.allocate(Math.max(capacity * 4, 4));
      const required = scope.allocate(8);
      this.#routes.invoke(
        "cna_texture3d_get_data", texture, transfer, destination, BigInt(capacity), required);
      return new Uint32Array(new Uint8Array(this.#routes.module.HEAPU8.subarray(
        destination, destination + elementCount * 4)).buffer);
    } finally {
      scope.dispose();
    }
  }

  public override destroyTexture3D(texture: NativeHandle): void {
    this.#routes.invoke("cna_texture3d_destroy", texture);
  }

  public override createTextureCube(
    device: NativeHandle, size: number, mipMap: boolean, format: number,
  ): NativeHandle {
    const scope = this.#routes.scope();
    try {
      const info = allocateStruct(this.#routes.module, scope, "CNA_TextureCubeCreateInfo");
      info.setI32("size", Math.trunc(size)).setU8("mip_map", mipMap ? 1 : 0)
        .setU32("format", format);
      return this.#routes.outHandle("cna_texturecube_create", device, info.pointer);
    } finally {
      scope.dispose();
    }
  }

  public override getTextureCubeInfo(texture: NativeHandle): TextureCubeInfo {
    const scope = this.#routes.scope();
    try {
      const info = allocateStruct(this.#routes.module, scope, "CNA_TextureCubeInfo");
      this.#routes.invoke("cna_texturecube_get_info", texture, info.pointer);
      return {
        Size: info.getI32("size"), LevelCount: info.getI32("level_count"),
        Format: info.getU32("format"),
      };
    } finally {
      scope.dispose();
    }
  }

  public override setTextureCubeColors(
    texture: NativeHandle, face: number, level: number,
    rectangle: { readonly X: number; readonly Y: number; readonly Width: number; readonly Height: number } | null,
    startIndex: number, elementCount: number, packedColors: Uint32Array,
  ): void {
    const scope = this.#routes.scope();
    try {
      const transfer = this.#textureCubeTransfer(
        scope, face, level, rectangle, startIndex, elementCount);
      const data = scope.allocateBytes(new Uint8Array(
        packedColors.buffer, packedColors.byteOffset, packedColors.byteLength));
      this.#routes.invoke(
        "cna_texturecube_set_data", texture, transfer, data, BigInt(packedColors.length));
    } finally {
      scope.dispose();
    }
  }

  public override getTextureCubeColors(
    texture: NativeHandle, face: number, level: number,
    rectangle: { readonly X: number; readonly Y: number; readonly Width: number; readonly Height: number } | null,
    startIndex: number, elementCount: number, capacity: number,
  ): Uint32Array {
    const scope = this.#routes.scope();
    try {
      const transfer = this.#textureCubeTransfer(
        scope, face, level, rectangle, startIndex, elementCount);
      const destination = scope.allocate(Math.max(capacity * 4, 4));
      const required = scope.allocate(8);
      this.#routes.invoke(
        "cna_texturecube_get_data", texture, transfer, destination, BigInt(capacity), required);
      return new Uint32Array(new Uint8Array(this.#routes.module.HEAPU8.subarray(
        destination, destination + elementCount * 4)).buffer);
    } finally {
      scope.dispose();
    }
  }

  public override destroyTextureCube(texture: NativeHandle): void {
    this.#routes.invoke("cna_texturecube_destroy", texture);
  }

  // --- occlusion queries ------------------------------------------------------------------------

  public override createOcclusionQuery(device: NativeHandle): NativeHandle {
    return this.#routes.outHandle("cna_occlusion_query_create", device);
  }

  public override beginOcclusionQuery(query: NativeHandle): void {
    this.#routes.invoke("cna_occlusion_query_begin", query);
  }

  public override endOcclusionQuery(query: NativeHandle): void {
    this.#routes.invoke("cna_occlusion_query_end", query);
  }

  public override getOcclusionQueryIsComplete(query: NativeHandle): boolean {
    return this.#mem.bool("cna_occlusion_query_get_is_complete", query);
  }

  public override getOcclusionQueryPixelCount(query: NativeHandle): number {
    return this.#mem.int("cna_occlusion_query_get_pixel_count", query);
  }

  public override destroyOcclusionQuery(query: NativeHandle): void {
    this.#routes.invoke("cna_occlusion_query_destroy", query);
  }

  // --- buffers ----------------------------------------------------------------------------------

  public override setVertexBufferRawAt(
    buffer: NativeHandle, offsetInBytes: number, bytes: Uint8Array,
    vertexCount: number, vertexStride: number, options: number,
  ): void {
    const scope = this.#routes.scope();
    try {
      const data = scope.allocateBytes(bytes);
      // Two routes: one that takes the discard/no-overwrite option and one that does not. A
      // buffer written without an option is not the same call as one written with the default.
      if (options === 0) {
        this.#routes.invoke(
          "cna_vertex_buffer_set_data_raw_at", buffer, BigInt(Math.trunc(offsetInBytes)), data,
          BigInt(bytes.byteLength), BigInt(Math.trunc(vertexCount)), vertexStride >>> 0,
        );
        return;
      }
      this.#routes.invoke(
        "cna_vertex_buffer_set_data_raw_at_with_options", buffer,
        BigInt(Math.trunc(offsetInBytes)), data, BigInt(bytes.byteLength),
        BigInt(Math.trunc(vertexCount)), vertexStride >>> 0, options,
      );
    } finally {
      scope.dispose();
    }
  }

  public override getVertexBufferRawAt(
    buffer: NativeHandle, offsetInBytes: number, vertexCount: number, vertexStride: number,
  ): Uint8Array {
    const scope = this.#routes.scope();
    try {
      const byteCount = Math.max(vertexCount * vertexStride, 1);
      const destination = scope.allocate(byteCount);
      this.#routes.invoke(
        "cna_vertex_buffer_get_data_raw", buffer, BigInt(Math.trunc(offsetInBytes)), destination,
        BigInt(byteCount), BigInt(Math.trunc(vertexCount)), vertexStride >>> 0,
      );
      return new Uint8Array(
        this.#routes.module.HEAPU8.subarray(destination, destination + byteCount));
    } finally {
      scope.dispose();
    }
  }

  public override getVertexBufferIsContentLost(buffer: NativeHandle): boolean {
    const scope = this.#routes.scope();
    try {
      const info = allocateStruct(this.#routes.module, scope, "CNA_VertexBufferInfo");
      this.#routes.invoke("cna_vertex_buffer_get_info", buffer, info.pointer);
      return info.getU8("is_content_lost") !== 0;
    } finally {
      scope.dispose();
    }
  }

  public override getIndexBufferIsContentLost(buffer: NativeHandle): boolean {
    const scope = this.#routes.scope();
    try {
      const info = allocateStruct(this.#routes.module, scope, "CNA_IndexBufferInfo");
      this.#routes.invoke("cna_index_buffer_get_info", buffer, info.pointer);
      return info.getU8("is_content_lost") !== 0;
    } finally {
      scope.dispose();
    }
  }

  // --- the three transfer and four state structures ---------------------------------------------

  #texture3dTransfer(
    scope: WasmScope, level: number, left: number, top: number, right: number, bottom: number,
    front: number, back: number, startIndex: number, elementCount: number,
  ): number {
    const transfer = allocateStruct(this.#routes.module, scope, "CNA_Texture3DTransfer");
    transfer.setI32("level", Math.trunc(level))
      .setI32("left", Math.trunc(left)).setI32("top", Math.trunc(top))
      .setI32("right", Math.trunc(right)).setI32("bottom", Math.trunc(bottom))
      .setI32("front", Math.trunc(front)).setI32("back", Math.trunc(back))
      .setU64("start_index", BigInt(Math.trunc(startIndex)))
      .setU64("element_count", BigInt(Math.trunc(elementCount)));
    return transfer.pointer;
  }

  #textureCubeTransfer(
    scope: WasmScope, face: number, level: number,
    rectangle: { readonly X: number; readonly Y: number; readonly Width: number; readonly Height: number } | null,
    startIndex: number, elementCount: number,
  ): number {
    const transfer = allocateStruct(this.#routes.module, scope, "CNA_TextureCubeTransfer");
    transfer.setU32("face", face).setI32("level", Math.trunc(level))
      .setU8("has_rectangle", rectangle ? 1 : 0);
    if (rectangle) {
      transfer.nested("rectangle", "CNA_Rectangle")
        .setI32("x", Math.trunc(rectangle.X)).setI32("y", Math.trunc(rectangle.Y))
        .setI32("width", Math.trunc(rectangle.Width))
        .setI32("height", Math.trunc(rectangle.Height));
    }
    transfer.setU64("start_index", BigInt(Math.trunc(startIndex)))
      .setU64("element_count", BigInt(Math.trunc(elementCount)));
    return transfer.pointer;
  }

  #samplerState(scope: WasmScope, state: SamplerStateSnapshot): number {
    const structure = allocateStruct(this.#routes.module, scope, "CNA_SamplerState");
    structure.setU32("address_u", state.AddressU).setU32("address_v", state.AddressV)
      .setU32("address_w", state.AddressW).setU32("filter", state.Filter)
      .setI32("max_anisotropy", Math.trunc(state.MaxAnisotropy))
      .setI32("max_mip_level", Math.trunc(state.MaxMipLevel))
      .setF32("mip_map_level_of_detail_bias", state.MipMapLevelOfDetailBias);
    return structure.pointer;
  }

  #blendState(scope: WasmScope, state: BlendStateSnapshot): number {
    const structure = allocateStruct(this.#routes.module, scope, "CNA_BlendState");
    structure
      .setU32("alpha_blend_function", state.AlphaBlendFunction)
      .setU32("alpha_destination_blend", state.AlphaDestinationBlend)
      .setU32("alpha_source_blend", state.AlphaSourceBlend)
      .setU32("color_blend_function", state.ColorBlendFunction)
      .setU32("color_destination_blend", state.ColorDestinationBlend)
      .setU32("color_source_blend", state.ColorSourceBlend)
      .setU32("color_write_channels", state.ColorWriteChannels)
      .setU32("color_write_channels1", state.ColorWriteChannels1)
      .setU32("color_write_channels2", state.ColorWriteChannels2)
      .setU32("color_write_channels3", state.ColorWriteChannels3)
      .setU32("blend_factor", state.BlendFactor >>> 0)
      .setI32("multi_sample_mask", state.MultiSampleMask | 0);
    return structure.pointer;
  }


  // --- ContentLost, which is a real event on a renderer whose API can lose a device ------------
  //
  // WebGL 2.0 is not such a renderer: a context loss there is a different mechanism and CNA does
  // not raise this event on it. The subscription is bound anyway, and the reason is the same one
  // that put `createEffectCompiled` in the effect slice -- a binding that refused would be
  // answering a question about itself, when what a consumer wants to know is what their renderer
  // does. A registration made here is real, is released by `unsubscribeContentLost`, and simply
  // never fires on this context.
  //
  // Three resource kinds, three route families, one registration handle. The callback is rooted for
  // the registration's lifetime and removed when it is released, so a page that unsubscribes does
  // not leave a function table entry pointing at a closure it has forgotten.

  public override subscribeContentLost(
    kind: ContentLostResourceKind, resource: NativeHandle, callback: () => void,
  ): NativeHandle {
    const routes = CONTENT_LOST_ROUTES[kind];
    if (routes === undefined) throw new TypeError(`unknown ContentLost resource kind ${kind}`);
    const pointer = this.#routes.module.addFunction(
      ((_resource: bigint, _context: number): void => {
        // A JavaScript exception must never unwind into compiled C, and there is no frame boundary
        // to rethrow it at here, so it is reported the way an unhandled listener failure is.
        try {
          callback();
        } catch (error) {
          queueMicrotask(() => { throw error; });
        }
      }) as never,
      WASM_CALLBACK_SIGNATURES.CNA_ContentLostCallback,
    );
    try {
      const registration = this.#routes.outHandle(routes[0], resource, pointer, 0);
      this.#contentLostCallbacks.set(registration, pointer);
      return registration;
    } catch (error) {
      this.#routes.module.removeFunction(pointer);
      throw error;
    }
  }

  public override unsubscribeContentLost(registration: NativeHandle): void {
    // Which family the registration belongs to is not in the handle, so each is tried in turn and
    // the first that accepts it is the right one. A handle no family accepts is a caller error and
    // the last refusal is the one they see.
    let refusal: unknown = null;
    for (const [, unsubscribe] of Object.values(CONTENT_LOST_ROUTES)) {
      try {
        this.#routes.invoke(unsubscribe, registration);
        const pointer = this.#contentLostCallbacks.get(registration);
        if (pointer !== undefined) {
          this.#routes.module.removeFunction(pointer);
          this.#contentLostCallbacks.delete(registration);
        }
        return;
      } catch (error) {
        refusal = error;
      }
    }
    throw refusal;
  }

}
