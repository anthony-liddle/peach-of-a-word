import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SoundsPage } from './SoundsPage.tsx';
import { contextOnTap, pairOnTap } from './pair.ts';
import { mixPlayerOn } from './balance.ts';
// The game's stylesheet first, then the layout this page adds to it. Order
// matters: the tokens have to exist before anything reads them.
import '@/index.css';
import './sounds.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found.');

// The game's engine before Soundscape and the Soundscape one, and the balance's
// three mixes, all on one context made by the first tap.
const context = contextOnTap();
const pair = pairOnTap(context);
const mixes = mixPlayerOn(context);

createRoot(root).render(
  <StrictMode>
    <SoundsPage pair={pair} mixes={mixes} />
  </StrictMode>,
);
