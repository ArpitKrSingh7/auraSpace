import React from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
export const palette = {
  background: '#faf9f6',
  panel: '#ffffff',
  muted: '#f0efe8',
  line: '#e2e3d9',
  ink: '#26382d',
  secondary: '#677064',
  brand: '#3e6658',
  tint: '#e7eee3',
  danger: '#a43e33',
  warning: '#a36a22',
};
export function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
  compact = false,
  testID,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  compact?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        secondary ? styles.secondary : null,
        compact ? { paddingHorizontal: 12 } : null,
        { opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
      ]}
    >
      <Text
        style={[styles.buttonText, secondary ? { color: palette.brand } : null]}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 7, flex: 1 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#8a9186"
        style={styles.input}
        {...props}
      />
    </View>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  const [draft, setDraft] = React.useState(String(value));
  React.useEffect(() => setDraft(String(Number(value.toFixed(3)))), [value]);
  return (
    <Field
      label={label}
      value={draft}
      keyboardType="decimal-pad"
      onChangeText={setDraft}
      onEndEditing={() => {
        const n = Number(draft.replace(',', '.'));
        if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
        else setDraft(String(value));
      }}
    />
  );
}
export function Heading({
  children,
  small = false,
}: {
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <Text style={small ? styles.subheading : styles.heading}>{children}</Text>
  );
}
export function Body({ children }: { children: React.ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}
export function Panel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.panel, style]}>{children}</View>;
}
export function Screen({
  children,
  scroll = true,
}: {
  children: React.ReactNode;
  scroll?: boolean;
}) {
  return (
    <SafeAreaView style={styles.screen}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </SafeAreaView>
  );
}
export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={() => {
        Keyboard.dismiss();
        setTimeout(onClose, 0);
      }}
    >
      <View style={styles.modal}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel="Close panel"
          onPress={() => {
            Keyboard.dismiss();
            setTimeout(onClose, 0);
          }}
        />
        <SafeAreaView
          edges={['bottom']}
          style={styles.sheet}
          accessibilityViewIsModal
        >
          <View style={styles.row}>
            <Heading small>{title}</Heading>
            <Button
              title="Done"
              compact
              secondary
              onPress={() => {
                Keyboard.dismiss();
                setTimeout(onClose, 0);
              }}
            />
          </View>
          <ScrollView
            contentContainerStyle={{ gap: 18, paddingBottom: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
export function Loading({
  label = 'Opening your studio…',
}: {
  label?: string;
}) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={palette.brand} />
      <Body>{label}</Body>
    </View>
  );
}
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: 20, gap: 22, paddingBottom: 40 },
  heading: {
    fontFamily: 'serif',
    fontSize: 33,
    lineHeight: 40,
    color: palette.ink,
    letterSpacing: -1,
  },
  subheading: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.ink,
    flexShrink: 1,
  },
  body: { fontSize: 13, lineHeight: 21, color: palette.secondary },
  label: { fontSize: 12, fontWeight: '500', color: palette.secondary },
  input: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: palette.ink,
    backgroundColor: palette.panel,
    minHeight: 46,
  },
  button: {
    backgroundColor: palette.brand,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 12,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: {
    backgroundColor: palette.muted,
    borderWidth: 1,
    borderColor: palette.line,
  },
  buttonText: { fontSize: 13, fontWeight: '600', color: 'white' },
  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  panel: {
    backgroundColor: palette.panel,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 18,
    gap: 10,
  },
  modal: {
    flex: 1,
    backgroundColor: 'rgba(20,30,23,.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: palette.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 18,
    maxHeight: '88%',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 24,
  },
  pill: {
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: palette.muted,
  },
  pillText: { fontSize: 12, color: palette.brand },
});
