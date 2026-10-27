import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // Context / sözlük dosyaları Provider'ın yanında hook ve yardımcı da dışa aktarır (bilinçli kalıp);
  // bu dosyalarda hızlı yenileme yerine sayfa yenilenir, sorun değil
  {
    files: ['src/context/**/*.jsx', 'src/i18n/**/*.jsx', 'src/pages/platform/shared.jsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['public/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
])
