# 食光知己 - AI陪伴APP

> 跨越千年的知己相逢

## 项目简介

食光知己是一款基于AI大模型的移动端陪伴应用。用户通过语音与虚拟角色"苏怀真"进行对话，体验古代文人的智慧与温暖。

## 环境要求

### Python版本
- **推荐版本**: Python 3.10.x
- **环境管理**: Anaconda (创建了GraPro环境)
- **环境位置**: `D:\3.Software\Anaconda_envs\envs\GraPro`

### 快速配置

运行根目录的 `setup.bat` 脚本一键配置：
```bash
setup.bat
```

此脚本会：
1. ✅ 配置pip镜像源（清华源）
2. ✅ 配置conda镜像源（清华源）
3. ✅ 激活/创建GraPro环境
4. ✅ 配置HuggingFace镜像（下载Whisper模型）
5. ✅ 安装Python依赖

## 功能特性

### 🎙️ 核心功能
- **语音唤醒**：唤醒词"你好，XX"激活对话
- **语音对话**：自动语音识别 + LLM对话生成
- **语音播放**：TTS技术，苏怀真朗读回复
- **视频动画**：三个状态视频（待机/聆听/说话）
- **打断功能**：点击屏幕打断TTS播放
- **退出语义**：说"不想聊了"等自动退出聆听

### 💭 关怀功能
- 记忆用户的重要信息
- 定期关怀用户的健康、情绪
- 基于向量检索的智能记忆召回

## 技术架构

```
┌──────────────────────────────────────────────────────────────┐
│                         移动端 APP                           │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  唤醒词检测   │    │   音频录制   │    │   视频播放   │  │
│  │ "你好，XX"   │    │              │    │  idle/listen │  │
│  └──────────────┘    └──────────────┘    │ /speak       │  │
│                          │                └──────────────┘  │
│                          │                                    │
│                   ┌──────┴──────┐                            │
│                   │  ASR+LLM    │                            │
│                   │ +TTS Pipeline│                           │
│                   └──────┬──────┘                            │
│                          │                                    │
│                   ┌──────┴──────┐                            │
│                   │  向量数据库  │                            │
│                   │ (记忆存储)   │                            │
│                   └─────────────┘                            │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTP REST
┌────────────────────────────▼────────────────────────────────┐
│                     后端服务 (FastAPI)                       │
│  Python 3.10 | Anaconda GraPro环境                          │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ ASR (Whisper)│  │ LLM (OpenAI)│  │ TTS (云API) │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  ┌──────────────┐                                           │
│  │ 账号系统     │                                           │
│  │ (JWT Auth)  │                                           │
│  └──────────────┘                                           │
└──────────────────────────────────────────────────────────────┘
```

## 国内镜像源配置

### pip镜像（已配置）
- 清华源: `https://pypi.tuna.tsinghua.edu.cn/simple`
- 阿里源: `https://mirrors.aliyun.com/pypi/simple/`
- 中科大源: `https://pypi.mirrors.ustc.edu.cn/simple/`

### conda镜像（已配置）
- 清华Anaconda源: `https://mirrors.tuna.tsinghua.edu.cn/anaconda/`

### HuggingFace镜像（Whisper模型下载）
- 镜像站: `https://hf-mirror.com`

## 项目结构

```
食光知己/
├── backend/                    # 后端服务 (Python 3.10)
│   ├── main.py                 # FastAPI入口
│   ├── requirements.txt        # Python依赖
│   ├── .env.example           # 配置模板
│   ├── start.bat              # 后端启动脚本
│   │
│   ├── api/                   # API路由
│   │   ├── auth.py            # 认证接口
│   │   ├── asr.py             # 语音识别（Whisper）
│   │   ├── llm.py             # 对话生成（OpenAI）
│   │   └── tts.py             # 语音合成（TTS）
│   │
│   ├── core/                  # 核心模块
│   │   ├── config.py          # 配置管理
│   │   ├── database.py        # 数据库连接
│   │   └── security.py        # 安全认证
│   │
│   └── models/                 # 数据模型
│       └── user.py            # 用户模型
│
├── app/                       # 移动端APP (React Native)
│   ├── App.tsx                # 应用入口
│   ├── package.json           # 依赖配置
│   │
│   ├── src/
│   │   ├── screens/           # 页面
│   │   ├── services/          # 服务
│   │   └── store/            # 状态管理
│   │
│   └── assets/
│       └── videos/            # 视频资源
│
├── videos/                    # 原始视频资源
├── setup.bat                  # 环境配置脚本
├── pip.conf                   # pip镜像配置
├── conda.conf                 # conda镜像配置
│
└── README.md                  # 本文件
```

## 快速开始

### 1. 环境配置（首次）

```bash
# 运行一键配置脚本
setup.bat
```

这将自动完成：
- pip/conda镜像源配置
- GraPro环境激活
- Python依赖安装

### 2. 配置API Key

编辑 `backend/.env` 文件：
```env
OPENAI_API_KEY=你的OpenAI-API-Key
```

### 3. 启动后端服务

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
- API文档: http://localhost:8000/docs
- 健康检查: http://localhost:8000/health

### 4. 启动移动端APP

```bash
cd app
npm install
npm start
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
| Python | 3.10.x | GraPro环境 |
| 移动端框架 | React Native (Expo) | 跨平台开发 |
| 后端框架 | FastAPI | 异步高性能 |
| LLM | OpenAI API | GPT-3.5/4 |
| ASR | Whisper | 本地部署（镜像下载） |
| TTS | OpenAI TTS | 云端服务 |
| 认证 | JWT | Token认证 |
| 数据库 | SQLite | 轻量本地存储 |
| 状态管理 | Zustand | 轻量状态管理 |

## 开发计划

### ✅ 已完成
- [x] 后端服务框架（Python 3.10 + FastAPI）
- [x] ASR语音识别接口（Whisper本地）
- [x] LLM对话接口（OpenAI GPT）
- [x] TTS语音合成接口（OpenAI TTS）
- [x] 用户认证系统（JWT）
- [x] 移动端基础框架（React Native）
- [x] 状态机设计（idle/listening/speaking）
- [x] 视频播放集成
- [x] 国内镜像源配置

### 🔄 进行中
- [ ] 唤醒词检测实现（Coqui Wake Word）
- [ ] 向量数据库集成（移动端记忆）
- [ ] 记忆系统实现
- [ ] 关怀功能实现

### 📋 待开发
- [ ] speaking视频口型同步（LiveTalking）
- [ ] 性能优化
- [ ] 离线模式

## 配置说明

### 环境变量 (.env)

支持任何兼容OpenAI接口格式的API服务商（如OpenAI、DeepSeek、硅基流动等）。

```env
# ===========================================
# LLM API 配置 (必填)
# ===========================================
# API地址（兼容OpenAI格式）
# 示例：
#   - OpenAI官方: https://api.openai.com/v1
#   - DeepSeek: https://api.deepseek.com/v1
#   - 硅基流动: https://api.siliconflow.cn/v1
#   - 其他中转API: https://your-proxy.com/v1
OPENAI_BASE_URL=https://api.openai.com/v1

# API密钥
OPENAI_API_KEY=your-api-key

# 使用的模型（根据API服务商支持的模型填写）
LLM_MODEL=gpt-3.5-turbo

# TTS 配置
TTS_MODEL=tts-1
TTS_VOICE=nova

# Whisper 配置
WHISPER_MODEL=base

# JWT 配置
SECRET_KEY=your-secret-key
```

### 视频资源

建议视频规格：
- 格式：MP4 (H.264)
- 分辨率：720p 或 1080p
- 时长：循环播放，无限时长
- 内容：
  - `idle.mp4`：待机状态，角色静止或轻微动作
  - `listening.mp4`：聆听状态，角色专注倾听
  - `speaking.mp4`：说话状态，角色正在说话

## 注意事项

1. **网络**：移动端和后端需在同一网络下可访问
2. **权限**：首次使用需要麦克风权限
3. **API Key**：需要有效的OpenAI API Key
4. **唤醒词**：当前为模拟实现，需接入Coqui等库
5. **ffmpeg**：Whisper需要ffmpeg，请确保已安装

## License

MIT License