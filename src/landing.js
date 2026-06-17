export function renderLanding() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CCC License Application Assistant — Massachusetts Cannabis Cooperatives</title>
  <style>
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
      --radius:      10px;
    }

    body {
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      background: var(--off-white);
      color: var(--text);
      min-height: 100vh;
      line-height: 1.6;
    }

    /* ── NAV ── */
    nav {
      background: var(--green-dark);
      padding: .9rem 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .nav-brand {
      color: #fff;
      font-size: .95rem;
      font-weight: 700;
      letter-spacing: .02em;
      text-transform: uppercase;
    }
    .nav-brand span {
      color: var(--green-pale);
    }

    /* ── HERO ── */
    .hero {
      background: var(--green-dark);
      color: #fff;
      padding: 5rem 2rem 4rem;
      text-align: center;
    }
    .hero-eyebrow {
      font-size: .8rem;
      font-weight: 700;
      letter-spacing: .12em;
      text-transform: uppercase;
      color: var(--green-pale);
      margin-bottom: 1.1rem;
    }
    .hero h1 {
      font-size: clamp(1.9rem, 5vw, 3rem);
      font-weight: 800;
      line-height: 1.2;
      max-width: 760px;
      margin: 0 auto .9rem;
    }
    .hero h1 em {
      font-style: normal;
      color: var(--green-pale);
    }
    .hero p {
      font-size: 1.1rem;
      color: #c8ddd0;
      max-width: 600px;
      margin: 0 auto 2.5rem;
    }
    .cta-btn {
      display: inline-block;
      background: var(--green-pale);
      color: var(--green-dark);
      font-size: 1rem;
      font-weight: 700;
      padding: .9rem 2.2rem;
      border-radius: var(--radius);
      text-decoration: none;
      border: 2px solid transparent;
      transition: background .15s, border-color .15s;
    }
    .cta-btn:hover {
      background: #fff;
      border-color: var(--green-pale);
    }

    /* ── SECTION ── */
    section {
      max-width: 900px;
      margin: 0 auto;
      padding: 4rem 2rem;
    }

    .section-label {
      font-size: .75rem;
      font-weight: 700;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: var(--green-mid);
      margin-bottom: .6rem;
    }
    section h2 {
      font-size: 1.6rem;
      font-weight: 800;
      color: var(--green-dark);
      margin-bottom: 1rem;
    }
    section > p {
      color: var(--muted);
      max-width: 640px;
      margin-bottom: 2.5rem;
    }

    /* ── FEATURE GRID ── */
    .features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1.25rem;
    }
    .feature-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.5rem;
    }
    .feature-card .icon {
      font-size: 1.6rem;
      margin-bottom: .75rem;
    }
    .feature-card h3 {
      font-size: 1rem;
      font-weight: 700;
      color: var(--green-dark);
      margin-bottom: .4rem;
    }
    .feature-card p {
      font-size: .88rem;
      color: var(--muted);
      line-height: 1.55;
      margin: 0;
    }

    /* ── HOW IT WORKS ── */
    .steps {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1.25rem;
      counter-reset: steps;
    }
    .step {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.5rem;
      counter-increment: steps;
      position: relative;
    }
    .step::before {
      content: counter(steps);
      display: block;
      width: 2rem;
      height: 2rem;
      background: var(--green-dark);
      color: #fff;
      font-size: .85rem;
      font-weight: 700;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: .75rem;
    }
    .step h3 {
      font-size: .95rem;
      font-weight: 700;
      color: var(--green-dark);
      margin-bottom: .35rem;
    }
    .step p {
      font-size: .85rem;
      color: var(--muted);
      line-height: 1.5;
      margin: 0;
    }

    /* ── DISCLAIMER ── */
    .disclaimer {
      background: var(--green-pale);
      border-left: 4px solid var(--green-mid);
      border-radius: var(--radius);
      padding: 1.25rem 1.5rem;
      font-size: .85rem;
      color: var(--green-dark);
      max-width: 900px;
      margin: 0 auto;
    }
    .disclaimer strong { font-weight: 700; }

    /* ── CTA BANNER ── */
    .cta-banner {
      background: var(--green-dark);
      color: #fff;
      text-align: center;
      padding: 4rem 2rem;
    }
    .cta-banner h2 {
      font-size: 1.6rem;
      font-weight: 800;
      margin-bottom: .75rem;
    }
    .cta-banner p {
      color: #c8ddd0;
      margin-bottom: 2rem;
      font-size: 1rem;
    }

    /* ── FOOTER ── */
    footer {
      background: #111;
      color: #888;
      text-align: center;
      font-size: .75rem;
      padding: 1.5rem 2rem;
    }
    footer a { color: #aaa; }
  </style>
</head>
<body>

  <nav>
    <div class="nav-brand">CCC<span>Assist</span></div>
  </nav>

  <!-- HERO -->
  <div class="hero">
    <p class="hero-eyebrow">Massachusetts Cannabis Control Commission</p>
    <h1>Your <em>cooperative license</em> application,<br>drafted with AI precision.</h1>
    <p>CCCAssist helps Massachusetts cannabis cooperative applicants identify the right license type, match a cooperative structure, and generate submission-ready application drafts — in minutes.</p>
    <a href="/admin" class="cta-btn">Start the Application Helper &rarr;</a>
  </div>

  <!-- FEATURES -->
  <section>
    <p class="section-label">What you get</p>
    <h2>Built for cooperative applicants in Massachusetts</h2>
    <p>From first-time applicants to organizations with prior cannabis experience, CCCAssist guides you through every step of the CCC licensing process.</p>
    <div class="features">
      <div class="feature-card">
        <div class="icon">&#x1F4CB;</div>
        <h3>7-Question Matcher</h3>
        <p>Answer questions about your interests, capital, location, and social equity status to receive three ranked license and cooperative structure matches.</p>
      </div>
      <div class="feature-card">
        <div class="icon">&#x2696;&#xFE0F;</div>
        <h3>Fit Scores &amp; Rationale</h3>
        <p>Each match comes with a numeric fit score, a plain-language rationale, equity pathway notes, and recommended next steps.</p>
      </div>
      <div class="feature-card">
        <div class="icon">&#x270D;&#xFE0F;</div>
        <h3>AI-Drafted Application Sections</h3>
        <p>Generate a submission-ready Executive Summary — and all other CCC application sections — aligned with 935 CMR 500.000 regulatory language.</p>
      </div>
      <div class="feature-card">
        <div class="icon">&#x1F4BE;</div>
        <h3>Saved to KV Storage</h3>
        <p>Every draft is automatically saved so you can return to it, refine it, and build on it across sessions without losing work.</p>
      </div>
    </div>
  </section>

  <!-- HOW IT WORKS -->
  <section style="background: var(--surface); max-width: 100%; padding: 4rem 2rem;">
    <div style="max-width: 900px; margin: 0 auto;">
      <p class="section-label">How it works</p>
      <h2>From onboarding to draft in four steps</h2>
      <p style="margin-bottom: 2.5rem;">No legal expertise required. CCCAssist asks the right questions and handles the regulatory language.</p>
      <div class="steps">
        <div class="step">
          <h3>Answer 7 questions</h3>
          <p>Tell us about your cooperative's interests, skills, capital range, equity status, and MA location.</p>
        </div>
        <div class="step">
          <h3>Get matched</h3>
          <p>Claude analyzes your profile and returns 3 ranked CCC license + cooperative structure matches with fit scores.</p>
        </div>
        <div class="step">
          <h3>Generate your draft</h3>
          <p>Pick a match and click "Generate Executive Summary" to get a submission-ready draft for that license type.</p>
        </div>
        <div class="step">
          <h3>Refine &amp; submit</h3>
          <p>Use the full Application Assistant to draft every remaining section before filing with the CCC.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- DISCLAIMER -->
  <section style="padding: 2rem;">
    <div class="disclaimer">
      <strong>Important:</strong> CCCAssist generates AI-assisted drafts for informational and planning purposes only. All application content must be reviewed by a licensed Massachusetts attorney and verified against the latest CCC regulations before submission. This tool does not constitute legal advice.
    </div>
  </section>

  <!-- CTA BANNER -->
  <div class="cta-banner">
    <h2>Ready to find your license match?</h2>
    <p>The matcher takes under five minutes and produces a personalized roadmap tailored to your cooperative.</p>
    <a href="/admin" class="cta-btn">Open the Application Helper &rarr;</a>
  </div>

  <footer>
    &copy; 2026 CCCAssist &mdash; For informational use only. Not legal advice.
    Always verify regulatory citations against current <a href="https://mass.gov/cannabis-control-commission" target="_blank" rel="noopener">CCC guidelines</a> before submission.
  </footer>

</body>
</html>`;
}
