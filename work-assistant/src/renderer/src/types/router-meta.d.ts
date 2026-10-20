import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    /** 页面标题 */
    title: string
    /** Element Plus 图标组件名 */
    icon: string
    /** 页面描述 */
    desc?: string
    /** 导航分组 */
    group?: 'main' | 'other'
  }
}

export {}
