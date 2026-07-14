import { useEffect, useState } from 'react';
import type { PipecatBaseChildProps } from '@pipecat-ai/voice-ui-kit';
import {
  ConnectButton,
  ConversationPanel,
  EventsPanel,
  UserAudioControl,
} from '@pipecat-ai/voice-ui-kit';
import type { TransportType } from '../config';
import { TransportSelect } from './TransportSelect';
import { VoiceOrb } from './VoiceOrb';
import { useConnectionStatus } from '../hooks/useConnectionStatus';
import { useSessionReport } from '../hooks/useSessionReport';
import { SessionReportCard } from './SessionReportCard';

interface AppProps extends PipecatBaseChildProps {
  transportType: TransportType;
  onTransportChange: (type: TransportType) => void;
  availableTransports: TransportType[];
}

export const App = ({
  client,
  handleConnect,
  handleDisconnect,
  transportType,
  onTransportChange,
  availableTransports,
}: AppProps) => {
  const [showDebug, setShowDebug] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const status = useConnectionStatus(client);
  const connected = status === 'connected';
  const report = useSessionReport(client);

  useEffect(() => {
    client?.initDevices();
  }, [client]);

  const showTransportSelector = availableTransports.length > 1;

  return (
    <div
      className="flex flex-col w-full h-full"
      style={{ background: 'var(--color-background)', fontFamily: 'var(--font-sans)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div
          className="flex items-center gap-2"
          style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '15px', color: 'var(--color-foreground)' }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: connected ? 'var(--color-primary)' : 'var(--color-muted-foreground)',
              display: 'inline-block',
              boxShadow: connected ? '0 0 0 0 rgba(232,163,61,0.5)' : 'none',
              animation: connected ? 'micdrop-pulse 2s infinite' : 'none',
            }}
          />
          MicDrop<span style={{ color: 'var(--color-primary)' }}>.ai</span>
        </div>

        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--color-muted-foreground)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {status === 'connected' ? 'Live session' : status === 'connecting' ? 'Connecting…' : 'Voice interview coach'}
        </div>
      </div>

      <style>{`
        @keyframes micdrop-pulse {
          0% { box-shadow: 0 0 0 0 rgba(232,163,61,0.45); }
          70% { box-shadow: 0 0 0 8px rgba(232,163,61,0); }
          100% { box-shadow: 0 0 0 0 rgba(232,163,61,0); }
        }
      `}</style>

      {!connected ? (
        /* PRE-CONNECT HERO */
        <div className="flex-1 flex flex-col items-center justify-center px-6" style={{ textAlign: 'center' }}>
          <VoiceOrb client={client} connected={false} />
          <h1
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '22px',
              fontWeight: 600,
              color: 'var(--color-foreground)',
              marginBottom: '10px',
              maxWidth: 420,
            }}
          >
            Ready when you are.
          </h1>
          <p
            style={{
              color: 'var(--color-muted-foreground)',
              fontSize: '14.5px',
              maxWidth: 380,
              marginBottom: '32px',
              lineHeight: 1.5,
            }}
          >
            Start a live mock interview — real DSA questions, adaptive follow-ups, and a
            scored report when you're done.
          </p>

          <div className="flex items-center gap-4" style={{ marginBottom: showTransportSelector ? '20px' : 0 }}>
            <UserAudioControl size="lg" />
            <ConnectButton size="lg" onConnect={handleConnect} onDisconnect={handleDisconnect} />
          </div>

          {showTransportSelector && (
            <TransportSelect
              transportType={transportType}
              onTransportChange={onTransportChange}
              availableTransports={availableTransports}
            />
          )}
        </div>
      ) : (
        /* IN-SESSION VIEW */
        <>
          <VoiceOrb client={client} connected={true} />

          <div className="flex items-center justify-center gap-4 pb-4">
            <UserAudioControl size="lg" />
            <ConnectButton size="lg" onConnect={handleConnect} onDisconnect={handleDisconnect} />
          </div>

          <div className="flex-1 overflow-hidden px-6">
            <div className="h-full overflow-hidden" style={{ borderRadius: 10, border: '1px solid var(--color-border)' }}>
              <ConversationPanel />
            </div>
          </div>

          {/* Debug events, tucked away by default */}
          <div className="px-6 pb-4 pt-3">
            <button
              onClick={() => setShowDebug((v) => !v)}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--color-muted-foreground)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: 0,
              }}
            >
              {showDebug ? '▾ hide debug events' : '▸ show debug events'}
            </button>
            {showDebug && (
              <div className="h-64 overflow-hidden mt-3" style={{ borderRadius: 10, border: '1px solid var(--color-border)' }}>
                <EventsPanel />
              </div>
            )}
          </div>
        </>
      )}

      {report && !dismissed && (
        <SessionReportCard report={report} onClose={() => setDismissed(true)} />
      )}
    </div>
  );
};