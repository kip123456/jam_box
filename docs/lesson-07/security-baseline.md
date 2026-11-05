# Security Baseline — lesson-07

> 提交：aad32ed  ·  日期：2026-11-05

## 密钥扫描

### 命令原文

```bash
# 全历史扫描常见密钥模式
git log --all -p | grep -iE 'sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}|AKIA[A-Z0-9]{16}|AIza[0-9A-Za-z\-_]{35}|xox[baprs]-[a-zA-Z0-9-]{10,}|-----BEGIN'

# .env 相关文件全历史
git log --all -p -- .env .env.local .env.production

# 源代码中硬编码 secret
git log --all -p -S 'api_key\|secret\|private_key\|access_key' -- '*.ts' '*.js' '*.json'
```

### 输出原文

上述三条命令均无匹配行返回。扫描范围覆盖 4 个有效提交（b655129 → aad32ed），未检出任何密钥明文。

## 依赖审计

### 命令原文

```bash
cd backend && npm audit --json 2>&1
```

### 输出原文

```json
{
  "auditReportVersion": 2,
  "vulnerabilities": {},
  "metadata": {
    "total": 0,
    "critical": 0,
    "high": 0,
    "moderate": 0,
    "low": 0,
    "informational": 0
  }
}
```

## 基线结论

- ✅ 无密钥明文泄露
- ✅ 依赖无已知漏洞
- ✅ `.env.example` 变量齐全且值为占位