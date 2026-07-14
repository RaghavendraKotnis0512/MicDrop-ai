import { useState } from 'react';

interface LandingScreenProps {
  onStart: () => void;
}

const UPLOAD_URL = 'http://localhost:8001/upload-resume';
const DEMO_USER_ID = 'test-user-1'; // matches TEST_USER_ID in bot.py -- no auth system yet

const STEPS = [
  { num: '01', title: 'Upload your resume', desc: 'Optional. MicDrop reads it and can ask about specific projects you\'ve listed.' },
  { num: '02', title: 'Pick your track', desc: 'DSA questions pulled live from LeetCode, or questions built from your resume.' },
  { num: '03', title: 'Answer out loud', desc: 'MicDrop listens, scores your answer, and follows up when something\'s incomplete.' },
  { num: '04', title: 'Get your report', desc: 'A scored summary -- strengths, gaps, what to practice -- emailed to you.' },
];

const FEATURES = [
  { tag: 'LIVE', title: 'Real LeetCode questions', desc: 'Pulled live from LeetCode\'s current problem set by difficulty -- never a stale bank.' },
  { tag: 'ADAPTIVE', title: 'Follow-ups that make sense', desc: 'Incomplete answer? MicDrop probes deeper. Solid answer? It raises the difficulty.' },
  { tag: 'PERSONAL', title: 'Resume-aware questions', desc: 'Get asked about the actual projects and skills you\'ve listed.' },
  { tag: '<500ms', title: 'Real-time voice', desc: 'Talk over it, pause, think out loud -- barge-in feels like a real call.' },
];

export const LandingScreen = ({ onStart }: LandingScreenProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleUpload = async () => {
    if (!file) return;
    setStatus('uploading');
    setErrorMsg('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const resp = await fetch(`${UPLOAD_URL}?user_id=${DEMO_USER_ID}`, {
        method: 'POST',
        body: formData,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `Upload failed (${resp.status})`);
      }
      setStatus('done');
    } catch (e: any) {
      setStatus('error');
      const isNetworkError = e instanceof TypeError && e.message.includes('fetch');
      setErrorMsg(
        isNetworkError
          ? 'Could not reach the upload server. Is upload_server.py running on port 8001?'
          : e.message || 'Something went wrong'
      );
    }
  };

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        fontFamily: 'var(--font-sans)',
        color: 'var(--color-foreground)',
        background:
          'radial-gradient(circle at 15% 8%, rgba(232,163,61,0.05), transparent 42%), radial-gradient(circle at 85% 55%, rgba(228,100,90,0.04), transparent 42%)',
      }}
    >
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '72px 28px 56px' }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--color-primary)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 20,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--color-primary)',
                display: 'inline-block',
                boxShadow: '0 0 0 0 rgba(232,163,61,0.5)',
                animation: 'landing-pulse 2s infinite',
              }}
            />
            Live voice session
          </div>

          <h1
            style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              fontSize: 'clamp(28px, 4.5vw, 44px)',
              lineHeight: 1.22,
              marginBottom: 20,
            }}
          >
            Real DSA questions.<br />Real follow-ups.<br />
            <span style={{ color: 'var(--color-primary)' }}>Zero awkward silence.</span>
          </h1>

          <p
            style={{
              color: 'var(--color-muted-foreground)',
              fontSize: 15.5,
              maxWidth: 480,
              margin: '0 auto 40px',
              lineHeight: 1.65,
            }}
          >
            MicDrop is a voice AI interview coach that actually listens -- questions pulled
            live from LeetCode, adaptive follow-ups based on how you answer, and a scored
            report when you're done.
          </p>

          {/* Waveform */}
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 36, marginBottom: 44 }}
            aria-hidden="true"
          >
            {Array.from({ length: 14 }).map((_, i) => (
              <span
                key={i}
                style={{
                  width: 4,
                  height: [14, 24, 34, 20, 30, 12, 26, 32, 18, 22, 28, 16, 24, 20][i % 14],
                  background: i % 3 === 0 ? 'var(--color-primary)' : 'var(--color-muted-foreground)',
                  opacity: i % 3 === 0 ? 0.9 : 0.5,
                  borderRadius: 2,
                  animation: `landing-wave 1.2s ease-in-out infinite`,
                  animationDelay: `${i * 0.08}s`,
                }}
              />
            ))}
          </div>

          {/* Resume upload */}
          <div
            style={{
              background: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 14,
              padding: 26,
              maxWidth: 440,
              width: '100%',
              margin: '0 auto 28px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
              textAlign: 'left',
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>
              Upload your resume <span style={{ color: 'var(--color-muted-foreground)', fontWeight: 400 }}>(optional)</span>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--color-muted-foreground)', marginBottom: 16 }}>
              Get asked about your actual projects and skills instead of just generic questions.
            </p>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <label
                style={{
                  flex: 1,
                  fontSize: 12.5,
                  color: file ? 'var(--color-foreground)' : 'var(--color-muted-foreground)',
                  border: '1px dashed var(--color-border)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {file ? file.name : 'Choose a PDF…'}
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  style={{ display: 'none' }}
                />
              </label>
              <button
                onClick={handleUpload}
                disabled={!file || status === 'uploading'}
                style={{
                  background: 'var(--color-primary)',
                  color: 'var(--color-primary-foreground)',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  fontSize: 12.5,
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: 'none',
                  cursor: file ? 'pointer' : 'not-allowed',
                  opacity: file ? 1 : 0.5,
                  whiteSpace: 'nowrap',
                }}
              >
                {status === 'uploading' ? 'Uploading…' : 'Upload'}
              </button>
            </div>

            {status === 'done' && (
              <div style={{ fontSize: 12.5, color: '#6FA88F', marginTop: 12 }}>
                ✓ Resume uploaded -- ask for resume-based questions in the session
              </div>
            )}
            {status === 'error' && (
              <div style={{ fontSize: 12.5, color: '#E4645A', marginTop: 12, lineHeight: 1.5 }}>{errorMsg}</div>
            )}
          </div>

          <button
            onClick={onStart}
            style={{
              background: 'var(--color-primary)',
              color: 'var(--color-primary-foreground)',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              fontSize: 15,
              padding: '15px 30px',
              borderRadius: 9,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 10px 30px rgba(232,163,61,0.25)',
            }}
          >
            Start a mock interview →
          </button>
        </div>

        {/* How it works */}
        <div style={{ marginBottom: 56 }}>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, marginBottom: 24, textAlign: 'left' }}>
            How a session runs
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
            {STEPS.map((s) => (
              <div
                key={s.num}
                style={{
                  background: 'var(--color-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 10,
                  padding: '20px 16px',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary)', fontSize: 12, marginBottom: 10 }}>{s.num}</div>
                <h3 style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>{s.title}</h3>
                <p style={{ fontSize: 12, color: 'var(--color-muted-foreground)', lineHeight: 1.5 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Features */}
        <div>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, marginBottom: 24, textAlign: 'left' }}>
            Built for the real thing
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            {FEATURES.map((f) => (
              <div
                key={f.tag}
                style={{
                  background: 'var(--color-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 10,
                  padding: 20,
                  display: 'flex',
                  gap: 14,
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    color: 'var(--color-primary-foreground)',
                    background: 'var(--color-primary)',
                    padding: '3px 7px',
                    borderRadius: 4,
                    height: 'fit-content',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {f.tag}
                </span>
                <div>
                  <h3 style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 5 }}>{f.title}</h3>
                  <p style={{ fontSize: 12, color: 'var(--color-muted-foreground)', lineHeight: 1.5 }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes landing-pulse {
          0% { box-shadow: 0 0 0 0 rgba(232,163,61,0.45); }
          70% { box-shadow: 0 0 0 8px rgba(232,163,61,0); }
          100% { box-shadow: 0 0 0 0 rgba(232,163,61,0); }
        }
        @keyframes landing-wave {
          0%, 100% { transform: scaleY(0.6); }
          50% { transform: scaleY(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; }
        }
      `}</style>
    </div>
  );
};