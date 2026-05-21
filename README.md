# 食光知己 - AI 陪伴 APP

> 跨越千年的知己相逢

## 项目简介

食光知己是一款基于 AI 大模型的 Android 陪伴应用。用户通过语音与虚拟角色"苏怀真"进行对话，体验古代文人的智慧与温暖。角色定位为"进食陪伴者"，在用户用餐时提供温暖的对话陪伴，并通过"食光鉴"古铜镜连接古今，推荐美食相关内容。

## 环境要求

### 后端
- **Python**: 3.10.x
- **环境管理**: Anaconda（GraPro 环境）
- **ffmpeg**: Whisper 语音识别依赖

### 移动端
- **Node.js**: 18+
- **Expo SDK**: 54
- **目标平台**: Android

### 快速配置（后端）

运行根目录的 `setup.bat` 脚本一键配置：
```bash
setup.bat
```

此脚本会：
1. 配置 pip 镜像源（清华源）
2. 配置 conda 镜像源（清华源）
3. 激活/创建 GraPro 环境
4. 配置 HuggingFace 镜像（下载 Whisper 模型）
5. 安装 Python 依赖

## 功能特性

### 🎙️ 核心对话
- **语音唤醒**：集成 sherpa-onnx 离线唤醒词引擎，"你好，苏怀真"激活对话
- **语音对话**：Whisper 语音识别 + LLM 对话生成 + TTS 语音播放
- **流式对话**：SSE 结构化事件流（text_chunk / sentence / text_done / search / care / done）
- **逐句 TTS**：按标点分割逐句合成播放，更自然的对话节奏
- **打断功能**：点击屏幕打断 TTS 播放
- **退出语义**：说"不想聊了"等自动退出聆听

### 🗣️ 多 TTS 引擎
- **OpenAI TTS**：云端语音合成
- **讯飞 WebSocket TTS**：实时流式语音合成
- **MiMo 语音设计**：通过音色描述定制苏怀真专属声音
- **TTS 缓存**：相同文本直接返回缓存，减少重复合成
- **健康检测与降级**：自动检测引擎可用性，按优先级降级切换

### 🧠 记忆系统
- **自动提取**：对话中 LLM 自动提取用户重要信息
- **分类存储**：支持 8+ 种分类（个人信息、健康、情绪、事件、饮食偏好、偏好、关系、工作学习等）
- **语义检索**：基于 ChromaDB 向量数据库，智能检索相关记忆
- **记忆召回**：对话时自动注入记忆上下文，提供个性化回复
- **生命周期管理**：过期清理、容量限制、同类合并
- **记忆操作**：支持 add / update / delete 三种操作

### 💭 关怀功能
- **智能关怀检测**：基于记忆分析用户是否需要关怀
- **定期关怀**：后台任务定期检查用户状态
- **对话融入**：关怀消息自然融入角色对话，非独立推送
- **24 小时冷却**：避免重复关怀
- **健康/情绪关怀**：关注用户健康状况与情绪状态

### 🔮 食光鉴搜索
- **Bilibili 多策略搜索**：热门搜索 + 综合搜索 + DuckDuckGo 回退
- **独立弹窗展示**：TTS 播放完毕后自动弹出，5 秒无操作自动关闭
- **角色化推荐**：以"食光鉴中映出"方式引入推荐内容
- **搜索缓存**：TTL 可配置，默认 5 分钟

### 🔍 联网搜索
- **Tavily API 集成**：支持联网信息检索
- **搜索结果融入对话**：Web 搜索结果作为上下文辅助 LLM 回复

### 📜 会话管理
- **对话持久化**：所有对话存入 SQLite 数据库
- **会话列表**：按时间倒序浏览历史会话，支持分页加载
- **会话详情**：查看完整会话记录
- **继续对话**：从历史会话继续聊天
- **删除会话**：左滑删除

### 🛠️ 诊断与测试
- **诊断测试**：6 大类 29 项自动化诊断（DiagnosticsScreen）
- **测试模式**：8 种 ASR 测试用例，CSV 报告导出（TestModeScreen）

### 🎬 视频动画
- **四种状态视频**：idle / listening / speaking / eating
- **Speaking 口型同步**：实时音频 RMS 能量分析驱动口型开合
- **视频预加载**：缓存管理优化播放流畅度

## 技术架构

```
┌──────────────────────────────────────────────────────────────┐
│                      Android APP (Expo)                      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 唤醒词检测    │  │  音频录制    │  │  视频播放    │      │
│  │ (sherpa-onnx)│  │  (expo-av)  │  │ idle/listen  │      │
│  └──────────────┘  └──────────────┘  │ /speak/eat   │      │
│                          │            └──────────────┘      │
│                   ┌──────┴──────┐                            │
│                   │ ASR + LLM   │                            │
│                   │ + TTS Pipe  │                            │
│                   └──────┬──────┘                            │
│                          │                                   │
│  ┌──────────────┐  ┌────┴─────────┐                        │
│  │ 食光鉴弹窗   │  │  Zustand     │                        │
│  │ (Bilibili)  │  │  状态管理     │                        │
│  └──────────────┘  └──────────────┘                        │
└────────────────────────────┬─────────────────────────────────┘
                             │ HTTP REST / SSE
┌────────────────────────────▼─────────────────────────────────┐
│                    后端服务 (FastAPI)                          │
│  Python 3.10 | Docker 支持                                    │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ ASR (Whisper)│  │ LLM (OpenAI) │  │ TTS 多引擎   │      │
│  │              │  │  兼容格式     │  │ OpenAI/讯飞  │      │
│  └──────────────┘  └──────────────┘  │ /MiMo        │      │
│                                      └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 记忆系统     │  │ 食光鉴搜索   │  │ 联网搜索     │      │
│  │ (ChromaDB)  │  │ (Bilibili)   │  │ (Tavily)     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │ 账号系统     │  │ 会话管理     │                         │
│  │ (JWT Auth)  │  │ (SQLite)     │                         │
│  └──────────────┘  └──────────────┘                         │
└───────────────────────────────────────────────────────────────┘
```

## 项目结构

```
食光知己/
├── backend/                        # 后端服务 (Python 3.10)
│   ├── main.py                     # FastAPI 入口
│   ├── requirements.txt            # Python 依赖
│   ├── .env.example                # 配置模板
│   ├── Dockerfile                  # Docker 构建文件
│   ├── start.bat                   # Windows 启动脚本
│   ├── start.sh                    # Linux/Mac 启动脚本
│   │
│   ├── api/                        # API 路由
│   │   ├── auth.py                 # 认证接口
│   │   ├── asr.py                  # 语音识别（Whisper）
│   │   ├── llm.py                  # 对话生成（流式 + 记忆 + 关怀）
│   │   ├── tts.py                  # 语音合成（多引擎）
│   │   ├── memory.py               # 记忆管理
│   │   ├── search.py               # 食光鉴搜索（Bilibili）
│   │   └── wakeword.py             # 唤醒词检测
│   │
│   ├── core/                       # 核心模块
│   │   ├── config.py               # 配置管理
│   │   ├── database.py             # 数据库连接
│   │   ├── security.py             # 安全认证（JWT + Token 黑名单）
│   │   ├── vector_db.py            # 向量数据库（ChromaDB）
│   │   ├── memory_extractor.py     # 记忆提取服务
│   │   ├── search_engine.py        # Bilibili 多策略搜索引擎
│   │   ├── web_search.py           # 联网搜索（Tavily）
│   │   ├── tts_cache.py            # TTS 音频缓存
│   │   ├── tts_provider_manager.py # TTS 多引擎管理（健康检测 + 降级）
│   │   └── audio_converter.py      # 音频格式转换
│   │
│   ├── models/                     # 数据模型
│   │   └── user.py                 # 用户 / 记忆 / Token 黑名单模型
│   │
│   └── tests/                      # 后端测试
│       ├── conftest.py             # 测试配置
│       ├── test_auth.py            # 认证测试
│       ├── test_endpoints.py       # 端点测试
│       ├── test_llm.py             # LLM 测试
│       └── test_memory.py          # 记忆测试
│
├── app/                            # Android APP (React Native + Expo)
│   ├── App.tsx                     # 应用入口 + 路由
│   ├── app.json                    # Expo 配置
│   ├── package.json                # 依赖配置
│   ├── start_mobile.bat            # 移动端启动脚本
│   │
│   ├── src/
│   │   ├── screens/                # 页面
│   │   │   ├── LoginScreen.tsx     # 登录
│   │   │   ├── HomeScreen.tsx      # 主页（对话 + 视频动画）
│   │   │   ├── SettingsScreen.tsx  # 设置
│   │   │   ├── MemoryScreen.tsx    # 记忆管理
│   │   │   ├── SessionListScreen.tsx   # 会话列表
│   │   │   ├── SessionDetailScreen.tsx # 会话详情
│   │   │   ├── DiagnosticsScreen.tsx   # 诊断测试
│   │   │   └── TestModeScreen.tsx      # ASR 测试模式
│   │   │
│   │   ├── components/             # 组件
│   │   │   ├── ShiguangjianModal.tsx   # 食光鉴弹窗
│   │   │   ├── MessageActionSheet.tsx  # 消息操作菜单
│   │   │   ├── ScreenContainer.tsx     # 页面容器
│   │   │   ├── AppButton.tsx           # 通用按钮
│   │   │   ├── AppCard.tsx             # 通用卡片
│   │   │   ├── AppInput.tsx            # 通用输入框
│   │   │   └── IconButton.tsx          # 图标按钮
│   │   │
│   │   ├── services/               # 服务
│   │   │   ├── api.ts              # API 客户端（自动发现后端 IP）
│   │   │   ├── wakeWordService.ts  # 唤醒词服务（sherpa-onnx）
│   │   │   └── ttsClientCache.ts   # 客户端 TTS 缓存
│   │   │
│   │   ├── store/                  # 状态管理
│   │   │   ├── appStore.ts         # Zustand 全局状态
│   │   │   └── AuthContext.tsx      # 认证上下文
│   │   │
│   │   └── theme.ts                # 主题配置
│   │
│   └── assets/
│       ├── videos/                 # 视频资源
│       │   ├── idle.mp4            # 待机状态
│       │   ├── listening.mp4       # 聆听状态
│       │   ├── speaking.mp4        # 说话状态
│       │   └── eating.mp4          # 进食状态
│       ├── adaptive-icon.png
│       ├── icon.png
│       ├── splash-icon.png
│       └── favicon.png
│
├── docker-compose.yml              # Docker Compose 部署
├── setup.bat                       # 后端环境一键配置
├── pip.conf                        # pip 镜像配置
├── conda.conf                      # conda 镜像配置
├── CHANGELOG.md                    # 版本变更记录
└── README.md                       # 本文件
```

## 快速开始

### 方式一：本地运行

#### 1. 环境配置（首次）

```bash
# 运行一键配置脚本
setup.bat
```

这将自动完成：
- pip/conda 镜像源配置
- GraPro 环境激活
- Python 依赖安装

#### 2. 配置 API Key

编辑 `backend/.env` 文件：
```env
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=你的-API-Key
LLM_MODEL=gpt-3.5-turbo
```

#### 3. 启动后端服务

```bash
# 方式1：使用启动脚本（推荐）
cd backend
start.bat

# 方式2：手动命令
conda activate GraPro
cd backend
set HF_ENDPOINT=https://hf-mirror.com
python main.py
```

启动后访问：
- API 文档: http://localhost:8000/docs
- 健康检查: http://localhost:8000/health

#### 4. 启动移动端 APP

```bash
cd app
npm install
npx expo start
```

### 方式二：Docker 部署

```bash
# 配置后端环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env 填写 API Key 等配置

# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f
```

## 状态机

```
待机 (idle) ←──────────────────────┐
    │                              │
    │ 唤醒词检测                   │
    ▼                              │
聆听 (listening)                   │
    │                              │
    ├──────┬───────────┐           │
    │      │           │           │
    ▼      ▼           ▼           │
退出   超时30s   识别到语音      │
    │      │           │           │
    │      │           ▼           │
    │      │      说话 (speaking)  │
    │      │           │           │
    │      │      点击打断         │
    │      │           │           │
    └──────┴───────────┴───────────┘
              回到聆听
```

## 技术选型

| 模块 | 技术 | 说明 |
|------|------|------|
| 后端框架 | FastAPI | 异步高性能 |
| Python | 3.10.x | GraPro 环境 |
| LLM | OpenAI API（兼容格式） | 支持 DeepSeek、硅基流动等 |
| ASR | Whisper | 本地部署（HF 镜像下载） |
| TTS | OpenAI / 讯飞 / MiMo | 多引擎 + 缓存 + 降级 |
| 认证 | JWT | Token 认证 + 黑名单 |
| 数据库 | SQLite + aiosqlite | 异步轻量存储 |
| 向量数据库 | ChromaDB | 记忆向量存储与检索 |
| 移动端框架 | React Native (Expo 54) | Android 跨平台 |
| 状态管理 | Zustand | 轻量状态管理 |
| 导航 | React Navigation 7 | 原生导航 |
| 唤醒词 | sherpa-onnx | 离线唤醒词检测 |
| 食光鉴搜索 | Bilibili API + DuckDuckGo | 多策略视频搜索 |
| 联网搜索 | Tavily API | Web 信息检索 |
| 容器化 | Docker + Docker Compose | 一键部署 |

## 配置说明

### 环境变量 (.env)

支持任何兼容 OpenAI 接口格式的 API 服务商。

```env
# ===========================================
# LLM API 配置 (必填)
# ===========================================
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=your-api-key
LLM_MODEL=gpt-3.5-turbo

# ===========================================
# TTS 语音合成配置
# ===========================================
TTS_PROVIDER=openai
TTS_MODEL=tts-1
TTS_VOICE=nova

# 讯飞 TTS（可选）
# IFLYTEK_TTS_APP_ID=your-app-id
# IFLYTEK_TTS_API_KEY=your-api-key
# IFLYTEK_TTS_API_SECRET=your-api-secret

# MiMo TTS（可选）
# MIMO_API_KEY=your-mimo-api-key

# TTS 缓存
TTS_CACHE_ENABLED=true
TTS_CACHE_TTL=86400

# TTS 流式合成
TTS_STREAMING_ENABLED=true

# TTS 降级顺序
TTS_FALLBACK_ORDER=mimo,iflytek_ws,openai

# ===========================================
# Whisper 配置
# ===========================================
WHISPER_MODEL=base

# ===========================================
# JWT 安全配置 (必填)
# ===========================================
SECRET_KEY=your-secret-key
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# ===========================================
# CORS 配置
# ===========================================
CORS_ORIGINS=*

# ===========================================
# 服务器配置
# ===========================================
HOST=0.0.0.0
PORT=8000
DEBUG=true

# ===========================================
# 数据库配置
# ===========================================
DATABASE_URL=sqlite+aiosqlite:///./shiguang.db

# ===========================================
# 联网搜索配置 (Tavily)
# ===========================================
WEB_SEARCH_ENABLED=true
TAVILY_API_KEY=your-tavily-api-key
```

### 国内镜像源配置

| 工具 | 镜像源 |
|------|--------|
| pip | 清华源 `https://pypi.tuna.tsinghua.edu.cn/simple` |
| conda | 清华 Anaconda 源 `https://mirrors.tuna.tsinghua.edu.cn/anaconda/` |
| HuggingFace | `https://hf-mirror.com`（Whisper 模型下载） |

### 视频资源

建议视频规格：
- 格式：MP4 (H.264)
- 分辨率：720p 或 1080p
- 时长：循环播放，无限时长

| 文件 | 状态 | 说明 |
|------|------|------|
| `idle.mp4` | 待机 | 角色静止或轻微动作 |
| `listening.mp4` | 聆听 | 角色专注倾听 |
| `speaking.mp4` | 说话 | 角色正在说话 |
| `eating.mp4` | 进食 | 角色陪伴进食 |

## 注意事项

1. **网络**：移动端和后端需在同一网络下可访问，App 启动时自动扫描局域网 IP 发现后端
2. **权限**：首次使用需要麦克风权限
3. **API Key**：需要有效的 OpenAI 兼容 API Key（LLM 对话 + 记忆提取 + TTS）
4. **ffmpeg**：Whisper 依赖 ffmpeg，请确保已安装
5. **向量数据库**：首次启动自动创建 ChromaDB 数据目录（backend/chroma_db）
6. **记忆提取**：需要 LLM API 支持，无 API Key 时跳过记忆提取
7. **唤醒词**：已集成 sherpa-onnx 离线检测，Android 前台运行，切后台自动暂停
8. **Docker 部署**：后端支持 Docker，移动端仍需本地运行

## 版本历史

详见 [CHANGELOG.md](./CHANGELOG.md)

当前版本：**v0.6.0**

### 开发计划

- [ ] speaking 视频口型同步增强（LiveTalking / 实时音频驱动）
- [ ] 离线模式
- [ ] iOS 适配

## License

MIT License
