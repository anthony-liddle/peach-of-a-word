import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CostumesPage } from './CostumesPage.tsx';
// The game's stylesheet first, then the layout this page adds to it.
import '@/index.css';
import './costumes.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found.');

createRoot(root).render(
  <StrictMode>
    <CostumesPage />
  </StrictMode>,
);
