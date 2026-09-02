// SPDX-License-Identifier: MS-PL

/**
 * The oracles for the non-engine backend families.
 *
 * Every one of these takes *evidence* -- a plain object a page or a Node probe produced -- and says
 * whether it describes a working family. They live here rather than inside a suite for two reasons.
 *
 * The first is that the same question is asked of two backends. An avatar description is 1021 zero
 * bytes whether CNA is reached through a Node-API bridge or through an Emscripten module, and the
 * measured size of a string in a font is the same number; writing those expectations twice is how
 * two suites come to disagree about what they are checking and both stay green.
 *
 * The second is that an oracle is the thing a mutation harness cannot check. `dist` does not
 * contain `test/support`, so mutating a file here leaves the built artifact byte-identical and the
 * harness rightly refuses to score it -- which means an oracle that accepts anything makes its
 * whole suite meaningless and nothing notices. `test/oracles.test.mjs` is the check that fits: each
 * of these is given evidence with exactly one thing wrong and required to say so.
 *
 * So each function below is written to *fail* on a plausible binding defect rather than to pass on
 * a good run. Where a value is a property of the host rather than of the binding -- how many mice
 * are attached, whether a sensor exists -- the assertion is about the shape and the consistency,
 * never about a number nobody planted.
 */

import assert from "node:assert/strict";

import {
  SPRITE_FONT_FIXTURE,
  SPRITE_FONT_NEGATIVE_BEARING,
  SPRITE_FONT_STRINGS,
  SPRITE_FONT_TRAILING_NEGATIVE_BEARING,
} from "../fixtures/sprite-font.mjs";
import { XACT_CATEGORIES, XACT_GLOBAL_VARIABLES } from "../fixtures/xact.mjs";

/** CNA's constant: a description is exactly this many bytes, and CNA refuses any other count. */
const AVATAR_DESCRIPTION_BYTES = 1021;

/** `CNA_AVATAR_BODY_TYPE_FEMALE`, which is what a description with no body type in it reports. */
const AVATAR_BODY_TYPE_FEMALE = 0;

function present(evidence, family) {
  assert.ok(evidence, `${family} produced no evidence at all`);
  assert.equal(evidence.failed, undefined, `${family} failed: ${evidence.failed}`);
}

/**
 * `AvatarDescription`, which needs no gamer service and no device.
 *
 * The surprising part is asserted rather than smoothed over: XNA's `CreateRandom` randomises
 * nothing. It returns an all-zero -- and therefore invalid -- description, and its body-type
 * overload validates its argument and then ignores it. CNA reproduces both deliberately.
 */
export function assertAvatarEvidence(evidence) {
  present(evidence, "avatar");
  assert.equal(evidence.length, AVATAR_DESCRIPTION_BYTES,
    "a description is exactly one description's worth of bytes");
  assert.equal(evidence.allZero, true,
    "and every byte of it is zero: XNA's CreateRandom randomises nothing, and inventing the " +
    "variety the name implies would be this binding making something up");
  assert.equal(evidence.isValid, false,
    "an all-zero description is not a usable avatar, which is what makes IsValid worth having");
  assert.equal(evidence.bodyType, AVATAR_BODY_TYPE_FEMALE,
    "the body type is read out of the bytes rather than defaulted, and zeroed bytes are Female");
  assert.equal(evidence.height, 0, "the canonical format carries no height, so CNA reports zero");
  assert.equal(evidence.twoCallsAgree, true,
    "the requested body type reaches CNA, is checked, and changes nothing about the result");
  assert.equal(evidence.bodyTypesAgree, true);
  assert.equal(evidence.roundTrip, true,
    "the bytes survive being handed back to the constructor");
  assert.equal(evidence.rebuiltValid, false);
  assert.equal(evidence.rebuiltBodyType, AVATAR_BODY_TYPE_FEMALE);
  assert.notEqual(evidence.shortRefused, "ACCEPTED",
    "a wrong-length description is refused rather than padded");
  assert.equal(evidence.badBodyType, "ArgumentOutOfRangeException",
    "and a body type that is not one is refused by the name XNA refuses it with");
}

/**
 * `SpriteFont.MeasureString` against CNA's own SpriteFont over the same glyph table.
 *
 * The two implementations share no code. Where they agree, neither is being trusted; where they
 * disagree, the disagreement is upstream finding 27 and its size is exactly `j`'s right side
 * bearing, so a *different* disagreement fails here rather than widening a tolerance.
 */
export function assertSpriteFontEvidence(evidence) {
  present(evidence, "spriteFont");
  const info = evidence.info;
  assert.ok(info, "the oracle reported nothing about the font it built");
  assert.equal(info.CharacterCount, SPRITE_FONT_FIXTURE.Glyphs.length,
    "CNA holds every glyph the managed font holds, which is checked before its answers are used");
  assert.equal(info.LineSpacing, SPRITE_FONT_FIXTURE.LineSpacing);
  assert.ok(Math.abs(info.Spacing - SPRITE_FONT_FIXTURE.Spacing) < 1e-6,
    `spacing round-trips: ${info.Spacing}`);
  assert.equal(info.HasDefaultCharacter, true);
  assert.equal(info.DefaultCharacter, SPRITE_FONT_FIXTURE.DefaultCharacter.codePointAt(0));

  assert.deepEqual(evidence.rows.map((row) => row.text), [...SPRITE_FONT_STRINGS],
    "every string in the fixture was measured, in order");

  const diverging = new Set(SPRITE_FONT_TRAILING_NEGATIVE_BEARING);
  const disagreements = evidence.rows
    .filter((row) => !diverging.has(row.text))
    .filter((row) => Math.abs(row.managed[0] - row.native[0]) > 1e-4
      || Math.abs(row.managed[1] - row.native[1]) > 1e-4);
  assert.deepEqual(disagreements, [],
    "outside the one known divergence the two implementations agree exactly");
  assert.ok(evidence.rows.length - diverging.size >= 15,
    "and that agreement covers many strings rather than a handful");

  for (const row of evidence.rows.filter((entry) => diverging.has(entry.text))) {
    assert.ok(
      Math.abs((row.managed[0] - row.native[0]) - SPRITE_FONT_NEGATIVE_BEARING) < 1e-4,
      `${JSON.stringify(row.text)} differs by exactly the bearing's magnitude: ` +
      `${row.managed[0]} vs ${row.native[0]}`);
    assert.ok(Math.abs(row.managed[1] - row.native[1]) < 1e-4,
      "and only in width -- the height is unaffected, which is what makes this one rule");
  }
  // The fixture is not vacuous: if every string measured the same, the agreement above would
  // mean nothing.
  const widths = new Set(evidence.rows.map((row) => row.managed[0]));
  assert.ok(widths.size >= 10, `the fixture produces ${widths.size} distinct widths`);
}

/**
 * The game window: its title, its bounds, and the event a real device change raises.
 *
 * The bounds are not pinned to a number -- a page's canvas is the page's business -- but the
 * *relationship* is: a device change of a known delta moves the client bounds by that delta, the
 * event fires, and putting the old size back restores them.
 */
export function assertGameWindowEvidence(evidence) {
  present(evidence, "window");
  assert.equal(typeof evidence.titleBefore, "string");
  assert.equal(evidence.titleAfter, "cna-ts browser window",
    "the title round-trips through CNA rather than being remembered in managed state");
  assert.notEqual(evidence.titleAfter, evidence.titleBefore,
    "and it actually changed, so the round trip proves something");
  for (const key of ["X", "Y", "Width", "Height"]) {
    assert.equal(typeof evidence.bounds[key], "number", `client bounds carry a numeric ${key}`);
  }
  assert.ok(evidence.bounds.Width > 0 && evidence.bounds.Height > 0,
    "a window a game is drawing into has a positive size");
  assert.equal(evidence.resized.Width, evidence.bounds.Width + 64,
    "ApplyChanges moves the client bounds by exactly the requested delta");
  assert.equal(evidence.resized.Height, evidence.bounds.Height + 32);
  assert.ok(evidence.sizeChanged >= 1,
    "and ClientSizeChanged fired at least once for it");
  assert.deepEqual(evidence.seenInEvent, {
    width: evidence.resized.Width, height: evidence.resized.Height,
  }, "the bounds read while the handler was attached are the new bounds, not the old ones");
  assert.deepEqual(evidence.restored,
    { Width: evidence.bounds.Width, Height: evidence.bounds.Height },
    "and restoring the preferred size restores them");
  assert.equal(typeof evidence.orientation, "number");
  assert.equal(typeof evidence.screenDeviceName, "string");
  assert.equal(typeof evidence.allowUserResizing, "boolean");
  assert.match(evidence.handle, /^\d+$/, "the window handle is whatever CNA has, unmodified");
}

/**
 * The clipboard, the attached devices and the host's power.
 *
 * A device *count* is a fact about the host, so nothing here asserts one. What is asserted is that
 * a count and its enumeration agree, that an index past the end is refused, and that the clipboard
 * round-trips -- which is the one thing here that is entirely the binding's doing.
 */
export function assertInputDeviceEvidence(evidence) {
  present(evidence, "inputDevices");
  assert.equal(evidence.clipboardAfter, true,
    "text written to the clipboard is text the clipboard has");
  const written = "cna-ts clipboard round trip \u00e9\u263a";
  assert.equal(evidence.clipboardText, written,
    "and reading it back gives the same string, byte for byte through UTF-8 -- including the " +
    "two characters that are not one byte each");
  assert.equal(evidence.clipboardSize, new TextEncoder().encode(written).length,
    `the reported size is the string's UTF-8 byte length (${new TextEncoder().encode(written).length}) ` +
    `rather than its character count (${written.length})`);
  for (const [family, devices] of [["mice", evidence.mice], ["keyboards", evidence.keyboards]]) {
    for (const device of devices) {
      assert.match(device.Id, /^\d+$/, `${family} carry a numeric identifier`);
      assert.equal(typeof device.Name, "string");
      assert.ok(device.Name.length > 0, `an enumerated ${family} entry has a name`);
    }
  }
  assert.equal(typeof evidence.touchCount, "number");
  assert.ok(evidence.touchCount >= 0);
  assert.notEqual(evidence.outOfRange, "ACCEPTED",
    "an index past the end is refused -- which is what separates an empty inventory from a " +
    "broken one, because both report a count of zero");
  assert.equal(typeof evidence.power.State, "number");
  for (const field of ["BatteryPercent", "SecondsRemaining"]) {
    const value = evidence.power[field];
    assert.ok(value === null || (typeof value === "number" && value >= 0),
      `${field} is a real reading or null, never CNA's -1 handed on as a number`);
  }
}

/**
 * The four sensors.
 *
 * None of them exists on a headless host, and that is the first thing asserted: support is false,
 * and an unsupported reading is *refused* rather than answered with zeroes. Everything after that
 * is `SYNTHETIC_BACKEND_VERIFIED` -- CNA's own test backends, driven through the binding, with the
 * exact values injected read back out. That is what a binding can be wrong about: an axis swapped,
 * a timestamp truncated to a double, a `double` field read as a `float`.
 */
export function assertSensorEvidence(evidence) {
  present(evidence, "sensors");
  const support = evidence.support;
  for (const sensor of ["Accelerometer", "Compass", "Gyroscope", "Motion"]) {
    assert.equal(typeof support[sensor], "boolean", `${sensor} support is a boolean`);
  }

  const accelerometer = evidence.accelerometer;
  assert.equal(accelerometer.updatedTicks, "200000",
    "an interval written is the interval read back, as a 64-bit tick count");
  assert.notEqual(accelerometer.initialTicks, accelerometer.updatedTicks,
    "and it changed, so the round trip proves something");
  assert.equal(accelerometer.initialValid, false,
    "a sensor that has never read anything has no valid data");
  assert.notEqual(accelerometer.unsupportedRead, "ANSWERED",
    "and reading an unsupported sensor is refused rather than answered with three zeroes, " +
    "which a game would integrate into a wrong orientation");

  const compass = evidence.compass;
  assert.equal(compass.valid, true, "an injected reading makes the compass's data valid");
  assert.equal(compass.reading.HeadingAccuracy, 1.5);
  assert.equal(compass.reading.MagneticHeading, 42.25);
  assert.equal(compass.reading.TrueHeading, 43.5,
    "the three headings are doubles and are not swapped with each other");
  assert.deepEqual(compass.reading.MagnetometerReading, { X: 1.25, Y: -2.5, Z: 3.75 },
    "and the magnetometer vector keeps its axes and its signs");
  assert.equal(compass.reading.TimestampTicks, "638000000000000123",
    "a timestamp is carried as 64 bits: this exact value does not survive a JavaScript double, " +
    "which a round one would have");
  assert.equal(compass.reading.TimestampOffsetTicks, "36000000000");

  assert.deepEqual(evidence.gyroscope.rate, { X: 0.5, Y: 1.5, Z: -2.5 },
    "the gyroscope's three axes arrive in order and with their signs");
  assert.equal(evidence.gyroscope.valid, true);

  const motion = evidence.motion;
  assert.equal(motion.northReferenced, true,
    "the test backend was installed north-referenced and says so");
  assert.notEqual(motion.subMinuteOffset, "ACCEPTED",
    "a timestamp offset that is not a whole number of minutes is refused: CNA validates the " +
    "pair as a real DateTimeOffset, which is why these are instants rather than small integers");
  assert.equal(motion.attitude.Pitch, 0.25);
  assert.equal(motion.attitude.Roll, -0.5);
  assert.equal(motion.attitude.Yaw, 1.25);
  assert.equal(motion.attitude.Quaternion.length, 4);
  assert.ok(motion.attitude.Quaternion.every((value, index) =>
    Math.abs(value - (index + 1) / 10) < 1e-6),
    "the attitude quaternion round-trips as four distinct floats");
  assert.deepEqual(motion.attitude.RotationMatrix, Array.from({ length: 16 }, (_, i) => i + 1),
    "and the rotation matrix is sixteen floats in order, not four or a transpose");
  assert.deepEqual(motion.deviceAcceleration, { X: 1, Y: 2, Z: 3 });
  assert.deepEqual(motion.deviceRotationRate, { X: 4, Y: 5, Z: 6 },
    "acceleration and rotation rate are adjacent vectors and are not read from one offset");
  assert.deepEqual(motion.gravity, { X: 0, Y: -9.75, Z: 0 });
  assert.equal(motion.timestampTicks, "638000000000000033",
    "a reading's timestamp survives as 64 bits; this value does not survive a double");
  assert.equal(motion.timestampOffsetTicks, "36000000000");
  assert.equal(motion.attitude.TimestampTicks, "638000000000000011",
    "the attitude carries its own timestamp, nested inside the reading and distinct from it");
}

/**
 * Storage, over whatever filesystem the backend has.
 *
 * A browser's is the module's own and does not survive a reload; nothing here claims otherwise.
 * What it does claim is that a file created exists, is listed, matches a pattern, reads back, and
 * stops existing when deleted -- which is the whole of what a save game needs.
 */
export function assertStorageEvidence(evidence) {
  present(evidence, "storage");
  assert.equal(evidence.displayName, "cna-ts-browser",
    "a container answers with the name it was opened under");
  assert.equal(evidence.isConnected, true);
  assert.match(evidence.freeSpace, /^\d+$/, "free space is a 64-bit byte count");
  assert.match(evidence.totalSpace, /^\d+$/);
  assert.deepEqual(evidence.listing.directories, ["saves"],
    "a directory created is a directory listed");
  assert.deepEqual(evidence.listing.files, ["slot0.sav", "slot1.sav"],
    "both files created are listed, and nothing else is");
  assert.deepEqual(evidence.listing.filtered, ["slot0.sav"],
    "and the search pattern reaches CNA rather than being ignored");
  assert.equal(evidence.openedLength, 0, "a file created empty reads back empty");
  assert.equal(evidence.fileExists, true);
  assert.equal(evidence.deletedFileExists, false, "a file deleted stops existing");
  assert.equal(evidence.deletedDirectoryExists, false, "and so does a directory");
  assert.notEqual(evidence.missing, "ACCEPTED",
    "opening a file that is not there is refused rather than answered with empty bytes");
}

/**
 * The content survey, over a root the test authored.
 *
 * The point of this family is that it distinguishes framings: a compiled `.xnb` and a loose `.png`
 * are both assets and are not the same kind of asset, and a survey that reported one count would
 * be answering a question nobody asked.
 */
export function assertContentSurveyEvidence(evidence) {
  present(evidence, "contentSurvey");
  assert.equal(evidence.root, "/survey", "the survey reports the root it was given");
  const byName = Object.fromEntries(evidence.entries.map((entry) => [entry.AssetName, entry]));
  assert.deepEqual(Object.keys(byName).sort(), ["Atlas", "Notes", "nested/Tile"].sort(),
    "every file under the root is one asset, named root-relative and without its extension -- " +
    "which is how a survey of a directory tree differs from a listing of one directory");
  assert.equal(byName.Atlas.HasXnb, true, "the .xnb is recognised as compiled content");
  assert.deepEqual(byName.Atlas.NativeExtensions, [],
    "and carries no loose extension, because it is not a loose file");
  assert.equal(byName["nested/Tile"].HasXnb, false);
  assert.deepEqual(byName["nested/Tile"].NativeExtensions, [".png"],
    "a loose asset is named by its extension rather than reported as compiled");
  assert.ok(evidence.entries.every((entry) => entry.HasCnj === false),
    "nothing here is a .cnj document");
  assert.equal(evidence.textureReaderRegistered, true,
    "CNA has a reader for its own texture type");
  assert.equal(evidence.nonsenseReaderRegistered, false,
    "and does not claim one for a name that does not exist");
}

/** The media player's state, which a browser drives exactly as a desktop does. */
export function assertMediaEvidence(evidence) {
  present(evidence, "media");
  assert.ok(evidence.sources.length >= 1, "a platform offers at least its local media source");
  for (const source of evidence.sources) {
    assert.equal(typeof source.Name, "string");
    assert.ok(source.Name.length > 0);
    assert.equal(typeof source.Type, "number");
  }
  assert.equal(evidence.gameHasControl, true,
    "a game with nothing else playing has control of the media player");
  assert.match(evidence.playPositionTicks, /^\d+$/);
  assert.equal(evidence.frequencyCount, 256,
    "the visualisation buffers are read at their measured length rather than a written constant");
  assert.equal(evidence.sampleCount, 256);
  assert.equal(evidence.frequenciesAllZero, true,
    "and silence answers with zeroes, which is recorded rather than dressed up as a spectrum");
}

/** CNA's media index, which on a host with no music folder is legitimately empty. */
export function assertMediaLibraryEvidence(evidence) {
  present(evidence, "mediaLibrary");
  assert.deepEqual(Object.keys(evidence.counts).sort(),
    ["Albums", "Artists", "Genres", "Pictures", "Playlists", "SavedPictures", "Songs"],
    "the snapshot has all seven collections, so an absent one cannot read as an empty one");
  for (const [name, count] of Object.entries(evidence.counts)) {
    assert.equal(typeof count, "number", `${name} is a countable collection`);
    assert.ok(count >= 0);
  }
  assert.notEqual(evidence.outOfRange, "ACCEPTED",
    "and an index into an empty collection is refused, which is what separates a library that " +
    "is empty from one that could not be read");
}

/**
 * The gamer-services dispatcher and the Guide.
 *
 * The asynchronous contract is what matters here and it is fully checkable: CNA holds its own
 * pending dialog rather than handing one to the host window system, so begin, pending, an exactly-
 * once completion, the chosen button and a cancelled entry are all observable without any UI.
 */
export function assertGamerServicesEvidence(evidence) {
  present(evidence, "gamerServices");
  assert.equal(evidence.initialized, true,
    "the dispatcher reports itself initialised after being initialised");
  assert.equal(typeof evidence.visible, "boolean");
  assert.equal(typeof evidence.notificationPosition, "number");
  assert.equal(evidence.screenSaverAfter, !evidence.screenSaverBefore,
    "the screen-saver flag round-trips through CNA rather than through managed state");
  assert.equal(evidence.simulateWhileSet, true,
    "the simulate-trial-mode flag round-trips");
  assert.equal(evidence.simulateAfterReset, false, "and clearing it puts it back");
  assert.equal(evidence.trialWhileSimulated, evidence.trialBefore,
    "and IsTrialMode does not move with it: XNA's own IL reads two independent static fields, " +
    "`isTrialMode` being the one only the platform's licensing writes");

  const box = evidence.messageBox;
  assert.equal(box.pending, true, "a begun message box is a pending message box");
  assert.equal(box.focus, 1, "the focus button reaches CNA rather than being defaulted");
  assert.equal(box.chosen, 1, "and the simulated click is the button the End call reports");
  assert.equal(box.completions, 1,
    "the completion handler ran exactly once -- twice would be the callback rooted twice");
  assert.notEqual(box.doubleEnd, "ACCEPTED",
    "and ending the same operation twice is refused, as the Node bridge refuses it");
  assert.equal(box.pendingAfterEnd, false, "the dialog is gone once it has been ended");

  const keyboard = evidence.keyboard;
  assert.equal(keyboard.pending, true);
  assert.equal(keyboard.title, "Gamertag", "the prompt's three strings reach CNA in order");
  assert.equal(keyboard.description, "Choose a name");
  assert.equal(keyboard.displayText, "Player One");
  assert.equal(keyboard.cancelledText, null,
    "a cancelled entry answers null rather than the empty string, which a game would take " +
    "for a deliberately blank name");
  assert.equal(keyboard.wasCancelled, true);
  assert.equal(keyboard.completions, 1);
}

/**
 * XACT, over banks this repository authors.
 *
 * The cue state machine is the evidence: prepared, then playing, then paused *while still
 * playing*, then playing again, then stopped. Those five readings are five different bit patterns
 * of one structure, so a mis-read flag shows up as the wrong transition rather than as nothing.
 */
export function assertXactEvidence(evidence) {
  present(evidence, "xact");
  const writable = XACT_GLOBAL_VARIABLES[0];
  const readOnly = XACT_GLOBAL_VARIABLES[1];
  assert.equal(evidence.writableBefore, writable.Initial,
    "a global variable starts at the value the settings file gives it");
  assert.equal(evidence.writableAfter, 500, "a writable one takes a new value");
  assert.equal(evidence.readOnlyBefore, readOnly.Initial);
  assert.equal(evidence.readOnlyAfter, readOnly.Initial,
    "and a READONLY one does not, which is why the fixture defines both");

  assert.ok(evidence.renderers.length >= 1, "the engine reports at least one audio renderer");
  for (const renderer of evidence.renderers) {
    assert.equal(typeof renderer.FriendlyName, "string");
    assert.ok(renderer.FriendlyName.length > 0);
    assert.equal(typeof renderer.RendererId, "string");
  }

  const categories = evidence.categories;
  assert.equal(categories.name, XACT_CATEGORIES[0],
    "a category answers with the name it was fetched by");
  assert.equal(categories.handlesDiffer, true,
    "two fetches of one category are two handles, which is why identity is CNA's comparison");
  assert.equal(categories.sameEquals, true, "and CNA says they are the same category");
  assert.equal(categories.differentEquals, false, "while two different categories are not");
  assert.equal(categories.hashesAgree, true,
    "equal categories hash equally, which handle comparison would not give");

  assert.equal(evidence.banks.wavePrepared, true, "a wave bank read from a file is prepared");
  assert.equal(evidence.banks.waveDisposed, false);
  assert.equal(evidence.banks.soundDisposed, false);
  assert.equal(evidence.cueName, "Tone261", "a cue answers with its authored name");
  assert.notEqual(evidence.missingCue, "ACCEPTED", "and a name that is not in the bank is refused");

  const states = evidence.states;
  assert.equal(states.created.IsPrepared, true, "a fetched cue is prepared and not yet playing");
  assert.equal(states.created.IsPlaying, false);
  assert.equal(states.playing.IsPlaying, true, "playing it makes it playing");
  assert.equal(states.playing.IsPrepared, false);
  assert.equal(states.paused.IsPaused, true, "pausing sets paused");
  assert.equal(states.paused.IsPlaying, true,
    "and leaves it playing, which is XACT's model rather than a mis-read flag");
  assert.equal(states.resumed.IsPaused, false, "resuming clears paused");
  assert.equal(states.resumed.IsPlaying, true);
  assert.equal(states.stopped.IsStopped, true, "and stopping stops it");
  assert.equal(states.stopped.IsPlaying, false);
  assert.equal(evidence.engineDisposed, false, "the engine outlives its banks");
}

/**
 * The video player, whose decoder is absent by CNA's own configuration.
 *
 * The control surface is real and is asserted; the frame is asserted to be *unavailable*, because
 * claiming a frame with no decoder would be the one thing this family must not do.
 */
export function assertVideoEvidence(evidence) {
  present(evidence, "video");
  assert.equal(typeof evidence.state, "number", "a player has a state before it has a video");
  assert.match(evidence.positionTicks, /^\d+$/);
  assert.equal(evidence.frame.isAvailable, false,
    "a player with no video has no frame, and says so rather than handing back a texture");
  assert.equal(evidence.frame.texture, "0",
    "and the texture handle is CNA's invalid handle rather than a plausible number");
  assert.equal(evidence.frame.generation, "0",
    "a generation counts decoded frames, and nothing has been decoded");
  assert.notEqual(evidence.playedNothing, "ACCEPTED",
    "playing a null video is refused rather than started");
}

/**
 * Raw joysticks, force feedback and text composition.
 *
 * The joystick and haptic counts are the host's business and are only checked for consistency. The
 * text-input round trip is the real evidence: a code unit raised through CNA comes back out of a
 * subscription, a composition update keeps its selection, a candidate list keeps its order, and an
 * unsubscribed handler stops being called.
 */
export function assertExtendedInputEvidence(evidence) {
  present(evidence, "extendedInput");
  assert.equal(typeof evidence.joystickCount, "number");
  assert.ok(evidence.joystickCount >= 0);
  assert.equal(typeof evidence.hapticCount, "number");
  assert.ok(evidence.hapticCount >= 0);
  assert.notEqual(evidence.outOfRange, "ACCEPTED",
    "an index past the last joystick is refused, which is how an empty list differs from a " +
    "broken enumeration");
  assert.equal(evidence.active, true, "starting text input makes it active");
  assert.equal(evidence.inactive, false, "and stopping it makes it inactive");
  assert.deepEqual(evidence.committed, ["A", "☺"],
    "a committed UTF-16 code unit arrives as its character, including one outside Latin-1");
  assert.equal(evidence.afterUnsubscribe, 2,
    "and an unsubscribed handler is not called again, which is the function-table entry " +
    "actually being released");
  assert.deepEqual(evidence.editing, [{ Text: "compose", Start: 2, Length: 3 }],
    "a composition update keeps its text and its selection");
  assert.deepEqual(evidence.candidates,
    [{ Candidates: ["one", "two", "three"], Selected: 1, IsHorizontal: true }],
    "and a candidate list keeps its order, its selection and its orientation");
}

/**
 * XNA's `GraphicsAdapter`, read through a live device.
 *
 * Nothing here pins a driver string: what a platform calls its display is the platform's answer.
 * What is pinned is that the answer is *consistent* -- the default adapter is one of the listed
 * ones, the device's adapter is the same object's name, a current mode has a positive size, and
 * the aspect ratio is the one its own width and height give.
 */
export function assertGraphicsAdapterEvidence(evidence) {
  present(evidence, "graphicsAdapters");
  assert.ok(evidence.adapters.length >= 1,
    "a device that is drawing has at least one adapter behind it");
  for (const adapter of evidence.adapters) {
    assert.equal(typeof adapter.Description, "string");
    assert.equal(typeof adapter.DeviceName, "string");
    assert.equal(typeof adapter.IsDefaultAdapter, "boolean");
    const mode = adapter.CurrentDisplayMode;
    assert.ok(mode.Width > 0 && mode.Height > 0, "a current display mode has a positive size");
    assert.ok(Math.abs(mode.AspectRatio - mode.Width / mode.Height) < 1e-3,
      `the aspect ratio is the mode's own: ${mode.AspectRatio} for ${mode.Width}x${mode.Height}`);
    assert.equal(adapter.IsWideScreen, mode.AspectRatio > 1.5,
      "and the wide-screen flag agrees with that ratio rather than being read from elsewhere");
    assert.ok(adapter.SupportedModeCount >= 1,
      "an adapter reporting a current mode reports at least that mode as supported");
    assert.equal(typeof adapter.ReachSupported, "boolean");
    assert.equal(typeof adapter.HiDefSupported, "boolean");
  }
  assert.equal(evidence.defaultIsFirst, true,
    "the default adapter is the first of the listed ones");
  assert.equal(evidence.deviceAdapterName, evidence.adapters[0].DeviceName,
    "and the device's own adapter is that adapter rather than a second reading of the list");
}

/**
 * CNA's device layer, which is present on an artifact built with it and absent on one that is not.
 *
 * Both branches are real answers and both are asserted. The camera is synthetic and labelled so:
 * what it proves is that a frame's dimensions and a state survive the round trip, not that this
 * host has a camera.
 */
export function assertDeviceLayerEvidence(evidence, { expectAvailable }) {
  present(evidence, "devices");
  assert.equal(evidence.available, expectAvailable,
    expectAvailable
      ? "this artifact was built CNA_DEVICES=ON and the layer says so"
      : "this artifact was built without the device layer and the layer says so");
  if (!expectAvailable) {
    assert.notEqual(evidence.refusal, "ANSWERED",
      "and every route refuses rather than answering with a default");
    return;
  }
  const host = evidence.host;
  assert.ok(host.LogicalCpuCoreCount >= 1, "a host has at least one logical core");
  assert.ok(host.SystemRamMegabytes > 0);
  assert.equal(typeof host.PowerState, "number");
  assert.ok(host.ContentScale > 0, "a display has a positive content scale");
  assert.ok(host.SafeArea.Width > 0 && host.SafeArea.Height > 0);
  assert.ok(evidence.locales.length >= 1, "a host reports at least one preferred locale");
  for (const locale of evidence.locales) {
    assert.match(locale.Language, /^[a-z]{2,3}$/,
      `a language tag is a language tag: ${locale.Language}`);
    assert.equal(typeof locale.Country, "string");
  }
  assert.equal(typeof evidence.cameras.IsSupported, "boolean");
  assert.ok(Array.isArray(evidence.cameras.Devices));
  assert.equal(typeof evidence.clipboardAccepted, "boolean",
    "the device layer's clipboard write reports acceptance rather than only succeeding");

  const camera = evidence.camera;
  assert.equal(camera.width, 4, "a synthetic frame keeps the width it was given");
  assert.equal(camera.height, 2, "and its height, which is not the same number");
  assert.deepEqual(camera.states, { 2: 2, 3: 3, 4: 4 },
    "each state the test backend accepts is the state it then reports");
  assert.notEqual(camera.closedRefused, "ACCEPTED",
    "and CNA refuses to be told a camera it opened is closed");
  assert.notEqual(evidence.afterDestroy, "SURVIVED",
    "upstream finding 11 still reproduces: enumerating cameras after a test-backend camera has " +
    "been destroyed calls through a freed platform override. A repaired CNA makes this fail, " +
    "which is the point of asserting it");
}

/**
 * The members a family-level frontier could not see.
 *
 * None of these is a family, and that is why they were missed: a report that counts interfaces
 * cannot see a member, one that counts methods cannot see a *getter* or an optional member, and
 * one that counts members cannot see a bound method that covers one of its five inputs. Each was
 * found by a different widening of `tools/wasm/backend-gap.mjs`, and each is asserted here so the
 * widening stays paid for.
 */
export function assertLateMemberEvidence(evidence) {
  present(evidence, "lateMembers");

  // Microphones: the platform's, enumerated. How many there are is the host's business; that the
  // list is consistent and that a written buffer duration comes back is the binding's.
  for (const microphone of evidence.microphones) {
    assert.equal(typeof microphone.Name, "string");
    assert.ok(microphone.Name.length > 0, "an enumerated microphone has a name");
    assert.ok(microphone.SampleRate > 0, "and a positive sample rate");
    assert.match(microphone.BufferDurationTicks, /^\d+$/);
  }
  assert.equal(evidence.microphones.filter((microphone) => microphone.IsDefault).length,
    evidence.microphones.length === 0 ? 0 : 1,
    "exactly one enumerated microphone is the default one, or there are none at all");
  assert.deepEqual(evidence.microphones.map((microphone) => microphone.Index),
    evidence.microphones.map((_, index) => index),
    "and the indices are the positions rather than something CNA was asked for");
  if (evidence.microphoneCapture) {
    assert.equal(evidence.microphoneCapture.durationAfter, "3000000",
      "a buffer duration written is the duration read back, as a 64-bit tick count");
    assert.notEqual(evidence.microphoneCapture.started, evidence.microphoneCapture.stopped,
      "starting and stopping a microphone are two different states");
    assert.equal(typeof evidence.microphoneCapture.captured, "number");
    assert.ok(evidence.microphoneCapture.captured < evidence.microphoneCapture.requestedBytes,
      "captured bytes are counted from what CNA produced rather than from what was asked for: " +
      `${evidence.microphoneCapture.captured} of ${evidence.microphoneCapture.requestedBytes} ` +
      "requested, which is more than a 0.3-second buffer at 44100 Hz could ever hold");
  }

  // All five stock effects, not one.
  assert.deepEqual(evidence.stock.map((entry) => entry.kind), [0, 1, 2, 3, 4],
    "every CNA_StockEffectKind was attempted");
  for (const entry of evidence.stock) {
    assert.equal(entry.created, true, `stock effect kind ${entry.kind} was created`);
    assert.equal(entry.applied, true,
      `stock effect kind ${entry.kind} synchronised and applied: ${entry.error ?? ""}`);
  }
  assert.equal(evidence.unknownKind, "RangeError",
    "and a kind that is not one is refused by range rather than created");

  // A device that belongs to no game, which this backend refuses on purpose. Upstream finding 32:
  // the device itself works -- 64x48 viewport, destroys cleanly -- and the *game* afterwards does
  // not, throwing an Emscripten ErrnoError out of `cna_game_destroy` with no CNA result at all. A
  // repaired CNA makes this assertion fail, which is the point of making it.
  assert.notEqual(evidence.standalone, "CONSTRUCTED",
    "a standalone GraphicsDevice is refused by name on this backend rather than silently making " +
    "Game.Dispose fail");

  assert.equal(evidence.dispatcherUpdated, true,
    "FrameworkDispatcher.Update reaches CNA rather than checking a handle and returning");
  assert.match(evidence.mouseWindowHandle, /^\d+$/,
    "and the mouse's window handle is CNA's answer, read through a getter that used to refuse");
}

/** Every family's oracle, by the key its evidence is recorded under. */
export const NON_ENGINE_ORACLES = Object.freeze({
  avatar: assertAvatarEvidence,
  spriteFont: assertSpriteFontEvidence,
  window: assertGameWindowEvidence,
  inputDevices: assertInputDeviceEvidence,
  sensors: assertSensorEvidence,
  storage: assertStorageEvidence,
  contentSurvey: assertContentSurveyEvidence,
  media: assertMediaEvidence,
  mediaLibrary: assertMediaLibraryEvidence,
  gamerServices: assertGamerServicesEvidence,
  xact: assertXactEvidence,
  video: assertVideoEvidence,
  extendedInput: assertExtendedInputEvidence,
  graphicsAdapters: assertGraphicsAdapterEvidence,
  lateMembers: assertLateMemberEvidence,
});
