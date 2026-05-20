import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './src/store/AuthContext';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from './src/theme';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import MemoryScreen from './src/screens/MemoryScreen';
import DiagnosticsScreen from './src/screens/DiagnosticsScreen';
import TestModeScreen from './src/screens/TestModeScreen';
import SessionListScreen from './src/screens/SessionListScreen';
import SessionDetailScreen from './src/screens/SessionDetailScreen';

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  Settings: undefined;
  Memory: undefined;
  Diagnostics: undefined;
  TestMode: undefined;
  SessionList: undefined;
  SessionDetail: { sessionId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function AppNavigator() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#e94560" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      >
        {user ? (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{
                headerShown: true,
                headerTitle: '设置',
                headerStyle: { backgroundColor: colors.background },
                headerTintColor: '#fff',
                headerBackTitle: '返回',
              }}
            />
            <Stack.Screen
              name="Memory"
              component={MemoryScreen}
              options={{
                headerShown: true,
                headerTitle: '记忆管理',
                headerStyle: { backgroundColor: colors.background },
                headerTintColor: '#fff',
                headerBackTitle: '返回',
              }}
            />
            <Stack.Screen
              name="Diagnostics"
              component={DiagnosticsScreen}
              options={{
                headerShown: true,
                headerTitle: '诊断测试',
                headerStyle: { backgroundColor: colors.background },
                headerTintColor: '#fff',
                headerBackTitle: '返回',
              }}
            />
            <Stack.Screen
              name="TestMode"
              component={TestModeScreen}
              options={{
                headerShown: true,
                headerTitle: '测试模式',
                headerStyle: { backgroundColor: colors.background },
                headerTintColor: '#fff',
                headerBackTitle: '返回',
              }}
            />
            <Stack.Screen
              name="SessionList"
              component={SessionListScreen}
              options={{
                headerShown: true,
                headerTitle: '历史会话',
                headerStyle: { backgroundColor: colors.background },
                headerTintColor: '#fff',
                headerBackTitle: '返回',
              }}
            />
            <Stack.Screen
              name="SessionDetail"
              component={SessionDetailScreen}
              options={{
                headerShown: true,
                headerTitle: '会话详情',
                headerStyle: { backgroundColor: colors.background },
                headerTintColor: '#fff',
                headerBackTitle: '返回',
              }}
            />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});
