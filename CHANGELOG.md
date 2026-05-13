# Changelog

## v0.1 - 2026-05-13

### ✨ 新功能
- **用户系统**：注册、登录、JWT 认证
- **LLM 对话**：苏怀真角色扮演，支持多轮对话
- **语音识别（ASR）**：录音后转文字
- **语音合成（TTS）**：讯飞 TTS，支持 base64 音频播放
- **虚拟人形象**：3 种状态视频（idle、listening、speaking）
- **对话历史**：自动保存用户与助手对话记录

### 🐛 Bug 修复
- **[注册]** 修复前端注册后自动登录失败问题
- **[TTS]** 修复 `URL.createObjectURL` 在 React Native 不可用问题
- **[TTS]** 修复 `expo-file-system` v54 API 变更问题
- **[TTS]** 修复文本发送后未调用 TTS 问题
- **[LLM]** 修复 API 错误信息不显示问题

### 📦 技术栈
- **后端**：FastAPI + SQLAlchemy Async + SQLite
- **前端**：React Native + Expo
- **LLM**：ModelScope + Kimi
- **TTS**：讯飞语音合成
- **ASR**：录音文件转文字
