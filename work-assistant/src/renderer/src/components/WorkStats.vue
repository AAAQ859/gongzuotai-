<script setup lang="ts">
/**
 * 工作统计图表(板块 10):
 * 近 6 个月完成趋势(纯 SVG 柱状图)、事项分类占比、对接人活跃度。
 * 无第三方图表依赖,离线可用;窄窗口自动改为两列/单列。
 */
import { computed } from 'vue'
import type { Contact, WorkEvent } from '@shared/types'
import { initials } from '@/utils/dashboard'
import {
  barHeight,
  categoryBreakdown,
  contactActivity,
  monthlyTrend,
  niceMax
} from '@/utils/work-stats'

const props = defineProps<{
  events: WorkEvent[]
  contacts: Contact[]
  now: Date
}>()

const trend = computed(() => monthlyTrend(props.events, props.now, 6))
const categories = computed(() => categoryBreakdown(props.events, props.now, 6, 6))
const contactsTop = computed(() => contactActivity(props.events, props.contacts, props.now, 6, 5))
const trendMax = computed(() => niceMax(trend.value.flatMap((p) => [p.done, p.meetings])))
const contactMax = computed(() => Math.max(1, ...contactsTop.value.map((c) => c.count)))

// SVG 几何
const W = 460
const H = 190
const LEFT = 34
const TOP = 18
const PLOT_W = 414
const PLOT_H = 136
const GROUP_W = PLOT_W / 6
const BAR_W = 14
const GAP = 4

function barX(i: number, meeting: boolean): number {
  const center = LEFT + GROUP_W * (i + 0.5)
  return meeting ? center + GAP / 2 : center - BAR_W - GAP / 2
}

function barY(value: number): number {
  return TOP + PLOT_H - barHeight(value, trendMax.value, PLOT_H)
}

function gridY(ratio: number): number {
  return TOP + PLOT_H - PLOT_H * ratio
}

function tickText(ratio: number): string {
  const v = trendMax.value * ratio
  return String(Math.round(v * 10) / 10)
}

function percentWidth(percent: number): string {
  return `${Math.max(2, percent)}%`
}

function contactWidth(count: number): string {
  return `${Math.max(6, (count / contactMax.value) * 100)}%`
}
</script>

<template>
  <section class="work-stats">
    <div class="ws-panel ws-panel--trend">
      <div class="ws-head">
        <div class="ws-head__left">
          <span class="ws-title">📈 完成趋势</span>
          <span class="ws-sub">近 6 个月</span>
        </div>
        <div class="ws-legend">
          <span><i class="ws-dot ws-dot--done"></i>完成事项</span>
          <span><i class="ws-dot ws-dot--meeting"></i>参加会议</span>
        </div>
      </div>
      <svg class="ws-trend" :viewBox="`0 0 ${W} ${H}`" role="img" aria-label="近 6 个月完成趋势">
        <g class="ws-grid">
          <template v-for="r in [0, 0.5, 1]" :key="r">
            <line :x1="LEFT" :x2="LEFT + PLOT_W" :y1="gridY(r)" :y2="gridY(r)" />
            <text :x="LEFT - 6" :y="gridY(r) + 3" text-anchor="end">{{ tickText(r) }}</text>
          </template>
        </g>
        <g v-for="(p, i) in trend" :key="p.key">
          <rect
            :x="barX(i, false)"
            :y="barY(p.done)"
            :width="BAR_W"
            :height="barHeight(p.done, trendMax, PLOT_H)"
            rx="3"
            fill="#12B886"
          >
            <title>{{ p.label }}:完成 {{ p.done }} 项</title>
          </rect>
          <rect
            :x="barX(i, true)"
            :y="barY(p.meetings)"
            :width="BAR_W"
            :height="barHeight(p.meetings, trendMax, PLOT_H)"
            rx="3"
            fill="#4DABF7"
          >
            <title>{{ p.label }}:会议 {{ p.meetings }} 场</title>
          </rect>
          <text
            v-if="p.done"
            :x="barX(i, false) + BAR_W / 2"
            :y="barY(p.done) - 4"
            class="ws-val"
            text-anchor="middle"
          >
            {{ p.done }}
          </text>
          <text
            v-if="p.meetings"
            :x="barX(i, true) + BAR_W / 2"
            :y="barY(p.meetings) - 4"
            class="ws-val ws-val--meeting"
            text-anchor="middle"
          >
            {{ p.meetings }}
          </text>
          <text
            :x="LEFT + GROUP_W * (i + 0.5)"
            :y="H - 8"
            class="ws-x"
            text-anchor="middle"
          >
            {{ p.label }}
          </text>
        </g>
      </svg>
    </div>

    <div class="ws-panel">
      <div class="ws-head">
        <span class="ws-title">🧩 事项分类</span>
        <span class="ws-sub">近 6 个月完成</span>
      </div>
      <div v-if="categories.length" class="ws-bars">
        <div v-for="c in categories" :key="c.name" class="ws-bar-row">
          <span class="ws-bar-name" :title="c.name">{{ c.name }}</span>
          <div class="ws-bar-track">
            <div class="ws-bar-fill" :style="{ width: percentWidth(c.percent), background: c.color }"></div>
          </div>
          <span class="ws-bar-val">{{ c.count }}项 · {{ c.percent }}%</span>
        </div>
      </div>
      <div v-else class="ws-empty">近 6 个月暂无已完成事项</div>
    </div>

    <div class="ws-panel">
      <div class="ws-head">
        <span class="ws-title">🤝 对接人活跃度</span>
        <span class="ws-sub">近 6 个月</span>
      </div>
      <div v-if="contactsTop.length" class="ws-contacts">
        <div v-for="c in contactsTop" :key="c.id" class="ws-contact-row">
          <span class="ws-avatar">{{ initials(c.name) }}</span>
          <div class="ws-contact-main">
            <div class="ws-contact-line">
              <span class="ws-contact-name">{{ c.name }}</span>
              <span class="ws-contact-count">{{ c.count }} 项</span>
            </div>
            <div class="ws-contact-dept">{{ c.department || '未填写部门' }}</div>
            <div class="ws-bar-track">
              <div class="ws-bar-fill ws-bar-fill--contact" :style="{ width: contactWidth(c.count) }"></div>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="ws-empty">暂无关联对接人的完成事项</div>
    </div>
  </section>
</template>

<style scoped>
.work-stats {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px;
}

.ws-panel {
  background: #fff;
  border: 1px solid var(--wa-border);
  border-radius: 10px;
  padding: 14px 16px 16px;
  min-width: 0;
}

.ws-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.ws-head__left {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.ws-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--wa-ink);
}

.ws-sub {
  font-size: 11px;
  color: var(--wa-text-muted);
}

.ws-legend {
  display: flex;
  gap: 10px;
  font-size: 11px;
  color: var(--wa-text-muted);
  white-space: nowrap;
}

.ws-legend span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.ws-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  display: inline-block;
}

.ws-dot--done {
  background: #12b886;
}

.ws-dot--meeting {
  background: #4dabf7;
}

.ws-trend {
  width: 100%;
  max-width: 620px;
  height: auto;
  display: block;
  margin: 0 auto;
}

.ws-grid line {
  stroke: #eef1f3;
  stroke-width: 1;
}

.ws-grid text {
  fill: #adb5bd;
  font-size: 9px;
}

.ws-val {
  fill: #0b7a5a;
  font-size: 9px;
  font-weight: 600;
}

.ws-val--meeting {
  fill: #1c7ed6;
}

.ws-x {
  fill: #868e96;
  font-size: 10px;
}

.ws-bars {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.ws-bar-row {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr) 64px;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.ws-bar-name {
  color: var(--wa-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-bar-track {
  height: 8px;
  border-radius: 4px;
  background: #f1f3f5;
  overflow: hidden;
}

.ws-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.25s ease;
}

.ws-bar-val {
  color: var(--wa-text-muted);
  font-size: 11px;
  text-align: right;
  white-space: nowrap;
}

.ws-contacts {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ws-contact-row {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}

.ws-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--wa-brand-soft);
  color: var(--wa-brand-text);
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ws-contact-main {
  flex: 1;
  min-width: 0;
}

.ws-contact-line {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}

.ws-contact-name {
  color: var(--wa-text);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-contact-count {
  color: var(--wa-brand-text);
  font-weight: 600;
  flex-shrink: 0;
}

.ws-contact-dept {
  color: var(--wa-text-muted);
  font-size: 11px;
  margin: 1px 0 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-bar-fill--contact {
  background: var(--wa-brand);
}

.ws-empty {
  padding: 24px 0;
  text-align: center;
  color: var(--wa-text-muted);
  font-size: 12px;
}

@media (max-width: 1200px) {
  .work-stats {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .ws-panel--trend {
    grid-column: 1 / -1;
  }
}

@media (max-width: 760px) {
  .work-stats {
    grid-template-columns: 1fr;
  }

  .ws-panel--trend {
    grid-column: auto;
  }
}
</style>
