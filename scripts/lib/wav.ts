/**
 * A mono WAV of 32-bit float samples: the render exactly as the browser made it,
 * with nothing rounded to 16 bits. IEEE float is format 3, which the format asks
 * to carry a fact chunk with the sample count.
 */
export function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
  const dataBytes = samples.length * 4;
  const header = Buffer.alloc(58);
  let o = 0;
  const str = (s: string) => {
    header.write(s, o, 'ascii');
    o += 4;
  };
  const u32 = (n: number) => {
    header.writeUInt32LE(n, o);
    o += 4;
  };
  const u16 = (n: number) => {
    header.writeUInt16LE(n, o);
    o += 2;
  };
  str('RIFF');
  u32(header.length - 8 + dataBytes);
  str('WAVE');
  str('fmt ');
  u32(18);
  u16(3); // IEEE float
  u16(1); // mono
  u32(sampleRate);
  u32(sampleRate * 4); // bytes per second
  u16(4); // bytes per frame
  u16(32); // bits per sample
  u16(0); // no extension
  str('fact');
  u32(4);
  u32(samples.length);
  str('data');
  u32(dataBytes);
  const data = Buffer.from(samples.buffer, samples.byteOffset, dataBytes);
  return Buffer.concat([header, data]);
}

/**
 * The samples of a WAV written by encodeWav, or null for anything else: a
 * different layout is not one this baseline wrote, so it is not reused.
 */
export function decodeWav(wav: Buffer): Float32Array | null {
  if (
    wav.length < 58 ||
    wav.toString('ascii', 0, 4) !== 'RIFF' ||
    wav.toString('ascii', 8, 16) !== 'WAVEfmt ' ||
    wav.readUInt16LE(20) !== 3 ||
    wav.readUInt16LE(22) !== 1 ||
    wav.toString('ascii', 50, 54) !== 'data'
  )
    return null;
  const bytes = wav.readUInt32LE(54);
  const samples = new Float32Array(bytes / 4);
  new Uint8Array(samples.buffer).set(wav.subarray(58, 58 + bytes));
  return samples;
}
