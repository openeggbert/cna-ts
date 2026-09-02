// SPDX-License-Identifier: MS-PL

/**
 * The non-engine oracles, checked against evidence that should fail them.
 *
 * Every claim this package makes about a browser is an oracle applied to evidence a page produced,
 * so an oracle that accepts anything makes its suite green and meaningless. The mutation harness
 * cannot catch that: an oracle lives in `test/support`, which `dist` does not contain, so mutating
 * one leaves the built artifact byte-identical and the harness correctly refuses to score it.
 *
 * This is the check that fits. Each case starts from evidence a *working* backend produced -- the
 * shapes below were copied out of a real run rather than imagined -- breaks exactly one thing in
 * the way a real binding defect would break it, and requires the oracle to say so.
 *
 * `tools/wasm/verify-oracles.mjs` then checks that every exported oracle reaches at least one of
 * these cases, so an oracle added without a rejection case fails a gate rather than going unwatched.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  SPRITE_FONT_FIXTURE,
  SPRITE_FONT_NEGATIVE_BEARING,
  SPRITE_FONT_STRINGS,
  SPRITE_FONT_TRAILING_NEGATIVE_BEARING,
} from "./fixtures/sprite-font.mjs";
import {
  assertAvatarEvidence,
  assertContentSurveyEvidence,
  assertDeviceLayerEvidence,
  assertExtendedInputEvidence,
  assertGamerServicesEvidence,
  assertGameWindowEvidence,
  assertGraphicsAdapterEvidence,
  assertInputDeviceEvidence,
  assertMediaEvidence,
  assertMediaLibraryEvidence,
  assertSensorEvidence,
  assertSpriteFontEvidence,
  assertStorageEvidence,
  assertVideoEvidence,
  assertXactEvidence,
} from "./support/non-engine-oracle.mjs";

/** A deep copy, so a case that breaks one field cannot leak into the next. */
const clone = (value) => structuredClone(value);

const WORKING = {
  avatar: {
    length: 1021, allZero: true, isValid: false, bodyType: 0, height: 0,
    twoCallsAgree: true, bodyTypesAgree: true, roundTrip: true,
    rebuiltValid: false, rebuiltBodyType: 0,
    shortRefused: "WasmCnaError", badBodyType: "ArgumentOutOfRangeException",
  },
  window: {
    titleBefore: "CNA", titleAfter: "cna-ts browser window",
    bounds: { X: 0, Y: 0, Width: 800, Height: 480 },
    resized: { Width: 864, Height: 512 },
    restored: { Width: 800, Height: 480 },
    seenInEvent: { width: 864, height: 512 },
    sizeChanged: 1, orientation: 1, screenDeviceName: "2",
    handle: "2208768", allowUserResizing: true,
  },
  inputDevices: {
    clipboardBefore: false, clipboardAfter: true,
    clipboardText: "cna-ts clipboard round trip", clipboardSize: 27,
    mice: [{ Id: "1", Name: "Mouse" }],
    keyboards: [{ Id: "1", Name: "Keyboard" }],
    touchCount: 0, outOfRange: "WasmCnaError",
    power: { State: 2, BatteryPercent: 0, SecondsRemaining: 0 },
  },
  sensors: {
    support: { Accelerometer: false, Compass: false, Gyroscope: false, Motion: false },
    accelerometer: {
      initialTicks: "20000", updatedTicks: "200000", initialValid: false, unsupportedRead: "3",
    },
    compass: {
      state: 1, valid: true, interval: "20000",
      reading: {
        HeadingAccuracy: 1.5, MagneticHeading: 42.25, TrueHeading: 43.5,
        MagnetometerReading: { X: 1.25, Y: -2.5, Z: 3.75 },
        TimestampTicks: "638000000000000123", TimestampOffsetTicks: "36000000000",
      },
    },
    gyroscope: { state: 1, valid: true, rate: { X: 0.5, Y: 1.5, Z: -2.5 } },
    motion: {
      subMinuteOffset: "1", northReferenced: true, valid: true,
      attitude: {
        Pitch: 0.25, Roll: -0.5, Yaw: 1.25,
        Quaternion: [0.1, 0.2, 0.3, 0.4],
        RotationMatrix: Array.from({ length: 16 }, (_, index) => index + 1),
        TimestampTicks: "638000000000000011",
      },
      deviceAcceleration: { X: 1, Y: 2, Z: 3 },
      deviceRotationRate: { X: 4, Y: 5, Z: 6 },
      gravity: { X: 0, Y: -9.75, Z: 0 },
      timestampTicks: "638000000000000033", timestampOffsetTicks: "36000000000",
    },
  },
  storage: {
    displayName: "cna-ts-browser", isConnected: true,
    freeSpace: "2048000000", totalSpace: "4096000000",
    listing: {
      directories: ["saves"], files: ["slot0.sav", "slot1.sav"], filtered: ["slot0.sav"],
    },
    openedLength: 0, fileExists: true,
    deletedFileExists: false, deletedDirectoryExists: false, missing: "5",
  },
  contentSurvey: {
    root: "/survey",
    entries: [
      { AssetName: "Atlas", HasXnb: true, HasCnj: false, NativeExtensions: [] },
      { AssetName: "Notes", HasXnb: false, HasCnj: false, NativeExtensions: [".txt"] },
      { AssetName: "nested/Tile", HasXnb: false, HasCnj: false, NativeExtensions: [".png"] },
    ],
    textureReaderRegistered: true, nonsenseReaderRegistered: false,
  },
  media: {
    sources: [{ Index: 0, Name: "Local Device", Type: 0 }],
    gameHasControl: true, playPositionTicks: "0",
    frequencyCount: 256, sampleCount: 256, frequenciesAllZero: true,
  },
  mediaLibrary: {
    counts: {
      Songs: 0, Albums: 0, Artists: 0, Genres: 0, Playlists: 0, Pictures: 0, SavedPictures: 0,
    },
    outOfRange: "1",
  },
  gamerServices: {
    initialized: true, visible: false, notificationPosition: 8,
    screenSaverBefore: false, screenSaverAfter: true,
    trialBefore: false, simulateWhileSet: true, trialWhileSimulated: false,
    simulateAfterReset: false,
    messageBox: {
      pending: true, focus: 1, chosen: 1, completions: 1,
      doubleEnd: "expected a Guide continuation token", pendingAfterEnd: false,
    },
    keyboard: {
      pending: true, title: "Gamertag", description: "Choose a name",
      displayText: "Player One", cancelledText: null, wasCancelled: true, completions: 1,
    },
  },
  xact: {
    writableBefore: 343, writableAfter: 500, readOnlyBefore: 12, readOnlyAfter: 12,
    renderers: [{ FriendlyName: "SDL3_mixer", RendererId: "SDL3_mixer" }],
    categories: {
      name: "Music", handlesDiffer: true, sameEquals: true,
      differentEquals: false, hashesAgree: true,
    },
    banks: { wavePrepared: true, waveDisposed: false, soundDisposed: false },
    cueName: "Tone261", missingCue: "3", engineDisposed: false,
    states: {
      created: cue({ IsPrepared: true }),
      playing: cue({ IsPlaying: true }),
      paused: cue({ IsPlaying: true, IsPaused: true }),
      resumed: cue({ IsPlaying: true }),
      stopped: cue({ IsStopped: true }),
    },
  },
  video: {
    state: 0, positionTicks: "0",
    frame: {
      texture: "0", generation: "0", presentationTimeSeconds: -1, isAvailable: false,
    },
    playedNothing: "2",
  },
  extendedInput: {
    joystickCount: 0, hapticCount: 0, outOfRange: "WasmCnaError",
    screenKeyboardShown: false, active: true, inactive: false,
    committed: ["A", "☺"], afterUnsubscribe: 2,
    editing: [{ Text: "compose", Start: 2, Length: 3 }],
    candidates: [{ Candidates: ["one", "two", "three"], Selected: 1, IsHorizontal: true }],
  },
  graphicsAdapters: {
    adapters: [{
      Description: "Default Display", DeviceName: "\\\\.\\DISPLAY1",
      IsDefaultAdapter: true, IsWideScreen: true, MonitorHandle: "0",
      CurrentDisplayMode: { Width: 800, Height: 480, AspectRatio: 800 / 480, Format: 0 },
      SupportedModeCount: 1, ReachSupported: true, HiDefSupported: true,
    }],
    defaultIsFirst: true, deviceAdapterName: "\\\\.\\DISPLAY1",
  },
  devices: {
    available: true,
    host: {
      LogicalCpuCoreCount: 1, SystemRamMegabytes: 2048, PowerState: 2,
      BatteryPercent: 0, SecondsRemaining: 0, ContentScale: 1,
      SafeArea: { X: 0, Y: 0, Width: 800, Height: 480 },
    },
    locales: [{ Language: "en", Country: "US" }],
    cameras: { IsSupported: true, Devices: [] },
    clipboardAccepted: true,
    camera: { width: 4, height: 2, states: { 2: 2, 3: 3, 4: 4 }, closedRefused: "1" },
    afterDestroy: "RuntimeError: table index is out of bounds",
  },
};

/** One `CNA_CueInfo`, with the named flags set and the rest clear. */
function cue(flags) {
  return {
    IsCreated: false, IsDisposed: false, IsPaused: false, IsPlaying: false,
    IsPrepared: false, IsPreparing: false, IsStopped: false, IsStopping: false,
    ...flags,
  };
}

/**
 * The sprite-font evidence a working pair of implementations produces.
 *
 * Built rather than pasted: the measured numbers are the fixture's own arithmetic, and the one
 * divergence is applied where upstream finding 27 says it is, so this stays correct if the fixture
 * changes and stops being correct if the finding does.
 */
function spriteFont() {
  const widths = {
    "": 0, A: 13, j: 7, ".": 4.5, W: 19.5, AA: 24.5, Aj: 21.5, jA: 21.5, jj: 15.5,
    "A.j": 27.5, "W W": 44, "AjW.": 42.5, "A\nj": 13, "A\n\nW": 19.5, "A\r\nj": 13,
    "AjW.AjW.AjW.": 124.5, " ": 6.5, "  ": 13, " A ": 26, "\n": 0, "\n\n": 0,
    "?": 13, Z: 12, AZj: 33,
  };
  const heights = {
    "": 0, A: 14, j: 16, ".": 20, W: 14, AA: 14, Aj: 16, jA: 16, jj: 16, "A.j": 20,
    "W W": 14, "AjW.": 20, "A\nj": 30, "A\n\nW": 42, "A\r\nj": 30, "AjW.AjW.AjW.": 20,
    " ": 4, "  ": 4, " A ": 14, "\n": 14, "\n\n": 28, "?": 14, Z: 14, AZj: 16,
  };
  const diverging = new Set(SPRITE_FONT_TRAILING_NEGATIVE_BEARING);
  return {
    info: {
      CharacterCount: SPRITE_FONT_FIXTURE.Glyphs.length,
      LineSpacing: SPRITE_FONT_FIXTURE.LineSpacing,
      Spacing: SPRITE_FONT_FIXTURE.Spacing,
      HasDefaultCharacter: true,
      DefaultCharacter: SPRITE_FONT_FIXTURE.DefaultCharacter.codePointAt(0),
    },
    rows: SPRITE_FONT_STRINGS.map((text) => ({
      text,
      managed: [widths[text], heights[text]],
      native: [
        widths[text] - (diverging.has(text) ? SPRITE_FONT_NEGATIVE_BEARING : 0),
        heights[text],
      ],
    })),
  };
}

test("the non-engine oracles accept the evidence a working backend produces", () => {
  assertAvatarEvidence(clone(WORKING.avatar));
  assertSpriteFontEvidence(spriteFont());
  assertGameWindowEvidence(clone(WORKING.window));
  assertInputDeviceEvidence(clone(WORKING.inputDevices));
  assertSensorEvidence(clone(WORKING.sensors));
  assertStorageEvidence(clone(WORKING.storage));
  assertContentSurveyEvidence(clone(WORKING.contentSurvey));
  assertMediaEvidence(clone(WORKING.media));
  assertMediaLibraryEvidence(clone(WORKING.mediaLibrary));
  assertGamerServicesEvidence(clone(WORKING.gamerServices));
  assertXactEvidence(clone(WORKING.xact));
  assertVideoEvidence(clone(WORKING.video));
  assertExtendedInputEvidence(clone(WORKING.extendedInput));
  assertGraphicsAdapterEvidence(clone(WORKING.graphicsAdapters));
  assertDeviceLayerEvidence(clone(WORKING.devices), { expectAvailable: true });
  assertDeviceLayerEvidence({ available: false, refusal: "6" }, { expectAvailable: false });
});

/**
 * One broken thing per case, each the shape a real binding defect would take.
 *
 * Not "a field is missing": a missing field is a crash somebody notices. These are the quiet ones
 * -- an axis pair swapped, a 64-bit value taken through a double, an array read at the wrong
 * stride, a callback rooted twice, a refusal answered instead of raised.
 */
const CASES = [
  ["a description CreateRandom actually randomised", () => {
    const broken = clone(WORKING.avatar);
    broken.allZero = false;
    return () => assertAvatarEvidence(broken);
  }],
  ["a description length taken from the wrong constant", () => {
    const broken = clone(WORKING.avatar);
    broken.length = 1024;
    return () => assertAvatarEvidence(broken);
  }],
  ["a body-type overload that stopped being ignored", () => {
    const broken = clone(WORKING.avatar);
    broken.twoCallsAgree = false;
    return () => assertAvatarEvidence(broken);
  }],
  ["a wrong-length description that was padded rather than refused", () => {
    const broken = clone(WORKING.avatar);
    broken.shortRefused = "ACCEPTED";
    return () => assertAvatarEvidence(broken);
  }],
  ["a MeasureString that disagrees outside the known divergence", () => {
    const broken = spriteFont();
    broken.rows.find((row) => row.text === "W W").native[0] += 1;
    return () => assertSpriteFontEvidence(broken);
  }],
  ["a divergence that is no longer exactly the trailing bearing", () => {
    const broken = spriteFont();
    broken.rows.find((row) => row.text === "j").native[0] -= 1;
    return () => assertSpriteFontEvidence(broken);
  }],
  ["an oracle font built with a glyph missing", () => {
    const broken = spriteFont();
    broken.info.CharacterCount -= 1;
    return () => assertSpriteFontEvidence(broken);
  }],
  ["a window title remembered in managed state", () => {
    const broken = clone(WORKING.window);
    broken.titleAfter = broken.titleBefore;
    return () => assertGameWindowEvidence(broken);
  }],
  ["client bounds that did not follow ApplyChanges", () => {
    const broken = clone(WORKING.window);
    broken.resized = { ...broken.bounds };
    return () => assertGameWindowEvidence(broken);
  }],
  ["a ClientSizeChanged that never fired", () => {
    const broken = clone(WORKING.window);
    broken.sizeChanged = 0;
    return () => assertGameWindowEvidence(broken);
  }],
  ["an event handler that saw the old bounds", () => {
    const broken = clone(WORKING.window);
    broken.seenInEvent = { width: broken.bounds.Width, height: broken.bounds.Height };
    return () => assertGameWindowEvidence(broken);
  }],
  ["a clipboard read that returns what was written to a different one", () => {
    const broken = clone(WORKING.inputDevices);
    broken.clipboardText = "something else";
    return () => assertInputDeviceEvidence(broken);
  }],
  ["a clipboard size counted in characters rather than UTF-8 bytes", () => {
    const broken = clone(WORKING.inputDevices);
    broken.clipboardText = "café round trip";
    broken.clipboardSize = broken.clipboardText.length;
    return () => assertInputDeviceEvidence(broken);
  }],
  ["a device enumeration that accepts an index past the end", () => {
    const broken = clone(WORKING.inputDevices);
    broken.outOfRange = "ACCEPTED";
    return () => assertInputDeviceEvidence(broken);
  }],
  ["CNA's -1 for an unknown battery handed on as a number", () => {
    const broken = clone(WORKING.inputDevices);
    broken.power.BatteryPercent = -1;
    return () => assertInputDeviceEvidence(broken);
  }],
  ["a sensor interval that never reached CNA", () => {
    const broken = clone(WORKING.sensors);
    broken.accelerometer.updatedTicks = broken.accelerometer.initialTicks;
    return () => assertSensorEvidence(broken);
  }],
  ["an unsupported sensor answering with zeroes instead of refusing", () => {
    const broken = clone(WORKING.sensors);
    broken.accelerometer.unsupportedRead = "ANSWERED";
    return () => assertSensorEvidence(broken);
  }],
  ["a compass whose two headings are swapped", () => {
    const broken = clone(WORKING.sensors);
    const reading = broken.compass.reading;
    [reading.MagneticHeading, reading.TrueHeading] = [reading.TrueHeading, reading.MagneticHeading];
    return () => assertSensorEvidence(broken);
  }],
  ["a magnetometer vector read one float early", () => {
    const broken = clone(WORKING.sensors);
    broken.compass.reading.MagnetometerReading = { X: -2.5, Y: 3.75, Z: 0 };
    return () => assertSensorEvidence(broken);
  }],
  ["a sensor timestamp taken through a double", () => {
    const broken = clone(WORKING.sensors);
    broken.compass.reading.TimestampTicks = String(Number(638000000000000123n));
    return () => assertSensorEvidence(broken);
  }],
  ["a gyroscope whose axes lost their sign", () => {
    const broken = clone(WORKING.sensors);
    broken.gyroscope.rate.Z = 2.5;
    return () => assertSensorEvidence(broken);
  }],
  ["a motion reading whose acceleration and rotation rate share an offset", () => {
    const broken = clone(WORKING.sensors);
    broken.motion.deviceRotationRate = { X: 1, Y: 2, Z: 3 };
    return () => assertSensorEvidence(broken);
  }],
  ["a rotation matrix read at four floats rather than sixteen", () => {
    const broken = clone(WORKING.sensors);
    broken.motion.attitude.RotationMatrix = [1, 2, 3, 4];
    return () => assertSensorEvidence(broken);
  }],
  ["an attitude that reports its parent reading's timestamp", () => {
    const broken = clone(WORKING.sensors);
    broken.motion.attitude.TimestampTicks = broken.motion.timestampTicks;
    return () => assertSensorEvidence(broken);
  }],
  ["a storage search pattern that never reached CNA", () => {
    const broken = clone(WORKING.storage);
    broken.listing.filtered = [...broken.listing.files];
    return () => assertStorageEvidence(broken);
  }],
  ["a deleted file that still exists", () => {
    const broken = clone(WORKING.storage);
    broken.deletedFileExists = true;
    return () => assertStorageEvidence(broken);
  }],
  ["an absent file opened as empty bytes rather than refused", () => {
    const broken = clone(WORKING.storage);
    broken.missing = "ACCEPTED";
    return () => assertStorageEvidence(broken);
  }],
  ["a container that answers with a name it was not opened under", () => {
    const broken = clone(WORKING.storage);
    broken.displayName = "default";
    return () => assertStorageEvidence(broken);
  }],
  ["a survey that lists only the root directory", () => {
    const broken = clone(WORKING.contentSurvey);
    broken.entries = broken.entries.filter((entry) => !entry.AssetName.includes("/"));
    return () => assertContentSurveyEvidence(broken);
  }],
  ["a survey that calls a loose asset compiled content", () => {
    const broken = clone(WORKING.contentSurvey);
    broken.entries.find((entry) => entry.AssetName === "nested/Tile").HasXnb = true;
    return () => assertContentSurveyEvidence(broken);
  }],
  ["a reader registry that says yes to everything", () => {
    const broken = clone(WORKING.contentSurvey);
    broken.nonsenseReaderRegistered = true;
    return () => assertContentSurveyEvidence(broken);
  }],
  ["a visualisation buffer read at half its measured length", () => {
    const broken = clone(WORKING.media);
    broken.frequencyCount = 128;
    return () => assertMediaEvidence(broken);
  }],
  ["a spectrum invented from silence", () => {
    const broken = clone(WORKING.media);
    broken.frequenciesAllZero = false;
    return () => assertMediaEvidence(broken);
  }],
  ["a media library snapshot missing a collection", () => {
    const broken = clone(WORKING.mediaLibrary);
    delete broken.counts.SavedPictures;
    return () => assertMediaLibraryEvidence(broken);
  }],
  ["an empty library that answers an index instead of refusing it", () => {
    const broken = clone(WORKING.mediaLibrary);
    broken.outOfRange = "ACCEPTED";
    return () => assertMediaLibraryEvidence(broken);
  }],
  ["a Guide completion that ran twice", () => {
    const broken = clone(WORKING.gamerServices);
    broken.messageBox.completions = 2;
    return () => assertGamerServicesEvidence(broken);
  }],
  ["a message box that reports the focus button rather than the click", () => {
    const broken = clone(WORKING.gamerServices);
    broken.messageBox.chosen = 0;
    broken.messageBox.focus = 0;
    return () => assertGamerServicesEvidence(broken);
  }],
  ["a continuation token that can be ended twice", () => {
    const broken = clone(WORKING.gamerServices);
    broken.messageBox.doubleEnd = "ACCEPTED";
    return () => assertGamerServicesEvidence(broken);
  }],
  ["a cancelled keyboard entry reported as an empty string", () => {
    const broken = clone(WORKING.gamerServices);
    broken.keyboard.cancelledText = "";
    return () => assertGamerServicesEvidence(broken);
  }],
  ["simulated trial mode leaking into IsTrialMode", () => {
    const broken = clone(WORKING.gamerServices);
    broken.trialWhileSimulated = true;
    return () => assertGamerServicesEvidence(broken);
  }],
  ["a global variable write that never reached CNA", () => {
    const broken = clone(WORKING.xact);
    broken.writableAfter = broken.writableBefore;
    return () => assertXactEvidence(broken);
  }],
  ["a READONLY variable that took a write", () => {
    const broken = clone(WORKING.xact);
    broken.readOnlyAfter = 99;
    return () => assertXactEvidence(broken);
  }],
  ["category equality answered by handle identity", () => {
    const broken = clone(WORKING.xact);
    broken.categories.sameEquals = false;
    return () => assertXactEvidence(broken);
  }],
  ["a cue that pausing stopped rather than paused", () => {
    const broken = clone(WORKING.xact);
    broken.states.paused.IsPlaying = false;
    return () => assertXactEvidence(broken);
  }],
  ["a cue whose stop never took", () => {
    const broken = clone(WORKING.xact);
    broken.states.stopped = cue({ IsPlaying: true });
    return () => assertXactEvidence(broken);
  }],
  ["a missing cue name accepted rather than refused", () => {
    const broken = clone(WORKING.xact);
    broken.missingCue = "ACCEPTED";
    return () => assertXactEvidence(broken);
  }],
  ["a video frame claimed available with no decoder", () => {
    const broken = clone(WORKING.video);
    broken.frame.isAvailable = true;
    return () => assertVideoEvidence(broken);
  }],
  ["a frame texture handed back as a plausible-looking handle", () => {
    const broken = clone(WORKING.video);
    broken.frame.texture = "4294967297";
    return () => assertVideoEvidence(broken);
  }],
  ["a null video accepted for playback", () => {
    const broken = clone(WORKING.video);
    broken.playedNothing = "ACCEPTED";
    return () => assertVideoEvidence(broken);
  }],
  ["a text-input handler still called after unsubscribing", () => {
    const broken = clone(WORKING.extendedInput);
    broken.committed = ["A", "☺", "B"];
    broken.afterUnsubscribe = 3;
    return () => assertExtendedInputEvidence(broken);
  }],
  ["a code unit truncated to Latin-1", () => {
    const broken = clone(WORKING.extendedInput);
    broken.committed = ["A", ":"];
    return () => assertExtendedInputEvidence(broken);
  }],
  ["a composition update that lost its selection", () => {
    const broken = clone(WORKING.extendedInput);
    broken.editing = [{ Text: "compose", Start: 0, Length: 0 }];
    return () => assertExtendedInputEvidence(broken);
  }],
  ["a candidate list read at the wrong stride", () => {
    const broken = clone(WORKING.extendedInput);
    broken.candidates = [{ Candidates: ["one", "", "two"], Selected: 1, IsHorizontal: true }];
    return () => assertExtendedInputEvidence(broken);
  }],
  ["a joystick index past the end that was accepted", () => {
    const broken = clone(WORKING.extendedInput);
    broken.outOfRange = "ACCEPTED";
    return () => assertExtendedInputEvidence(broken);
  }],
  ["an aspect ratio that does not match its own display mode", () => {
    const broken = clone(WORKING.graphicsAdapters);
    broken.adapters[0].CurrentDisplayMode.AspectRatio = 1.25;
    return () => assertGraphicsAdapterEvidence(broken);
  }],
  ["a wide-screen flag read from a different field", () => {
    const broken = clone(WORKING.graphicsAdapters);
    broken.adapters[0].IsWideScreen = false;
    return () => assertGraphicsAdapterEvidence(broken);
  }],
  ["a device whose adapter is not the one it listed", () => {
    const broken = clone(WORKING.graphicsAdapters);
    broken.deviceAdapterName = "\\\\.\\DISPLAY2";
    return () => assertGraphicsAdapterEvidence(broken);
  }],
  ["a display mode with no size", () => {
    const broken = clone(WORKING.graphicsAdapters);
    broken.adapters[0].CurrentDisplayMode.Width = 0;
    return () => assertGraphicsAdapterEvidence(broken);
  }],
  ["a device layer that answers where it was built out", () => {
    return () => assertDeviceLayerEvidence(
      { available: false, refusal: "ANSWERED" }, { expectAvailable: false });
  }],
  ["a synthetic camera frame whose height took the width", () => {
    const broken = clone(WORKING.devices);
    broken.camera.height = 4;
    return () => assertDeviceLayerEvidence(broken, { expectAvailable: true });
  }],
  ["a camera that accepts being told it is closed", () => {
    const broken = clone(WORKING.devices);
    broken.camera.closedRefused = "ACCEPTED";
    return () => assertDeviceLayerEvidence(broken, { expectAvailable: true });
  }],
  ["a locale list whose language tag is not one", () => {
    const broken = clone(WORKING.devices);
    broken.locales = [{ Language: "English", Country: "US" }];
    return () => assertDeviceLayerEvidence(broken, { expectAvailable: true });
  }],
  ["upstream finding 11 repaired, which this suite must notice", () => {
    const broken = clone(WORKING.devices);
    broken.afterDestroy = "SURVIVED";
    return () => assertDeviceLayerEvidence(broken, { expectAvailable: true });
  }],
];

for (const [name, build] of CASES) {
  test(`the non-engine oracles reject ${name}`, () => {
    assert.throws(build(), assert.AssertionError, `${name} was accepted`);
  });
}
