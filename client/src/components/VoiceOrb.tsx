import { useEffect, useState } from 'react';
import { useAudioLevel } from '../hooks/useAudioLevel';

interface VoiceOrbProps {
  client: any;
  connected: boolean;
}

/**
 * A glass sphere with swirling gradient ribbons that drift continuously,
 * and brighten/pulse in real time with the bot's actual voice volume.
 */
export const VoiceOrb = ({ client, connected }: VoiceOrbProps) => {
  const [botTrack, setBotTrack] = useState<MediaStreamTrack | null>(null);

  useEffect(() => {
    if (!client) return;

    const handleTrackStarted = (track: MediaStreamTrack, participant?: any) => {
      const isBot = !participant?.local;
      if (track?.kind === 'audio' && isBot) setBotTrack(track);
    };
    const handleTrackStopped = (track: MediaStreamTrack, participant?: any) => {
      const isBot = !participant?.local;
      if (track?.kind === 'audio' && isBot) setBotTrack(null);
    };

    client.on?.('trackStarted', handleTrackStarted);
    client.on?.('trackStopped', handleTrackStopped);

    try {
      const existing = client.tracks?.();
      const existingBotAudio =
        existing?.bot?.audio ?? existing?.remote?.audio ?? existing?.output?.audio ?? null;
      if (existingBotAudio) setBotTrack(existingBotAudio);
    } catch {
      /* ignore */
    }

    return () => {
      client.off?.('trackStarted', handleTrackStarted);
      client.off?.('trackStopped', handleTrackStopped);
    };
  }, [client]);

  const level = useAudioLevel(botTrack);
  const intensity = connected ? level : 0;
  const scale = 1 + intensity * 0.16;
  const brightness = 1 + intensity * 0.45;
  const glow = 28 + intensity * 90;

  return (
    <div className="orb-wrap">
      <div
        className="orb-sphere"
        style={{
          transform: `scale(${scale})`,
          filter: `brightness(${brightness})`,
          boxShadow: `0 24px 60px rgba(0,0,0,0.4), 0 0 ${glow}px rgba(232,163,61,${0.25 + intensity * 0.4})`,
        }}
      >
        <div className="orb-base" />
        <div className="orb-ribbon orb-ribbon-1" style={{ opacity: 0.55 + intensity * 0.4 }} />
        <div className="orb-ribbon orb-ribbon-2" style={{ opacity: 0.45 + intensity * 0.4 }} />
        <div className="orb-ribbon orb-ribbon-3" style={{ opacity: 0.35 + intensity * 0.4 }} />
        <div className="orb-highlight" />
        <div className="orb-rim" />
      </div>

      <style>{`
        .orb-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 56px 0;
        }
        .orb-sphere {
          position: relative;
          width: 180px;
          height: 180px;
          border-radius: 50%;
          overflow: hidden;
          transition: transform 120ms ease-out, filter 120ms ease-out, box-shadow 120ms ease-out;
          background: radial-gradient(circle at 32% 26%, #2A4038 0%, #132420 62%, #0B1714 100%);
        }
        .orb-base {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 30% 24%, rgba(237,232,220,0.06), transparent 55%);
        }
        .orb-ribbon {
          position: absolute;
          width: 220%;
          height: 60px;
          left: -60%;
          border-radius: 50%;
          filter: blur(18px);
          mix-blend-mode: screen;
        }
        .orb-ribbon-1 {
          top: 28%;
          background: linear-gradient(90deg, transparent, #E8A33D 35%, #F4C579 55%, transparent);
          animation: orb-drift-1 7s ease-in-out infinite;
        }
        .orb-ribbon-2 {
          top: 48%;
          background: linear-gradient(90deg, transparent, #E4645A 30%, #E8A33D 60%, transparent);
          animation: orb-drift-2 9s ease-in-out infinite;
        }
        .orb-ribbon-3 {
          top: 64%;
          background: linear-gradient(90deg, transparent, #6FA88F 35%, #E8A33D 55%, transparent);
          animation: orb-drift-3 11s ease-in-out infinite;
        }
        @keyframes orb-drift-1 {
          0%, 100% { transform: translateX(-6%) rotate(-8deg) scaleY(1); }
          50% { transform: translateX(6%) rotate(4deg) scaleY(1.3); }
        }
        @keyframes orb-drift-2 {
          0%, 100% { transform: translateX(5%) rotate(6deg) scaleY(1.1); }
          50% { transform: translateX(-5%) rotate(-5deg) scaleY(0.9); }
        }
        @keyframes orb-drift-3 {
          0%, 100% { transform: translateX(-4%) rotate(3deg) scaleY(0.95); }
          50% { transform: translateX(4%) rotate(-6deg) scaleY(1.2); }
        }
        .orb-highlight {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 30% 22%, rgba(255,255,255,0.5), transparent 45%);
          pointer-events: none;
        }
        .orb-rim {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          box-shadow: inset 0 0 0 1px rgba(237,232,220,0.15), inset 0 -20px 40px rgba(0,0,0,0.4);
          pointer-events: none;
        }
        @media (prefers-reduced-motion: reduce) {
          .orb-ribbon { animation: none; }
        }
      `}</style>
    </div>
  );
};