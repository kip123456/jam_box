# Risk Authz — lesson-07

> 提交：aad32ed  ·  日期：2026-11-05  ·  骨架阶段

## 说明

当前仓库为骨架阶段（skeleton tag），用户鉴权中间件、受保护路由、权限判定逻辑尚未实现。以下条目基于 OpenSpec `user-authentication` change 与已有骨架接口的客观状态记录。

## 复测命令（原样可再跑）

```bash
# 1. 健康检查免认证
curl -s -w "\nHTTP %{http_code}\n" http://localhost:3000/health

# 2. /api/v1/hello 免认证
curl -s -w "\nHTTP %{http_code}\n" http://localhost:3000/api/v1/hello

# 3. 带无效 token 访问 /health
curl -s -w "\nHTTP %{http_code}\n" \
  -H "Authorization: Bearer bad-token" \
  http://localhost:3000/health

# 4. 密钥明文扫描（全历史）
git log --all -p | grep -iE 'sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}|AKIA[A-Z0-9]{16}|AIza[0-9A-Za-z\-_]{35}'

# 5. OpenSpec 规约严格校验
openspec validate --all --strict

# 6. 查看骨架接口列表
grep -E 'app\.(get|post|put|delete|patch)' backend/src/index.ts
```

## 权限类用例展开

| 用例 | 复测命令 | 期望 | 实际 | 判定 |
|------|----------|------|------|------|
| 健康检查免认证 | `curl http://localhost:3000/health` | HTTP 200 | HTTP 200, `{"code":0,"msg":"ok","data":{"status":"UP"}}` | ✅ 通过 |
| 无效 token 不阻断 /health | `curl -H "Authorization: Bearer bad-token" http://localhost:3000/health` | HTTP 200（该路由免认证） | HTTP 200 | ✅ 通过 |
| /api/v1/hello 免认证 | `curl http://localhost:3000/api/v1/hello` | HTTP 200 | HTTP 200, `{"code":0,"msg":"ok","data":"Hello from Jam Box backend"}` | ✅ 通过 |
| 鉴权中间件强制挂载 | — 尚未实现 — | 后续 user-authentication change 实现后验证 | 当前不存在 | ⏸ 待实现 |
| JWT_SECRET 缺失启动失败 | — 尚未实现 — | 后续实现后验证 | 当前不存在 | ⏸ 待实现 |
| 受保护路由拒绝匿名 | — 尚未实现 — | 后续实现后验证 | 当前不存在 | ⏸ 待实现 |
| 权限边界（房主/成员/访客） | — 尚未实现 — | 后续 room-management change 实现后验证 | 当前不存在 | ⏸ 待实现 |