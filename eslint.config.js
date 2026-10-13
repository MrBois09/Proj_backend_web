export default [
  {
    ignores: ['node_modules/**', 'coverage/**', '.vercel/**']
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        URL: 'readonly',
        console: 'readonly',
        process: 'readonly'
      }
    },
    rules: {
      'no-constant-condition': 'error',
      'no-unreachable': 'error',
      'no-duplicate-imports': 'error',
      'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_' }],
      'no-undef': 'error'
    }
  }
];
