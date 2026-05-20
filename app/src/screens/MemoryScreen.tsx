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
import { colors, spacing, radius } from '../theme';
import { Ionicons } from '@expo/vector-icons';

interface MemoryItem {
  id: number;
  content: string;
  category: string;
  importance: number;
  created_at: string | null;
  is_cared: boolean;
}

interface MemorySearchResult {
  id: string;
  content: string;
  distance?: number;
  metadata?: {
    category?: string;
    importance?: number;
    created_at?: string;
    is_cared?: boolean;
  };
}

const CATEGORY_MAP: Record<string, string> = {
  personal_info: '个人信息',
  food_preference: '饮食偏好',
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
  food_preference: '#e17055',
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
  const [searchResults, setSearchResults] = useState<MemorySearchResult[] | null>(null);
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

  const displayMemories: MemoryItem[] = searchResults
    ? searchResults.map(m => ({
        id: parseInt(String(m.id).replace('memory_', '') || '0'),
        content: m.content,
        category: m.metadata?.category || 'general',
        importance: m.metadata?.importance || 3,
        created_at: m.metadata?.created_at || null,
        is_cared: m.metadata?.is_cared || false,
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
          <ActivityIndicator size="large" color={colors.primary} />
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
        <Ionicons name={showAddForm ? 'close' : 'add'} size={28} color={colors.text} />
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
    backgroundColor: colors.background,
  },
  searchBar: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: 14,
    color: colors.text,
  },
  searchButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  clearButton: {
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  clearButtonText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  categoryBar: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    maxHeight: 40,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
  },
  categoryChipText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  categoryChipTextActive: {
    color: colors.text,
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: 80,
  },
  memoryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  memoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  categoryTag: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  categoryText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
  },
  deleteText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  memoryContent: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  memoryDate: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: spacing.xs,
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
    color: colors.textMuted,
    fontSize: 14,
  },
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '600',
  },
  addForm: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing['3xl'],
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  addFormTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  addInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 14,
    color: colors.text,
    minHeight: 60,
    maxHeight: 100,
    marginBottom: spacing.md,
  },
  categorySelect: {
    marginBottom: spacing.md,
    maxHeight: 36,
  },
  selectChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  selectChipActive: {
    backgroundColor: colors.primary,
  },
  selectChipText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  selectChipTextActive: {
    color: colors.text,
  },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    padding: spacing.md,
    alignItems: 'center',
  },
  addButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});
