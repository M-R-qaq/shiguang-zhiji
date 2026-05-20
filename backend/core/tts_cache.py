import hashlib
import os
import time
from typing import Optional

import aiosqlite

from core.config import settings

CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "tts_cache")
INDEX_DB_PATH = os.path.join(CACHE_DIR, "index.db")

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS tts_cache (
    text_hash TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    voice TEXT NOT NULL,
    file_path TEXT NOT NULL,
    format TEXT NOT NULL,
    created_at REAL NOT NULL,
    last_accessed REAL NOT NULL,
    size_bytes INTEGER NOT NULL
)
"""


class TTSCache:
    def __init__(self):
        self._db: Optional[aiosqlite.Connection] = None

    async def initialize(self):
        os.makedirs(CACHE_DIR, exist_ok=True)
        self._db = await aiosqlite.connect(INDEX_DB_PATH)
        self._db.row_factory = aiosqlite.Row
        await self._db.execute(CREATE_TABLE_SQL)
        await self._db.commit()

    def _compute_key(self, text: str, provider: str, voice: str) -> str:
        raw = f"{text}{provider}{voice}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]

    async def get(self, text: str, provider: str, voice: str) -> Optional[dict]:
        if not settings.TTS_CACHE_ENABLED:
            return None

        cache_key = self._compute_key(text, provider, voice)

        async with self._db.execute(
            "SELECT * FROM tts_cache WHERE text_hash = ?", (cache_key,)
        ) as cursor:
            row = await cursor.fetchone()

        if row is None:
            return None

        now = time.time()
        if now - row["created_at"] > settings.TTS_CACHE_TTL:
            file_path = row["file_path"]
            if os.path.exists(file_path):
                os.remove(file_path)
            await self._db.execute(
                "DELETE FROM tts_cache WHERE text_hash = ?", (cache_key,)
            )
            await self._db.commit()
            return None

        if not os.path.exists(row["file_path"]):
            await self._db.execute(
                "DELETE FROM tts_cache WHERE text_hash = ?", (cache_key,)
            )
            await self._db.commit()
            return None

        await self._db.execute(
            "UPDATE tts_cache SET last_accessed = ? WHERE text_hash = ?",
            (now, cache_key),
        )
        await self._db.commit()

        with open(row["file_path"], "rb") as f:
            audio_bytes = f.read()

        return {
            "audio_bytes": audio_bytes,
            "format": row["format"],
            "cached": True,
        }

    async def put(
        self,
        text: str,
        provider: str,
        voice: str,
        audio_bytes: bytes,
        audio_format: str = "mp3",
    ) -> None:
        if not settings.TTS_CACHE_ENABLED:
            return

        cache_key = self._compute_key(text, provider, voice)
        file_name = f"{cache_key}.{audio_format}"
        file_path = os.path.join(CACHE_DIR, file_name)

        with open(file_path, "wb") as f:
            f.write(audio_bytes)

        now = time.time()
        size_bytes = len(audio_bytes)

        await self._db.execute(
            """
            INSERT INTO tts_cache (text_hash, provider, voice, file_path, format, created_at, last_accessed, size_bytes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(text_hash) DO UPDATE SET
                provider = excluded.provider,
                voice = excluded.voice,
                file_path = excluded.file_path,
                format = excluded.format,
                created_at = excluded.created_at,
                last_accessed = excluded.last_accessed,
                size_bytes = excluded.size_bytes
            """,
            (cache_key, provider, voice, file_path, audio_format, now, now, size_bytes),
        )
        await self._db.commit()

        await self.evict_lru()

    async def evict_lru(self) -> None:
        max_entries = settings.TTS_CACHE_MAX_ENTRIES

        async with self._db.execute(
            "SELECT COUNT(*) as cnt FROM tts_cache"
        ) as cursor:
            row = await cursor.fetchone()
        count = row["cnt"]

        if count <= max_entries:
            return

        excess = count - max_entries

        async with self._db.execute(
            "SELECT text_hash, file_path FROM tts_cache ORDER BY last_accessed ASC LIMIT ?",
            (excess,),
        ) as cursor:
            rows = await cursor.fetchall()

        for row in rows:
            file_path = row["file_path"]
            if os.path.exists(file_path):
                os.remove(file_path)
            await self._db.execute(
                "DELETE FROM tts_cache WHERE text_hash = ?", (row["text_hash"],)
            )

        await self._db.commit()

    async def close(self):
        if self._db is not None:
            await self._db.close()
            self._db = None


tts_cache = TTSCache()
