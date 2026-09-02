/// <reference types="vite/client" />
import type { PoroApi } from '@shared/ipc';

declare global {
  interface Window {
    poro: PoroApi;
  }
}

export {};
