## Purpose

建立前端完整工程基础，后续 Phase 1-7 的用户认证、房间管理、多轨编曲、AI 增强、实时协同等所有功能都在这个脚手架上开发。提供 Vite + React + TypeScript 构建、Tailwind CSS + shadcn/ui UI 框架、React Router 路由、Zustand 状态管理、统一 Axios 请求实例，确保后续功能开发有统一的前端架构模式。

## ADDED Requirements

### Requirement: Vite + React + TypeScript 脚手架
`frontend/` 目录 MUST 是一个可构建、可运行的 Vite + React 18 + TypeScript 项目。

#### Scenario: 前端工程文件存在
- **WHEN** 用户检查 `frontend/` 目录结构
- **THEN** 存在 `frontend/package.json`（name 为 `jam-box-frontend`，包含 `react@^18` 和 `react-dom` 依赖）
- **AND** 存在 `frontend/vite.config.ts`（TypeScript 配置的 Vite）
- **AND** 存在 `frontend/tsconfig.json` 和 `frontend/tsconfig.node.json`
- **AND** 存在 `frontend/index.html`（Vite 入口 HTML）
- **AND** 存在 `frontend/src/main.tsx`（React 入口文件）
- **AND** 存在 `frontend/src/App.tsx`（根组件）

#### Scenario: 前端可构建可运行
- **WHEN** 用户在 `frontend/` 目录执行 `npm run dev`
- **THEN** 开发服务器在 5173 端口启动
- **AND** 可通过 `http://localhost:5173` 访问

- **WHEN** 用户在 `frontend/` 目录执行 `npm run build`
- **THEN** 生产产物构建到 `dist/` 目录

### Requirement: Tailwind CSS + shadcn/ui
前端 MUST 配置 Tailwind CSS v3，可使用 shadcn/ui 组件库的组件。

#### Scenario: Tailwind CSS 可使用
- **WHEN** 用户在任意组件中使用 Tailwind utility class（如 `bg-blue-500 text-white p-4`）
- **THEN** 浏览器中正确渲染对应样式

#### Scenario: shadcn/ui 可添加组件
- **WHEN** 用户在 frontend 目录执行 `npx shadcn@latest add button`
- **THEN** 组件成功添加到 `src/components/ui/` 目录
- **AND** 可在任意页面中 import 使用

### Requirement: React Router 基础路由
前端 MUST 配置 React Router v6，至少包含 `/login`、`/register`、`/rooms` 三个基础路由（占位页面，后续 Phase 填充实际内容）。

#### Scenario: 路由可访问
- **WHEN** 用户访问 `http://localhost:5173/login`
- **THEN** 显示登录占位页面（包含"登录"文字）

- **WHEN** 用户访问 `http://localhost:5173/register`
- **THEN** 显示注册占位页面（包含"注册"文字）

- **WHEN** 用户访问 `http://localhost:5173/rooms`
- **THEN** 显示房间列表占位页面（包含"房间列表"文字）

- **WHEN** 用户访问根路径 `http://localhost:5173/`
- **THEN** 根据是否有 JWT token，自动重定向到 `/rooms` 或 `/login`

### Requirement: Zustand 状态管理
前端 MUST 配置 Zustand，提供基础 store 模板（user store 用于存储 JWT token 和当前用户信息）。

#### Scenario: user store 可读写
- **WHEN** React 组件调用 `useUserStore.getState()`
- **THEN** 返回初始状态（token: null, user: null）

- **WHEN** 后续 Phase 调用 `useUserStore.setState({ token: "xxx" })`
- **THEN** store 状态更新，依赖该状态的组件自动重渲染

### Requirement: 统一 Axios 请求实例
前端 MUST 配置统一的 Axios 实例（封装 baseURL、请求拦截器自动附带 JWT、响应拦截器统一错误处理）。

#### Scenario: Axios 实例附带 JWT
- **WHEN** 业务代码使用该 Axios 实例发请求
- **AND** Zustand user store 中有 JWT token
- **THEN** 请求头自动包含 `Authorization: Bearer <token>`

#### Scenario: 401 自动跳转登录
- **WHEN** 后端返回 401 状态码
- **THEN** 响应拦截器自动清除 Zustand 中的 token 和 user 信息
- **AND** 自动跳转到 `/login` 页面

#### Scenario: 统一响应解包
- **WHEN** 后端返回正常的 `{ code: 0, msg: "ok", data: <业务数据> }`
- **THEN** Axios 实例自动解包，业务代码直接拿到 `data` 字段的值

- **WHEN** 后端返回 `code !== 0` 的错误响应
- **THEN** Axios 实例自动抛出 Error 对象，message 为后端返回的 `msg` 字段

### Requirement: 前端环境变量配置
前端 MUST 通过 `.env` 文件配置后端 API 基础地址，默认值为 `http://localhost:3000/api/v1`。

#### Scenario: 环境变量可用
- **WHEN** 开发服务器启动
- **THEN** `import.meta.env.VITE_API_BASE_URL` 返回 `.env` 中配置的后端 API 地址