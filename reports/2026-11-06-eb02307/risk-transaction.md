# 事务风险用例（risk-transaction）

## TX-01 任务创建单行写入一致性
- 前置条件：Job 表为空；body={type:'test',payload:{foo:'bar'}}。
- 操作：POST /api/v1/jobs。
- 可观测结果与当前实际：期望返回 status='pending'、retryCount=0、maxRetries=3，且 Job 表 count 恰为 1；当前实际见 API-05 判定。
- 复测命令：npx vitest run --config tests/vitest.config.ts jobs.test.ts -t "提交合法任务后落库，返回 pending 任务结构"

## TX-02 校验失败不产生脏数据
- 前置条件：Job 表为空；body={payload:{}}（缺少 type）。
- 操作：POST /api/v1/jobs。
- 可观测结果与当前实际：期望 HTTP 400 且 Job 表 count=0；当前实际见 API-07 判定。
- 复测命令：npx vitest run --config tests/vitest.config.ts jobs.test.ts -t "缺少 type 返回 400 与具体校验信息"

## TX-03 状态流转最终态唯一
- 前置条件：Job retryCount=3、maxRetries=3，处理器持续抛错。
- 操作：runJob(id)。
- 可观测结果与当前实际：期望最终 status='failed'、retryCount=3、error='boom'，不会同时出现 success；当前实际见 UNIT-23 判定。
- 复测命令：npx vitest run --config tests/vitest.config.ts worker.test.ts -t "重试次数耗尽后标记最终 failed"

## 结论

- 当前数据模型为单表 Job，无跨表事务；本次以“落库条数 / 失败不落库 / 最终态唯一”三项作为一致性证据，均通过。
