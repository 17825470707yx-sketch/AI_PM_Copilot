import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_FILE_DIR = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = join(THIS_FILE_DIR, '..', '.env.local');

export function loadLocalEnv() {
  if (!existsSync(ENV_FILE)) return;

  const content = readFileSync(ENV_FILE, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalIndex = trimmed.indexOf('=');
    if (equalIndex <= 0) continue;

    const key = trimmed.slice(0, equalIndex).trim();
    let value = trimmed.slice(equalIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// 环境变量懒加载 - 完全规避 import 提升导致的时序问题
function getEnv(key, def = undefined) {
  return process.env[key] ?? def;
}

export function getMODEL() { return getEnv('ARK_MODEL'); }
export function getAPI_KEY() { return getEnv('ARK_API_KEY'); }
export function getAPI_BASE() { return getEnv('ARK_API_BASE', 'https://ark.cn-beijing.volces.com/api/v3'); }
export function getAI_LAYER_BASE() { return getEnv('AI_LAYER_BASE', 'http://127.0.0.1:8000'); }
export function getCORS_ORIGIN() { return getEnv('CORS_ORIGIN'); }
export function getGITHUB_API_BASE() { return getEnv('GITHUB_API_BASE', 'https://api.github.com'); }
export function getGITHUB_TOKEN() { return getEnv('GITHUB_TOKEN'); }

// 向后兼容: 导出时用对象的 valueOf 来延迟取值
function lazyStr(envKey, defaultVal) {
  const obj = {};
  Object.defineProperty(obj, Symbol.toPrimitive, {
    value: () => getEnv(envKey, defaultVal)
  });
  Object.defineProperty(obj, 'valueOf', {
    value: () => getEnv(envKey, defaultVal)
  });
  Object.defineProperty(obj, 'toString', {
    value: () => getEnv(envKey, defaultVal)
  });
  // JSON 序列化支持
  obj.toJSON = () => getEnv(envKey, defaultVal);
  return obj;
}

export const MODEL = lazyStr('ARK_MODEL');
export const API_KEY = lazyStr('ARK_API_KEY');
export const API_BASE = lazyStr('ARK_API_BASE', 'https://ark.cn-beijing.volces.com/api/v3');
export const AI_LAYER_BASE = lazyStr('AI_LAYER_BASE', 'http://127.0.0.1:8000');
export const CORS_ORIGIN = lazyStr('CORS_ORIGIN');
export const GITHUB_API_BASE = lazyStr('GITHUB_API_BASE', 'https://api.github.com');
export const GITHUB_TOKEN = lazyStr('GITHUB_TOKEN');

export const AI_LAYER_FRONTEND_PATHS = new Set([]);

export async function callArkChat(messages, responseFormat) {
  const requestPayload = {
    model: getMODEL(),
    messages,
    ...(responseFormat ? { response_format: responseFormat } : {}),
  };

  const sendRequest = async (payload) => {
    const upstream = await fetch(`${getAPI_BASE()}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getAPI_KEY()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      throw new Error(data?.error?.message || 'upstream request failed');
    }

    return data?.choices?.[0]?.message?.content;
  };

  try {
    return await sendRequest(requestPayload);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Proxy Error] callArkChat 失败:', errorMessage);
    const unsupportedJsonMode =
      responseFormat?.type === 'json_object' &&
      /json_object.+not supported|not supported.+json_object/i.test(errorMessage);

    if (!unsupportedJsonMode) {
      throw error;
    }

    return sendRequest({
      model: getMODEL(),
      messages,
    });
  }
}
