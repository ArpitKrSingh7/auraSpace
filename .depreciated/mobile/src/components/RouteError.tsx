import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { Body, Button, Heading, Screen } from './ui';
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const router = useRouter();
  return (
    <Screen>
      <Heading>Let’s try that again.</Heading>
      <Body>
        This view could not open. Your saved rooms have not been removed.
      </Body>
      <Button title="Retry" onPress={retry} />
      <Button
        secondary
        title="Back to studio"
        onPress={() => router.replace('/')}
      />
    </Screen>
  );
}
