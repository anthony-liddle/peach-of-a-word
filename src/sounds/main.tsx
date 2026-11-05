import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SoundsPage } from './SoundsPage.tsx';
import { contextOnTap, pairOnTap } from './pair.ts';
import { candidatesOnTap } from './candidatePlayer.ts';
// The game's stylesheet first, then the layout this page adds to it. Order
// matters: the tokens have to exist before anything reads them.
import '@/index.css';
import './sounds.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found.');

// The game's engine before Soundscape and the Soundscape one, and the Shuffle
// candidates' player, all on one context made by the first tap.
const context = contextOnTap();
const pair = pairOnTap(context);
const candidates = candidatesOnTap(context);

createRoot(root).render(
  <StrictMode>
    <SoundsPage pair={pair} candidates={candidates} />
  </StrictMode>,
);
