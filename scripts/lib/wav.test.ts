import { describe, expect, test } from 'vitest';
import { encodeWav } from './wav.ts';

describe('encodeWav', () => {
  const samples = Float32Array.from([0, 0.5, -0.25, 1e-6]);
  const wav = encodeWav(samples, 48000);

  test('writes a mono 48 kHz IEEE float header', () => {
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.readUInt32LE(4)).toBe(wav.length - 8);
    expect(wav.toString('ascii', 8, 16)).toBe('WAVEfmt ');
    expect(wav.readUInt16LE(20)).toBe(3);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(48000);
    expect(wav.readUInt32LE(28)).toBe(48000 * 4);
    expect(wav.readUInt16LE(32)).toBe(4);
    expect(wav.readUInt16LE(34)).toBe(32);
    expect(wav.toString('ascii', 38, 42)).toBe('fact');
    expect(wav.readUInt32LE(46)).toBe(4);
    expect(wav.toString('ascii', 50, 54)).toBe('data');
    expect(wav.readUInt32LE(54)).toBe(16);
  });

  test('carries the samples bit for bit', () => {
    const back = new Float32Array(
      wav.buffer.slice(wav.byteOffset + 58, wav.byteOffset + wav.length),
    );
    expect(Array.from(back)).toEqual(Array.from(samples));
  });
});
