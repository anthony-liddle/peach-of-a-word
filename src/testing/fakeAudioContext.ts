import { vi } from 'vitest';

/**
 * A recording stand-in for the Web Audio API, which jsdom does not have.
 *
 * It keeps every node, connection, parameter change, start and stop, so a test
 * can read back exactly what a cue scheduled. Nothing sounds and nothing runs:
 * time stands still at zero, so every start and stop reads as an offset from
 * the moment the cue was called.
 *
 * Only the calls WebAudioEngine makes are implemented. Anything else is missing
 * on purpose, so a cue that starts using a new automation method fails loudly
 * here instead of being recorded as if it were silent.
 */
class FakeParam {
  readonly events: string[] = [];
  constructor(public value: number) {}
  setValueAtTime(value: number, time: number): this {
    this.events.push(`set ${value} at ${time}`);
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number): this {
    this.events.push(`ramp ${value} at ${time}`);
    return this;
  }
}

class FakeNode {
  readonly outputs: FakeNode[] = [];
  connect<T extends FakeNode>(node: T): T {
    this.outputs.push(node);
    return node;
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);
}

class FakeOscillator extends FakeNode {
  type = 'sine';
  readonly frequency = new FakeParam(440);
  readonly starts: number[] = [];
  readonly stops: number[] = [];
  start(when = 0): void {
    this.starts.push(when);
  }
  stop(when = 0): void {
    this.stops.push(when);
  }
}

export class FakeAudioContext {
  state: 'suspended' | 'running' = 'suspended';
  readonly currentTime = 0;
  resumes = 0;
  readonly destination = new FakeNode();
  readonly gains: FakeGain[] = [];
  readonly oscillators: FakeOscillator[] = [];

  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }

  createOscillator(): FakeOscillator {
    const osc = new FakeOscillator();
    this.oscillators.push(osc);
    return osc;
  }

  resume(): Promise<void> {
    this.resumes += 1;
    this.state = 'running';
    return Promise.resolve();
  }
}

/**
 * Put the fake where the game's engine looks for a real one, window.AudioContext,
 * and return every context constructed through it. This is the no-argument path
 * the game takes: nothing is handed to the engine, so it cannot tell it is being
 * watched. Undo with vi.unstubAllGlobals().
 */
export function installFakeAudio(): { contexts: FakeAudioContext[] } {
  const contexts: FakeAudioContext[] = [];
  class Installed extends FakeAudioContext {
    constructor() {
      super();
      contexts.push(this);
    }
  }
  vi.stubGlobal('AudioContext', Installed);
  return { contexts };
}

/** The gain that feeds the destination: the engine's master. */
function masterOf(ctx: FakeAudioContext): FakeGain | undefined {
  return ctx.gains.find((g) => g.outputs.includes(ctx.destination));
}

function describeOutput(ctx: FakeAudioContext, node: FakeNode): string {
  if (node === ctx.destination) return 'destination';
  if (node === masterOf(ctx)) return 'master';
  if (node instanceof FakeGain) {
    const outputs = node.outputs.map((n) => describeOutput(ctx, n));
    return `gain [${node.gain.events.join(', ')}] to ${outputs.join(' and ')}`;
  }
  return 'an unknown node';
}

/**
 * One line per oscillator, in the order they were made from index `from` on:
 * its waveform, frequency, start and stop, and the envelope it passes through on
 * its way to the master. Two cues that produce the same lines schedule the same
 * sound.
 */
export function describeNotes(ctx: FakeAudioContext, from = 0): string[] {
  return ctx.oscillators.slice(from).map((osc) => {
    const outputs = osc.outputs.map((n) => describeOutput(ctx, n));
    return (
      `${osc.type} ${osc.frequency.value} Hz, ` +
      `start ${osc.starts.join(' and ')}, stop ${osc.stops.join(' and ')}, ` +
      `through ${outputs.join(' and ')}`
    );
  });
}

/** The context's own setup: how often it was resumed, and the master's level. */
export function describeContext(ctx: FakeAudioContext): string {
  const master = masterOf(ctx);
  const level = master
    ? `master gain ${master.gain.value} [${master.gain.events.join(', ')}]`
    : 'no master';
  return `resumed ${ctx.resumes} time(s), ${level} to destination`;
}
