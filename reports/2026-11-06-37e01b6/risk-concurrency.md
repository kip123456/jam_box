# 并发风险用例（risk-concurrency）

## CC-01 同一任务被并发领取只执行一次
- 前置条件：注册 test:concurrent-once 处理器并对调用计数；创建 1 条 status=pending 的 Job。
- 操作：Promise.all([runJob(id), runJob(id)])，两个并发调用同时尝试领取同一任务。
- 实现约束：领取使用 `updateMany({where:{id,status:'pending'}})` 条件更新，只有 count=1 的调用继续执行。
- 可观测结果与当前实际：期望 handler 调用次数=1、最终 status='success'、result={ok:true}；当前实际见 UNIT-24 判定。
- 复测命令：npx vitest run --config tests/vitest.config.ts worker.test.ts -t "并发重复领取同一任务时 handler 只执行一次"

## 结论

- 并发用例 1 条，失败 0 条；原子领取逻辑在当前 SQLite 单连接测试下复现通过。
