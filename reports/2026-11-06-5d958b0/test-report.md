# 测试运行汇总（test-report）

| 项目 | 值 |
| --- | --- |
| 用例总数 | 135 |
| 通过 | 135 |
| 失败 | 0 |
| 跳过 | 0 |
| 运行时间 | 86.0s（2026-11-06 12:32:20 ~ 2026-11-06 12:33:46） |
| 提交号 | b189109 |
| 是否留红 | 否 |
| 报告目录 | reports/2026-11-06-b189109 |

## 失败用例与错误摘要

- 无

## 按级别统计

- 接口：73 条（通过 73，失败 0）
- 单元：62 条（通过 62，失败 0）

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
| API-15 | 接口 | 正常 | 注册成功：返回用户信息、密码以 bcrypt cost 12 哈希落库且不回传哈希 | 537.4 | PASS |
| API-16 | 接口 | 失败 | 重复用户名返回 409 且消息与 spec 一致 | 895.3 | PASS |
| API-17 | 接口 | 失败 | 邮箱格式不正确返回 400 | 18.3 | PASS |
| API-18 | 接口 | 失败 | 密码不含数字返回 400 且消息与 spec 一致 | 8.9 | PASS |
| API-19 | 接口 | 边界 | 密码少于 8 位返回 400（边界） | 6.7 | PASS |
| API-20 | 接口 | 失败 | 用户名含非法字符返回 400 | 6.6 | PASS |
| API-21 | 接口 | 边界 | 用户名为 2 位返回 400（长度下边界） | 6.8 | PASS |
| API-22 | 接口 | 边界 | 邮箱可省略，落库为 null（边界） | 451.5 | PASS |
| API-23 | 接口 | 正常 | 登录成功返回双令牌与用户信息，access 15min / refresh 7d | 882 | PASS |
| API-24 | 接口 | 正常 | JWT payload 仅含 sub/type/iat/exp，不泄露 username 或 email | 878.5 | PASS |
| API-25 | 接口 | 失败 | 用户名不存在返回 401 且不区分具体字段 | 450.2 | PASS |
| API-26 | 接口 | 失败 | 密码错误返回 401 且消息与用户名不存在一致 | 868 | PASS |
| API-27 | 接口 | 边界 | 缺少密码返回 400（边界） | 450.9 | PASS |
| API-28 | 接口 | 正常 | 携带有效 access token 返回当前用户且不含 passwordHash | 882.4 | PASS |
| API-29 | 接口 | 失败 | 缺少 Authorization 返回 401 未登录 | 901.6 | PASS |
| API-30 | 接口 | 边界 | Authorization 格式错误返回 401 未登录（边界） | 920.9 | PASS |
| API-31 | 接口 | 失败 | 签名无效的 access token 返回 401 令牌无效 | 902 | PASS |
| API-32 | 接口 | 失败 | 过期的 access token 返回 401 令牌已过期 | 885 | PASS |
| API-33 | 接口 | 失败 | 用 refresh token 访问受保护接口返回 401 令牌无效（令牌类型隔离） | 1313.7 | PASS |
| API-34 | 接口 | 失败 | 合法签名但用户已不存在返回 401 未登录（依赖数据缺失） | 892.5 | PASS |
| API-35 | 接口 | 正常 | 有效 refresh token 换发新双令牌，新 access token 可访问 me | 888 | PASS |
| API-36 | 接口 | 边界 | 也支持通过 Authorization header 提交 refresh token（边界） | 887.7 | PASS |
| API-37 | 接口 | 失败 | 用 access token 调用 refresh 返回 401 令牌无效 | 885 | PASS |
| API-41 | 接口 | 边界 | 旧 access token 在有效期内仍可访问 me（无状态 JWT，不做黑名单） | 895.3 | PASS |
| API-38 | 接口 | 失败 | 签名无效的 refresh token 返回 401 令牌无效 | 947.1 | PASS |
| API-39 | 接口 | 失败 | 过期的 refresh token 返回 401 令牌已过期 | 906.8 | PASS |
| API-40 | 接口 | 边界 | 缺少 refreshToken 返回 401 未登录（边界） | 877.1 | PASS |
| API-01 | 接口 | 正常 | GET /health 返回统一格式且带安全响应头 | 56.4 | PASS |
| API-02 | 接口 | 边界 | GET /api/v1/health 可访问（双挂载边界） | 9.1 | PASS |
| API-03 | 接口 | 正常 | GET /api/v1/hello 返回统一响应格式 | 6.3 | PASS |
| API-04 | 接口 | 失败 | GET /health 对未允许来源返回 CORS 错误（500 由中间件统一格式） | 10.4 | PASS |
| API-05 | 接口 | 正常 | 提交合法任务后落库，返回 pending 任务结构 | 99.2 | PASS |
| API-06 | 接口 | 边界 | payload 缺省时允许创建，payload 为 null（边界） | 26.3 | PASS |
| API-07 | 接口 | 失败 | 缺少 type 返回 400 与具体校验信息 | 21.4 | PASS |
| API-08 | 接口 | 边界 | type 为空字符串返回 400（边界） | 10.1 | PASS |
| API-09 | 接口 | 失败 | 请求体为非法 JSON 返回 400 而不是 500 | 8.4 | PASS |
| API-10 | 接口 | 正常 | 查询已存在任务返回完整结构 | 24.2 | PASS |
| API-11 | 接口 | 失败 | 查询不存在的任务返回 404 且错误码匹配 | 16.3 | PASS |
| API-12 | 接口 | 失败 | 未匹配的 API 路由返回统一 404 JSON | 8.8 | PASS |
| API-13 | 接口 | 边界 | POST /api/v1/jobs/ 空路径（尾斜杠）返回统一 404 | 6.7 | PASS |
| API-14 | 接口 | 边界 | CORS 预检请求返回 204 并允许 POST | 5.2 | PASS |
| API-42 | 接口 | 正常 | 创建公开房间：创建者为 owner，房间号为 6 位数字 | 1032.1 | PASS |
| API-43 | 接口 | 正常 | 创建私有房间：密码以 bcrypt 哈希落库且响应不含 passwordHash | 1371.4 | PASS |
| API-44 | 接口 | 失败 | 创建房间名为空返回 400 且消息与 spec 一致 | 914.4 | PASS |
| API-45 | 接口 | 边界 | 创建房间名超过 50 字符返回 400（边界） | 887.9 | PASS |
| API-46 | 接口 | 失败 | 未登录创建房间返回 401 未登录 | 15.1 | PASS |
| API-47 | 接口 | 失败 | 私有房间缺少密码返回 400 | 895.2 | PASS |
| API-48 | 接口 | 正常 | 列出公开房间：仅 active 公开房间并按创建时间倒序 | 2250.1 | PASS |
| API-49 | 接口 | 边界 | 没有活跃公开房间时返回空数组 | 28.7 | PASS |
| API-50 | 接口 | 边界 | 列出公开房间最多返回 20 条（边界） | 1239.9 | PASS |
| API-51 | 接口 | 正常 | 房间详情：成员返回 isMember=true 与 role | 922.2 | PASS |
| API-52 | 接口 | 正常 | 私有房间详情对非成员不返回 passwordHash | 2220.6 | PASS |
| API-53 | 接口 | 失败 | 房间不存在返回 404 房间不存在 | 28.2 | PASS |
| API-54 | 接口 | 边界 | 已结束房间仍可查看详情且 status=ended | 907.3 | PASS |
| API-55 | 接口 | 正常 | 加入公开房间成功并出现在成员列表 | 1787.9 | PASS |
| API-56 | 接口 | 正常 | 私有房间密码正确可加入 | 2636.6 | PASS |
| API-57 | 接口 | 失败 | 私有房间密码错误返回 401 房间密码错误 | 2632.9 | PASS |
| API-58 | 接口 | 边界 | 私有房间未提供密码返回 401 房间密码错误（边界） | 2214.8 | PASS |
| API-59 | 接口 | 失败 | 重复加入返回 409 你已是该房间成员 | 914.6 | PASS |
| API-60 | 接口 | 失败 | 加入已锁定房间返回 403 房间已锁定，无法加入 | 1803.7 | PASS |
| API-61 | 接口 | 失败 | 加入已结束房间返回 403 合奏已结束 | 1824.9 | PASS |
| API-62 | 接口 | 边界 | 按房间号加入公开房间成功（边界） | 1800.3 | PASS |
| API-63 | 接口 | 失败 | 加入不存在的房间返回 404 房间不存在 | 897 | PASS |
| API-64 | 接口 | 失败 | 密码明文不出现在错误日志中 | 2610.6 | PASS |
| API-65 | 接口 | 正常 | 房主踢普通成员后成员列表更新 | 1806.5 | PASS |
| API-66 | 接口 | 失败 | 房主踢自己返回 400 不能踢房主 | 1794.7 | PASS |
| API-67 | 接口 | 失败 | 普通成员尝试踢人返回 403 无权限 | 1814.8 | PASS |
| API-68 | 接口 | 失败 | 踢不在房间的用户返回 404 该成员不在房间中 | 2669.9 | PASS |
| API-69 | 接口 | 失败 | 非成员调用踢人返回 403 不是房间成员 | 2683.2 | PASS |
| API-70 | 接口 | 正常 | 房主加锁成功返回 status=locked | 931.6 | PASS |
| API-71 | 接口 | 失败 | 非房主尝试加锁返回 403 无权限 | 1800.9 | PASS |
| API-72 | 接口 | 正常 | 房主结束合奏返回 status=ended | 919.9 | PASS |
| API-73 | 接口 | 失败 | 已结束房间再次结束返回 400 房间已结束 | 927.5 | PASS |
| UNIT-25 | 单元 | 正常 | hashPassword 生成 cost 12 的 bcrypt 哈希且可正确比对 | 881.7 | PASS |
| UNIT-26 | 单元 | 失败 | 明文不匹配时 comparePassword 返回 false | 847.1 | PASS |
| UNIT-27 | 单元 | 正常 | access token 的 payload 仅含 sub/type/iat/exp 且有效期 900 秒 | 6.1 | PASS |
| UNIT-28 | 单元 | 正常 | refresh token 的 type 为 refresh 且有效期 604800 秒 | 2.2 | PASS |
| UNIT-29 | 单元 | 正常 | verifyToken 返回 sub 与 type | 3.6 | PASS |
| UNIT-30 | 单元 | 失败 | 被篡改的 token 校验失败 | 2.7 | PASS |
| UNIT-31 | 单元 | 边界 | 过期 token 校验抛 TokenExpiredError | 2.7 | PASS |
| UNIT-32 | 单元 | 正常 | 合法输入通过并保留字段 | 6.3 | PASS |
| UNIT-33 | 单元 | 边界 | email 可省略（边界） | 0.7 | PASS |
| UNIT-34 | 单元 | 失败 | 用户名少于 3 位被拒绝 | 1.4 | PASS |
| UNIT-35 | 单元 | 边界 | 用户名超过 32 位被拒绝（边界） | 0.7 | PASS |
| UNIT-36 | 单元 | 失败 | 用户名含非法字符被拒绝 | 0.4 | PASS |
| UNIT-37 | 单元 | 失败 | 密码缺少数字被拒绝 | 1 | PASS |
| UNIT-38 | 单元 | 失败 | 密码缺少字母被拒绝 | 0.5 | PASS |
| UNIT-39 | 单元 | 边界 | 密码少于 8 位被拒绝（边界） | 0.4 | PASS |
| UNIT-40 | 单元 | 失败 | 非法邮箱被拒绝且消息与 spec 一致 | 1.2 | PASS |
| UNIT-41 | 单元 | 正常 | 用户名与密码非空时通过 | 1.1 | PASS |
| UNIT-42 | 单元 | 边界 | 空密码被拒绝（边界） | 0.4 | PASS |
| UNIT-43 | 单元 | 失败 | 缺少用户名被拒绝 | 0.3 | PASS |
| UNIT-44 | 单元 | 正常 | refreshToken 非空时通过 | 0.7 | PASS |
| UNIT-45 | 单元 | 边界 | 空 refreshToken 被拒绝（边界） | 0.2 | PASS |
| UNIT-12 | 单元 | 正常 | 合法配置通过并应用默认端口 | 4.1 | PASS |
| UNIT-13 | 单元 | 失败 | 缺少 DATABASE_URL 失败并给出具体字段 | 2.9 | PASS |
| UNIT-14 | 单元 | 失败 | 缺少 JWT_SECRET 失败并给出具体字段 | 0.8 | PASS |
| UNIT-15 | 单元 | 边界 | 端口不是数字时失败（边界） | 0.6 | PASS |
| UNIT-05 | 单元 | 失败 | BusinessError 404 映射为 HTTP 404 / code 404 | 59.7 | PASS |
| UNIT-06 | 单元 | 失败 | AuthError 映射为 HTTP 401 / code 401 | 9.6 | PASS |
| UNIT-07 | 单元 | 失败 | ZodError 映射为 400 且带字段路径 | 11 | PASS |
| UNIT-08 | 单元 | 失败 | Prisma P2002 唯一约束冲突映射为 409 | 6.3 | PASS |
| UNIT-09 | 单元 | 失败 | JSON 解析错误映射为 400 | 6.6 | PASS |
| UNIT-10 | 单元 | 失败 | 依赖不可达（ECONNREFUSED）映射为 500 且不泄露堆栈 | 6.2 | PASS |
| UNIT-11 | 单元 | 正常 | 每次错误都会记录日志 | 5.2 | PASS |
| UNIT-01 | 单元 | 正常 | 原始值被包装为 {code:0,msg:'ok',data} | 57 | PASS |
| UNIT-02 | 单元 | 正常 | 对象被包装，字段值不丢失 | 8.1 | PASS |
| UNIT-03 | 单元 | 边界 | undefined 被归一化为 data:null | 6.5 | PASS |
| UNIT-04 | 单元 | 边界 | rawResponse 标记时跳过包装（供错误中间件使用） | 6.4 | PASS |
| UNIT-46 | 单元 | 正常 | 生成 6 位数字房间号，100 次调用均在 100000-999999 且不重复 | 104.3 | PASS |
| UNIT-47 | 单元 | 正常 | 移除 passwordHash 并保留房间与成员信息 | 5.6 | PASS |
| UNIT-48 | 单元 | 边界 | 无 owner / members 关系时返回 null 与空数组（边界） | 1.8 | PASS |
| UNIT-58 | 单元 | 失败 | requireRoomRole：房间不存在返回 404 房间不存在 | 84.3 | PASS |
| UNIT-59 | 单元 | 失败 | 非成员返回 403 不是房间成员 | 67.2 | PASS |
| UNIT-60 | 单元 | 失败 | 普通成员调用房主操作返回 403 无权限 | 66.4 | PASS |
| UNIT-61 | 单元 | 正常 | 房主调用房主操作通过并注入 req.room 与 memberRole | 67 | PASS |
| UNIT-62 | 单元 | 正常 | 普通成员调用 member 级操作通过，房主同样通过 | 66.4 | PASS |
| UNIT-49 | 单元 | 正常 | 公开房间：合法房间名通过并默认 isPublic=true | 12.4 | PASS |
| UNIT-50 | 单元 | 边界 | 房间名 1 与 50 字符为合法边界 | 2.1 | PASS |
| UNIT-51 | 单元 | 失败 | 房间名空串与 51 字符返回错误且消息与 spec 一致 | 3 | PASS |
| UNIT-52 | 单元 | 边界 | 私有房间密码 8 与 32 字符为合法边界 | 3.6 | PASS |
| UNIT-53 | 单元 | 失败 | 私有房间缺少密码或密码长度越界返回错误 | 2.9 | PASS |
| UNIT-54 | 单元 | 失败 | 缺少 name 或 isPublic 非布尔值返回错误 | 1.2 | PASS |
| UNIT-55 | 单元 | 正常 | 空对象（公开房间不带密码）通过 | 1.9 | PASS |
| UNIT-56 | 单元 | 边界 | 密码 8 与 32 字符为合法边界 | 0.7 | PASS |
| UNIT-57 | 单元 | 失败 | 密码 7 与 33 字符返回错误 | 1.9 | PASS |
| UNIT-16 | 单元 | 正常 | 合法 body 通过并保留 payload | 6.8 | PASS |
| UNIT-17 | 单元 | 边界 | payload 可省略 | 0.6 | PASS |
| UNIT-18 | 单元 | 失败 | 缺少 type 被拒绝 | 3.4 | PASS |
| UNIT-19 | 单元 | 边界 | 空字符串 type 被拒绝（边界） | 0.9 | PASS |
| UNIT-20 | 单元 | 失败 | task id 为空被拒绝 | 1.1 | PASS |
| UNIT-21 | 单元 | 状态流转 | 已注册 handler 执行成功后状态 pending → running → success 并写入结果 | 45.2 | PASS |
| UNIT-22 | 单元 | 失败 | 未注册类型直接标记 failed 并记录错误 | 37.1 | PASS |
| UNIT-23 | 单元 | 状态流转 | 重试次数耗尽后标记最终 failed | 33.9 | PASS |
| UNIT-24 | 单元 | 并发 | 并发重复领取同一任务时 handler 只执行一次 | 35.3 | PASS |
