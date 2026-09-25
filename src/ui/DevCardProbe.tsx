import { useEffect, useState } from 'react';
import { Reveal, type QuietCategory } from './components/Reveal.tsx';
import { createDefinitionLookup } from '../data/definitions.ts';
import { assetUrl } from '../data/gameData.ts';

/**
 * Open a definition card or a source reveal for a named word, in dev only.
 *
 * **It exists for the credit line, not the layout.** What a card says about who
 * wrote its definition depends on the word, and the 38 words where the answer
 * is interesting are scattered across the year: reaching `tulpa` through play
 * means waiting for the rack that forms it and then finding it. The app has
 * carried `-revealCard <word>` for exactly this reason since the reveal's
 * detent needed checking against the longest entry in the corpus; this is the
 * same affordance on this side, so a claim can be checked in both consumers the
 * same way.
 *
 * Real data, never a stand-in: the gloss comes out of the shipped rack bundle
 * and the etymology out of the shipped source pool, so what appears is what a
 * player would see. A probe that rendered invented text could not answer the
 * question it is here to answer.
 *
 *   ?card=tulpa&rack=populate      the quiet register, a found word's card
 *   ?card=eighteen&register=crown  the crown register, definition and etymology
 *
 * `rack` names the bundle to look in, because bundles are keyed by their rack's
 * crown rather than by word. Guarded by `import.meta.env.DEV` at the call site
 * as well as here, so it is compiled out of a production build entirely.
 */
export function DevCardProbe(props: {
  word: string;
  rack: string | null;
  register: 'quiet' | 'crown';
  theme: 'letterpress' | 'cute';
  onClose: () => void;
}): React.JSX.Element | null {
  const [definition, setDefinition] = useState<string | null>(null);
  const [etymology, setEtymology] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      if (props.register === 'crown') {
        const res = await fetch(assetUrl('source-pool.json'));
        const pool = (await res.json()) as {
          word: string;
          definition: string;
          etymology?: string;
        }[];
        const entry = pool.find((e) => e.word === props.word);
        if (!live) return;
        setDefinition(entry?.definition ?? null);
        setEtymology(entry?.etymology ?? null);
      } else if (props.rack) {
        const gloss = await createDefinitionLookup(props.rack).getDefinition(
          props.word,
        );
        if (!live) return;
        setDefinition(gloss);
      }
      if (live) setReady(true);
    })();
    return () => {
      live = false;
    };
  }, [props.word, props.rack, props.register]);

  if (!ready) return null;

  if (props.register === 'crown') {
    return (
      <Reveal
        register="crown"
        theme={props.theme}
        word={props.word}
        entry={{
          word: props.word,
          definition: definition ?? '',
          etymology: etymology ?? '',
        }}
        onClose={props.onClose}
      />
    );
  }
  return (
    <Reveal
      register="quiet"
      theme={props.theme}
      word={props.word}
      category={'rare' as QuietCategory}
      status="ready"
      definition={definition}
      onClose={props.onClose}
    />
  );
}
