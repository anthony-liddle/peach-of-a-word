import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WebAudioEngine } from '@/audio/WebAudioEngine.ts';
import { SoundsPage } from './SoundsPage.tsx';
// The game's stylesheet first, then the layout this page adds to it. Order
// matters: the tokens have to exist before anything reads them.
import '@/index.css';
import './sounds.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found.');

// The engine the game builds, built the same way: no arguments.
const engine = new WebAudioEngine();

createRoot(root).render(
  <StrictMode>
    <SoundsPage engine={engine} />
  </StrictMode>,
);
