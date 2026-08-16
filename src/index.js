import * as CnaFramework from "./CNA/Framework/index.js";
import {
  bindingsAvailable,
  NativeUnavailableError,
} from "./internal/native.js";
import * as XnaFramework from "./Microsoft/Xna/Framework/index.js";

export { NativeUnavailableError };

/** CNA-native namespace tree. */
export const CNA = Object.freeze({
  Framework: CnaFramework,
  Interop: Object.freeze({ bindingsAvailable }),
});

/** XNA 4.0-compatible namespace tree. */
export const Microsoft = Object.freeze({
  Xna: Object.freeze({
    Framework: XnaFramework,
  }),
});
