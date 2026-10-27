import React from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, Check, CircleDot, GitPullRequest, ShieldCheck, Sparkles } from 'lucide-react';

const features = [
  {
    icon: Activity,
    title: 'Explainable repository health',
    text: 'See how measured activity and backlog signals contribute to a DevFlow heuristic score.',
  },
  {
    icon: CircleDot,
    title: 'Actionable issue and PR views',
    text: 'Filter current GitHub observations by state, label, search, and inactivity threshold.',
  },
  {
    icon: ShieldCheck,
    title: 'Snapshots you can revisit',
    text: 'Keep each analysis with its original thresholds, evidence, and observation scope.',
  },
];

export default function Landing() {
  return (
    <main className="landing-page">
      <header className="landing-nav">
        <Link className="landing-brand" to="/" aria-label="DevFlow home"><span className="brand-mark"><Activity size={19} /></span>DevFlow</Link>
        <nav aria-label="Public navigation">
          <Link to="/login">Sign in</Link>
          <Link className="button button-primary" to="/register">Create account <ArrowRight size={15} /></Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="eyebrow">REPOSITORY HEALTH, MADE EXPLAINABLE</p>
          <h1>Understand the work behind your repository’s health.</h1>
          <p className="landing-lead">DevFlow turns public GitHub activity, issues, and pull requests into a clear view of what is moving and what may need attention.</p>
          <div className="landing-actions">
            <Link className="button button-primary" to="/register">Get started <ArrowRight size={16} /></Link>
            <Link className="button button-secondary" to="/login">Sign in</Link>
          </div>
          <p className="landing-note"><Check size={14} /> Start with a public repository. No GitHub token required.</p>
        </div>
        <div className="landing-score-card" aria-label="Illustration explaining a repository score">
          <div className="landing-card-heading"><span className="brand-mark"><Sparkles size={16} /></span><div><strong>How scoring works</strong><small>Measured signals, clear reasons</small></div></div>
          <p>DevFlow combines available activity components into a heuristic health score.</p>
          <div className="landing-signal"><span><Activity size={15} /> Commit activity</span><small>Measured component</small></div>
          <div className="landing-signal"><span><CircleDot size={15} /> Issue management</span><small>Measured component</small></div>
          <div className="landing-signal"><span><GitPullRequest size={15} /> Pull request management</span><small>Measured component</small></div>
          <div className="landing-score-note">Unavailable inputs stay unavailable. Partial scores are labeled, and the score is not an official GitHub metric.</div>
        </div>
      </section>

      <section className="landing-features" aria-labelledby="landing-features-title">
        <div className="landing-section-heading"><p className="eyebrow">BUILT FOR REAL PROJECT SIGNALS</p><h2 id="landing-features-title">A practical view of repository activity</h2></div>
        <div className="landing-feature-grid">
          {features.map(({ icon: Icon, title, text }) => (
            <article className="surface-card landing-feature-card" key={title}>
              <span className="landing-feature-icon"><Icon size={18} /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="landing-footer"><span>DevFlow · Open-source repository signals</span><Link to="/register">Create your workspace <ArrowRight size={14} /></Link></footer>
    </main>
  );
}
