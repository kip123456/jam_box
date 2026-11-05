# Security Precheck — lesson-07

> 仓库：https://github.com/kip123456/jam_box.git  ·  提交：aad32ed  ·  日期：2026-11-05

## 接口清单

| 路径 | 方法 | 鉴权 | 说明 |
|------|------|------|------|
| `/health` | GET | 免认证 | 健康检查，返回依赖连通状态 |
| `/api/v1/hello` | GET | 免认证 | 示例路由 |

## 身份与数据

当前骨架阶段尚无用户体系与持久化数据。所有接口返回统一格式 `{ code, msg, data }`，未发现明文敏感字段出现在任何响应中。

## 用例记录（前置 / 操作 / 可观测结果 & 当前实际）

### TC-SEC-001 健康检查免认证可访问
- **前置条件**：后端服务已启动（docker compose up）
- **操作**：`curl -s http://localhost:3000/health`
- **可观测结果与当前实际**：HTTP 200，响应体 `{"code":0,"msg":"ok","data":{"status":"UP"}}`，无 401 或跳转。**判定：通过**

### TC-SEC-002 /health 不接受无效 token 仍正常返回
- **前置条件**：后端服务已启动
- **操作**：`curl -s -H "Authorization: Bearer invalid_token" http://localhost:3000/health -o /dev/null -w "%{http_code}"`
- **可观测结果与当前实际**：HTTP 200（不强制鉴权）。**判定：通过**

### TC-SEC-003 密钥明文全仓库扫描
- **前置条件**：本地完整 git 历史
- **操作**：`git log --all -p | grep -iE '(sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}|AKIA[A-Z0-9]{16}|AIza[0-9A-Za-z\-_]{35})'`
- **可观测结果与当前实际**：输出为空，未检出任何疑似密钥字符串。**判定：通过**

### TC-SEC-004 .env.example 覆盖全部变量且无真实值
- **前置条件**：仓库根目录存在 `.env.example`
- **操作**：读取 `.env.example`
- **可观测结果与当前实际**：包含 `BACKEND_PORT=3000`、`FRONTEND_PORT=5173`，值为占位/默认值，无真实 API Key 或 Secret。**判定：通过**

### TC-SEC-005 /api/v1/hello 响应结构合规
- **前置条件**：后端服务已启动
- **操作**：`curl -s http://localhost:3000/api/v1/hello`
- **可观测结果与当前实际**：HTTP 200，响应体 `{"code":0,"msg":"ok","data":"Hello from Jam Box backend"}`。**判定：通过**

### TC-SEC-006 OpenSpec --strict 校验
- **前置条件**：仓库 openspec 目录完整
- **操作**：`openspec validate --all --strict`
- **可观测结果与当前实际**：`Totals: 9 passed 0 failed (9 items)`，全部 change + spec 通过。**判定：通过**