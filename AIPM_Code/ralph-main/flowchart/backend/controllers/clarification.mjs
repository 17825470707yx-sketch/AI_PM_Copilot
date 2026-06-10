import { callArkChat, getMODEL, getAPI_KEY } from '../services/arkLlm.mjs';
import { safeJsonParse } from '../utils/jsonParser.mjs';
import { sanitizeJudgment, sanitizeMissingDimensions, sanitizeStringList } from '../utils/formatters.mjs';
import { buildClarificationChatSystemPrompt, buildRequirementRefinerSystemPrompt } from '../prompts/clarifier.mjs';
import { getLatestPrdYaml } from '../utils/yamlHelper.mjs';

export async function handleClarificationChat(req, res, parsedBody, writeJson) {
  const model = getMODEL();
  const apiKey = getAPI_KEY();
  if (!model || !apiKey) {
    writeJson(req, res, 500, { error: 'ARK proxy is not configured' });
    return;
  }

  try {
    const parsed = parsedBody || {};
    const productName = typeof parsed.productName === 'string' ? parsed.productName.trim() : 'default_project';
    const prdDimensions = await getLatestPrdYaml(productName);
    
    // 强制打印调试：确认后端从YAML读到的所有原始内容完全正确
    console.log('[CRITICAL DEBUG] 从用户YAML加载到的prdDimensions:', JSON.stringify(prdDimensions, null, 2));

    const systemPrompt = buildClarificationChatSystemPrompt({
      productName,
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
      selectedMode: parsed.selectedMode === 'repo' ? 'repo' : 'new',
      repositoryGoal: typeof parsed.repositoryGoal === 'string' ? parsed.repositoryGoal.trim() : '',
      previousDslContent: typeof parsed.previousDslContent === 'string' ? parsed.previousDslContent.trim() : '',
      prdDimensions,
    });

    const formattedMessages = Array.isArray(parsed.messages)
      ? parsed.messages.map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: typeof m.content === 'string' ? m.content.trim() : ''
        })).filter(m => m.content)
      : [];

    const arkMessages = [
      { role: 'system', content: systemPrompt },
      ...formattedMessages
    ];

    const replyContent = await callArkChat(arkMessages, { type: 'json_object' });
    const structured = typeof replyContent === 'string' ? safeJsonParse(replyContent) : null;

    if (!structured) {
      throw new Error('clarification chat response is not valid json');
    }

    // 最终安全保护：如果用户原有内容是非空的，100%永远保留，完全拒绝LLM用任何内容覆盖
    // 只有当LLM提供了用户完全没写过的全新非空内容，才允许增量补充
    const finalPartialDslContent = (() => {
      console.log('[CRITICAL DEBUG] LLM返回的updatedPrdDimensions:', JSON.stringify(structured.updatedPrdDimensions, null, 2));
      
      // 构建最终数组，完全以用户从YAML里预写的内容作为基底
      // LLM绝对不允许覆盖任何非空的用户已有内容
      return prdDimensions.map(existingItem => {
        const llmItem = Array.isArray(structured.updatedPrdDimensions) 
          ? structured.updatedPrdDimensions.find(l => l.id === existingItem.id) 
          : null;
        
        // 如果用户原有内容本身就是非空的 → 100%直接返回用户原有内容，LLM根本无权修改
        if (existingItem.content && String(existingItem.content).trim()) {
          console.log(`[保护逻辑] 保留用户原有内容: id=${existingItem.id}, 内容长度=${existingItem.content.length}`);
          return existingItem;
        }
        
        // 只有当用户原本这个字段是空的，才允许LLM的内容补进去
        if (llmItem && llmItem.content && String(llmItem.content).trim() && !/尚未填写|待明确|待补充/.test(llmItem.content)) {
          return llmItem;
        }
        
        return existingItem;
      });
    })();
    
    console.log('[CRITICAL DEBUG] 最终返回给前端的完整内容:', JSON.stringify(finalPartialDslContent, null, 2));

    writeJson(req, res, 200, {
      agentReply: structured.agentReply || '我已经记录了你的需求。',
      currentUnderstanding: structured.currentUnderstanding || '',
      detectedAmbiguities: Array.isArray(structured.detectedAmbiguities) ? structured.detectedAmbiguities : [],
      nextClarificationQuestion: structured.nextClarificationQuestion || '',
      partialDslContent: finalPartialDslContent,
      isReadyToConfirm: Boolean(structured.isReadyToConfirm)
    });
  } catch (error) {
    console.error('[Proxy Error] Clarification Chat 失败:', error);
    writeJson(req, res, 500, {
      error: error instanceof Error ? error.message : `unknown clarification error: ${String(error)}`,
    });
  }
}

export async function handleRequirementRefinerChat(req, res, parsedBody, writeJson) {
  const model = getMODEL();
  const apiKey = getAPI_KEY();
  if (!model || !apiKey) {
    writeJson(req, res, 500, { error: 'ARK proxy is not configured' });
    return;
  }

  try {
    const parsed = parsedBody || {};
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    if (!summary) {
      writeJson(req, res, 400, { error: 'summary is required' });
      return;
    }

    const systemPrompt = buildRequirementRefinerSystemPrompt({
      productName: typeof parsed.productName === 'string' ? parsed.productName.trim() : '',
      summary,
      selectedMode: parsed.selectedMode === 'repo' ? 'repo' : 'new',
      repositoryGoal: typeof parsed.repositoryGoal === 'string' ? parsed.repositoryGoal.trim() : '',
    });

    const replyContent = await callArkChat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: summary },
      ],
      { type: 'json_object' },
    );
    const structured = typeof replyContent === 'string' ? safeJsonParse(replyContent) : null;

    if (!structured) {
      throw new Error('requirement refiner response is not valid json');
    }

    writeJson(req, res, 200, {
      judgment: sanitizeJudgment(structured.judgment),
      missingDimensions: sanitizeMissingDimensions(structured.missingDimensions),
      strengths: sanitizeStringList(structured.strengths, 4),
      risks: sanitizeStringList(structured.risks, 4),
      rationale:
        typeof structured.rationale === 'string' && structured.rationale.trim()
          ? structured.rationale.trim()
          : '我已经先判断了这句话的需求质量，但还建议你再确认用户、场景和产出是否足够清楚。',
      rewriteNotes: sanitizeStringList(structured.rewriteNotes, 4),
      optimized:
        typeof structured.optimized === 'string' && structured.optimized.trim()
          ? structured.optimized.trim()
          : summary,
      alternativeVersion:
        typeof structured.alternativeVersion === 'string' && structured.alternativeVersion.trim()
          ? structured.alternativeVersion.trim()
          : summary,
      nextStep:
        typeof structured.nextStep === 'string' && structured.nextStep.trim()
          ? structured.nextStep.trim()
          : '你可以先采纳优化版本，再继续分析需求。',
    });
  } catch (error) {
    console.error('[Proxy Error] Requirement Refiner 失败:', error);
    writeJson(req, res, 500, {
      error: error instanceof Error ? error.message : `unknown requirement refiner error: ${String(error)}`,
    });
  }
}
