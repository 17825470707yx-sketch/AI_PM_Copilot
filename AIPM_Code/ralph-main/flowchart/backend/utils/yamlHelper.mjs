import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { getPrdBaseDir } from './pathHelper.mjs';

const PRD_BASE_DIR = getPrdBaseDir();
const TARGET_IDS = ['nomenclature', 'target_users', 'user_scenarios', 'problem_statement', 'repository_goal'];

function parseVersion(versionStr) {
  const cleanStr = versionStr.replace(/^v/i, '');
  const match = cleanStr.match(/(\d+)\.(\d+)/);
  if (!match) return { major: -1, minor: -1 };
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10)
  };
}

function findAllVersionFiles(projectDir, projectName) {
  const files = fs.readdirSync(projectDir);
  const noVPattern = new RegExp('^' + projectName + '_prd_(\\d+)\\.(\\d+)\\.yaml$', 'i');
  const withVPattern = new RegExp('^' + projectName + '_prd_v(\\d+)\\.(\\d+)\\.yaml$', 'i');
  
  const result = [];
  files.forEach(filename => {
    if (noVPattern.test(filename)) {
      const vs = filename.replace(projectName + '_prd_', '').replace('.yaml', '');
      result.push({
        filename,
        version: parseVersion(vs),
        filePath: path.join(projectDir, filename)
      });
    } else if (withVPattern.test(filename)) {
      const vs = filename.replace(projectName + '_prd_', '').replace('.yaml', '');
      result.push({
        filename,
        version: parseVersion(vs),
        filePath: path.join(projectDir, filename)
      });
    }
  });

  return result.sort((a, b) => {
    if (a.version.major !== b.version.major) {
      return b.version.major - a.version.major;
    }
    return b.version.minor - a.version.minor;
  });
}

export async function getLatestPrdYaml(projectName) {
  if (!projectName || projectName.trim() === '') {
    console.warn('[yamlHelper] projectName 为空，直接返回空数组');
    return [];
  }
  const normalizedProjectName = projectName.trim();
  const projectDir = path.join(PRD_BASE_DIR, normalizedProjectName + '_prd');

  console.log(`[yamlHelper] 尝试通过项目名精确查找: projectName="${normalizedProjectName}"`);
  if (!fs.existsSync(projectDir)) {
    console.warn(`[yamlHelper] 项目目录不存在: ${projectDir}`);
    return [];
  }

  const versionFiles = findAllVersionFiles(projectDir, normalizedProjectName);

  if (versionFiles.length === 0) {
    console.warn(`[yamlHelper] 项目 ${normalizedProjectName} 目录下没有匹配版本号的PRD YAML文件`);
    return [];
  }

  const latestFile = versionFiles[0];
  console.log(`[yamlHelper] 读取最新PRD文件: ${latestFile.filePath}`);

  try {
    const fileContents = fs.readFileSync(latestFile.filePath, 'utf8');
    const config = yaml.load(fileContents);
    const prdSpecs = (config && config.prd_specifications) || [];

    // 先把文件里所有不带id的垃圾条目全部过滤掉
    const cleanedSpecs = prdSpecs.filter(spec => spec && typeof spec === 'object' && spec.id);

    const result = TARGET_IDS.map(targetId => {
      const item = cleanedSpecs.find(spec => spec.id === targetId);
      return {
        id: targetId,
        name: (item && item.name) || '',
        content: (item && item.content) || '',
        system_instruction: (item && item.system_instruction) || ''
      };
    });
    
    console.log(`[yamlHelper] 成功加载 ${normalizedProjectName} 的已填充content数量: ${result.filter(r => r.content && String(r.content).trim()).length}`);
    return result;
  } catch (error) {
    console.error('[yamlHelper] 读取或解析YAML文件失败:', error.message);
    return [];
  }
}

export async function upgradePrdVersion(projectName, clarifiedContents) {
  const normalizedProjectName = projectName.trim();
  const projectDir = path.join(PRD_BASE_DIR, normalizedProjectName + '_prd');

  if (!fs.existsSync(projectDir)) {
    throw new Error('项目目录不存在: ' + projectDir);
  }

  const versionFiles = findAllVersionFiles(projectDir, normalizedProjectName);

  if (versionFiles.length === 0) {
    throw new Error(`未找到项目 ${normalizedProjectName} 的任何PRD版本文件`);
  }

  const latestOldFile = versionFiles[0];
  const newMajor = latestOldFile.version.major;
  const newMinor = latestOldFile.version.minor + 1;
  const newFilename = normalizedProjectName + '_prd_' + newMajor + '.' + newMinor + '.yaml';
  const newFilePath = path.join(projectDir, newFilename);

  console.log('[upgradePrdVersion] 复制 ' + latestOldFile.filename + ' -> ' + newFilename);

  const oldFileContents = fs.readFileSync(latestOldFile.filePath, 'utf8');
  const prdConfig = yaml.load(oldFileContents);

  if (!prdConfig.prd_specifications || !Array.isArray(prdConfig.prd_specifications)) {
    prdConfig.prd_specifications = [];
  }

  // ========== 核心修复：彻底清理所有格式错误的条目 ==========
  // 第一步：把所有不带id的纯字符串条目或者不带id的对象垃圾条目全部删掉
  prdConfig.prd_specifications = prdConfig.prd_specifications.filter(spec => {
    return spec && typeof spec === 'object' && typeof spec.id === 'string' && spec.id.trim();
  });
  console.log('[upgradePrdVersion] 已清理掉所有不带id的非法条目，剩余有效spec数量:', prdConfig.prd_specifications.length);

  // 第二步：严格只通过id匹配去更新已存在条目的content，绝对不允许追加新条目
  for (const clarified of clarifiedContents) {
    if (!clarified || !clarified.id) {
      continue;
    }
    const targetItem = prdConfig.prd_specifications.find(s => s.id === clarified.id);
    if (targetItem) {
      // 找到原条目，精准覆盖content字段，如果新content非空就直接替换掉原来的null/旧内容
      if (clarified.content !== undefined && clarified.content !== null && String(clarified.content).trim()) {
        targetItem.content = clarified.content;
        console.log(`[upgradePrdVersion] 已更新 id=${clarified.id} 的content, 长度=${clarified.content.length}`);
      } else {
        // 新内容为空就完全保留原来的content，不设置为null
        console.log(`[upgradePrdVersion] id=${clarified.id} 的新内容为空，保留原有content`);
      }
      if (clarified.system_instruction !== undefined) {
        targetItem.system_instruction = clarified.system_instruction;
      }
    } else {
      // 原文件里完全没找到对应id的条目，才允许安全补充进去
      console.log(`[upgradePrdVersion] 安全补充不存在的新条目: id=${clarified.id}`);
      prdConfig.prd_specifications.push({
        id: clarified.id,
        name: clarified.name || '',
        content: clarified.content || '',
        system_instruction: clarified.system_instruction || ''
      });
    }
  }

  prdConfig.version = String(newMajor + '.' + newMinor);

  const newYamlContent = yaml.dump(prdConfig, { indent: 2, noRefs: true, noUnicodeEscape: true, lineWidth: -1 });
  fs.writeFileSync(newFilePath, newYamlContent, 'utf8');

  console.log('[upgradePrdVersion] 新版本已成功写入:', newFilePath);

  return {
    ok: true,
    oldVersion: String(latestOldFile.version.major + '.' + latestOldFile.version.minor),
    newVersion: String(newMajor + '.' + newMinor),
    newFilePath,
    newFilename
  };
}
