import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  FlatList,
} from 'react-native';
import { apiService } from '../services/api';

interface MemoryItem {
  id: number;
  content: string;
  category: string;
  importance: number;
  created_at: string | null;
  is_cared: boolean;
}

const CATEGORY_MAP: Record<string, string> = {
  personal_info: '个人信息',
  health: '健康',
  emotion: '情绪',
  event: '事件',
  preference: '偏好',
  relationship: '人际关系',
  work_study: '工作学习',
  general: '其他',
};

const CATEGORY_COLORS: Record<string, string> = {
  personal_info: '#4ecdc4',
  health: '#e94560',
  emotion: '#ff9f43',
  event: '#a29bfe',
  preference: '#6c5ce7',
  relationship: '#fd79a8',
  work_study: '#00b894',
  general: '#636e72',
};

export default function MemoryScreen() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<MemoryItem[] | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('general');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadMemories();
  }, []);

  const loadMemories = async () => {
    try {
      setLoading(true);
      const data = await apiService.getMemories(selectedCategory || undefined);
      setMemories(data);
      console.log('[MemoryScreen] 加载记忆完成:', data.length, '条');
    } catch (error) {
      console.error('加载记忆失败:', error);
      Alert.alert('错误', '加载记忆失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      loadMemories();
      return;
    }
    try {
      setLoading(true);
      const data = await apiService.searchMemories(searchQuery.trim(), 50, selectedCategory || undefined);
      setSearchResults(data.memories || []);
    } catch (error) {
      Alert.alert('错误', '搜索失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMemory = async () => {
    if (!newContent.trim()) {
      Alert.alert('错误', '请输入记忆内容');
      return;
    }
    setSaving(true);
    try {
      await apiService.addMemory(newContent.trim(), newCategory, 3);
      setNewContent('');
      setShowAddForm(false);
      loadMemories();
      Alert.alert('成功', '记忆已添加');
    } catch (error: any) {
      Alert.alert('错误', error.response?.data?.detail || '添加失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMemory = (id: number) => {
    Alert.alert(
      '删除记忆',
      '确定要删除这条记忆吗？',
      [
        { text: '取消', style: 'cancel' },
        { text: '删除', style: 'destructive', onPress: async () => {
          try {
            await apiService.deleteMemory(id);
            loadMemories();
          } catch (error) {
            Alert.alert('错误', '删除失败');
          }
        }},
      ]
    );
  };

  const displayMemories = searchResults
    ? searchResults.map(m => ({
        id: parseInt(m.id?.replace('memory_', '') || '0'),
        content: m.content,
        category: m.metadata?.category || 'general',
        importance: m.metadata?.importance || 3,
        created_at: null,
        is_cared: false,
      }))
    : memories;

  const renderMemory = ({ item }: { item: MemoryItem }) => (
    <View style={styles.memoryCard}>
      <View style={styles.memoryHeader}>
        <View style={[styles.categoryTag, { backgroundColor: CATEGORY_COLORS[item.category] || '#636e72' }]}>
          <Text style={styles.categoryText}>
            {CATEGORY_MAP[item.category] || item.category}
          </Text>
        </View>
        <TouchableOpacity onPress={() => handleDeleteMemory(item.id)}>
          <Text style={styles.deleteText}>删除</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.memoryContent}>{item.content}</Text>
      {item.created_at && (
        <Text style={styles.memoryDate}>
          {new Date(item.created_at).toLocaleDateString('zh-CN')}
        </Text>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* 搜索栏 */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="语义搜索记忆..."
          placeholderTextColor="#666"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Text style={styles.searchButtonText}>搜索</Text>
        </TouchableOpacity>
        {searchResults && (
          <TouchableOpacity style={styles.clearButton} onPress={() => { setSearchResults(null); setSearchQuery(''); }}>
            <Text style={styles.clearButtonText}>清除</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 分类筛选 */}
      <ScrollView horizontal style={styles.categoryBar} showsHorizontalScrollIndicator={false}>
        <TouchableOpacity
          style={[styles.categoryChip, !selectedCategory && styles.categoryChipActive]}
          onPress={() => { setSelectedCategory(null); loadMemories(); }}
        >
          <Text style={[styles.categoryChipText, !selectedCategory && styles.categoryChipTextActive]}>全部</Text>
        </TouchableOpacity>
        {Object.entries(CATEGORY_MAP).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.categoryChip, selectedCategory === key && styles.categoryChipActive]}
            onPress={() => { 
              setSelectedCategory(key); 
              if (searchResults && searchQuery.trim()) {
                handleSearch();
              } else {
                loadMemories();
              }
            }}
          >
            <Text style={[styles.categoryChipText, selectedCategory === key && styles.categoryChipTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 记忆列表 */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#e94560" />
        </View>
      ) : (
        <FlatList
          data={displayMemories}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderMemory}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {searchResults ? '没有找到相关记忆' : '还没有记忆，开始对话吧！'}
              </Text>
            </View>
          }
        />
      )}

      {/* 添加记忆按钮 */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowAddForm(!showAddForm)}
      >
        <Text style={styles.fabText}>{showAddForm ? '✕' : '+'}</Text>
      </TouchableOpacity>

      {/* 添加记忆表单 */}
      {showAddForm && (
        <View style={styles.addForm}>
          <Text style={styles.addFormTitle}>添加记忆</Text>
          <TextInput
            style={styles.addInput}
            placeholder="输入记忆内容..."
            placeholderTextColor="#666"
            value={newContent}
            onChangeText={setNewContent}
            multiline
          />
          <ScrollView horizontal style={styles.categorySelect} showsHorizontalScrollIndicator={false}>
            {Object.entries(CATEGORY_MAP).map(([key, label]) => (
              <TouchableOpacity
                key={key}
                style={[styles.selectChip, newCategory === key && styles.selectChipActive]}
                onPress={() => setNewCategory(key)}
              >
                <Text style={[styles.selectChipText, newCategory === key && styles.selectChipTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.addButton} onPress={handleAddMemory} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : (
              <Text style={styles.addButtonText}>添加</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  searchBar: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#fff',
  },
  searchButton: {
    backgroundColor: '#e94560',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  clearButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  clearButtonText: {
    color: '#ccc',
    fontSize: 12,
  },
  categoryBar: {
    paddingHorizontal: 12,
    marginBottom: 8,
    maxHeight: 40,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  categoryChipActive: {
    backgroundColor: '#e94560',
  },
  categoryChipText: {
    color: '#888',
    fontSize: 12,
  },
  categoryChipTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 12,
    paddingBottom: 80,
  },
  memoryCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  memoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  deleteText: {
    color: '#666',
    fontSize: 12,
  },
  memoryContent: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },
  memoryDate: {
    color: '#555',
    fontSize: 11,
    marginTop: 6,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#e94560',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#e94560',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
  },
  addForm: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#16213e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 30,
  },
  addFormTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  addInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#fff',
    minHeight: 60,
    maxHeight: 100,
    marginBottom: 12,
  },
  categorySelect: {
    marginBottom: 12,
    maxHeight: 36,
  },
  selectChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  selectChipActive: {
    backgroundColor: '#e94560',
  },
  selectChipText: {
    color: '#888',
    fontSize: 12,
  },
  selectChipTextActive: {
    color: '#fff',
  },
  addButton: {
    backgroundColor: '#e94560',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
