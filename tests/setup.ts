// 测试环境变量在导入任何后端模块之前生效
process.env.NODE_ENV = "test";
// Prisma 相对 schema.prisma 所在目录解析：backend/prisma/test.db
process.env.DATABASE_URL = "file:./test.db";
process.env.JWT_SECRET = "test-secret";
process.env.BACKEND_PORT = "3999";
process.env.FRONTEND_PORT = "5173";
