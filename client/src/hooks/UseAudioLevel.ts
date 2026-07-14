import { useEffect, useRef, useState } from 'react';

/**
 * Analyzes a live MediaStreamTrack's volume in real time using the Web Audio API.
 * Returns a smoothed 0-1 level you can drive animations from.
 */
export function useAudioLevel(track: MediaStreamTrack | null | undefined): number {
  const [level, setLevel] = useState(0);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!track) {
      setLevel(0);
      return;
    }

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(new MediaStream([track]));
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.65;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
      setLevel(avg / 255);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      source.disconnect();
      audioContext.close();
    };
  }, [track]);

  return level;
}