import antfu from '@antfu/eslint-config'

export default antfu(
  {
    formatters: true,
    unocss: true,
    astro: true,
  },
  {
    files: ['**/*.md', '**/*.md/*'],
    rules: {
      'style/no-tabs': 'off',
      'style/no-mixed-spaces-and-tabs': 'off',
      'style/no-multiple-empty-lines': 'off',
      'format/prettier': 'off',
    },
  },
)
