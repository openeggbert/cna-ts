// SPDX-License-Identifier: MS-PL

import { ContentLoadException } from "../Microsoft/Xna/Framework/Content/ContentLoadException.js";

const MIN_MATCH = 2;
const NUM_CHARS = 256;
const PRETREE_NUM_ELEMENTS = 20;
const ALIGNED_NUM_ELEMENTS = 8;
const NUM_PRIMARY_LENGTHS = 7;
const NUM_SECONDARY_LENGTHS = 249;
const PRETREE_MAX_SYMBOLS = PRETREE_NUM_ELEMENTS;
const PRETREE_TABLE_BITS = 6;
const MAINTREE_MAX_SYMBOLS = NUM_CHARS + 50 * 8;
const MAINTREE_TABLE_BITS = 12;
const LENGTH_MAX_SYMBOLS = NUM_SECONDARY_LENGTHS + 1;
const LENGTH_TABLE_BITS = 12;
const ALIGNED_MAX_SYMBOLS = ALIGNED_NUM_ELEMENTS;
const ALIGNED_TABLE_BITS = 7;
const LENTABLE_SAFETY = 64;

const BLOCK_INVALID = 0;
const BLOCK_VERBATIM = 1;
const BLOCK_ALIGNED = 2;
const BLOCK_UNCOMPRESSED = 3;
const DEFAULT_FRAME_SIZE = 0x8000;
const MAX_DECOMPRESSED_SIZE = 256 * 1024 * 1024;

const EXTRA_BITS = (() => {
  const result = new Uint8Array(52);
  for (let index = 0, value = 0; index <= 50; index += 2) {
    result[index] = value;
    result[index + 1] = value;
    if (index !== 0 && value < 17) value += 1;
  }
  return result;
})();

const POSITION_BASE = (() => {
  const result = new Uint32Array(51);
  for (let index = 0, value = 0; index <= 50; index += 1) {
    result[index] = value;
    value += 2 ** EXTRA_BITS[index];
  }
  return result;
})();

class InputCursor {
  readonly #bytes: Uint8Array;
  #position: number;
  #failed = false;

  public constructor(bytes: Uint8Array, position: number) {
    this.#bytes = bytes;
    this.#position = position;
  }

  public ReadByte(): number {
    if (this.#position >= this.#bytes.length) {
      this.#failed = true;
      return -1;
    }
    return this.#bytes[this.#position++];
  }

  public ReadLittleEndianUInt32(): number {
    const b0 = this.ReadByte();
    const b1 = this.ReadByte();
    const b2 = this.ReadByte();
    const b3 = this.ReadByte();
    if ((b0 | b1 | b2 | b3) < 0) {
      this.#failed = true;
      return 0;
    }
    return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
  }

  public CopyTo(target: Uint8Array, targetOffset: number, count: number, limit: number): boolean {
    if (count < 0 || this.#position < 0 || this.#position + count > this.#bytes.length ||
        this.#position + count > limit || targetOffset < 0 || targetOffset + count > target.length) {
      this.#failed = true;
      return false;
    }
    target.set(this.#bytes.subarray(this.#position, this.#position + count), targetOffset);
    this.#position += count;
    return true;
  }

  public SeekRelative(amount: number): void {
    this.#position += amount;
    if (this.#position < 0 || this.#position > this.#bytes.length) this.#failed = true;
  }

  public get Position(): number { return this.#position; }
  public get Failed(): boolean { return this.#failed; }
}

class BitBuffer {
  #buffer = 0;
  #bitsLeft = 0;
  readonly #source: InputCursor;

  public constructor(source: InputCursor) { this.#source = source; }

  public Initialize(): void {
    this.#buffer = 0;
    this.#bitsLeft = 0;
  }

  public EnsureBits(bits: number): void {
    while (this.#bitsLeft < bits) {
      let low = this.#source.ReadByte();
      let high = this.#source.ReadByte();
      if (low < 0) low = 0xff;
      if (high < 0) high = 0xff;
      this.#buffer |= ((high << 8) | low) << (16 - this.#bitsLeft);
      this.#bitsLeft += 16;
    }
  }

  public PeekBits(bits: number): number { return this.#buffer >>> (32 - bits); }
  public RemoveBits(bits: number): void {
    this.#buffer <<= bits;
    this.#bitsLeft -= bits;
  }
  public ReadBits(bits: number): number {
    if (bits === 0) return 0;
    this.EnsureBits(bits);
    const value = this.PeekBits(bits);
    this.RemoveBits(bits);
    return value;
  }
  public get Buffer(): number { return this.#buffer; }
  public get BitsLeft(): number { return this.#bitsLeft; }
}

function makeDecodeTable(
  symbolCount: number,
  tableBits: number,
  lengths: Uint8Array,
  table: Uint16Array,
): boolean {
  let bitNumber = 1;
  let position = 0;
  let tableMask = 2 ** tableBits;
  let bitMask = tableMask / 2;
  let nextSymbol = bitMask;

  while (bitNumber <= tableBits) {
    for (let symbol = 0; symbol < symbolCount; symbol += 1) {
      if (lengths[symbol] === bitNumber) {
        let leaf = position;
        position += bitMask;
        if (position > tableMask) return false;
        for (let fill = bitMask; fill-- > 0;) table[leaf++] = symbol;
      }
    }
    bitMask /= 2;
    bitNumber += 1;
  }

  if (position !== tableMask) {
    for (let symbol = position; symbol < tableMask; symbol += 1) table[symbol] = 0;
    position *= 65536;
    tableMask *= 65536;
    bitMask = 32768;

    while (bitNumber <= 16) {
      for (let symbol = 0; symbol < symbolCount; symbol += 1) {
        if (lengths[symbol] === bitNumber) {
          let leaf = Math.floor(position / 65536);
          for (let fill = 0; fill < bitNumber - tableBits; fill += 1) {
            if (leaf < 0 || leaf >= table.length || (nextSymbol << 1) + 1 >= table.length) {
              return false;
            }
            if (table[leaf] === 0) {
              table[nextSymbol << 1] = 0;
              table[(nextSymbol << 1) + 1] = 0;
              table[leaf] = nextSymbol++;
            }
            leaf = table[leaf] << 1;
            if (((position >>> (15 - fill)) & 1) !== 0) leaf += 1;
          }
          if (leaf < 0 || leaf >= table.length) return false;
          table[leaf] = symbol;
          position += bitMask;
          if (position > tableMask) return false;
        }
      }
      bitMask /= 2;
      bitNumber += 1;
    }
  }

  if (position === tableMask) return true;
  for (let symbol = 0; symbol < symbolCount; symbol += 1) {
    if (lengths[symbol] !== 0) return false;
  }
  return true;
}

function readHuffmanSymbol(
  table: Uint16Array,
  lengths: Uint8Array,
  symbolCount: number,
  tableBits: number,
  bits: BitBuffer,
): number {
  bits.EnsureBits(16);
  const index = bits.PeekBits(tableBits);
  if (index < 0 || index >= table.length) return -1;
  let symbol = table[index];
  if (symbol >= symbolCount) {
    let mask = 2 ** (32 - tableBits);
    do {
      mask >>>= 1;
      symbol = (symbol << 1) | ((bits.Buffer & mask) !== 0 ? 1 : 0);
      if (mask === 0 || symbol < 0 || symbol >= table.length) return -1;
      symbol = table[symbol];
    } while (symbol >= symbolCount);
  }
  if (symbol < 0 || symbol >= lengths.length) return -1;
  const length = lengths[symbol];
  if (length === 0 || length > bits.BitsLeft) return -1;
  bits.RemoveBits(length);
  return symbol;
}

/** Stateful 64 KiB LZX decoder used by the XNB frame layer. */
class LzxDecoder {
  #r0 = 1;
  #r1 = 1;
  #r2 = 1;
  readonly #mainElements: number;
  #headerRead = false;
  #blockType = BLOCK_INVALID;
  #blockLength = 0;
  #blockRemaining = 0;
  #framesRead = 0;
  #intelFileSize = 0;
  #intelCurrentPosition = 0;
  #intelStarted = false;

  readonly #pretreeTable = new Uint16Array((1 << PRETREE_TABLE_BITS) + (PRETREE_MAX_SYMBOLS << 1));
  readonly #pretreeLengths = new Uint8Array(PRETREE_MAX_SYMBOLS + LENTABLE_SAFETY);
  readonly #maintreeTable = new Uint16Array((1 << MAINTREE_TABLE_BITS) + (MAINTREE_MAX_SYMBOLS << 1));
  readonly #maintreeLengths = new Uint8Array(MAINTREE_MAX_SYMBOLS + LENTABLE_SAFETY);
  readonly #lengthTable = new Uint16Array((1 << LENGTH_TABLE_BITS) + (LENGTH_MAX_SYMBOLS << 1));
  readonly #lengthLengths = new Uint8Array(LENGTH_MAX_SYMBOLS + LENTABLE_SAFETY);
  readonly #alignedTable = new Uint16Array((1 << ALIGNED_TABLE_BITS) + (ALIGNED_MAX_SYMBOLS << 1));
  readonly #alignedLengths = new Uint8Array(ALIGNED_MAX_SYMBOLS + LENTABLE_SAFETY);
  readonly #window: Uint8Array;
  readonly #windowSize: number;
  #windowPosition = 0;

  public constructor(windowExponent: number) {
    if (windowExponent < 15 || windowExponent > 21) {
      throw new ContentLoadException("Unsupported LZX window size (must be 15-21)");
    }
    this.#windowSize = 1 << windowExponent;
    this.#window = new Uint8Array(this.#windowSize);
    this.#window.fill(0xdc);
    const positionSlots = windowExponent === 20 ? 42 : windowExponent === 21 ? 50 : windowExponent << 1;
    this.#mainElements = NUM_CHARS + (positionSlots << 3);
  }

  #readLengths(lengths: Uint8Array, first: number, last: number, bits: BitBuffer): boolean {
    for (let index = 0; index < PRETREE_NUM_ELEMENTS; index += 1) {
      this.#pretreeLengths[index] = bits.ReadBits(4);
    }
    if (!makeDecodeTable(PRETREE_MAX_SYMBOLS, PRETREE_TABLE_BITS,
      this.#pretreeLengths, this.#pretreeTable)) return false;

    for (let index = first; index < last;) {
      const symbol = readHuffmanSymbol(
        this.#pretreeTable, this.#pretreeLengths, PRETREE_MAX_SYMBOLS, PRETREE_TABLE_BITS, bits,
      );
      if (symbol < 0) return false;
      if (symbol === 17 || symbol === 18) {
        let count = bits.ReadBits(symbol === 17 ? 4 : 5) + (symbol === 17 ? 4 : 20);
        if (count > last - index) return false;
        while (count-- > 0) lengths[index++] = 0;
      } else if (symbol === 19) {
        let count = bits.ReadBits(1) + 4;
        const delta = readHuffmanSymbol(
          this.#pretreeTable, this.#pretreeLengths, PRETREE_MAX_SYMBOLS, PRETREE_TABLE_BITS, bits,
        );
        if (delta < 0 || count > last - index) return false;
        let value = lengths[index] - delta;
        if (value < 0) value += 17;
        while (count-- > 0) lengths[index++] = value;
      } else {
        let value = lengths[index] - symbol;
        if (value < 0) value += 17;
        lengths[index++] = value;
      }
    }
    return true;
  }

  #readMainTrees(bits: BitBuffer): boolean {
    if (!this.#readLengths(this.#maintreeLengths, 0, 256, bits) ||
        !this.#readLengths(this.#maintreeLengths, 256, this.#mainElements, bits) ||
        !makeDecodeTable(MAINTREE_MAX_SYMBOLS, MAINTREE_TABLE_BITS,
          this.#maintreeLengths, this.#maintreeTable)) return false;
    if (this.#maintreeLengths[0xe8] !== 0) this.#intelStarted = true;
    return this.#readLengths(this.#lengthLengths, 0, NUM_SECONDARY_LENGTHS, bits) &&
      makeDecodeTable(LENGTH_MAX_SYMBOLS, LENGTH_TABLE_BITS, this.#lengthLengths, this.#lengthTable);
  }

  #decodeCompressedRun(run: number, aligned: boolean, bits: BitBuffer, state: number[]): boolean {
    let windowPosition = state[0];
    let localR0 = state[1];
    let localR1 = state[2];
    let localR2 = state[3];
    let remaining = run;

    while (remaining > 0) {
      let mainElement = readHuffmanSymbol(
        this.#maintreeTable, this.#maintreeLengths,
        MAINTREE_MAX_SYMBOLS, MAINTREE_TABLE_BITS, bits,
      );
      if (mainElement < 0) return false;
      if (mainElement < NUM_CHARS) {
        this.#window[windowPosition++] = mainElement;
        remaining -= 1;
        continue;
      }

      mainElement -= NUM_CHARS;
      let matchLength = mainElement & NUM_PRIMARY_LENGTHS;
      if (matchLength === NUM_PRIMARY_LENGTHS) {
        const footer = readHuffmanSymbol(
          this.#lengthTable, this.#lengthLengths, LENGTH_MAX_SYMBOLS, LENGTH_TABLE_BITS, bits,
        );
        if (footer < 0) return false;
        matchLength += footer;
      }
      matchLength += MIN_MATCH;
      if (matchLength > remaining) return false;
      const copiedLength = matchLength;

      const slot = mainElement >> 3;
      let matchOffset: number;
      if (slot > 2) {
        if (slot >= EXTRA_BITS.length || slot >= POSITION_BASE.length) return false;
        let extra = EXTRA_BITS[slot];
        matchOffset = POSITION_BASE[slot] - 2;
        if (aligned) {
          if (extra > 3) {
            extra -= 3;
            const verbatim = bits.ReadBits(extra);
            const low = readHuffmanSymbol(
              this.#alignedTable, this.#alignedLengths,
              ALIGNED_MAX_SYMBOLS, ALIGNED_TABLE_BITS, bits,
            );
            if (low < 0) return false;
            matchOffset += (verbatim << 3) + low;
          } else if (extra === 3) {
            const low = readHuffmanSymbol(
              this.#alignedTable, this.#alignedLengths,
              ALIGNED_MAX_SYMBOLS, ALIGNED_TABLE_BITS, bits,
            );
            if (low < 0) return false;
            matchOffset += low;
          } else if (extra > 0) {
            matchOffset += bits.ReadBits(extra);
          } else {
            matchOffset = 1;
          }
        } else if (slot !== 3) {
          matchOffset += bits.ReadBits(extra);
        } else {
          matchOffset = 1;
        }
        localR2 = localR1;
        localR1 = localR0;
        localR0 = matchOffset;
      } else if (slot === 0) {
        matchOffset = localR0;
      } else if (slot === 1) {
        matchOffset = localR1;
        localR1 = localR0;
        localR0 = matchOffset;
      } else {
        matchOffset = localR2;
        localR2 = localR0;
        localR0 = matchOffset;
      }

      if (matchOffset <= 0 || matchOffset > this.#windowSize) return false;
      let destination = windowPosition;
      let source: number;
      if (windowPosition >= matchOffset) {
        source = destination - matchOffset;
      } else {
        source = destination + this.#windowSize - matchOffset;
        let wrapped = matchOffset - windowPosition;
        if (wrapped < matchLength) {
          matchLength -= wrapped;
          windowPosition += wrapped;
          while (wrapped-- > 0) this.#window[destination++] = this.#window[source++];
          source = 0;
        }
      }
      windowPosition += matchLength;
      while (matchLength-- > 0) this.#window[destination++] = this.#window[source++];
      remaining -= copiedLength;
    }

    state[0] = windowPosition;
    state[1] = localR0;
    state[2] = localR1;
    state[3] = localR2;
    return true;
  }

  public Decompress(
    input: Uint8Array,
    inputOffset: number,
    inputLength: number,
    output: Uint8Array,
    outputOffset: number,
    outputLength: number,
  ): boolean {
    const source = new InputCursor(input, inputOffset);
    const bits = new BitBuffer(source);
    const startPosition = inputOffset;
    let localWindowPosition = this.#windowPosition;
    let localR0 = this.#r0;
    let localR1 = this.#r1;
    let localR2 = this.#r2;
    let remainingOutput = outputLength;

    bits.Initialize();
    if (!this.#headerRead) {
      const intel = bits.ReadBits(1);
      if (intel !== 0) {
        const high = bits.ReadBits(16);
        const low = bits.ReadBits(16);
        this.#intelFileSize = ((high << 16) | low) | 0;
      }
      this.#headerRead = true;
    }

    while (remainingOutput > 0) {
      if (this.#blockRemaining === 0) {
        if (this.#blockType === BLOCK_UNCOMPRESSED) {
          if ((this.#blockLength & 1) !== 0) source.ReadByte();
          bits.Initialize();
        }

        this.#blockType = bits.ReadBits(3);
        this.#blockRemaining = this.#blockLength = (bits.ReadBits(16) << 8) | bits.ReadBits(8);
        if (this.#blockLength <= 0) return false;

        if (this.#blockType === BLOCK_ALIGNED) {
          for (let index = 0; index < ALIGNED_NUM_ELEMENTS; index += 1) {
            this.#alignedLengths[index] = bits.ReadBits(3);
          }
          if (!makeDecodeTable(ALIGNED_MAX_SYMBOLS, ALIGNED_TABLE_BITS,
            this.#alignedLengths, this.#alignedTable) || !this.#readMainTrees(bits)) return false;
        } else if (this.#blockType === BLOCK_VERBATIM) {
          if (!this.#readMainTrees(bits)) return false;
        } else if (this.#blockType === BLOCK_UNCOMPRESSED) {
          this.#intelStarted = true;
          bits.EnsureBits(16);
          if (bits.BitsLeft > 16) source.SeekRelative(-2);
          localR0 = source.ReadLittleEndianUInt32();
          localR1 = source.ReadLittleEndianUInt32();
          localR2 = source.ReadLittleEndianUInt32();
          if (source.Failed) return false;
        } else {
          return false;
        }
      }

      if (source.Position > startPosition + inputLength &&
          (source.Position > startPosition + inputLength + 2 || bits.BitsLeft < 16)) return false;

      while (this.#blockRemaining > 0 && remainingOutput > 0) {
        const run = Math.min(this.#blockRemaining, remainingOutput);
        remainingOutput -= run;
        this.#blockRemaining -= run;
        localWindowPosition &= this.#windowSize - 1;
        if (localWindowPosition + run > this.#windowSize) return false;

        if (this.#blockType === BLOCK_VERBATIM || this.#blockType === BLOCK_ALIGNED) {
          const state = [localWindowPosition, localR0, localR1, localR2];
          if (!this.#decodeCompressedRun(run, this.#blockType === BLOCK_ALIGNED, bits, state)) return false;
          [localWindowPosition, localR0, localR1, localR2] = state;
        } else if (this.#blockType === BLOCK_UNCOMPRESSED) {
          if (!source.CopyTo(this.#window, localWindowPosition, run, startPosition + inputLength)) return false;
          localWindowPosition += run;
        } else {
          return false;
        }
      }
    }

    let outputStart = localWindowPosition === 0 ? this.#windowSize : localWindowPosition;
    outputStart -= outputLength;
    if (outputStart < 0 || outputStart + outputLength > this.#window.length ||
        outputOffset < 0 || outputOffset + outputLength > output.length) return false;
    output.set(this.#window.subarray(outputStart, outputStart + outputLength), outputOffset);

    this.#windowPosition = localWindowPosition;
    this.#r0 = localR0;
    this.#r1 = localR1;
    this.#r2 = localR2;
    // XNA Content Pipeline XNB streams do not use CAB's optional Intel E8 transform. The
    // authoritative XNA/FNA/CNA path rejects a stream that advertises it instead of returning
    // bytes that still require an unimplemented post-transform.
    if (this.#framesRead++ < 32768 && this.#intelFileSize !== 0) {
      if (outputLength <= 6 || !this.#intelStarted) this.#intelCurrentPosition += outputLength;
      return false;
    }
    return true;
  }
}

function failure(assetName: string, reason: string): ContentLoadException {
  return new ContentLoadException(`Error loading '${assetName}'. Invalid LZX stream: ${reason}`);
}

/** Decode the XNA XNB frame layer around one persistent 64 KiB LZX decoder. */
export function decompressXnbLzxForInternalUse(
  compressed: Uint8Array,
  decompressedSize: number,
  assetName: string,
): Uint8Array {
  if (!(compressed instanceof Uint8Array)) throw failure(assetName, "compressed payload is not bytes");
  if (!Number.isInteger(decompressedSize) || decompressedSize < 0 ||
      decompressedSize > MAX_DECOMPRESSED_SIZE) {
    throw failure(assetName, `invalid decompressed size ${decompressedSize}`);
  }

  const decoder = new LzxDecoder(16);
  const output = new Uint8Array(decompressedSize);
  let inputPosition = 0;
  let outputPosition = 0;
  while (inputPosition < compressed.length) {
    if (compressed.length - inputPosition < 2) throw failure(assetName, "truncated frame header");
    const high = compressed[inputPosition];
    const low = compressed[inputPosition + 1];
    let frameSize = DEFAULT_FRAME_SIZE;
    let blockSize: number;
    let headerSize: number;
    if (high === 0xff) {
      if (compressed.length - inputPosition < 5) throw failure(assetName, "truncated extended frame header");
      frameSize = (low << 8) | compressed[inputPosition + 2];
      blockSize = (compressed[inputPosition + 3] << 8) | compressed[inputPosition + 4];
      headerSize = 5;
    } else {
      blockSize = (high << 8) | low;
      headerSize = 2;
    }

    if (frameSize === 0 || blockSize === 0) {
      if (outputPosition !== decompressedSize) {
        throw failure(assetName, frameSize === 0 ? "invalid frame length 0" : "invalid block length 0");
      }
      for (let index = inputPosition; index < compressed.length; index += 1) {
        if (compressed[index] !== 0) throw failure(assetName, "invalid data after the end marker");
      }
      inputPosition = compressed.length;
      break;
    }
    if (frameSize > DEFAULT_FRAME_SIZE) throw failure(assetName, `invalid frame length ${frameSize}`);
    if (frameSize > decompressedSize - outputPosition) {
      throw failure(assetName, "frame exceeds the declared decompressed size");
    }
    const blockStart = inputPosition + headerSize;
    if (blockSize > compressed.length - blockStart) throw failure(assetName, "truncated compressed payload");
    if (!decoder.Decompress(compressed, blockStart, blockSize, output, outputPosition, frameSize)) {
      throw failure(assetName, "decoder failure");
    }
    outputPosition += frameSize;
    inputPosition = blockStart + blockSize;
  }

  if (outputPosition !== decompressedSize) {
    throw failure(assetName, `decoded ${outputPosition} bytes; expected ${decompressedSize}`);
  }
  return output;
}
