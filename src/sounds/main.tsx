import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SoundsPage } from './SoundsPage.tsx';
import { pairOnTap } from './pair.ts';
// The game's stylesheet first, then the layout this page adds to it. Order
// matters: the tokens have to exist before anything reads them.
import '@/index.css';
import './sounds.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found.');

// The game's engine before Soundscape and the Soundscape one, on one context
// made by the first tap.
const pair = pairOnTap();

createRoot(root).render(
  <StrictMode>
    <SoundsPage pair={pair} />
  </StrictMode>,
);
