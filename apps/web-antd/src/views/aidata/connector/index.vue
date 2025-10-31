<script lang="ts" setup>
import { reactive, ref, computed, onMounted } from 'vue';
import { Page } from '@vben/common-ui';

import {
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  message,
} from 'ant-design-vue';
import {
  createConnSourceApi,
  getConnSourcesApi,
  testConnSourceApi,
  updateConnSourceApi,
  type ConnSourceDTO,
} from './data';

type ConnectorType = 'mysql' | 'postgresql' | 'sqlite' | 'clickhouse' | 'snowflake';

interface ConnectorItem {
  id: string;
  name: string;
  type: ConnectorType;
  description?: string;
  enabled: boolean;
}

const connectors = ref<ConnectorItem[]>([]);
const rawMap = ref<Record<string, ConnSourceDTO>>({});

const typeOptions = [
  { label: 'MySQL', value: 'mysql' },
  { label: 'PostgreSQL', value: 'postgresql' },
  { label: 'SQLite', value: 'sqlite' },
  { label: 'ClickHouse', value: 'clickhouse' },
  { label: 'Snowflake', value: 'snowflake' },
];

const typeColorMap: Record<ConnectorType, string> = {
  mysql: 'geekblue',
  postgresql: 'purple',
  sqlite: 'gold',
  clickhouse: 'volcano',
  snowflake: 'cyan',
};

// search form like dept
const query = reactive<{ name?: string; type?: ConnectorType | '' }>({
  name: '',
  type: '',
});

function onReset() {
  query.name = '';
  query.type = '' as any;
}

const filteredConnectors = computed(() => {
  return connectors.value.filter((c) => {
    const byName = query.name ? c.name.toLowerCase().includes(query.name.toLowerCase()) : true;
    const byType = query.type ? c.type === query.type : true;
    return byName && byType;
  });
});

async function fetchList() {
  const res = await getConnSourcesApi({ name: query.name, conn_type: query.type || undefined });
  const items = res.items || [];
  const next: ConnectorItem[] = items.map((it) => ({
    id: String(it.id),
    name: it.name,
    type: it.conn_type as ConnectorType,
    description: it.description || '',
    enabled: it.status === 1,
  }));
  connectors.value = next;
  const map: Record<string, ConnSourceDTO> = {};
  items.forEach((it) => (map[String(it.id)] = it));
  rawMap.value = map;
}

onMounted(fetchList);

// modal
const visible = ref(false);
const editMode = ref(true);
const isCreate = ref(true);

const formRef = ref();
// Create/Update payload aligned with backend CreateConnSourceParam
const formModel = reactive({
  id: '',
  name: '',
  conn_type: 'mysql' as ConnectorType,
  host: '',
  port: undefined as unknown as number,
  username: '',
  password_encrypted: '',
  db_name: '',
  description: '',
  status: 1 as 0 | 1,
});

const rules = {
  name: [{ required: true, message: '请输入名称' }],
  conn_type: [{ required: true, message: '请选择类型' }],
  host: [{ required: true, message: '请输入主机地址' }],
  port: [{ required: true, message: '请输入端口' }],
  username: [{ required: true, message: '请输入账号' }],
  db_name: [{ required: true, message: '请输入数据库' }],
};

function openCreate() {
  isCreate.value = true;
  editMode.value = true;
  Object.assign(formModel, {
    id: '',
    name: '',
    conn_type: 'mysql' as ConnectorType,
    host: '',
    port: undefined as unknown as number,
    username: '',
    password_encrypted: '',
    db_name: '',
    description: '',
    status: 1,
  });
  visible.value = true;
}

function openEdit(item: ConnectorItem) {
  isCreate.value = false;
  editMode.value = true;
  const raw = rawMap.value[item.id];
  Object.assign(formModel, {
    id: item.id,
    name: raw?.name ?? item.name,
    conn_type: (raw?.conn_type ?? item.type) as ConnectorType,
    host: raw?.host ?? '',
    port: (raw?.port as any) ?? (undefined as unknown as number),
    username: raw?.username ?? '',
    password_encrypted: '', // 不回显密码
    db_name: raw?.db_name ?? '',
    description: raw?.description ?? item.description ?? '',
    status: (raw?.status ?? (item.enabled ? 1 : 0)) as 0 | 1,
  });
  visible.value = true;
}

function toggleEdit() {
  editMode.value = !editMode.value;
}

async function onSave() {
  // local validate + save
  await formRef.value?.validate();
  // build API payload compatible with CreateConnSourceParam
  const payload = {
    name: formModel.name,
    conn_type: formModel.conn_type,
    host: formModel.host,
    port: Number(formModel.port),
    username: formModel.username,
    password_encrypted: formModel.password_encrypted,
    db_name: formModel.db_name,
    status: formModel.status,
  };

  if (isCreate.value) {
    await createConnSourceApi(payload as any);
    message.success('创建成功');
  } else {
    const pk = Number(formModel.id);
    await updateConnSourceApi(pk, payload as any);
    message.success('保存成功');
  }
  visible.value = false;
  await fetchList();
}

function onEnableChange(item: ConnectorItem, value: boolean) {
  item.enabled = value;
  message.success(value ? '已启用' : '已停用');
}

function onEnableClick(item: ConnectorItem) {
  if (item.enabled) {
    Modal.confirm({
      title: '确认停用？',
      content: `停用 “${item.name}” 后将无法使用该数据源。`,
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        const raw = rawMap.value[item.id];
        if (raw) {
          await updateConnSourceApi(raw.id, { ...raw, status: 0 });
          await fetchList();
        } else {
          onEnableChange(item, false);
        }
      },
    });
  } else {
    const raw = rawMap.value[item.id];
    if (raw) {
      updateConnSourceApi(raw.id, { ...raw, status: 1 }).then(fetchList);
    } else {
      onEnableChange(item, true);
    }
  }
}

const headerTitle = computed(() =>
  isCreate.value ? '创建数据源' : editMode.value ? '编辑数据源' : '数据源详情',
);

async function onTestConnection(item: ConnectorItem) {
  const raw = rawMap.value[item.id];
  if (!raw) {
    message.error('数据源信息不存在');
    return;
  }

  try {
    message.loading({ content: '正在测试连接...', key: 'test_conn', duration: 0 });
    const res = await testConnSourceApi(raw.id);
    message.destroy('test_conn');
    // res.data 是实际返回的测试结果
    const result = (res as any).data || res;
    if (result.status === 'success') {
      message.success(result.message || '连接成功');
    } else {
      message.error(result.message || '连接失败');
    }
  } catch (error: any) {
    message.destroy('test_conn');
    const errorMsg = error?.response?.data?.message || error?.message || '测试连接失败';
    message.error(errorMsg);
  }
}

function onAnalyzeStructure(item: ConnectorItem) {
  // TODO: 分析结构功能待实现
  message.info('分析结构功能待实现');
}
</script>

<template>
  <Page auto-content-height>
    <div class="mb-3" style="display:flex; align-items:center; justify-content: space-between; gap:12px;">
      <div>
        <Button type="primary" @click="openCreate">新增数据源</Button>
      </div>
      <div style="margin-left:auto; display:flex; gap:8px; align-items:center;">
        <Input v-model:value="query.name" placeholder="名称" style="width: 220px;" />
        <Select v-model:value="query.type" :options="typeOptions" allowClear placeholder="类型" style="width: 180px;" />
        <Button type="primary">查询</Button>
        <Button @click="onReset">重置</Button>
      </div>
    </div>

    <Row :gutter="16">
      <Col v-for="item in filteredConnectors" :key="item.id" :xs="24" :sm="12" :md="8" :lg="6">
        <Card :title="item.name" class="mb-4">

          <div style="min-height: 44px; color: rgba(0,0,0,0.75);">{{ item.description }}</div>

          <div class="mb-3">
            <Tag :color="typeColorMap[item.type]" bordered>{{ item.type }}</Tag>
          </div>
          <div style="display:flex; flex-direction: column; gap: 8px;">
            <div style="display:flex; gap: 8px;">
              <Button size="small" type="default" @click="openEdit(item)" style="flex: 1;">编辑</Button>
              <Button
                size="small"
                :danger="item.enabled"
                :type="item.enabled ? 'default' : 'primary'"
                @click="onEnableClick(item)"
                style="flex: 1;"
              >
                {{ item.enabled ? '停用' : '启用' }}
              </Button>
            </div>
            <div style="display:flex; gap: 8px;">
              <Button size="small" type="default" @click="onTestConnection(item)" style="flex: 1;">测试</Button>
              <Button size="small" type="default" @click="onAnalyzeStructure(item)" style="flex: 1;" disabled>分析结构</Button>
            </div>
          </div>
        </Card>
      </Col>
    </Row>

    <Modal v-model:open="visible" :title="headerTitle" :maskClosable="false" width="560px">
      <Form ref="formRef" :model="formModel" :rules="rules" :disabled="!editMode" :label-col="{ span: 5 }"
            :wrapper-col="{ span: 18 }">
        <Form.Item label="名称" name="name">
          <Input v-model:value="formModel.name" placeholder="请输入数据源名称" />
        </Form.Item>
        <Form.Item label="类型" name="conn_type">
          <Select v-model:value="formModel.conn_type" :options="typeOptions" />
        </Form.Item>
        <Form.Item label="主机" name="host">
          <Input v-model:value="formModel.host" placeholder="请输入主机地址" />
        </Form.Item>
        <Form.Item label="端口" name="port">
          <Input v-model:value="(formModel.port as any)" type="number" placeholder="请输入端口" />
        </Form.Item>
        <Form.Item label="账号" name="username">
          <Input v-model:value="formModel.username" placeholder="请输入账号" />
        </Form.Item>
        <Form.Item label="密码">
          <Input.Password v-model:value="formModel.password_encrypted" placeholder="请输入密码" />
        </Form.Item>
        <Form.Item label="数据库" name="db_name">
          <Input v-model:value="formModel.db_name" placeholder="请输入数据库名称" />
        </Form.Item>
        <Form.Item label="描述">
          <Input.TextArea v-model:value="formModel.description" :rows="3" />
        </Form.Item>
        <Form.Item label="启用">
          <Switch v-model:checked="(formModel.status as any)" :checkedValue="1" :unCheckedValue="0" />
        </Form.Item>
      </Form>
      <template #footer>
        <Space>
          <Button v-if="!isCreate" @click="toggleEdit">{{ editMode ? '只读' : '编辑' }}</Button>
          <Button @click="visible=false">取消</Button>
          <Button type="primary" v-if="editMode" @click="onSave">保存</Button>
        </Space>
      </template>
    </Modal>
  </Page>
</template>
