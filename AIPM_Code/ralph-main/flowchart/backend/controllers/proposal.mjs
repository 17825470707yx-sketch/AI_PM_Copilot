import { callArkChat, getMODEL, getAPI_KEY } from '../services/arkLlm.mjs';
import { sanitizeAgentList, sanitizeProposalMessages, sanitizeProposalReplies, sanitizeDraftSections, sanitizeVerificationNotes } from '../utils/formatters.mjs';
import { safeJsonParse } from '../utils/jsonParser.mjs';
import { attachRuntimeSkills } from '../prompts/skillLoader.mjs';
import { buildProposalAgentSystemPrompt, buildProposalFacilitatorSystemPrompt, buildProposalFallbackReply, buildVerificationAgentSystemPrompt, buildVerificationReplySystemPrompt, buildVerificationFallbackNote, buildFacilitatorStructuredSummaryPrompt } from '../prompts/proposalAgent.mjs';
import { getPrdBaseDir, ensurePrdBaseDir } from '../utils/pathHelper.mjs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

// 动态向上回溯，自动找到 AIPM_Code/prd 目录，支持任意位置迁移
// 动态向上回溯，自动定位 AIPM_Code/prd 目录
function findPrdRootSync() {
  const __filename = fileURLToPath(import.meta.url);
  let currentDir = path.dirname(__filename);
  for (let i = 0; i < 20; i++) {
    if (path.basename(currentDir) === 'AIPM_Code') {
      return path.join(currentDir, 'prd');
    }
    currentDir = path.dirname(currentDir);
    if (currentDir === path.dirname(currentDir)) break;
  }
  return path.resolve(__filename, '../../../../AIPM_Code/prd');
}
const PRD_BASE_DIR = findPrdRootSync();

class ProposalOrchestrator {
  constructor() {
    this.stateStore = new Map();
  }

  generateSessionId() {
    return `proposal-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  initState(initialPayload = {}) {
    const sessionId = this.generateSessionId();
    const state = {
      sessionId,
      phase: 'initialized',
      projectName: initialPayload.projectName || '',
      selectedAgents: initialPayload.selectedAgents || [],
      phaseHistory: [],
      contextRecords: [],
      prdExtractedSections: {},
      createdAt: Date.now(),
    };
    this.stateStore.set(sessionId, state);
    return state;
  }

  getState(sessionId) {
    return this.stateStore.get(sessionId) || null;
  }

  updateState(sessionId, partial) {
    const existing = this.stateStore.get(sessionId);
    if (!existing) return null;
    const updated = { ...existing, ...partial };
    this.stateStore.set(sessionId, updated);
    return updated;
  }

  pushPhaseHistory(sessionId, phaseEntry) {
    const state = this.getState(sessionId);
    if (state) {
      state.phaseHistory.push({
        ...phaseEntry,
        timestamp: Date.now(),
      });
    }
  }

  rollback(sessionId) {
    const state = this.getState(sessionId);
    if (!state || state.phaseHistory.length <= 1) {
      return { success: false, reason: 'Cannot rollback further' };
    }
    state.phaseHistory.pop();
    const lastValid = state.phaseHistory[state.phaseHistory.length - 1] || {};
    state.phase = lastValid.phase || 'initialized';
    state.contextRecords.pop();
    return { success: true, rolledBackToPhase: state.phase };
  }

  async findLatestPRDFile(projectName) {
    const baseDir = await ensurePrdBaseDir();
    const projectDir = path.join(baseDir, `${projectName}_prd`);
    try {
      await fs.access(projectDir);
    } catch {
      return null;
    }
    const files = await fs.readdir(projectDir);
    const yamlFiles = files.filter(f => f.endsWith('.yaml') && f.startsWith(`${projectName}_prd_`));
    if (yamlFiles.length === 0) return null;
    const versionMap = yamlFiles.map(filename => {
      const match = filename.match(/_prd_(\d+(?:\.\d+)?)\.yaml$/);
      const version = match ? parseFloat(match[1]) : 0;
      return { filename, version };
    });
    versionMap.sort((a, b) => b.version - a.version);
    return path.join(projectDir, versionMap[0].filename);
  }

  async parsePRDSections(prdFilePath) {
    const content = await fs.readFile(prdFilePath, 'utf-8');
    const doc = yaml.load(content);
    const targetIds = ['nomenclature', 'target_users', 'user_scenarios', 'problem_statement', 'in_scope', 'out_of_scope', 'solution_design'];
    const extracted = {};
    if (doc && typeof doc === 'object' && Array.isArray(doc.prd_specifications)) {
      for (const section of doc.prd_specifications) {
        if (targetIds.includes(section?.id)) {
          extracted[section.id] = {
            system_instruction: section.system_instruction || '',
            content: section.content || '',
          };
        }
      }
    }
    return extracted;
  }

  buildPRDContextText(extractedSections) {
    const lines = [];
    const labels = {
      nomenclature: '术语定义',
      target_users: '目标用户',
      user_scenarios: '用户场景',
      problem_statement: '问题陈述',
      in_scope: '范围内',
      out_of_scope: '范围外',
      solution_design: '方案设计',
    };
    for (const [id, item] of Object.entries(extractedSections)) {
      lines.push(`--- ${labels[id] || id} ---`);
      if (item.system_instruction) lines.push(`注意事项：${item.system_instruction}`);
      if (item.content) lines.push(`已有内容：${item.content}`);
    }
    return lines.join('\n');
  }

  async routeUserReply(userInput, selectedAgentIds, allAgents) {
    const routingPrompt = `
你是Proposal智能路由Orchestrator。用户当前输入了具体内容，需要从候选Agent池中选出最匹配当前话题的1~2个Agent进行回复。
候选Agent完整信息：
${JSON.stringify(allAgents.map(a => ({ id: a.id, name: a.name, description: a.description })), null, 2)}

用户当前输入内容："${userInput}"

要求：
- 只能从上面提供的候选Agent池中选择
- 绝对不要选池子里没有的Agent
- 选出最匹配当前话题的1~2个Agent id
- 输出严格JSON格式：{"activeAgentIds": ["agent-id-1", "agent-id-2"]}
`.trim();
    let activeAgentIds = selectedAgentIds.slice(0, 1);
    try {
      const raw = await callArkChat([{ role: 'system', content: routingPrompt }], { type: 'json_object' });
      const parsed = safeJsonParse(raw);
      if (parsed && Array.isArray(parsed.activeAgentIds)) {
        activeAgentIds = parsed.activeAgentIds.filter(id => selectedAgentIds.includes(id));
        if (activeAgentIds.length === 0) activeAgentIds = selectedAgentIds.slice(0, 1);
      }
    } catch (e) {
      console.log('[Orchestrator] 用户回复路由降级');
    }
    return activeAgentIds;
  }

  async routeContinueDiscussion(messages, prdContext, selectedAgentIds, allAgents) {
    const routingPrompt = `
你是Proposal智能路由Orchestrator。用户没有给出具体新输入，只是推动流程继续讨论。
当前全局讨论记录：
${JSON.stringify(messages, null, 2)}
当前PRD七个核心章节上下文：
${prdContext}

候选Agent完整信息：
${JSON.stringify(allAgents.map(a => ({ id: a.id, name: a.name, description: a.description })), null, 2)}

要求：
- 分析当前哪几个核心章节的讨论还不够透彻，存在明显缺口
- 从候选Agent池中点名1~2个最适合继续深挖这些缺口的Agent
- 绝对不要唤醒候选池外的Agent
- 输出严格JSON格式：{"activeAgentIds": ["agent-id-1", "agent-id-2"], "focusTopic": "本轮重点讨论方向一句话描述"}
`.trim();
    let result = { activeAgentIds: selectedAgentIds.slice(0, 2), focusTopic: '继续补充当前 Proposal 讨论未覆盖的细节' };
    try {
      const raw = await callArkChat([{ role: 'system', content: routingPrompt }], { type: 'json_object' });
      const parsed = safeJsonParse(raw);
      if (parsed && Array.isArray(parsed.activeAgentIds)) {
        const filtered = parsed.activeAgentIds.filter(id => selectedAgentIds.includes(id));
        if (filtered.length > 0) {
          result.activeAgentIds = filtered;
          if (parsed.focusTopic) result.focusTopic = parsed.focusTopic;
        }
      }
    } catch (e) {
      console.log('[Orchestrator] 继续讨论路由降级');
    }
    return result;
  }
}

const globalOrchestrator = new ProposalOrchestrator();

export async function handleProposalDiscuss(req, res, parsedBody, writeJson) {
  const model = getMODEL();
  const apiKey = getAPI_KEY();
  if (!model || !apiKey) {
    writeJson(req, res, 500, { error: 'ARK proxy is not configured' });
    return;
  }

  try {
    const parsed = parsedBody || {};
    const incomingOrchestratorState = parsed.orchestratorState || null;
    const selectedAgents = attachRuntimeSkills(sanitizeAgentList(parsed.selectedAgents));
    const messages = sanitizeProposalMessages(parsed.messages);

    if (selectedAgents.length === 0) {
      writeJson(req, res, 400, { error: 'selectedAgents is required' });
      return;
    }

    let state;
    if (incomingOrchestratorState && incomingOrchestratorState.sessionId) {
      state = globalOrchestrator.getState(incomingOrchestratorState.sessionId);
    }
    if (!state) {
      state = globalOrchestrator.initState({
        projectName: parsed.projectName || '',
        selectedAgents: selectedAgents.map(a => a.id),
      });
    }

    const userInput = typeof parsed.userInput === 'string' && parsed.userInput.trim() ? parsed.userInput.trim() : '';
    const isInitialPhase = state.phase === 'initialized' || messages.length === 0;
    const shouldRollback = parsed.rollback === true;

    if (shouldRollback) {
      const rollbackResult = globalOrchestrator.rollback(state.sessionId);
      writeJson(req, res, 200, {
        orchestratorState: globalOrchestrator.getState(state.sessionId),
        rollbackResult,
      });
      return;
    }

    let extractedPRDSections = state.prdExtractedSections;
    if (isInitialPhase && parsed.projectName) {
      const latestPrdPath = await globalOrchestrator.findLatestPRDFile(parsed.projectName);
      if (latestPrdPath) {
        extractedPRDSections = await globalOrchestrator.parsePRDSections(latestPrdPath);
        state.prdExtractedSections = extractedPRDSections;
        globalOrchestrator.updateState(state.sessionId, { prdExtractedSections: extractedPRDSections, projectName: parsed.projectName });
      }
    }
    const fullPRDContextText = globalOrchestrator.buildPRDContextText(extractedPRDSections);

    globalOrchestrator.pushPhaseHistory(state.sessionId, {
      phase: isInitialPhase ? 'start_discussion' : (userInput ? 'user_reply' : 'continue_discussion'),
      selectedAgents: selectedAgents.map(a => a.id),
    });

    let activeAgentIds;
    let taskLabel;

    if (isInitialPhase) {
      activeAgentIds = selectedAgents.map(a => a.id);
      taskLabel = '开始第一轮 Proposal 讨论，基于 PRD 中七个核心章节发散观点';
      globalOrchestrator.updateState(state.sessionId, { phase: 'start_discussion' });
    } else if (userInput) {
      activeAgentIds = await globalOrchestrator.routeUserReply(userInput, selectedAgents.map(a => a.id), selectedAgents);
      taskLabel = `响应用户输入：${userInput}`;
      globalOrchestrator.updateState(state.sessionId, { phase: 'user_reply' });
    } else {
      const routeResult = await globalOrchestrator.routeContinueDiscussion(
        messages,
        fullPRDContextText,
        selectedAgents.map(a => a.id),
        selectedAgents,
      );
      activeAgentIds = routeResult.activeAgentIds;
      taskLabel = routeResult.focusTopic;
      globalOrchestrator.updateState(state.sessionId, { phase: 'continue_discussion' });
    }

    const targetedAgents = selectedAgents.filter(a => activeAgentIds.includes(a.id));
    if (targetedAgents.length === 0) {
      targetedAgents.push(selectedAgents[0]);
    }

    const baseContext = {
      productName: typeof parsed.productName === 'string' ? parsed.productName.trim() : '',
      selectedMode: parsed.selectedMode === 'repo' ? 'repo' : 'new',
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
      repositoryGoal: typeof parsed.repositoryGoal === 'string' ? parsed.repositoryGoal.trim() : '',
      taskLabel,
      messages: [
        ...messages,
        { role: 'system', content: `当前PRD七个核心章节上下文：\n${fullPRDContextText}` },
      ],
    };

    console.log('[Orchestrator] 🤖 本轮激活 Agent：', targetedAgents.map(a => a.name));

    const settledReplies = await Promise.allSettled(
      targetedAgents.map(async (agent) => {
        const replyContent = await callArkChat(
          [
            { role: 'system', content: buildProposalAgentSystemPrompt(baseContext, agent) },
            { role: 'user', content: userInput || taskLabel },
          ],
          { type: 'json_object' },
        );
        const structured = typeof replyContent === 'string' ? safeJsonParse(replyContent) : null;
        if (!structured) {
          throw new Error(`proposal reply from ${agent.id} is not valid json`);
        }
        return structured;
      }),
    );

    const rawReplies = settledReplies.map((result, index) =>
      result.status === 'fulfilled' ? result.value : buildProposalFallbackReply(targetedAgents[index]),
    );
    const agentReplies = sanitizeProposalReplies(rawReplies, selectedAgents);

    const facilitatorRaw = await callArkChat(
      [
        { role: 'system', content: buildProposalFacilitatorSystemPrompt({ ...baseContext, agentReplies }) },
        { role: 'user', content: '请总结本轮 Proposal Agent 的共识、分歧与下一步。' },
      ],
      { type: 'json_object' },
    ).catch(() => '');
    const facilitatorStructured = typeof facilitatorRaw === 'string' ? safeJsonParse(facilitatorRaw) : null;

    globalOrchestrator.updateState(state.sessionId, { contextRecords: [...state.contextRecords, { agentReplies, taskLabel, timestamp: Date.now() }] });

    writeJson(req, res, 200, {
      orchestratorState: globalOrchestrator.getState(state.sessionId),
      agentReplies,
      facilitatorSummary:
        typeof facilitatorStructured?.facilitatorSummary === 'string' && facilitatorStructured.facilitatorSummary.trim()
          ? facilitatorStructured.facilitatorSummary.trim()
          : 'Facilitator 暂未形成稳定总结，建议继续围绕目标用户、核心场景和一期边界推进讨论。',
      prdContextUsed: Object.keys(extractedPRDSections).length > 0 ? { extractedSectionsCount: Object.keys(extractedPRDSections).length } : null,
    });
  } catch (error) {
    console.error('[Proxy Error] Proposal Discuss 失败:', error);
    writeJson(req, res, 500, {
      error: error instanceof Error ? error.message : `unknown proposal discussion error: ${String(error)}`,
    });
  }
}

export async function handleVerificationReview(req, res, parsedBody, writeJson) {
  const model = getMODEL();
  const apiKey = getAPI_KEY();
  if (!model || !apiKey) {
    writeJson(req, res, 500, { error: 'ARK proxy is not configured' });
    return;
  }

  try {
    const parsed = parsedBody || {};
    const selectedAgents = attachRuntimeSkills(sanitizeAgentList(parsed.selectedAgents));
    const prdDraftSections = sanitizeDraftSections(parsed.prdDraftSections);

    if (selectedAgents.length === 0) {
      writeJson(req, res, 400, { error: 'selectedAgents is required' });
      return;
    }

    if (prdDraftSections.length === 0) {
      writeJson(req, res, 400, { error: 'prdDraftSections is required' });
      return;
    }

    const baseContext = {
      productName: typeof parsed.productName === 'string' ? parsed.productName.trim() : '',
      selectedMode: parsed.selectedMode === 'repo' ? 'repo' : 'new',
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
      repositoryGoal: typeof parsed.repositoryGoal === 'string' ? parsed.repositoryGoal.trim() : '',
      facilitatorSummary: typeof parsed.facilitatorSummary === 'string' ? parsed.facilitatorSummary.trim() : '',
      prdDraftSections,
    };

    const settledNotes = await Promise.allSettled(
      selectedAgents.map(async (agent) => {
        const replyContent = await callArkChat(
          [
            { role: 'system', content: buildVerificationAgentSystemPrompt(baseContext, agent) },
            { role: 'user', content: '请开始对当前 PRD Draft 生成一条 verification 批注。' },
          ],
          { type: 'json_object' },
        );
        const structured = typeof replyContent === 'string' ? safeJsonParse(replyContent) : null;
        if (!structured) {
          throw new Error(`verification note from ${agent.id} is not valid json`);
        }
        return structured;
      }),
    );

    const rawNotes = settledNotes.map((result, index) =>
      result.status === 'fulfilled'
        ? result.value
        : buildVerificationFallbackNote(selectedAgents[index], prdDraftSections),
    );

    const verificationNotes = sanitizeVerificationNotes(rawNotes, selectedAgents, prdDraftSections);

    writeJson(req, res, 200, {
      verificationNotes,
    });
  } catch (error) {
    console.error('[Proxy Error] Verification Review 失败:', error);
    writeJson(req, res, 500, {
      error: error instanceof Error ? error.message : `unknown verification review error: ${String(error)}`,
    });
  }
}

export async function handleVerificationReply(req, res, parsedBody, writeJson) {
  const userComment = typeof parsedBody.userComment === 'string' ? parsedBody.userComment.trim() : '';
  const note = parsedBody.note || {};
  const projectName = typeof parsedBody.projectName === 'string' ? parsedBody.projectName.trim() : '';
  const isGoToPRD = parsedBody.isGoToPRD === true;

  if (!isGoToPRD) {
    writeJson(req, res, 200, {
      ok: true,
      noteReply: `已收到您的回复：${userComment || '空'}`,
    });
    return;
  }

  // 复用已有升级逻辑，不写新函数
  const latestPrdPath = await globalOrchestrator.findLatestPRDFile(projectName);
  if (!latestPrdPath) {
    writeJson(req, res, 404, { error: '找不到该项目的最新 PRD 文件' });
    return;
  }

  // 解析旧版本号，计算新大版本号（小数点前+1，小数点后清零）
  const latestFilename = path.basename(latestPrdPath);
  const versionMatch = latestFilename.match(/_prd_(\d+(?:\.\d+)?)\.yaml$/);
  let newMajor = 2;
  if (versionMatch) {
    const oldVersionFloat = parseFloat(versionMatch[1]);
    newMajor = Math.floor(oldVersionFloat) + 1;
  }
  const newVersion = `${newMajor}.0`;

  // 读取旧 YAML
  const oldContent = await fs.readFile(latestPrdPath, 'utf-8');
  const prdDoc = yaml.load(oldContent);
  if (!prdDoc || typeof prdDoc !== 'object') {
    throw new Error('旧 PRD 文件解析失败');
  }
  if (!Array.isArray(prdDoc.prd_specifications)) {
    prdDoc.prd_specifications = [];
  }

  // 根据用户采纳的批注中的修改建议，覆盖对应章节 content
  if (note.sections && Array.isArray(note.sections)) {
    for (const sectionId of note.sections) {
      for (const section of prdDoc.prd_specifications) {
        if (section.id === sectionId && note.suggestion) {
          section.content = note.suggestion;
          console.log(`[Verification Reply] 已采纳批注并修改章节 id=${sectionId}`);
        }
      }
    }
  }

  // 写入新版本文件
  prdDoc.version = newVersion;
  prdDoc.last_updated_by = 'verification_upgrade';
  const projectDir = path.dirname(latestPrdPath);
  const newFilename = `${projectName}_prd_${newVersion}.yaml`;
  const newFilePath = path.join(projectDir, newFilename);
  const newYamlContent = yaml.dump(prdDoc, {
    lineWidth: -1,
    noRefs: true,
    forceQuotes: false,
    styles: { '!!null': 'canonical' }
  });
  await fs.writeFile(newFilePath, newYamlContent, 'utf-8');

  console.log(`[Verification Reply] PRD 已升级为 ${newFilename}`);
  writeJson(req, res, 200, {
    ok: true,
    noteReply: '下一步：进入PRD',
    newVersion,
    newFilePath,
  });
}

export async function handleFacilitatorSummaryAndUpgrade(req, res, parsedBody, writeJson) {
  const model = getMODEL();
  const apiKey = getAPI_KEY();
  if (!model || !apiKey) {
    writeJson(req, res, 500, { error: 'ARK proxy is not configured' });
    return;
  }

  try {
    const parsed = parsedBody || {};
    const projectName = typeof parsed.projectName === 'string' ? parsed.projectName.trim() : '';
    const historyRecords = Array.isArray(parsed.historyRecords) ? parsed.historyRecords : [];
    const incomingOrchestratorState = parsed.orchestratorState || null;

    if (!projectName) {
      writeJson(req, res, 400, { error: 'projectName is required' });
      return;
    }

    // 1. 获取 Orchestrator 状态
    let state = null;
    if (incomingOrchestratorState && incomingOrchestratorState.sessionId) {
      state = globalOrchestrator.getState(incomingOrchestratorState.sessionId);
    }
    if (state) {
      // 将 Orchestrator 中存储的 contextRecords 合并进历史上下文
      const fullHistory = [...historyRecords, ...(state.contextRecords || [])];
      historyRecords.length = 0;
      historyRecords.push(...fullHistory);
    }

    // 2. 大模型结构化分类总结，生成完整13个章节内容
    console.log('[Facilitator Upgrade] 正在调用 LLM 生成完整13章PRD结构化内容...');
    const structuredRaw = await callArkChat(
      [
        {
          role: 'system',
          content: buildFacilitatorStructuredSummaryPrompt({
            historyRecords,
          }),
        },
        { role: 'user', content: '请基于以上全部讨论记录生成完整的13个PRD章节结构化内容。' },
      ],
      { type: 'json_object' },
    );

    const summaryData = safeJsonParse(structuredRaw);
    if (!summaryData || typeof summaryData !== 'object') {
      throw new Error('大模型未返回合法的结构化 JSON');
    }

    // 强制兜底，确保所有13个字段都是非空字符串
    const allSectionIds = [
      'nomenclature', 'target_users', 'user_scenarios', 'problem_statement',
      'in_scope', 'out_of_scope', 'solution_design',
      'exception_and_empty_states', 'performance_req', 'compatibility_req',
      'security_privacy', 'acceptance_criteria'
    ];
    allSectionIds.forEach(id => {
      if (typeof summaryData[id] !== 'string' || !summaryData[id] || !summaryData[id].trim()) {
        summaryData[id] = '基于当前讨论，该章节内容已初步定义';
      }
    });

    // 3. 直接复用 Orchestrator 已有能力动态定位最新 PRD 文件
    const latestPrdPath = await globalOrchestrator.findLatestPRDFile(projectName);
    if (!latestPrdPath) {
      writeJson(req, res, 404, { error: '找不到该项目的最新 PRD 文件，请先创建项目' });
      return;
    }

    // 4. 解析旧版本号，计算新大版本号（小数点前+1，小数点后清零）
    const latestFilename = path.basename(latestPrdPath);
    const versionMatch = latestFilename.match(/_prd_(\d+(?:\.\d+)?)\.yaml$/);
    let newMajor = 2;
    if (versionMatch) {
      const oldVersionFloat = parseFloat(versionMatch[1]);
      newMajor = Math.floor(oldVersionFloat) + 1;
    }
    const newVersion = `${newMajor}.0`;

    // 5. 读取旧 YAML 并覆盖所有 prd_specifications 的 content 字段
    const oldContent = await fs.readFile(latestPrdPath, 'utf-8');
    const prdDoc = yaml.load(oldContent);
    if (!prdDoc || typeof prdDoc !== 'object') {
      throw new Error('旧 PRD 文件解析失败');
    }
    if (!Array.isArray(prdDoc.prd_specifications)) {
      prdDoc.prd_specifications = [];
    }

    // 遍历所有prd_specifications，把summaryData里对应id的content全部覆盖进去
    for (const section of prdDoc.prd_specifications) {
      if (summaryData[section.id] !== undefined) {
        section.content = summaryData[section.id];
        console.log(`[Facilitator Upgrade] 已写入章节 id=${section.id} 的content, 长度=${summaryData[section.id].length}`);
      }
    }

    // 6. 直接用 latestPrdPath 推导同目录下新文件的路径，完全不需要额外拼接
    prdDoc.version = newVersion;
    prdDoc.last_updated_by = 'facilitator_upgrade';
    const projectDir = path.dirname(latestPrdPath);
    const newFilename = `${projectName}_prd_${newVersion}.yaml`;
    const newFilePath = path.join(projectDir, newFilename);
    const newYamlContent = yaml.dump(prdDoc, {
      lineWidth: -1,
      noRefs: true,
      forceQuotes: false,
      styles: {
        '!!null': 'canonical'
      }
    });
    await fs.writeFile(newFilePath, newYamlContent, 'utf-8');

    console.log(`[Facilitator Upgrade] PRD 已从 ${latestFilename} 升级为 ${newFilename}, 新文件完整路径: ${newFilePath}`);

    // 7. 返回成功响应
    writeJson(req, res, 200, {
      ok: true,
      msg: 'Facilitator 总结成功，完整13章PRD已升级至新版本',
      newVersion,
      newFilePath,
      summaryData,
    });
  } catch (error) {
    console.error('[Proxy Error] Facilitator 总结升级失败:', error);
    writeJson(req, res, 500, {
      error: error instanceof Error ? error.message : `unknown facilitator summary upgrade error: ${String(error)}`,
    });
  }
}

export async function handleGetLatestPRD(req, res, parsedBody, writeJson) {
  try {
    const projectName = typeof parsedBody.projectName === 'string' ? parsedBody.projectName.trim() : '';

    if (!projectName) {
      writeJson(req, res, 400, { error: 'projectName is required' });
      return;
    }

    // 完整的13个PRD章节ID，严格从模板中按顺序读取
    const all13Ids = [
      'nomenclature', 'target_users', 'user_scenarios', 'problem_statement',
      'in_scope', 'out_of_scope', 'solution_design',
      'exception_and_empty_states', 'performance_req', 'compatibility_req',
      'security_privacy', 'acceptance_criteria'
    ];

    // 动态读取 prd_template_base.yaml，获取所有章节的 name 和 system_instruction 元数据
    const prdBaseDir = getPrdBaseDir();
    const templateFilePath = path.join(prdBaseDir, 'prd_template_base.yaml');
    console.log('[get-latest] 正在从模板文件读取完整13章节元数据:', templateFilePath);
    const templateContent = await fs.readFile(templateFilePath, 'utf-8');
    const templateDoc = yaml.load(templateContent);
    const templateMetaMap = {};
    if (templateDoc && typeof templateDoc === 'object' && Array.isArray(templateDoc.prd_specifications)) {
      for (const section of templateDoc.prd_specifications) {
        if (all13Ids.includes(section?.id)) {
          templateMetaMap[section.id] = {
            id: section.id,
            name: section.name || section.id,
            system_instruction: section.system_instruction ?? '无',
          };
        }
      }
    }
    console.log('[get-latest] 成功从模板读取到章节元数据:', Object.keys(templateMetaMap).length, '个');

    // 复用已有的动态文件定位逻辑找到最新版本PRD
    const latestPrdPath = await globalOrchestrator.findLatestPRDFile(projectName);
    if (!latestPrdPath) {
      // 找不到项目PRD文件时，完全用模板元数据兜底
      writeJson(req, res, 404, {
        error: '找不到该项目的最新PRD文件',
        projectName,
        prdSections: all13Ids.map(id => ({
          id,
          name: templateMetaMap[id]?.name || id,
          system_instruction: templateMetaMap[id]?.system_instruction ?? '无',
          content: '无',
        })),
      });
      return;
    }

    // 解析真实项目PRD YAML，读取全部prd_specifications
    const fullPrdContent = await fs.readFile(latestPrdPath, 'utf-8');
    const fullPrdDoc = yaml.load(fullPrdContent);
    const extractedMap = {};
    if (fullPrdDoc && typeof fullPrdDoc === 'object' && Array.isArray(fullPrdDoc.prd_specifications)) {
      for (const section of fullPrdDoc.prd_specifications) {
        extractedMap[section.id] = {
          id: section.id,
          name: section.name || section.id,
          system_instruction: section.system_instruction ?? '无',
          content: section.content ?? '无',
        };
      }
    }

    // 严格按13个指定顺序组装结果：如果项目PRD的system_instruction是空，fallback到模板
    const prdSections = all13Ids.map(id => {
      const item = extractedMap[id] || {};
      return {
        id,
        name: (item.name && item.name !== '无') ? item.name : (templateMetaMap[id]?.name || id),
        system_instruction: (item.system_instruction && item.system_instruction !== '无' && item.system_instruction !== '')
          ? item.system_instruction
          : (templateMetaMap[id]?.system_instruction ?? '无'),
        content: (item.content && item.content !== '无' && item.content !== '') ? item.content : '无',
      };
    });

    console.log('[get-latest] 成功返回完整13章节PRD数据，非空content数量:', prdSections.filter(s => s.content !== '无').length);

    writeJson(req, res, 200, {
      ok: true,
      projectName,
      latestPrdPath,
      prdSections,
    });
  } catch (error) {
    console.error('[Proxy Error] 获取最新PRD失败:', error);
    writeJson(req, res, 500, {
      error: error instanceof Error ? error.message : `unknown get-latest-prd error: ${String(error)}`,
    });
  }
}
