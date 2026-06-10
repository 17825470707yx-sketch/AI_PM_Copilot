---
name: "verification-compatibility-adaptation"
description: "Use in the Verification Layer before release for pages, forms, modals, navigation, responsive layouts, mobile/tablet/browser support, accessibility, i18n, WebView, safe-area, polyfill, or Babel adaptation requirements."
---

# Verification Compatibility Adaptation Agent

## 目的

定义需求上线前必须满足的兼容性与适配标准，确保前端在目标设备、浏览器、屏幕尺寸、语言环境和交互方式下稳定可用。

该 skill 关注“用户能否在真实环境里正常使用”，而不是只在开发者电脑上看起来正常。

## 适用场景

- 新增页面、表单、弹窗、导航、复杂组件或移动端交互。
- 需求涉及多语言、国际化、响应式布局、移动端适配。
- 产品需要支持特定浏览器、系统版本、刘海屏、折叠屏或嵌入式 WebView。
- 需要指导 Agent 是否引入 Polyfill、Babel 降级、CSS Media Queries 或 i18n 语言包。

## 输入

- 页面/组件说明
- 设计稿或截图
- 目标设备和浏览器范围
- 用户语言和地区
- 前端技术栈
- 已知兼容性问题

## 工作流程

1. 明确目标适配范围：桌面端、移动端、平板、浏览器、系统版本。
2. 定义响应式断点：内容重排、侧栏折叠、表格处理、按钮换行。
3. 检查交互适配：触控目标、键盘导航、hover/tap 差异、输入法。
4. 检查视觉适配：文本溢出、长词、多语言、暗色/浅色、safe-area。
5. 判断技术处理：是否需要 Polyfill、Babel、i18n、懒加载、可访问性属性。
6. 生成兼容性验收矩阵。

## 输出格式

```md
## 兼容性与适配验收包

### 1. 目标环境
| 环境 | 最低要求 | 是否阻塞 |
|---|---|---|
| Desktop Chrome | latest-2 | 是 |
| iOS Safari | iOS 15+ | 是 |

### 2. 响应式断点
- 360px：
- 768px：
- 1024px：
- 1440px：

### 3. 组件适配要求
- 导航：
- 表单：
- 表格/列表：
- 弹窗：
- 右侧 Agent 面板：

### 4. 国际化与文本
- 是否需要 i18n key：
- 长文本处理：
- 中英文混排：

### 5. 技术实现建议
- CSS Media Queries：
- Polyfill：
- Babel 降级：
- ARIA / keyboard：

### 6. 测试建议
- Viewport 测试：
- 浏览器测试：
- 可访问性测试：

### 7. Go / No-Go
结论：Go / No-Go / Needs Revision
阻塞适配问题：
```

## 检查清单

- 移动端是否出现横向滚动。
- 固定侧栏、顶部栏、底部输入框是否遮挡内容。
- 表格、时间线、长 PRD 文本是否在窄屏下可读。
- 可点击区域是否至少 44px。
- 键盘 Tab 顺序是否符合视觉顺序。
- 多语言或长文本是否撑破按钮/卡片。
- 是否有必要的 aria-label 和 focus 状态。

## Guardrails

- 不要默认支持所有设备和浏览器，必须列出目标环境。
- 如果目标环境未知，先给最小默认矩阵，并标注需要 PM 或工程确认。
- 不要因为适配要求引入超出 Scope Boundary 的新页面或复杂重构。
