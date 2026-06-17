import { SECTIONS } from "./ui.js";

/* ── Shared CSS variables reused in both tabs ── */
const BASE_STYLES = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --green-dark:  #1b4332;
    --green:       #2d6a4f;
    --green-mid:   #40916c;
    --green-pale:  #d8f3dc;
    --off-white:   #f5f5f0;
    --surface:     #ffffff;
    --border:      #c8ddd0;
    --text:        #1a1a18;
    --muted:       #4a6355;
    --red-bg:      #fff0f0;
    --red-border:  #f5c6cb;
    --red-text:    #842029;
    --radius:      10px;
    --shadow:      0 2px 12px rgba(0,0,0,.08);
  }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    background: var(--off-white);
    color: var(--text);
    min-height: 100vh;
  }
  nav {
    background: var(--green-dark);
    padding: .85rem 1.5rem;
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .nav-brand { color: #fff; font-size: .9rem; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
  .nav-brand span { color: var(--green-pale); }
  .nav-back { color: var(--green-pale); font-size: .8rem; text-decoration: none; margin-left: auto; }
  .nav-back:hover { text-decoration: underline; }
  .nav-logout { background: none; border: 1px solid rgba(255,255,255,.35); color: var(--green-pale); font-size: .8rem; border-radius: 6px; padding: .3rem .75rem; cursor: pointer; transition: background .15s; }
  .nav-logout:hover { background: rgba(255,255,255,.12); }

  /* TABS */
  .tab-bar {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    display: flex;
    padding: 0 1.5rem;
    gap: .25rem;
  }
  .tab-btn {
    padding: .85rem 1.25rem;
    font-size: .9rem;
    font-weight: 600;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--muted);
    border-bottom: 3px solid transparent;
    transition: color .15s, border-color .15s;
  }
  .tab-btn.active { color: var(--green-dark); border-bottom-color: var(--green-dark); }
  .tab-btn:hover:not(.active) { color: var(--green); }

  .tab-panel { display: none; padding: 2rem 1.5rem; max-width: 860px; margin: 0 auto; }
  .tab-panel.active { display: block; }

  /* CARDS */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 1.75rem;
    margin-bottom: 1.5rem;
  }

  /* FORM CONTROLS */
  label {
    display: block;
    font-size: .82rem;
    font-weight: 600;
    color: var(--green);
    margin-bottom: .4rem;
  }
  select, textarea, input[type=text], input[type=password] {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: .65rem .85rem;
    font-size: .95rem;
    color: var(--text);
    background: var(--off-white);
    outline: none;
    transition: border-color .15s;
    font-family: inherit;
  }
  select:focus, textarea:focus, input:focus { border-color: var(--green-mid); }
  textarea { resize: vertical; min-height: 130px; line-height: 1.55; }
  .field { margin-bottom: 1.25rem; }

  /* BUTTONS */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: .5rem;
    background: var(--green-dark);
    color: #fff;
    border: none;
    border-radius: var(--radius);
    padding: .75rem 1.5rem;
    font-size: .95rem;
    font-weight: 600;
    cursor: pointer;
    transition: background .15s;
  }
  .btn:hover:not(:disabled) { background: var(--green); }
  .btn:disabled { opacity: .5; cursor: not-allowed; }
  .btn-sm {
    padding: .5rem 1rem;
    font-size: .82rem;
  }
  .btn-ghost {
    background: var(--green-pale);
    color: var(--green-dark);
    border: 1px solid var(--border);
  }
  .btn-ghost:hover:not(:disabled) { background: #b7e4c7; }

  /* SPINNER */
  .spinner {
    display: none;
    width: 16px; height: 16px;
    border: 2px solid rgba(255,255,255,.35);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin .7s linear infinite;
  }
  .spinner-dark {
    border-color: rgba(27,67,50,.25);
    border-top-color: var(--green-dark);
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ERROR / INFO BANNERS */
  .banner-error {
    background: var(--red-bg);
    border: 1px solid var(--red-border);
    border-radius: var(--radius);
    padding: .8rem 1rem;
    color: var(--red-text);
    font-size: .88rem;
    margin-bottom: 1rem;
    display: none;
  }
  .banner-info {
    background: var(--green-pale);
    border: 1px solid var(--border);
    border-left: 4px solid var(--green-mid);
    border-radius: var(--radius);
    padding: .8rem 1rem;
    color: var(--green-dark);
    font-size: .85rem;
    margin-bottom: 1rem;
  }

  /* MATCH CARDS */
  .match-grid { display: grid; gap: 1.25rem; }
  .match-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    overflow: hidden;
  }
  .match-header {
    background: var(--green-dark);
    color: #fff;
    padding: 1rem 1.25rem;
    display: flex;
    align-items: center;
    gap: .75rem;
  }
  .match-rank {
    background: var(--green-pale);
    color: var(--green-dark);
    font-weight: 800;
    font-size: .85rem;
    width: 2rem; height: 2rem;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .match-title { font-size: 1rem; font-weight: 700; flex: 1; }
  .match-score {
    font-size: .8rem;
    font-weight: 600;
    background: rgba(255,255,255,.15);
    border-radius: 20px;
    padding: .2rem .65rem;
  }
  .match-body { padding: 1.25rem; }
  .match-section { margin-bottom: 1rem; }
  .match-section:last-child { margin-bottom: 0; }
  .match-label {
    font-size: .72rem;
    font-weight: 700;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--green);
    margin-bottom: .3rem;
  }
  .match-text { font-size: .88rem; color: var(--text); line-height: 1.55; }
  .next-steps { list-style: none; padding: 0; }
  .next-steps li {
    font-size: .85rem;
    color: var(--text);
    padding: .3rem 0 .3rem 0;
    line-height: 1.4;
  }
  .next-step-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-size: .85rem;
    line-height: 1.4;
    padding: .35rem .6rem .35rem 1.4rem;
    position: relative;
    text-align: left;
    width: 100%;
    cursor: pointer;
    transition: border-color .15s, background .15s;
  }
  .next-step-btn::before {
    content: '›';
    position: absolute; left: .5rem;
    color: var(--green-mid);
    font-weight: 700;
  }
  .next-step-btn:hover { border-color: var(--green-mid); background: rgba(0,128,64,.05); }

  /* Chat panel */
  #step-chat-overlay {
    display: none;
    position: fixed; inset: 0;
    background: rgba(0,0,0,.35);
    z-index: 1000;
    align-items: flex-end;
    justify-content: center;
  }
  #step-chat-overlay.open { display: flex; }
  #step-chat-panel {
    background: var(--white);
    border-radius: var(--radius) var(--radius) 0 0;
    box-shadow: 0 -4px 24px rgba(0,0,0,.15);
    display: flex;
    flex-direction: column;
    height: 70vh;
    max-width: 640px;
    width: 100%;
  }
  #step-chat-header {
    align-items: center;
    border-bottom: 1px solid var(--border);
    display: flex;
    gap: .75rem;
    justify-content: space-between;
    padding: .85rem 1rem;
  }
  #step-chat-title {
    font-size: .88rem;
    font-weight: 600;
    color: var(--text);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  #step-chat-close {
    background: none; border: none; cursor: pointer;
    color: var(--text-muted); font-size: 1.2rem; line-height: 1; padding: 0;
  }
  #step-chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: .75rem;
  }
  .chat-msg {
    border-radius: var(--radius);
    font-size: .85rem;
    line-height: 1.55;
    max-width: 85%;
    padding: .55rem .8rem;
    white-space: pre-wrap;
  }
  .chat-msg.user { align-self: flex-end; background: var(--green-dark); color: #fff; }
  .chat-msg.assistant { align-self: flex-start; background: var(--off-white); border: 1px solid var(--border); color: var(--text); }
  #step-chat-form {
    border-top: 1px solid var(--border);
    display: flex;
    gap: .5rem;
    padding: .75rem 1rem;
  }
  #step-chat-input {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    flex: 1;
    font-size: .88rem;
    padding: .45rem .7rem;
    outline: none;
    resize: none;
  }
  #step-chat-input:focus { border-color: var(--green-mid); }
  #step-chat-send {
    align-self: flex-end;
  }
  .draft-output {
    background: var(--off-white);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1rem;
    white-space: pre-wrap;
    font-size: .85rem;
    line-height: 1.7;
    max-height: 420px;
    overflow-y: auto;
    margin-top: .75rem;
    display: none;
  }

  /* STEPPER */
  .stepper {
    display: flex;
    gap: .3rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }
  .step-dot {
    width: .55rem; height: .55rem;
    border-radius: 50%;
    background: var(--border);
    transition: background .2s;
  }
  .step-dot.done { background: var(--green-mid); }
  .step-dot.active { background: var(--green-dark); }

  .choice-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: .6rem;
    margin-top: .5rem;
  }
  .choice-label {
    display: flex;
    align-items: flex-start;
    gap: .55rem;
    background: var(--off-white);
    border: 1.5px solid var(--border);
    border-radius: var(--radius);
    padding: .65rem .85rem;
    cursor: pointer;
    font-size: .88rem;
    line-height: 1.4;
    transition: border-color .15s, background .15s;
    user-select: none;
  }
  .choice-label:hover { border-color: var(--green-mid); background: var(--green-pale); }
  .choice-label input { margin-top: .15rem; accent-color: var(--green-dark); }
  .choice-label.selected { border-color: var(--green-dark); background: var(--green-pale); }

  footer {
    text-align: center;
    font-size: .72rem;
    color: var(--muted);
    padding: 2rem 1rem 1.5rem;
  }
`;

/* ── Login gate page ── */
function renderLoginGate(error = false) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Admin — CCC License Assistant</title>
  <style>
    ${BASE_STYLES}
    .login-wrap {
      min-height: calc(100vh - 52px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .login-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 2.5rem 2rem;
      width: 100%;
      max-width: 400px;
    }
    .login-card h1 { font-size: 1.25rem; color: var(--green-dark); margin-bottom: .35rem; }
    .login-card p { font-size: .85rem; color: var(--muted); margin-bottom: 1.5rem; }
    .divider { display: flex; align-items: center; gap: .75rem; margin: 1rem 0; color: var(--muted); font-size: .8rem; }
    .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--border); }
    .btn-demo { width: 100%; justify-content: center; background: transparent; border: 1px solid var(--border); color: var(--muted); margin-top: 0; }
    .btn-demo:hover { background: var(--surface-alt, #f5f5f5); color: var(--text); }
  </style>
</head>
<body>
  <nav>
    <div class="nav-brand">CCC<span>Assist</span> <span style="font-weight:300;opacity:.6">/ Admin</span></div>
    <a href="/" class="nav-back">&larr; Back to site</a>
  </nav>
  <div class="login-wrap">
    <div class="login-card">
      <h1>Admin Access</h1>
      <p>Enter your admin token to access the CCC License Application Assistant.</p>
      ${error ? '<div class="banner-error" style="display:block">Incorrect token. Please try again.</div>' : ""}
      <button id="demo-btn" class="btn btn-demo">Enter as demo user</button>
      <div class="divider">or</div>
      <form id="login-form">
        <div class="field">
          <label for="token-input">Admin Token</label>
          <input type="password" id="token-input" name="token" autocomplete="current-password" placeholder="Paste your admin token" />
        </div>
        <button type="submit" class="btn" style="width:100%;justify-content:center;margin-top:.5rem">
          <span class="spinner" id="login-spinner"></span>
          <span id="login-label">Continue</span>
        </button>
      </form>
    </div>
  </div>
  <script>
    const form = document.getElementById('login-form');
    const spinner = document.getElementById('login-spinner');
    const label = document.getElementById('login-label');

    async function attemptLogin(token) {
      spinner.style.display = 'inline-block';
      label.textContent = 'Verifying…';
      try {
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
        });
        if (res.ok) {
          sessionStorage.setItem('admin_token', token);
          window.location.href = '/admin';
        } else {
          window.location.href = '/admin?error=1';
        }
      } catch {
        window.location.href = '/admin?error=1';
      }
    }

    document.getElementById('demo-btn').addEventListener('click', () => {
      attemptLogin('demo');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = document.getElementById('token-input').value.trim();
      if (!token) return;
      attemptLogin(token);
    });
  </script>
</body>
</html>`;
}

/* ── Full admin dashboard ── */
export function renderAdmin(isError = false, isAuthed = false) {
  if (!isAuthed) return renderLoginGate(isError);

  const sectionOptions = SECTIONS.map(
    (s) => `<option value="${s}">${s}</option>`
  ).join("\n");

  const QUESTIONS = [
    {
      id: "interests",
      title: "What are your cooperative's primary interests?",
      multi: true,
      choices: [
        { value: "cultivation", label: "Cultivation", hint: "Growing cannabis plants" },
        { value: "retail", label: "Retail / Dispensary", hint: "Selling directly to consumers" },
        { value: "delivery", label: "Delivery", hint: "Consumer delivery operations" },
        { value: "manufacturing", label: "Manufacturing", hint: "Concentrates, edibles, products" },
        { value: "testing", label: "Testing", hint: "Lab testing services" },
        { value: "social_use", label: "Social Use / Consumption", hint: "On-site consumption venue" },
      ],
    },
    {
      id: "skills",
      title: "What skills does your core team bring?",
      multi: true,
      choices: [
        { value: "agriculture", label: "Agriculture / Horticulture", hint: "Growing and plant science" },
        { value: "business", label: "Business / Finance", hint: "Operations, accounting, mgmt" },
        { value: "compliance", label: "Legal / Compliance", hint: "Regulatory and licensing" },
        { value: "community", label: "Community Organizing", hint: "Outreach and coalition building" },
        { value: "retail_ops", label: "Retail Operations", hint: "Customer service, POS, inventory" },
        { value: "none", label: "We're building our team", hint: "Skills to be hired" },
      ],
    },
    {
      id: "capital",
      title: "What is your cooperative's available capital range?",
      multi: false,
      choices: [
        { value: "under_50k", label: "Under $50,000", hint: "Early-stage / pre-funding" },
        { value: "50k_250k", label: "$50,000 – $250,000", hint: "Seed-stage cooperative" },
        { value: "250k_1m", label: "$250,000 – $1,000,000", hint: "Established or funded co-op" },
        { value: "over_1m", label: "Over $1,000,000", hint: "Well-capitalized organization" },
      ],
    },
    {
      id: "coop_model",
      title: "Which cooperative model do you prefer?",
      multi: false,
      choices: [
        { value: "worker", label: "Worker Cooperative", hint: "Owned and governed by employees" },
        { value: "consumer", label: "Consumer Cooperative", hint: "Owned by member-customers" },
        { value: "producer", label: "Producer Cooperative", hint: "Owned by producers / growers" },
        { value: "hybrid", label: "Hybrid / Multi-Stakeholder", hint: "Mix of the above" },
        { value: "unsure", label: "Not sure yet", hint: "We need guidance on structure" },
      ],
    },
    {
      id: "equity",
      title: "Does your cooperative qualify for social equity designations?",
      multi: true,
      choices: [
        { value: "eea", label: "Economic Empowerment Applicant", hint: "Meets CCC EEA criteria" },
        { value: "sep", label: "Social Equity Program Participant", hint: "CCC SEP participant" },
        { value: "justice", label: "Justice-Involved Individuals", hint: "Prior cannabis convictions" },
        { value: "none", label: "None of the above", hint: "Standard applicant pathway" },
      ],
    },
    {
      id: "location",
      title: "Where in Massachusetts is your cooperative based?",
      multi: false,
      choices: [
        { value: "barnstable", label: "Barnstable County", hint: "Cape Cod" },
        { value: "berkshire", label: "Berkshire County", hint: "Western MA" },
        { value: "bristol", label: "Bristol County", hint: "Fall River / New Bedford area" },
        { value: "dukes", label: "Dukes County", hint: "Martha's Vineyard" },
        { value: "essex", label: "Essex County", hint: "North Shore / Lawrence" },
        { value: "franklin", label: "Franklin County", hint: "Pioneer Valley north" },
        { value: "hampden", label: "Hampden County", hint: "Springfield area" },
        { value: "hampshire", label: "Hampshire County", hint: "Northampton / Amherst" },
        { value: "middlesex", label: "Middlesex County", hint: "Lowell / Cambridge" },
        { value: "nantucket", label: "Nantucket County", hint: "Nantucket Island" },
        { value: "norfolk", label: "Norfolk County", hint: "Quincy / Dedham area" },
        { value: "plymouth", label: "Plymouth County", hint: "South Shore" },
        { value: "suffolk", label: "Suffolk County", hint: "Boston / Chelsea" },
        { value: "worcester", label: "Worcester County", hint: "Central MA" },
      ],
    },
    {
      id: "risk",
      title: "How would you describe your cooperative's risk tolerance?",
      multi: false,
      choices: [
        { value: "conservative", label: "Conservative", hint: "Lower capital outlay, proven models" },
        { value: "moderate", label: "Moderate", hint: "Balanced risk/reward approach" },
        { value: "aggressive", label: "Aggressive", hint: "Higher risk, higher potential return" },
      ],
    },
  ];

  const questionsJSON = JSON.stringify(QUESTIONS);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Admin Dashboard — CCC License Assistant</title>
  <style>
    ${BASE_STYLES}
    #tab-draft .card { max-width: 100%; }
  </style>
</head>
<body>

  <nav>
    <div class="nav-brand">CCC<span>Assist</span> <span style="font-weight:300;opacity:.6">/ Admin</span></div>
    <a href="/" class="nav-back">&larr; Public site</a>
    <form method="POST" action="/api/logout" style="margin-left:.75rem">
      <button type="submit" class="nav-logout">Sign out</button>
    </form>
  </nav>

  <div class="tab-bar">
    <button class="tab-btn active" data-tab="matcher">Cooperative Matcher</button>
    <button class="tab-btn" data-tab="draft">Application Assistant</button>
  </div>

  <!-- ══════════════ TAB 1: MATCHER ══════════════ -->
  <div class="tab-panel active" id="tab-matcher">
    <div class="card">
      <p class="banner-info">Answer 7 questions about your cooperative and we'll recommend the best CCC license type and cooperative structure for your situation.</p>

      <div class="stepper" id="stepper"></div>

      <div id="question-area"></div>

      <div style="display:flex;gap:.75rem;margin-top:1.5rem;align-items:center;">
        <button class="btn btn-ghost btn-sm" id="prev-btn" style="display:none">&larr; Back</button>
        <button class="btn btn-sm" id="next-btn">Next &rarr;</button>
        <span id="q-counter" style="font-size:.8rem;color:var(--muted);margin-left:.5rem"></span>
      </div>
    </div>

    <div id="match-error" class="banner-error"></div>
    <div id="match-results" style="display:none">
      <h2 style="font-size:1.1rem;color:var(--green-dark);margin-bottom:1rem;">Your Top Matches</h2>
      <div class="match-grid" id="match-grid"></div>
    </div>
  </div>

  <!-- ══════════════ TAB 2: DRAFT ASSISTANT ══════════════ -->
  <div class="tab-panel" id="tab-draft">
    <div class="card">
      <div class="field">
        <label for="section">Application Section</label>
        <select id="section">
          ${sectionOptions}
        </select>
      </div>
      <div class="field">
        <label for="notes">Operator Notes / Strategy</label>
        <textarea id="notes" placeholder="Describe your facility, approach, key details, or any specifics for this section…"></textarea>
      </div>
      <button class="btn" id="draft-btn">
        <span class="spinner" id="draft-spinner"></span>
        <span id="draft-label">Generate Draft</span>
      </button>
    </div>

    <div id="draft-error" class="banner-error"></div>

    <div class="card" id="draft-result" style="display:none">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
        <h2 id="draft-result-title" style="font-size:1rem;color:var(--green-dark);">Draft Output</h2>
        <button class="btn btn-ghost btn-sm" id="copy-btn">Copy</button>
      </div>
      <pre id="draft-output" class="draft-output" style="display:block;max-height:600px;"></pre>
    </div>
  </div>

  <footer>CCC License Application Assistant &mdash; For internal use only. Always verify regulatory citations before submission.</footer>

  <!-- Step chatbot panel -->
  <div id="step-chat-overlay">
    <div id="step-chat-panel">
      <div id="step-chat-header">
        <span id="step-chat-title"></span>
        <button id="step-chat-close" aria-label="Close">&times;</button>
      </div>
      <div id="step-chat-messages"></div>
      <form id="step-chat-form">
        <textarea id="step-chat-input" rows="2" placeholder="Ask a follow-up question…"></textarea>
        <button id="step-chat-send" class="btn btn-sm" type="submit">Send</button>
      </form>
    </div>
  </div>

  <script>
    /* ── AUTH TOKEN ── */
    const TOKEN = sessionStorage.getItem('admin_token') || '';

    /* ── TABS ── */
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      });
    });

    /* ══════════════════════════════════════════
       MATCHER
    ══════════════════════════════════════════ */
    const QUESTIONS = ${questionsJSON};
    let answers = {};
    let step = 0;
    let _matches = [];

    const qArea     = document.getElementById('question-area');
    const stepper   = document.getElementById('stepper');
    const prevBtn   = document.getElementById('prev-btn');
    const nextBtn   = document.getElementById('next-btn');
    const counter   = document.getElementById('q-counter');
    const matchErr  = document.getElementById('match-error');
    const matchRes  = document.getElementById('match-results');
    const matchGrid = document.getElementById('match-grid');

    function buildStepper() {
      stepper.innerHTML = QUESTIONS.map((_, i) => {
        const cls = i < step ? 'done' : i === step ? 'active' : '';
        return \`<div class="step-dot \${cls}" title="Question \${i+1}"></div>\`;
      }).join('');
    }

    function renderQuestion() {
      buildStepper();
      const q = QUESTIONS[step];
      const saved = answers[q.id] || [];

      const choicesHtml = q.choices.map(c => {
        const checked = saved.includes(c.value);
        const type = q.multi ? 'checkbox' : 'radio';
        return \`<label class="choice-label \${checked ? 'selected' : ''}" data-val="\${c.value}">
          <input type="\${type}" name="\${q.id}" value="\${c.value}" \${checked ? 'checked' : ''} style="display:none">
          <span>
            <strong style="display:block;font-size:.88rem">\${c.label}</strong>
            <span style="font-size:.78rem;color:var(--muted)">\${c.hint}</span>
          </span>
        </label>\`;
      }).join('');

      qArea.innerHTML = \`
        <h3 style="font-size:1rem;font-weight:700;color:var(--green-dark);margin-bottom:1rem;">
          Q\${step+1} of \${QUESTIONS.length}: \${q.title}
        </h3>
        <div class="choice-grid">\${choicesHtml}</div>
        \${q.multi ? '<p style="font-size:.75rem;color:var(--muted);margin-top:.6rem">Select all that apply</p>' : ''}
      \`;

      // Toggle selection state
      qArea.querySelectorAll('.choice-label').forEach(lbl => {
        const inp = lbl.querySelector('input');
        lbl.addEventListener('click', () => {
          if (q.multi) {
            inp.checked = !inp.checked;
            lbl.classList.toggle('selected', inp.checked);
          } else {
            qArea.querySelectorAll('.choice-label').forEach(l => {
              l.querySelector('input').checked = false;
              l.classList.remove('selected');
            });
            inp.checked = true;
            lbl.classList.add('selected');
          }
        });
      });

      prevBtn.style.display = step > 0 ? 'inline-flex' : 'none';
      const isLast = step === QUESTIONS.length - 1;
      nextBtn.textContent = isLast ? 'Find My Matches' : 'Next →';
      counter.textContent = \`Question \${step+1} of \${QUESTIONS.length}\`;
    }

    function getStepAnswer() {
      const q = QUESTIONS[step];
      const inputs = qArea.querySelectorAll('input:checked');
      return Array.from(inputs).map(i => i.value);
    }

    prevBtn.addEventListener('click', () => {
      answers[QUESTIONS[step].id] = getStepAnswer();
      step--;
      renderQuestion();
    });

    nextBtn.addEventListener('click', async () => {
      const vals = getStepAnswer();
      if (vals.length === 0) {
        matchErr.textContent = 'Please make a selection before continuing.';
        matchErr.style.display = 'block';
        return;
      }
      matchErr.style.display = 'none';
      answers[QUESTIONS[step].id] = vals;

      if (step < QUESTIONS.length - 1) {
        step++;
        renderQuestion();
      } else {
        await runMatcher();
      }
    });

    async function runMatcher() {
      nextBtn.disabled = true;
      matchRes.style.display = 'none';
      matchErr.style.display = 'none';

      const steps = [
        'Reviewing your profile…',
        'Matching license types…',
        'Scoring cooperative structures…',
        'Checking equity pathways…',
        'Ranking recommendations…',
      ];
      let stepIdx = 0;
      function setStep(i) {
        nextBtn.innerHTML = \`<span class="spinner" style="display:inline-block;border-top-color:#fff;border-color:rgba(255,255,255,.3)"></span> \${steps[i]}\`;
      }
      setStep(0);
      const ticker = setInterval(() => {
        stepIdx = Math.min(stepIdx + 1, steps.length - 1);
        setStep(stepIdx);
      }, 1200);

      try {
        const res = await fetch('/api/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
          body: JSON.stringify({ answers })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Server error');
        renderMatches(data.matches);
      } catch (err) {
        matchErr.textContent = err.message;
        matchErr.style.display = 'block';
      } finally {
        clearInterval(ticker);
        nextBtn.disabled = false;
        nextBtn.textContent = 'Find My Matches';
      }
    }

    function renderMatches(matches) {
      _matches = matches;
      matchGrid.innerHTML = matches.map((m, idx) => \`
        <div class="match-card" id="match-\${idx}">
          <div class="match-header">
            <div class="match-rank">\${m.rank}</div>
            <div class="match-title">\${m.licenseType} &mdash; \${m.coopStructure}</div>
            <div class="match-score">Fit: \${m.fitScore}/100</div>
          </div>
          <div class="match-body">
            <div class="match-section">
              <div class="match-label">Why this fits you</div>
              <div class="match-text">\${m.rationale}</div>
            </div>
            <div class="match-section">
              <div class="match-label">Equity pathway notes</div>
              <div class="match-text">\${m.equityNotes}</div>
            </div>
            <div class="match-section">
              <div class="match-label">Recommended next steps</div>
              <ul class="next-steps">\${m.nextSteps.map(s => \`<li><button class="next-step-btn" onclick="openStepChat(\${JSON.stringify(s)}, \${JSON.stringify({licenseType:m.licenseType,coopStructure:m.coopStructure,fitScore:m.fitScore,rationale:m.rationale})})">\${s}</button></li>\`).join('')}</ul>
            </div>
            <button class="btn btn-sm" onclick="generateExecSummary(\${idx})" id="exec-btn-\${idx}">
              <span class="spinner" id="exec-spin-\${idx}"></span>
              <span id="exec-label-\${idx}">Generate Executive Summary</span>
            </button>
            <div id="exec-output-wrap-\${idx}" style="display:none">
              <div style="display:flex;justify-content:flex-end;margin-bottom:.4rem">
                <button class="btn btn-sm" id="exec-copy-\${idx}" onclick="copyExecSummary(\${idx})" style="font-size:.75rem;padding:.25rem .7rem">Copy</button>
              </div>
              <pre class="draft-output" id="exec-draft-\${idx}" style="display:block;margin-top:0"></pre>
            </div>
          </div>
        </div>
      \`).join('');

      matchRes.style.display = 'block';
      matchRes.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    window.generateExecSummary = async function(idx) {
      const match = _matches[idx];
      const btn   = document.getElementById('exec-btn-' + idx);
      const spin  = document.getElementById('exec-spin-' + idx);
      const lbl   = document.getElementById('exec-label-' + idx);
      const out   = document.getElementById('exec-draft-' + idx);
      const wrap  = document.getElementById('exec-output-wrap-' + idx);

      btn.disabled = true;
      spin.style.display = 'inline-block';
      lbl.textContent = 'Generating…';

      try {
        const res = await fetch('/api/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
          body: JSON.stringify({
            sectionName: 'Executive Summary',
            licenseType: match.licenseType,
            coopStructure: match.coopStructure,
            answers: answers
          })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Unexpected error');
        out.textContent = data.draft;
        wrap.style.display = 'block';
        wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) {
        out.textContent = 'Error: ' + err.message;
        wrap.style.display = 'block';
      } finally {
        btn.disabled = false;
        spin.style.display = 'none';
        lbl.textContent = 'Regenerate Executive Summary';
      }
    };

    window.copyExecSummary = async function(idx) {
      const text = document.getElementById('exec-draft-' + idx).textContent;
      const copyBtn = document.getElementById('exec-copy-' + idx);
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
    };

    /* ══════════════════════════════════════════
       DRAFT ASSISTANT TAB
    ══════════════════════════════════════════ */
    const draftBtn    = document.getElementById('draft-btn');
    const draftSpin   = document.getElementById('draft-spinner');
    const draftLabel  = document.getElementById('draft-label');
    const draftErr    = document.getElementById('draft-error');
    const draftResult = document.getElementById('draft-result');
    const draftTitle  = document.getElementById('draft-result-title');
    const draftOut    = document.getElementById('draft-output');
    const copyBtn     = document.getElementById('copy-btn');

    draftBtn.addEventListener('click', async () => {
      const sectionName = document.getElementById('section').value.trim();
      const task        = document.getElementById('notes').value.trim();
      draftErr.style.display = 'none';
      draftResult.style.display = 'none';

      if (!task) {
        draftErr.textContent = 'Please enter your operator notes before generating.';
        draftErr.style.display = 'block';
        return;
      }

      draftBtn.disabled = true;
      draftSpin.style.display = 'inline-block';
      draftLabel.textContent = 'Generating…';

      try {
        const res  = await fetch('/api/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
          body: JSON.stringify({ sectionName, task }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Unexpected error');
        draftTitle.textContent     = data.section + ' — Draft';
        draftOut.textContent       = data.draft;
        draftResult.style.display  = 'block';
        draftResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) {
        draftErr.textContent   = err.message;
        draftErr.style.display = 'block';
      } finally {
        draftBtn.disabled = false;
        draftSpin.style.display = 'none';
        draftLabel.textContent = 'Generate Draft';
      }
    });

    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(draftOut.textContent).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
      });
    });

    /* ── init ── */
    renderQuestion();

    /* ── Step chatbot ── */
    let chatStep = null;
    let chatMatchCtx = null;
    let chatHistory = [];

    const overlay = document.getElementById('step-chat-overlay');
    const chatTitle = document.getElementById('step-chat-title');
    const chatMessages = document.getElementById('step-chat-messages');
    const chatInput = document.getElementById('step-chat-input');
    const chatSend = document.getElementById('step-chat-send');

    window.openStepChat = function(step, matchCtx) {
      chatStep = step;
      chatMatchCtx = matchCtx;
      chatHistory = [];
      chatTitle.textContent = step;
      chatMessages.innerHTML = '';
      overlay.classList.add('open');
      chatInput.focus();
      sendChatMessage('Tell me how to complete this step with specific actions, deadlines, and any relevant Massachusetts forms or agencies.');
    };

    document.getElementById('step-chat-close').addEventListener('click', () => {
      overlay.classList.remove('open');
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });

    async function sendChatMessage(userText) {
      appendChatMsg('user', userText);
      chatHistory.push({ role: 'user', content: userText });
      chatSend.disabled = true;
      const thinking = appendChatMsg('assistant', '…');

      try {
        const token = sessionStorage.getItem('admin_token') || '';
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ step: chatStep, matchContext: chatMatchCtx, messages: chatHistory }),
        });
        const data = await res.json();
        thinking.remove();
        if (!res.ok) throw new Error(data.error || 'Request failed');
        appendChatMsg('assistant', data.reply);
        chatHistory.push({ role: 'assistant', content: data.reply });
      } catch (err) {
        thinking.remove();
        appendChatMsg('assistant', 'Error: ' + err.message);
      } finally {
        chatSend.disabled = false;
        chatInput.focus();
      }
    }

    function appendChatMsg(role, text) {
      const el = document.createElement('div');
      el.className = 'chat-msg ' + role;
      el.textContent = text;
      chatMessages.appendChild(el);
      chatMessages.scrollTop = chatMessages.scrollHeight;
      return el;
    }

    document.getElementById('step-chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (!text) return;
      chatInput.value = '';
      sendChatMessage(text);
    });

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('step-chat-form').requestSubmit();
      }
    });
  </script>
</body>
</html>`;
}
