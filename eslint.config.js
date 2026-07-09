import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', 'src-tauri/'],
  },
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylistic,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',
      'no-console': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
      'no-eval': 'error',

      // ─── Límites de tamaño (error) ─────────────────────────────────
      'max-lines': ['error', { max: 300, skipComments: true, skipBlankLines: true }],
      'max-lines-per-function': ['error', { max: 60, skipComments: true, skipBlankLines: true }],
      'max-depth': ['error', { max: 3 }],
      'max-params': ['error', { max: 4 }],
      'max-statements': ['error', { max: 25 }],
    },
  },
  // ─── Excepciones para tests y Cypress ──────────────────────────────
  {
    files: ['**/*.spec.ts', '**/*.cy.ts', 'cypress/**/*.ts', 'cypress.config.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'max-depth': 'off',
      'max-params': 'off',
      'max-statements': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);