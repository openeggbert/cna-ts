// SPDX-License-Identifier: MS-PL

import type { IDisposable } from "../Contracts.js";
import type { AsyncCallback, IAsyncResult } from "../Contracts.js";
import { EventDispatcher } from "../../../../internal/events.js";
import type { XnaEvent } from "../Contracts.js";
import type { EventArgs } from "../EventArgs.js";
import { Matrix } from "../Matrix.js";
import { Vector3 } from "../Vector3.js";
import { TimeSpan } from "../TimeSpan.js";
import type { Gamer } from "./Gamer.js";
import {
  AvatarAnimationPreset,
  AvatarBodyType,
  AvatarEye,
  AvatarEyebrow,
  AvatarMouth,
  AvatarRendererState,
} from "./Enums.js";
import { GamerServicesNotAvailableException } from "./Exceptions.js";
import { ArgumentOutOfRangeException } from "../../../../internal/exceptions.js";
import type { AvatarDescriptionSnapshot, CnaAvatarBackend } from "../../../../internal/backend.js";
import { getBackend } from "../../../../internal/backend.js";
import { NativeUnavailableError } from "../../../../internal/native-error.js";

function requirePlatform(): never {
  throw new GamerServicesNotAvailableException();
}

/** One frame of an avatar's face. A mutable value type in XNA, and a mutable class here. */
export class AvatarExpression {
  #leftEye = AvatarEye.Neutral;
  #rightEye = AvatarEye.Neutral;
  #leftEyebrow = AvatarEyebrow.Neutral;
  #rightEyebrow = AvatarEyebrow.Neutral;
  #mouth = AvatarMouth.Neutral;

  /** The left eye's shape. */
  public get LeftEye(): AvatarEye { return this.#leftEye; }
  public set LeftEye(value: AvatarEye) { this.#leftEye = value; }
  /** The right eye's shape. */
  public get RightEye(): AvatarEye { return this.#rightEye; }
  public set RightEye(value: AvatarEye) { this.#rightEye = value; }
  /** The left eyebrow's shape. */
  public get LeftEyebrow(): AvatarEyebrow { return this.#leftEyebrow; }
  public set LeftEyebrow(value: AvatarEyebrow) { this.#leftEyebrow = value; }
  /** The right eyebrow's shape. */
  public get RightEyebrow(): AvatarEyebrow { return this.#rightEyebrow; }
  public set RightEyebrow(value: AvatarEyebrow) { this.#rightEyebrow = value; }
  /** The mouth's shape. */
  public get Mouth(): AvatarMouth { return this.#mouth; }
  public set Mouth(value: AvatarMouth) { this.#mouth = value; }
}

/** What an avatar renderer needs from anything that animates an avatar. */
export interface IAvatarAnimation {
  /** The bone transforms for the current position. */
  get BoneTransforms(): ReadonlyArray<Matrix>;
  /** Where playback is. */
  get CurrentPosition(): TimeSpan;
  set CurrentPosition(value: TimeSpan);
  /** The face for the current position. */
  get Expression(): AvatarExpression;
  /** How long the animation runs. */
  get Length(): TimeSpan;
  /** Advances playback. */
  Update(elapsedAnimationTime: TimeSpan, loop: boolean): void;
}

/** One of the platform's canned avatar animations. */
export class AvatarAnimation implements IAvatarAnimation, IDisposable {
  #currentPosition = TimeSpan.Zero;
  #disposed = false;

  public constructor(animationPreset: AvatarAnimationPreset) {
    requirePlatform();
  }

  /** The bone transforms for the current position. */
  public get BoneTransforms(): ReadonlyArray<Matrix> { return requirePlatform(); }
  /** Where playback is. */
  public get CurrentPosition(): TimeSpan { return this.#currentPosition; }
  public set CurrentPosition(value: TimeSpan) { this.#currentPosition = TimeSpan.FromTicks(value.Ticks); }
  /** The face for the current position. */
  public get Expression(): AvatarExpression { return requirePlatform(); }
  /** How long the animation runs. */
  public get Length(): TimeSpan { return TimeSpan.Zero; }
  /** Whether the animation has been released. */
  public get IsDisposed(): boolean { return this.#disposed; }

  /** Advances playback. */
  public Update(elapsedAnimationTime: TimeSpan, loop: boolean): void { requirePlatform(); }

  /**
   * Releases the animation. XNA also declares a protected `Dispose(bool)`; TypeScript cannot give
   * one overload set two visibilities, so the public member is what the projection carries.
   */
  public Dispose(): void { this.#disposed = true; }
}

/** The description of an avatar's appearance. */
function avatars(operation: string): CnaAvatarBackend {
  const backend = getBackend().Avatars;
  if (!backend) {
    throw new NativeUnavailableError(
      `${operation} requires a CNA backend with the avatar routes; ` +
      "load the Node-API backend with LoadNodeNativeBackend",
    );
  }
  return backend;
}

export class AvatarDescription {
  static readonly #changed = new EventDispatcher<unknown, EventArgs>();
  #bodyType = AvatarBodyType.Male;
  #description: Uint8Array = new Uint8Array(0);
  #height = 0;
  #isValid = false;

  /** Copies what CNA read out of the bytes onto a description. */
  static #apply(target: AvatarDescription, snapshot: AvatarDescriptionSnapshot): void {
    target.#bodyType = snapshot.BodyType as AvatarBodyType;
    target.#description = new Uint8Array(snapshot.Description);
    target.#height = snapshot.Height;
    target.#isValid = snapshot.IsValid;
  }

  public constructor(data: number[]) {
    if (data == null) throw new TypeError("data is required");
    // The canonical constructor takes exactly one description's worth of bytes and refuses
    // anything else; CNA enforces the same count, and its refusal is passed through rather than
    // pre-empted with a number written down twice. This used to accept any length and report a
    // body type it had invented; it now reads what the bytes actually say.
    AvatarDescription.#apply(this, avatars("new AvatarDescription()")
      .createAvatarDescription(Uint8Array.from(data)));
  }

  /** Raised when the avatar the description came from changes. */
  public readonly Changed: XnaEvent<unknown, EventArgs> = AvatarDescription.#changed;

  /** Whether the description is a male or female body. */
  public get BodyType(): AvatarBodyType { return this.#bodyType; }
  /** The description's own bytes, copied. */
  public get Description(): number[] { return Array.from(this.#description); }
  /** The avatar's height in metres. */
  public get Height(): number { return this.#height; }
  /**
   * Whether the description bytes describe a usable avatar.
   *
   * Decided by the description's first byte, which is CNA's answer rather than "is it non-empty":
   * a full-length description can still be an unusable one.
   */
  public get IsValid(): boolean { return this.#isValid; }

  /** Begins reading a gamer's avatar description. */
  public static BeginGetFromGamer(
    gamer: Gamer, callback: AsyncCallback, state: unknown,
  ): IAsyncResult { return requirePlatform(); }

  /** Completes a `BeginGetFromGamer` operation. */
  public static EndGetFromGamer(result: IAsyncResult): AvatarDescription { return requirePlatform(); }

  /** Makes a random avatar description. */
  public static CreateRandom(): AvatarDescription;
  /** Makes a random avatar description of one body type. */
  public static CreateRandom(bodyType: AvatarBodyType): AvatarDescription;
  /**
   * Makes a "random" avatar description.
   *
   * **It is not random, and that is XNA's behaviour rather than a limitation here.** XNA 4.0's own
   * implementation never randomises anything: it returns an all-zero — and therefore
   * {@link IsValid}-false — description, and the `bodyType` overload validates its argument and
   * then ignores it. CNA reproduces both deliberately, saying so in its source, and this projects
   * what CNA does rather than inventing the variety the name implies.
   *
   * What it does need is nothing: no gamer, no sign-in and no service, which is why it answers
   * where the rest of the avatar surface still refuses.
   */
  public static CreateRandom(bodyType?: AvatarBodyType): AvatarDescription {
    if (bodyType !== undefined
      && bodyType !== AvatarBodyType.Male && bodyType !== AvatarBodyType.Female) {
      throw new ArgumentOutOfRangeException("bodyType");
    }
    // Built through the ordinary constructor rather than around it: CNA generates the bytes, and
    // the constructor is what reads a body type, a height and a validity out of them. One path
    // into a description means one place where those three can disagree with the bytes: none.
    // The body type is checked above and then dropped, because CNA's own overload checks it and
    // drops it too -- XNA's behaviour. Sending it would import a second route that cannot change
    // the answer.
    const generated = avatars("AvatarDescription.CreateRandom")
      .createRandomAvatarDescription();
    return new AvatarDescription(Array.from(generated.Description));
  }

}

/** Draws an avatar. */
export class AvatarRenderer implements IDisposable {
  /** How many bones the avatar skeleton has. */
  public static readonly BoneCount = 71;

  #ambientLightColor = Vector3.Zero;
  #lightColor = Vector3.One;
  #lightDirection = Vector3.Down;
  #projection = Matrix.Identity;
  #view = Matrix.Identity;
  #world = Matrix.Identity;
  #disposed = false;

  public constructor(avatarDescription: AvatarDescription);
  public constructor(avatarDescription: AvatarDescription, useLoadingEffect: boolean);
  public constructor(avatarDescription: AvatarDescription, useLoadingEffect?: boolean) {
    requirePlatform();
  }

  /** The ambient light the avatar is lit with. */
  public get AmbientLightColor(): Vector3 { return new Vector3(this.#ambientLightColor.X, this.#ambientLightColor.Y, this.#ambientLightColor.Z); }
  public set AmbientLightColor(value: Vector3) { this.#ambientLightColor = new Vector3(value.X, value.Y, value.Z); }
  /** The avatar's bind pose. */
  public get BindPose(): ReadonlyArray<Matrix> { return requirePlatform(); }
  /** Whether the renderer has been released. */
  public get IsDisposed(): boolean { return this.#disposed; }
  /** The directional light colour. */
  public get LightColor(): Vector3 { return new Vector3(this.#lightColor.X, this.#lightColor.Y, this.#lightColor.Z); }
  public set LightColor(value: Vector3) { this.#lightColor = new Vector3(value.X, value.Y, value.Z); }
  /** The directional light direction. */
  public get LightDirection(): Vector3 { return new Vector3(this.#lightDirection.X, this.#lightDirection.Y, this.#lightDirection.Z); }
  public set LightDirection(value: Vector3) { this.#lightDirection = new Vector3(value.X, value.Y, value.Z); }
  /** Each bone's parent index. */
  public get ParentBones(): ReadonlyArray<number> { return requirePlatform(); }
  /** The projection matrix. */
  public get Projection(): Matrix { return this.#projection; }
  public set Projection(value: Matrix) { this.#projection = value; }
  /** Whether the avatar has finished loading. */
  public get State(): AvatarRendererState { return AvatarRendererState.Unavailable; }
  /** The view matrix. */
  public get View(): Matrix { return this.#view; }
  public set View(value: Matrix) { this.#view = value; }
  /** The world matrix. */
  public get World(): Matrix { return this.#world; }
  public set World(value: Matrix) { this.#world = value; }

  /** Draws the avatar in an explicit pose. */
  public Draw(bones: Array<Matrix>, expression: AvatarExpression): void;
  /** Draws the avatar in an animation's current pose. */
  public Draw(animation: IAvatarAnimation): void;
  public Draw(..._values: readonly unknown[]): void { requirePlatform(); }

  /** Releases the renderer. See the note on `AvatarAnimation.Dispose` about `Dispose(bool)`. */
  public Dispose(): void { this.#disposed = true; }
}
