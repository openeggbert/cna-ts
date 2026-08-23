import { ArgumentOutOfRangeException } from "../../../../internal/exceptions.js";
import { Vector3 } from "../Vector3.js";

function copy(value: Vector3): Vector3 {
  if (value == null) throw new TypeError("value cannot be null");
  return new Vector3(value.X, value.Y, value.Z);
}

export class AudioListener {
  #position = Vector3.Zero;
  #velocity = Vector3.Zero;
  #forward = Vector3.Forward;
  #up = Vector3.Up;

  public constructor() {}

  public get Forward(): Vector3 { return copy(this.#forward); }
  public set Forward(value: Vector3) { this.#forward = copy(value); }
  public get Position(): Vector3 { return copy(this.#position); }
  public set Position(value: Vector3) { this.#position = copy(value); }
  public get Up(): Vector3 { return copy(this.#up); }
  public set Up(value: Vector3) { this.#up = copy(value); }
  public get Velocity(): Vector3 { return copy(this.#velocity); }
  public set Velocity(value: Vector3) { this.#velocity = copy(value); }
}

export class AudioEmitter {
  #dopplerScale = Math.fround(1);
  #position = Vector3.Zero;
  #velocity = Vector3.Zero;
  #forward = Vector3.Forward;
  #up = Vector3.Up;

  public constructor() {}

  public get DopplerScale(): number { return this.#dopplerScale; }
  public set DopplerScale(value: number) {
    if (value < 0) throw new ArgumentOutOfRangeException("value");
    this.#dopplerScale = Math.fround(value);
  }
  public get Forward(): Vector3 { return copy(this.#forward); }
  public set Forward(value: Vector3) { this.#forward = copy(value); }
  public get Position(): Vector3 { return copy(this.#position); }
  public set Position(value: Vector3) { this.#position = copy(value); }
  public get Up(): Vector3 { return copy(this.#up); }
  public set Up(value: Vector3) { this.#up = copy(value); }
  public get Velocity(): Vector3 { return copy(this.#velocity); }
  public set Velocity(value: Vector3) { this.#velocity = copy(value); }
}
