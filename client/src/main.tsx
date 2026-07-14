import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@pipecat-ai/voice-ui-kit';
import type { PipecatBaseChildProps } from '@pipecat-ai/voice-ui-kit';
import {
  ErrorCard,
  FullScreenContainer,
  PipecatAppBase,
  SpinLoader,
} from '@pipecat-ai/voice-ui-kit';
import { App } from './components/App';
import { LandingScreen } from './components/LandingScreen';
import {
  AVAILABLE_TRANSPORTS,
  DEFAULT_TRANSPORT,
  TRANSPORT_PROPS,
} from './config';
import type { TransportType } from './config';
import './index.css';

export const Main = () => {
  const [transportType, setTransportType] =
    useState<TransportType>(DEFAULT_TRANSPORT);
  const [started, setStarted] = useState(false);
  const transportProps = TRANSPORT_PROPS[transportType];

  if (!started) {
    return (
      <ThemeProvider defaultTheme="terminal" disableStorage>
        <FullScreenContainer>
          <div className="flex flex-col w-full h-full" style={{ background: 'var(--color-background)' }}>
            <LandingScreen onStart={() => setStarted(true)} />
          </div>
        </FullScreenContainer>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider defaultTheme="terminal" disableStorage>
      <FullScreenContainer>
        <PipecatAppBase
          {...transportProps}
          transportType={transportType}>
          {({
            client,
            handleConnect,
            handleDisconnect,
            error,
          }: PipecatBaseChildProps) =>
            !client ? (
              <SpinLoader />
            ) : error ? (
              <ErrorCard>{error}</ErrorCard>
            ) : (
              <App
                client={client}
                handleConnect={handleConnect}
                handleDisconnect={handleDisconnect}
                transportType={transportType}
                onTransportChange={setTransportType}
                availableTransports={AVAILABLE_TRANSPORTS}
              />
            )
          }
        </PipecatAppBase>
      </FullScreenContainer>
    </ThemeProvider>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Main />
  </StrictMode>
);