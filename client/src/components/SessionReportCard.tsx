import type { SessionReport } from '../hooks/useSessionReport';

interface Props {
  report: SessionReport;
  onClose: () => void;
}

export const SessionReportCard = ({ report, onClose }: Props) => {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(11,23,20,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 14,
          padding: 32,
          maxWidth: 480,
          width: '100%',
          fontFamily: 'var(--font-sans)',
          color: 'var(--color-foreground)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--color-primary)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: 8,
          }}
        >
          Session complete
        </div>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, marginBottom: 20 }}>
          Your interview report
        </h2>

        <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          <div style={{ flex: 1, background: 'var(--color-background)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: 12, color: 'var(--color-muted-foreground)', marginBottom: 4 }}>Questions</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 600 }}>
              {report.questions_answered ?? '—'}
            </div>
          </div>
          <div style={{ flex: 1, background: 'var(--color-background)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: 12, color: 'var(--color-muted-foreground)', marginBottom: 4 }}>Avg score</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 600, color: 'var(--color-primary)' }}>
              {report.average_score ?? '—'}<span style={{ fontSize: 14, color: 'var(--color-muted-foreground)' }}>/10</span>
            </div>
          </div>
        </div>

        {report.summary_text && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--color-muted-foreground)' }}>Summary</div>
            <p style={{ fontSize: 14, lineHeight: 1.5 }}>{report.summary_text}</p>
          </div>
        )}

        {report.strengths && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#6FA88F' }}>Strengths</div>
            <p style={{ fontSize: 14, lineHeight: 1.5 }}>{report.strengths}</p>
          </div>
        )}

        {report.weaknesses && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#E4645A' }}>Areas to practice</div>
            <p style={{ fontSize: 14, lineHeight: 1.5 }}>{report.weaknesses}</p>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12.5, color: 'var(--color-muted-foreground)' }}>
            {report.email_sent ? '✓ Report emailed to you' : 'Report not emailed'}
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'var(--color-primary)',
              color: 'var(--color-primary-foreground)',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              fontSize: 13.5,
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};