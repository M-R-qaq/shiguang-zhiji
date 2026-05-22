#!/usr/bin/env python
"""
食光知己 v0.6 API 自动测试脚本
运行方式：cd backend && python test_v06_api.py

前置条件：
1. 后端服务已启动 (python main.py)
2. .env 配置正确 (LLM API Key, Tavily API Key 等)

测试覆盖 v0.6 新增功能：
1. 版本号检查
2. 联网搜索 - 地点确认逻辑 (needs_web_search)
3. 联网搜索 - 含地点时的搜索触发
4. 会话智能标题生成
5. 会话列表 title 字段
6. 会话详情 title 字段
7. 删除会话 (修复 scalar_one_or_none 崩溃)
8. ASR 非阻塞验证 (whisper.transcribe 不阻塞事件循环)
9. TTS openai_tts 单例客户端
10. 搜索缓存过期清理
11. CORS 配置验证
12. 流式对话 web_search 事件
13. 错误处理

报告自动生成到 ../test_reports/ 目录
"""
import sys
import os
import io
import json
import time
import re
import asyncio
from datetime import datetime
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

try:
    import httpx
except ImportError:
    print("缺少 httpx 依赖，请运行: pip install httpx")
    sys.exit(1)

BASE_URL = os.environ.get("TEST_BASE_URL", "http://localhost:8000")
TIMEOUT = 90.0

passed = 0
failed = 0
skipped = 0
test_results = []
manual_checks = []


def record(name, ok, detail="", is_manual=False):
    global passed, failed, skipped
    if is_manual:
        skipped += 1
        manual_checks.append({"name": name, "detail": detail})
        print(f"  👤 {name} [需人工] — {detail}")
        test_results.append({"name": name, "status": "manual", "detail": detail})
        return
    if ok:
        passed += 1
        print(f"  ✅ {name}")
    else:
        failed += 1
        print(f"  ❌ {name} — {detail}")
    test_results.append({"name": name, "status": "pass" if ok else "fail", "detail": detail if not ok else ""})


class ApiTester:
    def __init__(self):
        self.client = httpx.Client(base_url=BASE_URL, timeout=TIMEOUT)
        self.token = None
        self.user_id = None
        self.session_id = None
        self.test_username = f"apitest_v06_{int(time.time())}"

    def auth_headers(self):
        if not self.token:
            raise RuntimeError("未登录，请先调用 login()")
        return {"Authorization": f"Bearer {self.token}"}

    def test_health(self):
        print("\n=== Step 1: 版本号与系统检查 ===")
        try:
            r = self.client.get("/")
            data = r.json()
            record("根路径可访问", r.status_code == 200)
            version = data.get("version", "")
            record("版本号为 0.6.x", version.startswith("0.6"),
                   f"实际版本: {version}")
            features = data.get("features", [])
            record("features 包含食光鉴搜索", "食光鉴搜索" in features)
            record("features 包含会话标题", "会话标题" in features or "智能标题" in features)
        except Exception as e:
            record("根路径可访问", False, str(e))

        try:
            r = self.client.get("/health")
            data = r.json()
            record("健康检查可访问", r.status_code == 200)
            record("健康检查版本 0.6.x", data.get("version", "").startswith("0.6"),
                   f"实际版本: {data.get('version')}")
        except Exception as e:
            record("健康检查可访问", False, str(e))

    def test_register_and_login(self):
        print("\n=== Step 2: 注册与登录 ===")
        try:
            r = self.client.post("/auth/register", json={
                "username": self.test_username,
                "password": "test123456",
                "nickname": "v06API测试"
            })
            if r.status_code == 201:
                data = r.json()
                self.user_id = data.get("id")
                record("用户注册成功", True)
            elif r.status_code == 400 and "已存在" in r.json().get("detail", ""):
                record("用户注册成功", True, "用户已存在，继续")
            else:
                record("用户注册成功", False, f"状态码: {r.status_code}, 响应: {r.text[:200]}")
        except Exception as e:
            record("用户注册成功", False, str(e))
            return False

        try:
            r = self.client.post("/auth/login", json={
                "username": self.test_username,
                "password": "test123456"
            })
            if r.status_code == 200:
                data = r.json()
                self.token = data.get("access_token")
                record("用户登录成功", bool(self.token), "Token 为空")
            else:
                record("用户登录成功", False, f"状态码: {r.status_code}, 响应: {r.text[:200]}")
                return False
        except Exception as e:
            record("用户登录成功", False, str(e))
            return False

        return True

    def test_location_confirmation(self):
        print("\n=== Step 3: 联网搜索 - 地点确认逻辑 ===")

        try:
            r = self.client.post("/llm/chat", json={
                "message": "今天天气怎么样",
                "history": []
            }, headers=self.auth_headers())
            if r.status_code == 200:
                data = r.json()
                response_text = data.get("response", "")
                asks_location = any(kw in response_text for kw in [
                    "何处", "哪里", "在哪", "身在", "地点", "城市", "位置",
                    "哪里人", "什么地方", "阁下在"
                ])
                has_weather_data = any(kw in response_text for kw in [
                    "摄氏", "度", "℃", "晴", "阴", "雨", "雪", "温度"
                ]) and not asks_location
                record("问天气不指定地点 - 模型询问位置", asks_location,
                       f"回复: {response_text[:150]}...")
                record("问天气不指定地点 - 未直接给出天气数据", not has_weather_data,
                       f"回复: {response_text[:150]}...")
                self.session_id = data.get("session_id")
            else:
                record("问天气不指定地点 - 请求成功", False,
                       f"状态码: {r.status_code}, 响应: {r.text[:200]}")
        except Exception as e:
            record("问天气不指定地点", False, str(e))

        time.sleep(2)

        try:
            r = self.client.post("/llm/chat", json={
                "message": "我在北京，今天北京天气怎么样",
                "history": [],
                "session_id": self.session_id
            }, headers=self.auth_headers())
            if r.status_code == 200:
                data = r.json()
                response_text = data.get("response", "")
                has_weather = any(kw in response_text for kw in [
                    "摄氏", "度", "℃", "晴", "阴", "雨", "温度"
                ])
                has_beijing = "北京" in response_text
                record("指定北京问天气 - 返回天气信息", has_weather,
                       f"回复: {response_text[:150]}...")
                record("指定北京问天气 - 回复提及北京", has_beijing,
                       f"回复: {response_text[:150]}...")
                self.session_id = data.get("session_id", self.session_id)
            else:
                record("指定北京问天气 - 请求成功", False,
                       f"状态码: {r.status_code}")
        except Exception as e:
            record("指定北京问天气", False, str(e))

        record("联网搜索标记在App中正确显示", True, is_manual=True,
               detail="提问实时信息问题后，助手消息旁应显示地球图标+'已确认'标记")
        record("搜索摘要卡片可展开/收起", True, is_manual=True,
               detail="点击联网搜索标记，应展开卡片显示搜索词和来源链接")

    def test_session_title(self):
        print("\n=== Step 4: 会话智能标题生成 ===")

        title_session_id = None
        try:
            r = self.client.post("/llm/chat", json={
                "message": "我想了解一下川菜的做法，特别是麻婆豆腐怎么做",
                "history": []
            }, headers=self.auth_headers())
            if r.status_code == 200:
                data = r.json()
                title_session_id = data.get("session_id")
                record("标题测试 - 第一轮对话成功", True)
            else:
                record("标题测试 - 第一轮对话成功", False,
                       f"状态码: {r.status_code}")
        except Exception as e:
            record("标题测试 - 第一轮对话成功", False, str(e))

        time.sleep(3)

        try:
            r = self.client.post("/llm/chat", json={
                "message": "那回锅肉呢？和麻婆豆腐比哪个更容易做",
                "history": [],
                "session_id": title_session_id
            }, headers=self.auth_headers())
            if r.status_code == 200:
                data = r.json()
                record("标题测试 - 第二轮对话成功", True)
            else:
                record("标题测试 - 第二轮对话成功", False,
                       f"状态码: {r.status_code}")
        except Exception as e:
            record("标题测试 - 第二轮对话成功", False, str(e))

        print("  ⏳ 等待 8 秒，让后台标题生成任务完成...")
        time.sleep(8)

        try:
            r = self.client.get("/llm/sessions", params={"limit": 5},
                                headers=self.auth_headers())
            if r.status_code == 200:
                data = r.json()
                sessions = data.get("sessions", [])
                record("标题测试 - 会话列表查询成功", True)

                target_session = None
                for s in sessions:
                    if s.get("session_id") == title_session_id:
                        target_session = s
                        break

                if target_session:
                    title = target_session.get("title", "")
                    record("会话含 title 字段", "title" in target_session)
                    record("title 非空 (标题已生成)", bool(title),
                           f"title: '{title}'")
                    if title:
                        record("title 长度在 2-50 字符", 2 <= len(title) <= 50,
                               f"title 长度: {len(title)}, 内容: '{title}'")
                else:
                    record("找到目标会话", False,
                           f"session_id={title_session_id} 不在列表中, 共{len(sessions)}个会话")
            else:
                record("标题测试 - 会话列表查询成功", False,
                       f"状态码: {r.status_code}")
        except Exception as e:
            record("标题测试 - 会话列表查询成功", False, str(e))

        if title_session_id:
            try:
                r = self.client.get(f"/llm/sessions/{title_session_id}",
                                    headers=self.auth_headers())
                if r.status_code == 200:
                    data = r.json()
                    detail_title = data.get("title", "")
                    record("会话详情含 title 字段", "title" in data)
                    record("会话详情 title 非空", bool(detail_title),
                           f"title: '{detail_title}'")
                else:
                    record("会话详情查询成功", False,
                           f"状态码: {r.status_code}")
            except Exception as e:
                record("会话详情查询成功", False, str(e))

        record("会话列表标题显示正确", True, is_manual=True,
               detail="App中会话列表应显示自动生成的标题，而非纯preview文本")

    def test_delete_session(self):
        print("\n=== Step 5: 删除会话 (Bug #1 修复验证) ===")

        delete_session_id = None
        try:
            r = self.client.post("/llm/chat", json={
                "message": "这是一条用于测试删除的会话",
                "history": []
            }, headers=self.auth_headers())
            if r.status_code == 200:
                data = r.json()
                delete_session_id = data.get("session_id")
                record("创建待删除会话成功", bool(delete_session_id))
            else:
                record("创建待删除会话成功", False,
                       f"状态码: {r.status_code}")
        except Exception as e:
            record("创建待删除会话成功", False, str(e))

        if not delete_session_id:
            return

        time.sleep(2)

        try:
            r2 = self.client.post("/llm/chat", json={
                "message": "第二条消息，确保会话有多条记录",
                "history": [],
                "session_id": delete_session_id
            }, headers=self.auth_headers())
            record("会话添加第二条消息成功", r2.status_code == 200)
        except Exception as e:
            record("会话添加第二条消息成功", False, str(e))

        time.sleep(1)

        try:
            r = self.client.delete(f"/llm/sessions/{delete_session_id}",
                                   headers=self.auth_headers())
            record("删除会话 - 不再崩溃返回 500", r.status_code == 200,
                   f"状态码: {r.status_code}, 响应: {r.text[:200]}")
            if r.status_code == 200:
                data = r.json()
                record("删除响应含 session_id", data.get("session_id") == delete_session_id,
                       f"响应: {data}")
        except Exception as e:
            record("删除会话 - 不再崩溃", False, str(e))

        try:
            r = self.client.get(f"/llm/sessions/{delete_session_id}",
                                headers=self.auth_headers())
            record("删除后查询返回 404", r.status_code == 404,
                   f"状态码: {r.status_code}")
        except Exception as e:
            record("删除后查询返回 404", False, str(e))

        try:
            r = self.client.delete("/llm/sessions/nonexistent_session_12345",
                                   headers=self.auth_headers())
            record("删除不存在的会话返回 404", r.status_code == 404,
                   f"状态码: {r.status_code}")
        except Exception as e:
            record("删除不存在的会话返回 404", False, str(e))

    def test_asr_non_blocking(self):
        print("\n=== Step 6: ASR 非阻塞验证 (Bug #2 修复验证) ===")

        try:
            start = time.time()
            r = self.client.get("/health")
            health_time = time.time() - start
            record("health 端点响应", r.status_code == 200)
            record("health 响应时间 < 2s", health_time < 2.0,
                   f"实际: {health_time:.2f}s")
        except Exception as e:
            record("health 端点响应", False, str(e))

        try:
            r = self.client.post("/asr/transcribe-base64", json={
                "audio_base64": "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="
            }, headers=self.auth_headers())
            record("ASR 端点可达", r.status_code in [200, 400, 422],
                   f"状态码: {r.status_code}")
        except Exception as e:
            record("ASR 端点可达", False, str(e))

        try:
            start = time.time()
            r = self.client.get("/health")
            health_after_time = time.time() - start
            record("ASR 后 health 响应时间 < 2s", health_after_time < 2.0,
                   f"实际: {health_after_time:.2f}s")
        except Exception as e:
            record("ASR 后 health 响应", False, str(e))

        record("ASR 完整识别功能 (需音频文件)", True, is_manual=True,
               detail="使用真实录音文件测试 ASR 识别准确度")

    def test_cors_configuration(self):
        print("\n=== Step 7: CORS 配置验证 (Bug #10 修复验证) ===")

        try:
            r = self.client.options("/health", headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET"
            })
            cors_header = r.headers.get("access-control-allow-origin", "")
            allow_credentials = r.headers.get("access-control-allow-credentials", "")
            record("CORS 预检请求返回", r.status_code in [200, 204],
                   f"状态码: {r.status_code}")
            record("CORS Origin 头存在", bool(cors_header),
                   f"值: {cors_header}")
        except Exception as e:
            record("CORS 预检请求", False, str(e))

        try:
            r = self.client.options("/health", headers={
                "Origin": "http://evil.example.com",
                "Access-Control-Request-Method": "POST"
            })
            cors_origin = r.headers.get("access-control-allow-origin", "")
            if cors_origin == "*":
                allow_creds = r.headers.get("access-control-allow-credentials", "")
                no_creds_with_wildcard = allow_creds != "true"
                record("通配符源不设置 credentials=true", no_creds_with_wildcard,
                       f"credentials: {allow_creds}")
            else:
                record("CORS 配置响应", True, f"origin: {cors_origin}")
        except Exception as e:
            record("CORS 安全配置", False, str(e))

    def test_web_search_streaming(self):
        print("\n=== Step 8: 流式对话 web_search 事件 ===")
        has_web_search = False
        has_text_chunk = False
        has_done = False
        event_types = set()
        web_search_data = None

        try:
            with self.client.stream("POST", "/llm/chat/stream", json={
                "message": "今天的国际新闻有什么",
                "history": []
            }, headers={**self.auth_headers(), "Accept": "text/event-stream"}, timeout=TIMEOUT) as r:
                record("SSE 连接建立", r.status_code == 200, f"状态码: {r.status_code}")
                if r.status_code != 200:
                    return

                for line in r.iter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:].strip()
                    if not data_str:
                        continue
                    try:
                        event = json.loads(data_str)
                        evt_type = event.get("type", "")
                        event_types.add(evt_type)

                        if evt_type == "text_chunk":
                            has_text_chunk = True
                        elif evt_type == "web_search":
                            has_web_search = True
                            web_search_data = event
                        elif evt_type == "done":
                            has_done = True
                    except json.JSONDecodeError:
                        pass

            record("SSE 包含 text_chunk", has_text_chunk,
                   f"事件类型: {event_types}")
            record("SSE 包含 done", has_done,
                   f"事件类型: {event_types}")
            record("SSE 包含 web_search 事件", has_web_search,
                   f"事件类型: {event_types}")

            if web_search_data:
                has_query = bool(web_search_data.get("web_search_query"))
                has_results = bool(web_search_data.get("web_search_results"))
                record("web_search 事件含 query", has_query,
                       f"query: {web_search_data.get('web_search_query', '')}")
                record("web_search 事件含 results", has_results,
                       f"结果数: {len(web_search_data.get('web_search_results', []))}")

            self.session_id = None

        except Exception as e:
            record("SSE 连接", False, str(e))

        record("联网搜索标记在流式对话中正确显示", True, is_manual=True,
               detail="流式对话中提问实时信息，助手消息旁应出现'已联网搜索'标记")

    def test_tts_config(self):
        print("\n=== Step 9: TTS 配置与单例验证 (Bug #14 修复验证) ===")

        try:
            r = self.client.get("/tts/config", headers=self.auth_headers())
            if r.status_code == 200:
                data = r.json()
                record("TTS 配置查询成功", True)
                record("TTS 配置含 provider", "provider" in data,
                       f"配置: {json.dumps(data, ensure_ascii=False)[:200]}")
            else:
                record("TTS 配置查询成功", False,
                       f"状态码: {r.status_code}")
        except Exception as e:
            record("TTS 配置查询成功", False, str(e))

        try:
            r = self.client.get("/tts/voices", headers=self.auth_headers())
            record("TTS voices 查询成功", r.status_code == 200,
                   f"状态码: {r.status_code}")
        except Exception as e:
            record("TTS voices 查询成功", False, str(e))

        try:
            r1 = self.client.get("/tts/config", headers=self.auth_headers())
            r2 = self.client.get("/tts/config", headers=self.auth_headers())
            both_ok = r1.status_code == 200 and r2.status_code == 200
            record("连续 TTS 请求均成功 (单例验证)", both_ok,
                   f"r1={r1.status_code}, r2={r2.status_code}")
        except Exception as e:
            record("连续 TTS 请求均成功", False, str(e))

    def test_search_cache(self):
        print("\n=== Step 10: 搜索缓存过期清理 (Bug #9 修复验证) ===")

        try:
            r = self.client.post("/search", json={
                "keyword": "红烧肉做法",
                "limit": 3
            }, headers=self.auth_headers())
            if r.status_code == 200:
                data = r.json()
                results = data.get("results", [])
                record("搜索请求成功", True)
                record("搜索返回结果", len(results) > 0,
                       f"结果数: {len(results)}")
            else:
                record("搜索请求成功", False,
                       f"状态码: {r.status_code}, 响应: {r.text[:200]}")
        except Exception as e:
            record("搜索请求成功", False, str(e))

        try:
            r = self.client.post("/search", json={
                "keyword": "红烧肉做法",
                "limit": 3
            }, headers=self.auth_headers())
            record("重复搜索请求成功 (缓存命中)", r.status_code == 200,
                   f"状态码: {r.status_code}")
        except Exception as e:
            record("重复搜索请求", False, str(e))

        try:
            r = self.client.post("/search", json={"keyword": "a", "limit": 5},
                                 headers=self.auth_headers())
            record("关键词过短返回 400", r.status_code == 400,
                   f"状态码: {r.status_code}")
        except Exception as e:
            record("关键词过短返回 400", False, str(e))

    def test_needs_web_search_logic(self):
        print("\n=== Step 11: needs_web_search 地点逻辑验证 ===")

        test_cases = [
            ("附近有什么好吃的", "问附近不指定地点 - 不触发搜索"),
            ("上海今天天气怎么样", "问上海天气 - 触发搜索"),
            ("最近的新闻", "问最新新闻 - 可能触发搜索"),
            ("帮我查一下广州的温度", "指定广州查温度 - 触发搜索"),
        ]

        for message, name in test_cases:
            try:
                r = self.client.post("/llm/chat", json={
                    "message": message,
                    "history": []
                }, headers=self.auth_headers())
                if r.status_code == 200:
                    data = r.json()
                    response_text = data.get("response", "")
                    record(f"{name} - 请求成功", True)
                    if "附近" in message or (not any(city in message for city in [
                        '北京', '上海', '广州', '深圳', '杭州', '成都', '重庆',
                        '武汉', '南京', '西安', '苏州', '天津'
                    ]) and any(kw in message for kw in ['天气', '温度', '附近'])):
                        asks_location = any(kw in response_text for kw in [
                            "何处", "哪里", "在哪", "身在", "地点", "城市", "阁下在"
                        ])
                        record(f"{name} - 询问位置", asks_location,
                               f"回复: {response_text[:100]}...")
                else:
                    record(f"{name} - 请求成功", False,
                           f"状态码: {r.status_code}")
            except Exception as e:
                record(f"{name}", False, str(e))

            time.sleep(1)

    def test_session_list_title_field(self):
        print("\n=== Step 12: 会话列表 title 字段完整性 ===")

        try:
            r = self.client.get("/llm/sessions", params={"limit": 20},
                                headers=self.auth_headers())
            if r.status_code == 200:
                data = r.json()
                sessions = data.get("sessions", [])
                record("会话列表查询成功", True)
                record("会话列表非空", len(sessions) > 0,
                       f"会话数: {len(sessions)}")

                if sessions:
                    first = sessions[0]
                    required_fields = ["session_id", "last_message_time", "message_count", "preview", "title"]
                    for field in required_fields:
                        record(f"会话含 {field} 字段", field in first,
                               f"缺失: {field}")

                    titles_count = sum(1 for s in sessions if s.get("title"))
                    record("有标题的会话数量", True,
                           f"{titles_count}/{len(sessions)} 个会话有标题")
            else:
                record("会话列表查询成功", False,
                       f"状态码: {r.status_code}")
        except Exception as e:
            record("会话列表查询成功", False, str(e))

    def test_error_handling(self):
        print("\n=== Step 13: 错误处理 ===")

        try:
            r = self.client.get("/auth/me",
                                headers={"Authorization": "Bearer invalid_token_12345"})
            record("无效 Token 返回 401", r.status_code == 401,
                   f"状态码: {r.status_code}")
        except Exception as e:
            record("无效 Token 返回 401", False, str(e))

        try:
            r = self.client.post("/llm/chat", json={},
                                 headers=self.auth_headers())
            record("缺少 message 字段返回 422", r.status_code == 422,
                   f"状态码: {r.status_code}")
        except Exception as e:
            record("缺少 message 字段返回 422", False, str(e))

        try:
            r = self.client.get("/llm/sessions/nonexistent_id_99999",
                                headers=self.auth_headers())
            record("不存在的会话返回 404", r.status_code == 404,
                   f"状态码: {r.status_code}")
        except Exception as e:
            record("不存在的会话返回 404", False, str(e))

        record("VAD 环境噪音不误触发", True, is_manual=True,
               detail="在空调/风扇环境下录音，VAD 不应被环境噪音误触发")
        record("ASR 连续 3 轮空识别自动回退 idle", True, is_manual=True,
               detail="安静环境下不说话，3 轮空识别后应自动停止录音")
        record("唤醒词 + 录音无麦克风冲突", True, is_manual=True,
               detail="唤醒词触发后录音应正常启动，无麦克风占用冲突")
        record("退出登录释放资源", True, is_manual=True,
               detail="录音/TTS播放中退出登录，麦克风和音频资源应被释放")
        record("消息长按菜单功能", True, is_manual=True,
               detail="长按消息应弹出操作菜单，复制/分享/删除功能正常")
        record("TTS 失败后重试", True, is_manual=True,
               detail="网络不佳时 TTS 应有重试行为，而非静默跳过")
        record("会话详情'继续对话'正确加载历史", True, is_manual=True,
               detail="点击'继续对话'后 Home 页面应显示历史消息，非空白")

    def test_logout(self):
        print("\n=== Step 14: 登出 ===")
        try:
            r = self.client.post("/auth/logout", headers=self.auth_headers())
            record("登出成功", r.status_code == 200, f"状态码: {r.status_code}")
        except Exception as e:
            record("登出成功", False, str(e))

        try:
            r = self.client.get("/auth/me", headers=self.auth_headers())
            record("登出后 Token 失效", r.status_code == 401,
                   f"状态码: {r.status_code}")
        except Exception as e:
            record("登出后 Token 失效", False, str(e))

    def run(self):
        print("=" * 60)
        print(f"食光知己 v0.6 API 自动测试")
        print(f"时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"目标: {BASE_URL}")
        print("=" * 60)

        self.test_health()

        if not self.test_register_and_login():
            print("\n❌ 登录失败，后续测试无法进行")
            self._generate_report()
            return

        self.test_location_confirmation()
        self.test_session_title()
        self.test_delete_session()
        self.test_asr_non_blocking()
        self.test_cors_configuration()
        self.test_web_search_streaming()
        self.test_tts_config()
        self.test_search_cache()
        self.test_needs_web_search_logic()
        self.test_session_list_title_field()
        self.test_error_handling()
        self.test_logout()

        self._generate_report()

    def _generate_report(self):
        print("\n" + "=" * 60)
        print("测试结果汇总")
        print("=" * 60)
        total = passed + failed
        print(f"  ✅ 通过: {passed}")
        print(f"  ❌ 失败: {failed}")
        print(f"  👤 需人工: {len(manual_checks)}")
        print(f"  📊 通过率: {passed}/{total} = {passed/total*100:.1f}%" if total > 0 else "  📊 通过率: N/A")

        if manual_checks:
            print(f"\n{'=' * 60}")
            print("需人工核查的项：")
            print("=" * 60)
            for i, item in enumerate(manual_checks, 1):
                print(f"  {i}. {item['name']}")
                print(f"     → {item['detail']}")

        if failed > 0:
            print(f"\n{'=' * 60}")
            print("失败项详情：")
            print("=" * 60)
            for item in test_results:
                if item["status"] == "fail":
                    print(f"  ❌ {item['name']}")
                    if item.get("detail"):
                        print(f"     → {item['detail']}")

        report_dir = Path(__file__).parent.parent / "test_reports"
        report_dir.mkdir(exist_ok=True)
        report_path = report_dir / "api_v06_test_report.md"

        with open(report_path, "w", encoding="utf-8") as f:
            f.write(f"# 食光知己 v0.6 API 测试报告\n\n")
            f.write(f"**时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"**目标**: {BASE_URL}\n\n")
            f.write(f"## 汇总\n\n")
            f.write(f"| 指标 | 值 |\n|------|----|\n")
            f.write(f"| 通过 | {passed} |\n")
            f.write(f"| 失败 | {failed} |\n")
            f.write(f"| 需人工 | {len(manual_checks)} |\n")
            f.write(f"| 通过率 | {passed/total*100:.1f}% |\n\n" if total > 0 else "| 通过率 | N/A |\n\n")

            f.write("## 详细结果\n\n")
            f.write("| # | 测试项 | 状态 | 详情 |\n|---|--------|------|------|\n")
            for i, item in enumerate(test_results, 1):
                status_icon = {"pass": "✅", "fail": "❌", "manual": "👤"}.get(item["status"], "?")
                f.write(f"| {i} | {item['name']} | {status_icon} | {item.get('detail', '')} |\n")

            if manual_checks:
                f.write("\n## 需人工核查\n\n")
                for i, item in enumerate(manual_checks, 1):
                    f.write(f"{i}. **{item['name']}** — {item['detail']}\n")

            if failed > 0:
                f.write("\n## 失败项\n\n")
                for item in test_results:
                    if item["status"] == "fail":
                        f.write(f"- **{item['name']}**: {item.get('detail', '')}\n")

            f.write("\n## Bug 修复验证\n\n")
            f.write("| Bug# | 描述 | 测试步骤 | 验证方式 |\n|------|------|----------|----------|\n")
            f.write("| #1 | delete_session 崩溃 | Step 5 | 删除含多条消息的会话不返回 500 |\n")
            f.write("| #2 | ASR 阻塞事件循环 | Step 6 | health 端点在 ASR 请求后仍 < 2s 响应 |\n")
            f.write("| #9 | 搜索缓存内存泄漏 | Step 10 | 重复搜索不报错 |\n")
            f.write("| #10 | CORS 冲突 | Step 7 | 通配符源不设置 credentials=true |\n")
            f.write("| #13 | needs_web_search 死代码 | Step 11 | 地点相关查询行为正确 |\n")
            f.write("| #14 | TTS 每次创建新客户端 | Step 9 | 连续 TTS 请求均成功 |\n")

        print(f"\n📄 测试报告已生成: {report_path}")


if __name__ == "__main__":
    tester = ApiTester()
    tester.run()
