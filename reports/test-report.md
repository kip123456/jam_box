# 测试运行汇总（test-report）

| 项目 | 值 |
| --- | --- |
| 用例总数 | 239 |
| 通过 | 239 |
| 失败 | 0 |
| 跳过 | 0 |
| 运行时间 | 166.4s（2026-11-06 17:57:03 ~ 2026-11-06 17:59:49） |
| 提交号 | 54bf836 |
| 是否留红 | 否 |
| 报告目录 | reports/2026-11-06-54bf836 |

## 失败用例与错误摘要

- 无

## 按级别统计

- 接口：74 条（通过 74，失败 0）
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
| EXTRA-01 | 未分类 | 未分类 | 知识库未命中时走 LLM：source=llm 且透传问题 | 988.1 | PASS |
| EXTRA-02 | 未分类 | 未分类 | LLM 调用失败：返回 503 通用文案，不泄露上游错误细节 | 893.7 | PASS |
| EXTRA-03 | 未分类 | 未分类 | LLM 返回合法轨道：job 最终 success，result.tracks 结构完整 | 945.2 | PASS |
| EXTRA-04 | 未分类 | 未分类 | LLM 返回 pitch=150：业务校验拦截，job 最终 failed 且错误不含原始输出 | 944.2 | PASS |
| EXTRA-05 | 未分类 | 未分类 | LLM 修复成功：job success，修复结果保留轨道与音符 id | 951.7 | PASS |
| EXTRA-06 | 未分类 | 未分类 | 未登录提交返回 401 未登录 | 125.3 | PASS |
| EXTRA-07 | 未分类 | 未分类 | 缺少 instruction 返回 400 且消息匹配 | 970.1 | PASS |
| EXTRA-08 | 未分类 | 未分类 | instruction 超过 500 字符返回 400（边界） | 1096.4 | PASS |
| API-53 | 接口 | 失败 | 房间不存在返回 404 房间不存在 | 1130.3 | PASS |
| EXTRA-09 | 未分类 | 未分类 | 非房间成员提交返回 403 不是房间成员 | 2220.5 | PASS |
| EXTRA-10 | 未分类 | 未分类 | 空房间提交成功：job 落库，payload 含默认 bpm=120 与空轨道上下文 | 1179.1 | PASS |
| EXTRA-11 | 未分类 | 未分类 | 已有轨道时 existingTracksContext 汇总轨道名与乐器类型，bpm 透传 | 1166.9 | PASS |
| EXTRA-12 | 未分类 | 未分类 | 未登录轮询返回 401 | 47 | PASS |
| EXTRA-13 | 未分类 | 未分类 | 任务不存在返回 404 任务不存在 | 1133.6 | PASS |
| EXTRA-14 | 未分类 | 未分类 | 查询已提交任务返回完整状态结构 | 1143 | PASS |
| EXTRA-15 | 未分类 | 未分类 | 未登录提问返回 401 | 35.9 | PASS |
| EXTRA-16 | 未分类 | 未分类 | 空问题返回 400 | 1063.6 | PASS |
| EXTRA-17 | 未分类 | 未分类 | 命中知识库：Cmaj7 是什么 → source=knowledge-base 且答案含组成音 | 1046.9 | PASS |
| EXTRA-18 | 未分类 | 未分类 | 知识库未命中且未配置 LLM：返回 503 友好提示 | 993.3 | PASS |
| EXTRA-19 | 未分类 | 未分类 | 未登录返回 401 | 16.1 | PASS |
| EXTRA-20 | 未分类 | 未分类 | tracks 为空数组返回 400（边界） | 954 | PASS |
| EXTRA-21 | 未分类 | 未分类 | 合法轨道返回空 issues | 958.4 | PASS |
| EXTRA-22 | 未分类 | 未分类 | pitch=150 返回 pitch-out-of-range 问题 | 952.9 | PASS |
| EXTRA-23 | 未分类 | 未分类 | pitch=30 返回 pitch-out-of-register 问题 | 930.7 | PASS |
| EXTRA-24 | 未分类 | 未分类 | durationTicks=240 返回 duration-too-short 问题 | 919.6 | PASS |
| EXTRA-25 | 未分类 | 未分类 | velocity=0 返回 velocity-out-of-range 问题 | 881.1 | PASS |
| EXTRA-26 | 未分类 | 未分类 | 同轨道音符时间重叠返回 notes-overlap 问题 | 888.3 | PASS |
| EXTRA-27 | 未分类 | 未分类 | 未登录提交返回 401 | 13.7 | PASS |
| EXTRA-28 | 未分类 | 未分类 | issues 为空数组返回 400（边界） | 902.5 | PASS |
| EXTRA-29 | 未分类 | 未分类 | 房间不存在返回 404 | 1004.2 | PASS |
| EXTRA-30 | 未分类 | 未分类 | 非房间成员提交返回 403 | 1899.6 | PASS |
| EXTRA-31 | 未分类 | 未分类 | 提交成功：job 落库且结构化 issues 展开为文本行 | 910.5 | PASS |
| EXTRA-32 | 未分类 | 未分类 | 未登录轮询返回 401 | 29.6 | PASS |
| EXTRA-33 | 未分类 | 未分类 | 任务不存在返回 404 任务不存在 | 882.1 | PASS |
| API-15 | 接口 | 正常 | 注册成功：返回用户信息、密码以 bcrypt cost 12 哈希落库且不回传哈希 | 551.2 | PASS |
| API-16 | 接口 | 失败 | 重复用户名返回 409 且消息与 spec 一致 | 889.6 | PASS |
| API-17 | 接口 | 失败 | 邮箱格式不正确返回 400 | 17.1 | PASS |
| API-18 | 接口 | 失败 | 密码不含数字返回 400 且消息与 spec 一致 | 10.6 | PASS |
| API-19 | 接口 | 边界 | 密码少于 8 位返回 400（边界） | 8.2 | PASS |
| API-20 | 接口 | 失败 | 用户名含非法字符返回 400 | 8.7 | PASS |
| API-21 | 接口 | 边界 | 用户名为 2 位返回 400（长度下边界） | 8.5 | PASS |
| API-22 | 接口 | 边界 | 邮箱可省略，落库为 null（边界） | 439.9 | PASS |
| API-23 | 接口 | 正常 | 登录成功返回双令牌与用户信息，access 15min / refresh 7d | 875.7 | PASS |
| API-24 | 接口 | 正常 | JWT payload 仅含 sub/type/iat/exp，不泄露 username 或 email | 870.5 | PASS |
| API-25 | 接口 | 失败 | 用户名不存在返回 401 且不区分具体字段 | 453.6 | PASS |
| API-26 | 接口 | 失败 | 密码错误返回 401 且消息与用户名不存在一致 | 869.1 | PASS |
| API-27 | 接口 | 边界 | 缺少密码返回 400（边界） | 443.9 | PASS |
| API-28 | 接口 | 正常 | 携带有效 access token 返回当前用户且不含 passwordHash | 886 | PASS |
| API-29 | 接口 | 失败 | 缺少 Authorization 返回 401 未登录 | 893.5 | PASS |
| API-30 | 接口 | 边界 | Authorization 格式错误返回 401 未登录（边界） | 891.2 | PASS |
| API-31 | 接口 | 失败 | 签名无效的 access token 返回 401 令牌无效 | 880.5 | PASS |
| API-32 | 接口 | 失败 | 过期的 access token 返回 401 令牌已过期 | 877.3 | PASS |
| API-33 | 接口 | 失败 | 用 refresh token 访问受保护接口返回 401 令牌无效（令牌类型隔离） | 1311.6 | PASS |
| API-34 | 接口 | 失败 | 合法签名但用户已不存在返回 401 未登录（依赖数据缺失） | 873.7 | PASS |
| API-35 | 接口 | 正常 | 有效 refresh token 换发新双令牌，新 access token 可访问 me | 884.4 | PASS |
| API-36 | 接口 | 边界 | 也支持通过 Authorization header 提交 refresh token（边界） | 880.3 | PASS |
| API-37 | 接口 | 失败 | 用 access token 调用 refresh 返回 401 令牌无效 | 875.8 | PASS |
| API-41 | 接口 | 边界 | 旧 access token 在有效期内仍可访问 me（无状态 JWT，不做黑名单） | 880.3 | PASS |
| API-38 | 接口 | 失败 | 签名无效的 refresh token 返回 401 令牌无效 | 872.7 | PASS |
| API-39 | 接口 | 失败 | 过期的 refresh token 返回 401 令牌已过期 | 878.9 | PASS |
| API-40 | 接口 | 边界 | 缺少 refreshToken 返回 401 未登录（边界） | 875.8 | PASS |
| API-01 | 接口 | 正常 | GET /health 返回统一格式且带安全响应头 | 57 | PASS |
| API-02 | 接口 | 边界 | GET /api/v1/health 可访问（双挂载边界） | 9.2 | PASS |
| API-03 | 接口 | 正常 | GET /api/v1/hello 返回统一响应格式 | 5.9 | PASS |
| API-04 | 接口 | 失败 | GET /health 对未允许来源返回 CORS 错误（500 由中间件统一格式） | 10.1 | PASS |
| API-05 | 接口 | 正常 | 提交合法任务后落库，返回 pending 任务结构 | 103.1 | PASS |
| API-06 | 接口 | 边界 | payload 缺省时允许创建，payload 为 null（边界） | 22.6 | PASS |
| API-07 | 接口 | 失败 | 缺少 type 返回 400 与具体校验信息 | 20.6 | PASS |
| API-08 | 接口 | 边界 | type 为空字符串返回 400（边界） | 9.8 | PASS |
| API-09 | 接口 | 失败 | 请求体为非法 JSON 返回 400 而不是 500 | 7.8 | PASS |
| API-10 | 接口 | 正常 | 查询已存在任务返回完整结构 | 20.8 | PASS |
| API-11 | 接口 | 失败 | 查询不存在的任务返回 404 且错误码匹配 | 12.5 | PASS |
| API-12 | 接口 | 失败 | 未匹配的 API 路由返回统一 404 JSON | 9.2 | PASS |
| API-13 | 接口 | 边界 | POST /api/v1/jobs/ 空路径（尾斜杠）返回统一 404 | 7 | PASS |
| API-14 | 接口 | 边界 | CORS 预检请求返回 204 并允许 POST | 5.1 | PASS |
| EXTRA-34 | 未分类 | 未分类 | 创建音符：velocity 默认 100，响应字段完整 | 1050.3 | PASS |
| EXTRA-35 | 未分类 | 未分类 | 边界值 pitch 0 / 127、durationTicks 480 合法 | 969.1 | PASS |
| EXTRA-36 | 未分类 | 未分类 | pitch 超出 0-127 返回 400 且消息与 spec 一致 | 947.6 | PASS |
| EXTRA-37 | 未分类 | 未分类 | startTimeTicks 为负、durationTicks 小于 480、velocity 超界均返回 400 | 943.1 | PASS |
| EXTRA-38 | 未分类 | 未分类 | 非成员创建返回 403，未登录返回 401，轨道不存在返回 404 | 1805.9 | PASS |
| EXTRA-39 | 未分类 | 未分类 | bulk 创建 10 个音符一次写入 | 939.6 | PASS |
| EXTRA-40 | 未分类 | 未分类 | bulk 创建：非数组 / 空数组 / 数组内非法音符返回 400 且不写入任何数据 | 948.7 | PASS |
| EXTRA-41 | 未分类 | 未分类 | bulk 更新多个音符并落库 | 960.8 | PASS |
| EXTRA-42 | 未分类 | 未分类 | bulk 更新引用了别的轨道的音符返回 404，且不产生部分更新 | 977.6 | PASS |
| EXTRA-43 | 未分类 | 未分类 | bulk 删除只删除存在的音符并返回删除数量 | 958.8 | PASS |
| EXTRA-44 | 未分类 | 未分类 | bulk 删除 noteIds 为空返回 400 | 939.2 | PASS |
| EXTRA-45 | 未分类 | 未分类 | PUT 单个音符更新字段，DELETE 单个音符 | 975.4 | PASS |
| EXTRA-46 | 未分类 | 未分类 | 操作不属于该轨道的音符返回 404「音符不存在」 | 972.1 | PASS |
| API-42 | 接口 | 正常 | 创建公开房间：创建者为 owner，房间号为 6 位数字 | 1023.3 | PASS |
| API-43 | 接口 | 正常 | 创建私有房间：密码以 bcrypt 哈希落库且响应不含 passwordHash | 1452.6 | PASS |
| API-44 | 接口 | 失败 | 创建房间名为空返回 400 且消息与 spec 一致 | 1016.3 | PASS |
| API-45 | 接口 | 边界 | 创建房间名超过 50 字符返回 400（边界） | 955.7 | PASS |
| API-46 | 接口 | 失败 | 未登录创建房间返回 401 未登录 | 15.6 | PASS |
| API-47 | 接口 | 失败 | 私有房间缺少密码返回 400 | 983.3 | PASS |
| API-48 | 接口 | 正常 | 列出公开房间：仅 active 公开房间并按创建时间倒序 | 2449.9 | PASS |
| API-49 | 接口 | 边界 | 没有活跃公开房间时返回空数组 | 26.3 | PASS |
| API-50 | 接口 | 边界 | 列出公开房间最多返回 20 条（边界） | 1315 | PASS |
| API-51 | 接口 | 正常 | 房间详情：成员返回 isMember=true 与 role | 996.6 | PASS |
| API-52 | 接口 | 正常 | 私有房间详情对非成员不返回 passwordHash | 2387.7 | PASS |
| API-53 | 接口 | 失败 | 房间不存在返回 404 房间不存在 | 29.6 | PASS |
| API-54 | 接口 | 边界 | 已结束房间仍可查看详情且 status=ended | 1024 | PASS |
| API-55 | 接口 | 正常 | 加入公开房间成功并出现在成员列表 | 1843.4 | PASS |
| API-56 | 接口 | 正常 | 私有房间密码正确可加入 | 2707.7 | PASS |
| API-57 | 接口 | 失败 | 私有房间密码错误返回 401 房间密码错误 | 2667.4 | PASS |
| API-58 | 接口 | 边界 | 私有房间未提供密码返回 401 房间密码错误（边界） | 2225 | PASS |
| API-59 | 接口 | 失败 | 重复加入返回 409 你已是该房间成员 | 917.1 | PASS |
| API-60 | 接口 | 失败 | 加入已锁定房间返回 403 房间已锁定，无法加入 | 1823.1 | PASS |
| API-61 | 接口 | 失败 | 加入已结束房间返回 403 合奏已结束 | 1882.8 | PASS |
| API-62 | 接口 | 边界 | 按房间号加入公开房间成功（边界） | 2191.6 | PASS |
| API-63 | 接口 | 失败 | 加入不存在的房间返回 404 房间不存在 | 982.2 | PASS |
| API-64 | 接口 | 失败 | 密码明文不出现在错误日志中 | 3206.8 | PASS |
| API-65 | 接口 | 正常 | 房主踢普通成员后成员列表更新 | 2291.9 | PASS |
| API-66 | 接口 | 失败 | 房主踢自己返回 400 不能踢房主 | 2163.2 | PASS |
| API-67 | 接口 | 失败 | 普通成员尝试踢人返回 403 无权限 | 2104.3 | PASS |
| API-68 | 接口 | 失败 | 踢不在房间的用户返回 404 该成员不在房间中 | 3282.1 | PASS |
| API-69 | 接口 | 失败 | 非成员调用踢人返回 403 不是房间成员 | 3149.8 | PASS |
| API-70 | 接口 | 正常 | 房主加锁成功返回 status=locked | 1051.3 | PASS |
| API-71 | 接口 | 失败 | 非房主尝试加锁返回 403 无权限 | 2048.6 | PASS |
| API-72 | 接口 | 正常 | 房主结束合奏返回 status=ended | 1136 | PASS |
| API-73 | 接口 | 失败 | 已结束房间再次结束返回 400 房间已结束 | 1139.9 | PASS |
| EXTRA-47 | 未分类 | 未分类 | 创建四种乐器轨道：position 从 0 递增，默认 solo/mute 为 false、颜色为 #3b82f6 | 1093.6 | PASS |
| EXTRA-48 | 未分类 | 未分类 | 乐器类型非法返回 400 且消息与 spec 一致 | 940.3 | PASS |
| EXTRA-49 | 未分类 | 未分类 | 轨道名为空 / 超过 50 字符返回 400（边界） | 930.9 | PASS |
| EXTRA-50 | 未分类 | 未分类 | 颜色非十六进制返回 400，合法颜色可写入 | 950 | PASS |
| EXTRA-51 | 未分类 | 未分类 | 非房间成员创建返回 403「不是房间成员」，未登录返回 401 | 1787.1 | PASS |
| EXTRA-52 | 未分类 | 未分类 | 房间不存在返回 404「房间不存在」 | 887.7 | PASS |
| EXTRA-53 | 未分类 | 未分类 | 按 position 升序返回，且每个轨道包含按开始时间升序的音符 | 976.4 | PASS |
| EXTRA-54 | 未分类 | 未分类 | 非房间成员返回 403 | 1790.8 | PASS |
| EXTRA-55 | 未分类 | 未分类 | 成员可获取轨道及其音符 | 982.5 | PASS |
| EXTRA-56 | 未分类 | 未分类 | 轨道不存在返回 404，非成员返回 403 | 1795.3 | PASS |
| EXTRA-57 | 未分类 | 未分类 | 可更新 name/solo/mute/color/position | 945.6 | PASS |
| EXTRA-58 | 未分类 | 未分类 | 不可修改 instrumentType 与 roomId：传入被忽略 | 946.4 | PASS |
| EXTRA-59 | 未分类 | 未分类 | 颜色非法 / position 为负返回 400 | 976.6 | PASS |
| EXTRA-60 | 未分类 | 未分类 | 删除轨道时级联删除其音符 | 956.2 | PASS |
| EXTRA-61 | 未分类 | 未分类 | 非成员删除返回 403 | 1917.2 | PASS |
| EXTRA-62 | 未分类 | 未分类 | 成员获取详情时返回 tracks（含音符） | 977.5 | PASS |
| EXTRA-63 | 未分类 | 未分类 | 公开房间允许非成员只读轨道；私有房间非成员 tracks 为空 | 2301.1 | PASS |
| EXTRA-64 | 未分类 | 未分类 | 未配置 LLM（provider=null）抛出友好错误 | 9.6 | PASS |
| EXTRA-65 | 未分类 | 未分类 | LLM 返回合法轨道：原样返回 tracks，prompt 渲染 instruction 与 bpm | 4.4 | PASS |
| EXTRA-66 | 未分类 | 未分类 | pitch=150 被拦截，错误含校验摘要且不含原始 JSON 输出 | 2 | PASS |
| EXTRA-67 | 未分类 | 未分类 | durationTicks=240 被拦截 | 1.1 | PASS |
| EXTRA-68 | 未分类 | 未分类 | velocity=200 被拦截 | 1.2 | PASS |
| EXTRA-69 | 未分类 | 未分类 | startTimeTicks 为负数被拦截 | 0.7 | PASS |
| EXTRA-70 | 未分类 | 未分类 | instrumentType 不在枚举内被拦截 | 0.6 | PASS |
| EXTRA-71 | 未分类 | 未分类 | color 非十六进制被拦截 | 0.7 | PASS |
| EXTRA-72 | 未分类 | 未分类 | 未配置 LLM（provider=null）抛出友好错误 | 3.9 | PASS |
| EXTRA-73 | 未分类 | 未分类 | 修复结果保留轨道与音符 id，issues 渲染进 prompt | 1.3 | PASS |
| EXTRA-74 | 未分类 | 未分类 | 修复结果 velocity=200 仍被业务校验拦截 | 0.7 | PASS |
| UNIT-25 | 单元 | 正常 | hashPassword 生成 cost 12 的 bcrypt 哈希且可正确比对 | 879.6 | PASS |
| UNIT-26 | 单元 | 失败 | 明文不匹配时 comparePassword 返回 false | 845.4 | PASS |
| UNIT-27 | 单元 | 正常 | access token 的 payload 仅含 sub/type/iat/exp 且有效期 900 秒 | 6.4 | PASS |
| UNIT-28 | 单元 | 正常 | refresh token 的 type 为 refresh 且有效期 604800 秒 | 2.2 | PASS |
| UNIT-29 | 单元 | 正常 | verifyToken 返回 sub 与 type | 3.4 | PASS |
| UNIT-30 | 单元 | 失败 | 被篡改的 token 校验失败 | 2.6 | PASS |
| UNIT-31 | 单元 | 边界 | 过期 token 校验抛 TokenExpiredError | 2.8 | PASS |
| UNIT-32 | 单元 | 正常 | 合法输入通过并保留字段 | 9.8 | PASS |
| UNIT-33 | 单元 | 边界 | email 可省略（边界） | 0.9 | PASS |
| UNIT-34 | 单元 | 失败 | 用户名少于 3 位被拒绝 | 1.6 | PASS |
| UNIT-35 | 单元 | 边界 | 用户名超过 32 位被拒绝（边界） | 0.8 | PASS |
| UNIT-36 | 单元 | 失败 | 用户名含非法字符被拒绝 | 0.5 | PASS |
| UNIT-37 | 单元 | 失败 | 密码缺少数字被拒绝 | 0.7 | PASS |
| UNIT-38 | 单元 | 失败 | 密码缺少字母被拒绝 | 0.5 | PASS |
| UNIT-39 | 单元 | 边界 | 密码少于 8 位被拒绝（边界） | 0.5 | PASS |
| UNIT-40 | 单元 | 失败 | 非法邮箱被拒绝且消息与 spec 一致 | 1.2 | PASS |
| UNIT-41 | 单元 | 正常 | 用户名与密码非空时通过 | 1.5 | PASS |
| UNIT-42 | 单元 | 边界 | 空密码被拒绝（边界） | 0.4 | PASS |
| UNIT-43 | 单元 | 失败 | 缺少用户名被拒绝 | 0.3 | PASS |
| UNIT-44 | 单元 | 正常 | refreshToken 非空时通过 | 0.7 | PASS |
| UNIT-45 | 单元 | 边界 | 空 refreshToken 被拒绝（边界） | 0.4 | PASS |
| UNIT-12 | 单元 | 正常 | 合法配置通过并应用默认端口 | 3.6 | PASS |
| UNIT-13 | 单元 | 失败 | 缺少 DATABASE_URL 失败并给出具体字段 | 2.7 | PASS |
| UNIT-14 | 单元 | 失败 | 缺少 JWT_SECRET 失败并给出具体字段 | 0.7 | PASS |
| UNIT-15 | 单元 | 边界 | 端口不是数字时失败（边界） | 1 | PASS |
| UNIT-05 | 单元 | 失败 | BusinessError 404 映射为 HTTP 404 / code 404 | 61.5 | PASS |
| UNIT-06 | 单元 | 失败 | AuthError 映射为 HTTP 401 / code 401 | 9.2 | PASS |
| UNIT-07 | 单元 | 失败 | ZodError 映射为 400 且带字段路径 | 10.2 | PASS |
| UNIT-08 | 单元 | 失败 | Prisma P2002 唯一约束冲突映射为 409 | 6.6 | PASS |
| UNIT-09 | 单元 | 失败 | JSON 解析错误映射为 400 | 6.6 | PASS |
| UNIT-10 | 单元 | 失败 | 依赖不可达（ECONNREFUSED）映射为 500 且不泄露堆栈 | 6.6 | PASS |
| UNIT-11 | 单元 | 正常 | 每次错误都会记录日志 | 5.5 | PASS |
| EXTRA-75 | 未分类 | 未分类 | 合法音符：velocity 缺省为 100 | 6.1 | PASS |
| EXTRA-76 | 未分类 | 未分类 | pitch 0 / 127、velocity 0 / 127、durationTicks 480 为合法边界 | 0.9 | PASS |
| EXTRA-77 | 未分类 | 未分类 | pitch 超出 0-127 返回 spec 指定错误信息 | 1.4 | PASS |
| EXTRA-78 | 未分类 | 未分类 | pitch 非整数返回「音高必须是整数」 | 0.9 | PASS |
| EXTRA-79 | 未分类 | 未分类 | startTimeTicks 为负、durationTicks 小于 480、velocity 超界分别返回错误 | 1 | PASS |
| EXTRA-80 | 未分类 | 未分类 | 数组内任意一个音符非法时整体失败 | 0.9 | PASS |
| EXTRA-81 | 未分类 | 未分类 | 空数组与非数组均失败 | 0.7 | PASS |
| EXTRA-82 | 未分类 | 未分类 | 缺少 id 返回「音符 id 不能为空」 | 1.9 | PASS |
| EXTRA-83 | 未分类 | 未分类 | 空数组失败，单条部分更新成功 | 1.1 | PASS |
| EXTRA-84 | 未分类 | 未分类 | 允许部分更新，且不接受 id 字段 | 2 | PASS |
| EXTRA-85 | 未分类 | 未分类 | 非法 durationTicks 返回错误信息 | 0.4 | PASS |
| EXTRA-86 | 未分类 | 未分类 | 空 noteIds 返回「noteIds 不能为空」 | 0.8 | PASS |
| EXTRA-87 | 未分类 | 未分类 | 合法 id 列表通过 | 0.3 | PASS |
| UNIT-01 | 单元 | 正常 | 原始值被包装为 {code:0,msg:'ok',data} | 51.6 | PASS |
| UNIT-02 | 单元 | 正常 | 对象被包装，字段值不丢失 | 7.9 | PASS |
| UNIT-03 | 单元 | 边界 | undefined 被归一化为 data:null | 5.5 | PASS |
| UNIT-04 | 单元 | 边界 | rawResponse 标记时跳过包装（供错误中间件使用） | 5.6 | PASS |
| EXTRA-88 | 未分类 | 未分类 | addNote：先写库，再追加音符并清空 future 栈 | 9.5 | PASS |
| EXTRA-89 | 未分类 | 未分类 | undo 撤销新增 → 调用 bulkDeleteNotes 删除；redo 重做 → bulkCreateNotes 重建并回填新 id | 3.3 | PASS |
| EXTRA-90 | 未分类 | 未分类 | updateNotes：用服务端返回值覆盖本地音符 | 2.4 | PASS |
| EXTRA-91 | 未分类 | 未分类 | deleteNotes 后 undo：按快照重建音符（服务端新 id 回填本地） | 1.7 | PASS |
| EXTRA-92 | 未分类 | 未分类 | 新的编辑会清空 future（撤销后再编辑无法重做旧分支） | 1.3 | PASS |
| EXTRA-93 | 未分类 | 未分类 | 没有可撤销记录时 undo 不调用任何接口 | 1 | PASS |
| EXTRA-94 | 未分类 | 未分类 | toggleTrackFlag 调 updateTrack 并同步 store | 0.9 | PASS |
| UNIT-46 | 单元 | 正常 | 生成 6 位数字房间号，100 次调用均在 100000-999999 且不重复 | 98.7 | PASS |
| UNIT-47 | 单元 | 正常 | 移除 passwordHash 并保留房间与成员信息 | 5.4 | PASS |
| UNIT-48 | 单元 | 边界 | 无 owner / members 关系时返回 null 与空数组（边界） | 1.6 | PASS |
| UNIT-58 | 单元 | 失败 | requireRoomRole：房间不存在返回 404 房间不存在 | 66.9 | PASS |
| UNIT-59 | 单元 | 失败 | 非成员返回 403 不是房间成员 | 54.8 | PASS |
| UNIT-60 | 单元 | 失败 | 普通成员调用房主操作返回 403 无权限 | 51.3 | PASS |
| UNIT-61 | 单元 | 正常 | 房主调用房主操作通过并注入 req.room 与 memberRole | 50.5 | PASS |
| UNIT-62 | 单元 | 正常 | 普通成员调用 member 级操作通过，房主同样通过 | 54.6 | PASS |
| UNIT-49 | 单元 | 正常 | 公开房间：合法房间名通过并默认 isPublic=true | 6.3 | PASS |
| UNIT-50 | 单元 | 边界 | 房间名 1 与 50 字符为合法边界 | 0.8 | PASS |
| UNIT-51 | 单元 | 失败 | 房间名空串与 51 字符返回错误且消息与 spec 一致 | 1.6 | PASS |
| UNIT-52 | 单元 | 边界 | 私有房间密码 8 与 32 字符为合法边界 | 0.8 | PASS |
| UNIT-53 | 单元 | 失败 | 私有房间缺少密码或密码长度越界返回错误 | 1.1 | PASS |
| UNIT-54 | 单元 | 失败 | 缺少 name 或 isPublic 非布尔值返回错误 | 0.4 | PASS |
| UNIT-55 | 单元 | 正常 | 空对象（公开房间不带密码）通过 | 0.9 | PASS |
| UNIT-56 | 单元 | 边界 | 密码 8 与 32 字符为合法边界 | 0.3 | PASS |
| UNIT-57 | 单元 | 失败 | 密码 7 与 33 字符返回错误 | 1.1 | PASS |
| EXTRA-95 | 未分类 | 未分类 | 四种乐器类型均合法 | 6.5 | PASS |
| EXTRA-96 | 未分类 | 未分类 | 轨道名 0 / 1 / 50 / 51 字符边界 | 2.1 | PASS |
| EXTRA-97 | 未分类 | 未分类 | 轨道名会 trim 后再校验 | 0.4 | PASS |
| EXTRA-98 | 未分类 | 未分类 | 非法乐器类型返回 spec 指定错误信息 | 0.7 | PASS |
| EXTRA-99 | 未分类 | 未分类 | 颜色必须是 6 位十六进制，缺省时允许 | 1 | PASS |
| EXTRA-100 | 未分类 | 未分类 | 允许部分字段更新，position 0 为合法下界 | 2.4 | PASS |
| EXTRA-101 | 未分类 | 未分类 | position 为负返回 spec 指定错误信息 | 0.5 | PASS |
| EXTRA-102 | 未分类 | 未分类 | 非法颜色返回错误信息 | 0.4 | PASS |
| EXTRA-103 | 未分类 | 未分类 | instrumentType / roomId 不可修改：未知字段被剥离 | 1 | PASS |
| UNIT-16 | 单元 | 正常 | 合法 body 通过并保留 payload | 6.7 | PASS |
| UNIT-17 | 单元 | 边界 | payload 可省略 | 0.6 | PASS |
| UNIT-18 | 单元 | 失败 | 缺少 type 被拒绝 | 2.3 | PASS |
| UNIT-19 | 单元 | 边界 | 空字符串 type 被拒绝（边界） | 0.9 | PASS |
| UNIT-20 | 单元 | 失败 | task id 为空被拒绝 | 1 | PASS |
| UNIT-21 | 单元 | 状态流转 | 已注册 handler 执行成功后状态 pending → running → success 并写入结果 | 41.7 | PASS |
| UNIT-22 | 单元 | 失败 | 未注册类型直接标记 failed 并记录错误 | 31.4 | PASS |
| UNIT-23 | 单元 | 状态流转 | 重试次数耗尽后标记最终 failed | 27.8 | PASS |
| UNIT-24 | 单元 | 并发 | 并发重复领取同一任务时 handler 只执行一次 | 55.6 | PASS |
