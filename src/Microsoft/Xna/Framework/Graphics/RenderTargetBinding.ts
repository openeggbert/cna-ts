import {
  ArgumentNullException,
  ArgumentOutOfRangeException,
} from "../../../../internal/exceptions.js";
import { Texture } from "./Texture.js";
import type { RenderTarget2D, RenderTargetCube } from "./RenderTargets.js";
import { TextureCube } from "./TextureCube.js";
import { CubeMapFace } from "./TextureEnums.js";

export class RenderTargetBinding {
  readonly #renderTarget: Texture;
  readonly #cubeMapFace: CubeMapFace;

  public constructor(renderTarget: RenderTarget2D);
  public constructor(renderTarget: RenderTargetCube, cubeMapFace: CubeMapFace);
  public constructor(renderTarget: RenderTarget2D | RenderTargetCube, cubeMapFace = CubeMapFace.PositiveX) {
    if (renderTarget == null) throw new ArgumentNullException("renderTarget");
    if (!Number.isInteger(cubeMapFace) || cubeMapFace < CubeMapFace.PositiveX ||
        cubeMapFace > CubeMapFace.NegativeZ) {
      throw new ArgumentOutOfRangeException("cubeMapFace");
    }
    if (!(renderTarget instanceof TextureCube) && cubeMapFace !== CubeMapFace.PositiveX) {
      throw new ArgumentOutOfRangeException("cubeMapFace");
    }
    this.#renderTarget = renderTarget;
    this.#cubeMapFace = cubeMapFace;
  }

  public get CubeMapFace(): CubeMapFace { return this.#cubeMapFace; }
  public get RenderTarget(): Texture { return this.#renderTarget; }

  public static op_Implicit(renderTarget: RenderTarget2D): RenderTargetBinding {
    return new RenderTargetBinding(renderTarget);
  }
}
