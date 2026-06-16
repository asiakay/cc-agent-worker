export const SECTIONS = [
  "Executive Summary",
  "Business Plan",
  "Security Plan",
  "Seed-to-Sale Tracking Plan",
  "Energy and Water Use Plan",
  "Positive Impact Plan",
  "Employee Training Plan",
  "Record Keeping Plan",
  "Quality Control Plan",
  "Transportation Plan",
  "Waste Disposal Plan",
  "Fire Safety Plan",
  "Diversion Prevention Plan",
];

export function renderUI() {
  const sectionOptions = SECTIONS.map(
    (s) => `<option value="${s}">${s}</option>`
  ).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CCC License Application Assistant</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --green: #2d6a4f;
      --green-light: #40916c;
      --green-pale: #d8f3dc;
      --bg: #f8faf8;
      --surface: #ffffff;
      --border: #d1e7d9;
      --text: #1b2e22;
      --muted: #5a7463;
      --radius: 10px;
      --shadow: 0 2px 12px rgba(0,0,0,.08);
    }

    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding: 2rem 1rem;
    }

    header {
      max-width: 780px;
      margin: 0 auto 2rem;
      border-left: 4px solid var(--green);
      padding-left: 1rem;
    }

    header h1 { font-size: 1.5rem; font-weight: 700; color: var(--green); }
    header p  { font-size: .9rem; color: var(--muted); margin-top: .25rem; }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 1.75rem;
      max-width: 780px;
      margin: 0 auto 1.5rem;
    }

    label {
      display: block;
      font-size: .85rem;
      font-weight: 600;
      color: var(--green);
      margin-bottom: .4rem;
    }

    select, textarea {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: .65rem .85rem;
      font-size: .95rem;
      color: var(--text);
      background: var(--bg);
      transition: border-color .15s;
      outline: none;
    }

    select:focus, textarea:focus { border-color: var(--green-light); }

    textarea {
      resize: vertical;
      min-height: 140px;
      line-height: 1.55;
      margin-top: 0;
    }

    .field { margin-bottom: 1.25rem; }
    .field:last-of-type { margin-bottom: 0; }

    button {
      display: inline-flex;
      align-items: center;
      gap: .5rem;
      background: var(--green);
      color: #fff;
      border: none;
      border-radius: var(--radius);
      padding: .75rem 1.5rem;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: background .15s;
      margin-top: 1.25rem;
    }

    button:hover:not(:disabled) { background: var(--green-light); }
    button:disabled { opacity: .55; cursor: not-allowed; }

    .spinner {
      display: none;
      width: 18px; height: 18px;
      border: 2px solid rgba(255,255,255,.4);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin .7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    #result-card { display: none; }

    .result-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .result-header h2 { font-size: 1.05rem; color: var(--green); }

    .copy-btn {
      background: var(--green-pale);
      color: var(--green);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: .35rem .75rem;
      font-size: .8rem;
      font-weight: 600;
      cursor: pointer;
      transition: background .15s;
      margin-top: 0;
    }
    .copy-btn:hover { background: #b7e4c7; }

    #draft-output {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.25rem;
      white-space: pre-wrap;
      font-size: .88rem;
      line-height: 1.7;
      max-height: 540px;
      overflow-y: auto;
    }

    #error-msg {
      display: none;
      background: #fff0f0;
      border: 1px solid #f5c6cb;
      border-radius: var(--radius);
      padding: .85rem 1rem;
      color: #842029;
      font-size: .9rem;
      max-width: 780px;
      margin: 0 auto 1rem;
    }

    footer {
      text-align: center;
      font-size: .75rem;
      color: var(--muted);
      margin-top: 2rem;
    }
  </style>
</head>
<body>
  <header>
    <h1>CCC License Application Assistant</h1>
    <p>Massachusetts Cannabis Control Commission — Adult-Use Cultivator License Drafting Tool</p>
  </header>

  <div class="card">
    <div class="field">
      <label for="section">Application Section</label>
      <select id="section">
        ${sectionOptions}
      </select>
    </div>
    <div class="field">
      <label for="notes">Operator Notes / Strategy</label>
      <textarea id="notes" placeholder="Describe your facility, approach, key details, or any specific information for this section…"></textarea>
    </div>
    <button id="submit-btn">
      <span class="spinner" id="spinner"></span>
      <span id="btn-label">Generate Draft</span>
    </button>
  </div>

  <div id="error-msg"></div>

  <div class="card" id="result-card">
    <div class="result-header">
      <h2 id="result-title">Draft Output</h2>
      <button class="copy-btn" id="copy-btn">Copy</button>
    </div>
    <pre id="draft-output"></pre>
  </div>

  <footer>Powered by Claude &mdash; For internal use only. Always verify regulatory citations before submission.</footer>

  <script>
    const btn    = document.getElementById('submit-btn');
    const label  = document.getElementById('btn-label');
    const spin   = document.getElementById('spinner');
    const errEl  = document.getElementById('error-msg');
    const resCard= document.getElementById('result-card');
    const output = document.getElementById('draft-output');
    const title  = document.getElementById('result-title');
    const copyBtn= document.getElementById('copy-btn');

    btn.addEventListener('click', async () => {
      const sectionName = document.getElementById('section').value.trim();
      const task        = document.getElementById('notes').value.trim();

      errEl.style.display  = 'none';
      resCard.style.display= 'none';

      if (!task) {
        errEl.textContent    = 'Please enter your operator notes before generating.';
        errEl.style.display  = 'block';
        return;
      }

      btn.disabled       = true;
      spin.style.display = 'inline-block';
      label.textContent  = 'Generating…';

      try {
        const res  = await fetch('/', {
          method : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify({ sectionName, task }),
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Unexpected error from server.');
        }

        title.textContent    = data.section + ' — Draft';
        output.textContent   = data.draft;
        resCard.style.display= 'block';
        resCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) {
        errEl.textContent   = err.message;
        errEl.style.display = 'block';
      } finally {
        btn.disabled       = false;
        spin.style.display = 'none';
        label.textContent  = 'Generate Draft';
      }
    });

    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(output.textContent).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
      });
    });
  </script>
</body>
</html>`;
}
