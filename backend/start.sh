#!/bin/bash

# 食光知己后端服务启动脚本

echo "🚀 启动食光知己后端服务..."

# 检查Python环境
if ! command -v python &> /dev/null; then
    echo "❌ Python未安装"
    exit 1
fi

# 安装依赖
echo "📦 安装依赖..."
pip install -r requirements.txt

# 设置环境变量（可选）
# export OPENAI_API_KEY="your-api-key"

# 启动服务
echo "🌟 启动服务..."
python main.py