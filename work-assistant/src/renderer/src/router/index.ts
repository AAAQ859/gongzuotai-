import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { title: '仪表盘', icon: 'House', group: 'main' }
  },
  {
    path: '/calendar',
    component: () => import('@/views/CalendarView.vue'),
    meta: { title: '日程日历', icon: 'Calendar', group: 'main' }
  },
  {
    path: '/timeline',
    component: () => import('@/views/TimelineView.vue'),
    meta: { title: '月度时间轴', icon: 'TrendCharts', group: 'main' }
  },
  {
    path: '/files',
    component: () => import('@/views/FilesView.vue'),
    meta: { title: '文件板块', icon: 'Folder', group: 'main' }
  },
  {
    path: '/meetings',
    component: () => import('@/views/MeetingsView.vue'),
    meta: { title: '会议日历', icon: 'VideoCamera', group: 'main' }
  },
  {
    path: '/contacts',
    component: () => import('@/views/ContactsView.vue'),
    meta: { title: '联络接口', icon: 'User', group: 'main' }
  },
  {
    path: '/summary',
    component: () => import('@/views/SummaryView.vue'),
    meta: { title: '工作纲要', icon: 'Document', group: 'main' }
  },
  {
    path: '/reminders',
    component: () => import('@/views/ReminderCenterView.vue'),
    meta: { title: '提醒中心', icon: 'Bell', group: 'other' }
  },
  {
    path: '/settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { title: '设置', icon: 'Setting', group: 'other' }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
