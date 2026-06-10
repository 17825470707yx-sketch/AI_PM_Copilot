import { readFile, writeFile, access, mkdir, readdir } from 'node:fs/promises';
import { join, basename, dirname } from 'node:path';
import { findLatestPrdFile, scanProjectFiles } from '../services/fileSystem.mjs';
import { getPrdBaseDir } from '../utils/pathHelper.mjs';
import { parse } from 'yaml';
import { callArkChat } from '../services/arkLlm.mjs';

const CONDUIT_REPO_PATH = '/Users/qinzimai/Desktop/CHI27_AI_Project/AIPM_Code/conduit-realworld-example-app-main';

export async function readPrdContents(projectName) {
  const latestPrd = await findLatestPrdFile(projectName);
  const yamlContent = await readFile(latestPrd.filePath, 'utf-8');
  const prdData = parse(yamlContent);
  
  const contents = [];
  const traverse = (obj, path = '') => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach((item, idx) => traverse(item, `${path}[${idx}]`));
      return;
    }
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'id' && typeof value === 'string') {
        const nextKey = Object.keys(obj).find(k => k !== 'id' && typeof obj[k] === 'string');
        const content = nextKey ? obj[nextKey] : '';
        contents.push({ id: value, content });
      }
      traverse(value, path ? `${path}.${key}` : key);
    }
  };
  traverse(prdData);
  
  return {
    prdFilePath: latestPrd.filePath,
    version: `${latestPrd.major}.${latestPrd.minor}`,
    contents,
    fullPrd: prdData,
  };
}

export async function analyzeConduitProject() {
  const allFiles = await scanProjectFiles(CONDUIT_REPO_PATH);
  const fileSnapshots = [];
  
  for (const filePath of allFiles) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const relativePath = filePath.replace(CONDUIT_REPO_PATH, '');
      fileSnapshots.push({
        path: relativePath,
        fullPath: filePath,
        content,
      });
    } catch (e) {
      // skip binary/unreadable files
    }
  }
  
  return fileSnapshots;
}

export async function generateCodeChanges(projectName) {
  const prdInfo = await readPrdContents(projectName);
  const conduitFiles = await analyzeConduitProject();
  
  const systemPrompt = `你是 Conduit 代码修改 Agent。你需要根据 PRD 内容，针对现有的 Conduit RealWorld 全栈项目生成具体的代码改动。

现有 Conduit 项目概览：
- 后端：Express.js + Sequelize + SQLite
- 前端：React + Vite + JSX

PRD 内容（包含所有 id -> content）：
${JSON.stringify(prdInfo.contents, null, 2)}

现有 Conduit 代码文件样本：
${JSON.stringify(conduitFiles.map(f => ({ path: f.path, content: f.content.slice(0, 3000) })), null, 2)}

你的任务：
1. 识别哪些文件需要新增/修改
2. 输出 JSON 格式，结构为：
{
  "changes": [
    {
      "action": "create" | "modify",
      "relativePath": "相对于 conduit 根目录的路径",
      "newContent": "完整的新文件内容"
    }
  ]
}

禁止输出任何 markdown 代码块包裹，直接输出纯 JSON。`;

  const llmResponse = await callArkChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '根据上面的 PRD 内容生成代码改动计划。' },
    ],
    { type: 'json_object' },
  );
  
  const parsed = JSON.parse(llmResponse);
  return {
    prdInfo: { version: prdInfo.version, contentsCount: prdInfo.contents.length },
    changes: parsed.changes || [],
  };
}

export async function applyCodeChanges(changes) {
  const results = [];
  
  for (const change of changes) {
    try {
      const targetPath = join(CONDUIT_REPO_PATH, change.relativePath);
      const parentDir = dirname(targetPath);
      await access(parentDir).catch(() => mkdir(parentDir, { recursive: true }));
      
      const oldContent = await readFile(targetPath, 'utf-8').catch(() => null);
      
      await writeFile(targetPath, change.newContent, 'utf-8');
      
      results.push({
        relativePath: change.relativePath,
        action: change.action,
        success: true,
        oldContentPreview: oldContent ? oldContent.slice(0, 200) : null,
      });
    } catch (error) {
      results.push({
        relativePath: change.relativePath,
        action: change.action,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  
  return results;
}
