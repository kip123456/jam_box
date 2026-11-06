# 安全基线（security-baseline）

## 1. 硬编码密钥扫描

```bash
git grep -n -I -E (sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----) -- . :!*.md
```

输出原文：

```text
(无匹配)
exit code: 1
```

```bash
git grep -n -I -E (JWT_SECRET|DATABASE_URL|API_KEY|ACCESS_TOKEN|PASSWORD)[[:space:]]*[:=][[:space:]]*['"][A-Za-z0-9_\-]{8,} -- . :!*.md :!.env.example
```

输出原文：

```text
tests/setup.ts:5:process.env.JWT_SECRET = "test-secret";
exit code: 0
```

判读：.env 未纳入版本控制（.gitignore 已排除），.env.example 仅保留占位模板；扫描范围内未发现可直接使用的真实密钥。

## 2. 依赖审计（backend，生产依赖）

```bash
npm audit --omit=dev --json --registry=https://registry.npmjs.org
```

输出原文：

```text
{
  "auditReportVersion": 2,
  "vulnerabilities": {
    "@prisma/config": {
      "name": "@prisma/config",
      "severity": "high",
      "isDirect": false,
      "via": [
        "deepmerge-ts"
      ],
      "effects": [
        "prisma"
      ],
      "range": "6.13.0-dev.1 - 7.10.0 || 8.1.0-dev.1 - 8.1.0-dev.4",
      "nodes": [
        "node_modules/@prisma/config"
      ],
      "fixAvailable": {
        "name": "prisma",
        "version": "7.10.1",
        "isSemVerMajor": true
      }
    },
    "deepmerge-ts": {
      "name": "deepmerge-ts",
      "severity": "high",
      "isDirect": false,
      "via": [
        {
          "source": 1145093,
          "name": "deepmerge-ts",
          "dependency": "deepmerge-ts",
          "title": "DeepmergeTS has stack exhaustion when merging recursive object graphs",
          "url": "https://github.com/advisories/GHSA-ggr8-5vv4-36mx",
          "severity": "high",
          "cwe": [
            "CWE-674"
          ],
          "cvss": {
            "score": 0,
            "vectorString": null
          },
          "range": "<8.0.0"
        }
      ],
      "effects": [
        "@prisma/config"
      ],
      "range": "<8.0.0",
      "nodes": [
        "node_modules/deepmerge-ts"
      ],
      "fixAvailable": {
        "name": "prisma",
        "version": "7.10.1",
        "isSemVerMajor": true
      }
    },
    "prisma": {
      "name": "prisma",
      "severity": "high",
      "isDirect": true,
      "via": [
        "@prisma/config"
      ],
      "effects": [],
      "range": "6.13.0-dev.1 - 7.10.0 || 8.0.0-rc.3 - 8.1.0-dev.4",
      "nodes": [
        "node_modules/prisma"
      ],
      "fixAvailable": {
        "name": "prisma",
        "version": "7.10.1",
        "isSemVerMajor": true
      }
    }
  },
  "metadata": {
    "vulnerabilities": {
      "info": 0,
      "low": 0,
      "moderate": 0,
      "high": 3,
      "critical": 0,
      "total": 3
    },
    "dependencies": {
      "prod": 186,
      "dev": 74,
      "optional": 1,
      "peer": 0,
      "peerOptional": 0,
      "total": 259
    }
  }
}
exit code: 1
```

## 3. 依赖审计（根级测试依赖）

```bash
npm audit --json --registry=https://registry.npmjs.org
```

输出原文：

```text
{
  "auditReportVersion": 2,
  "vulnerabilities": {},
  "metadata": {
    "vulnerabilities": {
      "info": 0,
      "low": 0,
      "moderate": 0,
      "high": 0,
      "critical": 0,
      "total": 0
    },
    "dependencies": {
      "prod": 1,
      "dev": 174,
      "optional": 27,
      "peer": 0,
      "peerOptional": 0,
      "total": 174
    }
  }
}
exit code: 0
```

## 4. 审计结论

- backend 生产依赖：info 0 / low 0 / moderate 0 / high 3 / critical 0（共 3）
- 根级测试依赖：info 0 / low 0 / moderate 0 / high 0 / critical 0（共 0）
- 处置说明：prisma 6.x 依赖链中的 deepmerge-ts 高危（GHSA-ggr8-5vv4-36mx）修复需升级到 prisma 7 major，而当前 SQLite datasource 写法与 prisma 7 不兼容，先记录为已知风险，后续单独升级验证，不阻塞本次测试补课。
