// AI Usage Quota Widget for Übersicht
// Real-time Claude Code & Antigravity quota monitoring on your macOS desktop
// https://github.com/YOUR_USERNAME/ai-usage-widget

export const refreshFrequency = 120000; // 2 minutes

// Data source — install.sh sets up a LaunchAgent to refresh this file every 2 min
export const command = `cat "$HOME/.ai-usage-widget/quota_data.json" 2>/dev/null || echo '{}'`;

// ─── Position & Layout ──────────────────────────────────────────────
// Adjust top/left to reposition on your desktop
export const className = `
  position: absolute;
  top: 555px;
  left: 20px;
  width: 300px;
  max-width: 300px;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
  -webkit-font-smoothing: antialiased;
  z-index: 1;
`;

// ─── Styles ─────────────────────────────────────────────────────────
const card = {
  background: 'rgba(30,30,30,0.82)',
  backdropFilter: 'blur(30px) saturate(1.8)',
  WebkitBackdropFilter: 'blur(30px) saturate(1.8)',
  borderRadius: '16px',
  padding: '14px 16px',
  boxShadow: '0 2px 20px rgba(0,0,0,0.3), inset 0 0.5px 0 rgba(255,255,255,0.08)',
  border: '0.5px solid rgba(255,255,255,0.1)',
  color: 'rgba(255,255,255,0.92)',
  fontSize: '12px',
  overflow: 'hidden',
  wordBreak: 'break-all',
  maxWidth: '300px',
};

const barBg = {
  height: '4px',
  background: 'rgba(255,255,255,0.08)',
  borderRadius: '3px',
  marginBottom: '8px',
  overflow: 'hidden',
};

// ─── Helpers ────────────────────────────────────────────────────────
// Color by usage percentage: green → orange → red
function gc(p) {
  return p >= 90 ? '#ff453a' : p >= 70 ? '#ff9f0a' : '#30d158';
}

// Color by model name
function mc(l) {
  l = l.toLowerCase();
  return l.includes('claude') ? '#a78bfa' : l.includes('gpt') ? '#ff9f0a' : '#64d2ff';
}

// Format ISO reset time to countdown
function fr(iso) {
  if (!iso) return '';
  var d = new Date(iso) - new Date();
  if (d <= 0) return 'resetting';
  var h = Math.floor(d / 3600000);
  var m = Math.floor((d % 3600000) / 60000);
  return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
}

// Shorten model labels
function sl(s) {
  return s
    .replace(' (Thinking)', ' ⚡')
    .replace('(High)', 'H')
    .replace('(Low)', 'L')
    .replace('(Medium)', 'M');
}

// ─── Components ─────────────────────────────────────────────────────
const Bar = ({ pct, color }) => (
  <div style={barBg}>
    <div style={{
      width: Math.min(pct, 100) + '%',
      height: '100%',
      background: color,
      borderRadius: '3px',
    }} />
  </div>
);

const Row = ({ left, right, rc }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2px',
    fontSize: '11px',
  }}>
    <span>{left}</span>
    <span style={{ color: rc || 'inherit' }}>{right}</span>
  </div>
);

// ─── Render ─────────────────────────────────────────────────────────
export const render = ({ output, error }) => {
  var data;
  try {
    data = JSON.parse(output);
  } catch (e) {
    return (
      <div style={card}>
        <div style={{ fontWeight: 600 }}>⏳ Loading quota...</div>
        <div style={{
          fontSize: '10px',
          color: 'rgba(255,255,255,0.45)',
          marginTop: '4px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          Run: ~/.ai-usage-widget/collect_quota.py
        </div>
      </div>
    );
  }

  var c = data.claude, a = data.antigravity;

  // Format extra usage text
  var extraText = '';
  if (c && c.extra_usage) {
    var used = (c.extra_usage.used_cents / 100).toFixed(2);
    var limit = Math.round(c.extra_usage.limit_cents / 100);
    extraText = '$' + used + ' / $' + limit;
  }

  return (
    <div style={card}>
      {/* ── Claude Code ── */}
      {c && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>💜 Claude Code</span>
            <span style={{
              fontSize: '10px', fontWeight: 500,
              padding: '2px 8px', borderRadius: '10px',
              background: 'rgba(167,139,250,0.2)', color: '#a78bfa',
            }}>
              Weekly {Math.round(c.weekly?.pct_used || 0)}%
            </span>
          </div>
          <Row left="Session" right={Math.round(c.session?.pct_used || 0) + '%'} rc={gc(c.session?.pct_used || 0)} />
          <Bar pct={c.session?.pct_used || 0} color={gc(c.session?.pct_used || 0)} />
          <Row left="Weekly" right={Math.round(c.weekly?.pct_used || 0) + '% · ' + fr(c.weekly?.resets_at)} rc={gc(c.weekly?.pct_used || 0)} />
          <Bar pct={c.weekly?.pct_used || 0} color={gc(c.weekly?.pct_used || 0)} />
          {c.extra_usage && (
            <div>
              <Row left="Extra" right={extraText} rc="#64d2ff" />
              <Bar pct={c.extra_usage.pct_used} color="#64d2ff" />
            </div>
          )}
        </div>
      )}

      {/* ── Divider ── */}
      {c && a && <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', marginBottom: '10px' }} />}

      {/* ── Antigravity ── */}
      {a && a.models && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>🔮 Antigravity</span>
            <div>
              <span style={{
                fontSize: '10px', fontWeight: 500,
                padding: '2px 8px', borderRadius: '10px',
                background: 'rgba(100,210,255,0.2)', color: '#64d2ff',
                marginRight: '6px',
              }}>{a.plan}</span>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)' }}>
                {a.prompt_credits}cr
              </span>
            </div>
          </div>
          {a.models.map((m, i) => (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px' }}>
                <span style={{ color: mc(m.label) }}>{sl(m.label)}</span>
                <span style={{ color: gc(m.pct_used) }}>{m.pct_used}% · {fr(m.reset_time)}</span>
              </div>
              <Bar pct={m.pct_used} color={mc(m.label)} />
            </div>
          ))}
        </div>
      )}

      {/* ── No data ── */}
      {!c && !a && <div style={{ fontWeight: 600 }}>No data available</div>}
    </div>
  );
};
