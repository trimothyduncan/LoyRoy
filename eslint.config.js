module.exports = [
  { ignores: ['dashboard/**', 'node_modules/**', 'tmp/**'] },
  {
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs' },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^(_|next$)' }] },
  },
];
