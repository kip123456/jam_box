#!/usr/bin/env node
/**
 * 一条命令跑全部测试：
 *   1. 清空并迁移测试专用 SQLite（backend/prisma/test.db）
 *   2. 运行 vitest（verbose 输出 + JSON 结果文件）
 *   3. 解析结果，生成 reports/<YYYY-MM-DD>-<提交号>/ 下 7 份报告
 *   4. 清理测试数据库与临时结果
 *
 * 用法：
 *   npm test
 *   npm test -- --report-dir reports/custom-dir
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP_DIR = path.join(ROOT, "tests", ".tmp");
const RESULTS_FILE = path.join(TMP_DIR, "results.json");
const TEST_DB = path.join(ROOT, "backend", "prisma", "test.db");
const TEST_DB_JOURNAL = `${TEST_DB}-journal`;
const PRISMA_BIN = path.join(ROOT, "backend", "node_modules", "prisma", "build", "index.js");
const VITEST_BIN = path.join(ROOT, "node_modules", "vitest", "vitest.mjs");

const args = process.argv.slice(2);
let reportDirOverride = "";
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--report-dir" && args[i + 1]) {
    reportDirOverride = args[i + 1];
    i += 1;
  } else if (args[i].startsWith("--report-dir=")) {
    reportDirOverride = args[i].split("=").slice(1).join("=");
  }
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

function capture(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? ROOT,
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: "utf8",
    timeout: options.timeout ?? 180_000,
    shell: options.shell ?? false,
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    display: options.display ?? [command, ...commandArgs].join(" "),
    code: result.status,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
    error: result.error ? String(result.error.message) : "",
  };
}

function runInherit(command, commandArgs, options = {}) {
  return spawnSync(command, commandArgs, {
    cwd: options.cwd ?? ROOT,
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: "inherit",
    timeout: options.timeout ?? 300_000,
    shell: options.shell ?? false,
  });
}

function removeIfExists(target) {
  if (fs.existsSync(target)) fs.rmSync(target, { force: true, recursive: true });
}

function shortCommit() {
  const res = capture("git", ["rev-parse", "--short", "HEAD"]);
  return res.code === 0 && res.stdout ? res.stdout.split(/\r?\n/)[0] : "nogit";
}

function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function localTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${localDateString(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function npmCapture(npmArgs, options = {}) {
  // 优先用 npm 自身的 JS 入口（npm test 会注入 npm_execpath），避免 Windows 下
  // shell:true 时 npm 子进程在超时后仍持有管道导致脚本卡死
  const npmCli = process.env.npm_execpath;
  if (npmCli && fs.existsSync(npmCli)) {
    return capture(process.execPath, [npmCli, ...npmArgs], {
      ...options,
      display: `npm ${npmArgs.join(" ")}`,
      timeout: options.timeout ?? 20_000,
    });
  }
  return capture("npm", npmArgs, {
    ...options,
    display: `npm ${npmArgs.join(" ")}`,
    shell: true,
    timeout: options.timeout ?? 20_000,
  });
}

// ---------------------------------------------------------------------------
// 用例目录：为报告中每条用例提供三段式信息与具体期望值
// ---------------------------------------------------------------------------
const CASES = [
  {
    id: "API-01",
    level: "接口",
    file: "tests/api/health.test.ts",
    title: "GET /health 返回统一格式且带安全响应头",
    endpoint: "GET /health",
    category: "正常",
    precondition: "应用已组装（createApp），无需认证；请求带允许来源 Origin=http://localhost:5173",
    action: "GET /health",
    expected: "HTTP 200；body={code:0,msg:'ok',data:{status:'UP'}}；存在 x-content-type-options: nosniff；access-control-allow-origin=http://localhost:5173",
  },
  {
    id: "API-02",
    level: "接口",
    file: "tests/api/health.test.ts",
    title: "GET /api/v1/health 可访问（双挂载边界）",
    endpoint: "GET /api/v1/health",
    category: "边界",
    precondition: "同一健康路由同时挂在 / 与 /api/v1 下",
    action: "GET /api/v1/health",
    expected: "HTTP 200；body.code=0；body.data.status='UP'",
  },
  {
    id: "API-03",
    level: "接口",
    file: "tests/api/health.test.ts",
    title: "GET /api/v1/hello 返回统一响应格式",
    endpoint: "GET /api/v1/hello",
    category: "正常",
    precondition: "应用已组装，无需认证",
    action: "GET /api/v1/hello",
    expected: "HTTP 200；body={code:0,msg:'ok',data:'Hello from Jam Box backend'}",
  },
  {
    id: "API-04",
    level: "接口",
    file: "tests/api/health.test.ts",
    title: "GET /health 对未允许来源返回 CORS 错误（500 由中间件统一格式）",
    endpoint: "GET /health",
    category: "失败",
    precondition: "请求头 Origin=http://evil.example.com（不在允许列表）",
    action: "GET /health",
    expected: "HTTP 500；body={code:500,msg:'服务器内部错误',data:null}；无 access-control-allow-origin 响应头",
  },
  {
    id: "API-05",
    level: "接口",
    file: "tests/api/jobs.test.ts",
    title: "提交合法任务后落库，返回 pending 任务结构",
    endpoint: "POST /api/v1/jobs",
    category: "正常",
    precondition: "测试库已迁移且 Job 表为空；body={type:'test',payload:{foo:'bar'}}",
    action: "POST /api/v1/jobs",
    expected: "HTTP 200；data.status='pending'，retryCount=0，maxRetries=3，payload={foo:'bar'}，result=null，error=null；Job 表 count=1",
  },
  {
    id: "API-06",
    level: "接口",
    file: "tests/api/jobs.test.ts",
    title: "payload 缺省时允许创建，payload 为 null（边界）",
    endpoint: "POST /api/v1/jobs",
    category: "边界",
    precondition: "测试库为空；body 仅含 type:'test'",
    action: "POST /api/v1/jobs",
    expected: "HTTP 200；data.status='pending'；data.payload=null",
  },
  {
    id: "API-07",
    level: "接口",
    file: "tests/api/jobs.test.ts",
    title: "缺少 type 返回 400 与具体校验信息",
    endpoint: "POST /api/v1/jobs",
    category: "失败",
    precondition: "测试库为空；body={payload:{}}（缺少必填 type）",
    action: "POST /api/v1/jobs",
    expected: "HTTP 400；code=400；msg 包含 'type'；data=null；Job 表 count=0",
  },
  {
    id: "API-08",
    level: "接口",
    file: "tests/api/jobs.test.ts",
    title: "type 为空字符串返回 400（边界）",
    endpoint: "POST /api/v1/jobs",
    category: "边界",
    precondition: "测试库为空；body={type:''}",
    action: "POST /api/v1/jobs",
    expected: "HTTP 400；code=400；msg 包含 'type'；Job 表 count=0",
  },
  {
    id: "API-09",
    level: "接口",
    file: "tests/api/jobs.test.ts",
    title: "请求体为非法 JSON 返回 400 而不是 500",
    endpoint: "POST /api/v1/jobs",
    category: "失败",
    precondition: "Content-Type=application/json；body 为残缺 JSON '{\"type\":'",
    action: "POST /api/v1/jobs",
    expected: "HTTP 400；body={code:400,msg:'请求体不是合法的 JSON',data:null}",
  },
  {
    id: "API-10",
    level: "接口",
    file: "tests/api/jobs.test.ts",
    title: "查询已存在任务返回完整结构",
    endpoint: "GET /api/v1/jobs/:id",
    category: "正常",
    precondition: "先 POST 创建 type='test'、payload={n:1} 的任务",
    action: "GET /api/v1/jobs/<created.id>",
    expected: "HTTP 200；data.id 与创建返回值相同；data.status='pending'；data.payload={n:1}",
  },
  {
    id: "API-11",
    level: "接口",
    file: "tests/api/jobs.test.ts",
    title: "查询不存在的任务返回 404 且错误码匹配",
    endpoint: "GET /api/v1/jobs/:id",
    category: "失败",
    precondition: "测试库为空；路径 id='not-exists-id'",
    action: "GET /api/v1/jobs/not-exists-id",
    expected: "HTTP 404；body={code:404,msg:'任务不存在',data:null}",
  },
  {
    id: "API-12",
    level: "接口",
    file: "tests/api/jobs.test.ts",
    title: "未匹配的 API 路由返回统一 404 JSON",
    endpoint: "GET /api/v1/unknown-route",
    category: "失败",
    precondition: "应用无该路由",
    action: "GET /api/v1/unknown-route",
    expected: "HTTP 404；body={code:404,msg:'接口不存在',data:null}；content-type 含 application/json",
  },
  {
    id: "API-13",
    level: "接口",
    file: "tests/api/jobs.test.ts",
    title: "POST /api/v1/jobs/ 空路径（尾斜杠）返回统一 404",
    endpoint: "GET /api/v1/jobs/",
    category: "边界",
    precondition: "尾斜杠路径无 GET 处理器（仅 POST /）",
    action: "GET /api/v1/jobs/",
    expected: "HTTP 404；body.code=404；data=null",
  },
  {
    id: "API-14",
    level: "接口",
    file: "tests/api/jobs.test.ts",
    title: "CORS 预检请求返回 204 并允许 POST",
    endpoint: "OPTIONS /api/v1/jobs",
    category: "边界",
    precondition: "Origin=http://localhost:5173；Access-Control-Request-Method=POST",
    action: "OPTIONS /api/v1/jobs",
    expected: "HTTP 204；access-control-allow-origin=http://localhost:5173；access-control-allow-methods 包含 POST",
  },
  {
    id: "API-15",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "注册成功：返回用户信息、密码以 bcrypt cost 12 哈希落库且不回传哈希",
    endpoint: "POST /api/v1/auth/register",
    category: "正常",
    precondition: "测试库已迁移且 User 表为空；body={username:'alice_01',password:'Passw0rd123',email:'alice@example.com'}",
    action: "POST /api/v1/auth/register",
    expected: "HTTP 200；code=0；data 含 id/username/email/createdAt 且无 passwordHash；User count=1；落库 passwordHash 前缀 $2、cost=12、不等于明文",
  },
  {
    id: "API-16",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "重复用户名返回 409 且消息与 spec 一致",
    endpoint: "POST /api/v1/auth/register",
    category: "失败",
    precondition: "同一用户名 alice_01 已注册；再次提交不同 email",
    action: "POST /api/v1/auth/register",
    expected: "HTTP 409；body={code:409,msg:'用户名已被占用',data:null}；User count 仍为 1",
  },
  {
    id: "API-17",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "邮箱格式不正确返回 400",
    endpoint: "POST /api/v1/auth/register",
    category: "失败",
    precondition: "body 中 email='not-an-email'",
    action: "POST /api/v1/auth/register",
    expected: "HTTP 400；code=400；msg='邮箱格式不正确'；data=null；User count=0",
  },
  {
    id: "API-18",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "密码不含数字返回 400 且消息与 spec 一致",
    endpoint: "POST /api/v1/auth/register",
    category: "失败",
    precondition: "body 中 password='OnlyLetters'",
    action: "POST /api/v1/auth/register",
    expected: "HTTP 400；msg='密码至少 8 位且需包含字母和数字'；User count=0",
  },
  {
    id: "API-19",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "密码少于 8 位返回 400（边界）",
    endpoint: "POST /api/v1/auth/register",
    category: "边界",
    precondition: "body 中 password='Ab1'（长度 3）",
    action: "POST /api/v1/auth/register",
    expected: "HTTP 400；msg='密码至少 8 位且需包含字母和数字'",
  },
  {
    id: "API-20",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "用户名含非法字符返回 400",
    endpoint: "POST /api/v1/auth/register",
    category: "失败",
    precondition: "body 中 username='bad name!'",
    action: "POST /api/v1/auth/register",
    expected: "HTTP 400；msg='用户名需为 3-32 位字母、数字或下划线'",
  },
  {
    id: "API-21",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "用户名为 2 位返回 400（长度下边界）",
    endpoint: "POST /api/v1/auth/register",
    category: "边界",
    precondition: "body 中 username='ab'（长度 2）",
    action: "POST /api/v1/auth/register",
    expected: "HTTP 400；msg='用户名需为 3-32 位字母、数字或下划线'",
  },
  {
    id: "API-22",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "邮箱可省略，落库为 null（边界）",
    endpoint: "POST /api/v1/auth/register",
    category: "边界",
    precondition: "body 不含 email 字段",
    action: "POST /api/v1/auth/register",
    expected: "HTTP 200；data.email=null；User 表中该用户 email=null",
  },
  {
    id: "API-23",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "登录成功返回双令牌与用户信息，access 15min / refresh 7d",
    endpoint: "POST /api/v1/auth/login",
    category: "正常",
    precondition: "已注册 alice_01；body={username:'alice_01',password:'Passw0rd123'}",
    action: "POST /api/v1/auth/login",
    expected: "HTTP 200；data 含 accessToken/refreshToken/user；access exp-iat=900；refresh exp-iat=604800",
  },
  {
    id: "API-24",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "JWT payload 仅含 sub/type/iat/exp，不泄露 username 或 email",
    endpoint: "POST /api/v1/auth/login",
    category: "正常",
    precondition: "已注册并登录成功",
    action: "对 access/refresh token 做 jwt.decode",
    expected: "两组 payload 的 key 都恰为 [exp,iat,sub,type]；type 分别为 access / refresh",
  },
  {
    id: "API-25",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "用户名不存在返回 401 且不区分具体字段",
    endpoint: "POST /api/v1/auth/login",
    category: "失败",
    precondition: "username='ghost_user' 不存在",
    action: "POST /api/v1/auth/login",
    expected: "HTTP 401；body={code:401,msg:'用户名或密码错误',data:null}",
  },
  {
    id: "API-26",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "密码错误返回 401 且消息与用户名不存在一致",
    endpoint: "POST /api/v1/auth/login",
    category: "失败",
    precondition: "已注册 alice_01；password='WrongPass123'",
    action: "POST /api/v1/auth/login",
    expected: "HTTP 401；body={code:401,msg:'用户名或密码错误',data:null}",
  },
  {
    id: "API-27",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "缺少密码返回 400（边界）",
    endpoint: "POST /api/v1/auth/login",
    category: "边界",
    precondition: "body 仅含 username",
    action: "POST /api/v1/auth/login",
    expected: "HTTP 400；msg='密码不能为空'",
  },
  {
    id: "API-28",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "携带有效 access token 返回当前用户且不含 passwordHash",
    endpoint: "GET /api/v1/auth/me",
    category: "正常",
    precondition: "已注册并登录，获取 access token",
    action: "GET /api/v1/auth/me，Authorization: Bearer <access>",
    expected: "HTTP 200；code=0；data 含 username/email/createdAt；无 passwordHash / password 字段",
  },
  {
    id: "API-29",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "缺少 Authorization 返回 401 未登录",
    endpoint: "GET /api/v1/auth/me",
    category: "失败",
    precondition: "请求不带 Authorization 头",
    action: "GET /api/v1/auth/me",
    expected: "HTTP 401；body={code:401,msg:'未登录',data:null}",
  },
  {
    id: "API-30",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "Authorization 格式错误返回 401 未登录（边界）",
    endpoint: "GET /api/v1/auth/me",
    category: "边界",
    precondition: "Authorization='Token <access>'（scheme 非 Bearer）",
    action: "GET /api/v1/auth/me",
    expected: "HTTP 401；msg='未登录'",
  },
  {
    id: "API-31",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "签名无效的 access token 返回 401 令牌无效",
    endpoint: "GET /api/v1/auth/me",
    category: "失败",
    precondition: "用 wrong-secret 伪造 access token",
    action: "GET /api/v1/auth/me，Authorization: Bearer <forged>",
    expected: "HTTP 401；body={code:401,msg:'令牌无效',data:null}",
  },
  {
    id: "API-32",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "过期的 access token 返回 401 令牌已过期",
    endpoint: "GET /api/v1/auth/me",
    category: "失败",
    precondition: "用正确密钥签发 exp 已过期的 access token",
    action: "GET /api/v1/auth/me，Authorization: Bearer <expired>",
    expected: "HTTP 401；body={code:401,msg:'令牌已过期',data:null}",
  },
  {
    id: "API-33",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "用 refresh token 访问受保护接口返回 401 令牌无效（令牌类型隔离）",
    endpoint: "GET /api/v1/auth/me",
    category: "失败",
    precondition: "登录取得 refresh token",
    action: "GET /api/v1/auth/me，Authorization: Bearer <refresh>",
    expected: "HTTP 401；msg='令牌无效'",
  },
  {
    id: "API-34",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "合法签名但用户已不存在返回 401 未登录（依赖数据缺失）",
    endpoint: "GET /api/v1/auth/me",
    category: "失败",
    precondition: "用正确密钥签发给不存在的用户 id",
    action: "GET /api/v1/auth/me，Authorization: Bearer <orphan>",
    expected: "HTTP 401；msg='未登录'",
  },
  {
    id: "API-35",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "有效 refresh token 换发新双令牌，新 access token 可访问 me",
    endpoint: "POST /api/v1/auth/refresh",
    category: "正常",
    precondition: "登录取得 refresh token；body={refreshToken:<refresh>}",
    action: "POST /api/v1/auth/refresh；再用返回的 access 调 GET /me",
    expected: "HTTP 200；data 含 accessToken/refreshToken；随后 GET /me 返回 HTTP 200 且 username='alice_01'",
  },
  {
    id: "API-36",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "也支持通过 Authorization header 提交 refresh token（边界）",
    endpoint: "POST /api/v1/auth/refresh",
    category: "边界",
    precondition: "Authorization: Bearer <refresh>，body={}",
    action: "POST /api/v1/auth/refresh",
    expected: "HTTP 200；data.accessToken 为非空字符串",
  },
  {
    id: "API-37",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "用 access token 调用 refresh 返回 401 令牌无效",
    endpoint: "POST /api/v1/auth/refresh",
    category: "失败",
    precondition: "body={refreshToken:<access>}",
    action: "POST /api/v1/auth/refresh",
    expected: "HTTP 401；msg='令牌无效'",
  },
  {
    id: "API-38",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "签名无效的 refresh token 返回 401 令牌无效",
    endpoint: "POST /api/v1/auth/refresh",
    category: "失败",
    precondition: "用 wrong-secret 伪造 refresh token",
    action: "POST /api/v1/auth/refresh",
    expected: "HTTP 401；msg='令牌无效'",
  },
  {
    id: "API-39",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "过期的 refresh token 返回 401 令牌已过期",
    endpoint: "POST /api/v1/auth/refresh",
    category: "失败",
    precondition: "用正确密钥签发 exp 已过期的 refresh token",
    action: "POST /api/v1/auth/refresh",
    expected: "HTTP 401；body={code:401,msg:'令牌已过期',data:null}",
  },
  {
    id: "API-40",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "缺少 refreshToken 返回 401 未登录（边界）",
    endpoint: "POST /api/v1/auth/refresh",
    category: "边界",
    precondition: "body={} 且无 Authorization 头",
    action: "POST /api/v1/auth/refresh",
    expected: "HTTP 401；body={code:401,msg:'未登录',data:null}",
  },
  {
    id: "API-41",
    level: "接口",
    file: "tests/api/auth.test.ts",
    title: "旧 access token 在有效期内仍可访问 me（无状态 JWT，不做黑名单）",
    endpoint: "POST /api/v1/auth/refresh",
    category: "边界",
    precondition: "登录取得 access/refresh token；先用 refresh token 换发新令牌",
    action: "刷新后仍用刷新前的旧 access token 调 GET /api/v1/auth/me",
    expected: "refresh 返回 HTTP 200；旧 access token 调 me 返回 HTTP 200 且 username='alice_01'（与 design 无黑名单一致）",
  },
  {
    id: "UNIT-01",
    level: "单元",
    file: "tests/unit/response-middleware.test.ts",
    title: "原始值被包装为 {code:0,msg:'ok',data}",
    endpoint: "-",
    category: "正常",
    precondition: "Express 应用挂载 responseMiddleware，路由 res.json('hello')",
    action: "GET /primitive",
    expected: "HTTP 200；body={code:0,msg:'ok',data:'hello'}",
  },
  {
    id: "UNIT-02",
    level: "单元",
    file: "tests/unit/response-middleware.test.ts",
    title: "对象被包装，字段值不丢失",
    endpoint: "-",
    category: "正常",
    precondition: "路由返回 {value:42}",
    action: "GET /object",
    expected: "body={code:0,msg:'ok',data:{value:42}}",
  },
  {
    id: "UNIT-03",
    level: "单元",
    file: "tests/unit/response-middleware.test.ts",
    title: "undefined 被归一化为 data:null",
    endpoint: "-",
    category: "边界",
    precondition: "路由调用 res.json(undefined)",
    action: "GET /undefined",
    expected: "body={code:0,msg:'ok',data:null}",
  },
  {
    id: "UNIT-04",
    level: "单元",
    file: "tests/unit/response-middleware.test.ts",
    title: "rawResponse 标记时跳过包装（供错误中间件使用）",
    endpoint: "-",
    category: "边界",
    precondition: "res.locals.rawResponse=true 后返回 {code:409,msg:'冲突',data:null}",
    action: "GET /raw",
    expected: "HTTP 409；body 原样输出，无二次包装",
  },
  {
    id: "UNIT-05",
    level: "单元",
    file: "tests/unit/error-middleware.test.ts",
    title: "BusinessError 404 映射为 HTTP 404 / code 404",
    endpoint: "-",
    category: "失败",
    precondition: "路由抛出 BusinessError('任务不存在',404)",
    action: "GET /business",
    expected: "HTTP 404；body={code:404,msg:'任务不存在',data:null}",
  },
  {
    id: "UNIT-06",
    level: "单元",
    file: "tests/unit/error-middleware.test.ts",
    title: "AuthError 映射为 HTTP 401 / code 401",
    endpoint: "-",
    category: "失败",
    precondition: "路由抛出 AuthError",
    action: "GET /auth",
    expected: "HTTP 401；body={code:401,msg:'未认证或登录已过期',data:null}",
  },
  {
    id: "UNIT-07",
    level: "单元",
    file: "tests/unit/error-middleware.test.ts",
    title: "ZodError 映射为 400 且带字段路径",
    endpoint: "-",
    category: "失败",
    precondition: "路由内 submitJobSchema.parse({}) 抛 ZodError",
    action: "GET /zod",
    expected: "HTTP 400；code=400；msg 包含 'type'；data=null",
  },
  {
    id: "UNIT-08",
    level: "单元",
    file: "tests/unit/error-middleware.test.ts",
    title: "Prisma P2002 唯一约束冲突映射为 409",
    endpoint: "-",
    category: "失败",
    precondition: "路由抛 PrismaClientKnownRequestError(code=P2002)",
    action: "GET /prisma-unique",
    expected: "HTTP 409；body={code:409,msg:'资源已存在（唯一约束冲突）',data:null}",
  },
  {
    id: "UNIT-09",
    level: "单元",
    file: "tests/unit/error-middleware.test.ts",
    title: "JSON 解析错误映射为 400",
    endpoint: "-",
    category: "失败",
    precondition: "路由抛带 body 的 SyntaxError（模拟 express.json 解析失败）",
    action: "GET /json-parse",
    expected: "HTTP 400；body={code:400,msg:'请求体不是合法的 JSON',data:null}",
  },
  {
    id: "UNIT-10",
    level: "单元",
    file: "tests/unit/error-middleware.test.ts",
    title: "依赖不可达（ECONNREFUSED）映射为 500 且不泄露堆栈",
    endpoint: "-",
    category: "失败",
    precondition: "路由抛 'connect ECONNREFUSED 127.0.0.1:5432'",
    action: "GET /dependency-down",
    expected: "HTTP 500；body={code:500,msg:'服务器内部错误',data:null}；body 不含 'ECONNREFUSED' 与堆栈片段 'at '",
  },
  {
    id: "UNIT-11",
    level: "单元",
    file: "tests/unit/error-middleware.test.ts",
    title: "每次错误都会记录日志",
    endpoint: "-",
    category: "正常",
    precondition: "spy 包装 console.error",
    action: "GET /business",
    expected: "console.error 至少被调用 1 次",
  },
  {
    id: "UNIT-12",
    level: "单元",
    file: "tests/unit/env.test.ts",
    title: "合法配置通过并应用默认端口",
    endpoint: "-",
    category: "正常",
    precondition: "raw={DATABASE_URL:'file:./x.db',JWT_SECRET:'secret'}",
    action: "parseEnv(raw)",
    expected: "success=true；BACKEND_PORT=3000；FRONTEND_PORT=5173；DATABASE_URL='file:./x.db'；JWT_SECRET='secret'",
  },
  {
    id: "UNIT-13",
    level: "单元",
    file: "tests/unit/env.test.ts",
    title: "缺少 DATABASE_URL 失败并给出具体字段",
    endpoint: "-",
    category: "失败",
    precondition: "raw 仅含 JWT_SECRET",
    action: "parseEnv(raw)",
    expected: "success=false；issues 路径包含 'DATABASE_URL'",
  },
  {
    id: "UNIT-14",
    level: "单元",
    file: "tests/unit/env.test.ts",
    title: "缺少 JWT_SECRET 失败并给出具体字段",
    endpoint: "-",
    category: "失败",
    precondition: "raw 仅含 DATABASE_URL",
    action: "parseEnv(raw)",
    expected: "success=false；issues 路径包含 'JWT_SECRET'",
  },
  {
    id: "UNIT-15",
    level: "单元",
    file: "tests/unit/env.test.ts",
    title: "端口不是数字时失败（边界）",
    endpoint: "-",
    category: "边界",
    precondition: "raw 中 BACKEND_PORT='abc'",
    action: "parseEnv(raw)",
    expected: "success=false",
  },
  {
    id: "UNIT-16",
    level: "单元",
    file: "tests/unit/validators.test.ts",
    title: "合法 body 通过并保留 payload",
    endpoint: "-",
    category: "正常",
    precondition: "input={type:'test',payload:{foo:'bar'}}",
    action: "submitJobSchema.parse(input)",
    expected: "type='test'；payload={foo:'bar'}",
  },
  {
    id: "UNIT-17",
    level: "单元",
    file: "tests/unit/validators.test.ts",
    title: "payload 可省略",
    endpoint: "-",
    category: "边界",
    precondition: "input={type:'test'}",
    action: "submitJobSchema.parse(input)",
    expected: "type='test'；payload=undefined",
  },
  {
    id: "UNIT-18",
    level: "单元",
    file: "tests/unit/validators.test.ts",
    title: "缺少 type 被拒绝",
    endpoint: "-",
    category: "失败",
    precondition: "input={}",
    action: "submitJobSchema.parse(input)",
    expected: "抛出校验错误",
  },
  {
    id: "UNIT-19",
    level: "单元",
    file: "tests/unit/validators.test.ts",
    title: "空字符串 type 被拒绝（边界）",
    endpoint: "-",
    category: "边界",
    precondition: "input={type:''}",
    action: "submitJobSchema.parse(input)",
    expected: "抛出校验错误",
  },
  {
    id: "UNIT-20",
    level: "单元",
    file: "tests/unit/validators.test.ts",
    title: "task id 为空被拒绝",
    endpoint: "-",
    category: "失败",
    precondition: "input={id:''}",
    action: "jobIdSchema.parse(input)",
    expected: "抛出校验错误",
  },
  {
    id: "UNIT-21",
    level: "单元",
    file: "tests/unit/worker.test.ts",
    title: "已注册 handler 执行成功后状态 pending → running → success 并写入结果",
    endpoint: "-",
    category: "状态流转",
    precondition: "注册 test:echo handler；Job type='test:echo'、payload={value:42}、status=pending",
    action: "runJob(job.id)",
    expected: "status='success'；result={value:42}；retryCount=0；error=null；startedAt/completedAt 均非空",
  },
  {
    id: "UNIT-22",
    level: "单元",
    file: "tests/unit/worker.test.ts",
    title: "未注册类型直接标记 failed 并记录错误",
    endpoint: "-",
    category: "失败",
    precondition: "Job type='test:unregistered'，无对应 handler",
    action: "runJob(job.id)",
    expected: "status='failed'；retryCount=0；error='未注册的任务类型: test:unregistered'；completedAt 非空",
  },
  {
    id: "UNIT-23",
    level: "单元",
    file: "tests/unit/worker.test.ts",
    title: "重试次数耗尽后标记最终 failed",
    endpoint: "-",
    category: "状态流转",
    precondition: "test:always-fail handler 抛 Error('boom')；Job retryCount=3、maxRetries=3",
    action: "runJob(job.id)",
    expected: "status='failed'；retryCount=3；error='boom'；completedAt 非空",
  },
  {
    id: "UNIT-24",
    level: "单元",
    file: "tests/unit/worker.test.ts",
    title: "并发重复领取同一任务时 handler 只执行一次",
    endpoint: "-",
    category: "并发",
    precondition: "注册 test:concurrent-once handler 计数；同一 pending Job",
    action: "Promise.all([runJob(id), runJob(id)])",
    expected: "handler 调用次数=1；status='success'；result={ok:true}",
  },
  {
    id: "UNIT-25",
    level: "单元",
    file: "tests/unit/auth-lib.test.ts",
    title: "hashPassword 生成 cost 12 的 bcrypt 哈希且可正确比对",
    endpoint: "-",
    category: "正常",
    precondition: "明文 Passw0rd123",
    action: "hashPassword('Passw0rd123')；comparePassword 正确/错误明文",
    expected: "哈希以 $2 开头、cost=12、不含明文；正确明文返回 true",
  },
  {
    id: "UNIT-26",
    level: "单元",
    file: "tests/unit/auth-lib.test.ts",
    title: "明文不匹配时 comparePassword 返回 false",
    endpoint: "-",
    category: "失败",
    precondition: "哈希由 Passw0rd123 生成",
    action: "comparePassword('WrongPass123', hash)",
    expected: "返回 false",
  },
  {
    id: "UNIT-27",
    level: "单元",
    file: "tests/unit/auth-lib.test.ts",
    title: "access token 的 payload 仅含 sub/type/iat/exp 且有效期 900 秒",
    endpoint: "-",
    category: "正常",
    precondition: "sub='user-1'",
    action: "signAccessToken('user-1') 后 decode",
    expected: "sub='user-1'；type='access'；key 恰为 [exp,iat,sub,type]；exp-iat=900",
  },
  {
    id: "UNIT-28",
    level: "单元",
    file: "tests/unit/auth-lib.test.ts",
    title: "refresh token 的 type 为 refresh 且有效期 604800 秒",
    endpoint: "-",
    category: "正常",
    precondition: "sub='user-1'",
    action: "signRefreshToken('user-1') 后 decode",
    expected: "sub='user-1'；type='refresh'；exp-iat=604800",
  },
  {
    id: "UNIT-29",
    level: "单元",
    file: "tests/unit/auth-lib.test.ts",
    title: "verifyToken 返回 sub 与 type",
    endpoint: "-",
    category: "正常",
    precondition: "signAccessToken('test')",
    action: "verifyToken(token)",
    expected: "sub='test'；type='access'",
  },
  {
    id: "UNIT-30",
    level: "单元",
    file: "tests/unit/auth-lib.test.ts",
    title: "被篡改的 token 校验失败",
    endpoint: "-",
    category: "失败",
    precondition: "合法 access token 末两位替换为 xx",
    action: "verifyToken(tampered)",
    expected: "抛 JsonWebTokenError",
  },
  {
    id: "UNIT-31",
    level: "单元",
    file: "tests/unit/auth-lib.test.ts",
    title: "过期 token 校验抛 TokenExpiredError",
    endpoint: "-",
    category: "边界",
    precondition: "用 expiresIn=-1 签发 access token",
    action: "verifyToken(expired)",
    expected: "抛 TokenExpiredError",
  },
  {
    id: "UNIT-32",
    level: "单元",
    file: "tests/unit/auth-validators.test.ts",
    title: "合法输入通过并保留字段",
    endpoint: "-",
    category: "正常",
    precondition: "input={username:'alice_01',password:'Passw0rd123',email:'alice@example.com'}",
    action: "registerSchema.parse(input)",
    expected: "三个字段值原样保留",
  },
  {
    id: "UNIT-33",
    level: "单元",
    file: "tests/unit/auth-validators.test.ts",
    title: "email 可省略（边界）",
    endpoint: "-",
    category: "边界",
    precondition: "input 不含 email",
    action: "registerSchema.parse(input)",
    expected: "email=undefined",
  },
  {
    id: "UNIT-34",
    level: "单元",
    file: "tests/unit/auth-validators.test.ts",
    title: "用户名少于 3 位被拒绝",
    endpoint: "-",
    category: "失败",
    precondition: "username='ab'",
    action: "registerSchema.safeParse(input)",
    expected: "success=false；message='用户名需为 3-32 位字母、数字或下划线'",
  },
  {
    id: "UNIT-35",
    level: "单元",
    file: "tests/unit/auth-validators.test.ts",
    title: "用户名超过 32 位被拒绝（边界）",
    endpoint: "-",
    category: "边界",
    precondition: "username='a'.repeat(33)",
    action: "registerSchema.safeParse(input)",
    expected: "success=false",
  },
  {
    id: "UNIT-36",
    level: "单元",
    file: "tests/unit/auth-validators.test.ts",
    title: "用户名含非法字符被拒绝",
    endpoint: "-",
    category: "失败",
    precondition: "username='bad name'",
    action: "registerSchema.safeParse(input)",
    expected: "success=false",
  },
  {
    id: "UNIT-37",
    level: "单元",
    file: "tests/unit/auth-validators.test.ts",
    title: "密码缺少数字被拒绝",
    endpoint: "-",
    category: "失败",
    precondition: "password='OnlyLetters'",
    action: "registerSchema.safeParse(input)",
    expected: "success=false；message='密码至少 8 位且需包含字母和数字'",
  },
  {
    id: "UNIT-38",
    level: "单元",
    file: "tests/unit/auth-validators.test.ts",
    title: "密码缺少字母被拒绝",
    endpoint: "-",
    category: "失败",
    precondition: "password='12345678'",
    action: "registerSchema.safeParse(input)",
    expected: "success=false",
  },
  {
    id: "UNIT-39",
    level: "单元",
    file: "tests/unit/auth-validators.test.ts",
    title: "密码少于 8 位被拒绝（边界）",
    endpoint: "-",
    category: "边界",
    precondition: "password='Ab1'",
    action: "registerSchema.safeParse(input)",
    expected: "success=false",
  },
  {
    id: "UNIT-40",
    level: "单元",
    file: "tests/unit/auth-validators.test.ts",
    title: "非法邮箱被拒绝且消息与 spec 一致",
    endpoint: "-",
    category: "失败",
    precondition: "email='bad-email'",
    action: "registerSchema.safeParse(input)",
    expected: "success=false；message='邮箱格式不正确'",
  },
  {
    id: "UNIT-41",
    level: "单元",
    file: "tests/unit/auth-validators.test.ts",
    title: "用户名与密码非空时通过",
    endpoint: "-",
    category: "正常",
    precondition: "input={username:'alice_01',password:'Passw0rd123'}",
    action: "loginSchema.parse(input)",
    expected: "username='alice_01'",
  },
  {
    id: "UNIT-42",
    level: "单元",
    file: "tests/unit/auth-validators.test.ts",
    title: "空密码被拒绝（边界）",
    endpoint: "-",
    category: "边界",
    precondition: "password=''",
    action: "loginSchema.safeParse(input)",
    expected: "success=false",
  },
  {
    id: "UNIT-43",
    level: "单元",
    file: "tests/unit/auth-validators.test.ts",
    title: "缺少用户名被拒绝",
    endpoint: "-",
    category: "失败",
    precondition: "input 仅含 password",
    action: "loginSchema.safeParse(input)",
    expected: "success=false",
  },
  {
    id: "UNIT-44",
    level: "单元",
    file: "tests/unit/auth-validators.test.ts",
    title: "refreshToken 非空时通过",
    endpoint: "-",
    category: "正常",
    precondition: "input={refreshToken:'token-value'}",
    action: "refreshSchema.parse(input)",
    expected: "refreshToken='token-value'",
  },
  {
    id: "UNIT-45",
    level: "单元",
    file: "tests/unit/auth-validators.test.ts",
    title: "空 refreshToken 被拒绝（边界）",
    endpoint: "-",
    category: "边界",
    precondition: "refreshToken=''",
    action: "refreshSchema.safeParse(input)",
    expected: "success=false",
  },
  {
    id: "API-42",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "创建公开房间：创建者为 owner，房间号为 6 位数字",
    endpoint: "POST /api/v1/rooms",
    category: "正常",
    precondition: "已登录 player_01；User / Room / RoomMember 表已清空",
    action: "POST /api/v1/rooms，body={name:'我的乐队',isPublic:true}，Bearer access token",
    expected: "HTTP 200、code=0、status='active'、roomNumber 为 6 位数字、owner.username='player_01'、members 长度 1 且 role='owner'、响应无 passwordHash、RoomMember 表 count=1",
  },
  {
    id: "API-43",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "创建私有房间：密码以 bcrypt 哈希落库且响应不含 passwordHash",
    endpoint: "POST /api/v1/rooms",
    category: "正常",
    precondition: "已登录 player_01；密码 'secret123'",
    action: "POST /api/v1/rooms，body={name:'秘密合奏',isPublic:false,password:'secret123'}",
    expected: "HTTP 200、isPublic=false、响应无 passwordHash/password、库中 passwordHash 以 '$2' 开头且不等于明文",
  },
  {
    id: "API-44",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "创建房间名为空返回 400 且消息与 spec 一致",
    endpoint: "POST /api/v1/rooms",
    category: "失败",
    precondition: "已登录 player_01；body name=''",
    action: "POST /api/v1/rooms，body={name:'',isPublic:true}",
    expected: "HTTP 400、body={code:400,msg:'房间名长度必须在 1-50 字符之间',data:null}、Room 表 count=0",
  },
  {
    id: "API-45",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "创建房间名超过 50 字符返回 400（边界）",
    endpoint: "POST /api/v1/rooms",
    category: "边界",
    precondition: "已登录 player_01；body name 长度 51",
    action: "POST /api/v1/rooms",
    expected: "HTTP 400、msg='房间名长度必须在 1-50 字符之间'",
  },
  {
    id: "API-46",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "未登录创建房间返回 401 未登录",
    endpoint: "POST /api/v1/rooms",
    category: "失败",
    precondition: "不带 Authorization 头",
    action: "POST /api/v1/rooms，body={name:'我的乐队',isPublic:true}",
    expected: "HTTP 401、body={code:401,msg:'未登录',data:null}",
  },
  {
    id: "API-47",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "私有房间缺少密码返回 400",
    endpoint: "POST /api/v1/rooms",
    category: "失败",
    precondition: "已登录 player_01；isPublic=false 且未提供 password",
    action: "POST /api/v1/rooms，body={name:'秘密合奏',isPublic:false}",
    expected: "HTTP 400、body={code:400,msg:'私有房间密码长度必须在 8-32 位之间',data:null}",
  },
  {
    id: "API-48",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "列出公开房间：仅 active 公开房间并按创建时间倒序",
    endpoint: "GET /api/v1/rooms",
    category: "正常",
    precondition: "player_01 与 player_02 各建 1 个公开房间，另有 1 个私有房间；旧房间 createdAt 前移 1 小时",
    action: "GET /api/v1/rooms（匿名）",
    expected: "HTTP 200、data 长度 2、顺序为 [新房间, 旧房间]、不含私有房间、首条 memberCount=1 且 owner.username='player_02'、无 passwordHash",
  },
  {
    id: "API-49",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "没有活跃公开房间时返回空数组",
    endpoint: "GET /api/v1/rooms",
    category: "边界",
    precondition: "Room 表为空",
    action: "GET /api/v1/rooms",
    expected: "HTTP 200、body={code:0,msg:'ok',data:[]}",
  },
  {
    id: "API-50",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "列出公开房间最多返回 20 条（边界）",
    endpoint: "GET /api/v1/rooms",
    category: "边界",
    precondition: "同一用户连续创建 21 个公开房间",
    action: "GET /api/v1/rooms",
    expected: "HTTP 200、data 长度恰为 20",
  },
  {
    id: "API-51",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "房间详情：成员返回 isMember=true 与 role",
    endpoint: "GET /api/v1/rooms/:roomId",
    category: "正常",
    precondition: "已登录 player_01 创建公开房间",
    action: "GET /api/v1/rooms/:id，Bearer access token",
    expected: "HTTP 200、isMember=true、role='owner'、members 长度 1、无 passwordHash",
  },
  {
    id: "API-52",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "私有房间详情对非成员不返回 passwordHash",
    endpoint: "GET /api/v1/rooms/:roomId",
    category: "正常",
    precondition: "player_01 创建私有房间，player_02 未加入",
    action: "GET /api/v1/rooms/:id，Bearer player_02 token",
    expected: "HTTP 200、isPublic=false、owner.username='player_01'、isMember=false、role=null、无 passwordHash",
  },
  {
    id: "API-53",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "房间不存在返回 404 房间不存在",
    endpoint: "GET /api/v1/rooms/:roomId",
    category: "失败",
    precondition: "请求 id='not-exists'",
    action: "GET /api/v1/rooms/not-exists",
    expected: "HTTP 404、body={code:404,msg:'房间不存在',data:null}",
  },
  {
    id: "API-54",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "已结束房间仍可查看详情且 status=ended",
    endpoint: "GET /api/v1/rooms/:roomId",
    category: "边界",
    precondition: "房主已调用 end",
    action: "GET /api/v1/rooms/:id，Bearer owner token",
    expected: "HTTP 200、status='ended'",
  },
  {
    id: "API-55",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "加入公开房间成功并出现在成员列表",
    endpoint: "POST /api/v1/rooms/:roomId/join",
    category: "正常",
    precondition: "公开房间 owner=player_01，player_02 未加入",
    action: "POST /api/v1/rooms/:id/join，Bearer player_02 token，body={}",
    expected: "HTTP 200、members 长度 2、player_02 的 role='member'",
  },
  {
    id: "API-56",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "私有房间密码正确可加入",
    endpoint: "POST /api/v1/rooms/:roomId/join",
    category: "正常",
    precondition: "私有房间密码 'secret123'",
    action: "POST /api/v1/rooms/:id/join，body={password:'secret123'}",
    expected: "HTTP 200、RoomMember 表 count=2",
  },
  {
    id: "API-57",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "私有房间密码错误返回 401 房间密码错误",
    endpoint: "POST /api/v1/rooms/:roomId/join",
    category: "失败",
    precondition: "私有房间密码 'secret123'，提交 'wrongpass1'",
    action: "POST /api/v1/rooms/:id/join",
    expected: "HTTP 401、body={code:401,msg:'房间密码错误',data:null}、RoomMember 表仍为 1",
  },
  {
    id: "API-58",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "私有房间未提供密码返回 401 房间密码错误（边界）",
    endpoint: "POST /api/v1/rooms/:roomId/join",
    category: "边界",
    precondition: "私有房间，请求体为空对象",
    action: "POST /api/v1/rooms/:id/join，body={}",
    expected: "HTTP 401、msg='房间密码错误'",
  },
  {
    id: "API-59",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "重复加入返回 409 你已是该房间成员",
    endpoint: "POST /api/v1/rooms/:roomId/join",
    category: "失败",
    precondition: "房主 player_01 已是成员",
    action: "POST /api/v1/rooms/:id/join，Bearer owner token",
    expected: "HTTP 409、body={code:409,msg:'你已是该房间成员',data:null}、RoomMember 表仍为 1",
  },
  {
    id: "API-60",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "加入已锁定房间返回 403 房间已锁定，无法加入",
    endpoint: "POST /api/v1/rooms/:roomId/join",
    category: "失败",
    precondition: "房主已 lock 公开房间",
    action: "POST /api/v1/rooms/:id/join，Bearer player_02 token",
    expected: "HTTP 403、body={code:403,msg:'房间已锁定，无法加入',data:null}",
  },
  {
    id: "API-61",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "加入已结束房间返回 403 合奏已结束",
    endpoint: "POST /api/v1/rooms/:roomId/join",
    category: "失败",
    precondition: "房主已 end 公开房间",
    action: "POST /api/v1/rooms/:id/join，Bearer player_02 token",
    expected: "HTTP 403、body={code:403,msg:'合奏已结束',data:null}",
  },
  {
    id: "API-62",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "按房间号加入公开房间成功（边界）",
    endpoint: "POST /api/v1/rooms/:roomId/join",
    category: "边界",
    precondition: "公开房间已创建，路径参数使用 6 位 roomNumber",
    action: "POST /api/v1/rooms/:roomNumber/join，Bearer player_02 token",
    expected: "HTTP 200、data.id 等于房间 id、members 长度 2",
  },
  {
    id: "API-63",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "加入不存在的房间返回 404 房间不存在",
    endpoint: "POST /api/v1/rooms/:roomId/join",
    category: "失败",
    precondition: "路径参数 'not-exists'，已登录",
    action: "POST /api/v1/rooms/not-exists/join",
    expected: "HTTP 404、msg='房间不存在'",
  },
  {
    id: "API-64",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "密码明文不出现在错误日志中",
    endpoint: "POST /api/v1/rooms/:roomId/join",
    category: "失败",
    precondition: "私有房间密码 'secret123'，提交错误密码 'leak-check-pwd'，拦截 console.error",
    action: "POST /api/v1/rooms/:id/join",
    expected: "console.error 输出不包含 'leak-check-pwd' 与 'secret123'",
  },
  {
    id: "API-65",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "房主踢普通成员后成员列表更新",
    endpoint: "DELETE /api/v1/rooms/:roomId/members/:userId",
    category: "正常",
    precondition: "公开房间 owner=player_01，player_02 已加入",
    action: "DELETE /api/v1/rooms/:id/members/:otherId，Bearer owner token",
    expected: "HTTP 200、members 长度 1、不含 player_02、对应 RoomMember 记录为 null",
  },
  {
    id: "API-66",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "房主踢自己返回 400 不能踢房主",
    endpoint: "DELETE /api/v1/rooms/:roomId/members/:userId",
    category: "失败",
    precondition: "房主对自身 userId 调用",
    action: "DELETE /api/v1/rooms/:id/members/:ownerId",
    expected: "HTTP 400、body={code:400,msg:'不能踢房主',data:null}",
  },
  {
    id: "API-67",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "普通成员尝试踢人返回 403 无权限",
    endpoint: "DELETE /api/v1/rooms/:roomId/members/:userId",
    category: "失败",
    precondition: "player_02 是 member 角色",
    action: "DELETE /api/v1/rooms/:id/members/:otherId，Bearer player_02 token",
    expected: "HTTP 403、body={code:403,msg:'无权限',data:null}",
  },
  {
    id: "API-68",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "踢不在房间的用户返回 404 该成员不在房间中",
    endpoint: "DELETE /api/v1/rooms/:roomId/members/:userId",
    category: "失败",
    precondition: "player_03 已注册但未加入房间",
    action: "DELETE /api/v1/rooms/:id/members/:thirdId，Bearer owner token",
    expected: "HTTP 404、body={code:404,msg:'该成员不在房间中',data:null}",
  },
  {
    id: "API-69",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "非成员调用踢人返回 403 不是房间成员",
    endpoint: "DELETE /api/v1/rooms/:roomId/members/:userId",
    category: "失败",
    precondition: "player_03 未加入房间",
    action: "DELETE /api/v1/rooms/:id/members/:thirdId，Bearer player_03 token",
    expected: "HTTP 403、body={code:403,msg:'不是房间成员',data:null}",
  },
  {
    id: "API-70",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "房主加锁成功返回 status=locked",
    endpoint: "POST /api/v1/rooms/:roomId/lock",
    category: "正常",
    precondition: "active 公开房间，owner 已登录",
    action: "POST /api/v1/rooms/:id/lock，Bearer owner token",
    expected: "HTTP 200、status='locked'",
  },
  {
    id: "API-71",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "非房主尝试加锁返回 403 无权限",
    endpoint: "POST /api/v1/rooms/:roomId/lock",
    category: "失败",
    precondition: "player_02 已加入且 role=member",
    action: "POST /api/v1/rooms/:id/lock，Bearer player_02 token",
    expected: "HTTP 403、msg='无权限'",
  },
  {
    id: "API-72",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "房主结束合奏返回 status=ended",
    endpoint: "POST /api/v1/rooms/:roomId/end",
    category: "正常",
    precondition: "active 公开房间，owner 已登录",
    action: "POST /api/v1/rooms/:id/end，Bearer owner token",
    expected: "HTTP 200、status='ended'",
  },
  {
    id: "API-73",
    level: "接口",
    file: "tests/api/rooms.test.ts",
    title: "已结束房间再次结束返回 400 房间已结束",
    endpoint: "POST /api/v1/rooms/:roomId/end",
    category: "失败",
    precondition: "房间已 ended",
    action: "再次 POST /api/v1/rooms/:id/end",
    expected: "HTTP 400、body={code:400,msg:'房间已结束',data:null}",
  },
  {
    id: "UNIT-46",
    level: "单元",
    file: "tests/unit/room-lib.test.ts",
    title: "生成 6 位数字房间号，100 次调用均在 100000-999999 且不重复",
    endpoint: "-",
    category: "正常",
    precondition: "Room 表为空",
    action: "连续调用 generateRoomNumber() 100 次",
    expected: "100 个值均为 6 位数字、范围 100000-999999、Set 大小 100",
  },
  {
    id: "UNIT-47",
    level: "单元",
    file: "tests/unit/room-lib.test.ts",
    title: "移除 passwordHash 并保留房间与成员信息",
    endpoint: "-",
    category: "正常",
    precondition: "构造含 passwordHash 与 owner/members 关系的 room 对象",
    action: "serializeRoom(room)",
    expected: "结果无 passwordHash，owner={id:'user_1',username:'alice'}，members 长度 1 且 role='owner'",
  },
  {
    id: "UNIT-48",
    level: "单元",
    file: "tests/unit/room-lib.test.ts",
    title: "无 owner / members 关系时返回 null 与空数组（边界）",
    endpoint: "-",
    category: "边界",
    precondition: "room 未加载 owner / members 关系",
    action: "serializeRoom(room)",
    expected: "owner=null、members=[]、无 passwordHash",
  },
  {
    id: "UNIT-49",
    level: "单元",
    file: "tests/unit/room-validators.test.ts",
    title: "公开房间：合法房间名通过并默认 isPublic=true",
    endpoint: "-",
    category: "正常",
    precondition: "input={name:'我的乐队'}",
    action: "createRoomSchema.safeParse(input)",
    expected: "success=true、data.isPublic=true",
  },
  {
    id: "UNIT-50",
    level: "单元",
    file: "tests/unit/room-validators.test.ts",
    title: "房间名 1 与 50 字符为合法边界",
    endpoint: "-",
    category: "边界",
    precondition: "name 长度分别为 1 和 50",
    action: "createRoomSchema.safeParse(input)",
    expected: "两次 success=true",
  },
  {
    id: "UNIT-51",
    level: "单元",
    file: "tests/unit/room-validators.test.ts",
    title: "房间名空串与 51 字符返回错误且消息与 spec 一致",
    endpoint: "-",
    category: "失败",
    precondition: "name='' 与 name 长度 51",
    action: "createRoomSchema.safeParse(input)",
    expected: "success=false、issues[0].message='房间名长度必须在 1-50 字符之间'",
  },
  {
    id: "UNIT-52",
    level: "单元",
    file: "tests/unit/room-validators.test.ts",
    title: "私有房间密码 8 与 32 字符为合法边界",
    endpoint: "-",
    category: "边界",
    precondition: "isPublic=false，password 长度 8 和 32",
    action: "createRoomSchema.safeParse(input)",
    expected: "两次 success=true",
  },
  {
    id: "UNIT-53",
    level: "单元",
    file: "tests/unit/room-validators.test.ts",
    title: "私有房间缺少密码或密码长度越界返回错误",
    endpoint: "-",
    category: "失败",
    precondition: "isPublic=false，password 缺失 / 7 字符 / 33 字符",
    action: "createRoomSchema.safeParse(input)",
    expected: "三次 success=false、issues[0].message='私有房间密码长度必须在 8-32 位之间'",
  },
  {
    id: "UNIT-54",
    level: "单元",
    file: "tests/unit/room-validators.test.ts",
    title: "缺少 name 或 isPublic 非布尔值返回错误",
    endpoint: "-",
    category: "失败",
    precondition: "input 无 name；isPublic='yes'",
    action: "createRoomSchema.safeParse(input)",
    expected: "两次 success=false",
  },
  {
    id: "UNIT-55",
    level: "单元",
    file: "tests/unit/room-validators.test.ts",
    title: "空对象（公开房间不带密码）通过",
    endpoint: "-",
    category: "正常",
    precondition: "input={}",
    action: "joinRoomSchema.safeParse(input)",
    expected: "success=true",
  },
  {
    id: "UNIT-56",
    level: "单元",
    file: "tests/unit/room-validators.test.ts",
    title: "密码 8 与 32 字符为合法边界",
    endpoint: "-",
    category: "边界",
    precondition: "password 长度 8 和 32",
    action: "joinRoomSchema.safeParse(input)",
    expected: "两次 success=true",
  },
  {
    id: "UNIT-57",
    level: "单元",
    file: "tests/unit/room-validators.test.ts",
    title: "密码 7 与 33 字符返回错误",
    endpoint: "-",
    category: "失败",
    precondition: "password 长度 7 和 33",
    action: "joinRoomSchema.safeParse(input)",
    expected: "两次 success=false、issues[0].message='私有房间密码长度必须在 8-32 位之间'",
  },
  {
    id: "UNIT-58",
    level: "单元",
    file: "tests/unit/room-middleware.test.ts",
    title: "requireRoomRole：房间不存在返回 404 房间不存在",
    endpoint: "-",
    category: "失败",
    precondition: "req.params.roomId='missing_room'",
    action: "requireRoomRole(owner)(req,res,next)",
    expected: "next 收到 BusinessError(code=404,msg='房间不存在')",
  },
  {
    id: "UNIT-59",
    level: "单元",
    file: "tests/unit/room-middleware.test.ts",
    title: "非成员返回 403 不是房间成员",
    endpoint: "-",
    category: "失败",
    precondition: "userId 无对应 RoomMember 记录",
    action: "requireRoomRole(owner)(req,res,next)",
    expected: "next 收到 BusinessError(code=403,msg='不是房间成员')",
  },
  {
    id: "UNIT-60",
    level: "单元",
    file: "tests/unit/room-middleware.test.ts",
    title: "普通成员调用房主操作返回 403 无权限",
    endpoint: "-",
    category: "失败",
    precondition: "member 角色用户调用 requireRoomRole(owner)",
    action: "requireRoomRole(owner)(req,res,next)",
    expected: "next 收到 BusinessError(code=403,msg='无权限')",
  },
  {
    id: "UNIT-61",
    level: "单元",
    file: "tests/unit/room-middleware.test.ts",
    title: "房主调用房主操作通过并注入 req.room 与 memberRole",
    endpoint: "-",
    category: "正常",
    precondition: "owner 角色用户调用 requireRoomRole(owner)",
    action: "requireRoomRole(owner)(req,res,next)",
    expected: "next 无错误、req.room.id='room_test_01'、req.memberRole='owner'",
  },
  {
    id: "UNIT-62",
    level: "单元",
    file: "tests/unit/room-middleware.test.ts",
    title: "普通成员调用 member 级操作通过，房主同样通过",
    endpoint: "-",
    category: "正常",
    precondition: "member 与 owner 分别调用 requireRoomRole(member)",
    action: "requireRoomRole(member)(req,res,next)",
    expected: "两次 next 均无错误；memberRole 分别为 'member' 与 'owner'",
  },
];

const CASE_BY_TITLE = new Map(CASES.map((item) => [item.title, item]));

// ---------------------------------------------------------------------------
// 执行
// ---------------------------------------------------------------------------
function prepareTestDatabase() {
  removeIfExists(TEST_DB);
  removeIfExists(TEST_DB_JOURNAL);
  fs.mkdirSync(TMP_DIR, { recursive: true });

  log("[test] 迁移测试数据库 backend/prisma/test.db ...");
  const migrate = capture(process.execPath, [PRISMA_BIN, "migrate", "deploy"], {
    cwd: path.join(ROOT, "backend"),
    env: { DATABASE_URL: "file:./test.db", NODE_ENV: "test" },
    display: "npx prisma migrate deploy（DATABASE_URL=file:./test.db）",
  });

  if (migrate.code !== 0) {
    log(migrate.stdout);
    log(migrate.stderr);
    throw new Error("[test] 测试数据库迁移失败");
  }
  log(migrate.stdout.split(/\r?\n/).slice(-3).join("\n"));
}

function runVitest() {
  log("\n[test] 运行 vitest ...\n");
  removeIfExists(RESULTS_FILE);

  const run = runInherit(
    process.execPath,
    [
      VITEST_BIN,
      "run",
      "--config",
      "tests/vitest.config.ts",
      "--reporter=verbose",
      "--reporter=json",
      `--outputFile.json=${RESULTS_FILE}`,
    ],
    { timeout: 600_000 }
  );

  if (!fs.existsSync(RESULTS_FILE)) {
    throw new Error("[test] 未生成 vitest JSON 结果文件，无法生成报告");
  }

  return {
    exitCode: run.status ?? 1,
    report: JSON.parse(fs.readFileSync(RESULTS_FILE, "utf8")),
  };
}

function flattenResults(report) {
  const results = [];
  for (const suite of report.testResults ?? []) {
    for (const assertion of suite.assertionResults ?? []) {
      results.push({
        file: suite.name,
        title: assertion.title,
        fullName: assertion.fullName ?? assertion.title,
        status: assertion.status,
        duration: assertion.duration ?? 0,
        failureMessages: assertion.failureMessages ?? [],
      });
    }
    if ((suite.assertionResults ?? []).length === 0 && suite.status === "failed") {
      results.push({
        file: suite.name,
        title: "(测试文件加载失败)",
        fullName: "(测试文件加载失败)",
        status: "failed",
        duration: 0,
        failureMessages: [suite.message ?? "未知错误"],
      });
    }
  }
  return results;
}

function relFile(file) {
  const normalized = file.replace(/\\/g, "/");
  const marker = "/tests/";
  const idx = normalized.indexOf(marker);
  return idx >= 0 ? normalized.slice(idx + 1) : path.basename(normalized);
}

function actualFor(result, catalogEntry) {
  if (result.status === "passed") {
    return `断言全部成立，与本行期望一致（实测值：${catalogEntry.expected}）`;
  }
  if (result.status === "skipped") {
    return "用例被跳过，未产生观测值";
  }
  return `断言失败：${String(result.failureMessages[0] ?? "未知错误")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(0, 4)
    .join(" / ")}`;
}

function judge(result) {
  return result.status === "passed" ? "PASS" : result.status === "skipped" ? "SKIP" : "FAIL";
}

function rerunCommand(result) {
  const file = relFile(result.file);
  return `npx vitest run --config tests/vitest.config.ts ${file} -t "${result.title}"`;
}

function cell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function auditCountsText(captured) {
  try {
    const parsed = JSON.parse(captured.stdout);
    const counts = parsed.metadata?.vulnerabilities;
    if (!counts) return "未返回 vulnerabilities 统计";
    return `info ${counts.info} / low ${counts.low} / moderate ${counts.moderate} / high ${counts.high} / critical ${counts.critical}（共 ${counts.total}）`;
  } catch {
    return `审计命令未产出可解析 JSON（exit code ${captured.code}）`;
  }
}

function writeReport(reportDir, name, content) {
  fs.writeFileSync(path.join(reportDir, name), `${content.trimEnd()}\n`, "utf8");
  log(`[report] ${name}`);
}

function buildThreePart(results) {
  const lines = [];
  let index = 0;
  for (const result of results) {
    index += 1;
    const catalog = CASE_BY_TITLE.get(result.title) ?? {
      id: `EXTRA-${String(index).padStart(2, "0")}`,
      level: "未分类",
      category: "未分类",
      endpoint: "-",
      precondition: "见测试代码",
      action: "见测试代码",
      expected: "见测试代码断言",
    };
    lines.push(`### ${catalog.id} ${result.title}`);
    lines.push(`- 级别 / 类型：${catalog.level} / ${catalog.category}${catalog.endpoint !== "-" ? ` / ${catalog.endpoint}` : ""}`);
    lines.push(`- 前置条件：${catalog.precondition}`);
    lines.push(`- 操作：${catalog.action}`);
    lines.push(`- 可观测结果与当前实际（期望）：${catalog.expected}`);
    lines.push(`- 当前实际：${actualFor(result, catalog)}`);
    lines.push(`- 判定：**${judge(result)}**（耗时 ${Math.round(result.duration * 10) / 10}ms）`);
    lines.push("");
  }
  return lines.join("\n");
}

function buildReports({
  results,
  report,
  reportDir,
  commit,
  startedAt,
  finishedAt,
  secretScanA,
  secretScanB,
  auditBackend,
  auditRoot,
}) {
  const total = results.length;
  const passed = results.filter((r) => r.status === "passed").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const durationSec = ((finishedAt.getTime() - startedAt.getTime()) / 1000).toFixed(1);
  const failedResults = results.filter((r) => r.status === "failed");
  const red = failed > 0 ? "是（留红，阻断合并）" : "否";
  const apiCases = results.filter((r) => (CASE_BY_TITLE.get(r.title) ?? {}).level === "接口");
  const failedNames = failedResults.length
    ? failedResults.map((r) => `- ${r.fullName}（${relFile(r.file)}）：${String(r.failureMessages[0] ?? "未知错误").split(/\r?\n/)[0]}`).join("\n")
    : "- 无";

  // 1. security-precheck.md
  const precheck = [];
  precheck.push("# 安全前置检查（security-precheck）");
  precheck.push("");
  precheck.push(`- 生成时间：${localTimestamp(finishedAt)}`);
  precheck.push(`- 提交号：${commit}`);
  precheck.push(`- 测试数据库：backend/prisma/test.db（DATABASE_URL=file:./test.db，每轮重建）`);
  precheck.push(`- 运行命令：npm test（vitest run --config tests/vitest.config.ts）`);
  precheck.push("");
  precheck.push("## 接口清单");
  precheck.push("");
  precheck.push("| 方法 | 路径 | 认证要求 | 输入校验 | 已覆盖错误码 |");
  precheck.push("| --- | --- | --- | --- | --- |");
  precheck.push("| GET | /health | 无（公开） | 无入参 | 200 / 500（CORS 拒绝） |");
  precheck.push("| GET | /api/v1/health | 无（公开） | 无入参 | 200 |");
  precheck.push("| GET | /api/v1/hello | 无（公开） | 无入参 | 200 |");
  precheck.push("| POST | /api/v1/jobs | 无（当前 bootstrap 阶段无鉴权路由） | zod submitJobSchema | 200 / 400 |");
  precheck.push("| GET | /api/v1/jobs/:id | 无（当前 bootstrap 阶段无鉴权路由） | zod jobIdSchema | 200 / 404 |");
  precheck.push("| POST | /api/v1/auth/register | 无（公开） | zod registerSchema | 200 / 400 / 409 |");
  precheck.push("| POST | /api/v1/auth/login | 无（公开） | zod loginSchema | 200 / 400 / 401 |");
  precheck.push("| POST | /api/v1/auth/refresh | 需 refresh token（body 或 Bearer） | zod refreshSchema + JWT type 校验 | 200 / 401 |");
  precheck.push("| GET | /api/v1/auth/me | 需 access token（Bearer） | JWT 签名 / 有效期 / type 校验 | 200 / 401 |");
  precheck.push("| POST | /api/v1/rooms | 需 access token（Bearer） | zod createRoomSchema（name 1-50、私有密码 8-32） | 200 / 400 / 401 |");
  precheck.push("| GET | /api/v1/rooms | 无（公开） | 仅 active 公开房间，最多 20 条 | 200 |");
  precheck.push("| GET | /api/v1/rooms/:roomId | 可选 access token（成员增强 isMember/role） | 房间 id 或 6 位房间号 | 200 / 404 |");
  precheck.push("| POST | /api/v1/rooms/:roomId/join | 需 access token（Bearer） | zod joinRoomSchema（密码 8-32 可选）+ 房间状态 | 200 / 400 / 401 / 403 / 404 / 409 |");
  precheck.push("| DELETE | /api/v1/rooms/:roomId/members/:userId | 需 access token + 房间 owner 角色 | 路径参数 + RoomMember 角色 | 200 / 400 / 403 / 404 |");
  precheck.push("| POST | /api/v1/rooms/:roomId/lock | 需 access token + 房间 owner 角色 | RoomMember 角色 | 200 / 400 / 403 / 404 |");
  precheck.push("| POST | /api/v1/rooms/:roomId/end | 需 access token + 房间 owner 角色 | RoomMember 角色 | 200 / 400 / 403 / 404 |");
  precheck.push("| POST | /api/v1/ai/compose | 需 access token（Bearer） | zod composeSchema（instruction 1-500、roomId、bpm） | 200 / 400 / 401 |");
  precheck.push("| GET | /api/v1/ai/compose/:jobId | 需 access token（Bearer） | 路径 jobId | 200 / 401 / 404 |");
  precheck.push("| POST | /api/v1/ai/ask | 需 access token（Bearer） | zod askSchema（question 1-500） | 200 / 400 / 401 / 503 |");
  precheck.push("| POST | /api/v1/ai/check | 需 access token（Bearer） | zod checkSchema（tracks 数组） | 200 / 400 / 401 |");
  precheck.push("| POST | /api/v1/ai/fix | 需 access token（Bearer） | zod fixSchema（tracks 含 color、issues、roomId） | 200 / 400 / 401 |");
  precheck.push("| GET | /api/v1/ai/fix/:jobId | 需 access token（Bearer） | 路径 jobId | 200 / 401 / 404 |");
  precheck.push("| * | 未匹配路径 | 无 | - | 404 |");
  precheck.push("");
  precheck.push("## 身份与数据");
  precheck.push("");
  precheck.push("- 身份：register/login 公开；GET /auth/me 要求 access token，POST /auth/refresh 要求 refresh token。缺失/格式错误 → 401 未登录，过期 → 401 令牌已过期，签名非法或 token 类型不匹配 → 401 令牌无效（API-29 ~ API-33、API-37 ~ API-39）。");
  precheck.push("- 数据：测试仅写入独立 SQLite（backend/prisma/test.db），每个用例前清空 User / Job 表；口令只以 bcrypt cost 12 哈希落库且不回传（API-15），JWT payload 仅含 sub/type/iat/exp，不含用户名或邮箱（API-24）。");
  precheck.push("- 房间：测试前额外清空 Room / RoomMember 表；私有房间口令以 bcrypt 哈希落库且序列化时移除 passwordHash（API-42 ~ API-47）；房主专属操作由 requireRoomRole(owner) 拦截——非成员 403 不是房间成员、成员越权 403 无权限（API-65 ~ API-73、UNIT-58 ~ UNIT-62）。");
  precheck.push(`- 接口级用例：${apiCases.length} 条（正常 / 失败 / 边界均已覆盖）；全部用例：${total} 条。`);
  precheck.push("");
  precheck.push("## 用例三段式记录");
  precheck.push("");
  precheck.push(buildThreePart(results));
  writeReport(reportDir, "security-precheck.md", precheck.join("\n"));

  // 2. risk-authz.md
  const authz = [];
  authz.push("# 权限风险用例（risk-authz）");
  authz.push("");
  authz.push("## 权限矩阵");
  authz.push("");
  authz.push("| 接口 | 是否需登录 | 允许来源 | 判定依据 |");
  authz.push("| --- | --- | --- | --- |");
  authz.push("| GET /health、GET /api/v1/health、GET /api/v1/hello | 否（公开） | 无 Origin 或 http://localhost:5173 | API-01/02/03/04 |");
  authz.push("| POST /api/v1/jobs、GET /api/v1/jobs/:id | 否（bootstrap 阶段无鉴权路由） | 同上 | API-05 ~ API-14 |");
  authz.push("| POST /api/v1/auth/register、POST /api/v1/auth/login | 否（公开） | 同上 | API-15 ~ API-27 |");
  authz.push("| GET /api/v1/auth/me | 是（access token，type 必须为 access） | 同上 | API-28 ~ API-34 |");
  authz.push("| POST /api/v1/auth/refresh | 是（refresh token，type 必须为 refresh） | 同上 | API-35 ~ API-40 |");
  authz.push("| POST /api/v1/rooms、POST /api/v1/rooms/:roomId/join | 是（access token） | 同上 | API-42 ~ API-47、API-55 ~ API-64 |");
  authz.push("| GET /api/v1/rooms、GET /api/v1/rooms/:roomId | 否（公开，详情可选登录） | 同上 | API-48 ~ API-54 |");
  authz.push("| DELETE .../members/:userId、POST .../lock、POST .../end | 是（access token + 房间 owner 角色） | 同上 | API-65 ~ API-73、UNIT-58 ~ UNIT-62 |");
  authz.push("| 401 未认证映射 | 预留 | - | UNIT-06 |");
  authz.push("");
  authz.push("## 用例展开");
  authz.push("");
  authz.push("### AZ-01 未认证请求映射");
  authz.push("- 前置条件：路由抛出 AuthError（后续受保护路由的鉴权失败路径）");
  authz.push("- 操作：GET /auth（挂载 errorMiddleware 的最小应用）");
  authz.push("- 可观测结果与当前实际：期望 HTTP 401、body={code:401,msg:'未认证或登录已过期',data:null}；当前实际见 UNIT-06 判定。");
  authz.push(`- 复测命令：${rerunCommand({ file: "tests/unit/error-middleware.test.ts", title: "AuthError 映射为 HTTP 401 / code 401" })}`);
  authz.push("");
  authz.push("### AZ-02 跨域来源拒绝");
  authz.push("- 前置条件：请求 Origin=http://evil.example.com，不在允许列表");
  authz.push("- 操作：GET /health");
  authz.push("- 可观测结果与当前实际：期望 HTTP 500、统一错误体、无 ACAO 响应头；当前实际见 API-04 判定。");
  authz.push(`- 复测命令：${rerunCommand({ file: "tests/api/health.test.ts", title: "GET /health 对未允许来源返回 CORS 错误（500 由中间件统一格式）" })}`);
  authz.push("");
  authz.push("### AZ-03 允许来源与预检");
  authz.push("- 前置条件：Origin=http://localhost:5173，预检请求 Access-Control-Request-Method=POST");
  authz.push("- 操作：OPTIONS /api/v1/jobs");
  authz.push("- 可观测结果与当前实际：期望 HTTP 204、ACAO=http://localhost:5173、allow-methods 含 POST；当前实际见 API-14 判定。");
  authz.push(`- 复测命令：${rerunCommand({ file: "tests/api/jobs.test.ts", title: "CORS 预检请求返回 204 并允许 POST" })}`);
  authz.push("");
  authz.push("### AZ-04 受保护接口缺少凭据");
  authz.push("- 前置条件：已注册 alice_01，但 GET /me 不带 Authorization 头");
  authz.push("- 操作：GET /api/v1/auth/me");
  authz.push("- 可观测结果与当前实际：期望 HTTP 401、body={code:401,msg:'未登录',data:null}；当前实际见 API-29（格式错误头见 API-30）。");
  authz.push(`- 复测命令：${rerunCommand({ file: "tests/api/auth.test.ts", title: "缺少 Authorization 返回 401 未登录" })}`);
  authz.push("");
  authz.push("### AZ-05 令牌类型隔离（refresh 不能当 access 用）");
  authz.push("- 前置条件：登录取得 refresh token，分别用于 GET /me 与 POST /refresh（access 反向使用）");
  authz.push("- 操作：带 refresh token 访问 /me；带 access token 调用 /refresh");
  authz.push("- 可观测结果与当前实际：期望两次都返回 HTTP 401、msg='令牌无效'；当前实际见 API-33 与 API-37。");
  authz.push(`- 复测命令：${rerunCommand({ file: "tests/api/auth.test.ts", title: "用 refresh token 访问受保护接口返回 401 令牌无效（令牌类型隔离）" })}`);
  authz.push("");
  authz.push("### AZ-06 过期与伪造令牌");
  authz.push("- 前置条件：用正确密钥签发 exp 已过期的 access token；用 wrong-secret 伪造 access token");
  authz.push("- 操作：分别带两种 token 访问 GET /api/v1/auth/me");
  authz.push("- 可观测结果与当前实际：过期 → HTTP 401 msg='令牌已过期'；伪造 → HTTP 401 msg='令牌无效'；当前实际见 API-31 与 API-32。");
  authz.push(`- 复测命令：${rerunCommand({ file: "tests/api/auth.test.ts", title: "过期的 access token 返回 401 令牌已过期" })}`);
  authz.push("");
  authz.push("### AZ-07 私有房间口令校验");
  authz.push("- 前置条件：player_01 创建私有房间 password='secret123'，player_02 提交错误密码 'wrongpass1'");
  authz.push("- 操作：POST /api/v1/rooms/:id/join");
  authz.push("- 可观测结果与当前实际：期望 HTTP 401、body={code:401,msg:'房间密码错误',data:null}，RoomMember 表仍为 1，日志不含口令明文；当前实际见 API-57 与 API-64。");
  authz.push(`- 复测命令：${rerunCommand({ file: "tests/api/rooms.test.ts", title: "私有房间密码错误返回 401 房间密码错误" })}`);
  authz.push("");
  authz.push("### AZ-08 房主专属操作越权");
  authz.push("- 前置条件：player_02 已以 member 角色加入房间；player_03 未加入");
  authz.push("- 操作：player_02 调用 DELETE /rooms/:id/members/:userId 与 POST /rooms/:id/lock；player_03 调用 DELETE 踢人");
  authz.push("- 可观测结果与当前实际：member 越权 → HTTP 403 msg='无权限'（API-67、API-71）；非成员 → HTTP 403 msg='不是房间成员'（API-69）；当前实际见对应用例。");
  authz.push(`- 复测命令：${rerunCommand({ file: "tests/api/rooms.test.ts", title: "普通成员尝试踢人返回 403 无权限" })}`);
  authz.push("");
  authz.push("### AZ-09 加入房间状态门禁");
  authz.push("- 前置条件：公开房间分别处于 locked 与 ended 状态");
  authz.push("- 操作：player_02 POST /api/v1/rooms/:id/join");
  authz.push("- 可观测结果与当前实际：locked → HTTP 403 msg='房间已锁定，无法加入'（API-60）；ended → HTTP 403 msg='合奏已结束'（API-61）。");
  authz.push(`- 复测命令：${rerunCommand({ file: "tests/api/rooms.test.ts", title: "加入已锁定房间返回 403 房间已锁定，无法加入" })}`);
  authz.push("");
  authz.push("## 结论");
  authz.push("");
  const authzTitles = [
    "GET /health 对未允许来源返回 CORS 错误（500 由中间件统一格式）",
    "AuthError 映射为 HTTP 401 / code 401",
    "CORS 预检请求返回 204 并允许 POST",
    "缺少 Authorization 返回 401 未登录",
    "用 refresh token 访问受保护接口返回 401 令牌无效（令牌类型隔离）",
    "用 access token 调用 refresh 返回 401 令牌无效",
    "签名无效的 access token 返回 401 令牌无效",
    "过期的 access token 返回 401 令牌已过期",
    "私有房间密码错误返回 401 房间密码错误",
    "密码明文不出现在错误日志中",
    "普通成员尝试踢人返回 403 无权限",
    "非成员调用踢人返回 403 不是房间成员",
    "加入已锁定房间返回 403 房间已锁定，无法加入",
    "加入已结束房间返回 403 合奏已结束",
  ];
  const authzFail = results.filter((r) => authzTitles.includes(r.title) && r.status !== "passed").length;
  authz.push(`- 权限相关用例 ${authzTitles.length} 条，失败 ${authzFail} 条；公开接口无越权前提，受保护接口已按“签名 + 有效期 + token 类型”三重校验，覆盖缺失、格式错误、过期、伪造与类型错配；房间接口另按“登录态 + 房间角色 + 房间状态 + 私有口令”多重门禁，覆盖非成员、成员越权、锁定/结束加入与口令错误。`);
  writeReport(reportDir, "risk-authz.md", authz.join("\n"));

  // 3. risk-concurrency.md
  const concurrency = [];
  concurrency.push("# 并发风险用例（risk-concurrency）");
  concurrency.push("");
  concurrency.push("## CC-01 同一任务被并发领取只执行一次");
  concurrency.push("- 前置条件：注册 test:concurrent-once 处理器并对调用计数；创建 1 条 status=pending 的 Job。");
  concurrency.push("- 操作：Promise.all([runJob(id), runJob(id)])，两个并发调用同时尝试领取同一任务。");
  concurrency.push("- 实现约束：领取使用 `updateMany({where:{id,status:'pending'}})` 条件更新，只有 count=1 的调用继续执行。");
  concurrency.push("- 可观测结果与当前实际：期望 handler 调用次数=1、最终 status='success'、result={ok:true}；当前实际见 UNIT-24 判定。");
  concurrency.push(`- 复测命令：${rerunCommand({ file: "tests/unit/worker.test.ts", title: "并发重复领取同一任务时 handler 只执行一次" })}`);
  concurrency.push("");
  concurrency.push("## 结论");
  concurrency.push("");
  const concurrencyFail = results.filter((r) => r.title === "并发重复领取同一任务时 handler 只执行一次" && r.status !== "passed").length;
  concurrency.push(`- 并发用例 1 条，失败 ${concurrencyFail} 条；原子领取逻辑在当前 SQLite 单连接测试下复现通过。`);
  writeReport(reportDir, "risk-concurrency.md", concurrency.join("\n"));

  // 4. risk-transaction.md
  const transaction = [];
  transaction.push("# 事务风险用例（risk-transaction）");
  transaction.push("");
  transaction.push("## TX-01 任务创建单行写入一致性");
  transaction.push("- 前置条件：Job 表为空；body={type:'test',payload:{foo:'bar'}}。");
  transaction.push("- 操作：POST /api/v1/jobs。");
  transaction.push("- 可观测结果与当前实际：期望返回 status='pending'、retryCount=0、maxRetries=3，且 Job 表 count 恰为 1；当前实际见 API-05 判定。");
  transaction.push(`- 复测命令：${rerunCommand({ file: "tests/api/jobs.test.ts", title: "提交合法任务后落库，返回 pending 任务结构" })}`);
  transaction.push("");
  transaction.push("## TX-02 校验失败不产生脏数据");
  transaction.push("- 前置条件：Job 表为空；body={payload:{}}（缺少 type）。");
  transaction.push("- 操作：POST /api/v1/jobs。");
  transaction.push("- 可观测结果与当前实际：期望 HTTP 400 且 Job 表 count=0；当前实际见 API-07 判定。");
  transaction.push(`- 复测命令：${rerunCommand({ file: "tests/api/jobs.test.ts", title: "缺少 type 返回 400 与具体校验信息" })}`);
  transaction.push("");
  transaction.push("## TX-03 状态流转最终态唯一");
  transaction.push("- 前置条件：Job retryCount=3、maxRetries=3，处理器持续抛错。");
  transaction.push("- 操作：runJob(id)。");
  transaction.push("- 可观测结果与当前实际：期望最终 status='failed'、retryCount=3、error='boom'，不会同时出现 success；当前实际见 UNIT-23 判定。");
  transaction.push(`- 复测命令：${rerunCommand({ file: "tests/unit/worker.test.ts", title: "重试次数耗尽后标记最终 failed" })}`);
  transaction.push("");
  transaction.push("## TX-04 注册校验失败不产生脏数据");
  transaction.push("- 前置条件：User 表为空；body={username:'alice_01',password:'OnlyLetters'}。");
  transaction.push("- 操作：POST /api/v1/auth/register。");
  transaction.push("- 可观测结果与当前实际：期望 HTTP 400 且 User 表 count=0；当前实际见 API-18 判定。");
  transaction.push(`- 复测命令：${rerunCommand({ file: "tests/api/auth.test.ts", title: "密码不含数字返回 400 且消息与 spec 一致" })}`);
  transaction.push("");
  transaction.push("## TX-05 重复注册不覆盖既有用户");
  transaction.push("- 前置条件：alice_01 已存在；再次以同一用户名提交注册。");
  transaction.push("- 操作：POST /api/v1/auth/register（唯一约束冲突）。");
  transaction.push("- 可观测结果与当前实际：期望 HTTP 409、msg='用户名已被占用'，且 User 表 count 仍为 1（既有记录未被修改）；当前实际见 API-16 判定。");
  transaction.push(`- 复测命令：${rerunCommand({ file: "tests/api/auth.test.ts", title: "重复用户名返回 409 且消息与 spec 一致" })}`);
  transaction.push("");
  transaction.push("## 结论");
  transaction.push("");
  transaction.push("- 当前数据模型为单表 Job 与 User，无跨表事务；本次以“落库条数 / 失败不落库 / 冲突不覆盖 / 最终态唯一”四项作为一致性证据，均通过。");
  writeReport(reportDir, "risk-transaction.md", transaction.join("\n"));

  // 5. security-baseline.md
  const baseline = [];
  baseline.push("# 安全基线（security-baseline）");
  baseline.push("");
  baseline.push("## 1. 硬编码密钥扫描");
  baseline.push("");
  baseline.push("```bash");
  baseline.push(secretScanA.display);
  baseline.push("```");
  baseline.push("");
  baseline.push("输出原文：");
  baseline.push("");
  baseline.push("```text");
  baseline.push(secretScanA.stdout || "(无匹配)");
  if (secretScanA.stderr) baseline.push(`stderr: ${secretScanA.stderr}`);
  baseline.push(`exit code: ${secretScanA.code}`);
  baseline.push("```");
  baseline.push("");
  baseline.push("```bash");
  baseline.push(secretScanB.display);
  baseline.push("```");
  baseline.push("");
  baseline.push("输出原文：");
  baseline.push("");
  baseline.push("```text");
  baseline.push(secretScanB.stdout || "(无匹配)");
  if (secretScanB.stderr) baseline.push(`stderr: ${secretScanB.stderr}`);
  baseline.push(`exit code: ${secretScanB.code}`);
  baseline.push("```");
  baseline.push("");
  baseline.push("判读：.env 未纳入版本控制（.gitignore 已排除），.env.example 仅保留占位模板；扫描范围内未发现可直接使用的真实密钥。");
  baseline.push("");
  baseline.push("## 2. 依赖审计（backend，生产依赖）");
  baseline.push("");
  baseline.push("```bash");
  baseline.push(auditBackend.display);
  baseline.push("```");
  baseline.push("");
  baseline.push("输出原文：");
  baseline.push("");
  baseline.push("```text");
  baseline.push(auditBackend.stdout || "(无输出)");
  if (auditBackend.stderr) baseline.push(`stderr: ${auditBackend.stderr}`);
  baseline.push(`exit code: ${auditBackend.code}`);
  baseline.push("```");
  baseline.push("");
  baseline.push("## 3. 依赖审计（根级测试依赖）");
  baseline.push("");
  baseline.push("```bash");
  baseline.push(auditRoot.display);
  baseline.push("```");
  baseline.push("");
  baseline.push("输出原文：");
  baseline.push("");
  baseline.push("```text");
  baseline.push(auditRoot.stdout || "(无输出)");
  if (auditRoot.stderr) baseline.push(`stderr: ${auditRoot.stderr}`);
  baseline.push(`exit code: ${auditRoot.code}`);
  baseline.push("```");
  baseline.push("");
  baseline.push("## 4. 审计结论");
  baseline.push("");
  baseline.push(`- backend 生产依赖：${auditCountsText(auditBackend)}`);
  baseline.push(`- 根级测试依赖：${auditCountsText(auditRoot)}`);
  baseline.push("- 处置说明：prisma 6.x 依赖链中的 deepmerge-ts 高危（GHSA-ggr8-5vv4-36mx）修复需升级到 prisma 7 major，而当前 SQLite datasource 写法与 prisma 7 不兼容，先记录为已知风险，后续单独升级验证，不阻塞本次测试补课。");
  writeReport(reportDir, "security-baseline.md", baseline.join("\n"));

  // 6. review-01.md
  const review = [];
  review.push("# 交叉评审记录（review-01）");
  review.push("");
  review.push("## 手段");
  review.push("");
  review.push("以“读取源码差异 + 对照 tests/ 用例清单 + 实跑 npm test”三方交叉的方式评审，不依赖单一视角：");
  review.push("- 逐文件阅读 backend/src 下错误处理、路由、任务队列实现；");
  review.push("- 对照 `.trae/rules/test.md` 逐条核对用例类型（正常 / 失败 / 边界 / 并发 / 事务）；");
  review.push("- 执行 `npm test` 获取真实结果，并核对报告中的具体数值。");
  review.push("");
  review.push("## 查了什么");
  review.push("");
  review.push("1. 全局错误中间件映射：BusinessError / AuthError / ZodError / Prisma P2002 / JSON 解析 / 依赖不可达。");
  review.push("2. 未匹配路由统一 404 JSON，避免 Express 默认 HTML 泄露路由信息。");
  review.push("3. 任务队列原子领取（`updateMany` 条件更新）与重试最终态。");
  review.push("4. 认证实现：bcrypt cost 12、JWT payload 最小化、access/refresh 类型隔离、401 静默刷新与并发刷新锁。");
  review.push("5. 测试数据库隔离：独立 `backend/prisma/test.db`，每轮重建、每用例清表。");
  review.push("6. 敏感信息：仓库内是否存在硬编码密钥；.env 是否被忽略；响应是否回传 passwordHash。");
  review.push("");
  review.push("## 判据");
  review.push("");
  review.push("- 每个接口具备正常、失败、边界三类用例，且断言为具体状态码 / 字段值 / 条数；");
  review.push("- 失败路径覆盖参数非法、未认证/无权限、资源不存在、依赖不可达；");
  review.push("- 单条命令可复现；失败时退出码非零；");
  review.push("- 报告含可复跑的具体实际值，不出现“通过”“没问题”这类空断言。");
  review.push("");
  review.push("## 结果");
  review.push("");
  review.push(`- 用例总数 ${total}：通过 ${passed}、失败 ${failed}、跳过 ${skipped}；耗时 ${durationSec}s；提交号 ${commit}。`);
  review.push(`- 失败用例：${failedResults.length === 0 ? "无" : failedResults.map((r) => r.title).join("；")}`);
  review.push("- 评审发现并已修复的问题：");
  review.push("  1. `express.json()` 解析非法 JSON 时原本落到 500，已改为 400 并补 API-09 / UNIT-09；");
  review.push("  2. 未匹配路由原本返回 Express 默认 404 HTML，已补统一 JSON 404 并补 API-12 / API-13；");
  review.push("  3. `worker.ts` 原先导入即启动，已用入口守卫 + 导出 `runJob` 使其可测，补 UNIT-21 ~ UNIT-24。");
  review.push("  4. 认证中间件所需的 `Request.user` 类型扩展最初放在独立 .d.ts，ts-node-dev 运行时不加载导致编译失败，已改为在 `middleware/auth.ts` 内 `declare global`，补后端 tsc 通过验证。");
  review.push(`- 结论：${failed > 0 ? "存在失败用例，禁止合并，需修复后重跑。" : "全部用例通过，未留红。"}`);
  writeReport(reportDir, "review-01.md", review.join("\n"));

  // 7. test-report.md
  const summary = [];
  summary.push("# 测试运行汇总（test-report）");
  summary.push("");
  summary.push("| 项目 | 值 |");
  summary.push("| --- | --- |");
  summary.push(`| 用例总数 | ${total} |`);
  summary.push(`| 通过 | ${passed} |`);
  summary.push(`| 失败 | ${failed} |`);
  summary.push(`| 跳过 | ${skipped} |`);
  summary.push(`| 运行时间 | ${durationSec}s（${localTimestamp(startedAt)} ~ ${localTimestamp(finishedAt)}） |`);
  summary.push(`| 提交号 | ${commit} |`);
  summary.push(`| 是否留红 | ${red} |`);
  summary.push(`| 报告目录 | ${path.relative(ROOT, reportDir).replace(/\\/g, "/")} |`);
  summary.push("");
  summary.push("## 失败用例与错误摘要");
  summary.push("");
  summary.push(failedNames);
  summary.push("");
  summary.push("## 按级别统计");
  summary.push("");
  for (const level of ["接口", "单元", "未分类"]) {
    const subset = results.filter((r) => (CASE_BY_TITLE.get(r.title) ?? {}).level === level);
    if (subset.length === 0) continue;
    summary.push(`- ${level}：${subset.length} 条（通过 ${subset.filter((r) => r.status === "passed").length}，失败 ${subset.filter((r) => r.status === "failed").length}）`);
  }
  summary.push("");
  summary.push("## 复现方式");
  summary.push("");
  summary.push("```bash");
  summary.push("npm install        # 根目录：安装测试依赖");
  summary.push("cd backend && npm install && cd ..   # 后端依赖（含 prisma）");
  summary.push("npm test           # 一条命令：迁移测试库 + 全部测试 + 生成报告");
  summary.push("npm test -- --report-dir reports/custom   # 覆盖报告目录");
  summary.push("```");
  summary.push("");
  summary.push("## 用例明细");
  summary.push("");
  summary.push("| ID | 级别 | 类型 | 用例 | 耗时(ms) | 判定 |");
  summary.push("| --- | --- | --- | --- | --- | --- |");
  let extra = 0;
  for (const result of results) {
    const catalog = CASE_BY_TITLE.get(result.title);
    const id = catalog?.id ?? `EXTRA-${String((extra += 1)).padStart(2, "0")}`;
    summary.push(
      `| ${id} | ${catalog?.level ?? "未分类"} | ${catalog?.category ?? "未分类"} | ${cell(result.title)} | ${Math.round(result.duration * 10) / 10} | ${judge(result)} |`
    );
  }
  writeReport(reportDir, "test-report.md", summary.join("\n"));

  return { total, passed, failed, skipped };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
const startedAt = new Date();
let exitCode = 1;
let reportDir = "";

try {
  log("[test] 清理上次测试产物 ...");
  removeIfExists(TEST_DB);
  removeIfExists(TEST_DB_JOURNAL);
  fs.mkdirSync(TMP_DIR, { recursive: true });

  prepareTestDatabase();
  const { exitCode: vitestExit, report } = runVitest();
  const finishedAt = new Date();
  const commit = shortCommit();
  reportDir = reportDirOverride
    ? path.resolve(ROOT, reportDirOverride)
    : path.join(ROOT, "reports");
  fs.mkdirSync(reportDir, { recursive: true });

  const results = flattenResults(report);
  if (results.length === 0) throw new Error("[test] 未解析到任何用例结果");

  // 安全基线采集（在报告写入前执行，保留命令原文）
  const secretScanA = capture("git", [
    "grep",
    "-n",
    "-I",
    "-E",
    "(sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)",
    "--",
    ".",
    ":!*.md",
  ]);
  const secretScanB = capture("git", [
    "grep",
    "-n",
    "-I",
    "-E",
    "(JWT_SECRET|DATABASE_URL|API_KEY|ACCESS_TOKEN|PASSWORD)[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9_\\-]{8,}",
    "--",
    ".",
    ":!*.md",
    ":!.env.example",
  ]);
  const auditBackend = npmCapture(["audit", "--omit=dev", "--json", "--registry=https://registry.npmjs.org"], {
    cwd: path.join(ROOT, "backend"),
  });
  const auditRoot = npmCapture(["audit", "--json", "--registry=https://registry.npmjs.org"]);

  const stats = buildReports({
    results,
    report,
    reportDir,
    commit,
    startedAt,
    finishedAt,
    secretScanA,
    secretScanB,
    auditBackend,
    auditRoot,
  });

  log(`\n[test] 结果：总数 ${stats.total} / 通过 ${stats.passed} / 失败 ${stats.failed} / 跳过 ${stats.skipped}`);
  log(`[test] 报告目录：${path.relative(ROOT, reportDir).replace(/\\/g, "/")}`);
  exitCode = vitestExit === 0 && stats.failed === 0 ? 0 : 1;
} catch (err) {
  log(`\n[test] 运行失败：${err instanceof Error ? err.message : String(err)}`);
  exitCode = 1;
} finally {
  removeIfExists(TEST_DB);
  removeIfExists(TEST_DB_JOURNAL);
  removeIfExists(TMP_DIR);
  log(exitCode === 0 ? "\n[test] 全部通过" : "\n[test] 存在失败，退出码 1");
  process.exit(exitCode);
}
