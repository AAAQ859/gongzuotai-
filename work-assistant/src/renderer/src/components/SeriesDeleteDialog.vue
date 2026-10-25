<script setup lang="ts">
/**
 * 删除例行事项时的范围选择:仅本次 / 整个系列。
 * 仅负责交互,删除动作由父组件执行。
 */
import { computed } from 'vue'
import type { WorkEvent } from '@shared/types'
import { formatWeeklyRule } from '@shared/recurrence'

const props = defineProps<{
  modelValue: boolean
  event: WorkEvent | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'choose', scope: 'one' | 'series'): void
}>()

const dateText = computed(() => props.event?.start_time?.slice(0, 10) ?? '')
const ruleText = computed(() =>
  props.event?.start_time ? formatWeeklyRule(props.event.start_time) : '每周重复'
)
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="删除例行事项"
    width="460px"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-if="event" class="scope">
      <div class="scope__title">{{ event.title }}</div>
      <div class="scope__meta">{{ ruleText }} · 本期 {{ dateText }}</div>
      <p class="scope__hint">这是例行事项,请选择删除范围:</p>

      <button class="scope-option" @click="emit('choose', 'one')">
        <span class="scope-option__name">仅删除本次</span>
        <span class="scope-option__desc">只删除 {{ dateText }} 这一期,其他周次照常保留</span>
      </button>

      <button class="scope-option scope-option--danger" @click="emit('choose', 'series')">
        <span class="scope-option__name">删除整个系列</span>
        <span class="scope-option__desc">删除未来所有未完成的期次;历史与已完成保留</span>
      </button>
    </div>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.scope {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scope__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--wa-ink);
}

.scope__meta {
  font-size: 12px;
  color: var(--wa-text-muted);
}

.scope__hint {
  margin: 8px 0 2px;
  font-size: 13px;
  color: var(--wa-text);
}

.scope-option {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  padding: 12px 14px;
  text-align: left;
  background: #fff;
  border: 1px solid var(--wa-border);
  border-radius: 8px;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.scope-option:hover {
  border-color: var(--wa-brand);
  background: var(--wa-brand-soft);
}

.scope-option--danger:hover {
  border-color: var(--wa-danger);
  background: #fff5f5;
}

.scope-option__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--wa-ink);
}

.scope-option--danger .scope-option__name {
  color: var(--wa-danger);
}

.scope-option__desc {
  font-size: 12px;
  color: var(--wa-text-muted);
  line-height: 1.5;
}
</style>
