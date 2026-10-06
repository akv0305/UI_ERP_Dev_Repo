import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import react from 'eslint-plugin-react';
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
    files: [
      'apps/web/app/**/*.{js,jsx,ts,tsx}',
      'apps/web/components/**/*.{js,jsx,ts,tsx}',
      'apps/web/features/**/*.{js,jsx,ts,tsx}',
    ],
    plugins: { react },
    rules: {
      'react/jsx-no-literals': ['error', { noStrings: true, ignoreProps: true }],
    },
  },
  {
    files: ['apps/web/**/*.{js,jsx,ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
          message: 'Hex colour literals are only allowed in config/theme.ts.',
        },
        {
          selector: 'Literal[value=/^(?:rgb|rgba|hsl|hsla)\\(/]',
          message: 'rgb()/hsl() colour literals are only allowed in config/theme.ts.',
        },
        {
          selector:
            'TemplateElement[value.raw=/(?:#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|(?:rgb|rgba|hsl|hsla)\\()/]',
          message: 'Colour literals are only allowed in config/theme.ts.',
        },
      ],
    },
  },
  {
    files: ['apps/web/config/theme.ts'],
    rules: {
      'no-restricted-syntax': 'off',
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
