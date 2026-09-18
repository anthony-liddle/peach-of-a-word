import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DateNight } from './DateNight.tsx';
// The game's stylesheet first, then the two rules this page adds to it. Order
// matters: the tokens have to exist before anything reads them.
import '@/index.css';
import './date-night.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found.');

createRoot(root).render(
  <StrictMode>
    <DateNight />
  </StrictMode>,
);
