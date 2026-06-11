# AI_PM_Copilot

## 1. 项目简介

AI_PM_Copilot 是一个面向 AI Product Manager 工作流的本地原型系统。项目通过流程图式界面串联需求澄清、Proposal 讨论、PRD 生成与版本升级、Verification 审查、GitHub 仓库导入以及基于 PRD 的代码实现建议等步骤，帮助用户把模糊想法逐步沉淀为可执行的产品需求文档。

项目采用前后端分离结构：

- 前端：React + TypeScript + Vite，负责流程图交互、表单输入、结果展示和用户操作。
- 后端：Node.js 原生 HTTP 服务，作为本地 API Proxy，负责读取环境配置、调用火山方舟大模型、读取/更新 PRD 文件、调用 GitHub API 和承接前端接口。
- PRD 模板：项目运行时会自动向上查找 `prd/prd_template_base.yaml`，用于创建和升级 PRD 文件。

## 2. 依赖环境

建议使用以下环境运行：

- Node.js 18 或以上版本
- npm 9 或以上版本
- 可访问火山方舟 Ark Chat Completions API 的账号
- 可选：GitHub Token，用于提高 GitHub API 请求额度或访问需要鉴权的仓库信息

主要技术依赖：

- 前端：React 19、Vite 7、TypeScript、@xyflow/react
- 后端：Node.js ESM、js-yaml
- 外部服务：火山方舟 Ark API、GitHub API

## 3. 启动步骤

### 3.1 安装依赖

分别进入前端和后端目录安装依赖：

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 3.2 配置环境变量

后端环境变量配置文件位于：

```text
backend/.env.local
```

如果本地没有该文件，可以复制模板：

```bash
cd backend
cp .env.example .env.local
```

然后在 `backend/.env.local` 中填写本机运行所需配置。密钥类配置只保存在本地，不提交到仓库。

### 3.3 启动后端服务

```bash
cd backend
npm run dev
```

本地后端服务地址：

```text
http://127.0.0.1:8787
```

健康检查接口：

```text
GET http://127.0.0.1:8787/api/ark/health
```

### 3.4 启动前端服务

另开一个终端：

```bash
cd frontend
npm run dev
```

本地前端访问地址：

```text
http://127.0.0.1:5173
```

前端开发服务器已在 `frontend/vite.config.ts` 中配置 `/api` 代理，会把前端接口请求转发到后端本地 Proxy。

## 4. 目录结构

```text
flowchart/
├── backend/
│   ├── controllers/
│   │   ├── clarification.mjs       # 需求澄清、需求优化相关控制器
│   │   └── proposal.mjs            # Proposal 讨论、Verification 审查相关控制器
│   ├── prompts/
│   │   ├── clarifier.mjs           # 澄清 Agent Prompt
│   │   ├── proposalAgent.mjs       # Proposal / Verification Agent Prompt
│   │   └── skillLoader.mjs         # Skill Prompt 加载逻辑
│   ├── routes/
│   │   └── api.mjs                 # 后端 API 路由入口
│   ├── services/
│   │   ├── arkLlm.mjs              # Ark API 配置读取与模型调用
│   │   ├── fileSystem.mjs          # GitHub 导入、项目文件扫描、PRD 写入
│   │   └── orchestrator.mjs        # Agent 编排服务
│   ├── utils/
│   │   ├── formatters.mjs          # 文本格式化工具
│   │   ├── jsonParser.mjs          # JSON 解析与 README 解码工具
│   │   ├── pathHelper.mjs          # PRD 目录自动定位
│   │   └── yamlHelper.mjs          # YAML / PRD 版本升级工具
│   ├── .env.example                # 环境变量模板
│   ├── .env.local                  # 本地真实配置，不建议提交
│   ├── index.mjs                   # 后端服务入口
│   └── package.json
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── App.tsx                 # 前端主应用与工作流页面
│   │   ├── App.css                 # 主样式
│   │   ├── index.css               # 全局样式
│   │   ├── main.tsx                # React 入口
│   │   └── skillRegistry.ts        # 前端 Agent Skill 注册信息
│   ├── vite.config.ts              # Vite 配置与 API 代理
│   └── package.json
└── README.md
```

关联的 PRD 模板目录位于项目上级 `AIPM_Code/prd/`：

```text
AIPM_Code/prd/
└── prd_template_base.yaml
```

后端会通过 `backend/utils/pathHelper.mjs` 自动向上查找该模板文件。

## 5. 配置说明

环境变量统一配置在：

```text
backend/.env.local
```

配置项说明：

| 配置项 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `ARK_API_BASE` | 否 | `https://ark.cn-beijing.volces.com/api/v3` | 火山方舟 Ark API Base URL |
| `ARK_MODEL` | 是 | 无 | 火山方舟模型或 endpoint id |
| `ARK_API_KEY` | 是 | 无 | 火山方舟鉴权密钥，仅本地配置 |
| `ARK_PROXY_PORT` | 否 | `8787` | Node.js 本地 Proxy 服务端口 |
| `ARK_PROXY_HOST` | 否 | `0.0.0.0` | Node.js 本地 Proxy 监听地址 |
| `CORS_ORIGIN` | 否 | 请求来源或 `http://localhost:5173` | CORS 允许来源，开发环境可设置为 `*` |
| `GITHUB_API_BASE` | 否 | `https://api.github.com` | GitHub API 地址 |
| `GITHUB_TOKEN` | 否 | 无 | GitHub 鉴权令牌，仅本地配置 |
| `AI_LAYER_BASE` | 否 | `http://127.0.0.1:8000` | 预留的 AI Layer 转发地址 |
| `VITE_PORT` | 否 | `5173` | 前端开发服务器端口 |

示例：

```env
ARK_PROXY_PORT=8787
ARK_PROXY_HOST=0.0.0.0
ARK_API_BASE=https://ark.cn-beijing.volces.com/api/v3
ARK_MODEL=your-endpoint-id
ARK_API_KEY=
GITHUB_API_BASE=https://api.github.com
GITHUB_TOKEN=
CORS_ORIGIN=*
AI_LAYER_BASE=http://127.0.0.1:8000
VITE_PORT=5173
```

## 6. 本地密钥配置位置

火山方舟鉴权密钥配置在：

```text
backend/.env.local
```

对应字段：

```env
ARK_API_KEY=
```

模型 endpoint 或模型名配置在：

```env
ARK_MODEL=your-endpoint-id
```

GitHub Token 如需配置，也放在同一个文件：

```env
GITHUB_TOKEN=
```

注意：`backend/.env.local` 只用于本机运行，不提交到 Git。提交项目时请提交 `backend/.env.example` 作为配置模板，并让运行者在自己的本地环境填写密钥。

## 7. 主要后端接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/ark/health` | 检查 Ark 模型与本地鉴权配置是否已就绪 |
| `POST` | `/api/project/create` | 根据 PRD 模板创建项目 PRD 文件 |
| `POST` | `/api/repo/import` | 导入 GitHub 仓库基础信息 |
| `POST` | `/api/clarification/chat` | 需求澄清对话 |
| `POST` | `/api/requirement-refiner/chat` | 一句话需求优化 |
| `POST` | `/api/proposal/discuss` | Proposal 多 Agent 讨论 |
| `POST` | `/api/proposal/facilitator-upgrade` | 汇总讨论并升级 PRD |
| `POST` | `/api/verification/review` | Verification 审查 |
| `POST` | `/api/verification/reply` | 针对 Verification 批注继续讨论 |
| `POST` | `/api/prd/update-repository-goal` | 将仓库目标写入 PRD 新版本 |
| `POST` | `/api/prd/upgrade-version` | 根据澄清内容升级 PRD 版本 |
| `POST` | `/api/implement/code` | 根据 PRD 和源码上下文生成代码修改结果 |

