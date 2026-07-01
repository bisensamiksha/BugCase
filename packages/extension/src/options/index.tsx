import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { OptionsApp } from './OptionsApp';

const rootEl = document.getElementById('root');

if (!rootEl) {
  throw new Error('#root missing');
}

createRoot(rootEl).render(
  <StrictMode>
    <OptionsApp />
  </StrictMode>,
);
