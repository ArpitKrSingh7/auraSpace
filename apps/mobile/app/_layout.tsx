import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RecoverableBoundary } from '../src/components/ErrorBoundary';
import { Loading, palette } from '../src/components/ui';
import { drainOutbox } from '../src/services/sync';
import { useStudio } from '../src/state/studio';
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, retryDelay: 2000, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});
export { ErrorBoundary } from '../src/components/RouteError';
export default function Root() {
  const ready = useStudio((s) => s.ready),
    notice = useStudio((s) => s.notice);
  React.useEffect(() => {
    void useStudio.getState().initialize();
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void drainOutbox();
    }, 15000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void drainOutbox();
      else
        void useStudio
          .getState()
          .flush()
          .catch(() =>
            useStudio
              .getState()
              .notify('Keep the app open and retry saving before closing it.'),
          );
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <RecoverableBoundary>
            <StatusBar style="dark" />
            {ready ? (
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: palette.background },
                }}
              />
            ) : (
              <Loading />
            )}
            {notice && (
              <View
                style={{
                  position: 'absolute',
                  left: 14,
                  right: 14,
                  bottom: 90,
                  backgroundColor: palette.ink,
                  padding: 16,
                  borderRadius: 16,
                  flexDirection: 'row',
                  gap: 12,
                }}
                accessibilityLiveRegion="polite"
              >
                <Text
                  style={{
                    color: 'white',
                    fontSize: 12,
                    lineHeight: 19,
                    flex: 1,
                  }}
                >
                  {notice}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss message"
                  onPress={() => useStudio.getState().notify(null)}
                >
                  <Text style={{ color: 'white', padding: 5 }}>✕</Text>
                </Pressable>
              </View>
            )}
          </RecoverableBoundary>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
