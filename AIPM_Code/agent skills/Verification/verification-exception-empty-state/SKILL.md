---
name: "verification-exception-empty-state"
description: "Use in the Verification Layer when a feature needs release-grade loading, empty, error, timeout, unauthorized, partial success, retry, rollback, preserved input, fallback UI, non-200 HTTP handling, or robust failure-path tests."
---

# Verification Exception Empty State Agent

## 目的

系统化设计异常流程、空状态、加载状态和失败兜底，确保 Agent 生成的代码不是只覆盖 Happy Path，而是在真实使用环境中足够健壮。

该 skill 负责回答：当事情不顺利时，用户还能不能理解、恢复和继续。

## 适用场景

- 新增页面、表单、列表、上传、登录、支付、导出、AI 生成等异步流程。
- API 可能失败、超时、返回空数据或权限不足。
- 需要明确前端 Toast、空状态、错误页、重试按钮、保留用户输入等细节。
- 需要指导 Agent 在何处添加 try-catch、HTTP 非 200 处理、兜底 UI 和测试。

## 输入

- 用户流程
- API 状态码和错误码
- 页面状态
- 表单字段
- 权限规则
- 网络和服务端失败场景
- 当前代码或实现计划

## 工作流程

1. 枚举状态：loading、empty、success、partial success、error、timeout、unauthorized。
2. 为每个状态定义 UI、文案、用户下一步动作。
3. 定义错误处理逻辑：try-catch、HTTP 非 200、重试、回滚、保留输入。
4. 识别不可恢复错误和可恢复错误。
5. 生成异常状态矩阵和测试建议。
6. 给出是否阻塞上线。

## 输出格式

```md
## 异常流程与空状态验收包

### 1. 状态矩阵
| 场景 | UI 表现 | 文案 | 用户动作 | 是否阻塞 |
|---|---|---|---|---|
| Loading | Skeleton | 正在加载 | 等待 | 否 |
| Empty | 空状态说明 | 暂无数据 | 创建/刷新 | 否 |
| 401 | 登录提示 | 请重新登录 | 跳转登录 | 是 |

### 2. 错误处理逻辑
- try-catch 位置：
- HTTP 非 200：
- 超时：
- 重试：
- 输入保留：
- 回滚：

### 3. 前端兜底 UI
- Toast：
- Inline error：
- Empty state：
- Error boundary：
- Retry CTA：

### 4. 测试建议
- 单元测试：
- E2E 测试：
- Mock API 状态：

### 5. Go / No-Go
结论：Go / No-Go / Needs Revision
异常阻塞项：
```

## 检查清单

- 页面是否有 loading 状态，而不是空白等待。
- 数据为空是否有清楚解释和下一步 CTA。
- 网络失败是否可重试。
- 表单提交失败是否保留用户输入。
- 401/403/404/500 是否有不同处理。
- AI 生成失败是否允许重新生成或降级为人工输入。
- 长任务是否显示进度、暂停或恢复。
- 错误文案是否能被用户理解，而不是只显示技术异常。

## Guardrails

- 不要只覆盖 Happy Path，必须至少覆盖 loading、empty、error 和 unauthorized。
- 不要把所有失败都写成同一个 Toast；不同失败原因要有不同恢复路径。
- 如果错误码未知，必须输出需要后端或测试确认的错误状态清单。
