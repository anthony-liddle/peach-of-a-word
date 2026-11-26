import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameData } from '@/data/gameData.ts';
import type { AudioEngine } from '@/audio/AudioEngine.ts';
import { GameStorage } from '@/persistence/storage.ts';
import {
  useAnnouncedText,
  useGame,
  type GameApi,
  type Glint,
} from './useGame.ts';
import { useTheme } from './useTheme.ts';
import { useLengthCounts } from './useLengthCounts.ts';
import { copy } from './themeCopy.ts';
import { boardCostume } from './costumes.ts';
import { applyFavicon } from './favicon.ts';
import { useWideBoard } from './useWideBoard.ts';
import { FoundList } from './components/FoundList.tsx';
import {
  TRANSFER_LINK_SHOWN,
  TransferLink,
} from './components/TransferLink.tsx';
import { TierMeter } from './components/TierMeter.tsx';
import { ShareButton } from './components/ShareButton.tsx';
import { Reveal, type QuietCategory } from './components/Reveal.tsx';
import { HowItWorks } from './components/HowItWorks.tsx';
import { EditionCard } from './components/EditionCard.tsx';
import { Confetti } from './components/Confetti.tsx';
import { DevCardProbe } from './DevCardProbe.tsx';
import { Decorations } from './components/Decorations.tsx';
import { ComposingStick } from './components/ComposingStick.tsx';
import { TypeCase } from './components/TypeCase.tsx';
import { Controls } from './components/Controls.tsx';
import { SettingsMenu } from './components/SettingsMenu.tsx';
import { useGlobalKeys } from './useGlobalKeys.ts';
import { useDefinitions } from './useDefinitions.ts';
import { classifyWord } from '@/engine/index.ts';
import { FlagsContext, type FlagsUI } from '@/flags/context.ts';
import { deviceFlags } from '@/flags/device.ts';
import type { Board } from '@/flags/flags.ts';
import { dayOfIndex } from '@/flags/model.ts';
import { YourFlags } from './components/YourFlags.tsx';
import { FLAGGING_SHOWN } from '@/flags/shown.ts';
import { SuggestAsk } from './components/SuggestAsk.tsx';
import { rushByDefault } from '@/rush/shown.ts';
import { useRush } from '@/rush/useRush.ts';
import { rushStanding } from '@/rush/offer.ts';
import { owedOldPeach } from '@/rush/settle.ts';
import { debugRunKind } from '@/rush/debug.ts';
import { useLongerClock } from './useLongerClock.ts';
import { EndAsk, RunChip, RunEndCard, RunView } from './components/Rush.tsx';

interface QuietState {
  word: string;
  category: QuietCategory;
  status: 'loading' | 'ready';
  definition: string | null;
  trigger: HTMLElement | null;
  /** Opened from a run's result, so it says Close and closes onto it. */
  fromRun?: boolean;
}

/**
 * The peach of a word's card opens by itself this long after a run's result,
 * so Time's up and its beat come first.
 */
export const RUN_PEACH_MS = 1200;

/** How long a Mythic's glint stays drawn: its sweep, and a little after. */
export const GLINT_MS = 1200;

/** Honour the OS reduced-motion setting. Confetti is pure motion, so suppress it. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

interface Props {
  data: GameData;
  audio: AudioEngine;
  storage: GameStorage;
  /**
   * Whether the game shows its ways into flagging. `FLAGGING_SHOWN` as it
   * ships; the tests that hold the flag's behaviour turn it on.
   */
  flagging?: boolean;
  /**
   * Whether the game shows Peach rush. `RUSH_SHOWN` as it ships, or `?rush`
   * in a development build (`rushByDefault`); the run's tests turn it on.
   */
  rush?: boolean;
}

export function Game({
  data,
  audio,
  storage,
  flagging = FLAGGING_SHOWN,
  rush = rushByDefault(),
}: Props) {
  const game = useGame(data, audio, storage);

  // Peach rush, on today's board. The hook runs either way, as hooks must,
  // and writes nothing until a run is started, which only its screen does.
  const [longerClock] = useLongerClock();
  const run = useRush({
    puzzle: game.daily.puzzle,
    sourceEntry: game.daily.sourceEntry,
    dayIndex: game.daily.dayIndex ?? 0,
    storage,
    audio,
    longerClock,
    onCarry: game.carry,
    shown: rush,
  });
  const [view, setView] = useState<'board' | 'run'>(() =>
    rush && debugRunKind() ? 'run' : 'board',
  );
  const [runEndOpen, setRunEndOpen] = useState(() => {
    const kind = rush ? debugRunKind() : null;
    return kind === 'end' || kind === 'end-nopeach';
  });
  const [asking, setAsking] = useState(() => rush && debugRunKind() === 'ask');
  // The peach of a word's card over the result: opened by itself, or from
  // the result's word, which gets the focus back.
  const [runPeach, setRunPeach] = useState<HTMLElement | 'auto' | null>(null);
  const runPhase = run.phase;
  const standing = rush
    ? rushStanding({
        played: run.record !== null,
        waiting:
          runPhase === 'paused' ||
          runPhase === 'elsewhere' ||
          runPhase === 'running',
        basketFound: game.daily.found.length,
        openedBefore: storage.openedBefore(game.daily.dayIndex ?? 0),
        canSave: storage.persistent,
      })
    : null;

  // The "How the words work" explainer. Its open flag is lifted here so the
  // global key handler can stand down while it is up (the same precedent as the
  // reveal), and so focus can return to the trigger on close.
  const [howOpen, setHowOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Dev only: the card probe's target, read once from the URL. See
  // `DevCardProbe` for why it exists and what it is allowed to render.
  const [probe, setProbe] = useState<{
    word: string;
    rack: string | null;
    register: 'quiet' | 'crown';
  } | null>(() => {
    if (!import.meta.env.DEV) return null;
    const params = new URLSearchParams(window.location.search);
    const word = params.get('card');
    if (!word) return null;
    return {
      word,
      rack: params.get('rack'),
      register: params.get('register') === 'crown' ? 'crown' : 'quiet',
    };
  });
  const howTriggerRef = useRef<HTMLButtonElement>(null);
  const closeHow = useCallback(() => {
    setHowOpen(false);
    howTriggerRef.current?.focus();
  }, []);

  const { state } = game;
  const [theme] = useTheme();
  const [lengthCounts] = useLengthCounts();
  // What the peach wears on this board, by the board's own date, never
  // today's: Endless has no date and letterpress never dresses. A development
  // build previews any date from the address, ?costumeDate=YYYY-MM-DD; the
  // guard compiles the read out of production.
  const costume = boardCostume(
    state.dayIndex,
    theme,
    import.meta.env.DEV ? window.location.search : null,
  );
  // The tab icon follows the board. A theme toggle resets it to the theme's
  // mark first (useTheme), and this puts the costume back.
  useEffect(() => applyFavicon(theme, costume), [theme, costume]);
  // Which column the board is in, and so where the tier meter goes. One node,
  // one place, decided here rather than by a stylesheet that cannot reparent.
  const wide = useWideBoard();
  // Frozen at the moment of the find, so re-skinning never re-speaks it.
  const spokenAnnouncement = useAnnouncedText(
    state.announcement,
    state.mode,
    theme,
  );

  const { getDefinition } = useDefinitions(state.puzzle.sourceWord);

  const [quiet, setQuiet] = useState<QuietState | null>(null);

  // This device's flags, and the board a card's flag names: the daily's day,
  // or the web Endless's rack, which is the board's long word.
  const flags = useMemo(() => deviceFlags(), []);
  const board = useMemo<Board | null>(
    () =>
      state.mode === 'endless'
        ? { rack: state.puzzle.sourceWord }
        : state.dayIndex !== null
          ? { day: dayOfIndex(state.dayIndex, data.dailyCalendar.epoch) }
          : null,
    [state.mode, state.puzzle.sourceWord, state.dayIndex, data],
  );
  // Flags still waiting go on load, when the network comes back, and when
  // the tab is seen again; the sender keeps those to once every 10 minutes.
  // Only while flagging is shown: hidden, the website sends nothing, and a
  // flag already waiting stays in the browser until it's back.
  useEffect(() => {
    if (!flagging) return;
    void flags.send('load');
    const online = () => void flags.send('online');
    const visible = () => {
      if (document.visibilityState === 'visible') void flags.send('visible');
    };
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [flags, flagging]);

  // Your flags opens on its own (Antoine, 22 November): from Settings' row,
  // which closes Settings, or over a card from its line. Closing it goes back
  // where it came from: Settings, open, with focus on the row; or the card,
  // with focus on the link.
  const [yourFlags, setYourFlags] = useState<{
    from: 'settings' | 'card';
    back: HTMLElement | null;
  } | null>(null);
  const backToFlagsRow = useRef(false);
  const openYourFlagsFromSettings = useCallback(() => {
    setSettingsOpen(false);
    setYourFlags({ from: 'settings', back: null });
  }, []);
  const closeYourFlags = useCallback(() => {
    if (yourFlags?.from === 'settings') {
      backToFlagsRow.current = true;
      setSettingsOpen(true);
    } else if (yourFlags?.back?.isConnected) {
      yourFlags.back.focus({ preventScroll: true });
    }
    setYourFlags(null);
  }, [yourFlags]);
  // After Settings' own effect has put focus on its first control: a child's
  // effects run before its parent's.
  useEffect(() => {
    if (!settingsOpen || !backToFlagsRow.current) return;
    backToFlagsRow.current = false;
    document.querySelector<HTMLElement>('.flags__row')?.focus();
  }, [settingsOpen]);
  const flagsUI = useMemo<FlagsUI>(
    () => ({
      flags,
      board,
      mode: state.mode,
      // The link itself, passed in: Safari doesn't focus a button on a click,
      // so the active element there would be the card.
      openYourFlags: (trigger) => setYourFlags({ from: 'card', back: trigger }),
    }),
    [flags, board, state.mode],
  );

  // The refused word's popup: the word it asks about, and the flag that
  // opened it, which Cancel gives the focus back to.
  const [suggesting, setSuggesting] = useState<{
    word: string;
    back: HTMLElement;
  } | null>(null);

  // A word's card owns the keyboard while it is open, as the crown's card
  // (`revealOpen`) and the explainer do: Enter is its way out's, and no key
  // reaches the board behind it.
  const tilesRef = useRef<HTMLDivElement>(null);
  // The popover's arrows, Space and Escape are its own while it is open, and
  // so are Your flags' and the refused word's popup's.
  useGlobalKeys(
    game,
    howOpen ||
      quiet !== null ||
      settingsOpen ||
      yourFlags !== null ||
      suggesting !== null ||
      view === 'run',
    tilesRef,
  );

  const cancelSuggest = useCallback(() => {
    const back = suggesting?.back;
    setSuggesting(null);
    if (back?.isConnected) back.focus({ preventScroll: true });
  }, [suggesting]);

  // Suggest: the flag is made and sent, and the focus goes to the letters,
  // where the next key lands anyway. The line says sent or saved only once
  // the send has answered, and only if the refusal is still on show.
  const { suggested } = game;
  const sendSuggest = useCallback(async () => {
    if (!suggesting || !board) return;
    const { word } = suggesting;
    setSuggesting(null);
    tilesRef.current?.focus({ preventScroll: true });
    if (
      (await flags.flag({ word, reason: 'should-count', board })) !== 'made'
    ) {
      return;
    }
    const made = flags
      .list()
      .find((f) => f.word === word && f.reason === 'should-count');
    suggested(word, made?.state === 'sent');
  }, [suggesting, board, flags, suggested]);

  const onWordTap = useCallback(
    (word: string, trigger: HTMLElement, fromRun = false) => {
      if (word === state.puzzle.sourceWord) {
        if (fromRun) setRunPeach(trigger);
        else game.openReveal();
        return;
      }
      const category = classifyWord(word, state.puzzle) as QuietCategory;
      setQuiet({
        word,
        category,
        status: 'loading',
        definition: null,
        trigger,
        fromRun,
      });
      void getDefinition(word).then((definition) => {
        setQuiet((q) =>
          q && q.word === word ? { ...q, status: 'ready', definition } : q,
        );
      });
    },
    [game, state.puzzle, getDefinition],
  );

  const closeQuiet = useCallback(() => setQuiet(null), []);

  // The clock running out, or End, opens the result.
  const lastRunPhase = useRef(runPhase);
  useEffect(() => {
    if (
      lastRunPhase.current !== 'over' &&
      runPhase === 'over' &&
      view === 'run'
    )
      setRunEndOpen(true);
    lastRunPhase.current = runPhase;
  }, [runPhase, view]);

  // The peach of a word's card opens by itself on the result, once, a moment
  // after Time's up, with Close and no Share, as the app decided.
  const owed = run.record?.peachCardOwed ?? false;
  const { cardShown } = run;
  useEffect(() => {
    if (!runEndOpen || !owed || runPeach) return;
    const wait = debugRunKind() === 'end' ? 0 : RUN_PEACH_MS;
    const id = setTimeout(() => {
      setRunPeach('auto');
      cardShown();
    }, wait);
    return () => clearTimeout(id);
  }, [runEndOpen, owed, runPeach, cardShown]);

  // An earlier day's run that found its peach of a word and ended unseen,
  // settled at this load (`settleOldRun`): its card opens once, now.
  const [oldPeach, setOldPeach] = useState(() =>
    rush ? owedOldPeach(storage, game.daily.dayIndex ?? 0) : null,
  );
  const closeOldPeach = useCallback(() => {
    if (oldPeach)
      storage.saveRun(
        oldPeach.dayIndex,
        { ...oldPeach.record, peachCardOwed: false },
        true,
      );
    setOldPeach(null);
  }, [oldPeach, storage]);

  const openRun = useCallback(() => {
    setView('run');
    if (run.record) setRunEndOpen(true);
  }, [run.record]);
  const { pause: pauseRun, end: endRun } = run;
  const backToBoard = useCallback(() => {
    pauseRun();
    setView('board');
  }, [pauseRun]);
  const toBasket = useCallback(() => {
    setRunEndOpen(false);
    setRunPeach(null);
    setView('board');
    game.setMode('daily');
    // Where typing goes, as Keep playing on the completion card does.
    setTimeout(() => tilesRef.current?.focus({ preventScroll: true }), 0);
  }, [game]);
  const endAsked = useCallback(() => {
    setAsking(false);
    endRun();
  }, [endRun]);
  // Back where typing goes; a paused run's view puts Resume first.
  const keepAsked = useCallback(() => {
    setAsking(false);
    setTimeout(
      () =>
        document
          .querySelector<HTMLElement>('.board--run .case')
          ?.focus({ preventScroll: true }),
      0,
    );
  }, []);

  // One Share, built once, wherever it is offered: the found list, and the two
  // cards that open for the big finds, quiet on a card under its own button.
  // The same props everywhere, so the text a card copies is the list's at that
  // moment by construction.
  const share = (variant?: 'quiet') => (
    <ShareButton
      puzzle={state.puzzle}
      found={state.found}
      mode={state.mode}
      date={new Date()}
      variant={variant}
    />
  );

  // Keep playing puts focus back where typing goes, as it says: the letter
  // tiles, as a letter typed on a chip does (useGlobalKeys). It used to land
  // on the found list's Share and scroll the page to it, which was the stand-in
  // for Share on the card. With Share on the card, nothing moves.
  const dismissEdition = useCallback(() => {
    game.closeEdition();
    tilesRef.current?.focus({ preventScroll: true });
  }, [game]);
  const editionCard = state.editionOpen && (
    <EditionCard
      theme={theme}
      costume={costume}
      onClose={dismissEdition}
      share={share('quiet')}
    />
  );

  // Fire the cute confetti once, on the completion beat. The pulse increments
  // only on the completing submit, so a mode switch or a reload of an already
  // complete puzzle never re-fires. Cute only; suppressed under reduced motion.
  const [confettiOn, setConfettiOn] = useState(false);
  const lastPulse = useRef(game.editionPulse);
  useEffect(() => {
    if (game.editionPulse === lastPulse.current) return;
    lastPulse.current = game.editionPulse;
    if (theme === 'cute' && !prefersReducedMotion()) setConfettiOn(true);
  }, [game.editionPulse, theme]);
  const endConfetti = useCallback(() => setConfettiOn(false), []);

  // A new Mythic find's gem glints, once: the GDD's "Mythic earning a touch
  // more sparkle in cute". Cute only, never under reduced motion, and only for
  // a find made by play: a board that opens with Mythics in its list has no
  // glint to give (`Glint`). Each mode keeps its own slice, so the last glint
  // seen is kept per mode, and coming back to a board never replays its last
  // one. The first sight of a mode's board only records it.
  const [glinting, setGlinting] = useState<Glint | null>(null);
  const glintSeen = useRef(
    new Map<string, Glint | null>([[state.mode, state.glint]]),
  );
  useEffect(() => {
    const before = glintSeen.current.get(state.mode);
    glintSeen.current.set(state.mode, state.glint);
    if (before === undefined || !state.glint || state.glint === before) return;
    if (theme === 'cute' && !prefersReducedMotion()) setGlinting(state.glint);
  }, [state.glint, state.mode, theme]);
  // Gone after one sweep, so nothing that redraws the chip can replay it.
  useEffect(() => {
    if (!glinting) return;
    const done = setTimeout(() => setGlinting(null), GLINT_MS);
    return () => clearTimeout(done);
  }, [glinting]);

  return (
    // With flagging hidden there is no flags context, so no card, no well and
    // no Your flags offers a way in, and the sending above doesn't run.
    <FlagsContext.Provider value={flagging ? flagsUI : null}>
      <div className="app">
        {/* The run takes the page: the masthead, the toolbar, the ornaments
            and the footer step aside, so it fits a phone at the largest text. */}
        {view === 'board' && <Decorations celebrate={state.editionOpen} />}
        {view === 'board' && <Masthead />}
        {!storage.persistent && (
          <p className="storage-note">
            This browser is not saving progress. Your words will be lost when
            you leave or reload.
          </p>
        )}
        {view === 'board' && (
          <Toolbar
            game={game}
            settingsOpen={settingsOpen}
            onSettingsOpenChange={setSettingsOpen}
            onOpenFlags={openYourFlagsFromSettings}
            rush={rush}
            chip={
              standing && state.mode === 'daily' ? (
                <RunChip
                  standing={standing}
                  record={run.record}
                  leftMs={run.leftMs}
                  clockMs={run.clockMs}
                  onOpen={openRun}
                />
              ) : null
            }
          />
        )}

        {view === 'run' ? (
          <RunView
            run={run}
            keysOff={
              runEndOpen ||
              runPeach !== null ||
              asking ||
              quiet !== null ||
              oldPeach !== null
            }
            onBack={backToBoard}
            onAskEnd={() => setAsking(true)}
          />
        ) : (
          <div className="board">
            <div className="play">
              {/* Narrow widths only: the meter sits above the well, the way the app
              has it. At two-column widths it stays in the glossary in the right
              column, in exactly the place it has always been.

              Ungated, unlike its glossary twin. `.summary` appears with the
              first find, and a meter that appears is a meter whose height
              arrives later: it would shove the well and the rack down mid-play,
              on the first word of the day. Zeros on an empty board are honest;
              furniture that materialises under a thumb is not. */}
              {!wide && (
                <TierMeter
                  tier={state.tier}
                  theme={theme}
                  streak={game.streak}
                />
              )}
              <ComposingStick
                game={game}
                glint={glinting}
                onWordTap={onWordTap}
                onSuggest={(word, back) => setSuggesting({ word, back })}
              />
              <TypeCase game={game} ref={tilesRef} />
              <Controls game={game} />
            </div>

            <FoundList
              puzzle={state.puzzle}
              found={state.found}
              tier={state.tier}
              theme={theme}
              costume={costume}
              glint={glinting}
              lengthCounts={lengthCounts}
              showTier={wide}
              onWordTap={onWordTap}
              summaryExtra={share()}
            />

            {/* Two-column widths only: the completion card lands over the top of
            the glossary's column, beside the well and the rack rather than on
            them, since play goes on under it. On a phone it is over the page,
            below. One node, placed here like the meter. */}
            {wide && editionCard}
          </div>
        )}

        {view === 'board' && (
          <Colophon
            triggerRef={howTriggerRef}
            onOpenHow={() => setHowOpen(true)}
          />
        )}

        {asking && <EndAsk onEnd={endAsked} onKeep={keepAsked} />}

        {view === 'run' && runEndOpen && run.record && (
          <RunEndCard
            record={run.record}
            slice={run.slice}
            date={new Date()}
            onBasket={toBasket}
            onOpenWord={(w, t) => onWordTap(w, t, true)}
          />
        )}
        {runPeach && (
          <Reveal
            register="crown"
            theme={theme}
            word={run.slice.puzzle.sourceWord}
            entry={run.slice.sourceEntry}
            costume={costume}
            closeLabel="Close"
            returnFocusTo={runPeach === 'auto' ? null : runPeach}
            onClose={() => setRunPeach(null)}
          />
        )}
        {oldPeach && !runPeach && (
          <Reveal
            register="crown"
            theme={theme}
            word={oldPeach.record.sourceWord}
            entry={data.sourceEntry(oldPeach.record.sourceWord)}
            costume={null}
            closeLabel="Close"
            onClose={closeOldPeach}
          />
        )}

        {/* Screen-reader announcements: found words, tier changes, the crown.
          Settled when the find happens, never re-resolved under it. */}
        <div className="visually-hidden" role="status" aria-live="polite">
          {spokenAnnouncement}
        </div>

        {!wide && view === 'board' && editionCard}

        {confettiOn && <Confetti onDone={endConfetti} costume={costume} />}

        {/* Dev only: ?card=<word> opens that word's card with its real gloss.
          Compiled out of production by the env guard. See DevCardProbe. */}
        {import.meta.env.DEV && probe ? (
          <DevCardProbe
            word={probe.word}
            rack={probe.rack}
            register={probe.register}
            theme={theme}
            costume={costume}
            onClose={() => setProbe(null)}
          />
        ) : state.revealOpen ? (
          <Reveal
            register="crown"
            theme={theme}
            word={state.puzzle.sourceWord}
            entry={state.sourceEntry}
            costume={costume}
            onClose={game.closeReveal}
            share={share('quiet')}
          />
        ) : quiet ? (
          <Reveal
            theme={theme}
            register="quiet"
            word={quiet.word}
            category={quiet.category}
            status={quiet.status}
            definition={quiet.definition}
            returnFocusTo={quiet.trigger}
            closeLabel={quiet.fromRun ? 'Close' : undefined}
            onClose={closeQuiet}
          />
        ) : null}

        {howOpen && <HowItWorks onClose={closeHow} />}

        {yourFlags && (
          <YourFlags
            onClose={closeYourFlags}
            overCard={yourFlags.from === 'card'}
          />
        )}

        {suggesting && (
          <SuggestAsk
            word={suggesting.word}
            onSuggest={() => void sendSuggest()}
            onCancel={cancelSuggest}
          />
        )}
      </div>
    </FlagsContext.Provider>
  );
}

function Masthead() {
  const [theme] = useTheme();
  return (
    <header className="masthead">
      {/* Keep this line in sync with the OG card kicker baked by
          scripts/build-icons.ts (rendered there in small caps). */}
      <p className="masthead__kicker">A game about finding words in words</p>
      <h1 className="masthead__title">
        <em>Peach</em> of a Word
      </h1>
      <p className="masthead__rule">{copy(theme).mastheadSubline}</p>
    </header>
  );
}

function Toolbar({
  game,
  settingsOpen,
  onSettingsOpenChange,
  onOpenFlags,
  rush,
  chip,
}: {
  game: GameApi;
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  onOpenFlags: () => void;
  /** Peach rush is shown, so Settings has Longer clock. */
  rush: boolean;
  /** Peach rush's button, while there's a run to reach. */
  chip: React.ReactNode;
}) {
  const { state } = game;
  // The streak has one home at any given width, never two at the same one. At
  // narrow widths it is the flame in the tier meter, above the well; here it is
  // the pill. The pill survives at two-column widths because the meter there
  // lives in the glossary, which only appears with the first find. A returning
  // player opening a fresh board would otherwise see no streak at all until
  // they found a word, and the streak is not the stat to make someone earn
  // twice.
  const wide = useWideBoard();
  return (
    <div className={settingsOpen ? 'toolbar toolbar--raised' : 'toolbar'}>
      <div className="modes" role="group" aria-label="Mode">
        <button
          aria-pressed={state.mode === 'daily'}
          onClick={() => game.setMode('daily')}
        >
          Daily
        </button>
        <button
          aria-pressed={state.mode === 'endless'}
          onClick={() => game.setMode('endless')}
        >
          Endless
        </button>
      </div>

      <div className="toolbar__right">
        {chip}
        {state.mode === 'daily' ? (
          wide && (
            <span className="chip" title="Days cleared in a row">
              Streak <strong>{game.streak}</strong>
            </span>
          )
        ) : (
          <button className="btn btn--header" onClick={game.newEndless}>
            New puzzle
          </button>
        )}
        {state.sourceRevealed && (
          <button
            className="iconbtn iconbtn--crown"
            onClick={game.openReveal}
            aria-label="Open the peach of a word's card"
            title="The peach of a word"
          >
            ✦
          </button>
        )}
        {/* The theme, the appearance, the text size and sound, in one
            popover: see SettingsMenu. */}
        <SettingsMenu
          open={settingsOpen}
          onOpenChange={onSettingsOpenChange}
          muted={game.muted}
          onToggleMute={game.toggleMute}
          onOpenFlags={onOpenFlags}
          rush={rush}
        />
      </div>
    </div>
  );
}

function Colophon({
  triggerRef,
  onOpenHow,
}: {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onOpenHow: () => void;
}) {
  const [theme] = useTheme();
  return (
    <footer className="colophon">
      Words from ENABLE, in the public domain, and SCOWL, by Kevin Atkinson,
      with my own patch list. Etymologies and most definitions adapted from
      Wiktionary, CC BY-SA 4.0. A few definitions were written for this game.
      <br />
      {copy(theme).typeCredit}
      <br />
      {/* The quiet expansion of the colophon: where a curious person already
          looks. Kept out of the play surface on purpose. */}
      <button
        ref={triggerRef}
        type="button"
        className="colophon__how"
        onClick={onOpenHow}
      >
        How the words work
      </button>
      {/* Beside the other quiet expansion rather than in a chrome bar of its
          own. Someone looking for what a game does with their data looks at
          the bottom of it, and the App Store record points here too, so this
          link is the one route both audiences already take. */}
      <a className="colophon__privacy" href="/privacy">
        Privacy
      </a>
      {/* The way to the transfer page, and the only one from a Home Screen
          icon. See TransferLink. */}
      {TRANSFER_LINK_SHOWN && <TransferLink />}
      {/* The title says what the game is to everyone; this says who it is for
          to the one person meant to notice it. Unornamented on purpose. */}
      <p className="colophon__dedication">for Bea</p>
    </footer>
  );
}
