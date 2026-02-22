/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHARTMETRIC_REFRESH_TOKEN: string;
  readonly VITE_JAMBASE_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
