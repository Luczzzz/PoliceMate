# 日历功能快速启动指南

完整的前后端日历功能已实现。本指南帮你快速启动和测试。

## 启动步骤

### 1. 启用后端日历模块

编辑 `.env` 文件，添加：

```bash
PM_CALENDAR_ENABLED=on
```

### 2. 启动后端服务

```bash
cd apps/server
npm run dev
```

预期输出：
```
[policymate-server] Calendar module enabled
[policymate-server] listening on http://127.0.0.1:8787 (provider=fixture, static=...)
```

### 3. 启动前端开发服务

在新终端中：

```bash
cd apps/web
npm run dev
```

预期输出：
```
  VITE v... ready in ... ms

  ➜  Local:   http://localhost:5173/
  ➜  press h to show help
```

### 4. 打开浏览器

访问：`http://localhost:5173`

---

## 测试流程

### 第一步：登录

1. 首页看到"日历"入口卡片
2. 点击"日历"卡片
3. 自动跳转到 `/login` 页面
4. 输入用户名（如"张三"或"police_001"）
5. 点击"登录"按钮

✓ 成功：跳转到 `/calendar` 页面，显示当前月份的日历

### 第二步：查看期限日历

1. 页面顶部有两个按钮："办案期限"（蓝色）和"值班日历"
2. 确保"办案期限"处于选中状态（蓝色）
3. 日历显示当月各日期，可能为空（如果还没有添加期限数据）

### 第三步：切换到排班日历

1. 点击"值班日历"按钮
2. 页面重新加载，显示排班数据
3. 如果你之前设置过排班，会显示在日历上（蓝色标记）

### 第四步：月份导航

1. 点击"上个月"按钮
   - 日历显示上一个月的日期和数据
2. 点击"下个月"按钮
   - 日历显示下一个月的日期和数据

### 第五步：添加测试数据（使用API）

为了看到日历上有数据，可以通过curl命令添加测试数据：

#### 创建案件期限

```bash
# 1. 首先登录获得token
TOKEN_RESPONSE=$(curl -X POST http://localhost:8787/api/v1/auth/claim-identity \
  -H "Content-Type: application/json" \
  -d '{"username":"张三"}')

TOKEN=$(echo $TOKEN_RESPONSE | jq -r '.token')
USER_ID=$(echo $TOKEN_RESPONSE | jq -r '.userId')

echo "Token: $TOKEN"
echo "User ID: $USER_ID"

# 2. 创建案件期限
curl -X POST http://localhost:8787/api/v1/cases/case_001/deadlines \
  -H "Content-Type: application/json" \
  -H "x-pm-anonymous-token: $TOKEN" \
  -d '{
    "caseStartDate": "2024-10-15",
    "category": "administrative"
  }'

# 3. 创建另一个案件
curl -X POST http://localhost:8787/api/v1/cases/case_002/deadlines \
  -H "Content-Type: application/json" \
  -H "x-pm-anonymous-token: $TOKEN" \
  -d '{
    "caseStartDate": "2024-10-20",
    "category": "criminal"
  }'
```

#### 设置排班

```bash
# 设置今天的排班
curl -X POST http://localhost:8787/api/v1/my/schedule \
  -H "Content-Type: application/json" \
  -H "x-pm-anonymous-token: $TOKEN" \
  -d '{
    "date": "2024-10-16",
    "type": "full_day",
    "note": "正常值班"
  }'

# 设置明天的排班（自定义时段）
curl -X POST http://localhost:8787/api/v1/my/schedule \
  -H "Content-Type: application/json" \
  -H "x-pm-anonymous-token: $TOKEN" \
  -d '{
    "date": "2024-10-17",
    "type": "custom",
    "timeRange": "09:00-12:00",
    "note": "上午在所里"
  }'
```

然后刷新浏览器，你应该能在日历上看到：
- 期限日历：case_001 和 case_002 的各阶段期限，用颜色标记紧急程度
- 排班日历：10月16日和17日的排班信息

### 第六步：测试刷新保持登录

1. 在任何一个页面按 `F5` 刷新
2. 页面应该保持登录状态，不会跳转到登录页
3. 日历数据应该被保留

### 第七步：退出登录

1. 页面右上角有"退出"按钮
2. 点击"退出"
3. 应该跳转到登录页
4. 刷新页面，确认需要重新登录

---

## 关键URL

| 页面 | URL |
|------|-----|
| 首页 | http://localhost:5173 |
| 登录 | http://localhost:5173/login |
| 日历 | http://localhost:5173/calendar |
| 案情分析 | http://localhost:5173/analysis |
| 文书范例 | http://localhost:5173/documents |
| 交通事故 | http://localhost:5173/accident-liability |

---

## API端点速查

### 认证

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/v1/auth/claim-identity` | 申领用户身份和令牌 |

### 案件期限

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/v1/cases/:caseId/deadlines` | 创建案件期限 |
| GET | `/api/v1/cases/:caseId/deadlines` | 查询案件期限 |
| GET | `/api/v1/my/deadlines?month=YYYY-MM` | 查询我的期限 |

### 排班

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/v1/my/schedule` | 新增/更新排班 |
| DELETE | `/api/v1/my/schedule/:date` | 删除排班 |
| GET | `/api/v1/my/schedule?month=YYYY-MM` | 查询排班 |

### 日历

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/v1/calendar?month=YYYY-MM&view=deadlines\|schedules` | 统一日历查询 |

---

## 故障排除

### 问题1：后端启动失败

**错误信息**：`Failed to initialize calendar module`

**解决**：
- 检查 `PM_CALENDAR_ENABLED=on` 是否正确设置
- 检查 `src/content/deadline-rules.json` 是否存在
- 查看错误日志了解具体原因

### 问题2：登录失败

**错误信息**：`HTTP 401` 或 `Unauthorized`

**解决**：
- 确保后端正在运行
- 检查用户名格式（2-50字符，支持中文/字母/数字/下划线/中划线）
- 清除浏览器localStorage：按F12 → Application → Local Storage → 删除pm开头的条目

### 问题3：日历为空

**原因**：没有添加测试数据

**解决**：
- 使用上面提供的curl命令添加测试数据
- 或在前端实现"新增"功能后通过UI添加

### 问题4：跨域错误 (CORS)

**错误信息**：`Access to XMLHttpRequest ... blocked by CORS policy`

**解决**：
- 确保前端和后端运行在正确的端口
- 默认：前端 localhost:5173，后端 127.0.0.1:8787
- 检查后端 `config.ts` 中的 `allowedOrigins` 配置

---

## 开发笔记

### 文件结构速查

```
后端
├── src/auth/                 用户身份系统
│   ├── simple-identity.ts   认证服务
│   ├── types.ts            认证类型
│   └── routes.ts           认证路由
├── src/calendar/           日历功能
│   ├── engine.ts           查询引擎
│   ├── deadline-rules.ts   规则管理
│   ├── case-deadlines.ts   期限管理
│   ├── user-schedules.ts   排班管理
│   ├── routes.ts           日历路由
│   └── types.ts            日历类型
└── src/content/
    └── deadline-rules.json 期限规则

前端
├── src/app/AuthContext.tsx      认证上下文
├── src/api/calendar.ts          API客户端
├── src/pages/
│   ├── LoginPage.tsx            登录页面
│   ├── CalendarPage.tsx         日历页面
│   └── HomePage.tsx             首页（已更新）
└── src/components/
    └── Icon.tsx                 图标（已更新）
```

### 修改期限规则

编辑 `apps/server/src/content/deadline-rules.json`，添加新规则：

```json
{
  "id": "my-custom-rule",
  "category": "administrative",
  "stageName": "新阶段",
  "daysFromStart": 15,
  "extendable": true,
  "maxExtensionDays": 15,
  "legalBasis": "《法律》第X条",
  "status": "trial",
  "contentVersion": 1
}
```

重启后端生效。

---

## 下一步

### 短期任务（1-2周）

- [ ] 前端添加"新增案件期限"表单
- [ ] 前端添加"新增排班"表单  
- [ ] 标记期限已完成功能
- [ ] 期限延期申请功能

### 中期任务（2-4周）

- [ ] 期限快到时的桌面通知
- [ ] 首页显示未读提醒数量
- [ ] 同事排班可见性配置
- [ ] 报表统计（按人员、按时间段）

### 长期任务（1个月+）

- [ ] 迁移到关系数据库（PostgreSQL）
- [ ] 权限管理（管理员角色）
- [ ] 完整的事件编辑页面
- [ ] 日历导出为ICS文件

---

## 联系支持

遇到问题？查看：
- `docs/calendar-usage.md` - 完整的后端API参考
- `docs/calendar-frontend-implementation.md` - 前端实现细节
- 代码注释 - 每个文件都有详细注释

---

**现在就可以开始测试了！祝你使用愉快！** 🎉
