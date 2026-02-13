// AI Usage Quota Widget for Übersicht
// Real-time Claude Code & Antigravity quota monitoring on your macOS desktop
// https://github.com/YOUR_USERNAME/ai-usage-widget

export const refreshFrequency = 120000; // 2 minutes

// Data source
export const command = `cat "$HOME/.ai-usage-widget/quota_data.json" 2>/dev/null || echo '{}'`;

// ─── Global State for Dragging ──────────────────────────────────────
const STORAGE_KEY = 'ai-usage-widget-pos';
let pos = { top: 555, left: 20 };

// Try to load saved position
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) pos = JSON.parse(saved);
} catch(e) {}

let isDragging = false;
let dragOffset = { x: 0, y: 0 };

// ─── Position & Layout ──────────────────────────────────────────────
// Full screen overlay that lets clicks pass through (pointer-events: none)
// The actual card will re-enable pointer-events.
export const className = `
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
  -webkit-font-smoothing: antialiased;
`;

// ─── Styles ─────────────────────────────────────────────────────────
const card = {
  position: 'absolute', // Vital for dragging
  width: '340px',
  background: 'rgba(30,30,30,0.85)',
  backdropFilter: 'blur(40px) saturate(1.8)',
  WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
  borderRadius: '16px',
  padding: '14px 16px',
  boxShadow: '0 4px 30px rgba(0,0,0,0.4), inset 0 0.5px 0 rgba(255,255,255,0.1)',
  border: '0.5px solid rgba(255,255,255,0.1)',
  color: 'rgba(255,255,255,0.92)',
  fontSize: '12px',
  overflow: 'hidden',
  wordBreak: 'break-all',
  pointerEvents: 'auto', // Re-enable clicks for the card
  cursor: 'grab',
};

const barBg = {
  height: '4px',
  background: 'rgba(255,255,255,0.08)',
  borderRadius: '3px',
  marginBottom: '6px',
  overflow: 'hidden',
};

// ─── Helpers ────────────────────────────────────────────────────────
function gc(p) {
  return p >= 90 ? '#ff453a' : p >= 70 ? '#ff9f0a' : '#30d158';
}

function mc(l) {
  l = l.toLowerCase();
  return l.includes('claude') ? '#a78bfa' : l.includes('gpt') ? '#ff9f0a' : '#64d2ff';
}

function fr(iso) {
  if (!iso) return '';
  var d = new Date(iso) - new Date();
  if (d <= 0) return 'resetting';
  var h = Math.floor(d / 3600000);
  var m = Math.floor((d % 3600000) / 60000);
  return h > 0 ? h + 'h' + m + 'm' : m + 'm';
}

function sl(s) {
  return s
    .replace(' (Thinking)', ' ⚡')
    .replace('(High)', 'H')
    .replace('(Low)', 'L')
    .replace('(Medium)', 'M');
}

// ─── Dnd Handlers ───────────────────────────────────────────────────
function onMouseDown(e) {
  isDragging = true;
  const cardNode = document.getElementById('ai-usage-card');
  if (cardNode) {
    cardNode.style.cursor = 'grabbing';
    cardNode.style.transition = 'none'; // Disable transition during drag
    const rect = cardNode.getBoundingClientRect();
    dragOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }
  
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  e.preventDefault();
}

function onMouseMove(e) {
  if (!isDragging) return;
  
  const newLeft = e.clientX - dragOffset.x;
  const newTop = e.clientY - dragOffset.y;
  
  // Update state immediately
  pos = { top: newTop, left: newLeft };
  
  // Direct DOM manipulation for smooth 60fps
  const cardNode = document.getElementById('ai-usage-card');
  if (cardNode) {
    cardNode.style.left = newLeft + 'px';
    cardNode.style.top = newTop + 'px';
  }
}

function onMouseUp(e) {
  if (!isDragging) return;
  isDragging = false;
  
  const cardNode = document.getElementById('ai-usage-card');
  if (cardNode) cardNode.style.cursor = 'grab';

  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
  
  // Persist
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
}


// ─── Components ─────────────────────────────────────────────────────
const Bar = ({ pct, color }) => (
  <div style={barBg}>
    <div style={{
      width: Math.min(pct, 100) + '%',
      height: '100%',
      background: color,
      borderRadius: '2px',
    }} />
  </div>
);

const Row = ({ left, right, rc }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2px',
    fontSize: '12px',
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
      <div id="ai-usage-card" style={{...card, top: pos.top, left: pos.left}} onMouseDown={onMouseDown}>
        <div style={{ fontWeight: 600, fontSize: '10px' }}>⏳ Loading quota...</div>
        <div style={{ fontSize: '9px', opacity: 0.5, marginTop: '2px' }}>
          Waiting for data
        </div>
      </div>
    );
  }

  var c = data.claude, a = data.antigravity;

  var extraText = '';
  if (c && c.extra_usage) {
    var used = (c.extra_usage.used_cents / 100).toFixed(2);
    var limit = Math.round(c.extra_usage.limit_cents / 100);
    extraText = '$' + used + '/$' + limit;
  }

  // Pass current pos to style to ensure it stays put on refresh
  return (
    <div 
      id="ai-usage-card"
      style={{
        ...card, 
        top: pos.top, 
        left: pos.left,
        transition: isDragging ? 'none' : 'box-shadow 0.2s ease', 
      }} 
      onMouseDown={onMouseDown}
    >
      {/* ── Claude Code ── */}
      {c && (
        <div style={{ marginBottom: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>💜 Claude Code</span>
            
            {!c.error && (
              <span style={{
                fontSize: '10px', fontWeight: 500,
                padding: '2px 8px', borderRadius: '10px',
                background: 'rgba(167,139,250,0.2)', color: '#a78bfa',
              }}>
                Weekly {Math.round(c.weekly?.pct_used || 0)}%
              </span>
            )}
            {c.error && (
               <span style={{
                fontSize: '10px', fontWeight: 600,
                color: '#ff453a',
              }}>
                ⚠️ {c.error}
              </span>
            )}
          </div>

          {c.error ? (
             <div style={{
                fontSize: '11px',
                color: 'rgba(255,255,255,0.6)',
                padding: '8px',
                background: 'rgba(255,69,58,0.1)',
                borderRadius: '6px',
                border: '1px solid rgba(255,69,58,0.2)'
             }}>
               {c.detail || "Authentication failed"}
             </div>
          ) : (
            <div>
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
        </div>
      )}

      {/* ── Divider ── */}
      {c && a && <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', marginBottom: '10px' }} />}

      {/* ── Antigravity ── */}
      {a && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>🔮 Antigravity</span>
            
             {!a.error && (
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)' }}>
                {a.email || ''}
              </span>
            )}
             {a.error && (
               <span style={{
                fontSize: '10px', fontWeight: 600,
                color: '#ff453a',
              }}>
                ⚠️ {a.error}
              </span>
            )}
          </div>

          {a.error ? (
              <div style={{
                fontSize: '11px',
                color: 'rgba(255,255,255,0.6)',
                padding: '8px',
                background: 'rgba(255,69,58,0.1)',
                borderRadius: '6px',
                border: '1px solid rgba(255,69,58,0.2)'
             }}>
               {a.detail || "Client error"}
             </div>
          ) : (
            <div>
              {a.prompt_credits_monthly > 0 && (
                <div style={{ marginBottom: '6px' }}>
                  <Row
                    left="Prompt Credits"
                    right={a.prompt_credits + ' / ' + a.prompt_credits_monthly}
                    rc={gc(a.prompt_credits_used_pct || 0)}
                  />
                  <Bar pct={a.prompt_credits_used_pct || 0} color="#64d2ff" />
                </div>
              )}
              {a.models && a.models.map((m, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '2px' }}>
                    <span style={{ color: mc(m.label) }}>{sl(m.label)}</span>
                    <span style={{ color: gc(m.pct_used) }}>{m.pct_used}% · {fr(m.reset_time)}</span>
                  </div>
                  <Bar pct={m.pct_used} color={mc(m.label)} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── No data ── */}
      {!c && !a && (
        <div style={{ fontWeight: 600 }}>
          No data available
          <div style={{ fontSize: '9px', fontWeight: 400, marginTop: '6px', opacity: 0.7 }}>
            Check: ~/.ai-usage-widget/quota_data.json
          </div>
          <pre style={{ fontSize: '8px', marginTop: '4px', overflow: 'hidden' }}>
            Debug: {output ? output.slice(0, 50) + '...' : 'Empty output'}
          </pre>
        </div>
      )}
    </div>
  );
};
