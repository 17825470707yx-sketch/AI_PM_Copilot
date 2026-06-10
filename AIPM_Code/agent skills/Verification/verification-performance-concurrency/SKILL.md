---
name: "verification-performance-concurrency"
description: "Use in the Verification Layer when a feature has page load, API latency, data volume, QPS, concurrency, uploads, exports, search, reporting, caching, queue, pagination, database index, rate limit, monitoring, or stability requirements before release."
---

# Verification Performance Concurrency Agent

## 目的

定义需求上线前必须满足的性能、并发和稳定性底线，并判断是否需要缓存、异步队列、分页、连接池、限流等工程策略。

该 skill 负责回答：这个功能在真实流量和真实数据规模下能不能扛住。

## 适用场景

- 新增高频页面、列表、搜索、推荐、导出、上传、登录注册、数据报表。
- 需求涉及大数据量、高并发、秒杀、大促、批量处理或慢查询风险。
- 需要明确首屏加载时间、接口耗时、QPS、错误率等上线指标。
- 需要指导代码生成 Agent 是否加入 Redis、MQ、分页、缓存、连接池优化。

## 输入

- 功能路径和用户流程
- API 列表
- 数据规模估计
- 目标并发量
- 页面性能目标
- 后端架构或技术栈
- 已有监控或压测结果，若有

## 工作流程

1. 标出性能关键路径：首屏、核心 API、数据库查询、外部服务调用。
2. 定义性能预算：加载时间、响应时间、包体大小、错误率。
3. 判断并发风险：QPS、峰值流量、写入冲突、重复提交、队列积压。
4. 给出架构策略：缓存、异步削峰、分页、索引、连接池、限流、重试。
5. 生成压测与监控建议。
6. 给出 Go / No-Go 判断。

## 输出格式

```md
## 性能与并发验收包

### 1. 性能关键路径
- 页面：
- API：
- 数据库：
- 第三方服务：

### 2. 性能预算
| 指标 | 目标 | 阻塞标准 |
|---|---|---|
| 首屏加载 | < 1.5s | > 3s 阻塞 |
| API P95 | < 300ms | > 800ms 阻塞 |

### 3. 并发要求
- 预期 QPS：
- 峰值 QPS：
- 写入冲突：
- 限流策略：

### 4. 架构与代码建议
- Redis：
- MQ：
- 分页/懒加载：
- 数据库索引：
- 连接池：
- 重试/熔断：

### 5. 测试与监控
- 压测脚本：
- 前端性能采集：
- 后端监控：
- 告警阈值：

### 6. Go / No-Go
结论：Go / No-Go / Needs Revision
性能阻塞项：
```

## 检查清单

- 页面是否一次性加载过多数据。
- API 是否支持分页、过滤和服务端排序。
- 是否存在重复请求、重复提交或轮询过快。
- 慢查询是否需要索引。
- 导出/上传/批处理是否需要异步任务。
- 高并发写入是否需要幂等键或锁。
- 是否有超时、重试、限流和监控。

## Guardrails

- 不要默认引入 Redis、MQ 或复杂架构，除非性能风险和流量假设支持。
- 如果缺少数据规模或 QPS，必须标注假设区间和需要验证的压测目标。
- 性能建议必须区分 `必须实现`、`建议实现` 和 `暂不需要`。
