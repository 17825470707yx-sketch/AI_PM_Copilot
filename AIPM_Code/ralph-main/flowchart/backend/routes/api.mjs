import { getAI_LAYER_BASE, AI_LAYER_FRONTEND_PATHS, getCORS_ORIGIN, getMODEL, getAPI_KEY, getAPI_BASE, getGITHUB_API_BASE } from '../services/arkLlm.mjs';
import { importGitHubRepository, scanProjectFiles, updatePrdWithRepositoryGoal, findLatestPrdFile } from '../services/fileSystem.mjs';
import { readFile, writeFile, access, mkdir, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { getPrdBaseDir } from '../utils/pathHelper.mjs';
import { upgradePrdVersion } from '../utils/yamlHelper.mjs';
import { handleClarificationChat, handleRequirementRefinerChat } from '../controllers/clarification.mjs';
import { handleProposalDiscuss, handleVerificationReview, handleVerificationReply, handleFacilitatorSummaryAndUpgrade, handleGetLatestPRD } from '../controllers/proposal.mjs';
import { readPrdContents, generateCodeChanges, applyCodeChanges, analyzeConduitProject } from '../controllers/codeGeneration.mjs';
import { safeJsonParse } from '../utils/jsonParser.mjs';

function resolveAllowedOrigin(req) {
  const requestOrigin = req.headers.origin;
  const corsOrigin = getCORS_ORIGIN();
  if (corsOrigin === '*') {
    return '*';
  }
  if (corsOrigin) {
    return corsOrigin;
  }
  if (requestOrigin) {
    return requestOrigin;
  }
  return 'http://localhost:5173';
}

export function writeJson(req, res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': resolveAllowedOrigin(req),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(payload));
}

export function readRequestBody(req) {
  if (typeof req.__cachedBody === 'string') {
    return Promise.resolve(req.__cachedBody);
  }
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      req.__cachedBody = body;
      resolve(body);
    });
    req.on('error', reject);
  });
}

async function forwardToAiLayer(pathname, requestBody) {
  const aiLayerBase = getAI_LAYER_BASE();
  const upstream = await fetch(`${aiLayerBase}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: requestBody,
  });

  const text = await upstream.text();
  const rawPayload = text ? safeJsonParse(text) ?? { error: text } : {};
  const payload =
    rawPayload && typeof rawPayload === 'object' && 'detail' in rawPayload && !('error' in rawPayload)
    ? { ...rawPayload, error: rawPayload.detail }
    : rawPayload;
  return {
    statusCode: upstream.status,
    payload,
  };
}

export async function Router(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': resolveAllowedOrigin(req),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/api/ark/health') {
    const PORT = Number(process.env.ARK_PROXY_PORT || 8787);
    const HOST = process.env.ARK_PROXY_HOST || '0.0.0.0';
    const model = getMODEL();
    const apiKey = getAPI_KEY();
    writeJson(req, res, 200, {
      ok: Boolean(model && apiKey),
      configured: Boolean(model && apiKey),
      model: model,
      proxyPort: PORT,
      proxyHost: HOST,
      githubApiBase: getGITHUB_API_BASE(),
    });
    return;
  }

  if (req.method === 'POST' && AI_LAYER_FRONTEND_PATHS.has(req.url)) {
    try {
      const body = await readRequestBody(req);
      const forwarded = await forwardToAiLayer(req.url, body);
      console.log(`[Proxy Forward] ${req.url} -> ${AI_LAYER_BASE}${req.url}, status=${forwarded.statusCode}`);
      writeJson(req, res, forwarded.statusCode, forwarded.payload);
      return;
    } catch (error) {
      console.error('[Proxy Error] AI Layer 不可达:', error instanceof Error ? error.message : String(error));
      writeJson(req, res, 500, { error: `AI Layer at ${AI_LAYER_BASE} is unreachable: ${error instanceof Error ? error.message : String(error)}` });
      return;
    }
  }

  if (req.method === 'POST' && req.url === '/api/repo/import') {
    try {
      const body = await readRequestBody(req);
      const parsed = body ? JSON.parse(body) : {};
      const repositoryUrl =
        typeof parsed.repositoryUrl === 'string' ? parsed.repositoryUrl.trim() : '';
      const requestedBranch =
        typeof parsed.branch === 'string' ? parsed.branch.trim() : '';

      if (!repositoryUrl) {
        writeJson(req, res, 400, { error: 'repositoryUrl is required' });
        return;
      }

      console.log(`[Proxy] 开始导入GitHub仓库: ${repositoryUrl}`);
      const imported = await importGitHubRepository(repositoryUrl, requestedBranch);
      writeJson(req, res, 200, imported);
    } catch (error) {
      console.error('[Proxy Error] 仓库导入失败:', error);
      writeJson(req, res, 500, {
        error: error instanceof Error ? error.message : `unknown repo import error: ${String(error)}`,
      });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/project/create') {
    try {
      const body = await readRequestBody(req);
      const parsed = body ? JSON.parse(body) : {};
      const projectName =
        typeof parsed.projectName === 'string' ? parsed.projectName.trim() : '';

      if (!projectName) {
        writeJson(req, res, 400, { error: 'projectName is required' });
        return;
      }

      const SAFE_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
      if (!SAFE_NAME_PATTERN.test(projectName)) {
        writeJson(req, res, 400, { error: '项目名称包含非法字符，仅支持字母、数字、下划线和连字符' });
        return;
      }

      const baseDir = getPrdBaseDir();
      const templateFilePath = join(baseDir, 'prd_template_base.yaml');
      const targetDirPath = join(baseDir, `${projectName}_prd`);
      const targetFilePath = join(targetDirPath, `${projectName}_prd_1.0.yaml`);

      // 先检查项目是否已经存在有效的 PRD 文件
      try {
        await access(targetDirPath);
        // 目录已存在，检查是否有至少一个 PRD yaml 文件
        const existingLatest = await findLatestPrdFile(projectName);
        if (existingLatest && existingLatest.filePath) {
          console.log(`[Project Create] 项目 ${projectName} 已存在，最新版本: ${existingLatest.major}.${existingLatest.minor}，无需重复创建`);
          writeJson(req, res, 200, {
            ok: true,
            message: `项目 ${projectName} 已存在，跳过创建`,
            projectDir: targetDirPath,
            projectFile: existingLatest.filePath,
            alreadyExists: true,
          });
          return;
        }
      } catch {
        // 项目目录或有效PRD文件不存在，继续执行创建流程
      }

      await mkdir(targetDirPath, { recursive: true });
      console.log(`[Project Create] 已确保目标文件夹存在: ${targetDirPath}`);

      try {
        await access(templateFilePath);
      } catch {
        writeJson(req, res, 404, { error: '模板文件丢失' });
        return;
      }

      // 只有当目标文件不存在时才复制模板
      try {
        await access(targetFilePath);
        console.log(`[Project Create] 初始PRD文件 ${targetFilePath} 已存在，跳过复制`);
      } catch {
        await copyFile(templateFilePath, targetFilePath);
        console.log(`[Project Create] 模板已复制到: ${targetFilePath}`);
      }

      writeJson(req, res, 200, {
        ok: true,
        message: `项目 ${projectName} 创建成功`,
        projectDir: targetDirPath,
        projectFile: targetFilePath,
      });
    } catch (error) {
      console.error('[Proxy Error] 项目创建失败:', error);
      writeJson(req, res, 500, {
        error: error instanceof Error ? error.message : `unknown project create error: ${String(error)}`,
      });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/clarification/chat') {
    const body = await readRequestBody(req);
    const parsed = safeJsonParse(body) || {};
    await handleClarificationChat(req, res, parsed, writeJson);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/requirement-refiner/chat') {
    const body = await readRequestBody(req);
    const parsed = body ? JSON.parse(body) : {};
    await handleRequirementRefinerChat(req, res, parsed, writeJson);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/proposal/discuss') {
    const body = await readRequestBody(req);
    const parsed = body ? JSON.parse(body) : {};
    await handleProposalDiscuss(req, res, parsed, writeJson);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/proposal/facilitator-upgrade') {
    const body = await readRequestBody(req);
    const parsed = body ? JSON.parse(body) : {};
    await handleFacilitatorSummaryAndUpgrade(req, res, parsed, writeJson);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/verification/review') {
    const body = await readRequestBody(req);
    const parsed = body ? JSON.parse(body) : {};
    await handleVerificationReview(req, res, parsed, writeJson);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/verification/reply') {
    const body = await readRequestBody(req);
    const parsed = body ? JSON.parse(body) : {};
    await handleVerificationReply(req, res, parsed, writeJson);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/implement/code') {
    if (!MODEL || !API_KEY) {
      writeJson(req, res, 500, { error: 'ARK proxy is not configured' });
      return;
    }
    try {
      const body = await readRequestBody(req);
      const parsed = safeJsonParse(body) || {};
      const prdDraftSections = parsed.prdDraftSections || [];

      // 强制写入 Conduit 实仓
      const { CONDUIT_REPO_PATH } = await import('../controllers/codeGeneration.mjs');
      const targetRepoPath = CONDUIT_REPO_PATH;
      console.log(`[Implement Code] 目标仓库路径已锁定为 Conduit 实仓: ${targetRepoPath}`);
      const allFiles = await scanProjectFiles(targetRepoPath);

      const maxFilesToProcess = allFiles.slice(0, 10);
      const sourceCodeContext = [];

      for (const filePath of maxFilesToProcess) {
        const content = await readFile(filePath, 'utf8');
        sourceCodeContext.push(`【文件路径】: ${filePath}\n【代码内容】:\n${content}`);
      }

      const systemPrompt = `
你是一个高级前端研发工程师。现在有一个基于真实源码和最新 PRD 的需求需要实现。
请阅读 PRD 内容和现有的代码上下文，决定如何修改代码。
注意：你需要直接输出可以直接覆盖现有文件的【完整最新代码】。
【重要规则】modifiedFiles 中的 path 字段只输出相对于 Conduit 项目根目录的相对路径（如 "frontend/src/routes/Home.jsx"），绝对不要写绝对路径。

严格返回以下 JSON 格式：
{
  "summary": "本次代码修改的简要总结",
  "modifiedFiles": [
    {
      "path": "相对于项目根目录的相对路径",
      "content": "修改后的该文件的完整源码（绝对不要省略部分代码）",
      "changeDescription": "简述做了什么改动"
    }
  ]
}
      `.trim();

      const userMessage = `
【最新 PRD 草案】
${JSON.stringify(prdDraftSections, null, 2)}

【当前项目源码上下文】
${sourceCodeContext.join('\n\n---\n\n')}
      `.trim();

      const { callArkChat } = await import('../services/arkLlm.mjs');
      const replyContent = await callArkChat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        { type: 'json_object' }
      );

      const structuredResult = safeJsonParse(replyContent);
      if (!structuredResult) {
        throw new Error('大模型未返回有效的 JSON 结构');
      }

      const finalModifiedFiles = [];
      if (Array.isArray(structuredResult.modifiedFiles)) {
        for (const mod of structuredResult.modifiedFiles) {
          if (mod.path && mod.content) {
            // 自动拼接 Conduit 实仓的绝对路径，确保100%写入正确位置
            const absoluteTargetPath = join(targetRepoPath, mod.path);
            const parentDir = dirname(absoluteTargetPath);
            await access(parentDir).catch(() => mkdir(parentDir, { recursive: true }));
            await writeFile(absoluteTargetPath, mod.content, 'utf8');
            finalModifiedFiles.push({
              path: mod.path,
              absolutePath: absoluteTargetPath,
              changeDescription: mod.changeDescription || '代码已更新',
              ok: true
            });
            console.log(`✅ 已真实覆盖写入文件: ${absoluteTargetPath}`);
          }
        }
      }

      writeJson(req, res, 200, {
        summary: structuredResult.summary || "Agent 已基于 PRD 修改了本地真实源码！",
        modifiedFiles: finalModifiedFiles,
        livePreviewUrl: "http://127.0.0.1:5173",
        stepMessages: [
          "🔍 正在扫描项目文件...",
          `📖 已加载 ${maxFilesToProcess.length} 个核心源码文件`,
          "🤖 正在调用火山方舟豆包大模型分析 PRD 定位修改点...",
          "📝 正在将新代码真实覆盖到本地磁盘..."
        ],
        totalSourceFilesCount: allFiles.length
      });

    } catch (error) {
      console.error('[Proxy Error] 代码实现失败:', error);
      writeJson(req, res, 500, {
        error: error instanceof Error ? error.message : `unknown implementation error: ${String(error)}`
      });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/prd/update-repository-goal') {
    try {
      const body = await readRequestBody(req);
      const parsed = body ? JSON.parse(body) : {};
      const projectName =
        typeof parsed.projectName === 'string' ? parsed.projectName.trim() : '';
      const repositoryGoal =
        typeof parsed.repositoryGoal === 'string' ? parsed.repositoryGoal.trim() : '';

      if (!projectName) {
        writeJson(req, res, 400, { error: 'projectName is required' });
        return;
      }
      if (!repositoryGoal) {
        writeJson(req, res, 400, { error: 'repositoryGoal is required' });
        return;
      }

      console.log('[PRD Update] 准备更新项目 ' + projectName + ' 的PRD，追加 repositoryGoal 内容');
      const result = await updatePrdWithRepositoryGoal(projectName, repositoryGoal);
      writeJson(req, res, 200, result);
    } catch (error) {
      console.error('[PRD Update Error] 更新PRD失败:', error);
      writeJson(req, res, 500, {
        error: error instanceof Error ? error.message : 'unknown PRD update error',
      });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/prd/upgrade-version') {
    try {
      const body = await readRequestBody(req);
      const parsed = body ? JSON.parse(body) : {};
      const projectName =
        typeof parsed.projectName === 'string' ? parsed.projectName.trim() : '';
      const clarifiedContents = Array.isArray(parsed.clarifiedContents) ? parsed.clarifiedContents : [];

      if (!projectName) {
        writeJson(req, res, 400, { error: 'projectName is required' });
        return;
      }
      if (!clarifiedContents || clarifiedContents.length === 0) {
        writeJson(req, res, 400, { error: 'clarifiedContents cannot be empty' });
        return;
      }

      console.log('[PRD Version Upgrade] 准备升级项目 ' + projectName + ' 的PRD版本，写入澄清后的内容');
      const result = await upgradePrdVersion(projectName, clarifiedContents);
      writeJson(req, res, 200, result);
    } catch (error) {
      console.error('[PRD Version Upgrade Error] 版本升级失败:', error);
      writeJson(req, res, 500, {
        error: error instanceof Error ? error.message : 'unknown PRD version upgrade error',
      });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/prd/get-latest') {
    const body = await readRequestBody(req);
    const parsed = body ? JSON.parse(body) : {};
    await handleGetLatestPRD(req, res, parsed, writeJson);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/conduit/read-prd') {
    try {
      const body = await readRequestBody(req);
      const parsed = body ? JSON.parse(body) : {};
      const projectName = typeof parsed.projectName === 'string' ? parsed.projectName.trim() : '';
      if (!projectName) {
        writeJson(req, res, 400, { error: 'projectName is required' });
        return;
      }
      const result = await readPrdContents(projectName);
      writeJson(req, res, 200, result);
    } catch (error) {
      console.error('[Conduit Error] 读取 PRD 失败:', error);
      writeJson(req, res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/conduit/analyze-project') {
    try {
      const files = await analyzeConduitProject();
      writeJson(req, res, 200, { totalFiles: files.length, files: files.map(f => ({ path: f.path, size: f.content.length })) });
    } catch (error) {
      console.error('[Conduit Error] 分析仓库失败:', error);
      writeJson(req, res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/conduit/generate-changes') {
    try {
      const body = await readRequestBody(req);
      const parsed = body ? JSON.parse(body) : {};
      const projectName = typeof parsed.projectName === 'string' ? parsed.projectName.trim() : '';
      if (!projectName) {
        writeJson(req, res, 400, { error: 'projectName is required' });
        return;
      }
      const result = await generateCodeChanges(projectName);
      writeJson(req, res, 200, result);
    } catch (error) {
      console.error('[Conduit Error] 生成代码改动失败:', error);
      writeJson(req, res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/conduit/apply-changes') {
    try {
      const body = await readRequestBody(req);
      const parsed = body ? JSON.parse(body) : {};
      const changes = Array.isArray(parsed.changes) ? parsed.changes : [];
      const results = await applyCodeChanges(changes);
      writeJson(req, res, 200, { results });
    } catch (error) {
      console.error('[Conduit Error] 应用代码改动失败:', error);
      writeJson(req, res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
}
