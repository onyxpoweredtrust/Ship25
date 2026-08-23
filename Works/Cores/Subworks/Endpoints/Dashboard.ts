// Cores Dashboard
// designed and built by onyxlabs.

export interface DashboardOptions {
  appName: string;
  port: number;
  token: string;
  nonce: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

export function renderDashboard(options: DashboardOptions): string {
  const { appName, port, token, nonce } = options;
  const safeAppName = escapeHtml(appName);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeAppName} — Zero</title>
<style nonce="${nonce}">
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #0d0d0f;
    color: #e8e8ea;
    padding: 2.5rem 2rem;
  }
  @media (prefers-color-scheme: light) {
    body { background: #f5f5f7; color: #1a1a1e; }
  }
  header { margin-bottom: 2rem; }
  h1 { font-size: 1.4rem; margin: 0 0 0.25rem; font-weight: 600; }
  .sub { opacity: 0.6; font-size: 0.85rem; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0.75rem;
    margin-bottom: 2rem;
  }
  .tile {
    background: rgba(127,127,127,0.08);
    border: 1px solid rgba(127,127,127,0.15);
    border-radius: 10px;
    padding: 1rem;
  }
  .tile .label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.55; margin-bottom: 0.35rem; }
  .tile .value { font-size: 1.5rem; font-weight: 600; font-variant-numeric: tabular-nums; }
  .tile .value.unsupported { font-size: 0.95rem; opacity: 0.4; font-weight: 400; }
  section { margin-bottom: 2rem; }
  h2 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.6; margin: 0 0 0.75rem; }
  .module {
    display: flex; justify-content: space-between; align-items: center;
    padding: 0.6rem 0.9rem;
    background: rgba(127,127,127,0.06);
    border-radius: 8px;
    margin-bottom: 0.4rem;
    font-size: 0.9rem;
  }
  .module .name { font-weight: 600; }
  .module .runtime { opacity: 0.5; font-size: 0.78rem; }
  .module .right { display: flex; align-items: center; gap: 0.6rem; }
  .badge {
    font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em;
    padding: 0.15rem 0.5rem; border-radius: 6px;
    background: rgba(127,127,127,0.15); color: inherit; opacity: 0.6;
  }
  .badge.run { background: rgba(52,199,89,0.15); color: #34c759; opacity: 1; }
  .badge.throttle { background: rgba(255,204,0,0.15); color: #cc9900; opacity: 1; }
  .badge.suspend { background: rgba(255,59,48,0.15); color: #ff3b30; opacity: 1; }
  .status { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; opacity: 0.7; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #444; }
  .dot.live { background: #34c759; }
  #empty { opacity: 0.5; font-size: 0.85rem; }
</style>
</head>
<body>
  <header>
    <h1>${safeAppName}</h1>
    <div class="sub">Zero kernel · port ${port} · <span class="status"><span class="dot" id="dot"></span><span id="status-text">connecting…</span></span></div>
  </header>

  <section>
    <h2>System</h2>
    <div class="grid">
      <div class="tile"><div class="label">CPU</div><div class="value" id="cpu">—</div></div>
      <div class="tile"><div class="label">RAM</div><div class="value" id="ram">—</div></div>
      <div class="tile"><div class="label">Disk</div><div class="value" id="disk">—</div></div>
      <div class="tile"><div class="label">Temp</div><div class="value" id="temp">—</div></div>
      <div class="tile"><div class="label">Power</div><div class="value" id="power">—</div></div>
    </div>
  </section>

  <section>
    <h2>Modules</h2>
    <div id="modules"><div id="empty">Loading…</div></div>
  </section>

  <script nonce="${nonce}">
    const TOKEN = ${JSON.stringify(token)};

    // Built via DOM APIs (createElement/textContent), never innerHTML — a
    // module's id/path/runtime come from a scan of the App's own filesystem,
    // which isn't necessarily developer-controlled (e.g. a cloned repo with
    // an adversarial directory name), so this is real, not theoretical.
    async function loadModules() {
      const res = await fetch("/modules", { headers: { Authorization: "Bearer " + TOKEN } });
      const modules = await res.json();
      const container = document.getElementById("modules");
      container.textContent = "";

      if (!modules.length) {
        const empty = document.createElement("div");
        empty.id = "empty";
        empty.append("No modules registered yet — run ");
        const code = document.createElement("code");
        code.textContent = "ship agent add";
        empty.append(code, ".");
        container.append(empty);
        return;
      }

      for (const m of modules) {
        const row = document.createElement("div");
        row.className = "module";
        row.dataset.moduleId = m.id;

        const name = document.createElement("span");
        name.className = "name";
        name.textContent = m.runtime + " module";

        const right = document.createElement("span");
        right.className = "right";
        const runtime = document.createElement("span");
        runtime.className = "runtime";
        runtime.textContent = m.path;
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.id = "badge-" + m.id;
        badge.textContent = "—";
        right.append(runtime, badge);

        row.append(name, right);
        container.append(row);
      }
    }

    function setThrottleBadges(decisions) {
      for (const d of decisions || []) {
        const el = document.getElementById("badge-" + d.moduleId);
        if (!el) continue;
        el.textContent = d.action;
        el.className = "badge " + d.action;
      }
    }

    function setStat(id, value, unit, supported = true) {
      const el = document.getElementById(id);
      if (!supported) {
        el.textContent = "n/a";
        el.classList.add("unsupported");
        return;
      }
      el.classList.remove("unsupported");
      el.textContent = value + unit;
    }

    function connect() {
      const ws = new WebSocket("ws://" + location.host + "/agent/stream?token=" + encodeURIComponent(TOKEN));
      ws.onopen = () => {
        document.getElementById("dot").classList.add("live");
        document.getElementById("status-text").textContent = "live";
      };
      ws.onclose = () => {
        document.getElementById("dot").classList.remove("live");
        document.getElementById("status-text").textContent = "disconnected";
        setTimeout(connect, 2000);
      };
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type !== "tick") return;
        const s = msg.stats;
        setStat("cpu", s.cpuPercent.toFixed(1), "%");
        setStat("ram", s.ramPercent.toFixed(1), "%");
        setStat("disk", s.ssdPercent.toFixed(1), "%");
        setStat("temp", s.tempCelsius ? s.tempCelsius.toFixed(1) + "°C" : "n/a", "", !!s.tempCelsius);
        setStat("power", s.powerWatts.toFixed(2), "W", s.powerSupported);
        setThrottleBadges(msg.decisions);
      };
    }

    loadModules();
    connect();
  </script>
</body>
</html>
`;
}
