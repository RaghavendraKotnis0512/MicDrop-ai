import { useEffect, useState } from 'react';

export interface SessionReport {
  questions_answered?: number;
  average_score?: number;
  email_sent?: boolean;
  strengths?: string;
  weaknesses?: string;
  summary_text?: string;
}

export function useSessionReport(client: any): SessionReport | null {
  const [report, setReport] = useState<SessionReport | null>(null);

  useEffect(() => {
    if (!client) return;

    const handleServerMessage = (msg: any) => {
      console.log('[useSessionReport] serverMessage', msg);
      if (msg?.type === 'session_report' && msg?.data) {
        setReport(msg.data);
      }
    };

    // Try the most likely event names for server->client messages
    client.on?.('serverMessage', handleServerMessage);
    client.on?.('server-message', handleServerMessage);
    client.on?.('genericMessage', handleServerMessage);

    return () => {
      client.off?.('serverMessage', handleServerMessage);
      client.off?.('server-message', handleServerMessage);
      client.off?.('genericMessage', handleServerMessage);
    };
  }, [client]);

  return report;
}