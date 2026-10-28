# Agent 指引

## 项目简介

「合奏盒子」—— 让音乐人实时在线合奏、协同编曲的 AI 增强平台。

用户使用流程见 `GOAL.md`，那是项目目前希望达到的最终形态。

## 项目结构

```
jam_box/
├── backend/          # 后端服务（API、协同、AI）
├── frontend/         # 前端应用
├── setup.sh          # 安装各服务依赖
├── start.sh          # 启动各服务 dev server
└── docker-compose.yml
```

## 快速启动

### 方式一：Docker 一键启动

```bash
docker compose up --build
```

访问 http://localhost:5173

### 方式二：本地开发

```bash
./setup.sh    # 安装各服务依赖
./start.sh    # 启动各服务 dev server
```

前端：http://localhost:5173
后端：http://localhost:3000