export function sanitizeInsights(input) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 4)
    .map((item, index) => ({
      id: typeof item?.id === 'string' && item.id.trim() ? item.id.trim() : `insight-${index + 1}`,
      label: typeof item?.label === 'string' && item.label.trim() ? item.label.trim() : `要点 ${index + 1}`,
      agent:
        typeof item?.agent === 'string' && item.agent.trim()
          ? item.agent.trim()
          : 'Requirement Clarifier',
      content: typeof item?.content === 'string' ? item.content.trim() : '',
    }))
    .filter((item) => item.content);
}

export function sanitizeJudgment(input) {
  if (input === 'clear' || input === 'needs-work' || input === 'too-vague') return input;
  return 'needs-work';
}

export function sanitizeMissingDimensions(input) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 5)
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

export function sanitizeStringList(input, limit = 5) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, limit)
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

export function sanitizeAgentList(input) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 8)
    .map((item) => ({
      id: typeof item?.id === 'string' ? item.id.trim() : '',
      name: typeof item?.name === 'string' ? item.name.trim() : '',
      role: typeof item?.role === 'string' ? item.role.trim() : '',
      team: typeof item?.team === 'string' ? item.team.trim() : '',
      description: typeof item?.description === 'string' ? item.description.trim() : '',
      summary: typeof item?.summary === 'string' ? item.summary.trim() : '',
      skills: Array.isArray(item?.skills)
        ? item.skills
            .slice(0, 3)
            .map((skill) => ({
              id: typeof skill?.id === 'string' ? skill.id.trim() : '',
              name: typeof skill?.name === 'string' ? skill.name.trim() : '',
              focus: typeof skill?.focus === 'string' ? skill.focus.trim() : '',
              whenToUse: typeof skill?.whenToUse === 'string' ? skill.whenToUse.trim() : '',
            }))
            .filter((skill) => skill.id && skill.name)
        : [],
    }))
    .filter((agent) => agent.id && agent.name);
}

export function sanitizeProposalMessages(input) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(-16)
    .map((item, index) => ({
      id: typeof item?.id === 'string' && item.id.trim() ? item.id.trim() : `message-${index + 1}`,
      speaker: typeof item?.speaker === 'string' && item.speaker.trim() ? item.speaker.trim() : 'Unknown',
      role: item?.role === 'user' ? 'user' : 'agent',
      content: typeof item?.content === 'string' ? item.content.trim() : '',
      skillName: typeof item?.skillName === 'string' ? item.skillName.trim() : '',
    }))
    .filter((item) => item.content);
}

export function sanitizeDraftSections(input) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 12)
    .map((item, index) => ({
      id: typeof item?.id === 'string' && item.id.trim() ? item.id.trim() : String(index + 1),
      title: typeof item?.title === 'string' ? item.title.trim() : '',
      content: typeof item?.content === 'string' ? item.content.trim() : '',
    }))
    .filter((item) => item.title);
}

export function sanitizeProposalReplies(input, selectedAgents) {
  if (!Array.isArray(input)) return [];

  const fallbackById = new Map(selectedAgents.map((agent) => [agent.id, agent]));
  return input
    .slice(0, selectedAgents.length)
    .map((item) => {
      const rawId = typeof item?.agentId === 'string' ? item.agentId.trim() : '';
      const fallbackAgent =
        fallbackById.get(rawId) ||
        selectedAgents.find((agent) => agent.name === item?.name) ||
        selectedAgents[0];
      return {
        agentId: fallbackAgent?.id || rawId,
        name:
          typeof item?.name === 'string' && item.name.trim()
            ? item.name.trim()
            : fallbackAgent?.name || 'Proposal Agent',
        content: typeof item?.content === 'string' ? item.content.trim() : '',
        skillName:
          typeof item?.skillName === 'string' && item.skillName.trim()
            ? item.skillName.trim()
            : fallbackAgent?.skills?.[0]?.name || '',
      };
    })
    .filter((item) => item.agentId && item.content);
}

export function sanitizeSeverity(input) {
  if (input === 'high' || input === 'medium' || input === 'low') return input;
  return 'medium';
}

export function sanitizeVerificationNotes(input, selectedAgents, draftSections) {
  if (!Array.isArray(input)) return [];
  const fallbackById = new Map(selectedAgents.map((agent) => [agent.id, agent]));
  const fallbackTarget = draftSections[0]?.title || '1. Proposal 背景';

  return input
    .slice(0, selectedAgents.length)
    .map((item, index) => {
      const rawAgentId = typeof item?.agentId === 'string' ? item.agentId.trim() : '';
      const fallbackAgent =
        fallbackById.get(rawAgentId) ||
        selectedAgents.find((agent) => agent.name === item?.agent) ||
        selectedAgents[index];
      const target =
        typeof item?.target === 'string' && item.target.trim() ? item.target.trim() : fallbackTarget;
      return {
        id:
          typeof item?.id === 'string' && item.id.trim()
            ? item.id.trim()
            : `note-${fallbackAgent?.id || index + 1}`,
        agentId: fallbackAgent?.id || rawAgentId || `agent-${index + 1}`,
        agent:
          typeof item?.agent === 'string' && item.agent.trim()
            ? item.agent.trim()
            : fallbackAgent?.name || 'Verification Agent',
        severity: sanitizeSeverity(item?.severity),
        target,
        thoughts: sanitizeStringList(item?.thoughts, 3),
        comment: typeof item?.comment === 'string' ? item.comment.trim() : '',
        suggestion: typeof item?.suggestion === 'string' ? item.suggestion.trim() : '',
      };
    })
    .filter((item) => item.comment && item.suggestion);
}
