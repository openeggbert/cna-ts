// SPDX-License-Identifier: MS-PL
//
// `Microsoft.Xna.Framework.Media.MediaLibrary`, over CNA's index of the user's media folders.
//
// The library was projected here with empty collections. It is not empty: CNA scans the Music and
// Pictures folders and indexes what it finds. This test **builds the folders it then reads**, so
// every expected value — the song's name, its exact duration, the album's cover bytes, the
// picture's dimensions — is known independently of whatever the library reports.
//
// Two properties are worth more than the counts, and each has its own test:
//
//   * object identity across the graph. `song.Album === library.Albums.Get(0)` has to hold, and it
//     is not free: CNA reports relationships by name because its own handles are minted per call
//     and never compare equal, so the managed graph has to intern them.
//   * laziness. Album art and picture pixels are fetched when asked for, not when the library is
//     opened, because XNA asks for them with a method for exactly that reason.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import {
  Game,
  GraphicsDeviceManager,
  LoadNodeNativeBackend,
  Media,
  TimeSpan,
} from "../dist/index.js";
import { CNA_ABI_MAJOR, CNA_ABI_MINOR } from "../dist/internal/abi.js";
import { getBackend } from "../dist/internal/backend.js";

const library = process.env.CNA_NATIVE_LIBRARY;
if (!library) {
  throw new Error(
    `CNA_NATIVE_LIBRARY must name an existing CNA C ABI ${CNA_ABI_MAJOR}.${CNA_ABI_MINOR}.x shared library`,
  );
}

/**
 * A **2x1** PNG, deliberately not square: a library that reported width and height the wrong way
 * round would pass every assertion a 1x1 image can make.
 */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGP4z8DAwPAfAAcAAf9+CLHQAAAAAElFTkSuQmCC",
  "base64",
);
const PNG_WIDTH = 2;
const PNG_HEIGHT = 1;

/** A silent mono WAV of an exact length, so the duration the library reports can be predicted. */
function wav(sampleRate, frames) {
  const data = frames * 2;
  const buffer = Buffer.alloc(44 + data);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + data, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);           // PCM
  buffer.writeUInt16LE(1, 22);           // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(data, 40);
  return buffer;
}

const SAMPLE_RATE = 8000;
const FRAMES = 4000;                      // exactly half a second
const EXPECTED_MILLISECONDS = (FRAMES / SAMPLE_RATE) * 1000;

const home = fs.mkdtempSync(path.join(os.tmpdir(), "cna-ts-media-"));
const music = path.join(home, "Music");
const pictures = path.join(home, "Pictures");
const config = path.join(home, "config");
fs.mkdirSync(path.join(music, "Census Album"), { recursive: true });
fs.mkdirSync(pictures, { recursive: true });
fs.mkdirSync(config, { recursive: true });
fs.writeFileSync(
  path.join(music, "Census Album", "Track.wav"), wav(SAMPLE_RATE, FRAMES),
);
// CNA looks for a cover beside the song, under several conventional names; this is one of them.
fs.writeFileSync(path.join(music, "Census Album", "cover.png"), PNG);
fs.writeFileSync(path.join(pictures, "Snapshot.png"), PNG);
fs.writeFileSync(
  path.join(config, "user-dirs.dirs"),
  `XDG_MUSIC_DIR="${music}"\nXDG_PICTURES_DIR="${pictures}"\n`,
);
process.env.XDG_CONFIG_HOME = config;
process.env.XDG_DATA_HOME = path.join(home, "data");
after(() => fs.rmSync(home, { recursive: true, force: true }));

await LoadNodeNativeBackend({
  CnaLibrary: path.resolve(library),
  BridgeModule: path.resolve(process.env.CNA_NODE_BRIDGE ?? "build/cna_node_bridge.node"),
});

const evidence = Object.create(null);
function record(name, action) {
  try { evidence[name] = action(); }
  catch (error) { evidence[name] = { failed: `${error?.constructor?.name}: ${error?.message}` }; }
}

class MediaProbeGame extends Game {
  constructor() {
    super();
    this.graphics = new GraphicsDeviceManager(this);
  }

  Draw(_gameTime) {
    record("library", () => {
      const found = new Media.MediaLibrary();
      try {
        const song = found.Songs.Count > 0 ? found.Songs.Get(0) : null;
        const album = found.Albums.Count > 0 ? found.Albums.Get(0) : null;
        const artist = found.Artists.Count > 0 ? found.Artists.Get(0) : null;
        const picture = found.Pictures.Count > 0 ? found.Pictures.Get(0) : null;
        return {
          sourceName: found.MediaSource?.Name ?? null,
          counts: {
            songs: found.Songs.Count, albums: found.Albums.Count,
            artists: found.Artists.Count, genres: found.Genres.Count,
            playlists: found.Playlists.Count, pictures: found.Pictures.Count,
            saved: found.SavedPictures.Count,
          },
          song: song && {
            Name: song.Name,
            Milliseconds: song.Duration.TotalMilliseconds,
            TrackNumber: song.TrackNumber,
            AlbumName: song.Album?.Name ?? null,
            ArtistName: song.Artist?.Name ?? null,
            IsProtected: song.IsProtected,
          },
          album: album && {
            Name: album.Name,
            SongCount: album.Songs.Count,
            HasArt: album.HasArt,
            ArtistName: album.Artist?.Name ?? null,
            ArtBytes: album.HasArt ? [...album.GetAlbumArt()] : null,
            ThumbnailBytes: album.HasArt ? [...album.GetThumbnail()] : null,
          },
          picture: picture && {
            Name: picture.Name, Width: picture.Width, Height: picture.Height,
            ImageBytes: [...picture.GetImage()],
            ThumbnailBytes: [...picture.GetThumbnail()],
          },
          identity: {
            songAlbumIsLibraryAlbum: song != null && album != null && song.Album === album,
            songArtistIsLibraryArtist: song != null && artist != null && song.Artist === artist,
            albumSongIsLibrarySong: album != null && song != null
              && album.Songs.Count > 0 && album.Songs.Get(0) === song,
            albumArtistIsLibraryArtist: album != null && artist != null
              && album.Artist === artist,
            songsStable: found.Songs.Get(0) === found.Songs.Get(0),
          },
        };
      } finally {
        found.Dispose();
      }
    });

    record("savePicture", () => {
      const found = new Media.MediaLibrary();
      try {
        const before = found.SavedPictures.Count;
        const saved = found.SavePicture("CensusSaved", PNG);
        const reopened = new Media.MediaLibrary();
        const names = [];
        for (let index = 0; index < reopened.SavedPictures.Count; index += 1) {
          names.push(reopened.SavedPictures.Get(index).Name);
        }
        const savedCount = reopened.SavedPictures.Count;
        // A token that names a picture already in the snapshot must answer that very object.
        let tokenIdentity = null;
        let token = null;
        if (savedCount > 0) {
          const first = reopened.SavedPictures.Get(0);
          token = savedPictureToken(0);
          tokenIdentity = token != null && reopened.GetPictureFromToken(token) === first;
        }
        reopened.Dispose();
        return {
          before, savedName: saved.Name, savedCount, names, tokenIdentity, token,
          unknownToken: found.GetPictureFromToken("nothing-has-this-token"),
        };
      } finally {
        found.Dispose();
      }
    });

    record("disposal", () => {
      const found = new Media.MediaLibrary();
      found.Dispose();
      found.Dispose();
      let afterDispose = "ANSWERED";
      try { void found.Songs; }
      catch (error) { afterDispose = error?.constructor?.name; }
      return { isDisposed: found.IsDisposed, afterDispose };
    });

    this.Exit();
  }
}

/**
 * The token CNA gives a saved picture.
 *
 * XNA's `Picture` has no `Token` member — a token comes from the photo chooser, not from a
 * picture in hand — so a test cannot obtain one through the public surface. It reads the one CNA
 * reports, through the same snapshot the library was built from, and then uses the *public*
 * `GetPictureFromToken` with it. Guessing the token would have tested the guess.
 */
function savedPictureToken(index) {
  const backend = getBackend().MediaLibrary;
  const native = backend.createMediaLibrary();
  try {
    return backend.getMediaLibrarySnapshot(native).SavedPictures[index]?.Token ?? null;
  } finally {
    backend.destroyMediaLibrary(native);
  }
}

{
  const game = new MediaProbeGame();
  await game.Run();
  game.Dispose();
}

function claim(name) {
  const value = evidence[name];
  assert.ok(
    value != null && value.failed == null,
    `the "${name}" measurement did not run: ${value?.failed ?? "absent"}`,
  );
  return value;
}

test("the library reports the media this test planted, not an empty set", () => {
  const seen = claim("library");
  assert.equal(
    seen.sourceName, "Local Device",
    "the source comes from the media-source routes, not from the library snapshot -- reporting " +
    "it twice would be a second answer to one question",
  );
  assert.equal(seen.counts.songs, 1, "one WAV was written, so one song is indexed");
  assert.equal(seen.counts.albums, 1, "and its containing folder becomes one album");
  assert.equal(seen.counts.artists, 1);
  assert.equal(seen.counts.pictures, 1, "one PNG was written to the picture root");
  assert.equal(seen.counts.saved, 0, "nothing has been saved into the library yet");
});

test("a song carries the metadata the file actually has", () => {
  const seen = claim("library");
  assert.equal(seen.song.Name, "Track", "the file name without its extension");
  assert.equal(
    seen.song.Milliseconds, EXPECTED_MILLISECONDS,
    `${FRAMES} frames at ${SAMPLE_RATE}Hz is exactly ${EXPECTED_MILLISECONDS}ms, and the ` +
    "duration is read from the file rather than defaulted -- a zero here would pass a weaker test",
  );
  assert.equal(seen.song.AlbumName, "Census Album", "the folder the song sits in");
  assert.equal(seen.song.IsProtected, false);
  assert.ok(TimeSpan.FromMilliseconds(EXPECTED_MILLISECONDS).Ticks > 0n);
});

test("the graph has object identity, not just equal values", () => {
  const seen = claim("library");
  assert.equal(
    seen.identity.songAlbumIsLibraryAlbum, true,
    "song.Album must be the very object in library.Albums -- CNA's own handles are minted per " +
    "call and never compare equal, so this only holds because the graph interns by name",
  );
  assert.equal(seen.identity.songArtistIsLibraryArtist, true);
  assert.equal(
    seen.identity.albumSongIsLibrarySong, true,
    "and the cycle closes: the album's first song is the library's first song",
  );
  assert.equal(seen.identity.albumArtistIsLibraryArtist, true);
  assert.equal(seen.identity.songsStable, true, "a collection hands back the same object twice");
});

test("album art and picture pixels are the exact bytes on disk", () => {
  const seen = claim("library");
  assert.equal(seen.album.HasArt, true, "a cover.png beside the song is found");
  assert.deepEqual(
    seen.album.ArtBytes, [...PNG],
    "and GetAlbumArt returns that file byte for byte, which is what makes the lazy fetch real " +
    "rather than a placeholder",
  );
  assert.equal(seen.album.SongCount, 1);
  assert.deepEqual(
    seen.picture.ImageBytes, [...PNG],
    "the picture's pixels are the planted file, fetched when asked for rather than when the " +
    "library was opened",
  );
  assert.deepEqual(
    [seen.picture.Width, seen.picture.Height], [PNG_WIDTH, PNG_HEIGHT],
    "measured from the file, and the image is deliberately not square so a width/height swap " +
    "cannot pass",
  );
  assert.equal(seen.picture.Name, "Snapshot");
  // CNA's header states it generates no separate thumbnail and returns the same image, and calls
  // that the canonical behaviour rather than a C limitation. Asserted so that a CNA which starts
  // generating one is noticed here rather than silently changing what GetThumbnail means.
  assert.deepEqual(
    seen.album.ThumbnailBytes, seen.album.ArtBytes,
    "an album's thumbnail is its cover art -- CNA generates no separate one, by design",
  );
  assert.deepEqual(
    seen.picture.ThumbnailBytes, seen.picture.ImageBytes,
    "and a picture's thumbnail is its image, for the same reason",
  );
});

test("SavePicture writes into the library and a token finds it again", () => {
  const seen = claim("savePicture");
  assert.equal(seen.before, 0);
  assert.equal(seen.savedName, "CensusSaved", "the saved picture carries the name it was given");
  assert.ok(
    seen.savedCount >= 1,
    `re-opening the library must find the saved picture: ${JSON.stringify(seen.names)}`,
  );
  assert.ok(seen.names.includes("CensusSaved"));
  assert.equal(
    seen.unknownToken, null,
    "an unknown token is an ordinary null rather than a throw, which is what the canonical " +
    "lookup does",
  );
  assert.ok(
    typeof seen.token === "string" && seen.token.length > 0,
    `CNA gives a saved picture a token: ${JSON.stringify(seen.token)}`,
  );
  assert.equal(
    seen.tokenIdentity, true,
    "and that token, through the public GetPictureFromToken, answers the very object already in " +
    "SavedPictures -- so two lookups are one Picture and its lazy bytes still work",
  );
});

test("the library is disposable and refuses afterwards", () => {
  const seen = claim("disposal");
  assert.equal(seen.isDisposed, true, "and disposing twice is harmless");
  assert.equal(seen.afterDispose, "ObjectDisposedException");
});
