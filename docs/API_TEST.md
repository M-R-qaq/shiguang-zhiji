# API 接口测试文档

## 目录
- [认证接口](#认证接口)
- [语音接口](#语音接口)
- [对话接口](#对话接口)
- [记忆接口](#记忆接口)
- [唤醒词接口](#唤醒词接口)

---

## 认证接口

### 1. 用户注册

**接口地址**: `POST /auth/register`

**请求体**:
```json
{
  "username": "testuser",
  "password": "password123",
  "email": "test@example.com",
  "nickname": "测试用户"
}
```

**成功响应 (201)**:
```json
{
  "id": 1,
  "username": "testuser",
  "email": "test@example.com",
  "nickname": "测试用户"
}
```

**curl 测试命令**:
```bash
curl -X POST "http://localhost:8000/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123","email":"test@example.com","nickname":"测试用户"}'
```

---

### 2. 用户登录

**接口地址**: `POST /auth/login`

**请求体**:
```json
{
  "username": "testuser",
  "password": "password123"
}
```

**成功响应 (200)**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

**curl 测试命令**:
```bash
curl -X POST "http://localhost:8000/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}'
```

---

### 3. 获取当前用户信息

**接口地址**: `GET /auth/me`

**请求头**:
```
Authorization: Bearer <access_token>
```

**成功响应 (200)**:
```json
{
  "id": 1,
  "username": "testuser",
  "email": "test@example.com",
  "nickname": "测试用户"
}
```

**curl 测试命令**:
```bash
curl -X GET "http://localhost:8000/auth/me" \
  -H "Authorization: Bearer <access_token>"
```

---

### 4. 更新用户信息

**接口地址**: `PUT /auth/me`

**请求头**:
```
Authorization: Bearer <access_token>
```

**请求体**:
```json
{
  "nickname": "新昵称",
  "email": "newemail@example.com"
}
```

**curl 测试命令**:
```bash
curl -X PUT "http://localhost:8000/auth/me" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access_token>" \
  -d '{"nickname":"新昵称"}'
```

---

### 5. 用户登出

**接口地址**: `POST /auth/logout`

**请求头**:
```
Authorization: Bearer <access_token>
```

**成功响应 (200)**:
```json
{
  "message": "登出成功",
  "success": true
}
```

**curl 测试命令**:
```bash
curl -X POST "http://localhost:8000/auth/logout" \
  -H "Authorization: Bearer <access_token>"
```

---

### 6. 注销账户

**接口地址**: `DELETE /auth/me`

**请求头**:
```
Authorization: Bearer <access_token>
```

**成功响应 (200)**:
```json
{
  "message": "账户已注销",
  "success": true
}
```

**注意**: 此操作为软删除，用户标记为非活跃状态

---

## 语音接口

### 1. 语音识别 (ASR)

**接口地址**: `POST /asr/transcribe`

**请求头**:
```
Authorization: Bearer <access_token>
Content-Type: multipart/form-data
```

**请求体**: FormData 格式
- `file`: 音频文件 (wav, mp3 等)

**成功响应 (200)**:
```json
{
  "text": "识别出的文本内容",
  "language": "zh",
  "duration": 3.5
}
```

**curl 测试命令**:
```bash
curl -X POST "http://localhost:8000/asr/transcribe" \
  -H "Authorization: Bearer <access_token>" \
  -F "file=@audio.wav"
```

---

### 2. 语音合成 (TTS)

**接口地址**: `POST /tts/synthesize`

**请求头**:
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**请求体**:
```json
{
  "text": "要合成的文本内容"
}
```

**成功响应 (200)**:
```json
{
  "audio": "base64编码的音频数据",
  "format": "mp3",
  "duration": 2.5
}
```

**curl 测试命令**:
```bash
curl -X POST "http://localhost:8000/tts/synthesize" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access_token>" \
  -d '{"text":"你好，很高兴认识你"}'
```

---

## 对话接口

### 1. 发送对话

**接口地址**: `POST /llm/chat`

**请求头**:
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**请求体**:
```json
{
  "message": "用户的问题",
  "history": [
    {"role": "user", "content": "历史消息1"
  ]
}
```

**成功响应 (200)**:
```json
{
  "response": "AI的回复",
  "should_exit": false,
  "memories_extracted": 2
}
```

**curl 测试命令**:
```bash
curl -X POST "http://localhost:8000/llm/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access_token>" \
  -d '{"message":"你好","history":[]}'
```

**说明**:
- 对话时会自动提取记忆
- 相关记忆会自动注入上下文

---

### 2. 流式对话

**接口地址**: `POST /llm/chat/stream`

**说明**: 返回 SSE 流式响应，逐字返回AI回复

---

## 记忆接口

### 1. 添加记忆

**接口地址**: `POST /memory`

**请求头**:
```
Authorization: Bearer <access_token>
```

**请求体**:
```json
{
  "content": "记忆内容",
  "category": "personal_info",
  "importance": 3
}
```

**分类可选值**:
- `personal_info`: 个人信息
- `health`: 健康信息
- `emotion`: 情绪状态
- `event`: 重要事件
- `preference`: 偏好信息
- `relationship`: 人际关系
- `work_study`: 工作学习
- `general`: 其他

**重要性范围**: 1-5 (1=不重要, 5=非常重要)

---

### 2. 获取记忆列表

**接口地址**: `GET /memory`

**查询参数**:
- `category`: 可选，按分类筛选
- `limit`: 可选，限制返回数量

**curl 测试命令**:
```bash
curl -X GET "http://localhost:8000/memory?category=health&limit=20" \
  -H "Authorization: Bearer <access_token>"
```

---

### 3. 语义搜索记忆

**接口地址**: `POST /memory/search`

**请求体**:
```json
{
  "query": "搜索关键词",
  "n_results": 5,
  "category": "health"
}
```

**说明**: 基于向量相似度搜索相关记忆

---

### 4. 删除记忆

**接口地址**: `DELETE /memory/{memory_id}`

**curl 测试命令**:
```bash
curl -X DELETE "http://localhost:8000/memory/1" \
  -H "Authorization: Bearer <access_token>"
```

---

### 5. 从对话提取记忆

**接口地址**: `POST /memory/extract`

**查询参数**:
- `user_message`: 用户消息
- `assistant_message`: AI回复

**说明**: 手动触发从对话中提取重要记忆

---

### 6. 检查是否需要关怀

**接口地址**: `POST /memory/care/check`

**成功响应 (200)**:
```json
{
  "should_care": true,
  "care_type": "health",
  "care_topic": "用户提到身体不适",
  "care_suggestion": "建议关心用户的健康状况"
}
```

---

## 唤醒词接口

### 1. 唤醒词检测

**接口地址**: `POST /wakeword/detect`

**请求体**:
```json
{
  "audio_base64": "base64编码的音频",
  "sample_rate": 16000
}
```

**成功响应 (200)**:
```json
{
  "detected": true,
  "confidence": 0.95,
  "wake_word": "苏怀真"
}
```

---

### 2. 获取唤醒词配置

**接口地址**: `GET /wakeword/config`

**成功响应 (200)**:
```json
{
  "wake_words": ["你好", "你好苏怀真", "苏怀真", "怀真", "东坡先生", "在吗"],
  "sample_rate": 16000,
  "channels": 1,
  "sample_width": 2,
  "detection_threshold": 0.5,
  "recommended_frame_duration": 20
}
```

---

## 测试流程

### 完整登录流程测试

1. **注册新用户
   ```bash
   curl -X POST "http://localhost:8000/auth/register" \
     -H "Content-Type: application/json" \
     -d '{"username":"test001","password":"test123456","nickname":"测试用户001"}'
   ```

2. **登录获取 Token**
   ```bash
   curl -X POST "http://localhost:8000/auth/login" \
     -H "Content-Type: application/json" \
     -d '{"username":"test001","password":"test123456"}'
   ```

3. **获取用户信息**
   ```bash
   TOKEN="your_token_here"
   curl -X GET "http://localhost:8000/auth/me" -H "Authorization: Bearer $TOKEN"
   ```

4. **更新用户昵称**
   ```bash
   curl -X PUT "http://localhost:8000/auth/me" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"nickname":"新昵称"}'
   ```

5. **添加一条记忆**
   ```bash
   curl -X POST "http://localhost:8000/memory" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"content":"用户喜欢吃川菜","category":"preference","importance":3}'
   ```

6. **搜索记忆**
   ```bash
   curl -X POST "http://localhost:8000/memory/search" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"query":"饮食偏好","n_results":5}'
   ```

7. **进行一次对话 (自动提取记忆)**
   ```bash
   curl -X POST "http://localhost:8000/llm/chat" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"message":"我最近胃不太舒服","history":[]}'
   ```

8. **检查关怀建议**
   ```bash
   curl -X POST "http://localhost:8000/memory/care/check" \
     -H "Authorization: Bearer $TOKEN"
   ```

9. **登出**
   ```bash
   curl -X POST "http://localhost:8000/auth/logout" -H "Authorization: Bearer $TOKEN"
   ```

---

## 常见错误码

| HTTP 状态码 | 说明 |
|-----------|------|
| 400 | 请求参数错误 |
| 401 | 未授权 / Token 无效或已过期 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |
