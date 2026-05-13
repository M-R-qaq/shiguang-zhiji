@echo off
chcp 65001 >nul
echo ========================================
echo       食光知己 - 移动端启动脚本
echo ========================================
echo.

:: 获取本机IP地址
echo [1/3] 正在获取本机IP地址...

:: 使用PowerShell获取IPv4地址（排除Loopback和链路本地地址169.254.x.x）
for /f "tokens=*" %%i in ('powershell -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and $_.IPAddress -notmatch '^127' -and $_.IPAddress -notmatch '^169\.254' } | Select-Object -First 1 -ExpandProperty IPAddress"') do set LOCAL_IP=%%i

if "%LOCAL_IP%"=="" (
    echo [警告] 无法自动获取有效IP，请手动检查网络连接
    echo [提示] 确保电脑已连接到局域网WiFi或以太网
    echo.
    set /p MANUAL_IP="请手动输入本机IP地址: "
    if not "%MANUAL_IP%"=="" set LOCAL_IP=%MANUAL_IP%
)

if "%LOCAL_IP%"=="" (
    echo [错误] 未提供IP地址
    pause
    exit /b 1
)

echo [成功] 本机IP: %LOCAL_IP%
echo.

:: 更新api.ts中的API地址
echo [2/3] 正在更新API配置...

set API_FILE=%~dp0src\services\api.ts
if exist "%API_FILE%" (
    powershell -Command "(Get-Content '%API_FILE%') -replace 'const API_BASE_URL = .*', \"const API_BASE_URL = 'http://%LOCAL_IP%:8000'\" | Set-Content '%API_FILE%'"
    echo [成功] API地址已更新为: http://%LOCAL_IP%:8000
) else (
    echo [警告] 找不到 api.ts 文件，跳过API配置更新
)
echo.

:: 启动Expo
echo [3/3] 正在启动Expo...
echo.
echo ========================================
echo  请确保手机与电脑在同一WiFi网络
echo ========================================
echo.
echo  连接方式：
echo  1. 手机打开 Expo Go
echo  2. 扫描下方显示的二维码
echo.
echo  手动输入地址：
echo  exp://%LOCAL_IP%:8081
echo.
echo  按 Ctrl+C 可以停止服务
echo ========================================
echo.
cd /d "%~dp0"
npx expo start

pause