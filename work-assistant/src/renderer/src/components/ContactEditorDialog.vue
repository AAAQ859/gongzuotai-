<script setup lang="ts">
/**
 * 联系人/群组编辑器(PRD 4.6):通讯录同时容纳个人联系人与微信群/钉钉群等群组记录,
 * 二者共用本弹窗,以类型切换字段。自包含数据库调用,成功后 emit('saved')。
 */
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Contact, ContactGroup, ContactKind } from '@shared/types'
import { db } from '@/api/db'

const props = defineProps<{
  modelValue: boolean
  /** 传入则为编辑模式 */
  contact: Contact | null
  groups: ContactGroup[]
  /** 全部联系人(用于新联系人取色轮转) */
  contacts?: Contact[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved'): void
}>()

const CONTACT_COLORS = ['#339AF0', '#12B886', '#9775FA', '#FF922B', '#F06595', '#51CF66', '#22B8CF', '#F59F00']

const saving = ref(false)
const form = reactive({
  kind: 'person' as ContactKind,
  name: '',
  department: '',
  position: '',
  phone: '',
  wechat: '',
  email: '',
  remark: '',
  member_count: null as number | null,
  purpose: '',
  group_ids: [] as number[],
  avatar_color: CONTACT_COLORS[0],
  is_favorite: false
})

const isEdit = computed(() => !!props.contact)
const title = computed(() => (isEdit.value ? (form.kind === 'person' ? '编辑联系人' : '编辑群组') : '新建联系人'))

async function initForm(): Promise<void> {
  const c = props.contact
  if (c) {
    form.kind = c.kind
    form.name = c.name
    form.department = c.department
    form.position = c.position
    form.phone = c.phone
    form.wechat = c.wechat
    form.email = c.email
    form.remark = c.remark
    form.member_count = c.member_count
    form.purpose = c.purpose
    form.avatar_color = c.avatar_color
    form.is_favorite = c.is_favorite === 1
    try {
      form.group_ids = await db.contacts.groupsOf(c.id)
    } catch {
      form.group_ids = []
    }
    return
  }
  form.kind = 'person'
  form.name = ''
  form.department = ''
  form.position = ''
  form.phone = ''
  form.wechat = ''
  form.email = ''
  form.remark = ''
  form.member_count = null
  form.purpose = ''
  form.group_ids = []
  form.avatar_color =
    CONTACT_COLORS[(props.contacts?.length ?? 0) % CONTACT_COLORS.length]
  form.is_favorite = false
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) initForm()
  }
)

async function submit(): Promise<void> {
  if (!form.name.trim()) {
    ElMessage.warning(form.kind === 'person' ? '请输入姓名' : '请输入群名')
    return
  }
  saving.value = true
  try {
    const base = {
      name: form.name.trim(),
      kind: form.kind,
      department: form.department.trim(),
      position: form.kind === 'person' ? form.position.trim() : '',
      phone: form.kind === 'person' ? form.phone.trim() : '',
      wechat: form.kind === 'person' ? form.wechat.trim() : '',
      email: form.kind === 'person' ? form.email.trim() : '',
      remark: form.remark.trim(),
      member_count: form.kind === 'group' ? form.member_count : null,
      purpose: form.kind === 'group' ? form.purpose.trim() : '',
      avatar_color: form.avatar_color,
      is_favorite: form.is_favorite ? 1 : 0
    }
    let id = props.contact?.id
    if (id != null) {
      await db.contacts.update(id, base)
      ElMessage.success('已保存')
    } else {
      const c = await db.contacts.create(base)
      id = c.id
      ElMessage.success('已新增')
    }
    // 所属分组(联系人可同时属于多个分组);展开为普通数组,响应式 Proxy 无法被 IPC 结构化克隆
    await db.contacts.setGroups(id, [...form.group_ids])
    emit('update:modelValue', false)
    emit('saved')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function remove(): Promise<void> {
  if (!props.contact) return
  try {
    await ElMessageBox.confirm(
      `确定删除「${props.contact.name}」吗?关联的对接事项将变为未指定对接人,不影响事项本身。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
    await db.contacts.remove(props.contact.id)
    ElMessage.success('已删除')
    emit('update:modelValue', false)
    emit('saved')
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    ElMessage.error(err instanceof Error ? err.message : '删除失败')
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="520px"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-form label-width="80px" @submit.prevent>
      <el-form-item label="类型">
        <el-radio-group v-model="form.kind">
          <el-radio-button value="person">👤 联系人</el-radio-button>
          <el-radio-button value="group">💬 群组</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item :label="form.kind === 'person' ? '姓名' : '群名'" required>
        <el-input v-model="form.name" :placeholder="form.kind === 'person' ? '联系人姓名' : '如:韩亚协调工作群'" maxlength="40" />
      </el-form-item>
      <template v-if="form.kind === 'person'">
        <el-form-item label="部门">
          <el-input v-model="form.department" placeholder="所属部门/项目,如:质安部" />
        </el-form-item>
        <el-form-item label="职位">
          <el-input v-model="form.position" placeholder="如:质量主管" />
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="form.phone" placeholder="手机号,用于拨号" />
        </el-form-item>
        <el-form-item label="微信">
          <el-input v-model="form.wechat" placeholder="微信号" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="form.email" placeholder="电子邮箱" />
        </el-form-item>
      </template>
      <template v-else>
        <el-form-item label="群类型">
          <el-select v-model="form.department" filterable allow-create default-first-option placeholder="微信群 / 钉钉群 / QQ群" style="width: 100%">
            <el-option label="微信群" value="微信群" />
            <el-option label="钉钉群" value="钉钉群" />
            <el-option label="QQ群" value="QQ群" />
          </el-select>
        </el-form-item>
        <el-form-item label="成员数">
          <el-input-number v-model="form.member_count" :min="0" :max="9999" style="width: 100%" />
        </el-form-item>
        <el-form-item label="群用途">
          <el-input v-model="form.purpose" placeholder="如:主要对接韩亚航班事宜" />
        </el-form-item>
      </template>
      <el-form-item label="所属分组">
        <el-select v-model="form.group_ids" multiple placeholder="可同时属于多个分组" style="width: 100%">
          <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="颜色">
        <el-color-picker v-model="form.avatar_color" :predefine="CONTACT_COLORS" />
      </el-form-item>
      <el-form-item label="设为常用">
        <el-switch v-model="form.is_favorite" />
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="补充说明(可选)" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button v-if="isEdit" type="danger" plain style="float: left" @click="remove">删除</el-button>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>
