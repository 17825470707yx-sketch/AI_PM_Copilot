import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SKILLS_ROOT = join(process.cwd(), '..', '..', 'agent skills');

export const AGENT_SKILL_PATHS = {
  // Proposal Agents - 完全匹配实际目录名称
  'problem-user-context': ['Proposal Agents', 'problem-user-context', 'SKILL.md'],
  'competitive-case': ['Proposal Agents', 'competitive-case', 'SKILL.md'],
  'flow-interaction-blueprint': ['Proposal Agents', 'flow-interaction-blueprint', 'SKILL.md'],
  'metrics-prioritization': ['Proposal Agents', 'metrics-prioritization', 'SKILL.md'],
  'scope-boundary': ['Proposal Agents', 'scope-boundary', 'SKILL.md'],
  'technical-feasibility': ['Proposal Agents', 'technical-feasibility', 'SKILL.md'],

  // Verification Agents - 完全匹配实际目录名称
  'verification-uat-acceptance': ['Verification', 'verification-uat-acceptance', 'SKILL.md'],
  'verification-security-privacy': ['Verification', 'verification-security-privacy', 'SKILL.md'],
  'verification-compatibility-adaptation': ['Verification', 'verification-compatibility-adaptation', 'SKILL.md'],
  'verification-performance-concurrency': ['Verification', 'verification-performance-concurrency', 'SKILL.md'],
  'verification-exception-empty-state': ['Verification', 'verification-exception-empty-state', 'SKILL.md'],
  'release-gate-orchestrator': ['Verification', 'release-gate-orchestrator', 'SKILL.md'],

  // Clarification Agents
  'requirement-clarifier': ['Clarification', 'requirement-clarifier', 'SKILL.md'],
  'requirement-refiner': ['Clarification', 'requirement-clarifier', 'SKILL.md'],
};

export function stripFrontmatter(markdown) {
  if (typeof markdown !== 'string') return '';
  return markdown.replace(/^---[\s\S]*?---\s*/u, '').trim();
}

export function loadRuntimeSkillMarkdown(agentId) {
  const pathParts = AGENT_SKILL_PATHS[agentId];
  if (!pathParts) return '';
  const skillPath = join(SKILLS_ROOT, ...pathParts);
  if (!existsSync(skillPath)) return '';

  try {
    const content = readFileSync(skillPath, 'utf8');
    return stripFrontmatter(content);
  } catch {
    return '';
  }
}

export function attachRuntimeSkills(selectedAgents) {
  return selectedAgents.map((agent) => ({
    ...agent,
    runtimeSkill: loadRuntimeSkillMarkdown(agent.id),
  }));
}
