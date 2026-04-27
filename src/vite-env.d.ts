/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_NAKAMA_HOST?: string;
  readonly VITE_NAKAMA_PORT?: string;
  readonly VITE_NAKAMA_KEY?: string;
  readonly VITE_NAKAMA_USE_SSL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
