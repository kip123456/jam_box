# 合奏盒子 🎵

> 让音乐人实时在线合奏、协同编曲的 AI 增强平台

## 前置依赖

- Node.js ≥ 20 · npm ≥ 10
- Docker & Docker Compose

## 配置环境变量

```bash
cp .env.example .env
# 填入实际值（数据库连接、AI API Key 等）
```

## 方式一：Docker 一键启动

```bash
docker compose up --build
```

访问 http://localhost:5173

## 方式二：本地开发

```bash
./setup.sh    # 安装各服务依赖
./start.sh    # 启动各服务 dev server
```

访问 http://localhost:5173