---
name: "scope-boundary"
description: "Use in the Proposal Layer before design, task decomposition, or code generation to define In-Scope, Out-of-Scope, Non-Goals, implementation depth, allowed/forbidden modules, PM confirmation points, and anti-hallucination guardrails."
---

# Scope Boundary Agent

## 目的

清晰界定本次需求覆盖的具体功能范围、做到什么程度为止，以及哪些内容明确不做。

这是 Proposal Layer 中最高优先级的防幻觉 Agent。它通过明确告诉 AI “要做什么、做到哪里、不要做什么”，防止代码生成阶段因为上下文联想过度而产生冗余代码、错误模块改动和过重实现。

## 适用场景

- PRD 即将进入原型、代码生成或任务拆解。
- 需求容易被 Agent 过度扩展。
- 需求涉及现有仓库，需要限制修改范围。
- PM 需要明确 MVP、延期项和非目标。

## 输入

- 产品目标
- 待解决问题清单
- 用户场景
- 已有产品/代码上下文
- 约束条件
- 业务优先级

## 工作流程

1. 从问题清单中提取本期必须解决的问题。
2. 定义 In-Scope：功能、页面、接口、数据字段、用户路径。
3. 定义 Out-of-Scope：明确不做的功能、模块、技术、扩展能力。
4. 定义做到什么程度为止：MVP depth、非完美但可验收边界。
5. 写出 Anti-Hallucination Guardrails。
6. 标记代码生成禁止事项。

## 输出格式

```md
## Scope Boundary

### 1. In-Scope
- 本期必须做：
- 页面/模块：
- API/数据：
- 用户路径：
- 验收深度：

### 2. Out-of-Scope
- 本期不做：
- 不修改：
- 不新增：
- 不引入：

### 3. Non-Goals
- 非目标 1:
- 非目标 2:

### 4. Implementation Depth
- MVP:
- Later:
- Explicitly forbidden:

### 5. Anti-Hallucination Guardrails
- Agent 不得新增 PRD 未要求的功能。
- Agent 不得修改未列入 In-Scope 的模块。
- Agent 不得推断不存在的业务规则。
- Agent 不得引入未经确认的新依赖、新数据库表或新权限模型。

### 6. Code Generation Constraints
- Allowed files/modules:
- Forbidden files/modules:
- Required confirmation before change:
```

## 检查清单

- In-Scope 是否具体到页面、接口、数据或用户路径。
- Out-of-Scope 是否足够明确，能阻止 Agent 发散。
- 是否说明做到什么程度为止。
- 是否有代码生成禁止事项。
- 是否能直接交给后续 Flow & Interaction Blueprint Agent 使用。

## Guardrails

- 不要写泛泛的“优化体验”。
- 不要把竞品方案自动加入 scope。
- 不要让技术架构建议覆盖产品边界。
- 每个 In-Scope 项必须对应至少一个待解决问题。
- 如果某项无法判断是否进入本期，放入 `Required confirmation before change`，不要默认为 In-Scope。
