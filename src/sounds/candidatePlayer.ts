import { AudioEngine as Soundscape } from 'soundscape-engine';
import { CANDIDATE_CUES } from './shuffleCandidates.ts';

/**
 * Plays the Shuffle candidates: Soundscape alone, since there was no Shuffle
 * sound before it to compare with. An engine of its own, because loading a
 * cue document replaces the one loaded before, and the game's engine holds
 * the game's.
 */
export interface CandidatePlayer {
  /** Play a candidate's take, `inS` seconds from now, on the audio clock. */
  play(cue: string, inS?: number): void;
  /** Silence every candidate cue, including any still to come from ten in a row. */
  setMuted(muted: boolean): void;
}

/**
 * The player, made by the first tap on the page's one context, the one the
 * gesture unlocked; null where there is no Web Audio.
 */
export function candidatesOnTap(
  context: () => BaseAudioContext | null,
): () => CandidatePlayer | null {
  let player: CandidatePlayer | null = null;
  return () => {
    const made = context();
    if (!made) return null;
    if (!player) {
      const engine = new Soundscape({ context: made });
      // As the game's engine does: the graph is built before initialize()
      // awaits anything, and what it awaits only music uses
      void engine.initialize();
      engine.loadCues(CANDIDATE_CUES);
      player = {
        play: (cue, inS = 0) => engine.playCue(cue, made.currentTime + inS),
        setMuted: (muted) => engine.setCuesMuted(muted),
      };
    }
    return player;
  };
}
