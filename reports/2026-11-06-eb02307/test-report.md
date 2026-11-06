# 测试运行汇总（test-report）

| 项目 | 值 |
| --- | --- |
| 用例总数 | 38 |
| 通过 | 38 |
| 失败 | 0 |
| 跳过 | 0 |
| 运行时间 | 37.9s（2026-11-06 10:07:21 ~ 2026-11-06 10:07:59） |
| 提交号 | eb02307 |
| 是否留红 | 否 |
| 报告目录 | reports/2026-11-06-eb02307 |

## 失败用例与错误摘要

- 无

## 按级别统计

- 接口：14 条（通过 14，失败 0）
- 单元：24 条（通过 24，失败 0）

## 复现方式

```bash
npm install        # 根目录：安装测试依赖
cd backend && npm install && cd ..   # 后端依赖（含 prisma）
npm test           # 一条命令：迁移测试库 + 全部测试 + 生成报告
npm test -- --report-dir reports/custom   # 覆盖报告目录
```

## 用例明细

| ID | 级别 | 类型 | 用例 | 耗时(ms) | 判定 |
| --- | --- | --- | --- | --- | --- |
| API-01 | 接口 | 正常 | GET /health 返回统一格式且带安全响应头 | 59.3 | PASS |
| API-02 | 接口 | 边界 | GET /api/v1/health 可访问（双挂载边界） | 10.4 | PASS |
| API-03 | 接口 | 正常 | GET /api/v1/hello 返回统一响应格式 | 6.2 | PASS |
| API-04 | 接口 | 失败 | GET /health 对未允许来源返回 CORS 错误（500 由中间件统一格式） | 10.9 | PASS |
| API-05 | 接口 | 正常 | 提交合法任务后落库，返回 pending 任务结构 | 163.1 | PASS |
| API-06 | 接口 | 边界 | payload 缺省时允许创建，payload 为 null（边界） | 45.1 | PASS |
| API-07 | 接口 | 失败 | 缺少 type 返回 400 与具体校验信息 | 35.1 | PASS |
| API-08 | 接口 | 边界 | type 为空字符串返回 400（边界） | 15.5 | PASS |
| API-09 | 接口 | 失败 | 请求体为非法 JSON 返回 400 而不是 500 | 13.9 | PASS |
| API-10 | 接口 | 正常 | 查询已存在任务返回完整结构 | 37 | PASS |
| API-11 | 接口 | 失败 | 查询不存在的任务返回 404 且错误码匹配 | 26.7 | PASS |
| API-12 | 接口 | 失败 | 未匹配的 API 路由返回统一 404 JSON | 14.7 | PASS |
| API-13 | 接口 | 边界 | POST /api/v1/jobs/ 空路径（尾斜杠）返回统一 404 | 11.2 | PASS |
| API-14 | 接口 | 边界 | CORS 预检请求返回 204 并允许 POST | 8 | PASS |
| UNIT-12 | 单元 | 正常 | 合法配置通过并应用默认端口 | 4.5 | PASS |
| UNIT-13 | 单元 | 失败 | 缺少 DATABASE_URL 失败并给出具体字段 | 2.6 | PASS |
| UNIT-14 | 单元 | 失败 | 缺少 JWT_SECRET 失败并给出具体字段 | 0.7 | PASS |
| UNIT-15 | 单元 | 边界 | 端口不是数字时失败（边界） | 0.6 | PASS |
| UNIT-05 | 单元 | 失败 | BusinessError 404 映射为 HTTP 404 / code 404 | 61.4 | PASS |
| UNIT-06 | 单元 | 失败 | AuthError 映射为 HTTP 401 / code 401 | 10.5 | PASS |
| UNIT-07 | 单元 | 失败 | ZodError 映射为 400 且带字段路径 | 11.4 | PASS |
| UNIT-08 | 单元 | 失败 | Prisma P2002 唯一约束冲突映射为 409 | 6.6 | PASS |
| UNIT-09 | 单元 | 失败 | JSON 解析错误映射为 400 | 8.3 | PASS |
| UNIT-10 | 单元 | 失败 | 依赖不可达（ECONNREFUSED）映射为 500 且不泄露堆栈 | 6.7 | PASS |
| UNIT-11 | 单元 | 正常 | 每次错误都会记录日志 | 5.2 | PASS |
| UNIT-01 | 单元 | 正常 | 原始值被包装为 {code:0,msg:'ok',data} | 58.2 | PASS |
| UNIT-02 | 单元 | 正常 | 对象被包装，字段值不丢失 | 9.6 | PASS |
| UNIT-03 | 单元 | 边界 | undefined 被归一化为 data:null | 6 | PASS |
| UNIT-04 | 单元 | 边界 | rawResponse 标记时跳过包装（供错误中间件使用） | 7.2 | PASS |
| UNIT-16 | 单元 | 正常 | 合法 body 通过并保留 payload | 8.4 | PASS |
| UNIT-17 | 单元 | 边界 | payload 可省略 | 0.8 | PASS |
| UNIT-18 | 单元 | 失败 | 缺少 type 被拒绝 | 2.5 | PASS |
| UNIT-19 | 单元 | 边界 | 空字符串 type 被拒绝（边界） | 0.8 | PASS |
| UNIT-20 | 单元 | 失败 | task id 为空被拒绝 | 1.2 | PASS |
| UNIT-21 | 单元 | 状态流转 | 已注册 handler 执行成功后状态 pending → running → success 并写入结果 | 68.5 | PASS |
| UNIT-22 | 单元 | 失败 | 未注册类型直接标记 failed 并记录错误 | 64.8 | PASS |
| UNIT-23 | 单元 | 状态流转 | 重试次数耗尽后标记最终 failed | 59.2 | PASS |
| UNIT-24 | 单元 | 并发 | 并发重复领取同一任务时 handler 只执行一次 | 69.1 | PASS |
