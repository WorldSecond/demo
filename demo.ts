/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 * 
 * 最简单的 Agent 使用示例
 * 适合快速集成到自定义 UI 中
 */

import {
  Config,
  GeminiClient,
  ApprovalMode,
  DEFAULT_GEMINI_MODEL_AUTO,
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  GeminiEventType,
  type ServerGeminiStreamEvent,
} from '@google/gemini-cli-core';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

/**
 * 最简单的 Agent 封装
 */
export class SimpleAgent {
  private client: GeminiClient;
  private config: Config;

  private constructor(config: Config, client: GeminiClient) {
    this.config = config;
    this.client = client;
  }

  /**
   * 创建 SimpleAgent 实例
   */
  static async create(workspaceRoot: string): Promise<SimpleAgent> {
    const config = new Config({
      sessionId: uuidv4(),
      targetDir: workspaceRoot,
      cwd: workspaceRoot,
      debugMode: false,
      model: DEFAULT_GEMINI_MODEL_AUTO,
      embeddingModel: DEFAULT_GEMINI_EMBEDDING_MODEL,
      approvalMode: ApprovalMode.DEFAULT,
    });

    await config.initialize();

    const client = config.getGeminiClient();
    if (!client.isInitialized()) {
      await client.initialize();
    }

    return new SimpleAgent(config, client);
  }

  /**
   * 发送消息并获取完整响应
   * @param message 用户消息
   * @param onStream 可选的流式更新回调
   * @returns 完整响应内容
   */
  async sendMessage(
    message: string,
    onStream?: (chunk: string) => void,
  ): Promise<string> {
    const promptId = `${this.config.getSessionId()}-${Date.now()}`;
    const abortController = new AbortController();
    let fullResponse = '';

    try {
      const stream = this.client.sendMessageStream(
        message,
        abortController.signal,
        promptId,
      );

      for await (const event of stream) {
        switch (event.type) {
          case GeminiEventType.Content:
            fullResponse += event.value;
            if (onStream) {
              onStream(event.value);
            }
            break;

          case GeminiEventType.Finished:
            return fullResponse;

          case GeminiEventType.Error:
            throw new Error(
              event.value.error?.message || 'Unknown error occurred',
            );

          case GeminiEventType.ToolCallRequest:
            // 工具调用会自动处理，这里可以记录日志
            console.log('Tool call requested:', event.value.name);
            break;

          default:
            // 忽略其他事件类型
            break;
        }
      }

      return fullResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request cancelled');
      }
      throw error;
    }
  }

  /**
   * 获取配置对象（用于高级用法）
   */
  getConfig(): Config {
    return this.config;
  }

  /**
   * 获取客户端对象（用于高级用法）
   */
  getClient(): GeminiClient {
    return this.client;
  }
}

// ============================================================================
// 使用示例
// ============================================================================

/**
 * 示例 1: 基本使用
 */
export async function basicExample() {
  const agent = await SimpleAgent.create('/path/to/workspace');

  const response = await agent.sendMessage('帮我读取 README.md 文件');
  console.log('Response:', response);
}

/**
 * 示例 2: 带流式更新
 */
export async function streamingExample() {
  const agent = await SimpleAgent.create('/path/to/workspace');

  let currentContent = '';

  const response = await agent.sendMessage('解释一下这个项目', (chunk) => {
    currentContent += chunk;
    // 实时更新 UI
    console.log('Current content:', currentContent);
    // updateUI(currentContent);
  });

  console.log('Final response:', response);
}

/**
 * 示例 3: 在 VSCode Extension 中使用
 */
export async function vscodeExample() {
  // 在 VSCode Extension 中
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error('No workspace folder');
  }

  const workspaceRoot = workspaceFolder.uri.fsPath;
  const agent = await SimpleAgent.create(workspaceRoot);

  // 在 Webview 中发送消息
  const response = await agent.sendMessage('分析当前项目的结构', (chunk) => {
    // 实时更新 Webview
    webview.postMessage({
      type: 'stream',
      chunk,
    });
  });

  // 发送完整响应
  webview.postMessage({
    type: 'complete',
    content: response,
  });
}

/**
 * 示例 4: 在 React 组件中使用
 */
export function ReactExample() {
  const [response, setResponse] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const agentRef = React.useRef<SimpleAgent | null>(null);

  React.useEffect(() => {
    SimpleAgent.create('/path/to/workspace').then((agent) => {
      agentRef.current = agent;
    });
  }, []);

  const handleSend = async (message: string) => {
    if (!agentRef.current) return;

    setLoading(true);
    setResponse('');

    try {
      await agentRef.current.sendMessage(message, (chunk) => {
        setResponse((prev) => prev + chunk);
      });
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div>{response}</div>
      <button onClick={() => handleSend('Hello')} disabled={loading}>
        Send
      </button>
    </div>
  );
}
