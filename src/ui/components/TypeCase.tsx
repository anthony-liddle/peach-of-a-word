import type { PlayApi } from '../useGame.ts';

export function TypeCase({ game }: { game: PlayApi }) {
  const { state } = game;
  return (
    <div className="case" role="group" aria-label="Letter tiles">
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
