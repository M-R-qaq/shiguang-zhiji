@echo off
chcp 65001 >nul 2>&1
echo ============================================================
echo          Shi Guang Zhi Ji Backend Server
echo ============================================================
echo.

REM Set Miniconda path
set MINICONDA_PATH=D:\3.Software\Miniconda

REM Set HuggingFace mirror (for Whisper model download)
set HF_ENDPOINT=https://hf-mirror.com

REM Add ffmpeg to PATH
set FFMPEG_PATH=C:\Users\wjq29\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin
set PATH=%FFMPEG_PATH%;%PATH%

REM Activate conda environment
echo [INFO] Activating GraPro environment...
call "%MINICONDA_PATH%\Scripts\activate.bat" GraPro 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Environment activation failed. Run setup.bat first.
    pause
    exit /b 1
)

echo [OK] Environment activated
python --version
echo.

REM Check ffmpeg
where ffmpeg >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] ffmpeg is installed
) else (
    echo [WARNING] ffmpeg not found in PATH
)
echo.

REM Check .env file
if not exist ".env" (
    echo [WARNING] .env file not found
    if exist ".env.example" (
        echo [INFO] Copying .env.example to .env...
        copy .env.example .env
        echo [INFO] Please edit .env and configure your API settings
        echo.
    )
)

REM Check API configuration
findstr /C:"OPENAI_API_KEY=your" .env >nul 2>&1
if %errorlevel% equ 0 (
    echo [WARNING] Please configure your API key in .env file
    echo.
)

REM Start server
echo ============================================================
echo [INFO] Starting backend server...
echo ============================================================
echo.
echo After server starts, visit:
echo   - API Docs: http://localhost:8000/docs
echo   - Health Check: http://localhost:8000/health
echo.

python main.py

pause