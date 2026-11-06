# room-management Specification

## Purpose

提供房间作为多人合奏的容器——用户创建公开或私有房间、加入已有房间、房主管理房间成员和状态。房间是后续多轨编曲、AI 协作、实时协同、WebRTC 音频通话的共同上下文。

## Requirements

### Requirement: 创建房间
后端 MUST 提供 POST `/api/v1/rooms` 端点，允许已登录用户创建新房间，创建者自动成为房主。

#### Scenario: 创建公开房间
- **WHEN** 已登录用户提交 `{ name: "我的乐队", isPublic: true }`
- **THEN** 创建 Room 记录（status 为 active、roomNumber 为 6 位唯一随机数字）
- **AND** 创建 RoomMember 记录（role 为 owner）
- **AND** 返回 `{ code: 0, msg: "ok", data: { id, roomNumber, name, isPublic, status, owner: { id, username }, members: [...] } }`

#### Scenario: 创建私有房间
- **WHEN** 已登录用户提交 `{ name: "秘密合奏", isPublic: false, password: "secret123" }`
- **THEN** Room 记录的 passwordHash 为 bcrypt 哈希值
- **AND** 返回时不包含 passwordHash 字段

#### Scenario: 房间名校验
- **WHEN** 房间名超过 50 字符或为空
- **THEN** 返回 `{ code: 400, msg: "房间名长度必须在 1-50 字符之间", data: null }`

#### Scenario: 未登录创建
- **WHEN** 无 access token 的请求调用此端点
- **THEN** 返回 `{ code: 401, msg: "未登录", data: null }`

### Requirement: 列出公开房间
后端 MUST 提供 GET `/api/v1/rooms` 端点，返回最近活跃的公开房间列表。

#### Scenario: 列出公开房间
- **WHEN** 已登录或未登录用户请求此端点
- **THEN** 返回最多 20 条 `isPublic === true` 且 `status === "active"` 的房间
- **AND** 按 `createdAt` 倒序排列
- **AND** 每条包含 id、roomNumber、name、owner.username、memberCount

#### Scenario: 无匹配房间
- **WHEN** 没有活跃的公开房间
- **THEN** 返回空数组 `data: []`

### Requirement: 房间详情
后端 MUST 提供 GET `/api/v1/rooms/:id` 端点，返回单个房间的详细信息。

#### Scenario: 获取活跃房间详情
- **WHEN** 已登录用户请求一个存在的 active 房间
- **THEN** 返回房间完整信息（id、roomNumber、name、isPublic、status、owner、members 列表含 role）
- **AND** 如果用户是该房间成员，额外返回 `isMember: true` 和 `role: "owner" | "member"`

#### Scenario: 私有房间对非成员
- **WHEN** 未加入的用户请求私有房间详情
- **THEN** 不返回 passwordHash，仍可查看房间号、名称、是否公开、房主信息（但无法加入需密码）

#### Scenario: 房间不存在
- **WHEN** 请求一个不存在的房间 id
- **THEN** 返回 `{ code: 404, msg: "房间不存在", data: null }`

#### Scenario: 已结束的房间
- **WHEN** 请求 status 为 ended 的房间
- **THEN** 仍能查看详情（只读），但显示 status 为 ended

### Requirement: 加入房间
后端 MUST 提供 POST `/api/v1/rooms/:id/join` 端点，允许已登录用户加入房间。

#### Scenario: 加入公开房间
- **WHEN** 已登录用户提交公开房间的 join 请求
- **THEN** 创建 RoomMember 记录（role 为 member）
- **AND** 返回更新后的房间成员列表

#### Scenario: 加入私有房间（密码正确）
- **WHEN** 已登录用户提交私有房间的 join 请求并附带正确的 password
- **THEN** 创建 RoomMember 记录
- **AND** 不记录明文 password 到任何日志

#### Scenario: 加入私有房间（密码错误）
- **WHEN** 已登录用户提交私有房间的 join 请求但 password 错误或未提供
- **THEN** 返回 `{ code: 401, msg: "房间密码错误", data: null }`

#### Scenario: 重复加入
- **WHEN** 已是该房间成员的用户再次调用 join
- **THEN** 返回 `{ code: 409, msg: "你已是该房间成员", data: null }`（不创建重复 RoomMember）

#### Scenario: 房间已锁定
- **WHEN** 房间 status 为 locked（房主加锁）
- **THEN** 返回 `{ code: 403, msg: "房间已锁定，无法加入", data: null }`

#### Scenario: 房间已结束
- **WHEN** 房间 status 为 ended
- **THEN** 返回 `{ code: 403, msg: "合奏已结束", data: null }`

### Requirement: 房主踢人
后端 MUST 提供 DELETE `/api/v1/rooms/:id/members/:userId` 端点，仅房主可以调用。

#### Scenario: 房主踢普通成员
- **WHEN** 房间房主请求踢一个普通成员
- **THEN** 对应 RoomMember 记录删除
- **AND** 返回更新后的成员列表

#### Scenario: 房主不能踢自己
- **WHEN** 房主请求踢自己
- **THEN** 返回 `{ code: 400, msg: "不能踢房主", data: null }`

#### Scenario: 非房主尝试踢人
- **WHEN** 普通成员尝试调用踢人端点
- **THEN** 返回 `{ code: 403, msg: "无权限", data: null }`

#### Scenario: 被踢的用户不在房间
- **WHEN** 房主指定的 userId 不是该房间成员
- **THEN** 返回 `{ code: 404, msg: "该成员不在房间中", data: null }`

### Requirement: 房主加锁
后端 MUST 提供 POST `/api/v1/rooms/:id/lock` 端点，仅房主可以调用，加锁后禁止新成员加入。

#### Scenario: 房主加锁成功
- **WHEN** 房主对 active 房间调用 lock
- **THEN** 房间 status 更新为 locked
- **AND** 返回更新后的房间信息

#### Scenario: 非房主尝试加锁
- **WHEN** 普通成员尝试调用 lock
- **THEN** 返回 `{ code: 403, msg: "无权限", data: null }`

### Requirement: 房主结束合奏
后端 MUST 提供 POST `/api/v1/rooms/:id/end` 端点，仅房主可以调用，结束后房间变为只读。

#### Scenario: 房主结束合奏
- **WHEN** 房主对 active 或 locked 房间调用 end
- **THEN** 房间 status 更新为 ended
- **AND** 所有成员后续无法编辑轨道、无法加入新成员

#### Scenario: 已结束的房间再次结束
- **WHEN** 房主对 ended 房间调用 end
- **THEN** 返回 `{ code: 400, msg: "房间已结束", data: null }`

### Requirement: 6 位数字房间号
后端 MUST 为每个新房间生成 6 位随机数字房间号，并保证全表唯一。

#### Scenario: 房间号生成
- **WHEN** 创建新房间
- **THEN** roomNumber 字段为 String 类型（方便前端展示无前置零丢失），值为 `"000000"` 到 `"999999"` 之间的随机值
- **AND** 如果生成的 roomNumber 已存在则重试，直到生成唯一值

### Requirement: 前端房间列表页面
前端 MUST 在 `/rooms` 页面展示公开房间列表、创建房间入口和加入房间入口。

#### Scenario: 显示公开房间列表
- **WHEN** 已登录用户访问 `/rooms`
- **THEN** 从 GET `/api/v1/rooms` 拉取公开房间
- **AND** 以卡片列表形式展示（房间名、房主用户名、当前成员数、房间号）

#### Scenario: 创建房间弹窗
- **WHEN** 用户点击"创建房间"按钮
- **THEN** 弹出表单（房间名输入框、公开/私有单选、私有时额外显示密码输入框）
- **AND** 提交成功后跳转 `/rooms/:id`（房间详情页，Phase 3 填充）

#### Scenario: 加入房间弹窗
- **WHEN** 用户点击"加入房间"按钮
- **THEN** 弹出表单（房间号输入框、可选密码输入框）
- **AND** 提交成功后跳转 `/rooms/:id`
- **AND** 私有房间密码错误时在弹窗内显示错误提示
