import React from 'react';
import { View } from 'react-native';
import { Body, Button, Heading, styles } from './ui';
export class RecoverableBoundary extends React.Component<
  {
    children: React.ReactNode;
    fallback?: React.ReactNode;
    onRetry?: () => void;
  },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    /* Report only a stable error category; no room photos or credentials. */
  }
  render() {
    if (this.state.failed)
      return (
        this.props.fallback ?? (
          <View style={styles.center}>
            <Heading small>Let’s reopen this view.</Heading>
            <Body>Your saved room is still on this device.</Body>
            <Button
              title="Try again"
              onPress={() => {
                this.setState({ failed: false });
                this.props.onRetry?.();
              }}
            />
          </View>
        )
      );
    return this.props.children;
  }
}
