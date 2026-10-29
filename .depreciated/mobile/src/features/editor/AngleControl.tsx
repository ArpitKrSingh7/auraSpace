import React from 'react';
import { PanResponder, Text, TextInput, View } from 'react-native';
import { palette, styles } from '../../components/ui';

/** Preview a drag locally, then save one edit when the gesture finishes. */
export function AngleControl({
  label,
  value,
  max = 360,
  disabled = false,
  onCommit,
  onPreview,
}: {
  label: string;
  value: number;
  max?: number;
  disabled?: boolean;
  onCommit: (degrees: number) => void;
  onPreview?: (degrees: number | null) => void;
}) {
  const [draft, setDraft] = React.useState(value),
    [input, setInput] = React.useState(String(Number(value.toFixed(3)))),
    rail = React.useRef<View>(null),
    geometry = React.useRef({ x: 0, width: 1 }),
    dragging = React.useRef(false),
    draftRef = React.useRef(value),
    current = React.useRef({ value, max, disabled, onCommit, onPreview });
  current.current = { value, max, disabled, onCommit, onPreview };
  React.useEffect(() => {
    if (dragging.current) return;
    setDraft(value);
    draftRef.current = value;
    setInput(String(Number(value.toFixed(3))));
  }, [value]);
  const preview = (degrees: number) => {
    const next = Math.round(Math.max(0, Math.min(current.current.max, degrees)));
    draftRef.current = next;
    setDraft(next);
    setInput(String(next));
    current.current.onPreview?.(next);
  };
  const atPageX = (pageX: number) =>
    preview(((pageX - geometry.current.x) / geometry.current.width) * current.current.max);
  const responder = React.useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => !current.current.disabled,
      onMoveShouldSetPanResponder: () => !current.current.disabled,
      onPanResponderGrant: (event) => {
        dragging.current = true;
        const pageX = event.nativeEvent.pageX;
        atPageX(pageX);
        rail.current?.measureInWindow((x, _y, width) => {
          geometry.current = { x, width: Math.max(1, width) };
          if (dragging.current) atPageX(pageX);
        });
      },
      onPanResponderMove: (event) => atPageX(event.nativeEvent.pageX),
      onPanResponderRelease: (event) => {
        atPageX(event.nativeEvent.pageX);
        dragging.current = false;
        const c = current.current;
        if (Math.abs(draftRef.current - c.value) > 0.001) c.onCommit(draftRef.current);
        c.onPreview?.(null);
      },
      onPanResponderTerminate: () => {
        dragging.current = false;
        preview(current.current.value);
        current.current.onPreview?.(null);
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    }),
    [],
  );
  const commitInput = () => {
    const next = Number(input.replace(',', '.'));
    if (input.trim() && Number.isFinite(next) && next >= 0 && next <= max) {
      setDraft(next);
      draftRef.current = next;
      if (Math.abs(next - value) > 0.001) onCommit(next);
    } else setInput(String(Number(value.toFixed(3))));
  };
  return (
    <View style={{ gap: 7, opacity: disabled ? 0.45 : 1 }}>
      <View style={[styles.row, { gap: 12 }]}>
        <Text style={[styles.label, { flex: 1 }]}>{label}</Text>
        <TextInput
          accessibilityLabel={`${label} in degrees`}
          accessibilityState={{ disabled }}
          editable={!disabled}
          selectTextOnFocus
          keyboardType="decimal-pad"
          value={input}
          onChangeText={setInput}
          onEndEditing={commitInput}
          style={[styles.input, { width: 82, minHeight: 40, paddingVertical: 7, textAlign: 'right' }]}
        />
        <Text style={styles.label}>°</Text>
      </View>
      <View
        ref={rail}
        collapsable={false}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityHint="Drag to change the angle, or use accessibility actions for one degree steps."
        accessibilityState={{ disabled }}
        accessibilityValue={{ min: 0, max, now: draft, text: `${draft} degrees` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          if (disabled) return;
          const next = Math.max(0, Math.min(max, value + (event.nativeEvent.actionName === 'increment' ? 1 : -1)));
          if (next !== value) onCommit(next);
        }}
        onLayout={() => rail.current?.measureInWindow((x, _y, width) => {
          geometry.current = { x, width: Math.max(1, width) };
        })}
        style={{ height: 44, justifyContent: 'center', marginHorizontal: 14 }}
        {...responder.panHandlers}
      >
        <View pointerEvents="none" style={{ height: 5, borderRadius: 3, backgroundColor: palette.line }} />
        <View pointerEvents="none" style={{ position: 'absolute', height: 5, width: `${(draft / max) * 100}%`, borderRadius: 3, backgroundColor: palette.brand }} />
        <View pointerEvents="none" style={{ position: 'absolute', left: `${(draft / max) * 100}%`, marginLeft: -14, width: 28, height: 28, borderRadius: 14, backgroundColor: palette.brand, borderWidth: 3, borderColor: palette.panel }} />
      </View>
    </View>
  );
}
