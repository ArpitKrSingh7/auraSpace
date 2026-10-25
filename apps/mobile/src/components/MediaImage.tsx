import React from 'react';
import { Image, View, type ImageStyle, type StyleProp } from 'react-native';
import { resolveMedia } from '../storage/media';
import { palette } from './ui';
export function MediaImage({
  assetId,
  style,
  resizeMode = 'cover',
}: {
  assetId?: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain';
}) {
  const [uri, setUri] = React.useState<string>();
  React.useEffect(() => {
    let active = true;
    setUri(undefined);
    void resolveMedia(assetId)
      .then((value) => {
        if (active) setUri(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [assetId]);
  return uri ? (
    <Image
      source={{ uri }}
      style={style}
      resizeMode={resizeMode}
      onError={() => setUri(undefined)}
    />
  ) : (
    <View style={[{ backgroundColor: palette.muted }, style]} />
  );
}
