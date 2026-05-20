import asyncio
import time
import logging
from core.config import settings

logger = logging.getLogger(__name__)


class TTSProviderManager:
    def __init__(self):
        self.providers = {}
        self.current_provider = settings.TTS_PROVIDER
        self.fallback_order = settings.TTS_FALLBACK_ORDER.split(",")
        self._consecutive_failures = {}
        self._consecutive_successes = {}
        self._health_task = None
        self._initialized = False

    def _init_providers(self):
        for p in self.fallback_order:
            self.providers[p] = {
                "healthy": True,
                "last_check": 0,
                "avg_response_time": 0,
                "check_count": 0,
            }
            self._consecutive_failures[p] = 0
            self._consecutive_successes[p] = 0

    async def start_health_check(self):
        if not self._initialized:
            self._init_providers()
            self._initialized = True

        if settings.TTS_HEALTH_CHECK_INTERVAL > 0:
            self._health_task = asyncio.create_task(self._health_check_loop())
            logger.info(f"[TTS Health] 健康检测已启动 (间隔 {settings.TTS_HEALTH_CHECK_INTERVAL}s)")

    async def stop_health_check(self):
        if self._health_task:
            self._health_task.cancel()
            try:
                await self._health_task
            except asyncio.CancelledError:
                pass

    async def _health_check_loop(self):
        while True:
            try:
                await asyncio.sleep(settings.TTS_HEALTH_CHECK_INTERVAL)
                for provider_name in list(self.providers.keys()):
                    if self.providers[provider_name]["healthy"]:
                        await self._check_provider(provider_name)
                    else:
                        await self._check_provider(provider_name)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[TTS Health] 检测循环错误: {e}")
                await asyncio.sleep(60)

    async def _check_provider(self, provider_name: str):
        test_text = "你好"
        start_time = time.time()

        try:
            from api.tts import iflytek_tts_ws, mimo_tts, openai_tts

            if provider_name == "iflytek_ws":
                await iflytek_tts_ws(test_text)
            elif provider_name == "mimo":
                await mimo_tts(test_text)
            elif provider_name == "openai":
                await openai_tts(test_text)
            else:
                return

            elapsed = time.time() - start_time
            self._update_provider_health(provider_name, True, elapsed)

        except Exception as e:
            self._update_provider_health(provider_name, False, 0)

    def _update_provider_health(self, provider_name: str, success: bool, response_time: float):
        info = self.providers.get(provider_name)
        if not info:
            return

        if success:
            self._consecutive_failures[provider_name] = 0
            self._consecutive_successes[provider_name] = self._consecutive_successes.get(provider_name, 0) + 1

            info["check_count"] += 1
            prev_avg = info["avg_response_time"]
            count = info["check_count"]
            info["avg_response_time"] = prev_avg + (response_time - prev_avg) / count
            info["last_check"] = time.time()

            if not info["healthy"] and self._consecutive_successes[provider_name] >= 3:
                info["healthy"] = True
                logger.info(f"[TTS Health] {provider_name} 恢复健康，切回原提供商")
                if self.current_provider != provider_name:
                    self.current_provider = provider_name
        else:
            self._consecutive_failures[provider_name] = self._consecutive_failures.get(provider_name, 0) + 1
            self._consecutive_successes[provider_name] = 0

            if self._consecutive_failures[provider_name] >= 3:
                info["healthy"] = False
                logger.warning(f"[TTS Health] {provider_name} 标记为不健康")
                self._fallback_to_next()

    def _fallback_to_next(self):
        current_idx = -1
        for i, p in enumerate(self.fallback_order):
            if p == self.current_provider:
                current_idx = i
                break

        for i in range(1, len(self.fallback_order)):
            next_idx = (current_idx + i) % len(self.fallback_order)
            next_provider = self.fallback_order[next_idx]
            if next_provider in self.providers and self.providers[next_provider]["healthy"]:
                old = self.current_provider
                self.current_provider = next_provider
                logger.info(f"[TTS Health] 降级: {old} → {next_provider}")
                return

    def get_active_provider(self) -> str:
        return self.current_provider

    def mark_failure(self, provider_name: str):
        self._update_provider_health(provider_name, False, 0)

    def mark_success(self, provider_name: str, response_time: float):
        self._update_provider_health(provider_name, True, response_time)

    def get_status(self) -> dict:
        return {
            "current_provider": self.current_provider,
            "providers": {
                name: {
                    "healthy": info["healthy"],
                    "avg_response_time": round(info["avg_response_time"], 3),
                    "consecutive_failures": self._consecutive_failures.get(name, 0),
                }
                for name, info in self.providers.items()
            }
        }


tts_provider_manager = TTSProviderManager()
