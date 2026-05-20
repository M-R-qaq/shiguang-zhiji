import subprocess
import os
import tempfile
from core.config import settings


def convert_wav_to_mp3(wav_bytes: bytes, bitrate: str = "128k") -> bytes:
    input_fd, input_path = tempfile.mkstemp(suffix=".wav")
    output_fd, output_path = tempfile.mkstemp(suffix=".mp3")
    try:
        with os.fdopen(input_fd, "wb") as f:
            f.write(wav_bytes)
        os.close(output_fd)

        result = subprocess.run(
            ["ffmpeg", "-y", "-i", input_path, "-b:a", bitrate, "-f", "mp3", output_path],
            capture_output=True,
            timeout=30,
        )
        if result.returncode != 0:
            return wav_bytes

        with open(output_path, "rb") as f:
            return f.read()
    except Exception:
        return wav_bytes
    finally:
        for path in (input_path, output_path):
            if os.path.exists(path):
                os.remove(path)


def convert_to_target_format(
    audio_bytes: bytes,
    source_format: str,
    target_format: str = None,
    bitrate: str = "128k",
) -> tuple[bytes, str]:
    if target_format is None:
        target_format = settings.TTS_AUDIO_FORMAT

    if source_format == target_format:
        return audio_bytes, source_format

    if source_format == "wav" and target_format == "mp3":
        converted = convert_wav_to_mp3(audio_bytes, bitrate=bitrate)
        actual_format = "mp3" if converted is not audio_bytes else "wav"
        return converted, actual_format

    return audio_bytes, source_format


def is_ffmpeg_available() -> bool:
    try:
        result = subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=5)
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False
