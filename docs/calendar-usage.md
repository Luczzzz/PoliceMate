# 后端日历功能 - 使用指南

## 快速开始

### 1. 启用日历功能

在 `.env` 中设置：

```bash
PM_CALENDAR_ENABLED=on
```

### 2. 认证流程

首先，获取用户身份和令牌：

```bash
POST /api/v1/auth/claim-identity
Content-Type: application/json

{
  "username": "张三"
}

# 响应
{
  "userId": "a1b2c3d4e5f6g7h8",
  "token": "aGVsbG8gd29ybGQgdGhpcyBpcyBhIHRlc3Q="
}
```

保存 `token` 到客户端 localStorage。之后所有日历请求都需要在请求头中带上这个令牌：

```bash
x-pm-anonymous-token: aGVsbG8gd29ybGQgdGhpcyBpcyBhIHRlc3Q=
```

### 3. 创建案件期限

```bash
POST /api/v1/cases/case_001/deadlines
Content-Type: application/json
x-pm-anonymous-token: <token>

{
  "caseStartDate": "2024-10-15",
  "category": "administrative"
}

# 响应示例
{
  "caseId": "case_001",
  "userId": "a1b2c3d4e5f6g7h8",
  "caseStartDate": "2024-10-15",
  "category": "administrative",
  "stages": [
    {
      "ruleId": "admin-investigation-30d",
      "stageName": "立案后决定",
      "dueDate": "2024-11-14",
      "extended": false
    },
    {
      "ruleId": "admin-transfer-7d",
      "stageName": "移送期限",
      "dueDate": "2024-10-22",
      "extended": false
    }
  ],
  "createdAt": "2024-10-15T10:30:00Z",
  "updatedAt": "2024-10-15T10:30:00Z"
}
```

### 4. 设置自己的排班

```bash
POST /api/v1/my/schedule
Content-Type: application/json
x-pm-anonymous-token: <token>

{
  "date": "2024-10-16",
  "type": "full_day",
  "note": "正常值班"
}

# 或者设置特定时段值班
{
  "date": "2024-10-16",
  "type": "custom",
  "timeRange": "09:00-12:00",
  "note": "上午值班"
}
```

### 5. 查询日历

#### 期限日历

```bash
GET /api/v1/calendar?month=2024-10&view=deadlines
x-pm-anonymous-token: <token>

# 响应
{
  "view": "deadlines",
  "month": "2024-10",
  "items": [
    {
      "date": "2024-10-22",
      "type": "deadline",
      "caseId": "case_001",
      "stageName": "移送期限",
      "daysRemaining": 7,
      "urgency": "warning"
    },
    {
      "date": "2024-11-14",
      "type": "deadline",
      "caseId": "case_001",
      "stageName": "立案后决定",
      "daysRemaining": 31,
      "urgency": "normal"
    }
  ]
}
```

#### 排班日历

```bash
GET /api/v1/calendar?month=2024-10&view=schedules
x-pm-anonymous-token: <token>

# 响应
{
  "view": "schedules",
  "month": "2024-10",
  "items": [
    {
      "date": "2024-10-16",
      "type": "schedule",
      "scheduleType": "full_day",
      "note": "正常值班"
    }
  ]
}
```

---

## API 完整参考

### 认证

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/v1/auth/claim-identity` | 申领用户身份和令牌 |

### 案件期限

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/v1/cases/:caseId/deadlines` | 创建案件期限（自动计算各阶段） |
| GET | `/api/v1/cases/:caseId/deadlines` | 查询某案件的所有期限 |
| GET | `/api/v1/my/deadlines?month=YYYY-MM` | 查询我负责的案件在某月的期限 |

### 排班管理

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/v1/my/schedule` | 新增或更新排班 |
| DELETE | `/api/v1/my/schedule/:date` | 删除某天的排班 |
| GET | `/api/v1/my/schedule?month=YYYY-MM` | 查询我在某月的排班 |

### 日历查询

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/v1/calendar?month=YYYY-MM&view=deadlines\|schedules` | 统一日历查询 |

---

## 期限紧急程度

- **normal**: 还剩 > 7 天（绿色）
- **warning**: 还剩 3-7 天（黄色）
- **urgent**: 还剩 1-3 天（红色）
- **overdue**: 已过期 <= 0 天（深红色）

---

## 数据存储

所有数据存储为 JSON 文件，位置为：

```
<PM_CALENDAR_DATA_DIR>/
├── case-deadlines/
│   ├── case_001.json
│   └── ...
└── user-schedules/
    ├── a1b2c3d4e5f6g7h8.json
    └── ...
```

每个用户只能访问自己的排班和自己负责的案件期限。

---

## 环境变量配置

```bash
# 启用日历功能（默认 false）
PM_CALENDAR_ENABLED=on

# 数据目录（默认 ./data/calendar）
PM_CALENDAR_DATA_DIR=/var/policymate/calendar

# 期限规则文件路径（默认 ./src/content/deadline-rules.json）
PM_DEADLINE_RULES_PATH=/etc/policymate/deadline-rules.json
```

---

## 期限规则

期限规则由内容维护者在 `src/content/deadline-rules.json` 中维护。

每条规则包含：
- `id`: 规则唯一标识
- `category`: 案件类别（administrative 或 criminal）
- `stageName`: 阶段名称
- `daysFromStart`: 从立案起算的天数
- `extendable`: 是否可延期
- `maxExtensionDays`: 最大延期天数
- `legalBasis`: 法律依据
- `status`: 内容状态（trial 为生效）

当前内置规则包括：
- 行政案件：立案后决定（30天）、移送期限（7天）
- 刑事案件：侦查期限（30天，可延期30天）

---

## 开发说明

### 后端架构

所有代码都在 `apps/server/src/` 目录：

- `auth/`: 用户身份系统
- `calendar/`: 日历功能核心模块
  - `types.ts`: 类型定义
  - `deadline-rules.ts`: 期限规则管理
  - `case-deadlines.ts`: 案件期限管理
  - `user-schedules.ts`: 用户排班管理
  - `engine.ts`: 日历查询引擎
  - `routes.ts`: API 路由

### 数据库设计

当前使用文件系统存储（JSON 文件）。未来升级到数据库时，抽象出 `Store` 接口即可平滑迁移。

### 测试

所有新功能都有单元测试覆盖，位置：`apps/server/test/calendar.test.ts`

运行测试：

```bash
npm run test -- calendar.test
```
