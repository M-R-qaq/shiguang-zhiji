@echo off
chcp 65001 >nul
echo ============================================================
echo          Shi Guang Zhi Ji - Environment Setup
echo ============================================================
echo.

REM Set Miniconda path
set MINICONDA_PATH=D:\3.Software\Miniconda

REM Check Miniconda
if not exist "%MINICONDA_PATH%\Scripts\conda.exe" (
    echo [ERROR] Miniconda not found!
    echo Please install from: https://docs.anaconda.com/miniconda/
    pause
    exit /b 1
)

echo [OK] Miniconda installed
"%MINICONDA_PATH%\Scripts\conda.exe" --version
echo.

echo ============================================================
echo Configure pip mirror...
echo ============================================================
if exist "%USERPROFILE%\pip\pip.ini" (
    move "%USERPROFILE%\pip\pip.ini" "%USERPROFILE%\pip\pip.ini.bak" 2>nul
)
if not exist "%USERPROFILE%\pip" mkdir "%USERPROFILE%\pip"
copy pip.conf "%USERPROFILE%\pip\pip.ini" >nul
echo [OK] pip mirror configured (Tsinghua)
echo.

echo ============================================================
echo Configure conda mirror...
echo ============================================================
"%MINICONDA_PATH%\Scripts\conda.exe" config --set show_channel_urls yes
copy conda.conf "%USERPROFILE%\.condarc" >nul
echo [OK] conda mirror configured (Tsinghua)
echo.

echo ============================================================
echo Check GraPro environment...
echo ============================================================
"%MINICONDA_PATH%\Scripts\conda.exe" env list | findstr /i "GraPro" >nul
if %errorlevel% equ 0 (
    echo [OK] GraPro environment exists
) else (
    echo [INFO] Creating GraPro environment (Python 3.10)...
    "%MINICONDA_PATH%\Scripts\conda.exe" create -n GraPro python=3.10 -y
    echo [OK] GraPro environment created
)
echo.

echo ============================================================
echo Configure model download mirror...
echo ============================================================
set HF_ENDPOINT=https://hf-mirror.com
echo [OK] HuggingFace mirror configured
echo.

echo ============================================================
echo Install Python dependencies...
echo ============================================================
call "%MINICONDA_PATH%\Scripts\activate.bat" GraPro
if %errorlevel% neq 0 (
    echo [ERROR] Environment activation failed
    pause
    exit /b 1
)

REM Upgrade pip using python -m pip
python -m pip install --upgrade pip

REM Install setuptools first (required for whisper)
echo [INFO] Installing setuptools and wheel...
python -m pip install setuptools wheel

REM Install dependencies
echo [INFO] Installing backend dependencies...
python -m pip install -r backend/requirements.txt

REM Install additional dependencies
echo [INFO] Installing additional dependencies...
python -m pip install email-validator python-jose[cryptography] passlib[bcrypt] bcrypt sqlalchemy

echo.

echo ============================================================
echo Check ffmpeg...
echo ============================================================
set FFMPEG_PATH=C:\Users\wjq29\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin
if exist "%FFMPEG_PATH%\ffmpeg.exe" (
    echo [OK] ffmpeg found at: %FFMPEG_PATH%
    echo [INFO] PATH has been configured in backend/start.bat
) else (
    echo [WARNING] ffmpeg not found
    echo [INFO] If you need ffmpeg, run:
    echo        winget install Gyan.FFmpeg
)
echo.

echo ============================================================
echo          Environment Setup Complete!
echo ============================================================
echo.
echo Next Steps:
echo 1. Configure backend (.env file)
echo    cd backend
echo    copy .env.example .env
echo    edit .env with your API key
echo.
echo 2. Start backend server
echo    cd backend
echo    start.bat
echo.
echo 3. Start mobile APP
echo    cd app
echo    npm install
echo    npm start
echo.
pause