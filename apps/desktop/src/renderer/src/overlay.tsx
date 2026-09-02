import React from 'react';
import { createRoot } from 'react-dom/client';
import { OverlayApp } from './components/OverlayApp';
import { installErrorReporting } from './errors';
import './styles.css';

installErrorReporting();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OverlayApp />
  </React.StrictMode>,
);
