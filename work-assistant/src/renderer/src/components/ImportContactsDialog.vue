<script setup lang="ts">
/**
 * 通讯录 CSV 导入(PRD 4.6「📥 导入」):选择 CSV → 解析预览 → 批量落库。
 * 解析逻辑见 utils/contacts.parseContactsCsv(纯函数,有单测)。
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { db } from '@/api/db'
import { parseContactsCsv, type CsvContact } from '@/utils/contacts'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved'): void
}>()

const filePath = ref('')
const rows = ref<CsvContact[]>([])
const errors = ref<string[]>([])
const importing = ref(false)

async function pick(): Promise<void> {
  try {
    const picked = await window.api.shell.pickCsv()
    if (!picked) return
    filePath.value = picked.path
    const parsed = parseContactsCsv(picked.content)
    rows.value = parsed.rows
    errors.value = parsed.errors
    if (!parsed.rows.length) {
      ElMessage.warning('未解析到有效联系人数据')
    }
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '读取文件失败')
  }
}

async function doImport(): Promise<void> {
  if (!rows.value.length) return
  importing.value = true
  try {
    const { created } = await db.contacts.batchCreate(
      rows.value.map((r) => ({ ...r }))
    )
    ElMessage.success(`已导入 ${created} 位联系人`)
    emit('update:modelValue', false)
    emit('saved')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '导入失败')
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="📥 导入联系人"
    width="640px"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="csv-imp__pick">
      <el-button @click="pick">选择 CSV 文件</el-button>
      <span class="csv-imp__path">{{ filePath || '尚未选择文件' }}</span>
    </div>
    <p class="csv-imp__hint">
      支持表头或无表头 CSV。有表头时按列名自动识别(姓名/部门/职位/电话/微信/邮箱/备注,中英文列名均可);
      无表头时按固定列序:姓名,部门,职位,电话,微信,邮箱,备注。
    </p>
    <el-table v-if="rows.length" :data="rows.slice(0, 8)" size="small" max-height="240">
      <el-table-column prop="name" label="姓名" width="110" />
      <el-table-column prop="department" label="部门" width="110" />
      <el-table-column prop="position" label="职位" width="100" />
      <el-table-column prop="phone" label="电话" width="120" />
      <el-table-column prop="wechat" label="微信" width="100" />
      <el-table-column prop="email" label="邮箱" min-width="130" />
    </el-table>
    <div v-if="rows.length" class="csv-imp__summary">
      共解析 {{ rows.length }} 位联系人{{ rows.length > 8 ? `(仅预览前 8 条)` : '' }}
      <span v-if="errors.length" class="csv-imp__errors">,{{ errors.length }} 行被跳过:{{ errors.slice(0, 3).join(';') }}</span>
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="importing" :disabled="!rows.length" @click="doImport">
        导入 {{ rows.length || '' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.csv-imp__pick {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.csv-imp__path {
  font-size: 12px;
  color: var(--wa-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.csv-imp__hint {
  font-size: 12px;
  color: var(--wa-text-muted);
  margin: 0 0 10px;
}

.csv-imp__summary {
  font-size: 12px;
  color: var(--wa-text);
  margin-top: 8px;
}

.csv-imp__errors {
  color: #e03131;
}
</style>
