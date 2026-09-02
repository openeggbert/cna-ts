// SPDX-License-Identifier: MS-PL
//
// The WebAssembly backend's `CnaAvatarBackend`: avatar descriptions, whole.
//
// This is the smallest of the non-engine families and the one that needs least from its host.
// An `AvatarDescription` is 1021 bytes and a verdict on them; it touches no device, needs no
// signed-in gamer, and holds nothing after the call returns. So a browser gets it complete, and
// what it answers is exactly what the Node-API backend answers -- which the shared oracle in
// `test/support/avatar-oracle.mjs` is what proves rather than assumes.
//
// **The handle does not escape.** CNA hands back an owned `CNA_AvatarDescriptionHandle`; the whole
// description is copied out and the handle destroyed before this returns, so nothing above this
// file owns a native lifetime. That is the Node bridge's ownership decision too, and it is the
// right one here for a reason worth stating: a description is immutable and fixed-size, so a
// retained handle would buy a consumer nothing and cost them a `Dispose` they cannot forget to
// call if they never have one.

import { CnaAvatarBackendBase } from "../backend-base.js";
import type { AvatarDescriptionSnapshot } from "../backend.js";
import { allocateStruct, type WasmRouteTable } from "./module.js";

export class WasmAvatarBackend extends CnaAvatarBackendBase {
  readonly #routes: WasmRouteTable;

  public constructor(routes: WasmRouteTable) {
    super();
    this.#routes = routes;
  }

  protected override unsupported(member: string): never {
    throw new Error(`${member} is not part of the CNA-TS WebAssembly backend's avatar family`);
  }

  /**
   * A description built from a caller's bytes.
   *
   * The length is not checked here. CNA enforces exactly `CNA_AVATAR_DESCRIPTION_BYTE_COUNT` and
   * refuses anything else, and passing that refusal through is what keeps one number in one place.
   */
  public override createAvatarDescription(bytes: Uint8Array): AvatarDescriptionSnapshot {
    const scope = this.#routes.scope();
    try {
      const pointer = scope.allocateBytes(bytes);
      return this.#snapshot(
        this.#routes.outHandle("cna_avatar_description_create", pointer, BigInt(bytes.byteLength)),
      );
    } finally {
      scope.dispose();
    }
  }

  /**
   * XNA's `CreateRandom`, which randomises nothing.
   *
   * That is not this binding's choice and not CNA's either: XNA 4.0 returns an all-zero -- and
   * therefore invalid -- description, and CNA reproduces it deliberately. The browser gets the
   * same answer as Node because it is the same implementation being asked.
   */
  public override createRandomAvatarDescription(): AvatarDescriptionSnapshot {
    return this.#snapshot(this.#routes.outHandle("cna_avatar_description_create_random"));
  }

  /** Copies everything out of an owned description and releases it before returning. */
  #snapshot(description: bigint): AvatarDescriptionSnapshot {
    const scope = this.#routes.scope();
    try {
      const info = allocateStruct(this.#routes.module, scope, "CNA_AvatarDescriptionInfo");
      this.#routes.invoke("cna_avatar_description_get_info", description, info.pointer);
      const byteCount = Number(info.getU64("description_byte_count"));
      let copied = new Uint8Array(0);
      if (byteCount > 0) {
        const buffer = scope.allocate(byteCount);
        const written = scope.allocate(8);
        this.#routes.invoke(
          "cna_avatar_description_copy_description",
          description, buffer, BigInt(byteCount), written,
        );
        const length = Number(this.#routes.view().getBigUint64(written, true));
        // Copied out of module memory rather than viewed into it: the heap can be reallocated by
        // any later call, and a view would then be reading somebody else's bytes.
        copied = new Uint8Array(this.#routes.module.HEAPU8.subarray(buffer, buffer + length));
      }
      return {
        BodyType: info.getU32("body_type"),
        Height: info.getF32("height"),
        IsValid: info.getU8("is_valid") !== 0,
        Description: copied,
      };
    } finally {
      // The handle is released whether or not the copy succeeded, and before the scope so a
      // failure cannot leave CNA holding a description nothing can reach.
      this.#routes.call("cna_avatar_description_destroy", description);
      scope.dispose();
    }
  }
}
