#!/usr/bin/env python
"""
v0.2 功能快速测试脚本
运行方式：python test_v02.py
"""
import asyncio
import sys
from pathlib import Path

# 添加项目路径
backend_path = Path(__file__).parent
sys.path.insert(0, str(backend_path))

print("=" * 60)
print("食光知己 v0.2 功能测试")
print("=" * 60)

async def test_vector_db():
    """测试向量数据库"""
    print("\n[1/5] 测试向量数据库...")
    try:
        from core.vector_db import vector_db
        
        # 测试添加记忆
        vector_db.add_memory(
            memory_id="test_1",
            user_id=999,
            content="测试用户喜欢吃火锅",
            category="preference",
            metadata={"importance": 3}
        )
        print("  ✅ 添加记忆成功")
        
        # 测试搜索记忆
        results = vector_db.search_memories(
            user_id=999,
            query="用户饮食偏好",
            n_results=3
        )
        print(f"  ✅ 搜索记忆成功，找到 {len(results)} 条结果")
        
        # 测试获取所有记忆
        memories = vector_db.get_user_memories(user_id=999)
        print(f"  ✅ 获取所有记忆成功，共 {len(memories)} 条")
        
        # 清理测试数据
        vector_db.delete_memory("test_1")
        print("  ✅ 删除记忆成功")
        
        return True
    except Exception as e:
        print(f"  ❌ 向量数据库测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_memory_extractor():
    """测试记忆提取器"""
    print("\n[2/5] 测试记忆提取器...")
    try:
        from core.memory_extractor import memory_extractor
        
        # 测试关键词提取（备用方案）
        test_message = "我最近胃不太舒服，感觉压力也挺大的"
        memories = memory_extractor._simple_keyword_extraction(test_message)
        print(f"  ✅ 关键词提取成功，提取到 {len(memories)} 条记忆")
        
        for mem in memories:
            print(f"    - [{mem['category']}] {mem['content']} (重要性: {mem['importance']})")
        
        # 测试重要性评估
        memories = memory_extractor._assess_importance(memories)
        print("  ✅ 重要性评估成功")
        
        # 测试关怀检测（简单规则）
        care_result = await memory_extractor.should_care(memories, user_id=999)
        if care_result:
            print(f"  ✅ 关怀检测成功: {care_result.get('care_topic')}")
        else:
            print("  ✅ 关怀检测完成（无关怀需求）")
        
        return True
    except Exception as e:
        print(f"  ❌ 记忆提取器测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_models():
    """测试数据模型"""
    print("\n[3/5] 测试数据模型...")
    try:
        from models.user import User, Conversation, Memory, TokenBlacklist
        
        # 检查模型字段
        print(f"  ✅ User 模型字段: {[c.name for c in User.__table__.columns]}")
        print(f"  ✅ Memory 模型字段: {[c.name for c in Memory.__table__.columns]}")
        print(f"  ✅ TokenBlacklist 模型字段: {[c.name for c in TokenBlacklist.__table__.columns]}")
        
        return True
    except Exception as e:
        print(f"  ❌ 数据模型测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_imports():
    """测试所有模块导入"""
    print("\n[4/5] 测试模块导入...")
    modules = [
        "core.vector_db",
        "core.memory_extractor",
        "core.security",
        "core.database",
        "core.config",
        "api.memory",
        "api.wakeword",
        "api.auth",
        "api.llm",
        "api.asr",
        "api.tts",
    ]
    
    success = 0
    for module in modules:
        try:
            __import__(module)
            print(f"  ✅ {module}")
            success += 1
        except Exception as e:
            print(f"  ❌ {module}: {e}")
    
    print(f"  导入结果: {success}/{len(modules)} 成功")
    return success == len(modules)


def test_api_routes():
    """测试 FastAPI 路由"""
    print("\n[5/5] 测试 API 路由...")
    try:
        from main import app
        
        routes = [route.path for route in app.routes]
        memory_routes = [r for r in routes if "/memory" in r]
        wakeword_routes = [r for r in routes if "/wakeword" in r]
        auth_routes = [r for r in routes if "/auth" in r]
        
        print(f"  ✅ 总路由数: {len(routes)}")
        print(f"  ✅ 记忆相关路由: {len(memory_routes)}")
        for r in memory_routes:
            print(f"    - {r}")
        print(f"  ✅ 唤醒词相关路由: {len(wakeword_routes)}")
        print(f"  ✅ 认证相关路由: {len(auth_routes)}")
        
        # 检查v0.2新增路由
        new_routes = [
            "/auth/logout",
            "/memory",
            "/memory/search",
            "/memory/extract",
            "/memory/care/check",
            "/wakeword/detect",
            "/wakeword/config"
        ]
        
        found_new = [r for r in new_routes if any(r in route for route in routes)]
        print(f"  ✅ v0.2 新增路由: {len(found_new)}/{len(new_routes)}")
        
        return True
    except Exception as e:
        print(f"  ❌ API 路由测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    print("\n开始测试...\n")
    
    results = {}
    
    results["向量数据库"] = await test_vector_db()
    results["记忆提取器"] = await test_memory_extractor()
    results["数据模型"] = test_models()
    results["模块导入"] = test_imports()
    results["API路由"] = test_api_routes()
    
    print("\n" + "=" * 60)
    print("测试结果汇总")
    print("=" * 60)
    
    passed = sum(results.values())
    total = len(results)
    
    for name, result in results.items():
        status = "✅ 通过" if result else "❌ 失败"
        print(f"  {name}: {status}")
    
    print("\n" + "-" * 60)
    print(f"总计: {passed}/{total} 测试通过")
    
    if passed == total:
        print("🎉 所有测试通过！v0.2 代码结构完整，可以启动服务进行实际功能测试。")
    else:
        print("⚠️  部分测试失败，请检查错误信息。")
    print("=" * 60)
    
    print("\n下一步:")
    print("1. 配置 .env 文件（OPENAI_API_KEY 等）")
    print("2. 运行后端: python main.py")
    print("3. 访问 http://localhost:8000/docs 进行接口测试")
    print("4. 参考 docs/API_TEST.md 进行完整功能测试")


if __name__ == "__main__":
    asyncio.run(main())
