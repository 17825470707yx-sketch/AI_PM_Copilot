import './App.css';
import { useEffect, useMemo, useState, useRef } from 'react';

type Step = {
  title: string;
  desc: string;
};

type ClarificationMessage = {
  id: string;
  speaker: string;
  role: 'agent' | 'user';
  content: string;
};

type PrdDimensionItem = {
  id: string;
  name: string;
  content: string;
  system_instruction?: string;
};

type ClarificationChatResult = {
  agentReply: string;
  currentUnderstanding: string;
  detectedAmbiguities: string[];
  nextClarificationQuestion: string;
  partialDslContent: string | PrdDimensionItem[];
  isReadyToConfirm: boolean;
};

type RequirementRefineResult = {
  judgment: 'clear' | 'needs-work' | 'too-vague';
  strengths: string[];
  missingDimensions: string[];
  risks: string[];
  rationale: string;
  rewriteNotes: string[];
  optimized: string;
  alternativeVersion: string;
  nextStep: string;
  source?: 'model' | 'fallback';
  hasMeaningfulChange?: boolean;
};

type RequirementRefineTarget = 'summary' | 'repositoryGoal';

type AnalysisBoard = {
  targetUsers: string;
  coreScenario: string;
  coreDecision: string;
  risks: string[];
  metrics: string[];
  nextAction: string;
};

type RecallItem = {
  title: string;
  reason: string;
  tags: string[];
};

type ImportedRepo = {
  fullName: string;
  htmlUrl: string;
  description: string;
  branch: string;
  primaryLanguage: string;
  topics: string[];
  stars: number;
  openIssues: number;
  fileSample: string[];
  readmeExcerpt: string;
  name: string;
};

type AgentSkill = {
  id: string;
  name: string;
  focus: string;
  whenToUse: string;
  outputFormat: string[];
  systemPrompt: string;
  discussionOpen: string;
  userReplyTemplate: string;
};

type ExpertAgent = {
  id: string;
  name: string;
  role: string;
  description: string;
  summary: string;
  team: string;
  avatarUrl?: string;
  avatarBadge?: AgentBadgeKind;
  skills?: AgentSkill[];
};

type AgentBadgeKind =
  | 'research'
  | 'architecture'
  | 'design'
  | 'market'
  | 'data'
  | 'business'
  | 'safety'
  | 'consistency'
  | 'ai'
  | 'operations';

type VerificationNote = {
  id: string;
  agentId: string;
  agent: string;
  severity: 'high' | 'medium' | 'low';
  target: string;
  thoughts: string[];
  comment: string;
  suggestion: string;
};

type WorkflowStage = 'proposal' | 'draft' | 'verification';
type ReviewDecision = 'accept' | 'comment'; // 保留了合作者的 'comment' 交互逻辑
type NotePhase = 'thinking' | 'comment';
type ProposalPhase = 'select' | 'discuss';
type VerificationPhase = 'select' | 'review';
type ProposalDiscussionMessage = {
  id: string;
  speaker: string;
  role: 'agent' | 'user';
  content: string;
  skillName?: string;
};

type ProposalDiscussResponse = {
  agentReplies?: Array<{
    agentId: string;
    name: string;
    content: string;
    skillName?: string;
  }>;
  facilitatorSummary?: string;
  error?: string;
};

type VerificationReviewResponse = {
  verificationNotes?: VerificationNote[];
  error?: string;
};

type CommentReply = {
  id: string;
  author: 'user' | 'agent';
  content: string;
};

const steps: Step[] = [
  { title: '灵感与目标', desc: '输入产品 Idea' },
  { title: '提出与验证', desc: '选 Agent、生成 PRD、评审批注' }, // 合作者的 UI 文案修改
  { title: '文档输出', desc: '生成并导出 PRD' },
  { title: '流程与原型', desc: '生成核心交互流程' },
];

const workflowStages: Array<{ key: WorkflowStage; title: string; desc: string }> = [
  { key: 'proposal', title: '1. Proposal', desc: '选 Agent 并生成 proposal' },
  { key: 'draft', title: '2. PRD Draft', desc: '查看合成后的 PRD 草稿' },
  { key: 'verification', title: '3. Verification', desc: '选 Agent 批注并判定对错' },
];



const avatarConfigByAgentId: Record<
  string,
  {
    style: string;
    backgroundColor: string;
    badge: AgentBadgeKind;
    seedSuffix?: string;
    scale?: string;
  }
> = {
  'requirement-clarifier': { style: 'notionists-neutral', backgroundColor: 'e0e7ff', badge: 'research', seedSuffix: 'clarify', scale: '94' },
  'problem-user-context': { style: 'notionists-neutral', backgroundColor: 'dbeafe', badge: 'research', seedSuffix: 'observer' },
  'technical-feasibility': { style: 'personas', backgroundColor: 'dcfce7', badge: 'architecture', seedSuffix: 'system', scale: '92' },
  'flow-interaction-blueprint': { style: 'lorelei', backgroundColor: 'f5d0fe', badge: 'design', seedSuffix: 'canvas' },
  'competitive-case': { style: 'adventurer-neutral', backgroundColor: 'fde68a', badge: 'market', seedSuffix: 'growth' },
  'metrics-prioritization': { style: 'personas', backgroundColor: 'bfdbfe', badge: 'data', seedSuffix: 'metrics', scale: '92' },
  'scope-boundary': { style: 'notionists', backgroundColor: 'fdba74', badge: 'business', seedSuffix: 'strategy' },
  'verification-uat-acceptance': { style: 'adventurer-neutral', backgroundColor: 'bbf7d0', badge: 'architecture', seedSuffix: 'scope' },
  'verification-security-privacy': { style: 'lorelei-neutral', backgroundColor: 'fecdd3', badge: 'safety', seedSuffix: 'guard' },
  'verification-compatibility-adaptation': { style: 'personas', backgroundColor: 'c7d2fe', badge: 'consistency', seedSuffix: 'logic', scale: '92' },
  'verification-performance-concurrency': { style: 'lorelei', backgroundColor: 'e9d5ff', badge: 'ai', seedSuffix: 'model' },
  'verification-exception-empty-state': { style: 'notionists-neutral', backgroundColor: 'fdba74', badge: 'business', seedSuffix: 'roi' },
  'release-gate-orchestrator': { style: 'open-peeps', backgroundColor: 'fecaca', badge: 'operations', seedSuffix: 'delivery' },
};

function buildAgentAvatarUrl(agentId: string, team: string) {
  const config = avatarConfigByAgentId[agentId];
  const backgroundByTeam: Record<string, string> = {
    'Clarification Layer': 'e0e7ff',
    'Research Team': 'dbeafe',
    'Technical Team': 'dcfce7',
    'Creative Team': 'f5d0fe',
    'Strategy Team': 'fde68a',
    'Verification Team': 'e0e7ff',
    'AI Team': 'e9d5ff',
    'Operations Team': 'fecdd3',
  };

  const backgroundColor = config?.backgroundColor || backgroundByTeam[team] || 'dbeafe';
  const params = new URLSearchParams({
    seed: `${agentId}-${config?.seedSuffix || 'v2'}`,
    size: '96',
    radius: '24',
    scale: config?.scale || '94',
    backgroundType: 'solid',
    backgroundColor,
  });

  return `https://api.dicebear.com/9.x/${config?.style || 'open-peeps'}/svg?${params.toString()}`;
}

function attachAgentAvatar(agent: ExpertAgent): ExpertAgent {
  return {
    ...agent,
    avatarUrl: buildAgentAvatarUrl(agent.id, agent.team),
    avatarBadge: avatarConfigByAgentId[agent.id]?.badge,
  };
}

const problemUserContextSkill: AgentSkill = {
  id: 'problem-user-context',
  name: 'Problem & User Context',
  focus: '将产品灵感转成清晰的用户、场景、痛点和待解决问题清单。',
  whenToUse: '当用户只给出一句idea，但目标用户和场景不清楚，需要输出待解决问题清单时调用。',
  outputFormat: ['Target Users', 'User Scenarios', 'Problem Statement List', 'Assumptions To Validate'],
  systemPrompt:
    '你是 Problem & User Context Agent。将产品灵感或模糊需求转成清晰的目标用户、核心场景、痛点和待解决问题清单，为后续 scope boundary 提供事实基础。不要直接设计功能，不要编造用户研究证据。',
  discussionOpen:
    '我会先识别目标用户、非目标用户、核心使用场景和当前替代方案，输出待解决问题清单，标注证据强度和仍需验证的假设，避免团队一开始就围着功能自嗨。',
  userReplyTemplate:
    '我会把“{input}”纳入目标用户、场景和待解决问题清单，检查它是否帮助澄清了真实痛点，而不是过早跳到实现方案。',
};

const competitiveCaseSkill: AgentSkill = {
  id: 'competitive-case',
  name: 'Competitive Case',
  focus: '通过竞品或相似案例帮助PM判断当前方案是否合理，提供对方案设计有用的产品案例证据。',
  whenToUse: '需要讨论其他产品怎么做、判断某个交互是否符合行业常见模式、收敛scope时调用。',
  outputFormat: ['Comparable Cases', 'What To Borrow', 'What Not To Borrow', 'Scope Impact'],
  systemPrompt:
    '你是 Competitive Case Agent。不写泛泛市场分析，只提供具体产品案例证据，提炼可借鉴和不可借鉴方案，输出对 In-Scope/Out-of-Scope 的影响。不要编造具体竞品能力。',
  discussionOpen:
    '我会找出可比较的产品案例，分析它们如何解决相似问题，提炼交互路径、功能和差异点，明确哪些值得借鉴、哪些不适合照搬，并给出对本期scope的影响建议。',
  userReplyTemplate:
    '我会把“{input}”作为候选竞品或案例补充进来，重新判断哪些交互模式值得借鉴、哪些需要避免直接照搬。',
};

const flowInteractionBlueprintSkill: AgentSkill = {
  id: 'flow-interaction-blueprint',
  name: 'Flow & Interaction Blueprint',
  focus: '将已确认的需求边界转成可指导代码生成的流程、状态机、页面结构和前后端蓝图。',
  whenToUse: 'Scope初步明确后，生成主业务流程、页面结构、前端组件蓝图、后端API/数据流蓝图时调用。',
  outputFormat: ['Main Business Flow', 'State Machine', 'Page Structure', 'Frontend Blueprint', 'Backend Blueprint'],
  systemPrompt:
    '你是 Flow & Interaction Blueprint Agent。将需求边界转成可指导代码生成的完整交互蓝图，覆盖核心状态而不仅是Happy Path，每个页面、API或组件必须能追溯到一个In-Scope项。',
  discussionOpen:
    '我会定义主业务流程、状态机、页面模块结构、前端组件蓝图和后端API/数据蓝图，标记需要PM多轮确认的大块设计，确保蓝图能直接指导后续代码生成。',
  userReplyTemplate:
    '我会把“{input}”映射到业务流程或交互节点里，检查它是否符合已有的scope边界，不会越界扩展多余功能。',
};

const metricsPrioritizationSkill: AgentSkill = {
  id: 'metrics-prioritization',
  name: 'Metrics & Prioritization',
  focus: '定义需求是否成功的判断标准、优先级、MVP与延期项，把产品判断转成可观测指标。',
  whenToUse: '需求方案已有初步scope和流程，需要定义成功指标、护栏指标、MVP优先级时调用。',
  outputFormat: ['Success Metrics', 'Misleading Metrics', 'Prioritization', 'Minimum Validation Experiment'],
  systemPrompt:
    '你是 Metrics & Prioritization Agent。定义主指标、支持指标和护栏指标，识别误导指标，给出MVP/Should-have/Later优先级和最小验证实验，避免团队只根据"功能是否做完"判断产品价值。',
  discussionOpen:
    '我会定义主指标、支持指标和护栏指标，标记至少一个可能误导团队的指标，把MVP和延期项分开，输出最小验证实验和埋点计划，让产品价值可被观测。',
  userReplyTemplate:
    '我会把“{input}”作为候选指标或优先级补充进来，重新判断它是否是核心价值信号，还是容易误导团队的表面指标。',
};

const scopeBoundarySkill: AgentSkill = {
  id: 'scope-boundary',
  name: 'Scope Boundary',
  focus: '清晰界定本次需求覆盖的具体功能范围、做到什么程度为止，哪些内容明确不做。',
  whenToUse: 'PRD即将进入原型、代码生成或任务拆解，防止代码生成阶段因上下文联想过度产生冗余代码时调用。',
  outputFormat: ['In-Scope', 'Out-of-Scope', 'Non-Goals', 'Implementation Depth', 'Anti-Hallucination Guardrails'],
  systemPrompt:
    '你是 Scope Boundary Agent。这是Proposal Layer中最高优先级的防幻觉Agent。明确告诉AI要做什么、做到哪里、不要做什么，防止代码生成阶段产生冗余代码、错误模块改动和过重实现。',
  discussionOpen:
    '我会从待解决问题清单中提取本期必须解决的问题，明确定义In-Scope、Out-of-Scope、Non-Goals、MVP实现深度和完整的Anti-Hallucination Guardrails，防止后续Agent越界发散。',
  userReplyTemplate:
    '我会把“{input}”评估为In-Scope、Out-of-Scope或Non-Goals，检查它是否对应一个真实待解决问题，不会让新需求自动进入本期范围。',
};

const technicalFeasibilitySkill: AgentSkill = {
  id: 'technical-feasibility',
  name: 'Technical Feasibility',
  focus: '评估当前方案是否技术可行、应该改哪些模块、有哪些依赖和风险，怎样以最小安全切片进入实现。',
  whenToUse: '需求即将进入代码生成或模块定位，需要判断现有仓库是否支持该需求时调用。',
  outputFormat: ['Feasibility Judgment', 'System Boundary', 'Module Mapping', 'MVP Technical Slice', 'Verification Handoff'],
  systemPrompt:
    '你是 Technical Feasibility Agent。不负责最终验收性能或安全细节，只负责proposal阶段的可行性判断和实现边界。区分Directly buildable、Risky和Not realistic now，给出最小安全MVP技术切片。',
  discussionOpen:
    '我会判断直接可做、有风险和当前不现实的部分，定义系统内外部边界，映射前后端模块，识别依赖顺序和实现风险，输出最小MVP技术切片和交接给Verification Layer的风险点。',
  userReplyTemplate:
    '我会把“{input}”作为新增技术假设或依赖点，重新评估可行性、模块映射和MVP技术切片，不会为炫技引入不必要的新架构。',
};

const proposalCatalog: ExpertAgent[] = [
  {
    id: 'problem-user-context',
    name: 'Problem & User Context',
    role: '用户研究员',
    description: '将产品灵感转成清晰的目标用户、核心场景、痛点和待解决问题清单，为后续scope提供事实基础。',
    summary: '负责把目标用户、关键场景、行为路径和高频卡点讲清楚，避免团队一开始就围着功能自嗨。',
    team: 'Research Team',
    skills: [problemUserContextSkill],
  },
  {
    id: 'competitive-case',
    name: 'Competitive Case',
    role: '竞品参考员',
    description: '通过竞品或相似案例帮助PM判断当前方案是否合理，提供对设计有用的产品案例证据，不写泛泛市场报告。',
    summary: '负责找出可比较产品案例，提炼可借鉴和不可借鉴方案，输出对本期scope的具体影响建议。',
    team: 'Creative Team',
    skills: [competitiveCaseSkill],
  },
  {
    id: 'flow-interaction-blueprint',
    name: 'Flow & Interaction Blueprint',
    role: '业务流程设计师',
    description: '将已确认的需求边界转成可指导代码生成的主业务流程、状态机、页面结构和前后端API/data-flow蓝图。',
    summary: '作为代码生成前的核心蓝图层，指导前端生成组件树、后端生成API和数据流，覆盖核心状态而不仅是Happy Path。',
    team: 'Creative Team',
    skills: [flowInteractionBlueprintSkill],
  },
  {
    id: 'metrics-prioritization',
    name: 'Metrics & Prioritization',
    role: 'MVP指标归化员',
    description: '定义需求是否成功的判断标准、护栏指标、MVP优先级、最小验证实验，避免只根据功能完成度判断价值。',
    summary: '把产品判断转成可观测指标，识别误导指标，明确Must-have/Should-have/Later，让产品价值可被验证。',
    team: 'Technical Team',
    skills: [metricsPrioritizationSkill],
  },
  {
    id: 'scope-boundary',
    name: 'Scope Boundary',
    role: '需求边界划定员',
    description: 'Proposal Layer最高优先级防幻觉Agent，清晰界定本次需求覆盖范围、做到什么程度为止，明确禁止事项。',
    summary: '通过明确告诉AI要做什么、做到哪里、不要做什么，防止代码生成阶段因上下文联想过度产生冗余代码和过重实现。',
    team: 'Strategy Team',
    skills: [scopeBoundarySkill],
  },
  {
    id: 'technical-feasibility',
    name: 'Technical Feasibility',
    role: '技术评估员',
    description: '评估方案是否技术可行、模块如何映射、依赖和风险在哪里，输出最小安全MVP技术切片进入实现。',
    summary: '区分Directly buildable、Risky和Not realistic now，不提前吞掉Verification细节但完成风险交接，帮助团队安全进入实现。',
    team: 'Technical Team',
    skills: [technicalFeasibilitySkill],
  },
].map(attachAgentAvatar);

const verificationUatAcceptanceSkill: AgentSkill = {
  id: 'verification-uat-acceptance',
  name: '验收测试员',
  focus: '将PM需求转成可验收、可测试、可追溯的UAT标准，定义什么结果才算做对了。',
  whenToUse: 'Proposal或PRD确认后，需求即将进入代码生成、测试生成或提测前验收时，把自然语言需求转成Given-When-Then用例。',
  outputFormat: ['Business Closure', 'Happy Path', 'Given-When-Then UAT Cases', 'Launch Criteria', 'Go/No-Go'],
  systemPrompt:
    '你是 Verification UAT Acceptance Agent。把PM的业务需求转成可测试、可追溯的Given-When-Then UAT标准，确保生成的代码不仅能运行，而且符合业务意图。每条UAT必须引用它验证的In-Scope项。',
  discussionOpen:
    '我会先提取核心业务闭环，识别最重要的Happy Path，补充关键边界，生成Given-When-Then格式的UAT用例并标注测试类型，最后判断当前状态是否达到准许上线标准。',
  userReplyTemplate:
    '我会把“{input}”纳入UAT验收标准，确保它是可复现、可验证的，不会用“体验更好”这类无法被测试的表述。',
};

const verificationSecurityPrivacySkill: AgentSkill = {
  id: 'verification-security-privacy',
  name: '安全员',
  focus: '检查需求、接口、数据模型、前端展示的安全隐私风险，落到字段级别的可执行处理规则。',
  whenToUse: '需求涉及用户数据、账号、权限、API响应、数据库字段、日志、埋点、导出时，生成字段级别的安全验收项。',
  outputFormat: ['Sensitive Data Map', 'Data Flow Check', 'Permission Boundary', 'Technical Handling Requirements', 'Go/No-Go'],
  systemPrompt:
    '你是 Verification Security Privacy Agent。不泛泛提醒注意安全，而是把安全与隐私要求落到字段、接口、页面和测试点上。安全阻塞项优先级高于普通UAT Go结论。',
  discussionOpen:
    '我会识别所有敏感数据字段，追踪从采集、存储、下发、展示到日志、导出的完整数据流，定义权限边界，生成脱敏和加密策略，最后输出安全验收项。',
  userReplyTemplate:
    '我会把“{input}”加入敏感字段地图，判断它是否需要额外的加密、脱敏或权限限制，绝对不允许敏感字段在前端不必要地下发。',
};

const verificationCompatibilityAdaptationSkill: AgentSkill = {
  id: 'verification-compatibility-adaptation',
  name: '兼容性测试员',
  focus: '定义兼容性与适配标准，确保前端在目标设备、浏览器、屏幕尺寸、语言环境下稳定可用。',
  whenToUse: '新增页面、表单、弹窗、导航、移动端交互或涉及i18n/响应式布局时，生成兼容性验收矩阵。',
  outputFormat: ['Target Environments', 'Responsive Breakpoints', 'Component Adaptation Requirements', 'i18n Handling', 'Go/No-Go'],
  systemPrompt:
    '你是 Verification Compatibility Adaptation Agent。不默认支持所有设备和浏览器，必须列出明确的目标环境，确保用户在真实环境里能正常使用，而不是只在开发者电脑上看起来正常。',
  discussionOpen:
    '我会明确目标适配范围，定义响应式断点，检查交互适配和视觉适配，判断是否需要Polyfill/Babel/i18n处理，生成完整的兼容性验收矩阵。',
  userReplyTemplate:
    '我会把“{input}”作为新增目标环境或适配场景纳入兼容性验收，检查它是否会导致横向滚动、内容遮挡或交互不可用。',
};

const verificationPerformanceConcurrencySkill: AgentSkill = {
  id: 'verification-performance-concurrency',
  name: '性能压测员',
  focus: '定义性能、并发和稳定性底线，判断在真实流量和数据规模下功能能否扛住。',
  whenToUse: '新增高频页面、列表、搜索、导出、上传，或涉及大数据量、高并发时，生成性能验收和优化策略。',
  outputFormat: ['Critical Paths', 'Performance Budget', 'Concurrency Requirements', 'Architecture Strategies', 'Go/No-Go'],
  systemPrompt:
    '你是 Verification Performance Concurrency Agent。不默认引入Redis/MQ等复杂架构，除非性能风险和流量假设支持，区分必须实现、建议实现和暂不需要的优化。',
  discussionOpen:
    '我会标出性能关键路径，定义明确的性能预算，判断并发风险，给出缓存、异步、分页、索引等工程策略，生成压测与监控建议。',
  userReplyTemplate:
    '我会把“{input}”作为性能风险点加入关键路径分析，判断它是否会导致慢查询、重复提交或服务雪崩。',
};

const verificationExceptionEmptyStateSkill: AgentSkill = {
  id: 'verification-exception-empty-state',
  name: '异常体验师',
  focus: '系统化设计异常流程、空状态、加载状态和失败兜底，确保代码不是只覆盖Happy Path。',
  whenToUse: '新增异步流程、API可能失败、数据可能为空时，枚举所有状态并定义UI、文案、用户恢复动作。',
  outputFormat: ['Status Matrix', 'Error Handling Logic', 'Fallback UI', 'Test Suggestions', 'Go/No-Go'],
  systemPrompt:
    '你是 Verification Exception Empty State Agent。不只为所有失败写同一个Toast，不同失败原因要有不同恢复路径。至少覆盖loading、empty、error和unauthorized四大状态。',
  discussionOpen:
    '我会完整枚举loading、empty、success、partial success、error、timeout、unauthorized等所有状态，为每个状态定义UI、文案和用户下一步动作，生成异常状态矩阵。',
  userReplyTemplate:
    '我会把“{input}”作为新的异常场景加入状态矩阵，确保用户出错后不会卡住，而能理解、恢复和继续操作。',
};

const releaseGateOrchestratorSkill: AgentSkill = {
  id: 'release-gate-orchestrator',
  name: '发版把关人',
  focus: '合并五类专项验收结论，输出最终的Go/No-Go/Needs Revision上线决策。',
  whenToUse: '五个Verification Agent已经全部输出验收包后，把专项检查合并成统一的Release Gate最终决策。',
  outputFormat: ['Verification Summary Table', 'Final Decision', 'Blocking Items', 'Deferred Non-Blockers', 'Code/Test Handoff'],
  systemPrompt:
    '你是 Release Gate Orchestrator。不使用平均分或多数投票决定上线，必须由最高风险项约束。只要存在高优安全、隐私、核心UAT不可恢复的阻塞项，最终不得输出Go。',
  discussionOpen:
    '我会汇总五类专项Agent的所有结论，识别不可推迟的高优阻塞项和可以延后的非阻塞项，解决跨Agent的结论冲突，输出最终统一的Release Gate决策。',
  userReplyTemplate:
    '我会把“{input}”作为新增验收点加入最终Release Gate评估，判断它是阻塞项还是可以后续迭代的优化项。',
};

const verificationCatalog: ExpertAgent[] = [
  {
    id: 'verification-uat-acceptance',
    name: '验收测试员',
    role: '验收测试员',
    description: '将PM需求转成可验收、可测试、可追溯的Given-When-Then UAT标准，定义什么结果才算做对了。',
    summary: '是Verification Layer的入口，确保生成的代码不仅能运行，而且完全符合业务意图。',
    team: 'Verification Team',
    skills: [verificationUatAcceptanceSkill],
  },
  {
    id: 'verification-security-privacy',
    name: '安全员',
    role: '安全员',
    description: '字段级别的安全隐私检查，覆盖数据采集、存储、下发、日志、导出全流程，输出脱敏和加密策略。',
    summary: '不泛泛提醒安全，而是落到具体字段、接口和权限，安全阻塞项优先级高于普通UAT。',
    team: 'Verification Team',
    skills: [verificationSecurityPrivacySkill],
  },
  {
    id: 'verification-compatibility-adaptation',
    name: '兼容性测试员',
    role: '兼容性测试员',
    description: '定义目标设备、浏览器、响应式断点和i18n适配标准，确保用户在真实环境里能正常使用。',
    summary: '不默认支持所有设备，必须列出明确目标环境，避免功能只在开发者电脑上看起来正常。',
    team: 'Verification Team',
    skills: [verificationCompatibilityAdaptationSkill],
  },
  {
    id: 'verification-performance-concurrency',
    name: '性能压测员',
    role: '性能压测员',
    description: '定义性能预算、并发要求和工程优化策略，判断功能在真实流量和数据规模下能否扛住。',
    summary: '区分必须实现、建议实现和暂不需要的优化，避免不必要地引入复杂架构。',
    team: 'Verification Team',
    skills: [verificationPerformanceConcurrencySkill],
  },
  {
    id: 'verification-exception-empty-state',
    name: '异常体验师',
    role: '异常体验师',
    description: '系统化设计加载、空状态、错误、超时等所有非Happy Path，不同失败原因对应不同恢复路径。',
    summary: '确保用户出错后不会卡住，能理解当前状态并恢复操作，而不是只覆盖正向流程。',
    team: 'Verification Team',
    skills: [verificationExceptionEmptyStateSkill],
  },
  {
    id: 'release-gate-orchestrator',
    name: '发版把关人',
    role: '发版把关人',
    description: '合并五类专项验收结论，输出最终上线决策，区分必须立即修复的阻塞项和可延后的非阻塞项。',
    summary: '由最高风险项约束最终决策，只要有高优不可恢复的问题绝对不允许直接Go上线。',
    team: 'Verification Team',
    skills: [releaseGateOrchestratorSkill],
  },
].map(attachAgentAvatar);

const verificationNotesBase: VerificationNote[] = [
  {
    id: 'note-uat-acceptance',
    agentId: 'verification-uat-acceptance',
    agent: '验收测试员',
    severity: 'high',
    target: '4. 问题陈述',
    thoughts: ['检查核心业务闭环是否覆盖完整。', '核对 Happy Path 关键步骤。', '判断当前是否能写出可追溯的 Given-When-Then UAT 用例。'],
    comment: '当前 PRD 里核心业务闭环的验收标准描述不够明确，缺少可直接执行的 UAT 入口条件。',
    suggestion: '补充明确的 Given-When-Then UAT 用例，每条必须引用它验证的对应 PRD 章节，定义清楚什么结果才算做对了。',
  },
  {
    id: 'note-security-privacy',
    agentId: 'verification-security-privacy',
    agent: '安全员',
    severity: 'high',
    target: '5. 范围内',
    thoughts: ['识别所有敏感数据字段。', '检查数据从采集到展示的完整数据流。', '判断是否存在敏感字段不必要地下发到前端的情况。'],
    comment: '当前 PRD 没有明确列出敏感数据地图和对应的脱敏/加密规则，容易在实现阶段引入隐私风险。',
    suggestion: '补充字段级别的敏感数据地图，定义权限边界，生成脱敏策略和安全验收项，绝对不允许敏感字段不必要地下发到前端。',
  },
  {
    id: 'note-compatibility-adaptation',
    agentId: 'verification-compatibility-adaptation',
    agent: '兼容性测试员',
    severity: 'medium',
    target: '6. 方案设计',
    thoughts: ['明确目标适配设备和浏览器范围。', '检查响应式断点覆盖是否完整。', '判断交互元素会不会在小屏幕上出现横向滚动或内容遮挡。'],
    comment: '当前 PRD 没有明确列出目标环境和响应式适配规则，很容易出现“开发者电脑上看起来正常，真实用户机器上用不了”的情况。',
    suggestion: '生成完整的兼容性验收矩阵，列出明确的目标环境、响应式断点、i18n 处理要求和组件适配规则。',
  },
  {
    id: 'note-performance-concurrency',
    agentId: 'verification-performance-concurrency',
    agent: '性能压测员',
    severity: 'high',
    target: '4. 风险与指标',
    thoughts: ['识别系统最容易被打爆的热点路径。', '定义明确的性能预算和并发上限。', '检查限流、批处理和兜底策略是否缺失。'],
    comment: '当前 PRD 没有指定性能预算和并发假设，在真实流量和数据规模下热点路径容易雪崩。',
    suggestion: '补充可观测的性能预算、关键热路径、并发假设、限流策略和降级兜底规则，确保功能在真实流量下稳定运行。',
  },
  {
    id: 'note-exception-empty-state',
    agentId: 'verification-exception-empty-state',
    agent: '异常体验师',
    severity: 'medium',
    target: '6. 方案设计',
    thoughts: ['排查所有异步操作和状态跳转。', '识别当前缺失的 loading、空状态、异常场景。', '判断每个失败原因是否都对应明确的用户恢复路径。'],
    comment: '当前 PRD 只描述了 Happy Path，大量异常场景和空状态完全缺失，用户出错后可能卡死在页面不知道该怎么做。',
    suggestion: '系统化补充完整的异常分类清单，不同失败原因对应不同的用户可读反馈和明确的恢复入口，防止用户卡住死等。',
  },
  {
    id: 'note-release-gate-orchestrator',
    agentId: 'release-gate-orchestrator',
    agent: '发版把关人',
    severity: 'medium',
    target: '6. Proposal Contributors',
    thoughts: ['聚合前面所有 Verification Agent 的评审结论。', '区分真正的阻塞问题和非阻塞的体验改进。', '生成可逐条勾选的发版前 checklist。'],
    comment: '当前 PRD 还没有聚合所有前置评审意见，没有明确区分哪些是必须立即修复的上线阻塞项。',
    suggestion: '合并前面五类专项验收结论，输出最终上线决策清单，用最高风险项约束最终结论，只要有高优不可恢复问题绝对不允许直接Go上线。',
  },
];

const proposalFocusAreas = ['用户需求', '交互体验', '产品方向', '技术可行性', '指标评估', '商业策略'];
const verificationFocusAreas = ['能不能做', '有没有风险', '逻辑对不对', 'AI 靠不靠谱', '值不值得做', '上线后会不会炸'];

function buildRecallItems(source: string, selectedMode: 'new' | 'repo'): RecallItem[] {
  return [
    {
      title: /agent|编排|工作流/i.test(source) ? '流程编排工作台' : '结构化需求判断画布',
      reason: '基于当前产品描述，系统召回了最接近的历史方案。',
      tags: /原型|界面|交互/i.test(source) ? ['Agent', '原型'] : ['PRD', '需求分析'],
    },
    {
      title: selectedMode === 'repo' ? '现有仓库能力盘点' : '通用 PM 需求分析模板',
      reason:
        selectedMode === 'repo'
          ? '你选择了导入仓库模式，优先召回仓库改造线索。'
          : '你当前在从零创建产品，优先召回目标用户和风险分析模板。',
      tags: selectedMode === 'repo' ? ['仓库扫描', '模块复用'] : ['目标用户', '实验设计'],
    },
    {
      title: /导出|报表/i.test(source) ? '数据面板导出组件' : '知识回写与上下文沉淀',
      reason: '用于帮助你快速进入 Proposal 生成阶段。',
      tags: /导出|报表/i.test(source) ? ['报表', '导出'] : ['知识库', '回写'],
    },
  ];
}

function normalizeSentence(value: string) {
  return value.trim().replace(/[。！？；，,\s]+$/u, '');
}

async function parseJsonResponse<T>(response: Response, requestLabel: string): Promise<T> {
  const rawText = await response.text();
  const text = rawText.trim();

  if (!text) {
    throw new Error(`${requestLabel}服务没有返回内容，请检查本地代理是否已启动。`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${requestLabel}服务返回格式异常，请检查代理服务日志。`);
  }
}

function hasMeaningfulRewrite(original: string, next: string) {
  const normalizeForCompare = (input: string) =>
    normalizeSentence(input).replace(/[，。！？；、\s]/g, '').toLowerCase();
  return normalizeForCompare(original) !== normalizeForCompare(next);
}

function buildOptimizedSummary(summaryText: string) {
  const base = normalizeSentence(summaryText);
  if (!base) return '';

  const additions: string[] = [];
  const hasClarifyAction = /(识别|澄清|追问|补齐|拆解|收敛)/.test(base);
  const hasDeliverable =
    /((生成|输出|产出|给出|形成|沉淀|整理|总结|回写).*(报告|文档|原型|prd|清单|建议|方案|结论|摘要))|((报告|文档|原型|prd|清单|建议|方案|结论|摘要).*(生成|输出|产出|给出|形成|沉淀|整理|总结|回写))/i.test(
      base,
    );
  const mentionsAI = /(ai|智能|自动|agent|模型)/i.test(base);
  const hasBoundary = /(人工|确认|审核|审批|建议模式|辅助|复核|兜底|边界|手动)/.test(base);

  if (!hasClarifyAction) {
    additions.push('识别模糊需求中的歧义并主动补齐关键追问');
  }
  if (!hasDeliverable) {
    additions.push('输出可继续写 PRD 的结构化需求摘要与建议');
  }
  if (mentionsAI && !hasBoundary) {
    additions.push('由 AI 提供建议，最终需求判断仍由 PM 确认');
  }

  if (additions.length === 0) return `${base}。`;
  return `${base}，${additions.join('，')}。`;
}

function buildFallbackRewrite(summaryText: string) {
  const base = normalizeSentence(summaryText);
  if (!base) return '';

  let rewritten = buildOptimizedSummary(summaryText);
  if (hasMeaningfulRewrite(base, rewritten)) return rewritten;

  rewritten = base
    .replace(/提升判断与执行效率/g, '更高效地完成判断与执行')
    .replace(/识别模糊需求中的歧义并主动补齐关键追问/g, '识别模糊需求歧义并补齐关键追问')
    .replace(/设计一个浮动界面，输出/g, '通过浮动界面输出')
    .replace(/可继续写\s*PRD/g, '可直接进入 PRD')
    .replace(/结构化需求摘要与建议/g, '结构化需求摘要与优化建议');

  if (!rewritten.endsWith('。')) rewritten = `${rewritten}。`;
  return rewritten;
}

function buildAlternativeRequirement(summaryText: string) {
  const base = normalizeSentence(summaryText);
  if (!base) return '';

  const value = base
    .replace(/帮助/g, '')
    .replace(/设计一个浮动界面/g, '通过浮动界面')
    .replace(/可继续写\s*PRD/g, '可直接进入 PRD')
    .replace(/结构化需求摘要与优化建议/g, '结构化需求摘要');

  return `${value}。`;
}

function evaluateRequirementSummary(summaryText: string): RequirementRefineResult {
  const base = normalizeSentence(summaryText);
  if (!base) {
    return {
      judgment: 'too-vague',
      strengths: [],
      missingDimensions: ['目标用户', '关键场景', '明确产出'],
      risks: ['输入过短，无法形成可执行需求'],
      rationale: '当前还没有可判断的需求表达，无法进入后续需求分析。',
      rewriteNotes: ['需要先提供至少一句描述'],
      optimized: '',
      alternativeVersion: '',
      nextStep: '先写一句需求，再让 Requirement Refiner 帮你收紧表达。',
    };
  }

  const hasTarget = /(产品经理|pm|运营|设计师|开发|工程师|研究员|分析师|销售|客服|面试官|管理者|企业|商家|创作者|老师|学生|家长|医生|患者|团队|用户)/i.test(
    base,
  );
  const hasScenario = /(在.+(阶段|场景|流程|时候|时)|用于|当.+时|需求梳理|评审前|协作中|原型设计|立项|交付|复盘)/.test(
    base,
  );
  const hasProblem = /(歧义|卡点|误判|返工|沟通成本|判断效率|执行效率|混乱|低效|耗时|风险|不一致)/.test(base);
  const hasAction = /(识别|澄清|追问|补齐|生成|输出|整理|判断|推荐|总结|分析|收敛|拆解|辅助)/.test(base);
  const hasDeliverable =
    /((生成|输出|产出|给出|形成|沉淀|整理|总结|回写).*(报告|文档|原型|prd|清单|建议|方案|结论|摘要))|((报告|文档|原型|prd|清单|建议|方案|结论|摘要).*(生成|输出|产出|给出|形成|沉淀|整理|总结|回写))/i.test(
      base,
    );
  const mentionsAI = /(ai|智能|自动|agent|模型)/i.test(base);
  const hasBoundary = /(人工|确认|审核|审批|建议模式|辅助|复核|兜底|边界|手动|最终判断)/.test(base);
  const jumpsToSolution = /(界面|浮窗|浮动界面|按钮|页面|tab|卡片|弹窗|工作台|dashboard|入口)/i.test(base);
  const tooBroad = /(所有|全流程|一站式|完整|全部|自动完成|端到端|从0到1|全链路)/i.test(base);
  const hasSuccessSignal = /(返工率|通过率|成功率|耗时|周期|准确率|满意度|效率)/.test(base);
  const valueOnly =
    /(提升|提高|优化).*(效率|体验|质量|判断|执行)|提效|更智能|更高效|智能提效|辅助完成|帮助.+提升|判断与执行效率/.test(
      base,
    );

  const strengths: string[] = [];
  if (hasTarget) strengths.push('目标对象已出现');
  if (hasScenario) strengths.push('使用场景已出现');
  if (hasAction) strengths.push('核心动作已出现');
  if (hasDeliverable) strengths.push('输出物已出现');
  if (mentionsAI && hasBoundary) strengths.push('AI 边界已出现');

  const missingDimensions: string[] = [];
  if (!hasTarget) missingDimensions.push('目标用户');
  if (!hasScenario) missingDimensions.push('关键场景');
  if (!hasProblem && valueOnly) missingDimensions.push('真实问题');
  if (!hasAction) missingDimensions.push('核心动作');
  if (!hasDeliverable) missingDimensions.push('明确产出');
  if (mentionsAI && !hasBoundary) missingDimensions.push('AI 边界');
  if (!hasSuccessSignal && (valueOnly || hasDeliverable)) missingDimensions.push('成功信号');

  const risks: string[] = [];
  if (valueOnly && !hasDeliverable) risks.push('只有价值表达，缺少可执行输出');
  if (jumpsToSolution && !hasProblem) risks.push('先讲方案，问题定义还不够清楚');
  if (tooBroad) risks.push('范围偏大，建议先收敛 MVP');
  if (mentionsAI && !hasBoundary) risks.push('AI 与人工分工不明确');

  const optimized = buildFallbackRewrite(summaryText);
  const alternativeVersion = buildAlternativeRequirement(optimized);
  const hasChange = hasMeaningfulRewrite(base, optimized);
  let judgment: RequirementRefineResult['judgment'] = 'clear';
  if (missingDimensions.length >= 4 || (valueOnly && !hasDeliverable)) {
    judgment = 'too-vague';
  } else if (missingDimensions.length > 0 || risks.length > 0) {
    judgment = 'needs-work';
  }

  let rationale = '这句话已经具备进入分析的基本结构，可以继续往 Proposal 阶段推进。';
  if (judgment === 'needs-work') {
    rationale = `这句话已经表达了需求方向，但还缺少 ${missingDimensions.join('、')}，目前更像方向描述，不够像可执行需求。`;
  }
  if (judgment === 'too-vague') {
    rationale = `这句话主要在表达价值判断，缺少 ${missingDimensions.join('、')}，现在还不足以支撑后续需求分析。`;
  }

  const nextStep =
    judgment === 'clear'
      ? '可以继续点击“分析需求”，进入下一步。'
      : judgment === 'needs-work'
        ? '建议先采纳优化版本，再继续分析需求。'
        : '先收紧一句话描述，再进入需求分析会更稳。';

  const rewriteNotes: string[] = [];
  if (!hasTarget) rewriteNotes.push('补充了目标用户');
  if (!hasScenario) rewriteNotes.push('补充了使用场景');
  if (!hasProblem && valueOnly) rewriteNotes.push('把价值表达补成更具体的问题定义');
  if (!hasDeliverable) rewriteNotes.push('补充了明确输出物');
  if (mentionsAI && !hasBoundary) rewriteNotes.push('补充了 AI 与人工边界');
  if (jumpsToSolution && !hasProblem) rewriteNotes.push('弱化了过早的界面方案，补回问题定义');
  if (tooBroad) rewriteNotes.push('把范围收敛成更适合第一版的表达');
  if (!hasSuccessSignal && (valueOnly || hasDeliverable)) rewriteNotes.push('提示补齐成功信号');

  return {
    judgment,
    strengths,
    missingDimensions,
    risks,
    rationale,
    rewriteNotes,
    optimized,
    alternativeVersion,
    nextStep,
    hasMeaningfulChange: hasChange,
  };
}

function getPrimarySkill(agent: ExpertAgent) {
  return agent.skills?.[0];
}

function getAgentByName(name: string) {
  return [...proposalCatalog, ...verificationCatalog].find((agent) => agent.name === name);
}

// 把纯文本按 \n 换行，同时自动检测序号开头智能断行，字号完全继承原有p标签样式不变
function renderTextWithNewlines(text: string) {
  if (!text || typeof text !== 'string') return null;
  // 自动在 "1. " "2. " 这种数字序号前面插入换行，把堆在一起的长文本拆成独立条目
  const normalized = text.replace(/([^\n])(\s*\d+\.\s+)/g, '$1\n$2');
  const lines = normalized.split('\n');
  return lines.map((line, idx) => (
    line.trim() === '' 
      ? <br key={idx} /> 
      : <p key={idx} style={{ margin: idx === 0 ? 0 : '6px 0' }}>{line.trim()}</p>
  ));
}

function renderAgentBadge(badge?: AgentBadgeKind) {
  if (!badge) return null;

  const commonProps = {
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': 'true' as const,
  };

  switch (badge) {
    case 'research':
      return (
        <svg {...commonProps}>
          <circle cx="11" cy="11" r="5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M15 15L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'architecture':
      return (
        <svg {...commonProps}>
          <path d="M5 18L12 5L19 18" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M8.5 13H15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'design':
      return (
        <svg {...commonProps}>
          <path d="M12 4C7.6 4 4 7.1 4 11C4 14.3 6.8 17 10.2 17H11C12.1 17 13 17.9 13 19C13 20 13.8 20.8 14.8 20.5C18.4 19.4 21 16.2 21 12.3C21 7.7 17 4 12 4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="8.5" cy="11" r="1" fill="currentColor" />
          <circle cx="12" cy="8.5" r="1" fill="currentColor" />
          <circle cx="15.5" cy="11" r="1" fill="currentColor" />
        </svg>
      );
    case 'market':
      return (
        <svg {...commonProps}>
          <path d="M5 17L10 12L13 15L19 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15 9H19V13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'data':
      return (
        <svg {...commonProps}>
          <path d="M6 18V12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M12 18V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M18 18V5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'business':
      return (
        <svg {...commonProps}>
          <rect x="5" y="8" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M9 8V7C9 5.9 9.9 5 11 5H13C14.1 5 15 5.9 15 7V8" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    case 'safety':
      return (
        <svg {...commonProps}>
          <path d="M12 4L18 6.7V11.4C18 15.4 15.5 18.8 12 20C8.5 18.8 6 15.4 6 11.4V6.7L12 4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M9.5 12.1L11.2 13.8L14.8 10.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'consistency':
      return (
        <svg {...commonProps}>
          <path d="M7 7H17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M7 12H17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M7 17H13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'ai':
      return (
        <svg {...commonProps}>
          <path d="M12 4L13.8 8.2L18 10L13.8 11.8L12 16L10.2 11.8L6 10L10.2 8.2L12 4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="18.5" cy="5.5" r="1.2" fill="currentColor" />
        </svg>
      );
    case 'operations':
      return (
        <svg {...commonProps}>
          <path d="M12 8.2A3.8 3.8 0 1 1 12 15.8A3.8 3.8 0 0 1 12 8.2Z" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 4V6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M12 18V20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M4 12H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M18 12H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}


function buildAgentOpening(agent: ExpertAgent, _selectedMode: 'new' | 'repo', summaryText: string) {
  const skill = getPrimarySkill(agent);
  if (skill) {
    return skill.discussionOpen;
  }
  return `${agent.name} 认为应该先围绕“${summaryText}”补齐对应视角，再进入 PRD。`;
}

function buildAgentReply(agent: ExpertAgent, input: string) {
  const skill = getPrimarySkill(agent);
  if (skill) {
    return skill.userReplyTemplate.replace('{input}', input);
  }
  return `我会把你刚补充的“${input}”纳入 proposal 讨论，再判断它会影响哪一段 PRD。`;
}
function App() {
  const conduitPreviewUrl = useMemo(() => {
    if (typeof window === 'undefined') return 'http://127.0.0.1:5173';
    const loc = window.location;
    const protocol = loc.protocol;
    const hostname = loc.hostname || '127.0.0.1';
    const currentRalphPort = parseInt(loc.port || '5176', 10);
    // Auto-derive candidate port: Ralph port minus 6 → maps 5179 → 5173, 5176 → 5170
    const derivedPort = currentRalphPort - 6;
    const fallbackCandidates = [5173, 5174, 5175, 5176, 5177, 5178, 5179, derivedPort];
    const bestPort = fallbackCandidates.find(p => p > 1000) ?? 5173;
    return `${protocol}//${hostname}:${bestPort}`;
  }, []);
  
  const [isDark, setIsDark] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedMode, setSelectedMode] = useState<'new' | 'repo'>('repo');
  const [productName, setProductName] = useState('');
  const [summary, setSummary] = useState('');
  const [repositoryUrl, setRepositoryUrl] = useState('https://github.com/TonyMckes/conduit-realworld-example-app');
  const [repositoryBranch, setRepositoryBranch] = useState('main');
  const [repositoryGoal, setRepositoryGoal] = useState('');
  const [, setApiStatus] = useState<'idle' | 'connected' | 'error'>('idle');
  const [hasAnalyzedIdea, setHasAnalyzedIdea] = useState(false);
  const [hasOptimizedWithLLM, setHasOptimizedWithLLM] = useState(false);
  const [recallItems, setRecallItems] = useState<RecallItem[]>([]);
  const [importedRepo, setImportedRepo] = useState<ImportedRepo | null>(null);
  const [isImportingRepo, setIsImportingRepo] = useState(false);
  const [repoImportError, setRepoImportError] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [projectCreateError, setProjectCreateError] = useState('');
  const [workflowStage, setWorkflowStage] = useState<WorkflowStage>('proposal');
  const [proposalPhase, setProposalPhase] = useState<ProposalPhase>('select');
  const [verificationPhase, setVerificationPhase] = useState<VerificationPhase>('select');
  const [discussionTurn, setDiscussionTurn] = useState(1);
  const [facilitatorReady, setFacilitatorReady] = useState(false);
  const [proposalInput, setProposalInput] = useState('');
  const [proposalDiscussionMessages, setProposalDiscussionMessages] = useState<ProposalDiscussionMessage[]>([]);
  const [proposalFacilitatorSummary, setProposalFacilitatorSummary] = useState('');
  const [isProposalDiscussing, setIsProposalDiscussing] = useState(false);
  const effectiveProductName = productName.trim() || 'conduit';
  const [selectedProposalAgents, setSelectedProposalAgents] = useState<string[]>([
    'problem-user-context',
    'competitive-case',
    'flow-interaction-blueprint',
    'metrics-prioritization',
    'scope-boundary',
    'technical-feasibility',
  ]);
  const [selectedVerificationAgents, setSelectedVerificationAgents] = useState<string[]>([
    'verification-uat-acceptance',
    'verification-security-privacy',
    'verification-compatibility-adaptation',
    'verification-performance-concurrency',
    'verification-exception-empty-state',
    'release-gate-orchestrator',
  ]);
  const [reviewDecisions, setReviewDecisions] = useState<Record<string, ReviewDecision | undefined>>({});
  const [notePhases, setNotePhases] = useState<Record<string, NotePhase>>({});
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  const [commentReplies, setCommentReplies] = useState<Record<string, CommentReply[]>>({});
  const [verificationNotes, setVerificationNotes] = useState<VerificationNote[]>([]);
  const [isGeneratingVerification, setIsGeneratingVerification] = useState(false);
  const [replyingNoteId, setReplyingNoteId] = useState<string | null>(null);
  const [activeCommentNoteId, setActiveCommentNoteId] = useState<string | null>(null);
  const [analysisBoard, setAnalysisBoard] = useState<AnalysisBoard>({
    targetUsers: '1-3 年经验、经常需要写 PRD 与对齐需求的产品经理。',
    coreScenario: '帮助产品经理在需求梳理和原型设计阶段提升判断与执行效率。',
    coreDecision: '先明确目标用户、关键流程和人工确认点，再进入 PRD。',
    risks: ['把生成速度误当成判断质量提升。'],
    metrics: ['需求确认周期', 'PRD 返工率', '评审一次通过率'],
    nextAction: '先选 Proposal Agent，生成 proposal 后再进入 PRD Draft。',
  });
  const [isRefiningRequirement, setIsRefiningRequirement] = useState(false);
  const [refineTarget, setRefineTarget] = useState<RequirementRefineTarget>('summary');
  const [refineStatus, setRefineStatus] = useState('');
  const [refineStatusTone, setRefineStatusTone] = useState<'default' | 'loading' | 'warning'>(
    'default',
  );
  const [enableClarificationChatMode, setEnableClarificationChatMode] = useState(false);
  const [clarificationMessages, setClarificationMessages] = useState<ClarificationMessage[]>([]);
  const [clarificationInput, setClarificationInput] = useState('');
  const [clarifiedPrdContents, setClarifiedPrdContents] = useState<Array<{id: string, name: string, content: string}>>([]);
  const [isClarificationSending, setIsClarificationSending] = useState(false);
  const [clarificationIsReadyToConfirm, setClarificationIsReadyToConfirm] = useState(false);
  const [isConfirmingPrdSave, setIsConfirmingPrdSave] = useState(false);
  const [latestPrdSections, setLatestPrdSections] = useState<Array<{ id: string; name: string; system_instruction: string; content: string }> | null>(null);

  // 静态 fallback：完全硬编码指定完整13个ID的顺序，动态读取失败时也能正常展示
  const static7Sections = useMemo(() => [
    { id: 'nomenclature', name: '名词解释', system_instruction: '无', content: '无' },
    { id: 'target_users', name: '目标用户', system_instruction: '无', content: '无' },
    { id: 'user_scenarios', name: '用户场景', system_instruction: '无', content: '无' },
    { id: 'problem_statement', name: '待解决问题清单', system_instruction: '无', content: '无' },
    { id: 'in_scope', name: '需求边界界定 (In-Scope)', system_instruction: '无', content: '无' },
    { id: 'out_of_scope', name: '非本期需求 (Out-of-Scope)', system_instruction: '无', content: '无' },
    { id: 'solution_design', name: '方案设计 (流程与交互)', system_instruction: '无', content: '无' },
    { id: 'exception_and_empty_states', name: '异常流程与空状态设计', system_instruction: '无', content: '无' },
    { id: 'performance_req', name: '性能与并发要求', system_instruction: '无', content: '无' },
    { id: 'compatibility_req', name: '兼容性与适配规范', system_instruction: '无', content: '无' },
    { id: 'security_privacy', name: '安全、隐私与合规', system_instruction: '无', content: '无' },
    { id: 'acceptance_criteria', name: '功能走查与验收标准 (UAT)', system_instruction: '无', content: '无' },
  ], []);
  const [isLoadingLatestPrd, setIsLoadingLatestPrd] = useState(false);
  const clarificationThreadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (clarificationThreadRef.current) {
      clarificationThreadRef.current.scrollTop = clarificationThreadRef.current.scrollHeight;
    }
  }, [clarificationMessages.length]);

  const currentStepMeta = steps[currentStep];
  const activeProposalAgents = useMemo(
    () => proposalCatalog.filter((agent) => selectedProposalAgents.includes(agent.id)),
    [selectedProposalAgents]
  );
  const activeVerificationAgents = useMemo(
    () => verificationCatalog.filter((agent) => selectedVerificationAgents.includes(agent.id)),
    [selectedVerificationAgents]
  );
  const visibleVerificationNotes = verificationNotes;
  
  const [editablePrdDraftSections, setEditablePrdDraftSections] = useState<Array<{ id: string; title: string; content: string }>>([]);

  const [isImplementingCode, setIsImplementingCode] = useState(false);
  const [implementStepIndex, setImplementStepIndex] = useState(0);
  const [lastImplementResult, setLastImplementResult] = useState<{
    summary?: string;
    modifiedFiles?: Array<{path: string; changeDescription: string; ok: boolean}>;
    stepMessages?: string[];
    livePreviewUrl?: string;
  } | null>(null);

  const implementSteps = lastImplementResult?.stepMessages || [
    "🔍 正在扫描整个 Conduit 仓库的全部源代码文件...",
    "📖 已加载 42 个相关 JS/JSX 源码文件",
    "🤖 正在调用火山方舟豆包大模型，分析 PRD 需求定位修改点...",
    "✏️ 正在生成完整的代码修改方案...",
    "📝 正在真实写入修改的文件到磁盘..."
  ];

  const [isConduitChainRunning, setIsConduitChainRunning] = useState(false);
  const [conduitStepIndex, setConduitStepIndex] = useState(0);
  const [conduitPrdContents, setConduitPrdContents] = useState<Array<{id: string; content: string}> | null>(null);
  const [conduitGeneratedChanges, setConduitGeneratedChanges] = useState<Array<any> | null>(null);
  const [conduitChainResults, setConduitChainResults] = useState<{
    prdRead?: any;
    projectAnalyze?: any;
    codeChanges?: any;
    applyResults?: any;
  }>({});
  const conduitChainSteps = [
    "📄 读取 PRD 中所有 id 对应的 content 内容...",
    "🔍 分析 Conduit 全栈仓库的代码结构...",
    "🤖 基于 PRD 内容生成代码改动计划...",
    "💾 将生成的改动真实写入 Conduit 本地文件..."
  ];

  useEffect(() => {
    if (currentStep === 3 && !lastImplementResult && !isImplementingCode) {
      setIsImplementingCode(true);
      setImplementStepIndex(0);

      (async () => {
        try {
          console.log('🚀 正在向后端发送 PRD，启动真实代码实现流程...');
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 300000);

          const res = await fetch('/api/implement/code', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              prdDraftSections: editablePrdDraftSections,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          const data = await parseJsonResponse<any>(res, '代码实现');

          const backendSteps = data.stepMessages || [
            "🔍 正在扫描整个 Conduit 仓库的全部源代码文件...",
            "📖 已加载 42 个相关 JS/JSX 源码文件",
            "🤖 正在调用火山方舟豆包大模型，分析 PRD 需求定位修改点...",
            "✏️ 正在生成完整的代码修改方案...",
            "📝 正在真实写入修改的文件到磁盘...",
          ];

          for (let i = 0; i < backendSteps.length; i++) {
            setImplementStepIndex(i + 1);
            await new Promise(r => setTimeout(r, 1200));
          }

          setLastImplementResult(data);
          console.log('✅ 后端真实代码修改完成，返回修改结果:', data);
        } catch (err) {
          console.error('代码实现失败或超时', err);
          alert(`代码实现失败: ${err instanceof Error ? err.message : String(err)}\n请检查后端服务日志确认问题。`);
        } finally {
          setIsImplementingCode(false);
        }
      })();
    }
  }, [currentStep, editablePrdDraftSections, lastImplementResult, isImplementingCode]);
  

  const allVerificationReviewed = verificationNotes.length === 0 || verificationNotes.every((note) => {
    const decision = reviewDecisions[note.id];
    return decision === 'accept' || decision === 'comment';
  });
  const trimmedSummary = summary.trim();
  const discussionPrompt = `How might we为“${effectiveProductName}”先定义一个可执行、可验证、且适合当前团队能力的第一版方案？`;

  useEffect(() => {
    if (!isRefiningRequirement) return;

    const timeoutId = window.setTimeout(() => {
      setRefineStatus('仍在调用 LLM 生成中，请稍候...');
      setRefineStatusTone('loading');
    }, 20_000);

    return () => window.clearTimeout(timeoutId);
  }, [isRefiningRequirement, refineTarget]);

  // 优先使用从后端动态拉取的最新PRD完整13个章节，无数据时才使用旧的 fallback 方案
  const prdDraftSections = useMemo(() => {
    if (latestPrdSections && Array.isArray(latestPrdSections) && latestPrdSections.length >= 7) {
      return latestPrdSections.map((item) => ({
        id: item.id,
        title: item.name,
        content: item.content ?? '无',
      }));
    }

    // 旧的 fallback 逻辑，用于向后兼容
    if (!proposalFacilitatorSummary) {
      return [
        { id: '1', title: '1. Proposal 背景', content: summary },
        { id: '2', title: '2. 目标用户', content: analysisBoard.targetUsers },
        { id: '3', title: '3. 核心场景与判断', content: analysisBoard.coreScenario },
        {
          id: '4',
          title: '4. 风险与指标',
          content: `${analysisBoard.risks.join('；')}。指标：${analysisBoard.metrics.join('、')}`,
        },
        {
          id: '5',
          title: '5. Proposal Contributors',
          content: activeProposalAgents.map((agent) => agent.name).join('、') || '尚未选择 proposal agents',
        },
        { id: '6', title: '6. 下一步', content: analysisBoard.nextAction },
      ];
    }
    return [
      { id: '1', title: '1. Proposal 背景', content: summary },
      { id: '2', title: '2. 目标用户', content: analysisBoard.targetUsers },
      { id: '3', title: '3. 核心场景与判断', content: analysisBoard.coreScenario },
      {
        id: '4',
        title: '4. 讨论共识与 Proposal 总结',
        content: proposalFacilitatorSummary,
      },
      {
        id: '5',
        title: '5. 风险与指标',
        content: `${analysisBoard.risks.join('；')}。指标：${analysisBoard.metrics.join('、')}`,
      },
      {
        id: '6',
        title: '6. Proposal Contributors',
        content: activeProposalAgents.map((agent) => agent.name).join('、') || '尚未选择 proposal agents',
      },
      { id: '7', title: '7. 下一步', content: analysisBoard.nextAction },
    ];
  }, [latestPrdSections, summary, analysisBoard, activeProposalAgents, proposalFacilitatorSummary]);

  // 当进入 workflowStage === 'draft' 阶段时，自动调用新接口获取当前 projectName 对应的最新 PRD 7个章节
  useEffect(() => {
    if (workflowStage !== 'draft') return;
    if (!effectiveProductName) return;
    if (latestPrdSections) return;
    if (isLoadingLatestPrd) return;

    void (async () => {
      setIsLoadingLatestPrd(true);
      try {
        const res = await fetch('/api/prd/get-latest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectName: effectiveProductName }),
        });
        const data = await res.json();
        if (res.ok && data.prdSections && Array.isArray(data.prdSections)) {
          // 严格空兜底：null、undefined、空字符串全部替换为'无'
          const normalized = data.prdSections.map((section: { id: string; name: string; system_instruction?: string | null; content?: string | null }) => ({
            id: section.id,
            name: section.name,
            system_instruction: section.system_instruction == null || section.system_instruction === '' ? '无' : section.system_instruction,
            content: section.content == null || section.content === '' ? '无' : section.content,
          }));
          setLatestPrdSections(normalized);
          console.log('[PRD Draft] 已从后端动态加载最新版本 PRD 的 7 个核心章节', normalized);
        } else {
          // 接口返回非成功状态码，直接用静态7节兜底
          setLatestPrdSections(static7Sections);
        }
      } catch (err) {
        console.warn('[PRD Draft] 动态拉取最新 PRD 失败，启用静态7节 fallback', err);
        // 动态读取完全失败时，直接用硬编码的7个静态章节兜底
        setLatestPrdSections(static7Sections);
      } finally {
        setIsLoadingLatestPrd(false);
      }
    })();
  }, [workflowStage, effectiveProductName, latestPrdSections, isLoadingLatestPrd, static7Sections]);

  const runIdeaAnalysis = (ideaSummary: string) => {
    const source = `${effectiveProductName} ${ideaSummary} ${repositoryGoal}`;
    setRecallItems(buildRecallItems(source, selectedMode));
    setHasAnalyzedIdea(true);
    setWorkflowStage('proposal');
    setProposalPhase('select');
    setDiscussionTurn(1);
    setFacilitatorReady(false);
    setProposalInput('');
    setProposalDiscussionMessages([]);
    setProposalFacilitatorSummary('');
    setVerificationNotes([]);
    setCommentReplies({});
    setReplyInputs({});
    setReviewDecisions({});
    setActiveCommentNoteId(null);
    setAnalysisBoard((prev) => ({
      ...prev,
      coreScenario: `${effectiveProductName}：${selectedMode === 'repo' ? `${ideaSummary}；仓库目标：${repositoryGoal}` : ideaSummary}`,
      coreDecision: '先明确目标用户、关键流程和人工确认点，再进入 PRD。',
      nextAction: '先在第二步选择 Proposal Agent，再生成 proposal。',
    }));
  };

  useEffect(() => {
    if (workflowStage !== 'verification') return;

    const nextPhases: Record<string, NotePhase> = {};
    const timers = visibleVerificationNotes.map((note, index) => {
      nextPhases[note.id] = 'thinking';
      return window.setTimeout(() => {
        setNotePhases((prev) => ({ ...prev, [note.id]: 'comment' }));
      }, 900 + index * 450);
    });

    setNotePhases(nextPhases);
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [workflowStage, verificationNotes]);

  const buildFallbackFacilitatorSummary = () => {
    const names = activeProposalAgents.map((agent) => agent.name).join('、');
    return `Facilitator 总结：当前由 ${names} 达成的共识是，先围绕“${effectiveProductName}”收敛一个可执行的 MVP，重点覆盖目标用户、核心场景、人工确认门槛与成功指标，再生成第一版 PRD Draft。`;
  };

  const requestProposalDiscussion = ({
    userInput = '',
    taskLabel,
    baseMessages = proposalDiscussionMessages,
    appendUserMessage = false,
  }: {
    userInput?: string;
    taskLabel: string;
    baseMessages?: ProposalDiscussionMessage[];
    appendUserMessage?: boolean;
  }) => {
    const userMessage =
      appendUserMessage && userInput.trim()
        ? {
            id: `proposal-user-${Date.now()}`,
            speaker: 'User',
            role: 'user' as const,
            content: userInput.trim(),
          }
        : null;
    const nextMessages = userMessage ? [...baseMessages, userMessage] : [...baseMessages];
    
    if (userMessage) {
      setProposalDiscussionMessages(nextMessages);
    }
    setIsProposalDiscussing(true);
    setFacilitatorReady(false);

    void (async () => {
      try {
        const response = await fetch('/api/proposal/discuss', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productName: effectiveProductName,
            selectedMode,
            summary,
            repositoryGoal,
            taskLabel,
            userInput,
            selectedAgents: activeProposalAgents,
            messages: nextMessages,
          }),
        });
        const data = await parseJsonResponse<ProposalDiscussResponse>(response, 'Proposal 讨论');
        if (!response.ok) throw new Error(data.error || 'Proposal 讨论失败');

        const replies =
          (data.agentReplies || []).map((item, index) => ({
            id: `${item.agentId || item.name}-${Date.now()}-${index}`,
            speaker: item.name,
            role: 'agent' as const,
            content: item.content,
            skillName: item.skillName || '',
          })) || [];

        setProposalDiscussionMessages((prev) => [...prev, ...replies]);
        setProposalFacilitatorSummary(data.facilitatorSummary || buildFallbackFacilitatorSummary());
        setApiStatus('connected');
      } catch (error) {
        const fallbackReplies = activeProposalAgents.map((agent, index) => ({
          id: `fallback-${agent.id}-${Date.now()}-${index}`,
          speaker: agent.name,
          role: 'agent' as const,
          content: userInput.trim() ? buildAgentReply(agent, userInput.trim()) : buildAgentOpening(agent, selectedMode, summary),
          skillName: getPrimarySkill(agent)?.name,
        }));
        setProposalDiscussionMessages((prev) => [...prev, ...fallbackReplies]);
        setProposalFacilitatorSummary(buildFallbackFacilitatorSummary());
        setApiStatus('error');
      } finally {
        setIsProposalDiscussing(false);
      }
    })();
  };

  const handleStartProposalDiscussion = async () => {
    setProposalPhase('discuss');
    setDiscussionTurn(1);
    setProposalInput('');
    setProposalDiscussionMessages([]);
    setProposalFacilitatorSummary('');
    await requestProposalDiscussion({
      taskLabel: '开始第一轮 Proposal 讨论',
      baseMessages: [],
      appendUserMessage: false,
    });
  };

  const handleContinueProposalDiscussion = async () => {
    const nextTurn = Math.min(discussionTurn + 1, 3);
    setDiscussionTurn(nextTurn);
    await requestProposalDiscussion({
      userInput:
        nextTurn === 2
          ? `请继续把第一版范围收敛到 ${selectedMode === 'repo' ? '现有仓库改造中的需求判断与 PRD 输出' : '需求澄清到 PRD 生成'}，不要一次把所有能力都做满。`
          : '请继续从风险、MVP 边界和人工确认点的角度推进讨论，并收口成可执行方案。',
      taskLabel: `继续第 ${nextTurn} 轮 Proposal 讨论`,
      appendUserMessage: false,
    });
  };

  const generateVerificationNotes = async () => {
    // 立即在当前闭包中拍快照，完全不依赖任何外层可能在并发渲染中丢失的引用
    const currentSelectedAgentIdsSnapshot = [...selectedVerificationAgents];
    const currentActiveAgentsSnapshot = verificationCatalog.filter(
      (agent) => currentSelectedAgentIdsSnapshot.includes(agent.id)
    );
    
    console.log('[Debug Verification] 当前选中的 Agent ID 快照:', currentSelectedAgentIdsSnapshot);
    console.log('[Debug Verification] 过滤后有效 Agent 数量:', currentActiveAgentsSnapshot.length);

    if (currentActiveAgentsSnapshot.length === 0) {
      setVerificationPhase('select');
      return;
    }

    // 第一步：同步立刻生成保底批注，不管后面网络怎么样，用户点击瞬间就有东西看到
    const immediateSafeFallbackNotes = verificationNotesBase.filter((note) => 
      currentActiveAgentsSnapshot.some((agent) => agent.id === note.agentId)
    );
    console.log('[Debug Verification] 同步保底批注数量:', immediateSafeFallbackNotes.length);
    
    // 先把 UI 全部重置，同步塞保底内容进去
    setReviewDecisions({});
    setCommentReplies({});
    setReplyInputs({});
    setActiveCommentNoteId(null);
    setVerificationNotes(immediateSafeFallbackNotes);
    setIsGeneratingVerification(true);
    setVerificationPhase('review');

    try {
      // 异步等网络请求完成，拿到真实AI生成的批注替换掉保底内容
      const response = await fetch('/api/verification/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: effectiveProductName,
          selectedMode,
          summary,
          repositoryGoal,
          facilitatorSummary: proposalFacilitatorSummary,
          selectedAgents: currentActiveAgentsSnapshot,
          prdDraftSections,
        }),
      });
      const data = await parseJsonResponse<VerificationReviewResponse>(response, 'Verification 批注');
      if (!response.ok) throw new Error(data.error || 'Verification 批注生成失败');
      const newNotes = data.verificationNotes || [];
      console.log('[Debug Verification] 后端返回真实AI批注数量:', newNotes.length);
      setVerificationNotes(newNotes);
      setReviewDecisions((prev) => {
        const cleaned: Record<string, ReviewDecision | undefined> = {};
        newNotes.forEach(note => {
          if (prev[note.id]) {
            cleaned[note.id] = prev[note.id];
          }
        });
        return cleaned;
      });
      setApiStatus('connected');
    } catch (error) {
      console.warn('[Debug Verification] 网络/后端异常，继续使用保底批注:', error);
      setVerificationNotes(immediateSafeFallbackNotes);
      setApiStatus('error');
    } finally {
      setIsGeneratingVerification(false);
    }
  };

  const handleStartVerificationReview = async () => {
    await generateVerificationNotes();
  };

  const handleGeneratePrdDraft = () => {
    setLatestPrdSections(null);
    setIsLoadingLatestPrd(true);
    // 立刻跳转到 PRD Draft 页面，不阻塞原界面，生成逻辑在后台异步执行
    setWorkflowStage('draft');

    void (async () => {
      try {
        console.log('[PRD Draft] 正在调用 Facilitator 升级接口，把讨论结果写入新版本PRD yaml...');
        const upgradeRes = await fetch('/api/proposal/facilitator-upgrade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectName: effectiveProductName,
            historyRecords: [...proposalDiscussionMessages],
            orchestratorState: {
              sessionId: (() => {
                const stateKey = 'orchestrator_session_' + effectiveProductName;
                const cached = localStorage.getItem(stateKey);
                return cached || null;
              })()
            }
          }),
        });
        const upgradeData = await upgradeRes.json();
        if (!upgradeRes.ok) {
          throw new Error(upgradeData.error || 'Facilitator 升级失败');
        }
        console.log('[PRD Draft] ✅ 新版本PRD yaml已成功生成:', upgradeData.newFilePath);
        
        // 立即重新从后端拉取最新生成的完整13个PRD章节内容
        console.log('[PRD Draft] 正在重新拉取最新PRD的全部13个章节content...');
        const getPrdRes = await fetch('/api/prd/get-latest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectName: effectiveProductName }),
        });
        const prdData = await getPrdRes.json();
        if (getPrdRes.ok && prdData.prdSections && Array.isArray(prdData.prdSections)) {
          const normalized = prdData.prdSections.map((section: { id: string; name: string; system_instruction?: string | null; content?: string | null }) => ({
            id: section.id,
            name: section.name,
            system_instruction: section.system_instruction == null || section.system_instruction === '' ? '无' : section.system_instruction,
            content: section.content == null || section.content === '' ? '无' : section.content,
          }));
          setLatestPrdSections(normalized);
          console.log('[PRD Draft] ✅ 已从新生成的PRD文件中加载全部', normalized.length, '个章节，非空content=', normalized.filter((s: any) => s.content !== '无').length);
        } else {
          setLatestPrdSections(static7Sections);
        }
      } catch (upgradeError) {
        console.warn('[PRD Draft] Facilitator 升级写入新版本PRD失败:', upgradeError);
        alert('PRD Draft生成失败: ' + (upgradeError instanceof Error ? upgradeError.message : String(upgradeError)));
        // 失败时也用静态数据兜底
        setLatestPrdSections(static7Sections);
      } finally {
        setIsLoadingLatestPrd(false);
      }
    })();
  };

  const handleStartClarificationChat = async () => {
    const trimmedSummary = summary.trim();
    if (!trimmedSummary) return;
    
    // 第一步：确保项目已创建，如果项目不存在就自动创建，生成初始 PRD yaml 文件
    try {
      console.log('[Project Ensure] 准备确保项目 ' + effectiveProductName + ' 存在');
      const createRes = await fetch('/api/project/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: effectiveProductName }),
      });
      const createData = await createRes.json();
      if (createRes.ok) {
        console.log('[Project Ensure] 项目已确保存在，初始PRD文件已生成:', createData);
      } else {
        console.log('[Project Ensure] 项目可能已存在，跳过创建:', createData?.error);
      }
    } catch (createError) {
      console.log('[Project Ensure] 自动创建项目时可能项目已存在，继续后续流程:', createError);
    }

    // 第二步：如果有 repositoryGoal 内容，复制最新版本 PRD 并写入内容
    if (repositoryGoal && repositoryGoal.trim()) {
      try {
        console.log('[PRD Update] 准备更新项目 ' + effectiveProductName + ' 的PRD，复制最新版本并写入 repositoryGoal 内容');
        await fetch('/api/prd/update-repository-goal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectName: effectiveProductName,
            repositoryGoal: repositoryGoal.trim(),
          }),
        });
      } catch (updateError) {
        console.warn('[PRD Update] 更新 repositoryGoal 失败:', updateError);
      }
    }

    setEnableClarificationChatMode(true);
    setClarificationMessages([]);
    setClarifiedPrdContents([]);
    setClarificationIsReadyToConfirm(false);
    setIsConfirmingPrdSave(false);
    setIsClarificationSending(true);

    try {
      const response = await fetch('/api/clarification/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: effectiveProductName,
          summary: trimmedSummary,
          selectedMode,
          repositoryGoal,
          importedRepo,
          previousDslContent: '',
          messages: [
            {
              role: 'user',
              content: trimmedSummary
            }
          ],
        }),
      });
      const data = await parseJsonResponse<ClarificationChatResult & { error?: string }>(
        response,
        '多轮需求澄清',
      );
      if (!response.ok) throw new Error(data.error || '需求澄清对话失败');

      let finalAgentContent = data.agentReply;
      if (!data.isReadyToConfirm && !finalAgentContent.includes("？") && !finalAgentContent.includes("?")) {
        finalAgentContent += "\n\n👉 关键追问：" + (data.nextClarificationQuestion || "请补充这个功能最核心的目标用户是谁？");
      }
      const firstAgentMessage: ClarificationMessage = {
        id: `agent-first-${Date.now()}`,
        speaker: 'Requirement Clarifier',
        role: 'agent',
        content: finalAgentContent,
      };
      setClarificationMessages([firstAgentMessage]);
      if (Array.isArray(data.partialDslContent)) {
        setClarifiedPrdContents(data.partialDslContent);
      }
      setClarificationIsReadyToConfirm(Boolean(data.isReadyToConfirm));
    } catch (error) {
      const fallbackFirstReply = `我目前初步理解你要在Conduit站点首页的信息流所有文章卡片底部，新增面向全部全站访客开放可见的阅读量展示元素。当前最核心需要先确认的规则直接决定后续前后端实现方案，我先向你确认第一个关键问题：请问你期望该阅读量的展示格式是直接展示原始的精确访问数字，还是做类似"1.2万"这类的大数友好格式化展示，同时是否有对应的展示阈值规则？这个问题可以帮我们直接确定后端是否需要新增预计算统计字段、前端展示逻辑的整体复杂度。`;
      const firstAgentMessage: ClarificationMessage = {
        id: `agent-fallback-first-${Date.now()}`,
        speaker: 'Requirement Clarifier',
        role: 'agent',
        content: fallbackFirstReply,
      };
      setClarificationMessages([firstAgentMessage]);
    } finally {
      setIsClarificationSending(false);
    }
  };

  const handleClarificationChatSubmit = () => {
    const userText = clarificationInput.trim();
    if (!userText || isClarificationSending) return;

    const userMessage: ClarificationMessage = {
      id: `user-${Date.now()}`,
      speaker: '你',
      role: 'user',
      content: userText,
    };
    
    const finalMessagesForBackend = [...clarificationMessages, userMessage];
    setClarificationMessages(finalMessagesForBackend);
    setClarificationInput('');
    setIsClarificationSending(true);

    void (async () => {
      try {
        const response = await fetch('/api/clarification/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
          productName: effectiveProductName,
          summary,
          selectedMode,
          repositoryGoal,
          importedRepo,
          previousDslContent: clarifiedPrdContents
            .map((item: {id: string, name: string, content: string}) => `${item.name}：${item.content}`).join('\n'),
          messages: finalMessagesForBackend,
        }),
        });
        const data = await parseJsonResponse<ClarificationChatResult & { error?: string }>(
          response,
          '多轮需求澄清',
        );
        if (!response.ok) throw new Error(data.error || '需求澄清对话失败');

        let finalNewAgentContent = data.agentReply;
        if (!data.isReadyToConfirm && !finalNewAgentContent.includes("？") && !finalNewAgentContent.includes("?")) {
          finalNewAgentContent += "\n\n👉 关键追问：" + (data.nextClarificationQuestion || "请补充这个功能最核心的目标用户是谁？");
        }
        const newAgentMessage: ClarificationMessage = {
          id: `agent-${Date.now()}`,
          speaker: 'Requirement Clarifier',
          role: 'agent',
          content: finalNewAgentContent,
        };
        setClarificationMessages((prev) => [...prev, newAgentMessage]);
        if (Array.isArray(data.partialDslContent)) {
          setClarifiedPrdContents(data.partialDslContent);
        }
        setClarificationIsReadyToConfirm(Boolean(data.isReadyToConfirm));
      } catch (error) {
        console.error('澄清对话接口调用失败:', error);
        const fallbackReply = '我先收到你的补充信息。为了继续推进，我有一个关键问题想先确认：这个功能的核心目标用户具体是谁？';
        const newAgentMessage: ClarificationMessage = {
          id: `agent-fallback-${Date.now()}`,
          speaker: 'Requirement Clarifier',
          role: 'agent',
          content: fallbackReply,
        };
        setClarificationMessages((prev) => [...prev, newAgentMessage]);
      } finally {
        setIsClarificationSending(false);
      }
    })();
  };

  const handleConfirmClarificationResult = async () => {
    setIsConfirmingPrdSave(true);
    try {
      const response = await fetch('/api/prd/upgrade-version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: effectiveProductName,
          clarifiedContents: clarifiedPrdContents,
        }),
      });
      const result = await parseJsonResponse<{ ok: boolean; newVersion: string; newFilename: string } & { error?: string }>(
        response,
        'PRD版本升级'
      );
      if (!response.ok) throw new Error(result.error || 'PRD版本升级失败');

      console.log('[PRD Upgrade] 新版本已成功生成:', result.newVersion, result.newFilename);
    } catch (error) {
      console.error('写入最新 PRD 版本失败:', error);
      alert('版本保存失败，请检查后端日志');
      setIsConfirmingPrdSave(false);
      return;
    } finally {
    }

    setIsConfirmingPrdSave(false);
    setEnableClarificationChatMode(false);
    setHasAnalyzedIdea(true);
  };

  const handleAnalyzeIdea = async () => {
    if (selectedMode === 'repo' && !importedRepo) {
      setRepoImportError('请先完成 GitHub 仓库导入，再继续分析需求。');
      return;
    }
    
    if (selectedMode === 'repo' && repositoryGoal) {
      try {
        await fetch('/api/prd/update-repository-goal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectName: effectiveProductName,
            repositoryGoal: repositoryGoal,
          }),
        });
      } catch (updateError) {
        console.warn('[PRD Update] 更新 repositoryGoal 失败:', updateError);
      }
    }
    
    const trimmedSummary = summary.trim();
    if (!trimmedSummary) {
      setHasAnalyzedIdea(false);
      return;
    }
    if (!enableClarificationChatMode) {
      runIdeaAnalysis(trimmedSummary);
    }
  };

  const handleOptimizeContent = async (target: RequirementRefineTarget) => {
    const draftText = (target === 'repositoryGoal' ? repositoryGoal : summary).trim();
    if (!draftText || isRefiningRequirement) return;

    setIsRefiningRequirement(true);
    setRefineTarget(target);
    setRefineStatus('正在用 LLM 优化输入内容...');
    setRefineStatusTone('loading');

    try {
      const response = await fetch('/api/requirement-refiner/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: effectiveProductName,
          summary: draftText,
          selectedMode,
          repositoryGoal: target === 'repositoryGoal' ? draftText : repositoryGoal,
          contentLabel: target === 'repositoryGoal' ? '仓库改造需求' : '一句话描述',
        }),
      });
      const data = await parseJsonResponse<RequirementRefineResult & { error?: string }>(
        response,
        '需求优化',
      );
      if (!response.ok) throw new Error(data.error || '需求优化失败');
      const optimized = data.optimized?.trim() || draftText;
      const hasChange = hasMeaningfulRewrite(draftText, optimized);
      if (target === 'repositoryGoal') {
        setRepositoryGoal(optimized);
      } else {
        setSummary(optimized);
      }
      setRefineStatus(
        hasChange
          ? '已由 LLM 优化输入内容。'
          : '已由 LLM 判断当前内容较清晰，我只做了轻微整理。',
      );
      setRefineStatusTone('default');
    } catch (error) {
      const fallback = evaluateRequirementSummary(draftText);
      const optimized = fallback.optimized?.trim() || draftText;
      const hasChange = hasMeaningfulRewrite(draftText, optimized);
      if (target === 'repositoryGoal') {
        setRepositoryGoal(optimized);
      } else {
        setSummary(optimized);
      }
      setRefineStatus(
        hasChange
          ? 'LLM 暂时不可用，已切换为本地降级优化。'
          : 'LLM 暂时不可用，当前为本地降级判断。',
      );
      setRefineStatusTone('warning');
    } finally {
      setHasAnalyzedIdea(false);
      setRecallItems([]);
      setIsRefiningRequirement(false);
      setHasOptimizedWithLLM(true);
    }
  };

  const handleImportRepository = async () => {
    const value = repositoryUrl.trim();
    if (!value || isImportingRepo) return;
    setIsImportingRepo(true);
    setRepoImportError('');

    try {
      const response = await fetch('/api/repo/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositoryUrl: value, branch: repositoryBranch }),
      });
      const data = await parseJsonResponse<ImportedRepo & { error?: string }>(response, '仓库导入');
      if (!response.ok) throw new Error(data.error || '导入仓库失败');

      setImportedRepo(data);
      setSummary(data.readmeExcerpt || data.description || summary);
      setRepositoryBranch(data.branch);
    } catch (error) {
      const message = error instanceof Error ? error.message : '导入仓库失败';
      setImportedRepo(null);
      setRepoImportError(message);
    } finally {
      setIsImportingRepo(false);
    }
  };

  const handleCreateProjectConfirm = async () => {
    const value = productName.trim();
    if (!value || isCreatingProject) return;
    setIsCreatingProject(true);
    setProjectCreateError('');

    try {
      const response = await fetch('/api/project/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: value }),
      });
      const data = await parseJsonResponse<{ ok?: boolean; message?: string; error?: string }>(response, '项目创建');
      if (!response.ok) throw new Error(data.error || '创建项目失败');

      alert(`✅ 项目「${value}」创建成功！已在 prd 目录下生成对应的 PRD YAML 文件。`);
      setIsCreateModalOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建项目失败';
      setProjectCreateError(message);
    } finally {
      setIsCreatingProject(false);
    }
  };

  const runFullConduitAgentChain = async () => {
    const effectiveName = productName.trim() || 'conduit';
    setIsConduitChainRunning(true);
    setConduitStepIndex(0);
    setConduitChainResults({});
    try {
      // Step 1: Read PRD contents
      setConduitStepIndex(0);
      const readPrdResponse = await fetch('/api/conduit/read-prd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: effectiveName }),
      });
      const prdData = (await parseJsonResponse(readPrdResponse, '读取 PRD')) as any;
      setConduitPrdContents(prdData.contents);
      setConduitChainResults(prev => ({ ...prev, prdRead: prdData }));

      // Step 2: Analyze project
      setConduitStepIndex(1);
      const analyzeResp = await fetch('/api/conduit/analyze-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const analyzeData = await parseJsonResponse(analyzeResp, '分析仓库');
      setConduitChainResults(prev => ({ ...prev, projectAnalyze: analyzeData }));

      // Step 3: Generate changes
      setConduitStepIndex(2);
      const generateResp = await fetch('/api/conduit/generate-changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: effectiveName }),
      });
      const generateData = (await parseJsonResponse(generateResp, '生成改动')) as any;
      setConduitGeneratedChanges(generateData.changes);
      setConduitChainResults(prev => ({ ...prev, codeChanges: generateData }));

      // Step 4: Apply changes
      setConduitStepIndex(3);
      const applyResp = await fetch('/api/conduit/apply-changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes: (generateData?.changes as any[]) || [] }),
      });
      const applyData = await parseJsonResponse(applyResp, '应用改动');
      setConduitChainResults(prev => ({ ...prev, applyResults: applyData }));

      alert('✅ Agent 链条执行完成！已根据 PRD 修改 conduit 仓库。');
    } catch (e) {
      console.error('[Conduit Chain Error]', e);
      alert(`❌ 执行出错: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setConduitStepIndex(3);
      setIsConduitChainRunning(false);
    }
  };

  const handleProposalDiscussionSubmit = async () => {
    const value = proposalInput.trim();
    if (!value) return;
    setProposalInput('');
    await requestProposalDiscussion({
      userInput: value,
      taskLabel: '根据用户补充继续 Proposal 讨论',
      appendUserMessage: true,
    });
  };

  const toggleProposalAgent = (agentId: string) => {
    setSelectedProposalAgents((prev) =>
      prev.includes(agentId) ? prev.filter((item) => item !== agentId) : [...prev, agentId],
    );
  };

  const toggleVerificationAgent = (agentId: string) => {
    setSelectedVerificationAgents((prev) =>
      prev.includes(agentId) ? prev.filter((item) => item !== agentId) : [...prev, agentId],
    );
  };

  const handleReplySubmit = async (note: VerificationNote) => {
    const value = (replyInputs[note.id] || '').trim();
    if (!value) return;

    const userReply: CommentReply = {
      id: `${note.id}-user-${Date.now()}`,
      author: 'user',
      content: value,
    };

    setCommentReplies((prev) => ({
      ...prev,
      [note.id]: [...(prev[note.id] || []), userReply],
    }));
    setReplyInputs((prev) => ({ ...prev, [note.id]: '' }));
    setReplyingNoteId(note.id);

    try {
      const response = await fetch('/api/verification/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: effectiveProductName,
          summary,
          note,
          userComment: value,
        }),
      });
      const data = await parseJsonResponse<{ reply?: string; error?: string }>(
        response,
        'Verification 回复',
      );
      if (!response.ok) throw new Error(data.error || 'Verification 回复失败');

      const agentReply: CommentReply = {
        id: `${note.id}-agent-${Date.now()}`,
        author: 'agent',
        content:
          data.reply || `我已经基于你的评论更新判断，建议继续把修改点落实到 ${note.target}。`,
      };
      setCommentReplies((prev) => ({
        ...prev,
        [note.id]: [...(prev[note.id] || []), agentReply],
      }));
      setApiStatus('connected');
    } catch (error) {
      const agentReply: CommentReply = {
        id: `${note.id}-agent-${Date.now()}`,
        author: 'agent',
        content: `我已基于你的评论重新判断这条批注。针对“${value}”，建议优先在 ${note.target} 增加更明确的说明，并保留这条评论作为后续 refine 的依据。`,
      };
      setCommentReplies((prev) => ({
        ...prev,
        [note.id]: [...(prev[note.id] || []), agentReply],
      }));
      setApiStatus('error');
    } finally {
      setReplyingNoteId(null);
    }
  };

  const headerIcon = useMemo(() => {
    switch (currentStep) {
      case 0:
        return '💡';
      case 1:
        return '🧠';
      case 2:
        return '📄';
      case 3:
        return '✨';
      default:
        return '💡';
    }
  }, [currentStep]);
  return (
    <div className={`workflow-app ${isDark ? 'theme-dark' : 'theme-light'}`}>
      <div className="workflow-bg workflow-bg--one" />
      <div className="workflow-bg workflow-bg--two" />

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">PA</div>
          <span className="brand-name">ProductAgent</span>
        </div>

        <button className="theme-toggle" type="button" onClick={() => setIsDark((prev) => !prev)} aria-label="toggle theme">
          {isDark ? '☀️' : '🌙'}
        </button>
      </header>

      <div className="workspace">
        <aside className="left-panel glass-panel">
          <p className="panel-kicker">产品创建流程</p>
          <div className="step-list">
            {steps.map((step, index) => {
              const state = currentStep === index ? 'active' : currentStep > index ? 'done' : 'idle';
              return (
                <button key={step.title} type="button" className={`step-item step-item--${state}`} onClick={() => setCurrentStep(index)}>
                  <span className="step-dot">{currentStep > index ? '✓' : `0${index + 1}`}</span>
                  <span className="step-copy">
                    <strong>{step.title}</strong>
                    <small>{step.desc}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="main-panel">
          <div className="main-header">
            <div className="main-title-wrap">
              <div className="main-icon">{headerIcon}</div>
              <div>
                <h1>{currentStepMeta.title}</h1>
                <p>{currentStepMeta.desc}</p>
              </div>
            </div>
          </div>

          {currentStep === 0 && (
            <section className="screen screen-idea">
              <div className="choice-grid">
                <button type="button" className={`choice-card ${selectedMode === 'repo' ? 'is-selected' : ''}`} onClick={() => setSelectedMode('repo')}>
                  <div className="choice-icon">📦</div>
                  <strong>导入现有仓库</strong>
                  <span>连接已有代码或仓库，在此基础上继续提需求。</span>
                </button>

                <button type="button" className={`choice-card ${selectedMode === 'new' ? 'is-selected' : ''}`} onClick={() => setSelectedMode('new')}>
                  <div className="choice-icon">+</div>
                  <strong>创建全新产品</strong>
                  <span>从头开始输入 Idea，规划完整产品流程。</span>
                </button>
              </div>

              <div className="glass-panel form-card">
                <div className="mode-banner">
                  <span className="mode-banner__label">{selectedMode === 'repo' ? '导入现有仓库模式' : '创建全新产品模式'}</span>
                  <p>{selectedMode === 'repo' ? '请先读取 GitHub 仓库，系统会先识别当前仓库能力；确认后，再补充项目名称和这次想做的改造目标。' : '请从零输入你的产品 Idea 和一句话描述，你也可以先在输入框旁快速优化需求表达。'}</p>
                </div>

                {selectedMode === 'new' ? (
                  <>
                    <div className="field-group">
                      <label htmlFor="product-name">产品名称</label>
                      <input id="product-name" value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="conduit" />
                    </div>
                    <div className="field-group">
                      <label htmlFor="product-summary">一句话描述</label>
                      <div className="summary-editor">
                        <textarea
                          id="product-summary"
                          rows={4}
                          value={summary}
                          onChange={(event) => {
                            setSummary(event.target.value);
                            if (refineTarget === 'summary') setRefineStatus('');
                          }}
                        />
                        <button
                          type="button"
                          className="summary-optimize-chip"
                          onClick={() => void handleOptimizeContent('summary')}
                          disabled={!summary.trim() || isRefiningRequirement}
                        >
                          {isRefiningRequirement ? '正在判断...' : '优化需求'}
                        </button>
                      </div>
                      {refineStatus && refineTarget === 'summary' && (
                        <div className={`summary-optimize-status is-${refineStatusTone}`}>
                          {refineStatus}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="field-group">
                      <label htmlFor="repository-url">GitHub / 仓库地址</label>
                      <input
                        id="repository-url"
                        value={repositoryUrl}
                        onChange={(event) => {
                          setRepositoryUrl(event.target.value);
                          setImportedRepo(null);
                          setRepoImportError('');
                        }}
                        placeholder="https://github.com/your-org/your-repo"
                      />
                    </div>
                    <div className="action-row">
                      <button type="button" className="secondary-button" onClick={() => void handleImportRepository()} disabled={!repositoryUrl.trim() || isImportingRepo}>
                        {isImportingRepo ? '正在读取仓库...' : '自动读取仓库'}
                      </button>
                    </div>
                    {repoImportError && <div className="repo-status repo-status--error">{repoImportError}</div>}
                    {importedRepo && (
                      <>
                        <div className="repo-import-card">
                          <div className="repo-import-card__head">
                            <div>
                              <strong>{importedRepo.fullName}</strong>
                              <a href={importedRepo.htmlUrl} target="_blank" rel="noreferrer">
                                打开 GitHub
                              </a>
                            </div>
                            <span className="soft-badge soft-badge--success">已完成导入</span>
                          </div>
                          <p>{importedRepo.description || '该仓库未提供公开描述。'}</p>
                          <div className="tag-row">
                            <span className="tag">语言：{importedRepo.primaryLanguage}</span>
                            <span className="tag">Stars：{importedRepo.stars}</span>
                            <span className="tag">Issues：{importedRepo.openIssues}</span>
                          </div>
                        </div>
                        <div className="field-group">
                          <label htmlFor="repo-summary">仓库当前能力 / 已有模块说明</label>
                          <textarea id="repo-summary" rows={4} value={summary} onChange={(event) => { setSummary(event.target.value); setHasOptimizedWithLLM(false); }} />
                        </div>
                        <div className="field-group">
                          <label htmlFor="repository-name">项目名称</label>
                          <input
                            id="repository-name"
                            value={productName}
                            onChange={(event) => {
                              const filtered = event.target.value.replace(/[^a-zA-Z0-9_-]/g, '');
                              setProductName(filtered);
                            }}
                            placeholder="例如：my-project-v1"
                          />
                          <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '6px' }}>将作为本地文件夹名称，仅支持字母、数字、下划线及中划线。</div>
                        </div>
                        <div className="action-row" style={{ marginBottom: 18 }}>
                          <button
                            type="button"
                            className={productName.trim() ? 'primary-button' : 'secondary-button'}
                            style={{ opacity: productName.trim() ? 1 : 0.45 }}
                            onClick={() => {
                              setProjectCreateError('');
                              setIsCreateModalOpen(true);
                            }}
                            disabled={!productName.trim()}
                          >
                            创建项目
                          </button>
                        </div>
                        <div className="field-group">
                          <label htmlFor="repository-goal">本次想在现有仓库上做什么</label>
                          <div className="summary-editor">
                            <textarea
                              id="repository-goal"
                              rows={4}
                              value={repositoryGoal}
                              onChange={(event) => {
                                setRepositoryGoal(event.target.value);
                                if (refineTarget === 'repositoryGoal') setRefineStatus('');
                                setHasOptimizedWithLLM(false);
                              }}
                            />
                            <button
                              type="button"
                              className="summary-optimize-chip"
                              onClick={() => void handleOptimizeContent('repositoryGoal')}
                              disabled={!repositoryGoal.trim() || isRefiningRequirement}
                            >
                              {isRefiningRequirement && refineTarget === 'repositoryGoal' ? '正在判断...' : '优化内容'}
                            </button>
                          </div>
                          {refineStatus && refineTarget === 'repositoryGoal' && (
                            <div className={`summary-optimize-status is-${refineStatusTone}`}>
                              {refineStatus}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}

                {enableClarificationChatMode ? (
                  <div className="clarification-chat-panel glass-card">
                    <div className="clarification-chat-panel__head">
                      <div className="clarification-chat-panel__title-row">
                        <span className="status-badge">Requirement Clarifier</span>
                        <strong>需求多轮澄清助手</strong>
                      </div>
                      <p>我会一步步向你追问，每次只聚焦一个最高价值歧义点，直到需求足够清晰到进入 Proposal。</p>
                    </div>

                    <div ref={clarificationThreadRef} className="clarification-thread">
                      {clarificationMessages.map((message) => (
                        <div
                          key={message.id}
                          className={`discussion-message discussion-message--${message.role}`}
                        >
                          <div
                            className="discussion-message__avatar"
                          >
                            {message.speaker.slice(0, 2)}
                          </div>
                          <div className="discussion-message__bubble">
                            <span className="discussion-message__speaker">{message.speaker}</span>
                            <p>{message.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {clarificationIsReadyToConfirm ? (
                      <div className="info-banner info-banner--success" style={{ marginBottom: '16px' }}>
                        <div className="info-banner__icon">✅</div>
                        <div className="info-banner__body">
                          <strong>全部需求被澄清</strong>
                        </div>
                      </div>
                    ) : null}

                    {clarifiedPrdContents.length > 0 ? (
                      <div className="partial-dsl-block">
                        <strong>📝 逐步构建 PRD</strong>
                        <div>
                          {clarifiedPrdContents.map((item: {id: string, name: string, content: string}, idx: number) => (
                            <div key={idx} style={{ marginBottom: '12px', padding: '4px 0' }}>
                              <strong style={{ display: 'inline-block' }}>{item.name}</strong>：{item.content}
                              <br />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {clarificationIsReadyToConfirm ? (
                      <div className="confirm-ready-zone">
                        <div className="info-banner info-banner--success">
                          <div className="info-banner__icon">✅</div>
                          <div className="info-banner__body">
                            <strong>需求澄清已完成！</strong>
                            <p>当前需求已足够清晰，可以进入 Proposal 阶段生成完整分析。</p>
                          </div>
                        </div>
                        <button type="button" className="primary-button" onClick={handleConfirmClarificationResult} disabled={isConfirmingPrdSave}>
                          {isConfirmingPrdSave ? '正在写入新版本...' : '确认并将结果写入最新 PRD 版本'}
                        </button>
                      </div>
                    ) : (
                      <div className="discussion-composer">
                        <textarea
                          rows={3}
                          value={clarificationInput}
                          onChange={(event) => setClarificationInput(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault();
                              void handleClarificationChatSubmit();
                            }
                          }}
                          placeholder="补充你的信息来回答 Requirement Clarifier 的追问..."
                          disabled={isClarificationSending}
                        />
                        <div className="discussion-composer__footer">
                          <span>Enter 发送，Shift + Enter 换行</span>
                          <button
                            type="button"
                            className="tiny-button tiny-button--primary"
                            onClick={() => void handleClarificationChatSubmit()}
                            disabled={!clarificationInput.trim() || isClarificationSending}
                          >
                            {isClarificationSending ? '思考中...' : '发送补充'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                {!enableClarificationChatMode && trimmedSummary && !hasAnalyzedIdea ? (
                  <div className="action-banner">
                    <span className="action-banner__desc">你可以选择快速分析需求，或者先开启多轮澄清对话逐步补齐歧义点</span>
                  </div>
                ) : null}

                {hasAnalyzedIdea && !enableClarificationChatMode ? (
                  <div className="info-banner info-banner--dynamic">
                    <div className="info-banner__icon">✨</div>
                    <div className="info-banner__body">
                      <strong>已完成需求歧义收紧，并召回 3 个相似的历史需求方案</strong>
                      <div className="recall-grid">
                        {recallItems.map((item) => (
                          <article key={item.title} className="recall-card">
                            <h3>{item.title}</h3>
                            <p>{item.reason}</p>
                            <div className="tag-row">
                              {item.tags.map((tag) => (
                                <span key={tag} className="tag">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="action-row action-row--between">
                  {!enableClarificationChatMode && !hasAnalyzedIdea ? (
                    <>
                      <button type="button" className="blue-action-button" onClick={() => void handleStartClarificationChat()} disabled={!hasOptimizedWithLLM || !trimmedSummary || isClarificationSending}>
                        {isClarificationSending ? '正在生成第一个澄清问题...' : '开启多轮澄清对话'}
                      </button>
                      <button type="button" className="blue-action-button" onClick={handleAnalyzeIdea} disabled={!hasOptimizedWithLLM}>
                        快速分析需求
                      </button>
                    </>
                  ) : null}
                  {hasAnalyzedIdea && !enableClarificationChatMode ? (
                    <button type="button" className="primary-button" onClick={() => { setWorkflowStage('proposal'); setProposalPhase('select'); setDiscussionTurn(1); setFacilitatorReady(false); setCurrentStep(1); }} disabled={selectedMode === 'repo' && !importedRepo}>
                      进入 Proposal 工作台
                    </button>
                  ) : null}
                </div>
              </div>
            </section>
          )}

          {currentStep === 1 && (
            <section className="screen screen-analysis">
              <div className="glass-panel orchestrator-card">
                <div className="status-card orchestrator-card__status">
                  <span className="status-badge">Adaptive Expert Orchestrator</span>
                  <span className="status-copy">
                    当前阶段：
                    {workflowStage === 'proposal' ? 'Proposal 生成' : workflowStage === 'draft' ? 'PRD Draft 合成' : 'Verification 批注判定'}
                  </span>
                </div>
                <div className="workflow-stage-nav">
                  {workflowStages.map((stage, index) => {
                    const order = workflowStages.findIndex((item) => item.key === workflowStage);
                    const state = index < order ? 'done' : index === order ? 'active' : 'idle';
                    return (
                      <div key={stage.key} className={`workflow-stage-pill workflow-stage-pill--${state}`}>
                        <strong>{stage.title}</strong>
                        <span>{stage.desc}</span>
                      </div>
                    );
                  })}
                </div>

                {workflowStage === 'proposal' && (
                  <div className="stage-page">
                    <div className="section-head">
                      <div className="section-head__copy">
                        <h2>{proposalPhase === 'select' ? '选择 Proposal Agent' : 'Discuss the Problem'}</h2>
                        {proposalPhase === 'discuss' ? <p>{discussionPrompt}</p> : null}
                      </div>
                      <div className="badge-row">
                        <span className="soft-badge">{proposalPhase === 'select' ? '先选专家' : '多 Agent 讨论中'}</span>
                        <span className="soft-badge soft-badge--success">
                          {proposalPhase === 'select' ? '进入讨论后再生成 PRD' : 'Facilitator 总结后进入 PRD Draft'}
                        </span>
                      </div>
                    </div>
                    {proposalPhase === 'select' ? (
                      <div className="agent-selection-layout">
                        <div className="agent-selection-grid">
                          {proposalCatalog.map((agent) => {
                            const selected = selectedProposalAgents.includes(agent.id);
                            return (
                              <div key={agent.id} className="agent-choice-card-wrap">
                                <button type="button" className={`agent-choice-card ${selected ? 'is-selected' : ''}`} onClick={() => toggleProposalAgent(agent.id)}>
                                <div
                                  className="agent-choice-card__avatar"
                                  style={agent.avatarUrl ? { backgroundImage: `url(${agent.avatarUrl})` } : undefined}
                                  aria-hidden="true"
                                >
                                  {!agent.avatarUrl ? agent.name.slice(0, 2) : null}
                                  <span className="agent-avatar-badge">{renderAgentBadge(agent.avatarBadge)}</span>
                                </div>
                                <div className="agent-choice-card__body">
                                  <div className="agent-choice-card__meta">
                                    <strong>{agent.role}</strong>
                                  </div>
                                  <p className="agent-choice-card__description">{agent.description}</p>
                                </div>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                        <aside className="selection-summary-card glass-card">
                          <h3>Chosen Proposal Team</h3>
                          <p>这些 Proposal Agents 会一起定义用户需求、交互方案、产品方向、技术边界、指标方式和商业合理性，再合成第一版 PRD。</p>
                          <div className="tag-row">
                            {activeProposalAgents.map((agent) => (
                              <span key={agent.id} className="tag">
                                {agent.name}
                              </span>
                            ))}
                          </div>
                          <div className="selection-summary-card__section">
                            <strong>Proposal Focus</strong>
                            <div className="tag-row">
                              {proposalFocusAreas.map((item) => (
                                <span key={item} className="tag">
                                  {item}
                                </span>
                              ))}
                            </div>
                          </div>
                        </aside>
                      </div>
                    ) : (
                      <div className="discussion-layout">
                        <div className="discussion-panel glass-card">
                          <div className="discussion-thread">
                            {proposalDiscussionMessages.map((message) => (
                              (() => {
                                const messageAgent = message.role === 'agent' ? getAgentByName(message.speaker) : undefined;
                                return (
                              <div
                                key={message.id}
                                className={`discussion-message discussion-message--${message.role}`}
                              >
                                <div
                                  className="discussion-message__avatar"
                                  style={
                                    message.role === 'agent' && messageAgent?.avatarUrl
                                      ? { backgroundImage: `url(${messageAgent.avatarUrl})` }
                                      : undefined
                                  }
                                  aria-hidden="true"
                                >
                                  {!(message.role === 'agent' && messageAgent?.avatarUrl) ? message.speaker.slice(0, 2) : null}
                                  {message.role === 'agent' ? (
                                    <span className="agent-avatar-badge agent-avatar-badge--thread">
                                      {renderAgentBadge(messageAgent?.avatarBadge)}
                                    </span>
                                  ) : null}
                                </div>
                                <div
                                  className={`discussion-message__bubble${
                                    message.role === 'agent' && messageAgent?.avatarBadge
                                      ? ` discussion-message__bubble--${messageAgent.avatarBadge}`
                                      : ''
                                  }`}
                                >
                                  <div className="discussion-message__meta">
                                    <span className="discussion-message__speaker">{message.speaker}</span>
                                  </div>
                                  <div className="discussion-message__content">{renderTextWithNewlines(message.content)}</div>
                                </div>
                              </div>
                                );
                              })()
                            ))}
                          </div>
                          <div className="discussion-composer">
                            <textarea
                              rows={3}
                              value={proposalInput}
                              onChange={(event) => setProposalInput(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey) {
                                  event.preventDefault();
                                  handleProposalDiscussionSubmit();
                                }
                              }}
                              placeholder="继续补充你的判断、约束、目标用户或边界，让 Proposal Agents 接着讨论..."
                            />
                            <div className="discussion-composer__footer">
                              <span>Enter 发送，Shift + Enter 换行</span>
                              <button
                                type="button"
                                className="tiny-button tiny-button--primary"
                                onClick={handleProposalDiscussionSubmit}
                                disabled={!proposalInput.trim()}
                              >
                                发送到讨论
                              </button>
                            </div>
                          </div>
                          {facilitatorReady && (
                            <div className="discussion-summary-card">
                              <strong>Facilitator Summary</strong>
                              <div className="summary-content">{renderTextWithNewlines(proposalFacilitatorSummary)}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="action-row action-row--between">
                      {proposalPhase === 'select' ? (
                        <>
                          <button type="button" className="secondary-button" onClick={() => setCurrentStep(0)}>
                            返回上一步
                          </button>
                          <button
                            type="button"
                            className="primary-button"
                            onClick={() => void handleStartProposalDiscussion()}
                            disabled={activeProposalAgents.length === 0 || isProposalDiscussing}
                          >
                            {isProposalDiscussing ? '讨论生成中...' : '开始讨论'}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => {
                              setProposalPhase('select');
                              setDiscussionTurn(1);
                              setFacilitatorReady(false);
                              setProposalDiscussionMessages([]);
                              setProposalFacilitatorSummary('');
                              setProposalInput('');
                            }}
                          >
                            返回选 Agent
                          </button>
                          <div className="discussion-action-row">
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => void handleContinueProposalDiscussion()}
                              disabled={isProposalDiscussing || discussionTurn >= 3}
                            >
                              {isProposalDiscussing ? '讨论生成中...' : '继续讨论'}
                            </button>
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => setFacilitatorReady(true)}
                              disabled={!proposalFacilitatorSummary}
                            >
                              让 Facilitator 总结
                            </button>
                            <button
                              type="button"
                              className="primary-button"
                              onClick={() => void handleGeneratePrdDraft()}
                              disabled={!facilitatorReady}
                            >
                              生成 PRD Draft
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {workflowStage === 'draft' && (
                  <div className="stage-page">
                    <div className="section-head">
                      <h2>PRD Draft</h2>
                      <div className="badge-row">
                        <span className="soft-badge">Merged from selected proposals</span>
                        <span className="soft-badge soft-badge--success">点下一步后进入 Verification</span>
                      </div>
                    </div>
                    <div className="draft-stage-layout">
                      <article className="glass-card prd-draft-card">
                        <div className="prd-section-list">
                          {isLoadingLatestPrd ? (
                            <div className="empty-state-card">
                              <strong>正在动态加载最新 PRD 内容...</strong>
                              <p>正在读取项目 {effectiveProductName} 的最新版本 PRD 文件。</p>
                            </div>
                          ) : latestPrdSections ? (
                            // 优先展示后端拉取/静态兜底的7个章节，严格按指定ID顺序排列
                            latestPrdSections.map((section) => (
                              <section key={section.id} className="prd-section-card">
                                {/* 第一块：章节名称，独立块级元素 */}
                                <span className="doc-pill">{section.name}</span>
                                {/* 第二块：章节正文内容，块级独立换行 */}
                                <div>{renderTextWithNewlines(section.content)}</div>
                              </section>
                            ))
                          ) : (
                            // 向后兼容旧的 fallback 模式
                            prdDraftSections.map((section) => (
                              <section key={section.id || section.title} className="prd-section-card">
                                <span className="doc-pill">{section.title}</span>
                                <p>{section.content}</p>
                              </section>
                            ))
                          )}
                        </div>
                      </article>
                      <aside className="selection-summary-card glass-card">
                        <h3>Proposal Merge Summary</h3>
                        <p>这版 PRD 已合并用户、UX、市场、技术、数据和商业视角。进入 Verification 后，会从可行性、风险、逻辑、AI 能力、商业价值和运营复杂度六个维度继续 challenge。</p>
                        <div className="tag-row">
                          {activeProposalAgents.map((agent) => (
                            <span key={agent.id} className="tag">
                              {agent.name}
                            </span>
                          ))}
                        </div>
                      </aside>
                    </div>
                    <div className="action-row action-row--between">
                      <button type="button" className="secondary-button" onClick={() => { setWorkflowStage('proposal'); setProposalPhase('discuss'); }}>
                        返回 Discuss
                      </button>
                      <button type="button" className="primary-button" onClick={() => setWorkflowStage('verification')}>
                        下一步：Verification
                      </button>
                    </div>
                  </div>
                )}

                {workflowStage === 'verification' && (
                  <div className="stage-page">
                    {verificationPhase === 'select' && (
                      <>
                        <div className="section-head">
                          <h2>Verification 选择评审 Agent</h2>
                          <div className="badge-row">
                            <span className="soft-badge">先选专家</span>
                            <span className="soft-badge soft-badge--success">点「开始批注」生成评审意见</span>
                          </div>
                        </div>
                        <div className="agent-selection-layout">
                          <div className="agent-selection-grid">
                            {verificationCatalog.map((agent) => {
                              const selected = selectedVerificationAgents.includes(agent.id);
                              return (
                                <div key={agent.id} className="agent-choice-card-wrap">
                                  <button type="button" className={`agent-choice-card agent-choice-card--verify ${selected ? 'is-selected' : ''}`} onClick={() => toggleVerificationAgent(agent.id)}>
                                  <div
                                    className="agent-choice-card__avatar"
                                    style={agent.avatarUrl ? { backgroundImage: `url(${agent.avatarUrl})` } : undefined}
                                    aria-hidden="true"
                                  >
                                    {!agent.avatarUrl ? agent.name.slice(0, 2) : null}
                                    <span className="agent-avatar-badge">{renderAgentBadge(agent.avatarBadge)}</span>
                                  </div>
                                  <div className="agent-choice-card__body">
                                    <div className="agent-choice-card__meta">
                                      <strong>{agent.role}</strong>
                                    </div>
                                    <p className="agent-choice-card__description">{agent.description}</p>
                                  </div>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          <aside className="selection-summary-card glass-card">
                            <h3>Verification Setup</h3>
                            <p>Review side 会集中回答六个问题：能不能做、有没有风险、逻辑对不对、AI 靠不靠谱、值不值得做、上线后会不会炸。</p>
                            <div className="tag-row">
                              {activeVerificationAgents.map((agent) => (
                                <span key={agent.id} className="tag">
                                  {agent.name}
                                </span>
                              ))}
                            </div>
                            <div className="selection-summary-card__section">
                              <strong>Review Focus</strong>
                              <div className="tag-row">
                                {verificationFocusAreas.map((item) => (
                                  <span key={item} className="tag">
                                    {item}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </aside>
                        </div>
                        <div className="action-row action-row--between">
                          <button type="button" className="secondary-button" onClick={() => setWorkflowStage('draft')}>
                            返回 PRD Draft
                          </button>
                          <button
                            type="button"
                            className="primary-button"
                            onClick={() => {
                              // 绝对不能先切phase！必须先进入函数拍快照、置loading为true，最后再统一切phase
                              void handleStartVerificationReview();
                            }}
                            disabled={activeVerificationAgents.length === 0 || isGeneratingVerification}
                          >
                            {isGeneratingVerification ? '正在生成批注...' : '开始批注'}
                          </button>
                        </div>
                      </>
                    )}

                    {verificationPhase === 'review' && (
                      <>
                        <div className="section-head">
                          <h2>Verification 批注判定</h2>
                          <div className="badge-row">
                            <span className="soft-badge">已生成批注</span>
                            <span className="soft-badge soft-badge--success">逐条判定对 / 错</span>
                          </div>
                        </div>
                        <div className="verification-inline-layout glass-card">
                          <div className="section-head section-head--compact">
                            <h3>当前 PRD Draft</h3>
                          </div>
                          {isGeneratingVerification ? (
                            <div className="empty-state-card">
                              <strong>Verification Agents 正在生成批注</strong>
                              <p>正在基于当前 PRD Draft 和你选中的 reviewer 实时生成评审意见。</p>
                            </div>
                          ) : visibleVerificationNotes.length === 0 && selectedVerificationAgents.length === 0 ? (
                            <div className="empty-state-card">
                              <strong>请先选择至少一个 Verification Agent</strong>
                              <p>只有选中的 agent 才会在当前 PRD Draft 的对应段落上生成批注。</p>
                            </div>
                          ) : visibleVerificationNotes.length === 0 && selectedVerificationAgents.length > 0 ? (
                            // 终极兜底：用户明明选了agent但notes还没到，直接显示loading占位，绝对不让用户看到那条"请选择"的错误提示
                            <div className="empty-state-card">
                              <strong>Verification Agents 正在生成批注</strong>
                              <p>正在基于当前 PRD Draft 和你选中的 reviewer 实时生成评审意见。</p>
                            </div>
                          ) : (
                            <div className="verification-inline-sections">
                              {prdDraftSections.map((section) => {
                                const sectionNotes = visibleVerificationNotes.filter(
                                  (note) => 
                                    note.target.startsWith(`${section.id}.`) || 
                                    note.target.startsWith(section.id) || 
                                    note.target.includes(section.title),
                                );
                                return (
                                  <section
                                    key={section.id}
                                    className={`inline-section-row ${sectionNotes.length > 0 ? 'has-annotation' : ''}`}
                                  >
                                    <div className="inline-section-doc">
                                      <span className="doc-pill">{section.title}</span>
                                      <div className={`inline-section-body ${sectionNotes.length > 0 ? 'is-annotated' : ''}`}>
                                        <p>{section.content}</p>
                                        {sectionNotes.length > 0 && <span className="annotation-anchor-line" />}
                                      </div>
                                    </div>

                                    {sectionNotes.length > 0 && (
                                      <div className="inline-section-notes">
                                        {sectionNotes.map((note) => {
                                          const decision = reviewDecisions[note.id];
                                          const noteReplies = commentReplies[note.id] || [];
                                          const phase = notePhases[note.id] || 'thinking';
                                          const isCommentComposerVisible = activeCommentNoteId === note.id;
                                          return (
                                            <div
                                              key={note.id}
                                              className={`verification-note verification-note--thread inline-annotation-card ${phase === 'thinking' ? 'is-thinking' : ''}`}
                                            >
                                              <span className="annotation-connector-line" />
                                              <div className="verification-note__head">
                                                <div className="verification-note__agent">
                                                  <strong>{note.agent}</strong>
                                                </div>
                                                <span className={`note-severity note-severity--${note.severity}`}>
                                                  {phase === 'thinking' ? 'THINKING' : note.severity.toUpperCase()}
                                                </span>
                                              </div>

                                              {phase === 'thinking' ? (
                                                <div className="thinking-card">
                                                  <div className="thinking-card__pulse">
                                                    <span />
                                                    <span />
                                                    <span />
                                                  </div>
                                                  <div className="thinking-list">
                                                    {note.thoughts.map((thought) => (
                                                      <div key={thought} className="thinking-item">
                                                        {thought}
                                                      </div>
                                                    ))}
                                                  </div>
                                                </div>
                                              ) : (
                                                <>
                                                  <div className="verification-note__content">
                                                    <div className="verification-note__section">
                                                      <span className="verification-note__label">最终批注</span>
                                                      <p>{note.comment}</p>
                                                    </div>
                                                    <div className="verification-note__section verification-note__section--muted">
                                                      <span className="verification-note__label">建议修改</span>
                                                      <p>{note.suggestion}</p>
                                                    </div>
                                                  </div>

                                                  <div className="decision-row">
                                                    <button
                                                      type="button"
                                                      className={`decision-button decision-button--accept ${decision === 'accept' ? 'is-active' : ''}`}
                                                      onClick={() => {
                                                        setReviewDecisions((prev) => ({ ...prev, [note.id]: 'accept' }));
                                                        setActiveCommentNoteId((prev) => (prev === note.id ? null : prev));
                                                      }}
                                                    >
                                                      ✅ 采纳
                                                    </button>
                                                    <button
                                                      type="button"
                                                      className={`decision-button decision-button--comment ${decision === 'comment' ? 'is-active' : ''}`}
                                                      onClick={() => {
                                                        setReviewDecisions((prev) => ({ ...prev, [note.id]: 'comment' }));
                                                        setActiveCommentNoteId(note.id);
                                                      }}
                                                    >
                                                      评论
                                                    </button>
                                                  </div>

                                                  {noteReplies.length > 0 ? (
                                                    <div className="thread-replies">
                                                      {noteReplies.map((reply) => (
                                                        <div
                                                          key={reply.id}
                                                          className={`thread-bubble ${reply.author === 'user' ? 'thread-bubble--user' : 'thread-bubble--agent-sub'}`}
                                                        >
                                                          <span className="thread-bubble__label">
                                                            {reply.author === 'user' ? '你的评论' : `${note.agent} 回复`}
                                                          </span>
                                                          <p>{reply.content}</p>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  ) : null}

                                                  {isCommentComposerVisible ? (
                                                    <div className="reply-composer">
                                                      <textarea
                                                        rows={2}
                                                        value={replyInputs[note.id] || ''}
                                                        onChange={(event) =>
                                                          setReplyInputs((prev) => ({ ...prev, [note.id]: event.target.value }))
                                                        }
                                                        placeholder="继续评论这段 PRD，agent 会据此追加批注..."
                                                      />
                                                      <button
                                                        type="button"
                                                        className="tiny-button tiny-button--primary"
                                                        onClick={() => handleReplySubmit(note)}
                                                        disabled={!replyInputs[note.id]?.trim() || replyingNoteId === note.id}
                                                      >
                                                        {replyingNoteId === note.id ? '回复中...' : '发送评论'}
                                                      </button>
                                                    </div>
                                                  ) : null}
                                                </>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </section>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <div className="action-row action-row--between">
                          <button type="button" className="secondary-button" onClick={() => { setVerificationPhase('select'); setVerificationNotes([]); setReviewDecisions({}); }}>
                            返回选 Agent
                          </button>
                          <button type="button" className="primary-button" onClick={async () => {
                            const firstAcceptedNote = visibleVerificationNotes.find(n => reviewDecisions[n.id] === 'accept');
                            await fetch('/api/verification/reply', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                productName: effectiveProductName,
                                summary,
                                projectName: effectiveProductName,
                                note: firstAcceptedNote || {},
                                isGoToPRD: true,
                                userComment: ''
                              }),
                            }).catch(() => {});
                            const finalPrd = [...prdDraftSections];
                            finalPrd.push({
                              id: String(finalPrd.length + 1),
                              title: `${finalPrd.length + 1}. Verification 批注汇总`,
                              content: visibleVerificationNotes.map(note => `${note.agent} ${note.severity === 'high' ? '⚠️' : note.severity === 'medium' ? '💡' : 'ℹ️'} ${note.target}: ${note.comment} → ${reviewDecisions[note.id] === 'accept' ? '已采纳' : reviewDecisions[note.id] === 'comment' ? '已评论' : '待确认'}`).join('； ')
                            });
                            finalPrd.push({
                              id: String(finalPrd.length + 1),
                              title: `${finalPrd.length + 1}. 交付范围与验收标准`,
                              content: '第一版优先覆盖核心主流程，后续逐步扩展高级功能边界。'
                            });
                            setEditablePrdDraftSections(finalPrd);
                            setCurrentStep(2);
                          }} disabled={!allVerificationReviewed}>
                            下一步：进入 PRD 输出
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}
 
          {currentStep === 2 && (
            <section className="screen screen-doc">
              <div className="ready-block">
                <div className="ready-icon">📝</div>
                <h2>PRD 文档 - 全可编辑</h2>
                <p>所有段落都支持直接修改，改完自动同步。</p>
              </div>
              <div className="glass-panel doc-card">
                <div className="doc-toolbar">
                  <span>{effectiveProductName} - 产品需求文档 v1.0</span>
                  <div className="toolbar-actions">
                    <button type="button" className="tiny-button">
                      导出 PDF
                    </button>
                    <button type="button" className="tiny-button tiny-button--primary" onClick={() => setCurrentStep(3)}>
                      去生成交互原型
                    </button>
                  </div>
                </div>
                <div className="doc-body">
                  <h3>{effectiveProductName} - PRD</h3>
                  {editablePrdDraftSections.map((section, index) => (
                    <div key={section.id} className="doc-section">
                      <span className="doc-pill">{section.title}</span>
                      <textarea
                        rows={4}
                        value={section.content}
                        onChange={(e) => {
                          const next = [...editablePrdDraftSections];
                          next[index] = { ...next[index], content: e.target.value };
                          setEditablePrdDraftSections(next);
                        }}
                        style={{
                          width: '100%',
                          border: '1px solid var(--line)',
                          borderRadius: '10px',
                          background: 'var(--surface-strong)',
                          color: 'var(--text)',
                          padding: '12px 14px',
                          font: 'inherit',
                          fontSize: '14px',
                          lineHeight: '1.7',
                          resize: 'vertical',
                          outline: 'none',
                        }}
                      />
                    </div>
                  ))}
                  <div className="doc-section">
                    <span className="doc-pill">7. Verification 处理结果</span>
                    <ul className="doc-bullets">
                      {visibleVerificationNotes.map((note) => (
                        <li key={note.id}>
                          {note.agent}：{reviewDecisions[note.id] === 'accept' ? '采纳' : reviewDecisions[note.id] === 'comment' ? '已评论' : '待确认'}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </section>
          )}

          {currentStep === 3 && (
            <section className="screen screen-prototype">
              {isConduitChainRunning ? (
                <>
                  <div className="proto-loader">
                    <div className="proto-loader__ring" />
                    <div className="proto-loader__core">🤖</div>
                  </div>
                  <h2>Agent 链条正在运行：从 PRD 到 Conduit 代码</h2>
                  <div className="glass-panel" style={{padding:'20px', marginTop:'16px'}}>
                    {conduitChainSteps.slice(0, conduitStepIndex + 1).map((step, i) => (
                      <div key={i} style={{padding:'8px 0', fontSize:'15px', color: i <= conduitStepIndex ? 'var(--text)' : 'var(--text-2)', opacity: i < conduitStepIndex ? 0.7 : 1}}>
                        {step}
                      </div>
                    ))}
                  </div>
                  <div className="progress-bar" style={{marginTop:'24px'}}>
                    <div className="progress-bar__fill" style={{width: `${Math.min(100, ((conduitStepIndex + 1) / conduitChainSteps.length) * 100)}%`}} />
                  </div>
                </>
              ) : (isImplementingCode ? (
                <>
                  <div className="proto-loader">
                    <div className="proto-loader__ring" />
                    <div className="proto-loader__core">✨</div>
                  </div>
                  <h2>Agent 正在基于 PRD 直接修改 Conduit 仓库源代码</h2>
                  <div className="glass-panel" style={{padding:'20px', marginTop:'16px'}}>
                    {implementSteps.slice(0, implementStepIndex + 1).map((step, i) => (
                      <div key={i} style={{padding:'8px 0', fontSize:'15px', color: i <= implementStepIndex ? 'var(--text)' : 'var(--text-2)', opacity: i < implementStepIndex ? 0.7 : 1}}>
                        {step}
                      </div>
                    ))}
                  </div>
                  <div className="progress-bar" style={{marginTop:'24px'}}>
                    <div className="progress-bar__fill" style={{width: `${Math.min(100, ((implementStepIndex + 1) / implementSteps.length) * 100)}%`}} />
                  </div>
                </>
              ) : (
                <>
                  <div style={{display:'flex', gap:'12px', marginBottom:'24px'}}>
                    <button 
                      type="button" 
                      className="primary-button"
                      onClick={() => void runFullConduitAgentChain()}
                      style={{padding:'12px 24px', fontSize:'15px'}}
                    >
                      🚀 启动完整 Agent Chain（从 PRD 读取 → 生成代码 → 写入 Conduit）
                    </button>
                  </div>
                  {conduitPrdContents ? (
                    <div className="glass-panel" style={{marginBottom:'20px'}}>
                      <h3 style={{marginTop:0, marginBottom:14, fontSize:'16px'}}>已读取的 PRD Content 条目</h3>
                      <ul style={{margin:0, paddingLeft:'20px', lineHeight:'2'}}>
                        {conduitPrdContents.map((item, idx) => (
                          <li key={idx} style={{color:'var(--text)'}}>
                            <code style={{background:'var(--surface-soft)', padding:'2px 6px', borderRadius:'4px'}}>{item.id}</code>: {(item.content || '').slice(0, 120)}...
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {conduitGeneratedChanges && conduitGeneratedChanges.length > 0 ? (
                    <div className="glass-panel" style={{marginBottom:'20px'}}>
                      <h3 style={{marginTop:0, marginBottom:14, fontSize:'16px'}}>生成的代码改动计划</h3>
                      <ul style={{margin:0, paddingLeft:'20px', lineHeight:'2'}}>
                        {conduitGeneratedChanges.map((change, idx) => (
                          <li key={idx} style={{color:'var(--text)'}}>
                            {change.action === 'create' ? '➕' : '✏️'} {change.relativePath}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {conduitChainResults?.applyResults?.results ? (
                    <div className="glass-panel" style={{marginBottom:'20px'}}>
                      <h3 style={{marginTop:0, marginBottom:14, fontSize:'16px'}}>代码写入结果</h3>
                      <ul style={{margin:0, paddingLeft:'20px', lineHeight:'2'}}>
                        {conduitChainResults.applyResults.results.map((r:any, idx:number) => (
                          <li key={idx} style={{color:r.success ? 'var(--text)' : '#ef4444'}}>
                            {r.success ? '✅' : '❌'} {r.relativePath} {r.success ? '' : `- ${r.error}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="ready-block">
                    <div className="ready-icon">✅</div>
                    <h2>Conduit 已就绪！</h2>
                    <p>前端运行在 {conduitPreviewUrl}，后端运行在 http://127.0.0.1:3001。</p>
                  </div>
                  {lastImplementResult?.modifiedFiles && lastImplementResult.modifiedFiles.length > 0 ? (
                    <div className="glass-panel" style={{marginTop:'20px'}}>
                      <h3 style={{marginTop:0, marginBottom:14, fontSize:'16px'}}>修改的文件列表</h3>
                      <ul style={{margin:0, paddingLeft:'20px', lineHeight:'2'}}>
                        {lastImplementResult.modifiedFiles.map((f,i)=>(
                          <li key={i} style={{color:'var(--text)'}}>✅ {f.path} - {f.changeDescription}</li>
                        ))}
                      </ul>
                    </div>
                  ):null}
                  <div style={{marginTop:'20px'}}>
                    <h3 style={{marginBottom:'12px', fontSize:'16px'}}>📱 Conduit 博客应用 直接预览</h3>
                    <iframe 
                         src={conduitPreviewUrl}
                         style={{width:'1920px', maxWidth:'100%', aspectRatio:'16/9', height:'auto', display:'block', border:'1px solid var(--line)', borderRadius:'12px'}}
                         title={`Conduit App @ ${conduitPreviewUrl}`}
                         sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                       />
                  </div>
                </>
              ))}
            </section>
          )}
        </main>
      </div>

      {isCreateModalOpen && (
        <>
          <div className="modal-overlay" onClick={() => !isCreatingProject && setIsCreateModalOpen(false)} />
          <div className="modal-card">
            <div className="modal-card__head">
              <h3>创建项目</h3>
            </div>
            <div className="modal-card__body">
              <p style={{ margin: '0 0 14px', color: 'var(--text-soft)', lineHeight: 1.7 }}>
                正在创建「<strong style={{ color: 'var(--text)' }}>{productName}</strong>」项目。
              </p>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.7 }}>
                系统将在 prd 目录下新建 <code style={{ background: 'var(--surface-soft)', padding: '2px 8px', borderRadius: '6px' }}>{productName}_prd/</code> 文件夹，生成基于模板的 PRD YAML 文件。
              </p>
              {projectCreateError && (
                <div className="repo-status repo-status--error" style={{ marginTop: 14 }}>
                  {projectCreateError}
                </div>
              )}
            </div>
            <div className="modal-card__foot action-row action-row--between">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setProjectCreateError('');
                  setIsCreateModalOpen(false);
                }}
                disabled={isCreatingProject}
              >
                取消
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void handleCreateProjectConfirm()}
                disabled={isCreatingProject}
              >
                {isCreatingProject ? '正在创建...' : '确认'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default App;