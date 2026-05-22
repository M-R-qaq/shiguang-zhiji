# Changelog

## v0.7.0 - 2026-05-22

### ✨ 新增功能

#### 🔍 搜索后端统一为 Tavily
- 移除 B站 API 搜索（BilibiliSearcher），所有搜索统一使用 Tavily API
- 新增 `WebSearcher.search_content()` 方法，用于食光鉴内容推荐搜索
- 新增 `convert_tavily_to_video_results()` 转换函数，将 Tavily 结果转换为 VideoResult 格式
- 前端展示完全不变：食光鉴推荐仍弹出视频卡片弹窗，联网搜索仍为徽章

#### 🎨 前端 UI 优化
- 新增 `FeatureTip` 组件（功能提示气泡/横幅）
- 新增 `OnboardingOverlay` 组件（新手引导遮罩）
- 新增 `welcomeMessage.ts` 工具模块

### 🔄 重要变更
- 版本号从 v0.6.0 升级到 v0.7.0
- 移除配置项：`BILIBILI_SEARCH_ENABLED`、`BILIBILI_SEARCH_CACHE_TTL`、`SEARCH_HTTP_PROXY`
- 新增配置项：`WEB_SEARCH_CONTENT_MAX_RESULTS`（默认 3）
- `/search` API 后端从 B站 API 切换为 Tavily，返回格式不变

## v0.6.0 - 2026-05-16

### ✨ 新增功能

#### 🎙️ 唤醒词本地检测（前台）
- 集成 `sherpa-onnx` 开源离线唤醒词引擎（Android 前台检测）
- 新增 `wakeWordService.ts` 唤醒词服务模块
- 前台持续监听，App 切后台自动暂停，回前台恢复
- 进入 listening/speaking 状态暂停检测，回到 idle 恢复
- 误唤醒抑制（3-5s 冷却时间、置信度阈值可配置）
- 设置页面新增"语音唤醒开关"和测试按钮
- HomeScreen 唤醒词检测状态指示器（绿色脉冲）

#### 🔮 食光鉴独立弹窗
- 新增 `ShiguangjianModal.tsx` 弹窗组件（Bottom Sheet 风格，古铜色主题）
- TTS 全部播放完毕后自动弹出搜索结果
- 5 秒无操作自动关闭，用户交互重置倒计时
- 手动关闭按钮 + 点击遮罩关闭
- `recommend` 消息类型保留向后兼容，v0.6 默认弹窗模式
- 弹窗弹出/关闭动画（底部滑入/滑出）

#### 🗣️ Speaking 视频口型同步
- 新增 `lipSyncService.ts` 口型同步模块
- 实时音频 RMS 能量分析驱动口型开合
- 3-5 个口型级别映射（闭口/微张/半开/全开）
- 流式逐句 TTS 口型衔接过渡

#### 📜 会话历史浏览界面
- 新增 `SessionListScreen.tsx` 会话列表页面
- 新增 `SessionDetailScreen.tsx` 会话详情页面
- 后端新增 `DELETE /llm/sessions/{session_id}` 端点
- 下拉刷新 + 上拉加载更多（分页）
- 左滑删除会话 + "继续对话"功能

#### ⚡ 全链路性能优化
- HomeScreen 消息列表 `FlatList` 替代 `ScrollView`
- 视频预加载策略 + 缓存管理
- 消息气泡组件 `React.memo` 优化
- 后端数据库查询索引优化

#### 🛠️ 工程质量提升
- 新增后端单元测试框架（pytest + pytest-asyncio + httpx）
- Token 黑名单自动清理后台任务
- SECRET_KEY 默认值安全警告
- CORS 配置可配置化（`CORS_ORIGINS` 环境变量）

### 🔄 重要变更
- 版本号从 v0.5.0 升级到 v0.6.0
- 目标平台明确为 Android
- 食光鉴搜索结果默认以独立弹窗展示（原内嵌对话气泡模式保留）

### 🎯 API 端点（新增）
| 方法 | 路径 | 说明 |
|------|------|------|
| DELETE | /llm/sessions/{session_id} | 删除指定会话 |

### 🔧 配置项新增
| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `CORS_ORIGINS` | `*` | CORS 允许的来源域名 |

---

## v0.5.0 - 2025-05-15

### ✨ 新增功能

#### 📜 对话历史与会话管理
- **对话持久化**：所有对话存入 SQLite 数据库，支持分页查询
- **会话列表**：`GET /llm/sessions` 返回按时间倒序的会话列表
- **会话详情**：`GET /llm/sessions/{id}` 获取完整会话记录
- **上下文增强**：对话时自动加载最近 10 条历史作为 LLM 上下文
- **清空历史**：`DELETE /llm/history`

#### 🔄 流式对话增强
- **结构化 SSE 事件**：`text_chunk` / `sentence` / `text_done` / `search` / `care` / `done` / `error`
- **逐句 TTS 支持**：`sentence` 事件按标点分割，支持逐句播放
- **食光鉴搜索事件**：流式对话中通过 `search` 事件推送结果

#### 📱 移动端新页面
- **记忆管理界面**（`MemoryScreen.tsx`）：语义搜索、分类筛选、手动添加/删除记忆
- **诊断测试**（`DiagnosticsScreen.tsx`）：6 大类 29 项自动化诊断
- **测试模式**（`TestModeScreen.tsx`）：8 种 ASR 测试用例，CSV 报告导出

#### 🔧 后端改进
- **记忆编辑 API**：`PUT /memory/{id}` 更新记忆内容
- **数据修复**：`created_at` 和 `is_cared` 字段从 SQL 正确查询
- **消息持久化**：前端对话消息通过 AsyncStorage 持久化（最多 200 条）
- **自动后端发现**：启动时扫描局域网 IP 自动连接后端
- **API 指数退避重试**：最多 3 次（1s/2s/4s 延迟）
- **ASR 重试**：识别为空时自动重录（最多 2 次）
- **TTS 降级**：合成失败后跳过语音仅显示文字
- **流式降级**：SSE 失败时降级为非流式对话

---

## v0.4.0 - 2025-05-14

### ✨ 新增功能

#### 🔍 食光鉴搜索系统
- **食光鉴世界观**：苏怀真手中的古铜镜"食光鉴"，连接古今的神奇器物，推荐内容以"食光鉴中映出"方式引入
- **食光鉴搜索 API**：`POST /search`，根据关键词搜索 Bilibili 视频
- **Bilibili 多策略搜索引擎**（`core/search_engine.py`）：
  - 热门搜索：Bilibili 官方搜索 API（按热度排序）
  - 综合搜索：Bilibili WBI 搜索 API（按播放量排序）
  - DuckDuckGo 回退：通过 DuckDuckGo 搜索 `site:bilibili.com/video`
  - 搜索结果缓存（TTL 可配置，默认 5 分钟）
  - 会话初始化（自动获取 buvid3 Cookie）
  - 支持 HTTP 代理配置
- **LLM 对话集成搜索**：
  - 系统提示词增加食光鉴使用指令，LLM 回复末尾以 `【食光鉴|关键词】` 标记推荐
  - `extract_shiguangjian_keyword()` 解析标记，提取搜索关键词
  - 对话接口自动触发搜索，结果附加到 `ChatResponse`
  - 流式对话也支持搜索结果推送

#### 💭 关怀推送融入对话流程
- **设计变更**：关怀消息不再独立推送，自然融入苏怀真的对话回复
  - 对话前调用 `_check_care()` 检测关怀需求
  - 关怀建议注入系统提示词 `{care_section}` 占位符
  - 角色在回复开头用 1-2 句短话表达关心，自然过渡
- **24 小时冷却机制**：查询 `cared_at` 字段，24 小时内不重复关怀
- **后台关怀任务调整**：`care_task()` 仅打印日志，下次对话时由 LLM 接口注入
- **新增 `ChatResponse.care_injected`** 字段，标记回复是否包含关怀

#### 📱 前端食光鉴推荐卡片
- **新增消息类型 `recommend`**：扩展 `Message.role` 支持 `'recommend'`
- **新增 `VideoResult` 类型**：标题、BV号、封面、UP主、时长、播放量、URL
- **新增 `recommendData` 字段**：`Message` 接口新增 `recommendData?: { query: string; results: VideoResult[] }`
- **推荐卡片视觉设计**：
  - 古铜色主题（`rgba(139,105,20,0.3)` 底色，`#cdaa64` 强调色）
  - 卡片顶部标注"食光鉴"品牌标识
  - 视频卡片：标题（2行截断）、UP主/时长/播放量元信息
  - "跳转观看"按钮 → `Linking.openURL()` 打开 Bilibili
- **`careInjected` 字段**：`Message` 接口可选增加 `careInjected?: boolean` 标记

### 🔄 重要变更

#### 📝 角色提示词模块化重构 — "进食陪伴"主题
- 提示词从单一模板重构为 6 段模块化段落，支持动态组合：

| 模块 | 内容 |
|------|------|
| `PROMPT_IDENTITY` | 角色身份 — "跨越千年来到用户餐桌旁的知己" |
| `PROMPT_POSITIONING` | 核心定位 — 进食陪伴者，深谙饮食之道 |
| `PROMPT_PERSONALITY` | 核心性格 — 温暖陪伴、美食达人、乐观豁达、文人风趣 |
| `PROMPT_SHIGUANGJIAN` | 食光鉴设定 — 古铜镜连接古今 |
| `PROMPT_CARE` | 关怀指令 — 1-2 句短话以角色口吻表达关心（动态注入） |
| `PROMPT_CONVERSATION` | 对话风格 — 半文半白、简洁为主、纯文本输出 |

- `build_system_prompt()` 根据场景动态拼接（有关怀时注入 `PROMPT_CARE`，有记忆时注入记忆段落）
- 记忆注入提示改为：*"关于用户的记忆（请在进食陪伴对话中自然运用这些记忆）"*
- 回复纯净度要求：禁止输出动作描述、语气说明、表情符号、括号补充

### 🔧 技术改进

#### 后端
- **新增 `api/search.py`**：食光鉴搜索 API 端点
- **新增 `core/search_engine.py`**：Bilibili 多策略搜索引擎
- **修改 `api/llm.py`**：提示词模块化重构、关怀注入、食光鉴搜索集成、记忆 update/delete 支持
- **修改 `main.py`**：注册搜索路由、关怀任务调整、版本号更新

#### 配置项新增
| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `BILIBILI_SEARCH_ENABLED` | `True` | 食光鉴搜索开关 |
| `BILIBILI_SEARCH_CACHE_TTL` | `300` | 搜索缓存有效期（秒） |
| `SEARCH_HTTP_PROXY` | `""` | 搜索 HTTP 代理 |

#### ChatResponse 新增字段
| 字段 | 类型 | 说明 |
|------|------|------|
| `care_injected` | `bool` | 本次回复是否包含关怀 |
| `search_query` | `Optional[str]` | 食光鉴搜索关键词 |
| `search_results` | `Optional[List[VideoResult]]` | 搜索结果列表 |

#### 移动端
- **更新 `services/api.ts`**：新增 `searchContent()` 方法
- **更新 `store/appStore.ts`**：新增 `VideoResult` 类型、`recommend` 消息类型、`recommendData`/`careInjected` 字段
- **更新 `screens/HomeScreen.tsx`**：食光鉴推荐卡片 UI、视频卡片组件、跳转观看按钮

### 🎯 API 端点（新增）
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /search | 食光鉴搜索（Bilibili 视频） |

---

## v0.3.0 - 2025-xx-xx

### ✨ 新增功能

#### 🗣️ 多 TTS 引擎支持
- **讯飞 WebSocket TTS**（`iflytek_ws`）：WebSocket 实时语音合成、HMAC-SHA256 鉴权、MP3 格式输出
- **MiMo 语音设计 TTS**（`mimo`）：基于 `mimo-v2.5-tts-voicedesign` 模型，通过音色描述定制苏怀真声音、WAV 格式输出
- **TTS 提供商切换**：通过 `TTS_PROVIDER` 配置项切换（`openai` / `iflytek_ws` / `mimo`）

### 🔄 重要变更

#### 🔒 TTS 语音锁定
- 角色语音固定为 `aisjiuxu`（苏怀真），不再允许用户切换
- `TTS_CHARACTER_VOICE = "aisjiuxu"` 全局常量
- `TTS_CONFIG` 仅保留一个语音选项
- `TTSRequest.voice` 默认值设为角色固定语音
- `/tts/voices` 端点仅返回固定语音信息
- 前端无需传递 voice 参数

#### 🧠 记忆系统增强
- **新增分类 `food_preference`**：饮食偏好（喜欢的食物、口味、忌口、饮食习惯等），原有 `preference` 分类排除食物偏好
- **记忆生命周期管理** `cleanup_user_memories()`：
  - 过期清理：情绪/事件/健康类，重要性 ≤2 超过 7 天、重要性 =3 超过 30 天自动过期
  - 容量限制：每用户最多 100 条活跃记忆，超出按优先级裁剪
  - 同类合并：向量搜索找到相似记忆（距离 < 0.3），LLM 合并为一条
  - 分类标记：`EXPIRABLE_CATEGORIES`（情绪/事件/健康）vs `STABLE_CATEGORIES`（个人信息/饮食偏好/偏好/关系/工作学习）
- **记忆操作升级**：`extract_memories()` 支持 `add` / `update` / `delete` 三种操作
  - `update`：用户信息变化时更新已有记忆
  - `delete`：记忆过时时标记删除
  - 对话接口中同步执行 update/delete 到向量数据库和 SQL 数据库
- **去重增强**：
  - 新增子字符串包含匹配
  - 向量相似度去重阈值调整为 0.4
  - 记忆之间互查去重
- **饮食场景关键词**：新增 `food_keywords`（爱吃、忌口、素食、辣、清淡等）和 `meal_emotion_keywords`（吃不下、没胃口、吃撑了、好饿）
- **关怀判断优化**：融入进食陪伴场景，关怀建议以角色口吻输出短句
- **`Memory` 模型新增字段**：`cared_at`（上次关怀时间）、`is_cared`（是否已关怀）、`extra_data`（扩展数据）

### 🔧 技术改进

#### 后端
- **修改 `api/tts.py`**：语音锁定、新增讯飞/MiMo TTS 引擎
- **修改 `core/memory_extractor.py`**：新增 `food_preference` 分类、生命周期管理、同类合并、记忆操作升级、饮食关键词
- **修改 `models/user.py`**：Memory 模型新增 `cared_at`/`is_cared`/`extra_data` 字段

#### 配置项新增
| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `TTS_CHARACTER_VOICE` | `"aisjiuxu"` | 角色固定语音 |
| `TTS_VOICE_DEFAULT` | `"aisjiuxu"` | TTS 默认语音 |
| `MIMO_API_KEY` | `""` | MiMo TTS API Key |
| `MIMO_BASE_URL` | `"https://api.xiaomimimo.com/v1"` | MiMo API 地址 |
| `MIMO_TTS_MODEL` | `"mimo-v2.5-tts-voicedesign"` | MiMo TTS 模型 |
| `MIMO_VOICE_DESIGN_PROMPT` | (苏怀真音色描述) | MiMo 音色设计提示词 |
| `IFLYTEK_TTS_*` | (多个) | 讯飞 TTS 配置 |
| `MEMORY_DISTANCE_THRESHOLD` | `1.2` | 记忆检索距离阈值 |
| `MEMORY_MIN_IMPORTANCE` | `2` | 记忆最低重要性 |
| `MEMORY_PROMPT_CHAR_LIMIT` | `500` | 记忆注入字符数上限 |
| `MEMORY_MAX_PER_USER` | `100` | 每用户记忆上限 |
| `MEMORY_CLEANUP_INTERVAL` | `86400` | 记忆清理间隔（秒） |

---

## v0.2.0 - 2024-xx-xx

### ✨ 新增功能

#### 🧠 记忆系统
- **向量数据库集成**：使用 ChromaDB 实现记忆的向量存储和语义检索
- **自动记忆提取**：对话中使用 LLM 自动提取用户的重要信息
- **记忆分类**：支持 8 种记忆分类（个人信息、健康、情绪、事件、偏好、人际关系、工作学习、其他）
- **记忆召回**：对话时自动检索相关记忆，注入上下文提供个性化回复
- **记忆管理 API**：添加、查询、搜索、删除记忆的完整接口

#### 💭 关怀功能
- **智能关怀检测**：基于用户记忆分析是否需要关怀
- **后台关怀任务**：异步任务定期检查用户关怀需求
- **关怀类型**：健康关怀、情绪关怀、重要事件提醒等
- **关怀建议**：根据记忆内容生成个性化的关怀建议

#### 🔊 唤醒词检测
- **唤醒词检测 API**：提供后端唤醒词检测接口
- **配置接口**：支持获取唤醒词配置和参数
- **多方案支持**：预留 Porcupine 和 OpenWakeWord 集成接口

#### 🔒 认证系统增强
- **Token 黑名单机制**：支持登出功能，防止 Token 被恶意使用
- **账户注销**：支持用户软删除账户
- **用户信息更新**：支持更新用户昵称、邮箱等信息

#### 🔄 API 增强
- **流式对话接口**：支持 SSE 流式响应
- **记忆提取接口**：手动触发记忆提取
- **关怀检查接口**：检查用户是否需要关怀

### 🔧 技术改进

#### 后端
- **新增 `core/vector_db.py`**：向量数据库管理模块
  - 支持记忆的向量存储和检索
  - 自动创建持久化数据目录
  - 支持按用户和分类过滤记忆

- **新增 `core/memory_extractor.py`**：记忆提取服务模块
  - LLM 智能记忆提取（主方案）
  - 关键词提取回退方案（备用方案）
  - 双重错误处理机制
  - 记忆去重：简单文本匹配 + 向量相似度匹配
  - 自动重要性评估（1-5 分）
  - 智能关怀判断

- **新增 `api/memory.py`**：记忆管理 API
  - CRUD 操作接口
  - 语义搜索接口
  - 记忆提取触发接口
  - 关怀检查接口

- **新增 `api/wakeword.py`**：唤醒词检测 API
  - 检测接口和配置接口
  - 预留第三方库集成接口

- **更新 `main.py`**
  - 集成所有新模块
  - 后台关怀任务（每小时运行一次）
  - 完整的 API 文档和根路径信息

- **更新 `api/llm.py`**
  - 对话时自动注入相关记忆上下文
  - 对话后自动提取记忆
  - 流式对话支持记忆提取

- **更新 `core/security.py`**
  - Token 黑名单检查
  - 登出功能支持

- **更新 `models/user.py`**
  - 新增 TokenBlacklist 数据模型

#### 移动端
- **更新 `services/api.ts`**
  - 新增记忆相关接口方法
  - 新增唤醒词相关接口方法
  - 新增登出和账户注销方法
  - 更新用户信息方法

#### 依赖
- **新增 `chromadb==0.4.22`**：向量数据库
- **新增 `scikit-learn==1.3.2`**：机器学习工具库（预留）

### 📚 文档更新
- **新增 `docs/API_TEST.md`**
  - 完整的 API 接口文档
  - 各接口请求/响应示例
  - curl 测试命令
  - 完整的端到端测试流程
  - 常见错误码说明

- **更新 README.md**
  - 新增 v0.2 功能特性说明
  - 更新技术选型列表
  - 更新开发计划进度
  - 添加使用注意事项
  - 完整的架构说明

### 🎯 API 端点（新增）
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /auth/logout | 用户登出（将 Token 加入黑名单） |
| DELETE | /auth/me | 注销账户（软删除） |
| POST | /memory | 添加记忆 |
| GET | /memory | 获取记忆列表 |
| POST | /memory/search | 语义搜索记忆 |
| DELETE | /memory/{id} | 删除记忆 |
| POST | /memory/extract | 从对话提取记忆 |
| POST | /memory/care/check | 检查关怀需求 |
| POST | /wakeword/detect | 唤醒词检测 |
| GET | /wakeword/config | 获取唤醒词配置 |

### 🧪 核心特性细节

#### 记忆提取流程
1. **输入验证**：检查消息长度和内容有效性
2. **LLM 提取**：使用 OpenAI API 智能提取重要信息（主方案）
3. **回退机制**：LLM 失败时自动使用关键词提取（备用方案）
4. **记忆去重**：
   - 简单文本去重
   - 向量相似度去重（阈值 < 0.2）
   - 新记忆之间去重
5. **重要性评估**：基于关键词自动打分（1-5分）
6. **存储入库**：同时存入关系数据库和向量数据库

#### 关怀检测流程
1. **收集重要记忆**：筛选重要性 >= 3 的记忆
2. **关键词快速检测**：健康/情绪关键词匹配
3. **LLM 智能分析**：深度分析记忆内容判断是否需要关怀
4. **生成关怀建议**：包括关怀类型、主题和建议话术

#### 错误处理机制
- **多层异常捕获**：每个关键环节都有 try-catch
- **优雅降级**：LLM 失败自动降级到关键词提取
- **最后保障**：关键词提取失败返回空列表
- **详细日志**：每个步骤输出详细日志便于调试

---

## v0.1.0 - 初始版本

### ✨ 基础功能
- 后端服务框架（Python 3.10 + FastAPI）
- ASR语音识别接口（Whisper本地）
- LLM对话接口（OpenAI GPT）
- TTS语音合成接口（OpenAI TTS）
- 用户认证系统（JWT）
- 移动端基础框架（React Native）
- 状态机设计（idle/listening/speaking）
- 视频播放集成
- 国内镜像源配置
