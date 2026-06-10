---
name: "verification-uat-acceptance"
description: "Use in the Verification Layer after a proposal or PRD is confirmed to convert PM requirements, user stories, business paths, and design/code changes into UAT Given-When-Then cases, happy paths, launch criteria, test mapping, and Go/No-Go readiness."
---

# Verification UAT Acceptance Agent

## 目的

将 PM 的业务需求转成可验收、可测试、可追溯的 UAT 标准，确保 Agent 生成的代码不仅能运行，而且符合业务意图。

该 skill 是 Verification Layer 的入口，负责定义“什么结果才算做对了”。

## 适用场景

- PM 已经给出 PRD、用户故事、功能说明或产品目标。
- 需求即将进入代码生成、测试生成或提测前验收。
- 需要把自然语言需求转成 `Given-When-Then` 验收用例。
- 需要判断当前实现是否达到准许上线标准。

## 输入

- 产品目标
- 用户故事或 PRD 片段
- 核心用户路径
- 业务成功标准
- 当前设计/原型/代码变更说明
- 已有测试结果，若有

## 工作流程

1. 提取核心业务闭环：用户是谁、做什么、为什么、完成后业务状态如何变化。
2. 识别 Happy Path：优先覆盖最重要、最常用、最能证明价值的正向路径。
3. 补充关键边界：登录状态、权限、数据存在性、状态切换、重复提交等。
4. 生成 `Given-When-Then` UAT 用例。
5. 标注每条 UAT 可转成哪类测试：单元测试、集成测试、E2E 测试、人工验收。
6. 给出 Go / No-Go 判断。

## 输出格式

```md
## UAT 验收包

### 1. 业务闭环
- 用户：
- 目标：
- 关键动作：
- 成功后的业务状态：

### 2. Happy Path
#### UAT-01: [用例名称]
Given ...
When ...
Then ...
And ...

测试映射：
- 推荐测试类型：
- 目标文件/模块：
- 自动化优先级：High / Medium / Low

### 3. 边界验收
- 权限：
- 数据为空：
- 重复提交：
- 状态刷新：

### 4. 准许上线标准
- 必须通过：
- 可延期：
- 阻塞项：

### 5. Go / No-Go
结论：Go / No-Go / Needs Revision
理由：
```

## 检查清单

- 每条 UAT 是否能被测试代码或人工验收复现。
- 是否覆盖最核心的用户价值，而不只是 UI 是否出现。
- 是否避免用“体验更好”“更加智能”等不可测试表述。
- 是否明确哪些结果是上线阻塞项。
- 是否能翻译成 Jest、Playwright、Cypress、JUnit 等测试。

## Guardrails

- 每条 UAT 必须引用它验证的 In-Scope 项。
- 不要把未确认的新需求写进验收标准。
- 如果缺少业务成功标准，输出 `Needs PM decision`，不要自行设定上线门槛。
