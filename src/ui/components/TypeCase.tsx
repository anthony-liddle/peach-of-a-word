import type { Ref } from 'react';
import type { PlayApi } from '../useGame.ts';

/**
 * `ref` is where focus goes when a letter is typed on a chip or the well's
 * line (`useGlobalKeys`), so the group takes focus from script but stays out
 * of the Tab order.
 */
export function TypeCase({
  game,
  ref,
}: {
  game: PlayApi;
  ref?: Ref<HTMLDivElement>;
}) {
  const { state } = game;
  return (
    <div
      className="case"
      role="group"
      aria-label="Letter tiles"
      ref={ref}
      tabIndex={-1}
    >
      {state.rackOrder.map((id) => {
        const tile = state.tiles[id]!;
        const used = state.composing.includes(id);
        return (
          <button
            key={id}
            className="sort"
            disabled={used}
            onClick={() => game.addTile(id)}
            aria-label={`Letter ${tile.letter}${used ? ', already set' : ''}`}
          >
            {tile.letter}
          </button>
        );
      })}
    </div>
  );
}
