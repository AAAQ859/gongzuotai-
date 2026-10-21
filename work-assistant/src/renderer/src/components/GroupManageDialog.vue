<script setup lang="ts">
/**
 * 通讯录分组管理(PRD 4.6):新建/改名/换图标/删除。
 * 分组不内置预设,全部由用户在此自行创建;删除分组仅解除归属,联系人与群组记录不受影响。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ContactGroup } from '@shared/types'
import { db } from '@/api/db'

const props = defineProps<{
  modelValue: boolean
  groups: ContactGroup[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'changed'): void
}>()

const GROUP_ICONS = ['📁', '✈️', '🏢', '🏭', '🛡️', '🌍', '💬', '⭐', '📞', '🤝', '📦', '🏗️']

const newName = ref('')
const newIcon = ref(GROUP_ICONS[0])
const editingId = ref<number | null>(null)
const editingName = ref('')
const busy = ref(false)

const sorted = computed(() => [...props.groups].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id))

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      newName.value = ''
      newIcon.value = GROUP_ICONS[0]
      editingId.value = null
    }
  }
)

async function add(): Promise<void> {
  const name = newName.value.trim()
  if (!name) {
    ElMessage.warning('请输入分组名称')
    return
  }
  if (props.groups.some((g) => g.name === name)) {
    ElMessage.warning('已存在同名分组')
    return
  }
  busy.value = true
  try {
    await db.contactGroups.create({ name, icon: newIcon.value })
    ElMessage.success('已添加分组')
    newName.value = ''
    emit('changed')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '添加失败')
  } finally {
    busy.value = false
  }
}

async function saveRename(): Promise<void> {
  const name = editingName.value.trim()
  if (!name || editingId.value == null) return
  busy.value = true
  try {
    await db.contactGroups.update(editingId.value, { name })
    editingId.value = null
    emit('changed')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '改名失败')
  } finally {
    busy.value = false
  }
}

async function changeIcon(g: ContactGroup, icon: string): Promise<void> {
  try {
    await db.contactGroups.update(g.id, { icon })
    emit('changed')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '换图标失败')
  }
}

async function removeGroup(g: ContactGroup): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除分组「${g.name}」吗?其中的联系人与群组记录会保留,仅解除归属关系。`,
      '删除分组',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
    await db.contactGroups.remove(g.id)
    ElMessage.success('已删除分组')
    emit('changed')
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    ElMessage.error(err instanceof Error ? err.message : '删除失败')
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="管理分组"
    width="560px"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="grp-mgr__add">
      <el-input
        v-model="newName"
        placeholder="分组名称,如:韩亚项目组"
        maxlength="20"
        style="width: 200px"
        @keyup.enter="add"
      />
      <el-select v-model="newIcon" style="width: 90px">
        <el-option v-for="ic in GROUP_ICONS" :key="ic" :label="ic" :value="ic" />
      </el-select>
      <el-button type="primary" :loading="busy" @click="add">添加</el-button>
    </div>

    <div class="grp-mgr__list">
      <div v-for="g in sorted" :key="g.id" class="grp-mgr__row">
        <span class="grp-mgr__icon">{{ g.icon }}</span>
        <template v-if="editingId === g.id">
          <el-input
            v-model="editingName"
            size="small"
            maxlength="20"
            style="width: 180px"
            @keyup.enter="saveRename"
          />
          <el-button size="small" type="primary" @click="saveRename">保存</el-button>
          <el-button size="small" @click="editingId = null">取消</el-button>
        </template>
        <template v-else>
          <span class="grp-mgr__name">{{ g.name }}</span>
          <el-select :model-value="g.icon" size="small" style="width: 90px" @update:model-value="(ic: string) => changeIcon(g, ic)">
            <el-option v-for="ic in GROUP_ICONS" :key="ic" :label="ic" :value="ic" />
          </el-select>
          <el-button size="small" @click="editingId = g.id; editingName = g.name">改名</el-button>
          <el-button size="small" type="danger" plain @click="removeGroup(g)">删除</el-button>
        </template>
      </div>
      <div v-if="!sorted.length" class="grp-mgr__empty">
        还没有分组,请在上方添加第一个分组。
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.grp-mgr__add {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--wa-brand-soft);
  border-radius: 8px;
  margin-bottom: 12px;
}

.grp-mgr__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
  overflow-y: auto;
}

.grp-mgr__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border: 1px solid var(--wa-border);
  border-radius: 8px;
}

.grp-mgr__icon {
  font-size: 16px;
}

.grp-mgr__name {
  flex: 1;
  font-size: 14px;
  color: var(--wa-ink);
  font-weight: 500;
}

.grp-mgr__empty {
  text-align: center;
  color: var(--wa-text-muted);
  font-size: 13px;
  padding: 24px 0;
}
</style>
