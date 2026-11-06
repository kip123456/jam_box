import bcrypt from "bcryptjs";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { config } from "../utils/env";

/** bcrypt 成本因子（design 决策：12） */
const BCRYPT_COST = 12;

/** access token 有效期：15 分钟 */
const ACCESS_TOKEN_EXPIRES_IN = "15m";

/** refresh token 有效期：7 天 */
const REFRESH_TOKEN_EXPIRES_IN = "7d";

export type TokenType = "access" | "refresh";

/** JWT payload 仅包含 sub、type、iat、exp（design：极简主义） */
export interface TokenPayload extends JwtPayload {
  sub: string;
  type: TokenType;
}

/** 生成 bcrypt 哈希（cost factor 12） */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

/** 比对明文密码与 bcrypt 哈希 */
export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** 签发 access token（15 分钟） */
export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId, type: "access" }, config.jwtSecret, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });
}

/** 签发 refresh token（7 天） */
export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, type: "refresh" }, config.jwtSecret, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  });
}

/**
 * 校验 JWT 签名与有效期。
 * 过期抛 TokenExpiredError，签名/格式非法抛 JsonWebTokenError，由调用方映射为 401。
 */
export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, config.jwtSecret);

  if (
    typeof decoded === "string" ||
    typeof decoded.sub !== "string" ||
    typeof decoded.type !== "string"
  ) {
    throw new jwt.JsonWebTokenError("invalid token payload");
  }

  return decoded as TokenPayload;
}
