---
alwaysApply: false
description: 涉及部署相关的信息，比如额外的依赖的时候
---

- 改动后必须保持 README 中的启动方式始终可用 — `docker compose up --build` 和 `./setup.sh` + `./start.sh` 两条路径，任何改动不得让其中一条失效
- 有状态服务必须用 volume 持久化 — 数据库、缓存、向量索引等所有需要持久化的数据，必须在 compose 中声明 volumes 挂载到宿主机目录，禁止数据随容器销毁
- Dockerfile 必须使用多阶段构建，最终运行时镜像不包含源码、devDependencies 和构建工具
- 容器必须以非 root 用户运行，Dockerfile 中创建专用用户（如 `appuser`）并通过 `USER` 切换
- 所有运行中的服务必须配置健康检查（实现 /health 端点返回 200），不健康时自动重启
- 日志统一输出到 stdout / stderr，禁止容器内写日志文件，由宿主机（Docker 驱动 / 编排平台）收集
- 必须提供 `.dockerignore`，排除 node_modules、.git、.env、dist 等不需要进入镜像的文件