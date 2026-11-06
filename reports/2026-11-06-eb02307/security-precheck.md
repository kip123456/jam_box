# 安全前置检查（security-precheck）

- 生成时间：2026-11-06 10:07:59
- 提交号：eb02307
- 测试数据库：backend/prisma/test.db（DATABASE_URL=file:./test.db，每轮重建）
- 运行命令：npm test（vitest run --config tests/vitest.config.ts）

## 接口清单

| 方法 | 路径 | 认证要求 | 输入校验 | 已覆盖错误码 |
| --- | --- | --- | --- | --- |
| GET | /health | 无（公开） | 无入参 | 200 / 500（CORS 拒绝） |
| GET | /api/v1/health | 无（公开） | 无入参 | 200 |
| GET | /api/v1/hello | 无（公开） | 无入参 | 200 |
| POST | /api/v1/jobs | 无（当前 bootstrap 阶段无鉴权路由） | zod submitJobSchema | 200 / 400 |
| GET | /api/v1/jobs/:id | 无（当前 bootstrap 阶段无鉴权路由） | zod jobIdSchema | 200 / 404 |
| * | 未匹配路径 | 无 | - | 404 |

## 身份与数据

- 身份：本阶段所有已实现接口均为公开接口，无登录态、无角色；AuthError → 401 的映射由单元用例 UNIT-06 单独覆盖，供后续接入鉴权中间件时复用。
- 数据：测试仅写入独立 SQLite（backend/prisma/test.db），每个用例前清空 Job 表；不接触生产库、不使用真实密钥。
- 接口级用例：14 条（正常 / 失败 / 边界均已覆盖）；全部用例：38 条。

## 用例三段式记录

### API-01 GET /health 返回统一格式且带安全响应头
- 级别 / 类型：接口 / 正常 / GET /health
- 前置条件：应用已组装（createApp），无需认证；请求带允许来源 Origin=http://localhost:5173
- 操作：GET /health
- 可观测结果与当前实际（期望）：HTTP 200；body={code:0,msg:'ok',data:{status:'UP'}}；存在 x-content-type-options: nosniff；access-control-allow-origin=http://localhost:5173
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；body={code:0,msg:'ok',data:{status:'UP'}}；存在 x-content-type-options: nosniff；access-control-allow-origin=http://localhost:5173）
- 判定：**PASS**（耗时 59.3ms）

### API-02 GET /api/v1/health 可访问（双挂载边界）
- 级别 / 类型：接口 / 边界 / GET /api/v1/health
- 前置条件：同一健康路由同时挂在 / 与 /api/v1 下
- 操作：GET /api/v1/health
- 可观测结果与当前实际（期望）：HTTP 200；body.code=0；body.data.status='UP'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；body.code=0；body.data.status='UP'）
- 判定：**PASS**（耗时 10.4ms）

### API-03 GET /api/v1/hello 返回统一响应格式
- 级别 / 类型：接口 / 正常 / GET /api/v1/hello
- 前置条件：应用已组装，无需认证
- 操作：GET /api/v1/hello
- 可观测结果与当前实际（期望）：HTTP 200；body={code:0,msg:'ok',data:'Hello from Jam Box backend'}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；body={code:0,msg:'ok',data:'Hello from Jam Box backend'}）
- 判定：**PASS**（耗时 6.2ms）

### API-04 GET /health 对未允许来源返回 CORS 错误（500 由中间件统一格式）
- 级别 / 类型：接口 / 失败 / GET /health
- 前置条件：请求头 Origin=http://evil.example.com（不在允许列表）
- 操作：GET /health
- 可观测结果与当前实际（期望）：HTTP 500；body={code:500,msg:'服务器内部错误',data:null}；无 access-control-allow-origin 响应头
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 500；body={code:500,msg:'服务器内部错误',data:null}；无 access-control-allow-origin 响应头）
- 判定：**PASS**（耗时 10.9ms）

### API-05 提交合法任务后落库，返回 pending 任务结构
- 级别 / 类型：接口 / 正常 / POST /api/v1/jobs
- 前置条件：测试库已迁移且 Job 表为空；body={type:'test',payload:{foo:'bar'}}
- 操作：POST /api/v1/jobs
- 可观测结果与当前实际（期望）：HTTP 200；data.status='pending'，retryCount=0，maxRetries=3，payload={foo:'bar'}，result=null，error=null；Job 表 count=1
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；data.status='pending'，retryCount=0，maxRetries=3，payload={foo:'bar'}，result=null，error=null；Job 表 count=1）
- 判定：**PASS**（耗时 163.1ms）

### API-06 payload 缺省时允许创建，payload 为 null（边界）
- 级别 / 类型：接口 / 边界 / POST /api/v1/jobs
- 前置条件：测试库为空；body 仅含 type:'test'
- 操作：POST /api/v1/jobs
- 可观测结果与当前实际（期望）：HTTP 200；data.status='pending'；data.payload=null
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；data.status='pending'；data.payload=null）
- 判定：**PASS**（耗时 45.1ms）

### API-07 缺少 type 返回 400 与具体校验信息
- 级别 / 类型：接口 / 失败 / POST /api/v1/jobs
- 前置条件：测试库为空；body={payload:{}}（缺少必填 type）
- 操作：POST /api/v1/jobs
- 可观测结果与当前实际（期望）：HTTP 400；code=400；msg 包含 'type'；data=null；Job 表 count=0
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；code=400；msg 包含 'type'；data=null；Job 表 count=0）
- 判定：**PASS**（耗时 35.1ms）

### API-08 type 为空字符串返回 400（边界）
- 级别 / 类型：接口 / 边界 / POST /api/v1/jobs
- 前置条件：测试库为空；body={type:''}
- 操作：POST /api/v1/jobs
- 可观测结果与当前实际（期望）：HTTP 400；code=400；msg 包含 'type'；Job 表 count=0
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；code=400；msg 包含 'type'；Job 表 count=0）
- 判定：**PASS**（耗时 15.5ms）

### API-09 请求体为非法 JSON 返回 400 而不是 500
- 级别 / 类型：接口 / 失败 / POST /api/v1/jobs
- 前置条件：Content-Type=application/json；body 为残缺 JSON '{"type":'
- 操作：POST /api/v1/jobs
- 可观测结果与当前实际（期望）：HTTP 400；body={code:400,msg:'请求体不是合法的 JSON',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；body={code:400,msg:'请求体不是合法的 JSON',data:null}）
- 判定：**PASS**（耗时 13.9ms）

### API-10 查询已存在任务返回完整结构
- 级别 / 类型：接口 / 正常 / GET /api/v1/jobs/:id
- 前置条件：先 POST 创建 type='test'、payload={n:1} 的任务
- 操作：GET /api/v1/jobs/<created.id>
- 可观测结果与当前实际（期望）：HTTP 200；data.id 与创建返回值相同；data.status='pending'；data.payload={n:1}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；data.id 与创建返回值相同；data.status='pending'；data.payload={n:1}）
- 判定：**PASS**（耗时 37ms）

### API-11 查询不存在的任务返回 404 且错误码匹配
- 级别 / 类型：接口 / 失败 / GET /api/v1/jobs/:id
- 前置条件：测试库为空；路径 id='not-exists-id'
- 操作：GET /api/v1/jobs/not-exists-id
- 可观测结果与当前实际（期望）：HTTP 404；body={code:404,msg:'任务不存在',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 404；body={code:404,msg:'任务不存在',data:null}）
- 判定：**PASS**（耗时 26.7ms）

### API-12 未匹配的 API 路由返回统一 404 JSON
- 级别 / 类型：接口 / 失败 / GET /api/v1/unknown-route
- 前置条件：应用无该路由
- 操作：GET /api/v1/unknown-route
- 可观测结果与当前实际（期望）：HTTP 404；body={code:404,msg:'接口不存在',data:null}；content-type 含 application/json
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 404；body={code:404,msg:'接口不存在',data:null}；content-type 含 application/json）
- 判定：**PASS**（耗时 14.7ms）

### API-13 POST /api/v1/jobs/ 空路径（尾斜杠）返回统一 404
- 级别 / 类型：接口 / 边界 / GET /api/v1/jobs/
- 前置条件：尾斜杠路径无 GET 处理器（仅 POST /）
- 操作：GET /api/v1/jobs/
- 可观测结果与当前实际（期望）：HTTP 404；body.code=404；data=null
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 404；body.code=404；data=null）
- 判定：**PASS**（耗时 11.2ms）

### API-14 CORS 预检请求返回 204 并允许 POST
- 级别 / 类型：接口 / 边界 / OPTIONS /api/v1/jobs
- 前置条件：Origin=http://localhost:5173；Access-Control-Request-Method=POST
- 操作：OPTIONS /api/v1/jobs
- 可观测结果与当前实际（期望）：HTTP 204；access-control-allow-origin=http://localhost:5173；access-control-allow-methods 包含 POST
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 204；access-control-allow-origin=http://localhost:5173；access-control-allow-methods 包含 POST）
- 判定：**PASS**（耗时 8ms）

### UNIT-12 合法配置通过并应用默认端口
- 级别 / 类型：单元 / 正常
- 前置条件：raw={DATABASE_URL:'file:./x.db',JWT_SECRET:'secret'}
- 操作：parseEnv(raw)
- 可观测结果与当前实际（期望）：success=true；BACKEND_PORT=3000；FRONTEND_PORT=5173；DATABASE_URL='file:./x.db'；JWT_SECRET='secret'
- 当前实际：断言全部成立，与本行期望一致（实测值：success=true；BACKEND_PORT=3000；FRONTEND_PORT=5173；DATABASE_URL='file:./x.db'；JWT_SECRET='secret'）
- 判定：**PASS**（耗时 4.5ms）

### UNIT-13 缺少 DATABASE_URL 失败并给出具体字段
- 级别 / 类型：单元 / 失败
- 前置条件：raw 仅含 JWT_SECRET
- 操作：parseEnv(raw)
- 可观测结果与当前实际（期望）：success=false；issues 路径包含 'DATABASE_URL'
- 当前实际：断言全部成立，与本行期望一致（实测值：success=false；issues 路径包含 'DATABASE_URL'）
- 判定：**PASS**（耗时 2.6ms）

### UNIT-14 缺少 JWT_SECRET 失败并给出具体字段
- 级别 / 类型：单元 / 失败
- 前置条件：raw 仅含 DATABASE_URL
- 操作：parseEnv(raw)
- 可观测结果与当前实际（期望）：success=false；issues 路径包含 'JWT_SECRET'
- 当前实际：断言全部成立，与本行期望一致（实测值：success=false；issues 路径包含 'JWT_SECRET'）
- 判定：**PASS**（耗时 0.7ms）

### UNIT-15 端口不是数字时失败（边界）
- 级别 / 类型：单元 / 边界
- 前置条件：raw 中 BACKEND_PORT='abc'
- 操作：parseEnv(raw)
- 可观测结果与当前实际（期望）：success=false
- 当前实际：断言全部成立，与本行期望一致（实测值：success=false）
- 判定：**PASS**（耗时 0.6ms）

### UNIT-05 BusinessError 404 映射为 HTTP 404 / code 404
- 级别 / 类型：单元 / 失败
- 前置条件：路由抛出 BusinessError('任务不存在',404)
- 操作：GET /business
- 可观测结果与当前实际（期望）：HTTP 404；body={code:404,msg:'任务不存在',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 404；body={code:404,msg:'任务不存在',data:null}）
- 判定：**PASS**（耗时 61.4ms）

### UNIT-06 AuthError 映射为 HTTP 401 / code 401
- 级别 / 类型：单元 / 失败
- 前置条件：路由抛出 AuthError
- 操作：GET /auth
- 可观测结果与当前实际（期望）：HTTP 401；body={code:401,msg:'未认证或登录已过期',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；body={code:401,msg:'未认证或登录已过期',data:null}）
- 判定：**PASS**（耗时 10.5ms）

### UNIT-07 ZodError 映射为 400 且带字段路径
- 级别 / 类型：单元 / 失败
- 前置条件：路由内 submitJobSchema.parse({}) 抛 ZodError
- 操作：GET /zod
- 可观测结果与当前实际（期望）：HTTP 400；code=400；msg 包含 'type'；data=null
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；code=400；msg 包含 'type'；data=null）
- 判定：**PASS**（耗时 11.4ms）

### UNIT-08 Prisma P2002 唯一约束冲突映射为 409
- 级别 / 类型：单元 / 失败
- 前置条件：路由抛 PrismaClientKnownRequestError(code=P2002)
- 操作：GET /prisma-unique
- 可观测结果与当前实际（期望）：HTTP 409；body={code:409,msg:'资源已存在（唯一约束冲突）',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 409；body={code:409,msg:'资源已存在（唯一约束冲突）',data:null}）
- 判定：**PASS**（耗时 6.6ms）

### UNIT-09 JSON 解析错误映射为 400
- 级别 / 类型：单元 / 失败
- 前置条件：路由抛带 body 的 SyntaxError（模拟 express.json 解析失败）
- 操作：GET /json-parse
- 可观测结果与当前实际（期望）：HTTP 400；body={code:400,msg:'请求体不是合法的 JSON',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；body={code:400,msg:'请求体不是合法的 JSON',data:null}）
- 判定：**PASS**（耗时 8.3ms）

### UNIT-10 依赖不可达（ECONNREFUSED）映射为 500 且不泄露堆栈
- 级别 / 类型：单元 / 失败
- 前置条件：路由抛 'connect ECONNREFUSED 127.0.0.1:5432'
- 操作：GET /dependency-down
- 可观测结果与当前实际（期望）：HTTP 500；body={code:500,msg:'服务器内部错误',data:null}；body 不含 'ECONNREFUSED' 与堆栈片段 'at '
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 500；body={code:500,msg:'服务器内部错误',data:null}；body 不含 'ECONNREFUSED' 与堆栈片段 'at '）
- 判定：**PASS**（耗时 6.7ms）

### UNIT-11 每次错误都会记录日志
- 级别 / 类型：单元 / 正常
- 前置条件：spy 包装 console.error
- 操作：GET /business
- 可观测结果与当前实际（期望）：console.error 至少被调用 1 次
- 当前实际：断言全部成立，与本行期望一致（实测值：console.error 至少被调用 1 次）
- 判定：**PASS**（耗时 5.2ms）

### UNIT-01 原始值被包装为 {code:0,msg:'ok',data}
- 级别 / 类型：单元 / 正常
- 前置条件：Express 应用挂载 responseMiddleware，路由 res.json('hello')
- 操作：GET /primitive
- 可观测结果与当前实际（期望）：HTTP 200；body={code:0,msg:'ok',data:'hello'}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；body={code:0,msg:'ok',data:'hello'}）
- 判定：**PASS**（耗时 58.2ms）

### UNIT-02 对象被包装，字段值不丢失
- 级别 / 类型：单元 / 正常
- 前置条件：路由返回 {value:42}
- 操作：GET /object
- 可观测结果与当前实际（期望）：body={code:0,msg:'ok',data:{value:42}}
- 当前实际：断言全部成立，与本行期望一致（实测值：body={code:0,msg:'ok',data:{value:42}}）
- 判定：**PASS**（耗时 9.6ms）

### UNIT-03 undefined 被归一化为 data:null
- 级别 / 类型：单元 / 边界
- 前置条件：路由调用 res.json(undefined)
- 操作：GET /undefined
- 可观测结果与当前实际（期望）：body={code:0,msg:'ok',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：body={code:0,msg:'ok',data:null}）
- 判定：**PASS**（耗时 6ms）

### UNIT-04 rawResponse 标记时跳过包装（供错误中间件使用）
- 级别 / 类型：单元 / 边界
- 前置条件：res.locals.rawResponse=true 后返回 {code:409,msg:'冲突',data:null}
- 操作：GET /raw
- 可观测结果与当前实际（期望）：HTTP 409；body 原样输出，无二次包装
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 409；body 原样输出，无二次包装）
- 判定：**PASS**（耗时 7.2ms）

### UNIT-16 合法 body 通过并保留 payload
- 级别 / 类型：单元 / 正常
- 前置条件：input={type:'test',payload:{foo:'bar'}}
- 操作：submitJobSchema.parse(input)
- 可观测结果与当前实际（期望）：type='test'；payload={foo:'bar'}
- 当前实际：断言全部成立，与本行期望一致（实测值：type='test'；payload={foo:'bar'}）
- 判定：**PASS**（耗时 8.4ms）

### UNIT-17 payload 可省略
- 级别 / 类型：单元 / 边界
- 前置条件：input={type:'test'}
- 操作：submitJobSchema.parse(input)
- 可观测结果与当前实际（期望）：type='test'；payload=undefined
- 当前实际：断言全部成立，与本行期望一致（实测值：type='test'；payload=undefined）
- 判定：**PASS**（耗时 0.8ms）

### UNIT-18 缺少 type 被拒绝
- 级别 / 类型：单元 / 失败
- 前置条件：input={}
- 操作：submitJobSchema.parse(input)
- 可观测结果与当前实际（期望）：抛出校验错误
- 当前实际：断言全部成立，与本行期望一致（实测值：抛出校验错误）
- 判定：**PASS**（耗时 2.5ms）

### UNIT-19 空字符串 type 被拒绝（边界）
- 级别 / 类型：单元 / 边界
- 前置条件：input={type:''}
- 操作：submitJobSchema.parse(input)
- 可观测结果与当前实际（期望）：抛出校验错误
- 当前实际：断言全部成立，与本行期望一致（实测值：抛出校验错误）
- 判定：**PASS**（耗时 0.8ms）

### UNIT-20 task id 为空被拒绝
- 级别 / 类型：单元 / 失败
- 前置条件：input={id:''}
- 操作：jobIdSchema.parse(input)
- 可观测结果与当前实际（期望）：抛出校验错误
- 当前实际：断言全部成立，与本行期望一致（实测值：抛出校验错误）
- 判定：**PASS**（耗时 1.2ms）

### UNIT-21 已注册 handler 执行成功后状态 pending → running → success 并写入结果
- 级别 / 类型：单元 / 状态流转
- 前置条件：注册 test:echo handler；Job type='test:echo'、payload={value:42}、status=pending
- 操作：runJob(job.id)
- 可观测结果与当前实际（期望）：status='success'；result={value:42}；retryCount=0；error=null；startedAt/completedAt 均非空
- 当前实际：断言全部成立，与本行期望一致（实测值：status='success'；result={value:42}；retryCount=0；error=null；startedAt/completedAt 均非空）
- 判定：**PASS**（耗时 68.5ms）

### UNIT-22 未注册类型直接标记 failed 并记录错误
- 级别 / 类型：单元 / 失败
- 前置条件：Job type='test:unregistered'，无对应 handler
- 操作：runJob(job.id)
- 可观测结果与当前实际（期望）：status='failed'；retryCount=0；error='未注册的任务类型: test:unregistered'；completedAt 非空
- 当前实际：断言全部成立，与本行期望一致（实测值：status='failed'；retryCount=0；error='未注册的任务类型: test:unregistered'；completedAt 非空）
- 判定：**PASS**（耗时 64.8ms）

### UNIT-23 重试次数耗尽后标记最终 failed
- 级别 / 类型：单元 / 状态流转
- 前置条件：test:always-fail handler 抛 Error('boom')；Job retryCount=3、maxRetries=3
- 操作：runJob(job.id)
- 可观测结果与当前实际（期望）：status='failed'；retryCount=3；error='boom'；completedAt 非空
- 当前实际：断言全部成立，与本行期望一致（实测值：status='failed'；retryCount=3；error='boom'；completedAt 非空）
- 判定：**PASS**（耗时 59.2ms）

### UNIT-24 并发重复领取同一任务时 handler 只执行一次
- 级别 / 类型：单元 / 并发
- 前置条件：注册 test:concurrent-once handler 计数；同一 pending Job
- 操作：Promise.all([runJob(id), runJob(id)])
- 可观测结果与当前实际（期望）：handler 调用次数=1；status='success'；result={ok:true}
- 当前实际：断言全部成立，与本行期望一致（实测值：handler 调用次数=1；status='success'；result={ok:true}）
- 判定：**PASS**（耗时 69.1ms）
