# user-auth Specification

## Purpose

为合奏盒子提供完整的用户身份认证能力——注册、登录、JWT 双令牌鉴权体系、Token 刷新、获取当前用户，让所有受保护路由（Phase 2 房间、Phase 3 编曲等）都能基于用户身份安全运行。

## Requirements

### Requirement: 用户注册
后端 MUST 提供 POST `/api/v1/auth/register` 端点，允许新用户注册账号。

#### Scenario: 注册成功
- **WHEN** 用户提交合法的 `username`（3-32 字符，字母数字下划线）、`password`（≥8 位，含字母和数字）和可选 `email`
- **THEN** 创建 User 记录，`password` 经 bcrypt 哈希后存入数据库
- **AND** 返回 `{ code: 0, msg: "ok", data: { id, username, email, createdAt } }`

#### Scenario: 重复用户名
- **WHEN** 用户提交已存在的 username
- **THEN** 返回 `{ code: 409, msg: "用户名已被占用", data: null }`

#### Scenario: 邮箱格式校验
- **WHEN** 用户提交的 `email` 字段格式不合法
- **THEN** 返回 `{ code: 400, msg: "邮箱格式不正确", data: null }`

#### Scenario: 密码强度不足
- **WHEN** 用户提交的 password 少于 8 位，或不含字母/数字
- **THEN** 返回 `{ code: 400, msg: "密码至少 8 位且需包含字母和数字", data: null }`

### Requirement: 用户登录
后端 MUST 提供 POST `/api/v1/auth/login` 端点，校验用户凭证并返回 JWT 令牌。

#### Scenario: 登录成功
- **WHEN** 用户提交正确的 username 和 password
- **THEN** 返回 `{ code: 0, msg: "ok", data: { accessToken, refreshToken, user: { id, username, email } } }`
- **AND** `accessToken` 有效期 15 分钟，`refreshToken` 有效期 7 天

#### Scenario: 用户名不存在
- **WHEN** 用户提交的 username 在数据库中不存在
- **THEN** 返回 `{ code: 401, msg: "用户名或密码错误", data: null }`（不明确指出哪个字段错误，防枚举）

#### Scenario: 密码错误
- **WHEN** 用户提交的 password 与哈希不匹配
- **THEN** 返回 `{ code: 401, msg: "用户名或密码错误", data: null }`

### Requirement: Token 刷新
后端 MUST 提供 POST `/api/v1/auth/refresh` 端点，允许使用 refresh token 换发新的 access token。

#### Scenario: 刷新成功
- **WHEN** 客户端提交有效的 `refreshToken`
- **THEN** 返回 `{ code: 0, msg: "ok", data: { accessToken, refreshToken } }`
- **AND** 两个 token 都是全新生成的（access token 15min，refresh token 7d）

#### Scenario: refresh token 过期
- **WHEN** 客户端提交的 refresh token 已过期
- **THEN** 返回 `{ code: 401, msg: "登录已过期，请重新登录", data: null }`

#### Scenario: refresh token 无效
- **WHEN** 客户端提交的 refresh token 签名无效或格式错误
- **THEN** 返回 `{ code: 401, msg: "令牌无效", data: null }`

### Requirement: 获取当前用户
后端 MUST 提供 GET `/api/v1/auth/me` 端点，返回当前登录用户的信息（不含 password_hash）。

#### Scenario: 已登录访问
- **WHEN** 请求带有有效 access token 的 Authorization header
- **THEN** 返回 `{ code: 0, msg: "ok", data: { id, username, email, createdAt } }`

#### Scenario: 未登录访问
- **WHEN** 请求不带 Authorization header 或带无效 access token
- **THEN** 返回 `{ code: 401, msg: "未登录", data: null }`

### Requirement: JWT 鉴权中间件
后端 MUST 提供鉴权中间件，对受保护路由统一校验 JWT access token。

#### Scenario: access token 有效
- **WHEN** 请求的 Authorization header 为 `Bearer <有效accessToken>`
- **THEN** 中间件将解析出的 `userId` 注入 `req.user` 对象
- **AND** 请求继续传递到业务处理逻辑

#### Scenario: access token 缺失
- **WHEN** 请求的 Authorization header 缺失或格式不对
- **THEN** 中间件阻断请求，返回 `{ code: 401, msg: "未登录", data: null }`

#### Scenario: access token 过期
- **WHEN** 请求的 access token 已过期
- **THEN** 中间件阻断请求，返回 `{ code: 401, msg: "令牌已过期", data: null }`

#### Scenario: access token 签名无效
- **WHEN** 请求的 access token 签名无效
- **THEN** 中间件阻断请求，返回 `{ code: 401, msg: "令牌无效", data: null }`

### Requirement: 密码安全
后端 MUST 使用 bcrypt 加密用户密码，禁止在数据库中存储明文密码或可反解密的密码。

#### Scenario: 注册时密码哈希
- **WHEN** 用户注册
- **THEN** 写入数据库的是 bcrypt 生成的哈希值（cost factor ≥ 10）
- **AND** 明文密码在哈希后立即从内存中释放，不记录到任何日志

#### Scenario: 登录时密码校验
- **WHEN** 用户登录提交 password
- **THEN** 使用 bcrypt.compare 与存储的哈希比对
- **AND** 比对结果不记录到任何日志

### Requirement: Token 安全约束
后端签发 JWT 时 MUST 满足安全约束。

#### Scenario: JWT Payload 不包含敏感信息
- **WHEN** 后端签发 access token 或 refresh token
- **THEN** payload 中仅包含 `sub`（userId）、`type`（"access" 或 "refresh"）、`iat`、`exp`
- **AND** 不包含 username、email、password 等任何其他用户数据

#### Scenario: 签名密钥不硬编码
- **WHEN** 后端启动
- **THEN** JWT 签名密钥从 `.env` 读取（JWT_SECRET）
- **AND** 如果 JWT_SECRET 未提供则启动失败，输出明确错误

### Requirement: 前端登录页面
前端 MUST 提供登录页面（`/login`），包含 username 和 password 输入框，调用后端登录接口，成功后存储 token 并跳转。

#### Scenario: 登录表单提交成功
- **WHEN** 用户在 `/login` 页面输入正确的 username 和 password 并点击"登录"
- **THEN** 前端调用 POST `/api/v1/auth/login`
- **AND** 成功响应后将 accessToken、refreshToken 和用户信息写入 Zustand user store
- **AND** 自动跳转到 `/rooms` 页面

#### Scenario: 登录表单提交失败
- **WHEN** 用户输入错误的凭证并点击"登录"
- **THEN** 前端在页面上显示后端返回的错误消息（如"用户名或密码错误"）
- **AND** 不清空输入框内容（方便用户修改重试）

### Requirement: 前端注册页面
前端 MUST 提供注册页面（`/register`），包含 username、password、confirm password 和可选 email 输入框。

#### Scenario: 注册表单提交成功
- **WHEN** 用户在 `/register` 页面填写合法信息并点击"注册"
- **THEN** 前端调用 POST `/api/v1/auth/register`
- **AND** 成功后自动跳转到 `/login` 页面，并显示注册成功的提示

#### Scenario: 两次密码不一致
- **WHEN** 用户填写的 password 和 confirm password 不一致
- **THEN** 前端在本地校验时就阻止提交，显示"两次密码不一致"

### Requirement: 前端静默 Token 刷新
前端 Axios 拦截器 MUST 在收到 401 错误时尝试用 refresh token 静默刷新 access token，刷新成功后自动重试原请求，刷新失败才跳转登录页。

#### Scenario: access token 过期但 refresh token 有效
- **WHEN** 前端请求后端返回 401（access token 过期）
- **AND** Zustand user store 中有有效的 refresh token
- **THEN** 自动调用 POST `/api/v1/auth/refresh`
- **AND** 刷新成功后更新 store 中的两个 token
- **AND** 自动重试原失败请求（附新 access token）
- **AND** 用户无感知（不会出现 401 提示或跳转）

#### Scenario: refresh token 也过期
- **WHEN** 前端尝试静默刷新但 refresh token 也返回 401
- **THEN** 清除 Zustand user store 中的所有用户信息
- **AND** 跳转到 `/login` 页面
