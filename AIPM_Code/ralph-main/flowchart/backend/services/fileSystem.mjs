import { readdir, readFile, writeFile, access } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import yaml from 'js-yaml';
import { decodeReadmeContent, toPlainText } from '../utils/jsonParser.mjs';
import { GITHUB_API_BASE, GITHUB_TOKEN } from './arkLlm.mjs';
import { getPrdBaseDir } from '../utils/pathHelper.mjs';

export async function scanProjectFiles(dir, fileList = []) {
  try {
    const files = await readdir(dir, { withFileTypes: true });
    for (const file of files) {
      if (['node_modules', '.git', 'dist', 'build', '.next'].includes(file.name)) continue;

      const filePath = join(dir, file.name);
      if (file.isDirectory()) {
        await scanProjectFiles(filePath, fileList);
      } else {
        const ext = extname(file.name);
        if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
          fileList.push(filePath);
        }
      }
    }
  } catch (err) {
    console.error('[File Scan Error]', err);
  }
  return fileList;
}

export function parseGitHubUrl(input) {
  let parsedUrl;
  try {
    parsedUrl = new URL(input);
  } catch {
    throw new Error('GitHub 地址格式不正确');
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const allowedHosts = new Set(['github.com', 'www.github.com']);
  if (!allowedHosts.has(hostname) && !GITHUB_API_BASE.includes(hostname)) {
    throw new Error('当前只支持 github.com 的公开仓库地址');
  }
  const parts = parsedUrl.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (parts.length < 2) {
    throw new Error('请提供完整的仓库地址，例如 https://github.com/owner/repo');
  }

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  let branch = '';

  if (parts[2] === 'tree' && parts.length > 3) {
    branch = decodeURIComponent(parts.slice(3).join('/'));
  }

  return { owner, repo, branch };
}

export async function fetchGitHubJson(pathname) {
  const headers = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'ProductAgent-Local-Proxy',
  };
  if (GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
  }
  const response = await fetch(`${GITHUB_API_BASE}${pathname}`, { headers });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || `GitHub API 请求失败, status=${response.status}`);
  }

  return data;
}

export async function importGitHubRepository(repositoryUrl, requestedBranch) {
  const { owner, repo, branch: branchFromUrl } = parseGitHubUrl(repositoryUrl);
  const repoInfo = await fetchGitHubJson(`/repos/${owner}/${repo}`);
  const branch = requestedBranch || branchFromUrl || repoInfo.default_branch;
  let readme = '';
  let rootContents = [];

  try {
    const readmeInfo = await fetchGitHubJson(
      `/repos/${owner}/${repo}/readme?ref=${encodeURIComponent(branch)}`,
    );
    readme = decodeReadmeContent(readmeInfo.content);
  } catch {
    readme = '';
  }

  try {
    rootContents = await fetchGitHubJson(
      `/repos/${owner}/${repo}/contents?ref=${encodeURIComponent(branch)}`,
    );
  } catch {
    rootContents = [];
  }

  const fileSample = Array.isArray(rootContents)
    ? rootContents
        .filter((item) => item.type === 'file')
        .slice(0, 5)
        .map((item) => item.path || item.name)
    : [];

  const readmeExcerpt = toPlainText(readme).slice(0, 200);

  return {
    fullName: repoInfo.full_name,
    htmlUrl: repoInfo.html_url,
    description: repoInfo.description || '该仓库未提供公开描述。',
    branch,
    primaryLanguage: repoInfo.language || 'Unknown',
    topics: Array.isArray(repoInfo.topics) ? repoInfo.topics.slice(0, 6) : [],
    stars: repoInfo.stargazers_count || 0,
    openIssues: repoInfo.open_issues_count || 0,
    fileSample,
    readmeExcerpt: readmeExcerpt + (readmeExcerpt.length >= 200 ? '...' : ''),
    name: repoInfo.name,
  };
}

function parseVersionStripV(versionStr) {
  const cleanStr = versionStr.replace(/^v/i, '');
  const match = cleanStr.match(/(\d+)\.(\d+)/);
  if (!match) return { major: -1, minor: -1 };
  return { major: parseInt(match[1], 10), minor: parseInt(match[2], 10) };
}

export async function findLatestPrdFile(projectName) {
  const baseDir = getPrdBaseDir();
  const projectDir = join(baseDir, `${projectName}_prd`);
  const files = await readdir(projectDir);

  const prdFiles = files.filter(f => f.startsWith(`${projectName}_prd_`) && f.endsWith('.yaml'));

  if (prdFiles.length === 0) {
    throw new Error(`项目 ${projectName} 下没有找到PRD文件`);
  }

  let latestFile = null;
  let maxVersion = -1;

  for (const file of prdFiles) {
    const afterPrefix = file.replace(`${projectName}_prd_`, '').replace('.yaml', '');
    const ver = parseVersionStripV(afterPrefix);
    if (ver.major >= 0 && ver.minor >= 0) {
      const versionNum = ver.major * 1000 + ver.minor;
      if (versionNum > maxVersion) {
        maxVersion = versionNum;
        latestFile = {
          fileName: file,
          filePath: join(projectDir, file),
          major: ver.major,
          minor: ver.minor
        };
      }
    }
  }

  if (!latestFile) {
    throw new Error('未找到符合版本号格式的PRD文件');
  }

  return latestFile;
}

export async function updatePrdWithRepositoryGoal(projectName, repositoryGoal) {
  const latestPrd = await findLatestPrdFile(projectName);
  const newMinor = latestPrd.minor + 1;
  const newVersion = `${latestPrd.major}.${newMinor}`;

  const baseDir = getPrdBaseDir();
  const projectDir = join(baseDir, `${projectName}_prd`);
  const newFileName = `${projectName}_prd_${latestPrd.major}.${newMinor}.yaml`;
  const newFilePath = join(projectDir, newFileName);

  const existingContent = await readFile(latestPrd.filePath, 'utf-8');
  const prdConfig = yaml.load(existingContent);

  if (!prdConfig.prd_specifications || !Array.isArray(prdConfig.prd_specifications)) {
    prdConfig.prd_specifications = [];
  }

  // 第一步：先清理所有格式非法的纯字符串条目，防止YAML结构污染
  prdConfig.prd_specifications = prdConfig.prd_specifications.filter(spec => {
    return spec && typeof spec === 'object' && typeof spec.id === 'string' && spec.id.trim();
  });
  console.log('[updatePrdWithRepositoryGoal] 已清理非法条目，剩余有效spec数量:', prdConfig.prd_specifications.length);

  // 第二步：删除 repository_goal 条目（完全不需要这个条目）
  prdConfig.prd_specifications = prdConfig.prd_specifications.filter(s => s.id !== 'repository_goal');

  // 第三步：将 repositoryGoal 按换行分割成分点，填充到4个指定的章节中
  const lines = repositoryGoal.split(/\r?\n/).filter(line => line.trim());
  const pointCount = lines.length;
  console.log('[updatePrdWithRepositoryGoal] 解析出 repositoryGoal 分点数量:', pointCount);

  const targetIds = ['nomenclature', 'target_users', 'user_scenarios', 'problem_statement'];
  
  targetIds.forEach((targetId, index) => {
    const item = prdConfig.prd_specifications.find(s => s.id === targetId);
    if (item) {
      // 将对应的分点填充到该条目的 content 中
      if (pointCount > index) {
        item.content = lines[index].trim();
      } else if (item.content === '无' || !item.content) {
        item.content = '暂未明确定义';
      }
      console.log(`[updatePrdWithRepositoryGoal] 已填充章节 ${targetId} 的内容`);
    }
  });

  prdConfig.version = newVersion;

  const newYamlContent = yaml.dump(prdConfig, { indent: 2, noRefs: true, noUnicodeEscape: true, lineWidth: -1 });
  await writeFile(newFilePath, newYamlContent, 'utf-8');

  console.log(`[PRD Update] 已创建新版本PRD: ${newFilePath}`);

  return {
    ok: true,
    oldVersion: `${latestPrd.major}.${latestPrd.minor}`,
    newVersion: newVersion,
    newFilePath: newFilePath
  };
}
