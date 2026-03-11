import type { UserConfig } from '~/types'

export const userConfig: Partial<UserConfig> = {
  // Override the default config here
  site: {
    title: 'Reason the world.',
    subtitle: 'wnw231423\'s blog',
    author: 'wnw231423',
    description: '书写可推演的世界',
    website: 'https://www.github.com/wnw231423/blog',
    socialLinks: [
      {
        name: 'github',
        href: 'https://www.github.com/wnw231423',
      },
    ],
  },
  seo: {},
  comment: {
    giscus: {
        repo: "wnw231423/blog",
        repoId: "R_kgDORcibtQ",
        category: "Announcements",
        categoryId: "DIC_kwDORcibtc4C4KNL",
        mapping: "title",
        strict: "0",
        reactionsEnabled: "1",
        emitMetadata: "0",
        inputPosition: "top",
        theme: "preferred_color_scheme",
        lang: "zh-CN",
        loading: "lazy",
    }
  }
}
