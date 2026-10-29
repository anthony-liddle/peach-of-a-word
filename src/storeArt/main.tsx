import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StoreArtPage } from './StoreArtPage.tsx';
// The game's stylesheet first, for cute's tokens, then the page's own.
import '@/index.css';
import './storeArt.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found.');

createRoot(root).render(
  <StrictMode>
    <StoreArtPage />
  </StrictMode>,
);
