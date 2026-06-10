---
name: "release-gate-orchestrator"
description: "Use at the end of the Verification Layer to merge UAT, security/privacy, compatibility, performance/concurrency, and exception/empty-state verification outputs into one final Go, No-Go, or Needs Revision release decision with blocking items, deferred non-blockers, and code/test handoff."
---

# Release Gate Orchestrator

## 目的

合并 Verification Layer 的五类专项验收结论，输出最终上线判断，避免多个 agent 分别给出 Go / No-Go 后无人仲裁。

该 skill 负责回答：这个需求现在是否可以进入实现、提测或上线；如果不可以，哪些问题必须先修。

## 适用场景

- 五个 Verification Agent 已经输出验收包。
- PM 需要把专项检查合并成统一 release gate。
- UAT、安全、兼容性、性能、异常状态之间出现结论冲突。
- 需要给代码生成或测试生成 Agent 明确最终阻塞项和可延期项。

## 输入

- UAT 验收包
- 安全、隐私与合规验收包
- 兼容性与适配验收包
- 性能与并发验收包
- 异常流程与空状态验收包
- Proposal Pack 或 Scope Boundary
- 已有测试结果，若有

## 工作流程

1. 汇总每个专项 agent 的 Go / No-Go / Needs Revision 结论。
2. 识别阻塞项：安全隐私高风险、核心 UAT 不可测、关键环境不可用、性能超过阻塞标准、失败路径会导致用户无法恢复。
3. 识别可延期项：不影响核心业务闭环、不违反安全合规、不破坏目标环境稳定性的优化。
4. 解决冲突：如果任何高优阻塞项为 No-Go，最终不得输出 Go。
5. 输出最终上线门槛、必须修订项、可延期项和测试/代码生成交接。
6. 标注信息不足处和 PM 必须确认的问题。

## 输出格式

```md
## Final Release Gate

### 1. Verification Summary
| Area | Decision | Blocking? | Notes |
|---|---|---|---|
| UAT | Go / No-Go / Needs Revision | Yes / No | |
| Security / Privacy | Go / No-Go / Needs Revision | Yes / No | |
| Compatibility | Go / No-Go / Needs Revision | Yes / No | |
| Performance / Concurrency | Go / No-Go / Needs Revision | Yes / No | |
| Exception / Empty State | Go / No-Go / Needs Revision | Yes / No | |

### 2. Final Decision
- Decision: Go / No-Go / Needs Revision
- Reason:
- Confidence: High / Medium / Low

### 3. Blocking Items
- Blocker:
- Source verification area:
- Required fix:
- Owner:

### 4. Deferred Non-Blockers
- Item:
- Why safe to defer:
- Follow-up trigger:

### 5. Code / Test Handoff
- Required code changes:
- Required automated tests:
- Required manual checks:
- Forbidden implementation expansion:

### 6. PM Questions
- Question:
- Why it matters:
```

## 检查清单

- 是否合并了所有五类 Verification 输出。
- 是否明确最终 Go / No-Go / Needs Revision。
- 是否把阻塞项和可延期项分开。
- 是否遵守 Scope Boundary，不把新需求塞进修订项。
- 是否能直接交给代码生成、测试生成或人工提测流程。

## Guardrails

- 只要存在高优安全、隐私、核心 UAT 或不可恢复异常阻塞项，最终不得输出 Go。
- 不要用平均分或多数投票决定上线；上线 gate 必须由最高风险项约束。
- 不要把 scope 外的新功能当成上线前必须修复项，除非 PM 明确确认。
- 如果信息不足，输出 Needs Revision，并列出 PM Questions。
