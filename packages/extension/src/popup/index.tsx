import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Popup } from './Popup';

const rootEl = document.getElementById('root');

if (!rootEl) {
  throw new Error('#root missing');
}

createRoot(rootEl).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
