# 安全前置检查（security-precheck）

- 生成时间：2026-11-06 11:20:05
- 提交号：6c863aa
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
| * | 未匹配路径 | 无 | - | 404 |

## 身份与数据

- 身份：register/login 公开；GET /auth/me 要求 access token，POST /auth/refresh 要求 refresh token。缺失/格式错误 → 401 未登录，过期 → 401 令牌已过期，签名非法或 token 类型不匹配 → 401 令牌无效（API-29 ~ API-33、API-37 ~ API-39）。
- 数据：测试仅写入独立 SQLite（backend/prisma/test.db），每个用例前清空 User / Job 表；口令只以 bcrypt cost 12 哈希落库且不回传（API-15），JWT payload 仅含 sub/type/iat/exp，不含用户名或邮箱（API-24）。
- 接口级用例：41 条（正常 / 失败 / 边界均已覆盖）；全部用例：86 条。

## 用例三段式记录

### API-15 注册成功：返回用户信息、密码以 bcrypt cost 12 哈希落库且不回传哈希
- 级别 / 类型：接口 / 正常 / POST /api/v1/auth/register
- 前置条件：测试库已迁移且 User 表为空；body={username:'alice_01',password:'Passw0rd123',email:'alice@example.com'}
- 操作：POST /api/v1/auth/register
- 可观测结果与当前实际（期望）：HTTP 200；code=0；data 含 id/username/email/createdAt 且无 passwordHash；User count=1；落库 passwordHash 前缀 $2、cost=12、不等于明文
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；code=0；data 含 id/username/email/createdAt 且无 passwordHash；User count=1；落库 passwordHash 前缀 $2、cost=12、不等于明文）
- 判定：**PASS**（耗时 621.3ms）

### API-16 重复用户名返回 409 且消息与 spec 一致
- 级别 / 类型：接口 / 失败 / POST /api/v1/auth/register
- 前置条件：同一用户名 alice_01 已注册；再次提交不同 email
- 操作：POST /api/v1/auth/register
- 可观测结果与当前实际（期望）：HTTP 409；body={code:409,msg:'用户名已被占用',data:null}；User count 仍为 1
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 409；body={code:409,msg:'用户名已被占用',data:null}；User count 仍为 1）
- 判定：**PASS**（耗时 920.3ms）

### API-17 邮箱格式不正确返回 400
- 级别 / 类型：接口 / 失败 / POST /api/v1/auth/register
- 前置条件：body 中 email='not-an-email'
- 操作：POST /api/v1/auth/register
- 可观测结果与当前实际（期望）：HTTP 400；code=400；msg='邮箱格式不正确'；data=null；User count=0
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；code=400；msg='邮箱格式不正确'；data=null；User count=0）
- 判定：**PASS**（耗时 17.8ms）

### API-18 密码不含数字返回 400 且消息与 spec 一致
- 级别 / 类型：接口 / 失败 / POST /api/v1/auth/register
- 前置条件：body 中 password='OnlyLetters'
- 操作：POST /api/v1/auth/register
- 可观测结果与当前实际（期望）：HTTP 400；msg='密码至少 8 位且需包含字母和数字'；User count=0
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；msg='密码至少 8 位且需包含字母和数字'；User count=0）
- 判定：**PASS**（耗时 9.3ms）

### API-19 密码少于 8 位返回 400（边界）
- 级别 / 类型：接口 / 边界 / POST /api/v1/auth/register
- 前置条件：body 中 password='Ab1'（长度 3）
- 操作：POST /api/v1/auth/register
- 可观测结果与当前实际（期望）：HTTP 400；msg='密码至少 8 位且需包含字母和数字'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；msg='密码至少 8 位且需包含字母和数字'）
- 判定：**PASS**（耗时 6.9ms）

### API-20 用户名含非法字符返回 400
- 级别 / 类型：接口 / 失败 / POST /api/v1/auth/register
- 前置条件：body 中 username='bad name!'
- 操作：POST /api/v1/auth/register
- 可观测结果与当前实际（期望）：HTTP 400；msg='用户名需为 3-32 位字母、数字或下划线'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；msg='用户名需为 3-32 位字母、数字或下划线'）
- 判定：**PASS**（耗时 6.6ms）

### API-21 用户名为 2 位返回 400（长度下边界）
- 级别 / 类型：接口 / 边界 / POST /api/v1/auth/register
- 前置条件：body 中 username='ab'（长度 2）
- 操作：POST /api/v1/auth/register
- 可观测结果与当前实际（期望）：HTTP 400；msg='用户名需为 3-32 位字母、数字或下划线'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；msg='用户名需为 3-32 位字母、数字或下划线'）
- 判定：**PASS**（耗时 6.9ms）

### API-22 邮箱可省略，落库为 null（边界）
- 级别 / 类型：接口 / 边界 / POST /api/v1/auth/register
- 前置条件：body 不含 email 字段
- 操作：POST /api/v1/auth/register
- 可观测结果与当前实际（期望）：HTTP 200；data.email=null；User 表中该用户 email=null
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；data.email=null；User 表中该用户 email=null）
- 判定：**PASS**（耗时 498.2ms）

### API-23 登录成功返回双令牌与用户信息，access 15min / refresh 7d
- 级别 / 类型：接口 / 正常 / POST /api/v1/auth/login
- 前置条件：已注册 alice_01；body={username:'alice_01',password:'Passw0rd123'}
- 操作：POST /api/v1/auth/login
- 可观测结果与当前实际（期望）：HTTP 200；data 含 accessToken/refreshToken/user；access exp-iat=900；refresh exp-iat=604800
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；data 含 accessToken/refreshToken/user；access exp-iat=900；refresh exp-iat=604800）
- 判定：**PASS**（耗时 974.7ms）

### API-24 JWT payload 仅含 sub/type/iat/exp，不泄露 username 或 email
- 级别 / 类型：接口 / 正常 / POST /api/v1/auth/login
- 前置条件：已注册并登录成功
- 操作：对 access/refresh token 做 jwt.decode
- 可观测结果与当前实际（期望）：两组 payload 的 key 都恰为 [exp,iat,sub,type]；type 分别为 access / refresh
- 当前实际：断言全部成立，与本行期望一致（实测值：两组 payload 的 key 都恰为 [exp,iat,sub,type]；type 分别为 access / refresh）
- 判定：**PASS**（耗时 1105.4ms）

### API-25 用户名不存在返回 401 且不区分具体字段
- 级别 / 类型：接口 / 失败 / POST /api/v1/auth/login
- 前置条件：username='ghost_user' 不存在
- 操作：POST /api/v1/auth/login
- 可观测结果与当前实际（期望）：HTTP 401；body={code:401,msg:'用户名或密码错误',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；body={code:401,msg:'用户名或密码错误',data:null}）
- 判定：**PASS**（耗时 587.7ms）

### API-26 密码错误返回 401 且消息与用户名不存在一致
- 级别 / 类型：接口 / 失败 / POST /api/v1/auth/login
- 前置条件：已注册 alice_01；password='WrongPass123'
- 操作：POST /api/v1/auth/login
- 可观测结果与当前实际（期望）：HTTP 401；body={code:401,msg:'用户名或密码错误',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；body={code:401,msg:'用户名或密码错误',data:null}）
- 判定：**PASS**（耗时 1012.6ms）

### API-27 缺少密码返回 400（边界）
- 级别 / 类型：接口 / 边界 / POST /api/v1/auth/login
- 前置条件：body 仅含 username
- 操作：POST /api/v1/auth/login
- 可观测结果与当前实际（期望）：HTTP 400；msg='密码不能为空'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；msg='密码不能为空'）
- 判定：**PASS**（耗时 559ms）

### API-28 携带有效 access token 返回当前用户且不含 passwordHash
- 级别 / 类型：接口 / 正常 / GET /api/v1/auth/me
- 前置条件：已注册并登录，获取 access token
- 操作：GET /api/v1/auth/me，Authorization: Bearer <access>
- 可观测结果与当前实际（期望）：HTTP 200；code=0；data 含 username/email/createdAt；无 passwordHash / password 字段
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；code=0；data 含 username/email/createdAt；无 passwordHash / password 字段）
- 判定：**PASS**（耗时 949.3ms）

### API-29 缺少 Authorization 返回 401 未登录
- 级别 / 类型：接口 / 失败 / GET /api/v1/auth/me
- 前置条件：请求不带 Authorization 头
- 操作：GET /api/v1/auth/me
- 可观测结果与当前实际（期望）：HTTP 401；body={code:401,msg:'未登录',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；body={code:401,msg:'未登录',data:null}）
- 判定：**PASS**（耗时 986.1ms）

### API-30 Authorization 格式错误返回 401 未登录（边界）
- 级别 / 类型：接口 / 边界 / GET /api/v1/auth/me
- 前置条件：Authorization='Token <access>'（scheme 非 Bearer）
- 操作：GET /api/v1/auth/me
- 可观测结果与当前实际（期望）：HTTP 401；msg='未登录'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；msg='未登录'）
- 判定：**PASS**（耗时 942.3ms）

### API-31 签名无效的 access token 返回 401 令牌无效
- 级别 / 类型：接口 / 失败 / GET /api/v1/auth/me
- 前置条件：用 wrong-secret 伪造 access token
- 操作：GET /api/v1/auth/me，Authorization: Bearer <forged>
- 可观测结果与当前实际（期望）：HTTP 401；body={code:401,msg:'令牌无效',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；body={code:401,msg:'令牌无效',data:null}）
- 判定：**PASS**（耗时 992.5ms）

### API-32 过期的 access token 返回 401 令牌已过期
- 级别 / 类型：接口 / 失败 / GET /api/v1/auth/me
- 前置条件：用正确密钥签发 exp 已过期的 access token
- 操作：GET /api/v1/auth/me，Authorization: Bearer <expired>
- 可观测结果与当前实际（期望）：HTTP 401；body={code:401,msg:'令牌已过期',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；body={code:401,msg:'令牌已过期',data:null}）
- 判定：**PASS**（耗时 965.9ms）

### API-33 用 refresh token 访问受保护接口返回 401 令牌无效（令牌类型隔离）
- 级别 / 类型：接口 / 失败 / GET /api/v1/auth/me
- 前置条件：登录取得 refresh token
- 操作：GET /api/v1/auth/me，Authorization: Bearer <refresh>
- 可观测结果与当前实际（期望）：HTTP 401；msg='令牌无效'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；msg='令牌无效'）
- 判定：**PASS**（耗时 1495.8ms）

### API-34 合法签名但用户已不存在返回 401 未登录（依赖数据缺失）
- 级别 / 类型：接口 / 失败 / GET /api/v1/auth/me
- 前置条件：用正确密钥签发给不存在的用户 id
- 操作：GET /api/v1/auth/me，Authorization: Bearer <orphan>
- 可观测结果与当前实际（期望）：HTTP 401；msg='未登录'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；msg='未登录'）
- 判定：**PASS**（耗时 1069.7ms）

### API-35 有效 refresh token 换发新双令牌，新 access token 可访问 me
- 级别 / 类型：接口 / 正常 / POST /api/v1/auth/refresh
- 前置条件：登录取得 refresh token；body={refreshToken:<refresh>}
- 操作：POST /api/v1/auth/refresh；再用返回的 access 调 GET /me
- 可观测结果与当前实际（期望）：HTTP 200；data 含 accessToken/refreshToken；随后 GET /me 返回 HTTP 200 且 username='alice_01'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；data 含 accessToken/refreshToken；随后 GET /me 返回 HTTP 200 且 username='alice_01'）
- 判定：**PASS**（耗时 1013.8ms）

### API-36 也支持通过 Authorization header 提交 refresh token（边界）
- 级别 / 类型：接口 / 边界 / POST /api/v1/auth/refresh
- 前置条件：Authorization: Bearer <refresh>，body={}
- 操作：POST /api/v1/auth/refresh
- 可观测结果与当前实际（期望）：HTTP 200；data.accessToken 为非空字符串
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；data.accessToken 为非空字符串）
- 判定：**PASS**（耗时 973.2ms）

### API-37 用 access token 调用 refresh 返回 401 令牌无效
- 级别 / 类型：接口 / 失败 / POST /api/v1/auth/refresh
- 前置条件：body={refreshToken:<access>}
- 操作：POST /api/v1/auth/refresh
- 可观测结果与当前实际（期望）：HTTP 401；msg='令牌无效'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；msg='令牌无效'）
- 判定：**PASS**（耗时 1037.3ms）

### API-41 旧 access token 在有效期内仍可访问 me（无状态 JWT，不做黑名单）
- 级别 / 类型：接口 / 边界 / POST /api/v1/auth/refresh
- 前置条件：登录取得 access/refresh token；先用 refresh token 换发新令牌
- 操作：刷新后仍用刷新前的旧 access token 调 GET /api/v1/auth/me
- 可观测结果与当前实际（期望）：refresh 返回 HTTP 200；旧 access token 调 me 返回 HTTP 200 且 username='alice_01'（与 design 无黑名单一致）
- 当前实际：断言全部成立，与本行期望一致（实测值：refresh 返回 HTTP 200；旧 access token 调 me 返回 HTTP 200 且 username='alice_01'（与 design 无黑名单一致））
- 判定：**PASS**（耗时 1016.2ms）

### API-38 签名无效的 refresh token 返回 401 令牌无效
- 级别 / 类型：接口 / 失败 / POST /api/v1/auth/refresh
- 前置条件：用 wrong-secret 伪造 refresh token
- 操作：POST /api/v1/auth/refresh
- 可观测结果与当前实际（期望）：HTTP 401；msg='令牌无效'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；msg='令牌无效'）
- 判定：**PASS**（耗时 944.2ms）

### API-39 过期的 refresh token 返回 401 令牌已过期
- 级别 / 类型：接口 / 失败 / POST /api/v1/auth/refresh
- 前置条件：用正确密钥签发 exp 已过期的 refresh token
- 操作：POST /api/v1/auth/refresh
- 可观测结果与当前实际（期望）：HTTP 401；body={code:401,msg:'令牌已过期',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；body={code:401,msg:'令牌已过期',data:null}）
- 判定：**PASS**（耗时 973ms）

### API-40 缺少 refreshToken 返回 401 未登录（边界）
- 级别 / 类型：接口 / 边界 / POST /api/v1/auth/refresh
- 前置条件：body={} 且无 Authorization 头
- 操作：POST /api/v1/auth/refresh
- 可观测结果与当前实际（期望）：HTTP 401；body={code:401,msg:'未登录',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；body={code:401,msg:'未登录',data:null}）
- 判定：**PASS**（耗时 985.9ms）

### API-01 GET /health 返回统一格式且带安全响应头
- 级别 / 类型：接口 / 正常 / GET /health
- 前置条件：应用已组装（createApp），无需认证；请求带允许来源 Origin=http://localhost:5173
- 操作：GET /health
- 可观测结果与当前实际（期望）：HTTP 200；body={code:0,msg:'ok',data:{status:'UP'}}；存在 x-content-type-options: nosniff；access-control-allow-origin=http://localhost:5173
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；body={code:0,msg:'ok',data:{status:'UP'}}；存在 x-content-type-options: nosniff；access-control-allow-origin=http://localhost:5173）
- 判定：**PASS**（耗时 56ms）

### API-02 GET /api/v1/health 可访问（双挂载边界）
- 级别 / 类型：接口 / 边界 / GET /api/v1/health
- 前置条件：同一健康路由同时挂在 / 与 /api/v1 下
- 操作：GET /api/v1/health
- 可观测结果与当前实际（期望）：HTTP 200；body.code=0；body.data.status='UP'
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；body.code=0；body.data.status='UP'）
- 判定：**PASS**（耗时 8.5ms）

### API-03 GET /api/v1/hello 返回统一响应格式
- 级别 / 类型：接口 / 正常 / GET /api/v1/hello
- 前置条件：应用已组装，无需认证
- 操作：GET /api/v1/hello
- 可观测结果与当前实际（期望）：HTTP 200；body={code:0,msg:'ok',data:'Hello from Jam Box backend'}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；body={code:0,msg:'ok',data:'Hello from Jam Box backend'}）
- 判定：**PASS**（耗时 6.3ms）

### API-04 GET /health 对未允许来源返回 CORS 错误（500 由中间件统一格式）
- 级别 / 类型：接口 / 失败 / GET /health
- 前置条件：请求头 Origin=http://evil.example.com（不在允许列表）
- 操作：GET /health
- 可观测结果与当前实际（期望）：HTTP 500；body={code:500,msg:'服务器内部错误',data:null}；无 access-control-allow-origin 响应头
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 500；body={code:500,msg:'服务器内部错误',data:null}；无 access-control-allow-origin 响应头）
- 判定：**PASS**（耗时 10.1ms）

### API-05 提交合法任务后落库，返回 pending 任务结构
- 级别 / 类型：接口 / 正常 / POST /api/v1/jobs
- 前置条件：测试库已迁移且 Job 表为空；body={type:'test',payload:{foo:'bar'}}
- 操作：POST /api/v1/jobs
- 可观测结果与当前实际（期望）：HTTP 200；data.status='pending'，retryCount=0，maxRetries=3，payload={foo:'bar'}，result=null，error=null；Job 表 count=1
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；data.status='pending'，retryCount=0，maxRetries=3，payload={foo:'bar'}，result=null，error=null；Job 表 count=1）
- 判定：**PASS**（耗时 104.4ms）

### API-06 payload 缺省时允许创建，payload 为 null（边界）
- 级别 / 类型：接口 / 边界 / POST /api/v1/jobs
- 前置条件：测试库为空；body 仅含 type:'test'
- 操作：POST /api/v1/jobs
- 可观测结果与当前实际（期望）：HTTP 200；data.status='pending'；data.payload=null
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；data.status='pending'；data.payload=null）
- 判定：**PASS**（耗时 26.2ms）

### API-07 缺少 type 返回 400 与具体校验信息
- 级别 / 类型：接口 / 失败 / POST /api/v1/jobs
- 前置条件：测试库为空；body={payload:{}}（缺少必填 type）
- 操作：POST /api/v1/jobs
- 可观测结果与当前实际（期望）：HTTP 400；code=400；msg 包含 'type'；data=null；Job 表 count=0
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；code=400；msg 包含 'type'；data=null；Job 表 count=0）
- 判定：**PASS**（耗时 22.3ms）

### API-08 type 为空字符串返回 400（边界）
- 级别 / 类型：接口 / 边界 / POST /api/v1/jobs
- 前置条件：测试库为空；body={type:''}
- 操作：POST /api/v1/jobs
- 可观测结果与当前实际（期望）：HTTP 400；code=400；msg 包含 'type'；Job 表 count=0
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；code=400；msg 包含 'type'；Job 表 count=0）
- 判定：**PASS**（耗时 12.7ms）

### API-09 请求体为非法 JSON 返回 400 而不是 500
- 级别 / 类型：接口 / 失败 / POST /api/v1/jobs
- 前置条件：Content-Type=application/json；body 为残缺 JSON '{"type":'
- 操作：POST /api/v1/jobs
- 可观测结果与当前实际（期望）：HTTP 400；body={code:400,msg:'请求体不是合法的 JSON',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；body={code:400,msg:'请求体不是合法的 JSON',data:null}）
- 判定：**PASS**（耗时 11.1ms）

### API-10 查询已存在任务返回完整结构
- 级别 / 类型：接口 / 正常 / GET /api/v1/jobs/:id
- 前置条件：先 POST 创建 type='test'、payload={n:1} 的任务
- 操作：GET /api/v1/jobs/<created.id>
- 可观测结果与当前实际（期望）：HTTP 200；data.id 与创建返回值相同；data.status='pending'；data.payload={n:1}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；data.id 与创建返回值相同；data.status='pending'；data.payload={n:1}）
- 判定：**PASS**（耗时 26ms）

### API-11 查询不存在的任务返回 404 且错误码匹配
- 级别 / 类型：接口 / 失败 / GET /api/v1/jobs/:id
- 前置条件：测试库为空；路径 id='not-exists-id'
- 操作：GET /api/v1/jobs/not-exists-id
- 可观测结果与当前实际（期望）：HTTP 404；body={code:404,msg:'任务不存在',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 404；body={code:404,msg:'任务不存在',data:null}）
- 判定：**PASS**（耗时 19.4ms）

### API-12 未匹配的 API 路由返回统一 404 JSON
- 级别 / 类型：接口 / 失败 / GET /api/v1/unknown-route
- 前置条件：应用无该路由
- 操作：GET /api/v1/unknown-route
- 可观测结果与当前实际（期望）：HTTP 404；body={code:404,msg:'接口不存在',data:null}；content-type 含 application/json
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 404；body={code:404,msg:'接口不存在',data:null}；content-type 含 application/json）
- 判定：**PASS**（耗时 9.6ms）

### API-13 POST /api/v1/jobs/ 空路径（尾斜杠）返回统一 404
- 级别 / 类型：接口 / 边界 / GET /api/v1/jobs/
- 前置条件：尾斜杠路径无 GET 处理器（仅 POST /）
- 操作：GET /api/v1/jobs/
- 可观测结果与当前实际（期望）：HTTP 404；body.code=404；data=null
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 404；body.code=404；data=null）
- 判定：**PASS**（耗时 9ms）

### API-14 CORS 预检请求返回 204 并允许 POST
- 级别 / 类型：接口 / 边界 / OPTIONS /api/v1/jobs
- 前置条件：Origin=http://localhost:5173；Access-Control-Request-Method=POST
- 操作：OPTIONS /api/v1/jobs
- 可观测结果与当前实际（期望）：HTTP 204；access-control-allow-origin=http://localhost:5173；access-control-allow-methods 包含 POST
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 204；access-control-allow-origin=http://localhost:5173；access-control-allow-methods 包含 POST）
- 判定：**PASS**（耗时 5.7ms）

### UNIT-25 hashPassword 生成 cost 12 的 bcrypt 哈希且可正确比对
- 级别 / 类型：单元 / 正常
- 前置条件：明文 Passw0rd123
- 操作：hashPassword('Passw0rd123')；comparePassword 正确/错误明文
- 可观测结果与当前实际（期望）：哈希以 $2 开头、cost=12、不含明文；正确明文返回 true
- 当前实际：断言全部成立，与本行期望一致（实测值：哈希以 $2 开头、cost=12、不含明文；正确明文返回 true）
- 判定：**PASS**（耗时 885.6ms）

### UNIT-26 明文不匹配时 comparePassword 返回 false
- 级别 / 类型：单元 / 失败
- 前置条件：哈希由 Passw0rd123 生成
- 操作：comparePassword('WrongPass123', hash)
- 可观测结果与当前实际（期望）：返回 false
- 当前实际：断言全部成立，与本行期望一致（实测值：返回 false）
- 判定：**PASS**（耗时 882.2ms）

### UNIT-27 access token 的 payload 仅含 sub/type/iat/exp 且有效期 900 秒
- 级别 / 类型：单元 / 正常
- 前置条件：sub='user-1'
- 操作：signAccessToken('user-1') 后 decode
- 可观测结果与当前实际（期望）：sub='user-1'；type='access'；key 恰为 [exp,iat,sub,type]；exp-iat=900
- 当前实际：断言全部成立，与本行期望一致（实测值：sub='user-1'；type='access'；key 恰为 [exp,iat,sub,type]；exp-iat=900）
- 判定：**PASS**（耗时 6.3ms）

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
- 判定：**PASS**（耗时 3.3ms）

### UNIT-30 被篡改的 token 校验失败
- 级别 / 类型：单元 / 失败
- 前置条件：合法 access token 末两位替换为 xx
- 操作：verifyToken(tampered)
- 可观测结果与当前实际（期望）：抛 JsonWebTokenError
- 当前实际：断言全部成立，与本行期望一致（实测值：抛 JsonWebTokenError）
- 判定：**PASS**（耗时 2.9ms）

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
- 判定：**PASS**（耗时 6.5ms）

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
- 判定：**PASS**（耗时 1.4ms）

### UNIT-35 用户名超过 32 位被拒绝（边界）
- 级别 / 类型：单元 / 边界
- 前置条件：username='a'.repeat(33)
- 操作：registerSchema.safeParse(input)
- 可观测结果与当前实际（期望）：success=false
- 当前实际：断言全部成立，与本行期望一致（实测值：success=false）
- 判定：**PASS**（耗时 0.6ms）

### UNIT-36 用户名含非法字符被拒绝
- 级别 / 类型：单元 / 失败
- 前置条件：username='bad name'
- 操作：registerSchema.safeParse(input)
- 可观测结果与当前实际（期望）：success=false
- 当前实际：断言全部成立，与本行期望一致（实测值：success=false）
- 判定：**PASS**（耗时 0.4ms）

### UNIT-37 密码缺少数字被拒绝
- 级别 / 类型：单元 / 失败
- 前置条件：password='OnlyLetters'
- 操作：registerSchema.safeParse(input)
- 可观测结果与当前实际（期望）：success=false；message='密码至少 8 位且需包含字母和数字'
- 当前实际：断言全部成立，与本行期望一致（实测值：success=false；message='密码至少 8 位且需包含字母和数字'）
- 判定：**PASS**（耗时 0.6ms）

### UNIT-38 密码缺少字母被拒绝
- 级别 / 类型：单元 / 失败
- 前置条件：password='12345678'
- 操作：registerSchema.safeParse(input)
- 可观测结果与当前实际（期望）：success=false
- 当前实际：断言全部成立，与本行期望一致（实测值：success=false）
- 判定：**PASS**（耗时 0.4ms）

### UNIT-39 密码少于 8 位被拒绝（边界）
- 级别 / 类型：单元 / 边界
- 前置条件：password='Ab1'
- 操作：registerSchema.safeParse(input)
- 可观测结果与当前实际（期望）：success=false
- 当前实际：断言全部成立，与本行期望一致（实测值：success=false）
- 判定：**PASS**（耗时 0.4ms）

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
- 判定：**PASS**（耗时 1.2ms）

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
- 判定：**PASS**（耗时 4.7ms）

### UNIT-13 缺少 DATABASE_URL 失败并给出具体字段
- 级别 / 类型：单元 / 失败
- 前置条件：raw 仅含 JWT_SECRET
- 操作：parseEnv(raw)
- 可观测结果与当前实际（期望）：success=false；issues 路径包含 'DATABASE_URL'
- 当前实际：断言全部成立，与本行期望一致（实测值：success=false；issues 路径包含 'DATABASE_URL'）
- 判定：**PASS**（耗时 2.7ms）

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
- 判定：**PASS**（耗时 0.8ms）

### UNIT-05 BusinessError 404 映射为 HTTP 404 / code 404
- 级别 / 类型：单元 / 失败
- 前置条件：路由抛出 BusinessError('任务不存在',404)
- 操作：GET /business
- 可观测结果与当前实际（期望）：HTTP 404；body={code:404,msg:'任务不存在',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 404；body={code:404,msg:'任务不存在',data:null}）
- 判定：**PASS**（耗时 64.7ms）

### UNIT-06 AuthError 映射为 HTTP 401 / code 401
- 级别 / 类型：单元 / 失败
- 前置条件：路由抛出 AuthError
- 操作：GET /auth
- 可观测结果与当前实际（期望）：HTTP 401；body={code:401,msg:'未认证或登录已过期',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 401；body={code:401,msg:'未认证或登录已过期',data:null}）
- 判定：**PASS**（耗时 11.6ms）

### UNIT-07 ZodError 映射为 400 且带字段路径
- 级别 / 类型：单元 / 失败
- 前置条件：路由内 submitJobSchema.parse({}) 抛 ZodError
- 操作：GET /zod
- 可观测结果与当前实际（期望）：HTTP 400；code=400；msg 包含 'type'；data=null
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；code=400；msg 包含 'type'；data=null）
- 判定：**PASS**（耗时 11.8ms）

### UNIT-08 Prisma P2002 唯一约束冲突映射为 409
- 级别 / 类型：单元 / 失败
- 前置条件：路由抛 PrismaClientKnownRequestError(code=P2002)
- 操作：GET /prisma-unique
- 可观测结果与当前实际（期望）：HTTP 409；body={code:409,msg:'资源已存在（唯一约束冲突）',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 409；body={code:409,msg:'资源已存在（唯一约束冲突）',data:null}）
- 判定：**PASS**（耗时 6.9ms）

### UNIT-09 JSON 解析错误映射为 400
- 级别 / 类型：单元 / 失败
- 前置条件：路由抛带 body 的 SyntaxError（模拟 express.json 解析失败）
- 操作：GET /json-parse
- 可观测结果与当前实际（期望）：HTTP 400；body={code:400,msg:'请求体不是合法的 JSON',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 400；body={code:400,msg:'请求体不是合法的 JSON',data:null}）
- 判定：**PASS**（耗时 7.7ms）

### UNIT-10 依赖不可达（ECONNREFUSED）映射为 500 且不泄露堆栈
- 级别 / 类型：单元 / 失败
- 前置条件：路由抛 'connect ECONNREFUSED 127.0.0.1:5432'
- 操作：GET /dependency-down
- 可观测结果与当前实际（期望）：HTTP 500；body={code:500,msg:'服务器内部错误',data:null}；body 不含 'ECONNREFUSED' 与堆栈片段 'at '
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 500；body={code:500,msg:'服务器内部错误',data:null}；body 不含 'ECONNREFUSED' 与堆栈片段 'at '）
- 判定：**PASS**（耗时 6.3ms）

### UNIT-11 每次错误都会记录日志
- 级别 / 类型：单元 / 正常
- 前置条件：spy 包装 console.error
- 操作：GET /business
- 可观测结果与当前实际（期望）：console.error 至少被调用 1 次
- 当前实际：断言全部成立，与本行期望一致（实测值：console.error 至少被调用 1 次）
- 判定：**PASS**（耗时 5.5ms）

### UNIT-01 原始值被包装为 {code:0,msg:'ok',data}
- 级别 / 类型：单元 / 正常
- 前置条件：Express 应用挂载 responseMiddleware，路由 res.json('hello')
- 操作：GET /primitive
- 可观测结果与当前实际（期望）：HTTP 200；body={code:0,msg:'ok',data:'hello'}
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 200；body={code:0,msg:'ok',data:'hello'}）
- 判定：**PASS**（耗时 53.7ms）

### UNIT-02 对象被包装，字段值不丢失
- 级别 / 类型：单元 / 正常
- 前置条件：路由返回 {value:42}
- 操作：GET /object
- 可观测结果与当前实际（期望）：body={code:0,msg:'ok',data:{value:42}}
- 当前实际：断言全部成立，与本行期望一致（实测值：body={code:0,msg:'ok',data:{value:42}}）
- 判定：**PASS**（耗时 8.4ms）

### UNIT-03 undefined 被归一化为 data:null
- 级别 / 类型：单元 / 边界
- 前置条件：路由调用 res.json(undefined)
- 操作：GET /undefined
- 可观测结果与当前实际（期望）：body={code:0,msg:'ok',data:null}
- 当前实际：断言全部成立，与本行期望一致（实测值：body={code:0,msg:'ok',data:null}）
- 判定：**PASS**（耗时 5.9ms）

### UNIT-04 rawResponse 标记时跳过包装（供错误中间件使用）
- 级别 / 类型：单元 / 边界
- 前置条件：res.locals.rawResponse=true 后返回 {code:409,msg:'冲突',data:null}
- 操作：GET /raw
- 可观测结果与当前实际（期望）：HTTP 409；body 原样输出，无二次包装
- 当前实际：断言全部成立，与本行期望一致（实测值：HTTP 409；body 原样输出，无二次包装）
- 判定：**PASS**（耗时 6.7ms）

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
- 判定：**PASS**（耗时 2.4ms）

### UNIT-19 空字符串 type 被拒绝（边界）
- 级别 / 类型：单元 / 边界
- 前置条件：input={type:''}
- 操作：submitJobSchema.parse(input)
- 可观测结果与当前实际（期望）：抛出校验错误
- 当前实际：断言全部成立，与本行期望一致（实测值：抛出校验错误）
- 判定：**PASS**（耗时 0.9ms）

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
- 判定：**PASS**（耗时 45.6ms）

### UNIT-22 未注册类型直接标记 failed 并记录错误
- 级别 / 类型：单元 / 失败
- 前置条件：Job type='test:unregistered'，无对应 handler
- 操作：runJob(job.id)
- 可观测结果与当前实际（期望）：status='failed'；retryCount=0；error='未注册的任务类型: test:unregistered'；completedAt 非空
- 当前实际：断言全部成立，与本行期望一致（实测值：status='failed'；retryCount=0；error='未注册的任务类型: test:unregistered'；completedAt 非空）
- 判定：**PASS**（耗时 36.7ms）

### UNIT-23 重试次数耗尽后标记最终 failed
- 级别 / 类型：单元 / 状态流转
- 前置条件：test:always-fail handler 抛 Error('boom')；Job retryCount=3、maxRetries=3
- 操作：runJob(job.id)
- 可观测结果与当前实际（期望）：status='failed'；retryCount=3；error='boom'；completedAt 非空
- 当前实际：断言全部成立，与本行期望一致（实测值：status='failed'；retryCount=3；error='boom'；completedAt 非空）
- 判定：**PASS**（耗时 42.9ms）

### UNIT-24 并发重复领取同一任务时 handler 只执行一次
- 级别 / 类型：单元 / 并发
- 前置条件：注册 test:concurrent-once handler 计数；同一 pending Job
- 操作：Promise.all([runJob(id), runJob(id)])
- 可观测结果与当前实际（期望）：handler 调用次数=1；status='success'；result={ok:true}
- 当前实际：断言全部成立，与本行期望一致（实测值：handler 调用次数=1；status='success'；result={ok:true}）
- 判定：**PASS**（耗时 46.6ms）
