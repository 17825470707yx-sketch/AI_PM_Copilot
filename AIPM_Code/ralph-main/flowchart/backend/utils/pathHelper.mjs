import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const THIS_FILE_DIR = dirname(fileURLToPath(import.meta.url));

let cachedPrdBaseDir = null;

export function getPrdBaseDir() {
  if (cachedPrdBaseDir) return cachedPrdBaseDir;

  let currentDir = THIS_FILE_DIR;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(currentDir, 'prd', 'prd_template_base.yaml');
    if (fs.existsSync(candidate)) {
      cachedPrdBaseDir = path.join(currentDir, 'prd');
      console.log('[pathHelper] 自动定位到 PRD 目录:', cachedPrdBaseDir);
      return cachedPrdBaseDir;
    }
    currentDir = dirname(currentDir);
  }

  console.warn('[pathHelper] 警告：未能自动向上找到 prd_template_base.yaml，使用兜底硬编码路径');
  cachedPrdBaseDir = path.resolve(THIS_FILE_DIR, '../../../AIPM_Code/prd');
  return cachedPrdBaseDir;
}

export async function ensurePrdBaseDir() {
  const baseDir = getPrdBaseDir();
  try {
    await fsPromises.access(baseDir);
  } catch {
    await fsPromises.mkdir(baseDir, { recursive: true });
    console.log('[pathHelper] PRD 目录不存在，已自动创建:', baseDir);
  }
  return baseDir;
}
