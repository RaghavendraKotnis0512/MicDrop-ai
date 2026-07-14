import { useEffect, useState } from 'react';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export function useConnectionStatus(client: any): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');

  useEffect(() => {
    if (!client) {
      setStatus('disconnected');
      return;
    }

    const onConnecting = () => setStatus('connecting');
    const onConnected = () => setStatus('connected');
    const onDisconnected = () => setStatus('disconnected');

    client.on?.('connecting', onConnecting);
    client.on?.('connected', onConnected);
    client.on?.('botReady', onConnected);
    client.on?.('disconnected', onDisconnected);

    return () => {
      client.off?.('connecting', onConnecting);
      client.off?.('connected', onConnected);
      client.off?.('botReady', onConnected);
      client.off?.('disconnected', onDisconnected);
    };
  }, [client]);

  return status;
}