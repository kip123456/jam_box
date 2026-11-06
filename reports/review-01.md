# 交叉评审记录（review-01）

## 手段

以“读取源码差异 + 对照 tests/ 用例清单 + 实跑 npm test”三方交叉的方式评审，不依赖单一视角：
- 逐文件阅读 backend/src 下错误处理、路由、任务队列实现；
- 对照 `.trae/rules/test.md` 逐条核对用例类型（正常 / 失败 / 边界 / 并发 / 事务）；
- 执行 `npm test` 获取真实结果，并核对报告中的具体数值。

## 查了什么

1. 全局错误中间件映射：BusinessError / AuthError / ZodError / Prisma P2002 / JSON 解析 / 依赖不可达。
2. 未匹配路由统一 404 JSON，避免 Express 默认 HTML 泄露路由信息。
3. 任务队列原子领取（`updateMany` 条件更新）与重试最终态。
4. 认证实现：bcrypt cost 12、JWT payload 最小化、access/refresh 类型隔离、401 静默刷新与并发刷新锁。
5. 测试数据库隔离：独立 `backend/prisma/test.db`，每轮重建、每用例清表。
6. 敏感信息：仓库内是否存在硬编码密钥；.env 是否被忽略；响应是否回传 passwordHash。

## 判据

- 每个接口具备正常、失败、边界三类用例，且断言为具体状态码 / 字段值 / 条数；
- 失败路径覆盖参数非法、未认证/无权限、资源不存在、依赖不可达；
- 单条命令可复现；失败时退出码非零；
- 报告含可复跑的具体实际值，不出现“通过”“没问题”这类空断言。

## 结果

- 用例总数 261：通过 261、失败 0、跳过 0；耗时 188.7s；提交号 473b753。
- 失败用例：无
- 评审发现并已修复的问题：
  1. `express.json()` 解析非法 JSON 时原本落到 500，已改为 400 并补 API-09 / UNIT-09；
  2. 未匹配路由原本返回 Express 默认 404 HTML，已补统一 JSON 404 并补 API-12 / API-13；
  3. `worker.ts` 原先导入即启动，已用入口守卫 + 导出 `runJob` 使其可测，补 UNIT-21 ~ UNIT-24。
  4. 认证中间件所需的 `Request.user` 类型扩展最初放在独立 .d.ts，ts-node-dev 运行时不加载导致编译失败，已改为在 `middleware/auth.ts` 内 `declare global`，补后端 tsc 通过验证。
- 结论：全部用例通过，未留红。
