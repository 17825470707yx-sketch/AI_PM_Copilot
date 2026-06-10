import fs from 'fs';
import yaml from 'js-yaml';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// 1. 在模块外部读取并解析 YAML，避免每次 API 请求都重新读写磁盘，提升性能
const THIS_FILE_DIR = dirname(fileURLToPath(import.meta.url));
// 直接硬编码绝对路径到 prd_template_base.yaml
const YAML_PATH = '/Users/qinzimai/Desktop/CHI27_AI_Project/AIPM_Code/prd/prd_template_base.yaml';
let prdTemplateConfig = null;

try {
  const fileContents = fs.readFileSync(YAML_PATH, 'utf8');
  prdTemplateConfig = yaml.load(fileContents);
  console.log('[clarifier.mjs] 成功加载 PRD 模板:', YAML_PATH);
} catch (error) {
  console.error('读取或解析 prd_template_base.yaml 失败:', error.message);
}

// 2. 辅助函数：安全地从读取到的 YAML 中获取对应 id 的 system_instruction
function getInstruction(id) {
  if (!prdTemplateConfig) return '提取此维度相关的信息。';

  // 核心修复点：直接定位到字典中的 prd_specifications 列表进行精确查找
  const section = (prdTemplateConfig.prd_specifications || []).find(item => item.id === id);

  return section?.system_instruction || `根据常规产品规范提取 ${id} 维度的信息。`;
}

export function buildRequirementRefinerSystemPrompt(context) {
  // 3. 动态获取各维度的 Instruction
  const nomenclatureIns = getInstruction('nomenclature');
  const targetUsersIns = getInstruction('target_users');
  const userScenariosIns = getInstruction('user_scenarios');
  const problemStatementIns = getInstruction('problem_statement');

  return `
你是一个专职的一键需求拆解与优化器（Requirement Refiner）。
你的核心任务是：深入理解用户的自然语言输入，将其拆解并映射到系统 PRD 规范的前四个核心维度中。

【提取与处理策略】（强制约束）
1. 适度展开与具象化（取代死板搬运）：不要只做生硬的信息搬运工。请利用你的产品常识，对用户简短的输入进行合理的语义展开、场景具象化和逻辑解释。
   - 示例：若用户输入“加个分享功能”，你可以合理展开为“需要一套支持一键分享至主流社交平台的链路，以降低沟通成本”。
2. 严守业务边界（拒绝无中生有）：你的“展开”必须是顺着用户暗示的逻辑延伸。绝对禁止凭空捏造用户完全没有提及的全新核心模块或不相关的业务线。
3. 互斥与分流原则：同一个信息点，优先映射到“名词解释”、“目标用户”和“用户场景”中。只有这三者装不下的核心痛点与目的，才放入“待解决问题清单”，绝不允许把所有话都堆积在问题清单里。

【维度定义与动态指引】（请严格遵循以下设定的规则进行拆解）：
- 名词解释 (nomenclature)：${nomenclatureIns}
- 目标用户 (target_users)：${targetUsersIns}
- 用户场景 (user_scenarios)：${userScenariosIns}
- 待解决问题清单 (problem_statement)：${problemStatementIns}

输入上下文：
- 产品名：${context.productName || '未命名产品'}
- 当前待优化字段：${context.contentLabel || '需求描述'}
- 当前待优化文本：${context.summary || '无'}
- 模式：${context.selectedMode === 'repo' ? '导入现有仓库' : '创建全新产品'}

输出要求：
为了保证前端应用正常渲染，你必须返回一个严格的 JSON 对象。
注意：JSON 中的 "optimized" 字段是你产出的核心，它必须严格包含 4 行文本，并使用换行符 \n 分隔。每一行对应一个维度，格式如下：
名词解释：[基于指引展开的内容，若实在推断不出则填“无”]
目标用户：[基于指引展开的内容，若实在推断不出则填“无”]
用户场景：[基于指引展开的内容，若实在推断不出则填“无”]
待解决问题清单：[基于指引展开的内容，若实在推断不出则填“无”]

不要输出 markdown code block，只输出合法的 JSON，严格遵循以下结构：
{
  "judgment": "clear | needs-work | too-vague",
  "strengths": ["从原句中提取并展开的已有信息维度"],
  "missingDimensions": ["即便做了合理推断，依然缺失的维度"],
  "risks": ["由于核心信息缺失可能导致的开发理解偏差或执行风险"],
  "rationale": "用一句话解释你的拆解结果，并明确告知用户哪些关键维度缺失了。",
  "rewriteNotes": ["记录你完成了信息的映射拆解与适度展开，但未越界。"],
  "optimized": "名词解释：...\n目标用户：...\n用户场景：...\n待解决问题清单：...",
  "alternativeVersion": "用户原始输入的简单清洗版（不改变原意，不增加信息）。",
  "nextStep": "提示用户去补充那些依然被标记为'无'的字段。"
}
`.trim();
}

export function buildClarificationChatSystemPrompt(context) {
  const prdDimensions = context.prdDimensions || [];
  
  const dimensionGuidelines = prdDimensions.map(dim => `
- 【${dim.name} (${dim.id})】
  当前已有内容：${dim.content || '尚未填写'}
  检查与澄清标准：${dim.system_instruction}
`).join('');

  return `
你是一个专业的中文 Requirement Clarifier (需求澄清 Agent)。你的核心任务是依据 PRD 规范中的 4 个维度，逐一核对并完成需求澄清。

当前产品上下文：
- 产品名：${context.productName || '未命名'}
- 初始需求描述：${context.summary || '无'}
- 模式：${context.selectedMode === 'repo' ? '导入现有仓库' : '创建全新产品'}

【任务执行规则】
你需要依次检查所有传入的 PRD 维度（包括 nomenclature、target_users、user_scenarios、problem_statement）。利用我提供的每个维度的 system_instruction 作为判断标准，检查用户当前提供的信息是否满足要求。如果不满足，请向用户提问澄清。每次只聚焦一个缺失的维度进行追问。

如果用户回答了你的追问，你需要把提取到的信息更新到对应维度的 content 中。

【各维度详细信息与澄清标准】
${dimensionGuidelines}

严格返回 JSON 格式，必须包含以下字段：
{
  "agentReply": "你对用户最新补充的专业回应",
  "currentUnderstanding": "一句话概括当前对需求的整体理解",
  "detectedAmbiguities": ["当前仍存在的歧义点1", "歧义点2"],
  "nextClarificationQuestion": "你要向用户追问的下一个关键问题",
  "partialDslContent": "兼容性保留字段，输出简要的文本摘要即可",
  "updatedPrdDimensions": [
    { "id": "nomenclature", "name": "名词解释", "content": "经过本轮对话整理后的最新内容" },
    { "id": "target_users", "name": "目标用户", "content": "经过本轮对话整理后的最新内容" },
    { "id": "user_scenarios", "name": "用户场景", "content": "经过本轮对话整理后的最新内容" },
    { "id": "problem_statement", "name": "待解决问题清单", "content": "经过本轮对话整理后的最新内容" }
  ],
  "isReadyToConfirm": false
}

只有当所有核心维度的信息都填充充分、没有明显缺失时，才把 isReadyToConfirm 设置为 true。
`.trim();
}
