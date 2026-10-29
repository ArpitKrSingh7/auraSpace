import React from 'react';
import { PanResponder, Text, View } from 'react-native';
import { MediaImage } from '../../components/MediaImage';
import { palette } from '../../components/ui';
export function BeforeAfter({
  originalId,
  previewId,
  ratio,
}: {
  originalId: string;
  previewId: string;
  ratio: number;
}) {
  const [fraction, setFraction] = React.useState(0.5),
    [width, setWidth] = React.useState(1),
    root = React.useRef<View>(null),
    left = React.useRef(0),
    widthRef = React.useRef(1);
  widthRef.current = width;
  const responder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (e) =>
          setFraction(
            Math.max(
              0,
              Math.min(
                1,
                (e.nativeEvent.pageX - left.current) / widthRef.current,
              ),
            ),
          ),
        onPanResponderGrant: (e) =>
          setFraction(
            Math.max(
              0,
              Math.min(
                1,
                (e.nativeEvent.pageX - left.current) / widthRef.current,
              ),
            ),
          ),
      }),
    [],
  );
  return (
    <View
      ref={root}
      style={{
        width: '100%',
        aspectRatio: ratio,
        borderRadius: 14,
        overflow: 'hidden',
      }}
      onLayout={(e) => {
        setWidth(e.nativeEvent.layout.width);
        root.current?.measureInWindow((x) => {
          left.current = x;
        });
      }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Compare original and generated empty room"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) =>
        setFraction((n) =>
          Math.max(
            0,
            Math.min(
              1,
              n + (e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1),
            ),
          ),
        )
      }
      {...responder.panHandlers}
    >
      <MediaImage
        assetId={previewId}
        style={{ width: '100%', height: '100%' }}
        resizeMode="contain"
      />
      <View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: width * fraction,
          overflow: 'hidden',
        }}
      >
        <MediaImage
          assetId={originalId}
          style={{ width, height: width / ratio }}
          resizeMode="contain"
        />
      </View>
      <View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: width * fraction,
          width: 2,
          backgroundColor: 'white',
        }}
      />
      <Text
        style={{
          position: 'absolute',
          left: 10,
          top: 10,
          fontSize: 10,
          color: 'white',
          backgroundColor: palette.ink,
          padding: 5,
          borderRadius: 5,
        }}
      >
        Original
      </Text>
      <Text
        style={{
          position: 'absolute',
          right: 10,
          top: 10,
          fontSize: 10,
          color: 'white',
          backgroundColor: palette.ink,
          padding: 5,
          borderRadius: 5,
        }}
      >
        Generated preview
      </Text>
    </View>
  );
}
