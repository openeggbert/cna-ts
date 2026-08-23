import * as Resources from "../../../../Resources/index.js";
import { ArgumentNullException } from "../../../../internal/exceptions.js";
import type { IServiceProvider } from "../Contracts.js";
import { ContentLoadException } from "./ContentLoadException.js";
import { ContentManager } from "./ContentManager.js";

export class ResourceContentManager extends ContentManager {
  readonly #resourceManager: Resources.ResourceManager;

  public constructor(serviceProvider: IServiceProvider, resourceManager: Resources.ResourceManager) {
    super(serviceProvider);
    if (resourceManager == null) throw new ArgumentNullException("resourceManager");
    this.#resourceManager = resourceManager;
  }

  protected override OpenStream(assetName: string): Uint8Array {
    if (assetName == null) throw new ArgumentNullException("assetName");
    const value = this.#resourceManager.GetObject(assetName);
    if (value == null) throw new ContentLoadException(`Resource '${assetName}' was not found`);
    if (!(value instanceof Uint8Array)) {
      throw new ContentLoadException(`Resource '${assetName}' is not stored as bytes`);
    }
    return new Uint8Array(value);
  }
}
