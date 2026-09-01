/**
 * Styles for the in-page UI, injected into a shadow root so nothing leaks in or
 * out of the host page.
 */
export const CONTENT_STYLES = /* css */ `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }

.cbc-root {
  --cbc-bg: #ffffff;
  --cbc-fg: #0f172a;
  --cbc-muted: #64748b;
  --cbc-border: #e2e8f0;
  --cbc-accent: #4f46e5;
  --cbc-accent-fg: #ffffff;
  --cbc-surface: #f8fafc;
  --cbc-gpu: #0d9488;
  --cbc-shadow: 0 10px 30px -8px rgba(15, 23, 42, .35), 0 2px 8px -2px rgba(15, 23, 42, .2);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: var(--cbc-fg);
  position: fixed;
  z-index: 2147483647;
  line-height: 1.4;
}

.cbc-trigger {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 11px; background: var(--cbc-accent); color: var(--cbc-accent-fg);
  border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;
  box-shadow: var(--cbc-shadow); transition: transform .08s ease, filter .15s ease;
}
.cbc-trigger:hover { filter: brightness(1.07); }
.cbc-trigger:active { transform: translateY(1px); }
.cbc-bolt { font-size: 14px; line-height: 1; }

.cbc-card {
  width: 320px; max-width: calc(100vw - 24px);
  background: var(--cbc-bg); border: 1px solid var(--cbc-border);
  border-radius: 14px; box-shadow: var(--cbc-shadow); overflow: hidden;
}
.cbc-card-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; border-bottom: 1px solid var(--cbc-border); background: var(--cbc-surface);
}
.cbc-brand { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; letter-spacing: .02em; color: var(--cbc-muted); text-transform: uppercase; }
.cbc-brand .cbc-bolt { color: var(--cbc-accent); font-size: 13px; }
.cbc-badge { font-size: 10px; font-weight: 800; letter-spacing: .04em; padding: 2px 7px; border-radius: 999px; color: #fff; background: var(--cbc-accent); }
.cbc-badge.gpu { background: var(--cbc-gpu); }
.cbc-close { border: none; background: transparent; color: var(--cbc-muted); cursor: pointer; font-size: 18px; line-height: 1; padding: 2px 4px; border-radius: 6px; }
.cbc-close:hover { background: var(--cbc-border); color: var(--cbc-fg); }

.cbc-body { padding: 14px 16px 16px; }
.cbc-cpu-name { font-size: 15px; font-weight: 700; margin: 0 0 12px; word-break: break-word; }

.cbc-score-block { text-align: center; padding: 6px 0 10px; }
.cbc-score-label { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--cbc-muted); }
.cbc-score-value { font-size: 40px; font-weight: 800; letter-spacing: -.02em; color: var(--cbc-fg); margin: 2px 0 0; font-variant-numeric: tabular-nums; }

.cbc-meta { display: flex; gap: 10px; margin-top: 8px; }
.cbc-meta-item { flex: 1; text-align: center; background: var(--cbc-surface); border: 1px solid var(--cbc-border); border-radius: 10px; padding: 8px 6px; }
.cbc-meta-k { font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--cbc-muted); }
.cbc-meta-v { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 2px; }

.cbc-source { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 12px; font-size: 11px; color: var(--cbc-muted); }
.cbc-source b { color: var(--cbc-accent); font-weight: 700; }
.cbc-source .cbc-source-link { color: var(--cbc-accent); font-weight: 700; text-decoration: none; cursor: pointer; }
.cbc-source .cbc-source-link:hover { text-decoration: underline; }
.cbc-source.cbc-stale b { color: #b45309; }

.cbc-actions { display: flex; gap: 8px; margin-top: 14px; }
.cbc-btn {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 9px 10px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer;
  border: 1px solid var(--cbc-border); background: var(--cbc-bg); color: var(--cbc-fg);
  transition: background .12s ease, filter .12s ease;
}
.cbc-btn:hover { background: var(--cbc-surface); }
.cbc-btn-primary { background: var(--cbc-accent); color: var(--cbc-accent-fg); border-color: transparent; }
.cbc-btn-primary:hover { filter: brightness(1.07); background: var(--cbc-accent); }
.cbc-btn[disabled] { opacity: .6; cursor: default; }

.cbc-loading { display: flex; align-items: center; gap: 10px; padding: 6px 2px; color: var(--cbc-muted); font-size: 13px; }
.cbc-spinner { width: 16px; height: 16px; border: 2px solid var(--cbc-border); border-top-color: var(--cbc-accent); border-radius: 50%; animation: cbc-spin .7s linear infinite; }
@keyframes cbc-spin { to { transform: rotate(360deg); } }

.cbc-msg { font-size: 13px; color: var(--cbc-fg); }
.cbc-msg-sub { font-size: 12px; color: var(--cbc-muted); margin-top: 4px; }
.cbc-msg-icon { font-size: 22px; }

.cbc-cand-head { font-size: 13px; font-weight: 600; margin: 0 0 4px; }
.cbc-cand-sub { font-size: 12px; color: var(--cbc-muted); margin: 0 0 10px; }
.cbc-cand-list { display: flex; flex-direction: column; gap: 6px; max-height: 260px; overflow-y: auto; }
.cbc-cand {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 9px 11px; border: 1px solid var(--cbc-border); border-radius: 10px; background: var(--cbc-bg);
  color: var(--cbc-fg); font-family: inherit; cursor: pointer; text-align: left; width: 100%;
}
.cbc-cand:hover { border-color: var(--cbc-accent); background: var(--cbc-surface); }
.cbc-cand-name { font-size: 13px; font-weight: 600; }
.cbc-cand-cat { font-size: 11px; color: var(--cbc-muted); }
.cbc-cand-mark { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--cbc-accent); white-space: nowrap; }

@media (prefers-color-scheme: dark) {
  .cbc-root {
    --cbc-bg: #0f172a;
    --cbc-fg: #f1f5f9;
    --cbc-muted: #94a3b8;
    --cbc-border: #1e293b;
    --cbc-accent: #818cf8;
    --cbc-accent-fg: #0b1220;
    --cbc-surface: #111c33;
    --cbc-gpu: #2dd4bf;
  }
}
`;
