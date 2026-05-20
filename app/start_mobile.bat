@echo off
chcp 65001 >nul
echo ========================================
echo       食光知己 - 移动端启动脚本
echo ========================================
echo.
echo  1. 快速启动 (仅Metro热更新，APK已安装时用)
echo  2. 完整构建 (重新构建并安装APK)
echo.
set /p MODE="请选择 [1/2] (默认1): "

if "%MODE%"=="" set MODE=1

:: 获取本机IP地址
echo.
echo [1/2] 正在获取本机IP地址...

for /f "tokens=*" %%i in ('powershell -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and $_.IPAddress -notmatch '^127' -and $_.IPAddress -notmatch '^169\.254' } | Select-Object -First 1 -ExpandProperty IPAddress"') do set LOCAL_IP=%%i

if "%LOCAL_IP%"=="" (
    echo [警告] 无法自动获取有效IP，请手动检查网络连接
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

:: 启动
echo [2/2] 正在启动...
echo.
echo ========================================
echo  请确保手机与电脑在同一WiFi网络
echo ========================================
echo.
echo  后端地址: http://%LOCAL_IP%:8000
echo.
echo  App 启动后会自动扫描局域网发现后端
echo  如自动连接失败，请在登录页手动输入:
echo  %LOCAL_IP%:8000
echo.
echo  按 Ctrl+C 可以停止服务
echo ========================================
echo.

cd /d "%~dp0"

if "%MODE%"=="2" (
    echo [模式] 完整构建并安装APK...
    npx expo run:android
    if %ERRORLEVEL% neq 0 (
        echo.
        echo ========================================
        echo  [错误] 构建失败，错误代码: %ERRORLEVEL%
        echo ========================================
        echo.
        echo  常见原因:
        echo  1. 未执行 npx expo prebuild
        echo  2. Android设备未连接或ADB未识别
        echo  3. Gradle构建失败
        echo  4. 代理未配置 (xdcobra.github.io需要代理)
        echo ========================================
    )
) else (
    echo [模式] 快速启动 (Metro热更新)...
    npx expo start
)

echo.
pause
