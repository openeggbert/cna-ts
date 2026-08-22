import * as XnaFramework from "./Microsoft/Xna/Framework/index.js";

export * from "./Microsoft/Xna/Framework/index.js";

/** Runtime namespace projection matching Microsoft.Xna.Framework.*. */
export const Microsoft = Object.freeze({
  Xna: Object.freeze({
    Framework: Object.freeze({ ...XnaFramework }),
  }),
});
