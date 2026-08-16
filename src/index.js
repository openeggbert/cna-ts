import {
  bindingsAvailable,
  NativeUnavailableError,
} from "./internal/native.js";
import * as XnaFramework from "./Microsoft/Xna/Framework/index.js";

export { NativeUnavailableError };
export { bindingsAvailable };

/** XNA 4.0-compatible namespace tree. */
export const Microsoft = Object.freeze({
  Xna: Object.freeze({
    Framework: XnaFramework,
  }),
});
