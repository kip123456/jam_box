# 安全前置检查（security-precheck）

- 生成时间：2026-11-06 22:18:39
- 提交号：1bdf6f7
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
| POST | /api/v1/auth/register | 无（公开） | zod registerSchema | 200 / 400 / 409 |
| POST | /api/v1/auth/login | 无（公开） | zod loginSchema | 200 / 400 / 401 |
| POST | /api/v1/auth/refresh | 需 refresh token（body 或 Bearer） | zod refreshSchema + JWT type 校验 | 200 / 401 |
| GET | /api/v1/auth/me | 需 access token（Bearer） | JWT 签名 / 有效期 / type 校验 | 200 / 401 |
| POST | /api/v1/rooms | 需 access token（Bearer） | zod createRoomSchema（name 1-50、私有密码 8-32） | 200 / 400 / 401 |
| GET | /api/v1/rooms | 无（公开） | 仅 active 公开房间，最多 20 条 | 200 |
| GET | /api/v1/rooms/:roomId | 可选 access token（成员增强 isMember/role） | 房间 id 或 6 位房间号 | 200 / 404 |
| POST | /api/v1/rooms/:roomId/join | 需 access token（Bearer） | zod joinRoomSchema（密码 8-32 可选）+ 房间状态 | 200 / 400 / 401 / 403 / 404 / 409 |
| DELETE | /api/v1/rooms/:roomId/members/:userId | 需 access token + 房间 owner 角色 | 路径参数 + RoomMember 角色 | 200 / 400 / 403 / 404 |
| POST | /api/v1/rooms/:roomId/lock | 需 access token + 房间 owner 角色 | RoomMember 角色 | 200 / 400 / 403 / 404 |
| POST | /api/v1/rooms/:roomId/end | 需 access token + 房间 owner 角色 | RoomMember 角色 | 200 / 400 / 403 / 404 |
| POST | /api/v1/ai/compose | 需 access token（Bearer） | zod composeSchema（instruction 1-500、roomId、bpm） | 200 / 400 / 401 |
| GET | /api/v1/ai/compose/:jobId | 需 access token（Bearer） | 路径 jobId | 200 / 401 / 404 |
| POST | /api/v1/ai/ask | 需 access token（Bearer） | zod askSchema（question 1-500） | 200 / 400 / 401 / 503 |
| POST | /api/v1/ai/check | 需 access token（Bearer） | zod checkSchema（tracks 数组） | 200 / 400 / 401 |
| POST | /api/v1/ai/fix | 需 access token（Bearer） | zod fixSchema（tracks 含 color、issues、roomId） | 200 / 400 / 401 |
| GET | /api/v1/ai/fix/:jobId | 需 access token（Bearer） | 路径 jobId | 200 / 401 / 404 |
| * | 未匹配路径 | 无 | - | 404 |

## 身份与数据

- 身份：register/login 公开；GET /auth/me 要求 access token，POST /auth/refresh 要求 refresh token。缺失/格式错误 → 401 未登录，过期 → 401 令牌已过期，签名非法或 token 类型不匹配 → 401 令牌无效（API-29 ~ API-33、API-37 ~ API-39）。
- 数据：测试仅写入独立 SQLite（backend/prisma/test.db），每个用例前清空 User / Job 表；口令只以 bcrypt cost 12 哈希落库且不回传（API-15），JWT payload 仅含 sub/type/iat/exp，不含用户名或邮箱（API-24）。
- 房间：测试前额外清空 Room / RoomMember 表；私有房间口令以 bcrypt 哈希落库且序列化时移除 passwordHash（API-42 ~ API-47）；房主专属操作由 requireRoomRole(owner) 拦截——非成员 403 不是房间成员、成员越权 403 无权限（API-65 ~ API-73、UNIT-58 ~ UNIT-62）。
- 接口级用例：74 条（正常 / 失败 / 边界均已覆盖）；全部用例：242 条。

## 用例三段式记录

### EXTRA-01 知识库未命中时走 LLM：source=llm 且透传问题
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1150.5ms）

### EXTRA-02 LLM 调用失败：返回 503 通用文案，不泄露上游错误细节
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 956.7ms）

### EXTRA-03 LLM 返回合法轨道：job 最终 success，result.tracks 结构完整
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1093.4ms）

### EXTRA-04 LLM 返回 pitch=150：业务校验拦截，job 最终 failed 且错误不含原始输出
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1067.6ms）

### EXTRA-05 LLM 修复成功：job success，修复结果保留轨道与音符 id
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1079.3ms）

### EXTRA-06 未登录提交返回 401 未登录
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 186.2ms）

### EXTRA-07 缺少 instruction 返回 400 且消息匹配
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 977.2ms）

### EXTRA-08 instruction 超过 500 字符返回 400（边界）
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 941.1ms）

### API-53 房间不存在返回 404 房间不存在
- 级别 / 类型：接口 / 失败 / GET /api/v1/rooms/:roomId
- 前置条件：请求 id='not-exists'
- 操作：GET /api/v1/rooms/not-exists
- 可观测结果与当前实际（期望）：HTTP 404、body={code:404,msg:'房间不存在',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 404、body={code:404,msg:'房间不存在',data:null}）
- 判定：**PASS**（耗时 935ms）

### EXTRA-10 非房间成员提交返回 403 不是房间成员
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1912.3ms）

### EXTRA-11 空房间提交成功：job 落库，payload 含默认 bpm=120 与空轨道上下文
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1024.4ms）

### EXTRA-12 已有轨道时 existingTracksContext 汇总轨道名与乐器类型，bpm 透传
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1017.9ms）

### EXTRA-13 未登录轮询返回 401
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 72.2ms）

### EXTRA-14 任务不存在返回 404 任务不存在
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 944.9ms）

### EXTRA-15 查询已提交任务返回完整状态结构
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1003ms）

### EXTRA-16 未登录提问返回 401
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 59ms）

### EXTRA-17 空问题返回 400
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 935.2ms）

### EXTRA-18 命中知识库：Cmaj7 是什么 → source=knowledge-base 且答案含组成音
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1022.1ms）

### EXTRA-19 知识库未命中且未配置 LLM：返回 503 友好提示
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 974.6ms）

### EXTRA-20 未登录返回 401
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 25.9ms）

### EXTRA-21 tracks 为空数组返回 400（边界）
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 962.6ms）

### EXTRA-22 合法轨道返回空 issues
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 944.7ms）

### EXTRA-23 pitch=150 返回 pitch-out-of-range 问题
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 954.6ms）

### EXTRA-24 pitch=30 返回 pitch-out-of-register 问题
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 959.3ms）

### EXTRA-25 durationTicks=240 返回 duration-too-short 问题
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 939.7ms）

### EXTRA-26 velocity=0 返回 velocity-out-of-range 问题
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 948.4ms）

### EXTRA-27 同轨道音符时间重叠返回 notes-overlap 问题
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 947.5ms）

### EXTRA-28 未登录提交返回 401
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 28.6ms）

### EXTRA-29 issues 为空数组返回 400（边界）
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 937.5ms）

### EXTRA-30 房间不存在返回 404
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 962.8ms）

### EXTRA-31 非房间成员提交返回 403
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1878.2ms）

### EXTRA-32 提交成功：job 落库且结构化 issues 展开为文本行
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 992.4ms）

### EXTRA-33 未登录轮询返回 401
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 56.6ms）

### EXTRA-34 任务不存在返回 404 任务不存在
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 931.3ms）

### API-15 注册成功：返回用户信息、密码以 bcrypt cost 12 哈希落库且不回传哈希
- 级别 / 类型：接口 / 正常 / POST /api/v1/auth/register
- 前置条件：测试库已迁移且 User 表为空；body={username:'alice_01',password:'Passw0rd123',email:'alice@example.com'}
- 操作：POST /api/v1/auth/register
- 可观测结果与当前实际（期望）：HTTP 200；code=0；data 含 id/username/email/createdAt 且无 passwordHash；User count=1；落库 passwordHash 前缀 $2、cost=12、不等于明文
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；code=0；data 含 id/username/email/createdAt 且无 passwordHash；User count=1；落库 passwordHash 前缀 $2、cost=12、不等于明文）
- 判定：**PASS**（耗时 653.1ms）

### API-16 重复用户名返回 409 且消息与 spec 一致
- 级别 / 类型：接口 / 失败 / POST /api/v1/auth/register
- 前置条件：同一用户名 alice_01 已注册；再次提交不同 email
- 操作：POST /api/v1/auth/register
- 可观测结果与当前实际（期望）：HTTP 409；body={code:409,msg:'用户名已被占用',data:null}；User count 仍为 1
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 409；body={code:409,msg:'用户名已被占用',data:null}；User count 仍为 1）
- 判定：**PASS**（耗时 950.3ms）

### API-17 邮箱格式不正确返回 400
- 级别 / 类型：接口 / 失败 / POST /api/v1/auth/register
- 前置条件：body 中 email='not-an-email'
- 操作：POST /api/v1/auth/register
- 可观测结果与当前实际（期望）：HTTP 400；code=400；msg='邮箱格式不正确'；data=null；User count=0
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；code=400；msg='邮箱格式不正确'；data=null；User count=0）
- 判定：**PASS**（耗时 33.6ms）

### API-18 密码不含数字返回 400 且消息与 spec 一致
- 级别 / 类型：接口 / 失败 / POST /api/v1/auth/register
- 前置条件：body 中 password='OnlyLetters'
- 操作：POST /api/v1/auth/register
- 可观测结果与当前实际（期望）：HTTP 400；msg='密码至少 8 位且需包含字母和数字'；User count=0
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；msg='密码至少 8 位且需包含字母和数字'；User count=0）
- 判定：**PASS**（耗时 19.1ms）

### API-19 密码少于 8 位返回 400（边界）
- 级别 / 类型：接口 / 边界 / POST /api/v1/auth/register
- 前置条件：body 中 password='Ab1'（长度 3）
- 操作：POST /api/v1/auth/register
- 可观测结果与当前实际（期望）：HTTP 400；msg='密码至少 8 位且需包含字母和数字'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；msg='密码至少 8 位且需包含字母和数字'）
- 判定：**PASS**（耗时 14.8ms）

### API-20 用户名含非法字符返回 400
- 级别 / 类型：接口 / 失败 / POST /api/v1/auth/register
- 前置条件：body 中 username='bad name!'
- 操作：POST /api/v1/auth/register
- 可观测结果与当前实际（期望）：HTTP 400；msg='用户名需为 3-32 位字母、数字或下划线'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；msg='用户名需为 3-32 位字母、数字或下划线'）
- 判定：**PASS**（耗时 15ms）

### API-21 用户名为 2 位返回 400（长度下边界）
- 级别 / 类型：接口 / 边界 / POST /api/v1/auth/register
- 前置条件：body 中 username='ab'（长度 2）
- 操作：POST /api/v1/auth/register
- 可观测结果与当前实际（期望）：HTTP 400；msg='用户名需为 3-32 位字母、数字或下划线'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；msg='用户名需为 3-32 位字母、数字或下划线'）
- 判定：**PASS**（耗时 14.5ms）

### API-22 邮箱可省略，落库为 null（边界）
- 级别 / 类型：接口 / 边界 / POST /api/v1/auth/register
- 前置条件：body 不含 email 字段
- 操作：POST /api/v1/auth/register
- 可观测结果与当前实际（期望）：HTTP 200；data.email=null；User 表中该用户 email=null
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；data.email=null；User 表中该用户 email=null）
- 判定：**PASS**（耗时 509.8ms）

### API-23 登录成功返回双令牌与用户信息，access 15min / refresh 7d
- 级别 / 类型：接口 / 正常 / POST /api/v1/auth/login
- 前置条件：已注册 alice_01；body={username:'alice_01',password:'Passw0rd123'}
- 操作：POST /api/v1/auth/login
- 可观测结果与当前实际（期望）：HTTP 200；data 含 accessToken/refreshToken/user；access exp-iat=900；refresh exp-iat=604800
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；data 含 accessToken/refreshToken/user；access exp-iat=900；refresh exp-iat=604800）
- 判定：**PASS**（耗时 950.8ms）

### API-24 JWT payload 仅含 sub/type/iat/exp，不泄露 username 或 email
- 级别 / 类型：接口 / 正常 / POST /api/v1/auth/login
- 前置条件：已注册并登录成功
- 操作：对 access/refresh token 做 jwt.decode
- 可观测结果与当前实际（期望）：两组 payload 的 key 都恰为 [exp,iat,sub,type]；type 分别为 access / refresh
- 当前实际：断言全部成立，与本行期望一致（实测值：两组 payload 的 key 都恰为 [exp,iat,sub,type]；type 分别为 access / refresh）
- 判定：**PASS**（耗时 942.2ms）

### API-25 用户名不存在返回 401 且不区分具体字段
- 级别 / 类型：接口 / 失败 / POST /api/v1/auth/login
- 前置条件：username='ghost_user' 不存在
- 操作：POST /api/v1/auth/login
- 可观测结果与当前实际（期望）：HTTP 401；body={code:401,msg:'用户名或密码错误',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；body={code:401,msg:'用户名或密码错误',data:null}）
- 判定：**PASS**（耗时 498.5ms）

### API-26 密码错误返回 401 且消息与用户名不存在一致
- 级别 / 类型：接口 / 失败 / POST /api/v1/auth/login
- 前置条件：已注册 alice_01；password='WrongPass123'
- 操作：POST /api/v1/auth/login
- 可观测结果与当前实际（期望）：HTTP 401；body={code:401,msg:'用户名或密码错误',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；body={code:401,msg:'用户名或密码错误',data:null}）
- 判定：**PASS**（耗时 935.2ms）

### API-27 缺少密码返回 400（边界）
- 级别 / 类型：接口 / 边界 / POST /api/v1/auth/login
- 前置条件：body 仅含 username
- 操作：POST /api/v1/auth/login
- 可观测结果与当前实际（期望）：HTTP 400；msg='密码不能为空'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；msg='密码不能为空'）
- 判定：**PASS**（耗时 497.4ms）

### API-28 携带有效 access token 返回当前用户且不含 passwordHash
- 级别 / 类型：接口 / 正常 / GET /api/v1/auth/me
- 前置条件：已注册并登录，获取 access token
- 操作：GET /api/v1/auth/me，Authorization: Bearer <access>
- 可观测结果与当前实际（期望）：HTTP 200；code=0；data 含 username/email/createdAt；无 passwordHash / password 字段
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；code=0；data 含 username/email/createdAt；无 passwordHash / password 字段）
- 判定：**PASS**（耗时 925.5ms）

### API-29 缺少 Authorization 返回 401 未登录
- 级别 / 类型：接口 / 失败 / GET /api/v1/auth/me
- 前置条件：请求不带 Authorization 头
- 操作：GET /api/v1/auth/me
- 可观测结果与当前实际（期望）：HTTP 401；body={code:401,msg:'未登录',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；body={code:401,msg:'未登录',data:null}）
- 判定：**PASS**（耗时 934ms）

### API-30 Authorization 格式错误返回 401 未登录（边界）
- 级别 / 类型：接口 / 边界 / GET /api/v1/auth/me
- 前置条件：Authorization='Token <access>'（scheme 非 Bearer）
- 操作：GET /api/v1/auth/me
- 可观测结果与当前实际（期望）：HTTP 401；msg='未登录'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；msg='未登录'）
- 判定：**PASS**（耗时 919.5ms）

### API-31 签名无效的 access token 返回 401 令牌无效
- 级别 / 类型：接口 / 失败 / GET /api/v1/auth/me
- 前置条件：用 wrong-secret 伪造 access token
- 操作：GET /api/v1/auth/me，Authorization: Bearer <forged>
- 可观测结果与当前实际（期望）：HTTP 401；body={code:401,msg:'令牌无效',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；body={code:401,msg:'令牌无效',data:null}）
- 判定：**PASS**（耗时 974.6ms）

### API-32 过期的 access token 返回 401 令牌已过期
- 级别 / 类型：接口 / 失败 / GET /api/v1/auth/me
- 前置条件：用正确密钥签发 exp 已过期的 access token
- 操作：GET /api/v1/auth/me，Authorization: Bearer <expired>
- 可观测结果与当前实际（期望）：HTTP 401；body={code:401,msg:'令牌已过期',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；body={code:401,msg:'令牌已过期',data:null}）
- 判定：**PASS**（耗时 950.1ms）

### API-33 用 refresh token 访问受保护接口返回 401 令牌无效（令牌类型隔离）
- 级别 / 类型：接口 / 失败 / GET /api/v1/auth/me
- 前置条件：登录取得 refresh token
- 操作：GET /api/v1/auth/me，Authorization: Bearer <refresh>
- 可观测结果与当前实际（期望）：HTTP 401；msg='令牌无效'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；msg='令牌无效'）
- 判定：**PASS**（耗时 1380ms）

### API-34 合法签名但用户已不存在返回 401 未登录（依赖数据缺失）
- 级别 / 类型：接口 / 失败 / GET /api/v1/auth/me
- 前置条件：用正确密钥签发给不存在的用户 id
- 操作：GET /api/v1/auth/me，Authorization: Bearer <orphan>
- 可观测结果与当前实际（期望）：HTTP 401；msg='未登录'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；msg='未登录'）
- 判定：**PASS**（耗时 949.7ms）

### API-35 有效 refresh token 换发新双令牌，新 access token 可访问 me
- 级别 / 类型：接口 / 正常 / POST /api/v1/auth/refresh
- 前置条件：登录取得 refresh token；body={refreshToken:<refresh>}
- 操作：POST /api/v1/auth/refresh；再用返回的 access 调 GET /me
- 可观测结果与当前实际（期望）：HTTP 200；data 含 accessToken/refreshToken；随后 GET /me 返回 HTTP 200 且 username='alice_01'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；data 含 accessToken/refreshToken；随后 GET /me 返回 HTTP 200 且 username='alice_01'）
- 判定：**PASS**（耗时 944.1ms）

### API-36 也支持通过 Authorization header 提交 refresh token（边界）
- 级别 / 类型：接口 / 边界 / POST /api/v1/auth/refresh
- 前置条件：Authorization: Bearer <refresh>，body={}
- 操作：POST /api/v1/auth/refresh
- 可观测结果与当前实际（期望）：HTTP 200；data.accessToken 为非空字符串
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；data.accessToken 为非空字符串）
- 判定：**PASS**（耗时 935.1ms）

### API-37 用 access token 调用 refresh 返回 401 令牌无效
- 级别 / 类型：接口 / 失败 / POST /api/v1/auth/refresh
- 前置条件：body={refreshToken:<access>}
- 操作：POST /api/v1/auth/refresh
- 可观测结果与当前实际（期望）：HTTP 401；msg='令牌无效'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；msg='令牌无效'）
- 判定：**PASS**（耗时 951.5ms）

### API-41 旧 access token 在有效期内仍可访问 me（无状态 JWT，不做黑名单）
- 级别 / 类型：接口 / 边界 / POST /api/v1/auth/refresh
- 前置条件：登录取得 access/refresh token；先用 refresh token 换发新令牌
- 操作：刷新后仍用刷新前的旧 access token 调 GET /api/v1/auth/me
- 可观测结果与当前实际（期望）：refresh 返回 HTTP 200；旧 access token 调 me 返回 HTTP 200 且 username='alice_01'（与 design 无黑名单一致）
- 当前实际：断言全部成立，与本行期望一致（实测值：refresh 返回 HTTP 200；旧 access token 调 me 返回 HTTP 200 且 username='alice_01'（与 design 无黑名单一致））
- 判定：**PASS**（耗时 1013.7ms）

### API-38 签名无效的 refresh token 返回 401 令牌无效
- 级别 / 类型：接口 / 失败 / POST /api/v1/auth/refresh
- 前置条件：用 wrong-secret 伪造 refresh token
- 操作：POST /api/v1/auth/refresh
- 可观测结果与当前实际（期望）：HTTP 401；msg='令牌无效'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；msg='令牌无效'）
- 判定：**PASS**（耗时 937.4ms）

### API-39 过期的 refresh token 返回 401 令牌已过期
- 级别 / 类型：接口 / 失败 / POST /api/v1/auth/refresh
- 前置条件：用正确密钥签发 exp 已过期的 refresh token
- 操作：POST /api/v1/auth/refresh
- 可观测结果与当前实际（期望）：HTTP 401；body={code:401,msg:'令牌已过期',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；body={code:401,msg:'令牌已过期',data:null}）
- 判定：**PASS**（耗时 937.1ms）

### API-40 缺少 refreshToken 返回 401 未登录（边界）
- 级别 / 类型：接口 / 边界 / POST /api/v1/auth/refresh
- 前置条件：body={} 且无 Authorization 头
- 操作：POST /api/v1/auth/refresh
- 可观测结果与当前实际（期望）：HTTP 401；body={code:401,msg:'未登录',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；body={code:401,msg:'未登录',data:null}）
- 判定：**PASS**（耗时 950.1ms）

### API-01 GET /health 返回统一格式且带安全响应头
- 级别 / 类型：接口 / 正常 / GET /health
- 前置条件：应用已组装（createApp），无需认证；请求带允许来源 Origin=http://localhost:5173
- 操作：GET /health
- 可观测结果与当前实际（期望）：HTTP 200；body={code:0,msg:'ok',data:{status:'UP'}}；存在 x-content-type-options: nosniff；access-control-allow-origin=http://localhost:5173
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；body={code:0,msg:'ok',data:{status:'UP'}}；存在 x-content-type-options: nosniff；access-control-allow-origin=http://localhost:5173）
- 判定：**PASS**（耗时 62.8ms）

### API-02 GET /api/v1/health 可访问（双挂载边界）
- 级别 / 类型：接口 / 边界 / GET /api/v1/health
- 前置条件：同一健康路由同时挂在 / 与 /api/v1 下
- 操作：GET /api/v1/health
- 可观测结果与当前实际（期望）：HTTP 200；body.code=0；body.data.status='UP'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；body.code=0；body.data.status='UP'）
- 判定：**PASS**（耗时 8.9ms）

### API-03 GET /api/v1/hello 返回统一响应格式
- 级别 / 类型：接口 / 正常 / GET /api/v1/hello
- 前置条件：应用已组装，无需认证
- 操作：GET /api/v1/hello
- 可观测结果与当前实际（期望）：HTTP 200；body={code:0,msg:'ok',data:'Hello from Jam Box backend'}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；body={code:0,msg:'ok',data:'Hello from Jam Box backend'}）
- 判定：**PASS**（耗时 7.5ms）

### API-04 GET /health 对未允许来源返回 CORS 错误（500 由中间件统一格式）
- 级别 / 类型：接口 / 失败 / GET /health
- 前置条件：请求头 Origin=http://evil.example.com（不在允许列表）
- 操作：GET /health
- 可观测结果与当前实际（期望）：HTTP 500；body={code:500,msg:'服务器内部错误',data:null}；无 access-control-allow-origin 响应头
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 500；body={code:500,msg:'服务器内部错误',data:null}；无 access-control-allow-origin 响应头）
- 判定：**PASS**（耗时 11.6ms）

### API-05 提交合法任务后落库，返回 pending 任务结构
- 级别 / 类型：接口 / 正常 / POST /api/v1/jobs
- 前置条件：测试库已迁移且 Job 表为空；body={type:'test',payload:{foo:'bar'}}
- 操作：POST /api/v1/jobs
- 可观测结果与当前实际（期望）：HTTP 200；data.status='pending'，retryCount=0，maxRetries=3，payload={foo:'bar'}，result=null，error=null；Job 表 count=1
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；data.status='pending'，retryCount=0，maxRetries=3，payload={foo:'bar'}，result=null，error=null；Job 表 count=1）
- 判定：**PASS**（耗时 175ms）

### API-06 payload 缺省时允许创建，payload 为 null（边界）
- 级别 / 类型：接口 / 边界 / POST /api/v1/jobs
- 前置条件：测试库为空；body 仅含 type:'test'
- 操作：POST /api/v1/jobs
- 可观测结果与当前实际（期望）：HTTP 200；data.status='pending'；data.payload=null
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；data.status='pending'；data.payload=null）
- 判定：**PASS**（耗时 38.7ms）

### API-07 缺少 type 返回 400 与具体校验信息
- 级别 / 类型：接口 / 失败 / POST /api/v1/jobs
- 前置条件：测试库为空；body={payload:{}}（缺少必填 type）
- 操作：POST /api/v1/jobs
- 可观测结果与当前实际（期望）：HTTP 400；code=400；msg 包含 'type'；data=null；Job 表 count=0
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；code=400；msg 包含 'type'；data=null；Job 表 count=0）
- 判定：**PASS**（耗时 28.9ms）

### API-08 type 为空字符串返回 400（边界）
- 级别 / 类型：接口 / 边界 / POST /api/v1/jobs
- 前置条件：测试库为空；body={type:''}
- 操作：POST /api/v1/jobs
- 可观测结果与当前实际（期望）：HTTP 400；code=400；msg 包含 'type'；Job 表 count=0
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；code=400；msg 包含 'type'；Job 表 count=0）
- 判定：**PASS**（耗时 12.4ms）

### API-09 请求体为非法 JSON 返回 400 而不是 500
- 级别 / 类型：接口 / 失败 / POST /api/v1/jobs
- 前置条件：Content-Type=application/json；body 为残缺 JSON '{"type":'
- 操作：POST /api/v1/jobs
- 可观测结果与当前实际（期望）：HTTP 400；body={code:400,msg:'请求体不是合法的 JSON',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；body={code:400,msg:'请求体不是合法的 JSON',data:null}）
- 判定：**PASS**（耗时 11.8ms）

### API-10 查询已存在任务返回完整结构
- 级别 / 类型：接口 / 正常 / GET /api/v1/jobs/:id
- 前置条件：先 POST 创建 type='test'、payload={n:1} 的任务
- 操作：GET /api/v1/jobs/<created.id>
- 可观测结果与当前实际（期望）：HTTP 200；data.id 与创建返回值相同；data.status='pending'；data.payload={n:1}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；data.id 与创建返回值相同；data.status='pending'；data.payload={n:1}）
- 判定：**PASS**（耗时 34.6ms）

### API-11 查询不存在的任务返回 404 且错误码匹配
- 级别 / 类型：接口 / 失败 / GET /api/v1/jobs/:id
- 前置条件：测试库为空；路径 id='not-exists-id'
- 操作：GET /api/v1/jobs/not-exists-id
- 可观测结果与当前实际（期望）：HTTP 404；body={code:404,msg:'任务不存在',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 404；body={code:404,msg:'任务不存在',data:null}）
- 判定：**PASS**（耗时 22.2ms）

### API-12 未匹配的 API 路由返回统一 404 JSON
- 级别 / 类型：接口 / 失败 / GET /api/v1/unknown-route
- 前置条件：应用无该路由
- 操作：GET /api/v1/unknown-route
- 可观测结果与当前实际（期望）：HTTP 404；body={code:404,msg:'接口不存在',data:null}；content-type 含 application/json
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 404；body={code:404,msg:'接口不存在',data:null}；content-type 含 application/json）
- 判定：**PASS**（耗时 11.3ms）

### API-13 POST /api/v1/jobs/ 空路径（尾斜杠）返回统一 404
- 级别 / 类型：接口 / 边界 / GET /api/v1/jobs/
- 前置条件：尾斜杠路径无 GET 处理器（仅 POST /）
- 操作：GET /api/v1/jobs/
- 可观测结果与当前实际（期望）：HTTP 404；body.code=404；data=null
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 404；body.code=404；data=null）
- 判定：**PASS**（耗时 11.1ms）

### API-14 CORS 预检请求返回 204 并允许 POST
- 级别 / 类型：接口 / 边界 / OPTIONS /api/v1/jobs
- 前置条件：Origin=http://localhost:5173；Access-Control-Request-Method=POST
- 操作：OPTIONS /api/v1/jobs
- 可观测结果与当前实际（期望）：HTTP 204；access-control-allow-origin=http://localhost:5173；access-control-allow-methods 包含 POST
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 204；access-control-allow-origin=http://localhost:5173；access-control-allow-methods 包含 POST）
- 判定：**PASS**（耗时 6.7ms）

### EXTRA-76 创建音符：velocity 默认 100，响应字段完整
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1301.5ms）

### EXTRA-77 边界值 pitch 0 / 127、durationTicks 480 合法
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1148.2ms）

### EXTRA-78 pitch 超出 0-127 返回 400 且消息与 spec 一致
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1085.5ms）

### EXTRA-79 startTimeTicks 为负、durationTicks 小于 480、velocity 超界均返回 400
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1094ms）

### EXTRA-80 非成员创建返回 403，未登录返回 401，轨道不存在返回 404
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 2059.2ms）

### EXTRA-81 bulk 创建 10 个音符一次写入
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1064.8ms）

### EXTRA-82 bulk 创建：非数组 / 空数组 / 数组内非法音符返回 400 且不写入任何数据
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1146.2ms）

### EXTRA-83 bulk 更新多个音符并落库
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1100.1ms）

### EXTRA-84 bulk 更新引用了别的轨道的音符返回 404，且不产生部分更新
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1161.2ms）

### EXTRA-85 bulk 删除只删除存在的音符并返回删除数量
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1103.9ms）

### EXTRA-86 bulk 删除 noteIds 为空返回 400
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1042.7ms）

### EXTRA-87 PUT 单个音符更新字段，DELETE 单个音符
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1115.6ms）

### EXTRA-88 操作不属于该轨道的音符返回 404「音符不存在」
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1121.9ms）

### API-42 创建公开房间：创建者为 owner，房间号为 6 位数字
- 级别 / 类型：接口 / 正常 / POST /api/v1/rooms
- 前置条件：已登录 player_01；User / Room / RoomMember 表已清空
- 操作：POST /api/v1/rooms，body={name:'我的乐队',isPublic:true}，Bearer access token
- 可观测结果与当前实际（期望）：HTTP 200、code=0、status='active'、roomNumber 为 6 位数字、owner.username='player_01'、members 长度 1 且 role='owner'、响应无 passwordHash、RoomMember 表 count=1
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200、code=0、status='active'、roomNumber 为 6 位数字、owner.username='player_01'、members 长度 1 且 role='owner'、响应无 passwordHash、RoomMember 表 count=1）
- 判定：**PASS**（耗时 1145.8ms）

### API-43 创建私有房间：密码以 bcrypt 哈希落库且响应不含 passwordHash
- 级别 / 类型：接口 / 正常 / POST /api/v1/rooms
- 前置条件：已登录 player_01；密码 'secret123'
- 操作：POST /api/v1/rooms，body={name:'秘密合奏',isPublic:false,password:'secret123'}
- 可观测结果与当前实际（期望）：HTTP 200、isPublic=false、响应无 passwordHash/password、库中 passwordHash 以 '$2' 开头且不等于明文
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200、isPublic=false、响应无 passwordHash/password、库中 passwordHash 以 '$2' 开头且不等于明文）
- 判定：**PASS**（耗时 1459.4ms）

### API-44 创建房间名为空返回 400 且消息与 spec 一致
- 级别 / 类型：接口 / 失败 / POST /api/v1/rooms
- 前置条件：已登录 player_01；body name=''
- 操作：POST /api/v1/rooms，body={name:'',isPublic:true}
- 可观测结果与当前实际（期望）：HTTP 400、body={code:400,msg:'房间名长度必须在 1-50 字符之间',data:null}、Room 表 count=0
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400、body={code:400,msg:'房间名长度必须在 1-50 字符之间',data:null}、Room 表 count=0）
- 判定：**PASS**（耗时 995.8ms）

### API-45 创建房间名超过 50 字符返回 400（边界）
- 级别 / 类型：接口 / 边界 / POST /api/v1/rooms
- 前置条件：已登录 player_01；body name 长度 51
- 操作：POST /api/v1/rooms
- 可观测结果与当前实际（期望）：HTTP 400、msg='房间名长度必须在 1-50 字符之间'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400、msg='房间名长度必须在 1-50 字符之间'）
- 判定：**PASS**（耗时 936.6ms）

### API-46 未登录创建房间返回 401 未登录
- 级别 / 类型：接口 / 失败 / POST /api/v1/rooms
- 前置条件：不带 Authorization 头
- 操作：POST /api/v1/rooms，body={name:'我的乐队',isPublic:true}
- 可观测结果与当前实际（期望）：HTTP 401、body={code:401,msg:'未登录',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401、body={code:401,msg:'未登录',data:null}）
- 判定：**PASS**（耗时 25.7ms）

### API-47 私有房间缺少密码返回 400
- 级别 / 类型：接口 / 失败 / POST /api/v1/rooms
- 前置条件：已登录 player_01；isPublic=false 且未提供 password
- 操作：POST /api/v1/rooms，body={name:'秘密合奏',isPublic:false}
- 可观测结果与当前实际（期望）：HTTP 400、body={code:400,msg:'私有房间密码长度必须在 8-32 位之间',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400、body={code:400,msg:'私有房间密码长度必须在 8-32 位之间',data:null}）
- 判定：**PASS**（耗时 938.7ms）

### API-48 列出公开房间：仅 active 公开房间并按创建时间倒序
- 级别 / 类型：接口 / 正常 / GET /api/v1/rooms
- 前置条件：player_01 与 player_02 各建 1 个公开房间，另有 1 个私有房间；旧房间 createdAt 前移 1 小时
- 操作：GET /api/v1/rooms（匿名）
- 可观测结果与当前实际（期望）：HTTP 200、data 长度 2、顺序为 [新房间, 旧房间]、不含私有房间、首条 memberCount=1 且 owner.username='player_02'、无 passwordHash
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200、data 长度 2、顺序为 [新房间, 旧房间]、不含私有房间、首条 memberCount=1 且 owner.username='player_02'、无 passwordHash）
- 判定：**PASS**（耗时 2448.8ms）

### API-49 没有活跃公开房间时返回空数组
- 级别 / 类型：接口 / 边界 / GET /api/v1/rooms
- 前置条件：Room 表为空
- 操作：GET /api/v1/rooms
- 可观测结果与当前实际（期望）：HTTP 200、body={code:0,msg:'ok',data:[]}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200、body={code:0,msg:'ok',data:[]}）
- 判定：**PASS**（耗时 46.7ms）

### API-50 列出公开房间最多返回 20 条（边界）
- 级别 / 类型：接口 / 边界 / GET /api/v1/rooms
- 前置条件：同一用户连续创建 21 个公开房间
- 操作：GET /api/v1/rooms
- 可观测结果与当前实际（期望）：HTTP 200、data 长度恰为 20
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200、data 长度恰为 20）
- 判定：**PASS**（耗时 1490.1ms）

### API-51 房间详情：成员返回 isMember=true 与 role
- 级别 / 类型：接口 / 正常 / GET /api/v1/rooms/:roomId
- 前置条件：已登录 player_01 创建公开房间
- 操作：GET /api/v1/rooms/:id，Bearer access token
- 可观测结果与当前实际（期望）：HTTP 200、isMember=true、role='owner'、members 长度 1、无 passwordHash
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200、isMember=true、role='owner'、members 长度 1、无 passwordHash）
- 判定：**PASS**（耗时 1022.1ms）

### API-52 私有房间详情对非成员不返回 passwordHash
- 级别 / 类型：接口 / 正常 / GET /api/v1/rooms/:roomId
- 前置条件：player_01 创建私有房间，player_02 未加入
- 操作：GET /api/v1/rooms/:id，Bearer player_02 token
- 可观测结果与当前实际（期望）：HTTP 200、isPublic=false、owner.username='player_01'、isMember=false、role=null、无 passwordHash
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200、isPublic=false、owner.username='player_01'、isMember=false、role=null、无 passwordHash）
- 判定：**PASS**（耗时 2285.4ms）

### API-53 房间不存在返回 404 房间不存在
- 级别 / 类型：接口 / 失败 / GET /api/v1/rooms/:roomId
- 前置条件：请求 id='not-exists'
- 操作：GET /api/v1/rooms/not-exists
- 可观测结果与当前实际（期望）：HTTP 404、body={code:404,msg:'房间不存在',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 404、body={code:404,msg:'房间不存在',data:null}）
- 判定：**PASS**（耗时 47.8ms）

### API-54 已结束房间仍可查看详情且 status=ended
- 级别 / 类型：接口 / 边界 / GET /api/v1/rooms/:roomId
- 前置条件：房主已调用 end
- 操作：GET /api/v1/rooms/:id，Bearer owner token
- 可观测结果与当前实际（期望）：HTTP 200、status='ended'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200、status='ended'）
- 判定：**PASS**（耗时 943.4ms）

### API-55 加入公开房间成功并出现在成员列表
- 级别 / 类型：接口 / 正常 / POST /api/v1/rooms/:roomId/join
- 前置条件：公开房间 owner=player_01，player_02 未加入
- 操作：POST /api/v1/rooms/:id/join，Bearer player_02 token，body={}
- 可观测结果与当前实际（期望）：HTTP 200、members 长度 2、player_02 的 role='member'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200、members 长度 2、player_02 的 role='member'）
- 判定：**PASS**（耗时 1959.5ms）

### API-56 私有房间密码正确可加入
- 级别 / 类型：接口 / 正常 / POST /api/v1/rooms/:roomId/join
- 前置条件：私有房间密码 'secret123'
- 操作：POST /api/v1/rooms/:id/join，body={password:'secret123'}
- 可观测结果与当前实际（期望）：HTTP 200、RoomMember 表 count=2
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200、RoomMember 表 count=2）
- 判定：**PASS**（耗时 2887.4ms）

### API-57 私有房间密码错误返回 401 房间密码错误
- 级别 / 类型：接口 / 失败 / POST /api/v1/rooms/:roomId/join
- 前置条件：私有房间密码 'secret123'，提交 'wrongpass1'
- 操作：POST /api/v1/rooms/:id/join
- 可观测结果与当前实际（期望）：HTTP 401、body={code:401,msg:'房间密码错误',data:null}、RoomMember 表仍为 1
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401、body={code:401,msg:'房间密码错误',data:null}、RoomMember 表仍为 1）
- 判定：**PASS**（耗时 2883.7ms）

### API-58 私有房间未提供密码返回 401 房间密码错误（边界）
- 级别 / 类型：接口 / 边界 / POST /api/v1/rooms/:roomId/join
- 前置条件：私有房间，请求体为空对象
- 操作：POST /api/v1/rooms/:id/join，body={}
- 可观测结果与当前实际（期望）：HTTP 401、msg='房间密码错误'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401、msg='房间密码错误'）
- 判定：**PASS**（耗时 2376.4ms）

### API-59 重复加入返回 409 你已是该房间成员
- 级别 / 类型：接口 / 失败 / POST /api/v1/rooms/:roomId/join
- 前置条件：房主 player_01 已是成员
- 操作：POST /api/v1/rooms/:id/join，Bearer owner token
- 可观测结果与当前实际（期望）：HTTP 409、body={code:409,msg:'你已是该房间成员',data:null}、RoomMember 表仍为 1
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 409、body={code:409,msg:'你已是该房间成员',data:null}、RoomMember 表仍为 1）
- 判定：**PASS**（耗时 1036ms）

### API-60 加入已锁定房间返回 403 房间已锁定，无法加入
- 级别 / 类型：接口 / 失败 / POST /api/v1/rooms/:roomId/join
- 前置条件：房主已 lock 公开房间
- 操作：POST /api/v1/rooms/:id/join，Bearer player_02 token
- 可观测结果与当前实际（期望）：HTTP 403、body={code:403,msg:'房间已锁定，无法加入',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 403、body={code:403,msg:'房间已锁定，无法加入',data:null}）
- 判定：**PASS**（耗时 1982.3ms）

### API-61 加入已结束房间返回 403 合奏已结束
- 级别 / 类型：接口 / 失败 / POST /api/v1/rooms/:roomId/join
- 前置条件：房主已 end 公开房间
- 操作：POST /api/v1/rooms/:id/join，Bearer player_02 token
- 可观测结果与当前实际（期望）：HTTP 403、body={code:403,msg:'合奏已结束',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 403、body={code:403,msg:'合奏已结束',data:null}）
- 判定：**PASS**（耗时 1962.3ms）

### API-62 按房间号加入公开房间成功（边界）
- 级别 / 类型：接口 / 边界 / POST /api/v1/rooms/:roomId/join
- 前置条件：公开房间已创建，路径参数使用 6 位 roomNumber
- 操作：POST /api/v1/rooms/:roomNumber/join，Bearer player_02 token
- 可观测结果与当前实际（期望）：HTTP 200、data.id 等于房间 id、members 长度 2
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200、data.id 等于房间 id、members 长度 2）
- 判定：**PASS**（耗时 1926.3ms）

### API-63 加入不存在的房间返回 404 房间不存在
- 级别 / 类型：接口 / 失败 / POST /api/v1/rooms/:roomId/join
- 前置条件：路径参数 'not-exists'，已登录
- 操作：POST /api/v1/rooms/not-exists/join
- 可观测结果与当前实际（期望）：HTTP 404、msg='房间不存在'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 404、msg='房间不存在'）
- 判定：**PASS**（耗时 969.2ms）

### API-64 密码明文不出现在错误日志中
- 级别 / 类型：接口 / 失败 / POST /api/v1/rooms/:roomId/join
- 前置条件：私有房间密码 'secret123'，提交错误密码 'leak-check-pwd'，拦截 console.error
- 操作：POST /api/v1/rooms/:id/join
- 可观测结果与当前实际（期望）：console.error 输出不包含 'leak-check-pwd' 与 'secret123'
- 当前实际：断言全部成立，与本行期望一致（实测值：console.error 输出不包含 'leak-check-pwd' 与 'secret123'）
- 判定：**PASS**（耗时 2777.8ms）

### API-65 房主踢普通成员后成员列表更新
- 级别 / 类型：接口 / 正常 / DELETE /api/v1/rooms/:roomId/members/:userId
- 前置条件：公开房间 owner=player_01，player_02 已加入
- 操作：DELETE /api/v1/rooms/:id/members/:otherId，Bearer owner token
- 可观测结果与当前实际（期望）：HTTP 200、members 长度 1、不含 player_02、对应 RoomMember 记录为 null
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200、members 长度 1、不含 player_02、对应 RoomMember 记录为 null）
- 判定：**PASS**（耗时 1970.1ms）

### API-66 房主踢自己返回 400 不能踢房主
- 级别 / 类型：接口 / 失败 / DELETE /api/v1/rooms/:roomId/members/:userId
- 前置条件：房主对自身 userId 调用
- 操作：DELETE /api/v1/rooms/:id/members/:ownerId
- 可观测结果与当前实际（期望）：HTTP 400、body={code:400,msg:'不能踢房主',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400、body={code:400,msg:'不能踢房主',data:null}）
- 判定：**PASS**（耗时 1941.9ms）

### API-67 普通成员尝试踢人返回 403 无权限
- 级别 / 类型：接口 / 失败 / DELETE /api/v1/rooms/:roomId/members/:userId
- 前置条件：player_02 是 member 角色
- 操作：DELETE /api/v1/rooms/:id/members/:otherId，Bearer player_02 token
- 可观测结果与当前实际（期望）：HTTP 403、body={code:403,msg:'无权限',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 403、body={code:403,msg:'无权限',data:null}）
- 判定：**PASS**（耗时 1966.9ms）

### API-68 踢不在房间的用户返回 404 该成员不在房间中
- 级别 / 类型：接口 / 失败 / DELETE /api/v1/rooms/:roomId/members/:userId
- 前置条件：player_03 已注册但未加入房间
- 操作：DELETE /api/v1/rooms/:id/members/:thirdId，Bearer owner token
- 可观测结果与当前实际（期望）：HTTP 404、body={code:404,msg:'该成员不在房间中',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 404、body={code:404,msg:'该成员不在房间中',data:null}）
- 判定：**PASS**（耗时 2939.9ms）

### API-69 非成员调用踢人返回 403 不是房间成员
- 级别 / 类型：接口 / 失败 / DELETE /api/v1/rooms/:roomId/members/:userId
- 前置条件：player_03 未加入房间
- 操作：DELETE /api/v1/rooms/:id/members/:thirdId，Bearer player_03 token
- 可观测结果与当前实际（期望）：HTTP 403、body={code:403,msg:'不是房间成员',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 403、body={code:403,msg:'不是房间成员',data:null}）
- 判定：**PASS**（耗时 2896.2ms）

### API-70 房主加锁成功返回 status=locked
- 级别 / 类型：接口 / 正常 / POST /api/v1/rooms/:roomId/lock
- 前置条件：active 公开房间，owner 已登录
- 操作：POST /api/v1/rooms/:id/lock，Bearer owner token
- 可观测结果与当前实际（期望）：HTTP 200、status='locked'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200、status='locked'）
- 判定：**PASS**（耗时 994.9ms）

### API-71 非房主尝试加锁返回 403 无权限
- 级别 / 类型：接口 / 失败 / POST /api/v1/rooms/:roomId/lock
- 前置条件：player_02 已加入且 role=member
- 操作：POST /api/v1/rooms/:id/lock，Bearer player_02 token
- 可观测结果与当前实际（期望）：HTTP 403、msg='无权限'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 403、msg='无权限'）
- 判定：**PASS**（耗时 1926.6ms）

### API-72 房主结束合奏返回 status=ended
- 级别 / 类型：接口 / 正常 / POST /api/v1/rooms/:roomId/end
- 前置条件：active 公开房间，owner 已登录
- 操作：POST /api/v1/rooms/:id/end，Bearer owner token
- 可观测结果与当前实际（期望）：HTTP 200、status='ended'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200、status='ended'）
- 判定：**PASS**（耗时 1001.2ms）

### API-73 已结束房间再次结束返回 400 房间已结束
- 级别 / 类型：接口 / 失败 / POST /api/v1/rooms/:roomId/end
- 前置条件：房间已 ended
- 操作：再次 POST /api/v1/rooms/:id/end
- 可观测结果与当前实际（期望）：HTTP 400、body={code:400,msg:'房间已结束',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400、body={code:400,msg:'房间已结束',data:null}）
- 判定：**PASS**（耗时 1008.2ms）

### EXTRA-121 创建四种乐器轨道：position 从 0 递增，默认 solo/mute 为 false、颜色为 #3b82f6
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1267.6ms）

### EXTRA-122 乐器类型非法返回 400 且消息与 spec 一致
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1032ms）

### EXTRA-123 轨道名为空 / 超过 50 字符返回 400（边界）
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1045.9ms）

### EXTRA-124 颜色非十六进制返回 400，合法颜色可写入
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1030.9ms）

### EXTRA-125 非房间成员创建返回 403「不是房间成员」，未登录返回 401
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1949.5ms）

### EXTRA-126 房间不存在返回 404「房间不存在」
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 975ms）

### EXTRA-127 按 position 升序返回，且每个轨道包含按开始时间升序的音符
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1097.4ms）

### EXTRA-128 非房间成员返回 403
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 2019.7ms）

### EXTRA-129 成员可获取轨道及其音符
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1070.1ms）

### EXTRA-130 轨道不存在返回 404，非成员返回 403
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 2044.2ms）

### EXTRA-131 可更新 name/solo/mute/color/position
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1075.2ms）

### EXTRA-132 不可修改 instrumentType 与 roomId：传入被忽略
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1042ms）

### EXTRA-133 颜色非法 / position 为负返回 400
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1081.1ms）

### EXTRA-134 删除轨道时级联删除其音符
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1098ms）

### EXTRA-135 非成员删除返回 403
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1970.9ms）

### EXTRA-136 成员获取详情时返回 tracks（含音符）
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1059ms）

### EXTRA-137 公开房间允许非成员只读轨道；私有房间非成员 tracks 为空
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 2586.1ms）

### EXTRA-138 加入语音通道：房间成员收到 voice-members/joined，并按点对点转发 offer
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 2203ms）

### EXTRA-139 静音状态广播：其他成员收到 member:muted / member:unmuted，后加入者能查到静音状态
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 2061.3ms）

### EXTRA-140 安全：无 JWT 或非房间成员无法建立连接；跨房间信令不会被转发
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 3585.7ms）

### EXTRA-141 未配置 LLM（provider=null）抛出友好错误
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 7.3ms）

### EXTRA-142 LLM 返回合法轨道：原样返回 tracks，prompt 渲染 instruction 与 bpm
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 9.5ms）

### EXTRA-143 pitch=150 被拦截，错误含校验摘要且不含原始 JSON 输出
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1.4ms）

### EXTRA-144 durationTicks=240 被拦截
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1.1ms）

### EXTRA-145 velocity=200 被拦截
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1.2ms）

### EXTRA-146 startTimeTicks 为负数被拦截
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 0.6ms）

### EXTRA-147 instrumentType 不在枚举内被拦截
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 0.6ms）

### EXTRA-148 color 非十六进制被拦截
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 0.8ms）

### EXTRA-149 未配置 LLM（provider=null）抛出友好错误
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 4.1ms）

### EXTRA-150 修复结果保留轨道与音符 id，issues 渲染进 prompt
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1.1ms）

### EXTRA-151 修复结果 velocity=200 仍被业务校验拦截
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 0.6ms）

### UNIT-25 hashPassword 生成 cost 12 的 bcrypt 哈希且可正确比对
- 级别 / 类型：单元 / 正常
- 前置条件：明文 Passw0rd123
- 操作：hashPassword('Passw0rd123')；comparePassword 正确/错误明文
- 可观测结果与当前实际（期望）：哈希以 $2 开头、cost=12、不含明文；正确明文返回 true
- 当前实际：断言全部成立，与本行期望一致（实测值：哈希以 $2 开头、cost=12、不含明文；正确明文返回 true）
- 判定：**PASS**（耗时 881.9ms）

### UNIT-26 明文不匹配时 comparePassword 返回 false
- 级别 / 类型：单元 / 失败
- 前置条件：哈希由 Passw0rd123 生成
- 操作：comparePassword('WrongPass123', hash)
- 可观测结果与当前实际（期望）：返回 false
- 当前实际：断言全部成立，与本行期望一致（实测值：返回 false）
- 判定：**PASS**（耗时 862.9ms）

### UNIT-27 access token 的 payload 仅含 sub/type/iat/exp 且有效期 900 秒
- 级别 / 类型：单元 / 正常
- 前置条件：sub='user-1'
- 操作：signAccessToken('user-1') 后 decode
- 可观测结果与当前实际（期望）：sub='user-1'；type='access'；key 恰为 [exp,iat,sub,type]；exp-iat=900
- 当前实际：断言全部成立，与本行期望一致（实测值：sub='user-1'；type='access'；key 恰为 [exp,iat,sub,type]；exp-iat=900）
- 判定：**PASS**（耗时 6.2ms）

### UNIT-28 refresh token 的 type 为 refresh 且有效期 604800 秒
- 级别 / 类型：单元 / 正常
- 前置条件：sub='user-1'
- 操作：signRefreshToken('user-1') 后 decode
- 可观测结果与当前实际（期望）：sub='user-1'；type='refresh'；exp-iat=604800
- 当前实际：断言全部成立，与本行期望一致（实测值：sub='user-1'；type='refresh'；exp-iat=604800）
- 判定：**PASS**（耗时 2.2ms）

### UNIT-29 verifyToken 返回 sub 与 type
- 级别 / 类型：单元 / 正常
- 前置条件：signAccessToken('test')
- 操作：verifyToken(token)
- 可观测结果与当前实际（期望）：sub='test'；type='access'
- 当前实际：断言全部成立，与本行期望一致（实测值：sub='test'；type='access'）
- 判定：**PASS**（耗时 3.9ms）

### UNIT-30 被篡改的 token 校验失败
- 级别 / 类型：单元 / 失败
- 前置条件：合法 access token 末两位替换为 xx
- 操作：verifyToken(tampered)
- 可观测结果与当前实际（期望）：抛 JsonWebTokenError
- 当前实际：断言全部成立，与本行期望一致（实测值：抛 JsonWebTokenError）
- 判定：**PASS**（耗时 3.7ms）

### UNIT-31 过期 token 校验抛 TokenExpiredError
- 级别 / 类型：单元 / 边界
- 前置条件：用 expiresIn=-1 签发 access token
- 操作：verifyToken(expired)
- 可观测结果与当前实际（期望）：抛 TokenExpiredError
- 当前实际：断言全部成立，与本行期望一致（实测值：抛 TokenExpiredError）
- 判定：**PASS**（耗时 2.9ms）

### UNIT-32 合法输入通过并保留字段
- 级别 / 类型：单元 / 正常
- 前置条件：input={username:'alice_01',password:'Passw0rd123',email:'alice@example.com'}
- 操作：registerSchema.parse(input)
- 可观测结果与当前实际（期望）：三个字段值原样保留
- 当前实际：断言全部成立，与本行期望一致（实测值：三个字段值原样保留）
- 判定：**PASS**（耗时 6.2ms）

### UNIT-33 email 可省略（边界）
- 级别 / 类型：单元 / 边界
- 前置条件：input 不含 email
- 操作：registerSchema.parse(input)
- 可观测结果与当前实际（期望）：email=undefined
- 当前实际：断言全部成立，与本行期望一致（实测值：email=undefined）
- 判定：**PASS**（耗时 0.8ms）

### UNIT-34 用户名少于 3 位被拒绝
- 级别 / 类型：单元 / 失败
- 前置条件：username='ab'
- 操作：registerSchema.safeParse(input)
- 可观测结果与当前实际（期望）：success=false；message='用户名需为 3-32 位字母、数字或下划线'
- 当前实际：断言全部成立，与本行期望一致（实测值：success=false；message='用户名需为 3-32 位字母、数字或下划线'）
- 判定：**PASS**（耗时 1.3ms）

### UNIT-35 用户名超过 32 位被拒绝（边界）
- 级别 / 类型：单元 / 边界
- 前置条件：username='a'.repeat(33)
- 操作：registerSchema.safeParse(input)
- 可观测结果与当前实际（期望）：success=false
- 当前实际：断言全部成立，与本行期望一致（实测值：success=false）
- 判定：**PASS**（耗时 1ms）

### UNIT-36 用户名含非法字符被拒绝
- 级别 / 类型：单元 / 失败
- 前置条件：username='bad name'
- 操作：registerSchema.safeParse(input)
- 可观测结果与当前实际（期望）：success=false
- 当前实际：断言全部成立，与本行期望一致（实测值：success=false）
- 判定：**PASS**（耗时 0.5ms）

### UNIT-37 密码缺少数字被拒绝
- 级别 / 类型：单元 / 失败
- 前置条件：password='OnlyLetters'
- 操作：registerSchema.safeParse(input)
- 可观测结果与当前实际（期望）：success=false；message='密码至少 8 位且需包含字母和数字'
- 当前实际：断言全部成立，与本行期望一致（实测值：success=false；message='密码至少 8 位且需包含字母和数字'）
- 判定：**PASS**（耗时 0.7ms）

### UNIT-38 密码缺少字母被拒绝
- 级别 / 类型：单元 / 失败
- 前置条件：password='12345678'
- 操作：registerSchema.safeParse(input)
- 可观测结果与当前实际（期望）：success=false
- 当前实际：断言全部成立，与本行期望一致（实测值：success=false）
- 判定：**PASS**（耗时 0.5ms）

### UNIT-39 密码少于 8 位被拒绝（边界）
- 级别 / 类型：单元 / 边界
- 前置条件：password='Ab1'
- 操作：registerSchema.safeParse(input)
- 可观测结果与当前实际（期望）：success=false
- 当前实际：断言全部成立，与本行期望一致（实测值：success=false）
- 判定：**PASS**（耗时 0.5ms）

### UNIT-40 非法邮箱被拒绝且消息与 spec 一致
- 级别 / 类型：单元 / 失败
- 前置条件：email='bad-email'
- 操作：registerSchema.safeParse(input)
- 可观测结果与当前实际（期望）：success=false；message='邮箱格式不正确'
- 当前实际：断言全部成立，与本行期望一致（实测值：success=false；message='邮箱格式不正确'）
- 判定：**PASS**（耗时 1.1ms）

### UNIT-41 用户名与密码非空时通过
- 级别 / 类型：单元 / 正常
- 前置条件：input={username:'alice_01',password:'Passw0rd123'}
- 操作：loginSchema.parse(input)
- 可观测结果与当前实际（期望）：username='alice_01'
- 当前实际：断言全部成立，与本行期望一致（实测值：username='alice_01'）
- 判定：**PASS**（耗时 1ms）

### UNIT-42 空密码被拒绝（边界）
- 级别 / 类型：单元 / 边界
- 前置条件：password=''
- 操作：loginSchema.safeParse(input)
- 可观测结果与当前实际（期望）：success=false
- 当前实际：断言全部成立，与本行期望一致（实测值：success=false）
- 判定：**PASS**（耗时 0.4ms）

### UNIT-43 缺少用户名被拒绝
- 级别 / 类型：单元 / 失败
- 前置条件：input 仅含 password
- 操作：loginSchema.safeParse(input)
- 可观测结果与当前实际（期望）：success=false
- 当前实际：断言全部成立，与本行期望一致（实测值：success=false）
- 判定：**PASS**（耗时 0.3ms）

### UNIT-44 refreshToken 非空时通过
- 级别 / 类型：单元 / 正常
- 前置条件：input={refreshToken:'token-value'}
- 操作：refreshSchema.parse(input)
- 可观测结果与当前实际（期望）：refreshToken='token-value'
- 当前实际：断言全部成立，与本行期望一致（实测值：refreshToken='token-value'）
- 判定：**PASS**（耗时 0.7ms）

### UNIT-45 空 refreshToken 被拒绝（边界）
- 级别 / 类型：单元 / 边界
- 前置条件：refreshToken=''
- 操作：refreshSchema.safeParse(input)
- 可观测结果与当前实际（期望）：success=false
- 当前实际：断言全部成立，与本行期望一致（实测值：success=false）
- 判定：**PASS**（耗时 0.2ms）

### UNIT-12 合法配置通过并应用默认端口
- 级别 / 类型：单元 / 正常
- 前置条件：raw={DATABASE_URL:'file:./x.db',JWT_SECRET:'secret'}
- 操作：parseEnv(raw)
- 可观测结果与当前实际（期望）：success=true；BACKEND_PORT=3000；FRONTEND_PORT=5173；DATABASE_URL='file:./x.db'；JWT_SECRET='secret'
- 当前实际：断言全部成立，与本行期望一致（实测值：success=true；BACKEND_PORT=3000；FRONTEND_PORT=5173；DATABASE_URL='file:./x.db'；JWT_SECRET='secret'）
- 判定：**PASS**（耗时 3.5ms）

### UNIT-13 缺少 DATABASE_URL 失败并给出具体字段
- 级别 / 类型：单元 / 失败
- 前置条件：raw 仅含 JWT_SECRET
- 操作：parseEnv(raw)
- 可观测结果与当前实际（期望）：success=false；issues 路径包含 'DATABASE_URL'
- 当前实际：断言全部成立，与本行期望一致（实测值：success=false；issues 路径包含 'DATABASE_URL'）
- 判定：**PASS**（耗时 3ms）

### UNIT-14 缺少 JWT_SECRET 失败并给出具体字段
- 级别 / 类型：单元 / 失败
- 前置条件：raw 仅含 DATABASE_URL
- 操作：parseEnv(raw)
- 可观测结果与当前实际（期望）：success=false；issues 路径包含 'JWT_SECRET'
- 当前实际：断言全部成立，与本行期望一致（实测值：success=false；issues 路径包含 'JWT_SECRET'）
- 判定：**PASS**（耗时 0.9ms）

### UNIT-15 端口不是数字时失败（边界）
- 级别 / 类型：单元 / 边界
- 前置条件：raw 中 BACKEND_PORT='abc'
- 操作：parseEnv(raw)
- 可观测结果与当前实际（期望）：success=false
- 当前实际：断言全部成立，与本行期望一致（实测值：success=false）
- 判定：**PASS**（耗时 0.8ms）

### UNIT-05 BusinessError 404 映射为 HTTP 404 / code 404
- 级别 / 类型：单元 / 失败
- 前置条件：路由抛出 BusinessError('任务不存在',404)
- 操作：GET /business
- 可观测结果与当前实际（期望）：HTTP 404；body={code:404,msg:'任务不存在',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 404；body={code:404,msg:'任务不存在',data:null}）
- 判定：**PASS**（耗时 66.2ms）

### UNIT-06 AuthError 映射为 HTTP 401 / code 401
- 级别 / 类型：单元 / 失败
- 前置条件：路由抛出 AuthError
- 操作：GET /auth
- 可观测结果与当前实际（期望）：HTTP 401；body={code:401,msg:'未认证或登录已过期',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；body={code:401,msg:'未认证或登录已过期',data:null}）
- 判定：**PASS**（耗时 9.5ms）

### UNIT-07 ZodError 映射为 400 且带字段路径
- 级别 / 类型：单元 / 失败
- 前置条件：路由内 submitJobSchema.parse({}) 抛 ZodError
- 操作：GET /zod
- 可观测结果与当前实际（期望）：HTTP 400；code=400；msg 包含 'type'；data=null
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；code=400；msg 包含 'type'；data=null）
- 判定：**PASS**（耗时 10.3ms）

### UNIT-08 Prisma P2002 唯一约束冲突映射为 409
- 级别 / 类型：单元 / 失败
- 前置条件：路由抛 PrismaClientKnownRequestError(code=P2002)
- 操作：GET /prisma-unique
- 可观测结果与当前实际（期望）：HTTP 409；body={code:409,msg:'资源已存在（唯一约束冲突）',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 409；body={code:409,msg:'资源已存在（唯一约束冲突）',data:null}）
- 判定：**PASS**（耗时 7.5ms）

### UNIT-09 JSON 解析错误映射为 400
- 级别 / 类型：单元 / 失败
- 前置条件：路由抛带 body 的 SyntaxError（模拟 express.json 解析失败）
- 操作：GET /json-parse
- 可观测结果与当前实际（期望）：HTTP 400；body={code:400,msg:'请求体不是合法的 JSON',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；body={code:400,msg:'请求体不是合法的 JSON',data:null}）
- 判定：**PASS**（耗时 7.8ms）

### UNIT-10 依赖不可达（ECONNREFUSED）映射为 500 且不泄露堆栈
- 级别 / 类型：单元 / 失败
- 前置条件：路由抛 'connect ECONNREFUSED 127.0.0.1:5432'
- 操作：GET /dependency-down
- 可观测结果与当前实际（期望）：HTTP 500；body={code:500,msg:'服务器内部错误',data:null}；body 不含 'ECONNREFUSED' 与堆栈片段 'at '
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 500；body={code:500,msg:'服务器内部错误',data:null}；body 不含 'ECONNREFUSED' 与堆栈片段 'at '）
- 判定：**PASS**（耗时 6.5ms）

### UNIT-11 每次错误都会记录日志
- 级别 / 类型：单元 / 正常
- 前置条件：spy 包装 console.error
- 操作：GET /business
- 可观测结果与当前实际（期望）：console.error 至少被调用 1 次
- 当前实际：断言全部成立，与本行期望一致（实测值：console.error 至少被调用 1 次）
- 判定：**PASS**（耗时 6.6ms）

### EXTRA-184 合法音符：velocity 缺省为 100
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 6.6ms）

### EXTRA-185 pitch 0 / 127、velocity 0 / 127、durationTicks 480 为合法边界
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 0.8ms）

### EXTRA-186 pitch 超出 0-127 返回 spec 指定错误信息
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1.3ms）

### EXTRA-187 pitch 非整数返回「音高必须是整数」
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 0.8ms）

### EXTRA-188 startTimeTicks 为负、durationTicks 小于 480、velocity 超界分别返回错误
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 0.9ms）

### EXTRA-189 数组内任意一个音符非法时整体失败
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 0.9ms）

### EXTRA-190 空数组与非数组均失败
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 0.7ms）

### EXTRA-191 缺少 id 返回「音符 id 不能为空」
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 2ms）

### EXTRA-192 空数组失败，单条部分更新成功
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1.4ms）

### EXTRA-193 允许部分更新，且不接受 id 字段
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 2ms）

### EXTRA-194 非法 durationTicks 返回错误信息
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 0.4ms）

### EXTRA-195 空 noteIds 返回「noteIds 不能为空」
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 0.8ms）

### EXTRA-196 合法 id 列表通过
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 0.3ms）

### UNIT-01 原始值被包装为 {code:0,msg:'ok',data}
- 级别 / 类型：单元 / 正常
- 前置条件：Express 应用挂载 responseMiddleware，路由 res.json('hello')
- 操作：GET /primitive
- 可观测结果与当前实际（期望）：HTTP 200；body={code:0,msg:'ok',data:'hello'}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；body={code:0,msg:'ok',data:'hello'}）
- 判定：**PASS**（耗时 59ms）

### UNIT-02 对象被包装，字段值不丢失
- 级别 / 类型：单元 / 正常
- 前置条件：路由返回 {value:42}
- 操作：GET /object
- 可观测结果与当前实际（期望）：body={code:0,msg:'ok',data:{value:42}}
- 当前实际：断言全部成立，与本行期望一致（实测值：body={code:0,msg:'ok',data:{value:42}}）
- 判定：**PASS**（耗时 10.4ms）

### UNIT-03 undefined 被归一化为 data:null
- 级别 / 类型：单元 / 边界
- 前置条件：路由调用 res.json(undefined)
- 操作：GET /undefined
- 可观测结果与当前实际（期望）：body={code:0,msg:'ok',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：body={code:0,msg:'ok',data:null}）
- 判定：**PASS**（耗时 6.9ms）

### UNIT-04 rawResponse 标记时跳过包装（供错误中间件使用）
- 级别 / 类型：单元 / 边界
- 前置条件：res.locals.rawResponse=true 后返回 {code:409,msg:'冲突',data:null}
- 操作：GET /raw
- 可观测结果与当前实际（期望）：HTTP 409；body 原样输出，无二次包装
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 409；body 原样输出，无二次包装）
- 判定：**PASS**（耗时 8.9ms）

### EXTRA-201 addNote：先写库，再追加音符并清空 future 栈
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 14.1ms）

### EXTRA-202 undo 撤销新增 → 调用 bulkDeleteNotes 删除；redo 重做 → bulkCreateNotes 重建并回填新 id
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 3.4ms）

### EXTRA-203 updateNotes：用服务端返回值覆盖本地音符
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 3ms）

### EXTRA-204 deleteNotes 后 undo：按快照重建音符（服务端新 id 回填本地）
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 2.6ms）

### EXTRA-205 新的编辑会清空 future（撤销后再编辑无法重做旧分支）
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1.5ms）

### EXTRA-206 没有可撤销记录时 undo 不调用任何接口
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1.2ms）

### EXTRA-207 toggleTrackFlag 调 updateTrack 并同步 store
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1.1ms）

### UNIT-46 生成 6 位数字房间号，100 次调用均在 100000-999999 且不重复
- 级别 / 类型：单元 / 正常
- 前置条件：Room 表为空
- 操作：连续调用 generateRoomNumber() 100 次
- 可观测结果与当前实际（期望）：100 个值均为 6 位数字、范围 100000-999999、Set 大小 100
- 当前实际：断言全部成立，与本行期望一致（实测值：100 个值均为 6 位数字、范围 100000-999999、Set 大小 100）
- 判定：**PASS**（耗时 213.7ms）

### UNIT-47 移除 passwordHash 并保留房间与成员信息
- 级别 / 类型：单元 / 正常
- 前置条件：构造含 passwordHash 与 owner/members 关系的 room 对象
- 操作：serializeRoom(room)
- 可观测结果与当前实际（期望）：结果无 passwordHash，owner={id:'user_1',username:'alice'}，members 长度 1 且 role='owner'
- 当前实际：断言全部成立，与本行期望一致（实测值：结果无 passwordHash，owner={id:'user_1',username:'alice'}，members 长度 1 且 role='owner'）
- 判定：**PASS**（耗时 6.7ms）

### UNIT-48 无 owner / members 关系时返回 null 与空数组（边界）
- 级别 / 类型：单元 / 边界
- 前置条件：room 未加载 owner / members 关系
- 操作：serializeRoom(room)
- 可观测结果与当前实际（期望）：owner=null、members=[]、无 passwordHash
- 当前实际：断言全部成立，与本行期望一致（实测值：owner=null、members=[]、无 passwordHash）
- 判定：**PASS**（耗时 3.5ms）

### UNIT-58 requireRoomRole：房间不存在返回 404 房间不存在
- 级别 / 类型：单元 / 失败
- 前置条件：req.params.roomId='missing_room'
- 操作：requireRoomRole(owner)(req,res,next)
- 可观测结果与当前实际（期望）：next 收到 BusinessError(code=404,msg='房间不存在')
- 当前实际：断言全部成立，与本行期望一致（实测值：next 收到 BusinessError(code=404,msg='房间不存在')）
- 判定：**PASS**（耗时 121.5ms）

### UNIT-59 非成员返回 403 不是房间成员
- 级别 / 类型：单元 / 失败
- 前置条件：userId 无对应 RoomMember 记录
- 操作：requireRoomRole(owner)(req,res,next)
- 可观测结果与当前实际（期望）：next 收到 BusinessError(code=403,msg='不是房间成员')
- 当前实际：断言全部成立，与本行期望一致（实测值：next 收到 BusinessError(code=403,msg='不是房间成员')）
- 判定：**PASS**（耗时 101.8ms）

### UNIT-60 普通成员调用房主操作返回 403 无权限
- 级别 / 类型：单元 / 失败
- 前置条件：member 角色用户调用 requireRoomRole(owner)
- 操作：requireRoomRole(owner)(req,res,next)
- 可观测结果与当前实际（期望）：next 收到 BusinessError(code=403,msg='无权限')
- 当前实际：断言全部成立，与本行期望一致（实测值：next 收到 BusinessError(code=403,msg='无权限')）
- 判定：**PASS**（耗时 104.7ms）

### UNIT-61 房主调用房主操作通过并注入 req.room 与 memberRole
- 级别 / 类型：单元 / 正常
- 前置条件：owner 角色用户调用 requireRoomRole(owner)
- 操作：requireRoomRole(owner)(req,res,next)
- 可观测结果与当前实际（期望）：next 无错误、req.room.id='room_test_01'、req.memberRole='owner'
- 当前实际：断言全部成立，与本行期望一致（实测值：next 无错误、req.room.id='room_test_01'、req.memberRole='owner'）
- 判定：**PASS**（耗时 103.3ms）

### UNIT-62 普通成员调用 member 级操作通过，房主同样通过
- 级别 / 类型：单元 / 正常
- 前置条件：member 与 owner 分别调用 requireRoomRole(member)
- 操作：requireRoomRole(member)(req,res,next)
- 可观测结果与当前实际（期望）：两次 next 均无错误；memberRole 分别为 'member' 与 'owner'
- 当前实际：断言全部成立，与本行期望一致（实测值：两次 next 均无错误；memberRole 分别为 'member' 与 'owner'）
- 判定：**PASS**（耗时 108ms）

### UNIT-49 公开房间：合法房间名通过并默认 isPublic=true
- 级别 / 类型：单元 / 正常
- 前置条件：input={name:'我的乐队'}
- 操作：createRoomSchema.safeParse(input)
- 可观测结果与当前实际（期望）：success=true、data.isPublic=true
- 当前实际：断言全部成立，与本行期望一致（实测值：success=true、data.isPublic=true）
- 判定：**PASS**（耗时 6.5ms）

### UNIT-50 房间名 1 与 50 字符为合法边界
- 级别 / 类型：单元 / 边界
- 前置条件：name 长度分别为 1 和 50
- 操作：createRoomSchema.safeParse(input)
- 可观测结果与当前实际（期望）：两次 success=true
- 当前实际：断言全部成立，与本行期望一致（实测值：两次 success=true）
- 判定：**PASS**（耗时 0.9ms）

### UNIT-51 房间名空串与 51 字符返回错误且消息与 spec 一致
- 级别 / 类型：单元 / 失败
- 前置条件：name='' 与 name 长度 51
- 操作：createRoomSchema.safeParse(input)
- 可观测结果与当前实际（期望）：success=false、issues[0].message='房间名长度必须在 1-50 字符之间'
- 当前实际：断言全部成立，与本行期望一致（实测值：success=false、issues[0].message='房间名长度必须在 1-50 字符之间'）
- 判定：**PASS**（耗时 1.5ms）

### UNIT-52 私有房间密码 8 与 32 字符为合法边界
- 级别 / 类型：单元 / 边界
- 前置条件：isPublic=false，password 长度 8 和 32
- 操作：createRoomSchema.safeParse(input)
- 可观测结果与当前实际（期望）：两次 success=true
- 当前实际：断言全部成立，与本行期望一致（实测值：两次 success=true）
- 判定：**PASS**（耗时 0.8ms）

### UNIT-53 私有房间缺少密码或密码长度越界返回错误
- 级别 / 类型：单元 / 失败
- 前置条件：isPublic=false，password 缺失 / 7 字符 / 33 字符
- 操作：createRoomSchema.safeParse(input)
- 可观测结果与当前实际（期望）：三次 success=false、issues[0].message='私有房间密码长度必须在 8-32 位之间'
- 当前实际：断言全部成立，与本行期望一致（实测值：三次 success=false、issues[0].message='私有房间密码长度必须在 8-32 位之间'）
- 判定：**PASS**（耗时 1.2ms）

### UNIT-54 缺少 name 或 isPublic 非布尔值返回错误
- 级别 / 类型：单元 / 失败
- 前置条件：input 无 name；isPublic='yes'
- 操作：createRoomSchema.safeParse(input)
- 可观测结果与当前实际（期望）：两次 success=false
- 当前实际：断言全部成立，与本行期望一致（实测值：两次 success=false）
- 判定：**PASS**（耗时 0.4ms）

### UNIT-55 空对象（公开房间不带密码）通过
- 级别 / 类型：单元 / 正常
- 前置条件：input={}
- 操作：joinRoomSchema.safeParse(input)
- 可观测结果与当前实际（期望）：success=true
- 当前实际：断言全部成立，与本行期望一致（实测值：success=true）
- 判定：**PASS**（耗时 1.2ms）

### UNIT-56 密码 8 与 32 字符为合法边界
- 级别 / 类型：单元 / 边界
- 前置条件：password 长度 8 和 32
- 操作：joinRoomSchema.safeParse(input)
- 可观测结果与当前实际（期望）：两次 success=true
- 当前实际：断言全部成立，与本行期望一致（实测值：两次 success=true）
- 判定：**PASS**（耗时 0.4ms）

### UNIT-57 密码 7 与 33 字符返回错误
- 级别 / 类型：单元 / 失败
- 前置条件：password 长度 7 和 33
- 操作：joinRoomSchema.safeParse(input)
- 可观测结果与当前实际（期望）：两次 success=false、issues[0].message='私有房间密码长度必须在 8-32 位之间'
- 当前实际：断言全部成立，与本行期望一致（实测值：两次 success=false、issues[0].message='私有房间密码长度必须在 8-32 位之间'）
- 判定：**PASS**（耗时 1.3ms）

### EXTRA-225 四种乐器类型均合法
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 6.8ms）

### EXTRA-226 轨道名 0 / 1 / 50 / 51 字符边界
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 2.6ms）

### EXTRA-227 轨道名会 trim 后再校验
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 0.4ms）

### EXTRA-228 非法乐器类型返回 spec 指定错误信息
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 0.8ms）

### EXTRA-229 颜色必须是 6 位十六进制，缺省时允许
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1ms）

### EXTRA-230 允许部分字段更新，position 0 为合法下界
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 2.6ms）

### EXTRA-231 position 为负返回 spec 指定错误信息
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 0.6ms）

### EXTRA-232 非法颜色返回错误信息
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 0.4ms）

### EXTRA-233 instrumentType / roomId 不可修改：未知字段被剥离
- 级别 / 类型：未分类 / 未分类
- 前置条件：见测试代码
- 操作：见测试代码
- 可观测结果与当前实际（期望）：见测试代码断言
- 当前实际：断言全部成立，与本行期望一致（实测值：见测试代码断言）
- 判定：**PASS**（耗时 1ms）

### UNIT-16 合法 body 通过并保留 payload
- 级别 / 类型：单元 / 正常
- 前置条件：input={type:'test',payload:{foo:'bar'}}
- 操作：submitJobSchema.parse(input)
- 可观测结果与当前实际（期望）：type='test'；payload={foo:'bar'}
- 当前实际：断言全部成立，与本行期望一致（实测值：type='test'；payload={foo:'bar'}）
- 判定：**PASS**（耗时 7.1ms）

### UNIT-17 payload 可省略
- 级别 / 类型：单元 / 边界
- 前置条件：input={type:'test'}
- 操作：submitJobSchema.parse(input)
- 可观测结果与当前实际（期望）：type='test'；payload=undefined
- 当前实际：断言全部成立，与本行期望一致（实测值：type='test'；payload=undefined）
- 判定：**PASS**（耗时 0.6ms）

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
- 判定：**PASS**（耗时 1.2ms）

### UNIT-20 task id 为空被拒绝
- 级别 / 类型：单元 / 失败
- 前置条件：input={id:''}
- 操作：jobIdSchema.parse(input)
- 可观测结果与当前实际（期望）：抛出校验错误
- 当前实际：断言全部成立，与本行期望一致（实测值：抛出校验错误）
- 判定：**PASS**（耗时 1.3ms）

### UNIT-21 已注册 handler 执行成功后状态 pending → running → success 并写入结果
- 级别 / 类型：单元 / 状态流转
- 前置条件：注册 test:echo handler；Job type='test:echo'、payload={value:42}、status=pending
- 操作：runJob(job.id)
- 可观测结果与当前实际（期望）：status='success'；result={value:42}；retryCount=0；error=null；startedAt/completedAt 均非空
- 当前实际：断言全部成立，与本行期望一致（实测值：status='success'；result={value:42}；retryCount=0；error=null；startedAt/completedAt 均非空）
- 判定：**PASS**（耗时 66ms）

### UNIT-22 未注册类型直接标记 failed 并记录错误
- 级别 / 类型：单元 / 失败
- 前置条件：Job type='test:unregistered'，无对应 handler
- 操作：runJob(job.id)
- 可观测结果与当前实际（期望）：status='failed'；retryCount=0；error='未注册的任务类型: test:unregistered'；completedAt 非空
- 当前实际：断言全部成立，与本行期望一致（实测值：status='failed'；retryCount=0；error='未注册的任务类型: test:unregistered'；completedAt 非空）
- 判定：**PASS**（耗时 57.7ms）

### UNIT-23 重试次数耗尽后标记最终 failed
- 级别 / 类型：单元 / 状态流转
- 前置条件：test:always-fail handler 抛 Error('boom')；Job retryCount=3、maxRetries=3
- 操作：runJob(job.id)
- 可观测结果与当前实际（期望）：status='failed'；retryCount=3；error='boom'；completedAt 非空
- 当前实际：断言全部成立，与本行期望一致（实测值：status='failed'；retryCount=3；error='boom'；completedAt 非空）
- 判定：**PASS**（耗时 52.4ms）

### UNIT-24 并发重复领取同一任务时 handler 只执行一次
- 级别 / 类型：单元 / 并发
- 前置条件：注册 test:concurrent-once handler 计数；同一 pending Job
- 操作：Promise.all([runJob(id), runJob(id)])
- 可观测结果与当前实际（期望）：handler 调用次数=1；status='success'；result={ok:true}
- 当前实际：断言全部成立，与本行期望一致（实测值：handler 调用次数=1；status='success'；result={ok:true}）
- 判定：**PASS**（耗时 81.2ms）
