# ===== 构建阶段 =====
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate
COPY . .
RUN npm run build

# ===== 运行阶段 =====
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# 仅安装生产依赖（prisma CLI 属于运行时迁移所需，已放入 dependencies）
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

COPY --from=builder /app/dist ./dist

RUN chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# 启动前对持久化卷执行迁移，再启动服务（服务启动时会 fork worker）
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
