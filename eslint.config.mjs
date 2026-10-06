import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const rootDir = import.meta.dirname;

const boundaryElements = [
  { type: 'web', pattern: 'apps/web' },
  { type: 'api', pattern: 'apps/api' },
  { type: 'contracts', pattern: 'packages/contracts' },
];

const boundarySettings = {
  'boundaries/root-path': rootDir,
  'boundaries/elements': boundaryElements,
  'import/resolver': {
    node: {
      extensions: ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.json'],
    },
  },
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/out/**',
      '**/build/**',
      '**/coverage/**',
      '**/*.tsbuildinfo',
      '**/next-env.d.ts',
      'pnpm-lock.yaml',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { prettier: prettierPlugin },
    rules: {
      'prettier/prettier': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{js,mjs,ts,tsx}'],
    plugins: { boundaries },
    settings: boundarySettings,
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          checkAllOrigins: true,
          policies: [
            {
              from: { element: { type: 'web' } },
              allow: { to: { element: { types: { anyOf: ['web', 'contracts'] } } } },
            },
            { from: { element: { type: 'web' } }, allow: { to: { module: { origin: 'core' } } } },
            {
              from: { element: { type: 'web' } },
              allow: { to: { module: { origin: 'external' } } },
            },
            {
              from: { element: { type: 'web' } },
              disallow: { to: { module: { origin: 'external', source: '@prisma/client' } } },
            },
            {
              from: { element: { type: 'web' } },
              disallow: { to: { module: { origin: 'external', source: '@uie/api' } } },
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/**/*.{js,mjs,ts}'],
    plugins: { boundaries },
    settings: boundarySettings,
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          checkAllOrigins: true,
          policies: [
            {
              from: { element: { type: 'api' } },
              allow: { to: { element: { types: { anyOf: ['api', 'contracts'] } } } },
            },
            { from: { element: { type: 'api' } }, allow: { to: { module: { origin: 'core' } } } },
            {
              from: { element: { type: 'api' } },
              allow: { to: { module: { origin: 'external' } } },
            },
            {
              from: { element: { type: 'api' } },
              disallow: { to: { element: { type: 'web' } } },
            },
            {
              from: { element: { type: 'api' } },
              disallow: { to: { module: { origin: 'external', source: '@uie/web' } } },
            },
          ],
        },
      ],
    },
  },
  prettierConfig,
);
