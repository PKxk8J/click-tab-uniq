import js from '@eslint/js'

export default [
  {
    ignores: [
      'amo/**',
      'node_modules/**',
      'web-ext-artifacts/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: {
        browser: 'readonly',
        console: 'readonly',
        document: 'readonly',
        setTimeout: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^(common|monitor|uniq)$',
      }],
      semi: ['error', 'never'],
    },
  },
  {
    files: [
      'menu.js',
      'messaging.js',
      'monitor.js',
      'options.js',
      'uniq.js',
    ],
    languageOptions: {
      globals: {
        common: 'readonly',
      },
    },
  },
  {
    files: ['uniq.js'],
    languageOptions: {
      globals: {
        monitor: 'readonly',
      },
    },
  },
  {
    files: [
      'menu.js',
      'messaging.js',
    ],
    languageOptions: {
      globals: {
        uniq: 'readonly',
      },
    },
  },
]
