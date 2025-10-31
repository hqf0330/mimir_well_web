<script lang="ts" setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { Page } from '@vben/common-ui';
import { Button, Input, Select, Card, Avatar, Space, Spin, Empty, message } from 'ant-design-vue';
import { getConnSourcesApi, type ConnSourceDTO } from '../connector/data';

// 消息类型
interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  loading?: boolean;
  error?: string;
}

// 状态
const query = ref('');
const loading = ref(false);
const messages = ref<ChatMessage[]>([]);
const connections = ref<ConnSourceDTO[]>([]);
const selectedConnectionId = ref<number | null>(null);
const eventSource = ref<EventSource | null>(null);
const currentSessionId = ref<string>('');

// 生成消息ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// 加载数据源列表
const loadConnections = async () => {
  try {
    const res = await getConnSourcesApi();
    connections.value = res.items.filter((c) => c.status === 1);
    if (connections.value.length > 0 && !selectedConnectionId.value) {
      selectedConnectionId.value = connections.value[0].id;
    }
  } catch (error) {
    console.error('加载数据源失败:', error);
    message.error('加载数据源失败');
  }
};

// 发送消息
const handleSend = async () => {
  if (!query.value.trim()) {
    message.warning('请输入问题');
    return;
  }

  if (!selectedConnectionId.value) {
    message.warning('请先选择数据源');
    return;
  }

  if (loading.value) return;

  // 添加用户消息
  const userMessage: ChatMessage = {
    id: generateId(),
    type: 'user',
    content: query.value.trim(),
    timestamp: new Date(),
  };
  messages.value.push(userMessage);

  // 添加AI响应占位
  const aiMessage: ChatMessage = {
    id: generateId(),
    type: 'assistant',
    content: '',
    timestamp: new Date(),
    loading: true,
  };
  messages.value.push(aiMessage);

  const currentQuery = query.value.trim();
  query.value = '';
  loading.value = true;

  // 创建新会话ID
  currentSessionId.value = generateId();

  // 构建SSE URL
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const sseUrl = `${apiBase}/api/v1/text2sql/stream?query=${encodeURIComponent(currentQuery)}&connection_id=${selectedConnectionId.value}&session_id=${currentSessionId.value}`;

  try {
    // 关闭旧连接
    if (eventSource.value) {
      eventSource.value.close();
    }

    // 创建新的EventSource
    const es = new EventSource(sseUrl);
    eventSource.value = es;

    let aiContent = '';

    // 接收消息
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.content) {
          aiContent += data.content;
          // 更新AI消息内容
          const lastAiMessage = messages.value[messages.value.length - 1];
          if (lastAiMessage && lastAiMessage.type === 'assistant') {
            lastAiMessage.content = aiContent;
            lastAiMessage.loading = !data.is_final;
          }
        }

        // 最终结果
        if (data.is_final || event.type === 'final_result') {
          es.close();
          eventSource.value = null;
          loading.value = false;
          
          const lastAiMessage = messages.value[messages.value.length - 1];
          if (lastAiMessage && lastAiMessage.type === 'assistant') {
            lastAiMessage.loading = false;
          }
        }
      } catch (e) {
        console.error('解析SSE消息失败:', e);
      }
    };

    // 错误处理
    es.onerror = (error) => {
      console.error('SSE连接错误:', error);
      es.close();
      eventSource.value = null;
      loading.value = false;

      const lastAiMessage = messages.value[messages.value.length - 1];
      if (lastAiMessage && lastAiMessage.type === 'assistant') {
        lastAiMessage.loading = false;
        lastAiMessage.error = '连接失败，请稍后重试';
      }

      message.error('连接失败，请稍后重试');
    };
  } catch (error) {
    console.error('发送请求失败:', error);
    loading.value = false;
    message.error('发送请求失败');
    
    const lastAiMessage = messages.value[messages.value.length - 1];
    if (lastAiMessage && lastAiMessage.type === 'assistant') {
      lastAiMessage.loading = false;
      lastAiMessage.error = '发送请求失败';
    }
  }
};

// 回车发送
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
};

// 清空对话
const handleClear = () => {
  messages.value = [];
  if (eventSource.value) {
    eventSource.value.close();
    eventSource.value = null;
  }
  loading.value = false;
};

// 组件卸载时关闭连接
onUnmounted(() => {
  if (eventSource.value) {
    eventSource.value.close();
  }
});

// 初始化
onMounted(() => {
  loadConnections();
});

const connectionOptions = computed(() => {
  return connections.value.map((c) => ({
    label: `${c.name} (${c.conn_type})`,
    value: c.id,
  }));
});
</script>

<template>
  <Page auto-content-height>
    <div style="display: flex; flex-direction: column; height: calc(100vh - 80px);">
      <!-- 顶部控制栏 -->
      <div style="padding: 16px; border-bottom: 1px solid #f0f0f0; display: flex; gap: 12px; align-items: center;">
        <span style="font-size: 16px;">🗄️</span>
        <span>数据源:</span>
        <Select
          v-model:value="selectedConnectionId"
          :options="connectionOptions"
          style="width: 300px;"
          placeholder="请选择数据源"
          @change="handleClear"
        />
        <div style="margin-left: auto;">
          <Button @click="handleClear">清空对话</Button>
        </div>
      </div>

      <!-- 消息列表区域 -->
      <div style="flex: 1; overflow-y: auto; padding: 24px; background: #fafafa;">
        <div v-if="messages.length === 0" style="display: flex; justify-content: center; align-items: center; height: 100%;">
          <Empty description="开始提问，AI将帮您分析数据" />
        </div>

        <div v-else style="max-width: 900px; margin: 0 auto;">
          <div v-for="msg in messages" :key="msg.id" style="margin-bottom: 24px;">
            <div :style="{ display: 'flex', gap: '12px', flexDirection: msg.type === 'user' ? 'row-reverse' : 'row' }">
              <!-- 头像 -->
              <Avatar
                :style="{
                  backgroundColor: msg.type === 'user' ? '#1890ff' : '#52c41a',
                  flexShrink: 0,
                }"
              >
                {{ msg.type === 'user' ? '我' : 'AI' }}
              </Avatar>

              <!-- 消息内容 -->
              <Card
                :style="{
                  maxWidth: '70%',
                  backgroundColor: msg.type === 'user' ? '#1890ff' : '#fff',
                  color: msg.type === 'user' ? '#fff' : '#000',
                }"
              >
                <div v-if="msg.loading" style="display: flex; align-items: center; gap: 8px;">
                  <Spin size="small" />
                  <span>AI正在思考...</span>
                </div>

                <div v-else-if="msg.error" style="color: #ff4d4f;">
                  {{ msg.error }}
                </div>

                <div v-else style="white-space: pre-wrap; word-break: break-word;">
                  {{ msg.content }}
                </div>

                <div style="font-size: 12px; opacity: 0.7; margin-top: 8px;">
                  {{ new Date(msg.timestamp).toLocaleTimeString() }}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>

      <!-- 输入区域 -->
      <div style="padding: 16px 24px; border-top: 1px solid #f0f0f0; background: #fff;">
        <div style="max-width: 900px; margin: 0 auto; display: flex; gap: 12px;">
          <Input
            v-model:value="query"
            placeholder="输入您的问题，例如：查询销售额最高的10个产品"
            size="large"
            :disabled="loading || !selectedConnectionId"
            @keydown="handleKeyDown"
            style="flex: 1;"
          />
          <Button
            type="primary"
            size="large"
            :loading="loading"
            :disabled="!query.trim() || !selectedConnectionId"
            @click="handleSend"
          >
            <span style="margin-right: 4px;">📤</span>
            发送
          </Button>
        </div>
      </div>
    </div>
  </Page>
</template>

<style scoped>
/* 确保消息区域可以滚动 */
:deep(.ant-card-body) {
  padding: 12px 16px;
}
</style>