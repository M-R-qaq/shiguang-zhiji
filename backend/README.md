# 食光知己 - 后端服务

## 项目简介

食光知己后端服务是一个基于 FastAPI 构建的 AI 陪伴系统后端，为移动端 APP 提供语音识别、自然语言处理和语音合成能力。

## 技术架构

```
┌─────────────────────────────────────────────────────────┐
│                        移动端 APP                        │
│                  (语音录制 / 视频播放)                   │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP REST API
┌──────────────────────────▼──────────────────────────────┐
│                    后端服务 (FastAPI)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │  ASR接口  │  │ LLM接口  │  │ TTS接口  │  │ Auth   │ │
│  │ (Whisper)│  │(OpenAI)  │  │(云API)  │  │(JWT)   │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
└─────────────────────────────────────────────────────────┘
```

## 主要功能

### 1. 语音识别 (ASR)
- 基于 OpenAI Whisper 模型
- 支持中文普通话识别
- 提供分段和时间戳信息

### 2. 对话生成 (LLM)
- 基于 OpenAI GPT 系列模型
- 苏怀真角色设定和 Prompt 工程
- 支持流式输出
- 对话历史管理

### 3. 语音合成 (TTS)
- 基于 OpenAI TTS 模型
- 多种语音风格可选
- 返回 MP3 格式音频

### 4. 用户认证
- JWT Token 认证
- 用户注册/登录
- 密码安全加密

## 快速开始

### 环境要求

- Python 3.9+
- ffmpeg (用于音频处理)

### 1. 安装依赖

```bash
# 克隆项目后
cd backend

# 创建虚拟环境（推荐）
python -m venv venv
source venv/bin/activate  # Linux/Mac
# 或 venv\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt

# 安装 ffmpeg (Linux)
sudo apt install ffmpeg

# 安装 ffmpeg (macOS)
brew install ffmpeg

# 安装 ffmpeg (Windows)
# 下载并添加到 PATH
```

### 2. 配置环境变量

创建 `.env` 文件：

```env
# OpenAI 配置
OPENAI_API_KEY=your-openai-api-key
OPENAI_BASE_URL=https://api.openai.com/v1  # 或代理地址
LLM_MODEL=gpt-3.5-turbo  # 可选: gpt-4, gpt-4-turbo

# TTS 配置
TTS_MODEL=tts-1
TTS_VOICE=alloy  # 可选: alloy, echo, fable, onyx, nova, shimmer

# Whisper 配置
WHISPER_MODEL=base  # 可选: tiny, base, small, medium, large

# JWT 配置
SECRET_KEY=your-secret-key-change-in-production

# 服务器配置
HOST=0.0.0.0
PORT=8000
```

### 3. 启动服务

```bash
# Windows
.\start.bat

# Linux/Mac
chmod +x start.sh
./start.sh

# 或直接运行
python main.py
```

### 4. 验证服务

访问 http://localhost:8000/docs 查看 API 文档

## API 文档

### 认证接口 `/auth`

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/auth/register` | 用户注册 |
| POST | `/auth/login` | 用户登录 |
| GET | `/auth/me` | 获取当前用户信息 |
| PUT | `/auth/me` | 更新用户信息 |

### 语音识别 `/asr`

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/asr/transcribe` | 语音转文字 |
| POST | `/asr/transcribe-stream` | 流式语音识别 |

### 对话生成 `/llm`

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/llm/chat` | 普通对话 |
| POST | `/llm/chat/stream` | 流式对话 |
| GET | `/llm/history` | 获取对话历史 |
| DELETE | `/llm/history` | 清空对话历史 |

### 语音合成 `/tts`

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/tts/synthesize` | 文字转语音 |
| GET | `/tts/voices` | 获取可用语音列表 |
| GET | `/tts/config` | 获取当前TTS配置 |

## API 使用示例

### 用户注册

```bash
curl -X POST "http://localhost:8000/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "password123",
    "nickname": "小明"
  }'
```

### 用户登录

```bash
curl -X POST "http://localhost:8000/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "password123"
  }'
```

### 对话

```bash
curl -X POST "http://localhost:8000/llm/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "message": "你好，苏怀真！"
  }'
```

## Whisper 模型选择

| 模型 | 参数量 | 中文WER | 推荐场景 |
|------|--------|--------|----------|
| tiny | 39M | ~15% | 快速测试 |
| base | 74M | ~10% | 推荐日常使用 |
| small | 244M | ~6% | 高精度需求 |
| medium | 769M | ~4% | 专业场景 |

> WER = Word Error Rate，越低越好

## 项目结构

```
backend/
├── main.py              # 应用入口
├── requirements.txt      # 依赖列表
├── start.sh             # Linux/Mac 启动脚本
├── start.bat            # Windows 启动脚本
├── .env                 # 环境变量（需创建）
│
├── api/                 # API 路由
│   ├── __init__.py
│   ├── auth.py          # 认证接口
│   ├── asr.py           # 语音识别接口
│   ├── llm.py           # 对话生成接口
│   └── tts.py           # 语音合成接口
│
├── core/                # 核心配置
│   ├── __init__.py
│   ├── config.py        # 配置管理
│   ├── database.py      # 数据库连接
│   └── security.py      # 安全认证
│
└── models/              # 数据模型
    ├── __init__.py
    └── user.py          # 用户相关模型
```

## 常见问题

### Q: Whisper 模型下载失败？

```bash
# 设置镜像源
export HF_ENDPOINT=https://hf-mirror.com
```

或在代码中修改 whisper 加载逻辑使用镜像。

### Q: OpenAI API 调用失败？

1. 检查 API Key 是否正确
2. 检查网络连接（可能需要代理）
3. 检查账户余额

### Q: 语音识别延迟较高？

- 使用更小的 Whisper 模型（tiny/base）
- 减少音频文件大小
- 使用流式处理

## 开发指南

### 添加新的 API 路由

1. 在 `api/` 目录创建新文件
2. 定义路由和 Pydantic 模型
3. 在 `main.py` 中注册路由

### 修改数据库模型

1. 编辑 `models/user.py`
2. 运行迁移或重建数据库

## License

MIT License