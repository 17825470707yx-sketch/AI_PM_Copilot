import { loadLocalEnv } from './services/arkLlm.mjs';

// 第一时间加载 .env.local 环境变量，确保其他模块 import 时环境已就绪
loadLocalEnv();

import { createServer } from 'node:http';
import { Router } from './routes/api.mjs';

const PORT = Number(process.env.ARK_PROXY_PORT || 8787);
const HOST = process.env.ARK_PROXY_HOST || '0.0.0.0';

const server = createServer(async (req, res) => {
  try {
    await Router(req, res);
  } catch (globalError) {
    console.error('[Global Unhandled Exception]', globalError);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: globalError instanceof Error ? globalError.message : 'server fatal error'
    }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[Ralph Proxy Server] 已启动 -> http://${HOST}:${PORT}`);
  console.log(`- 环境配置：${process.env.ARK_MODEL ? '已就绪' : '⚠️  ARK_MODEL 未配置'}`);
});
