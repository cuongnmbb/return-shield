import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

// ── Data ──────────────────────────────────────────────────────────────────────

const STATS = [
  { value: "500+", label: "Shopify stores" },
  { value: "38%", label: "Fewer refunds on avg." },
  { value: "$2.4M", label: "Revenue saved" },
  { value: "4.9★", label: "Shopify rating" },
];

const FEATURES = [
  {
    icon: "↩",
    color: "#d1fae5",
    accent: "#059669",
    title: "Self-service Return Portal",
    desc: "Give customers a beautiful branded portal to submit returns in seconds — no emails, no support tickets.",
    bullets: ["Custom branding & welcome message", "Order lookup by email + order number", "Works on any device"],
  },
  {
    icon: "💳",
    color: "#dbeafe",
    accent: "#2563eb",
    title: "Store Credit Deflection",
    desc: "Before processing a refund, offer store credit with a bonus incentive. Most customers accept.",
    bullets: ["Configurable credit bonus (e.g. +15%)", "One-click accept flow for customers", "Tracks deflection $ saved in real time"],
  },
  {
    icon: "📊",
    color: "#fef3c7",
    accent: "#d97706",
    title: "Merchant Dashboard",
    desc: "See every return request at a glance. Filter, update status, and notify customers — all in one place.",
    bullets: ["Live return status timeline", "One-click approve / decline", "Automated customer email notifications"],
  },
];

const HOW_IT_WORKS = [
  { step: "01", title: "Install & configure", desc: "Add Return Shield to your Shopify store and set your return policy in minutes." },
  { step: "02", title: "Share your portal link", desc: "Paste the portal link in your order confirmation email or FAQ page." },
  { step: "03", title: "Watch refunds drop", desc: "Customers self-serve, store credit deflects cash refunds, and your dashboard tracks every dollar saved." },
];

const TESTIMONIAL = {
  quote: "We cut our refund rate by 41% in the first month. The store credit offer alone paid for the app 20x over.",
  name: "Sarah K.",
  role: "Owner, Velvet & Co.",
  initials: "SK",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.page}>

      {/* ── Nav ── */}
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <div className={styles.logo}>
            <div className={styles.logoIcon}>↩</div>
            <span className={styles.logoText}>Return<span className={styles.logoBold}>Shield</span></span>
          </div>
          <div className={styles.navRight}>
            <span className={styles.navRating}>★ 4.9 on Shopify App Store</span>
            {showForm && (
              <a href="#install" className={styles.navCta}>Install free</a>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroInner}>
          <div className={styles.heroPill}>
            <span className={styles.heroPillDot} />
            Trusted by 500+ Shopify merchants
          </div>
          <h1 className={styles.heroH1}>
            Stop losing money<br />
            to <span className={styles.heroStrike}>refunds</span>{" "}
            <span className={styles.heroAccent}>you could keep</span>
          </h1>
          <p className={styles.heroSub}>
            Return Shield is the Shopify app that transforms your return
            process into a revenue-retention machine — with a self-service
            portal, automatic store-credit offers, and real-time analytics.
          </p>

          <div className={styles.heroStats}>
            {STATS.map((s) => (
              <div key={s.label} className={styles.heroStat}>
                <span className={styles.heroStatValue}>{s.value}</span>
                <span className={styles.heroStatLabel}>{s.label}</span>
              </div>
            ))}
          </div>

          {showForm && (
            <div id="install" className={styles.installBox}>
              <p className={styles.installEyebrow}>Start your free 14-day trial — no credit card required</p>
              <Form className={styles.installForm} method="post" action="/auth/login">
                <input
                  className={styles.installInput}
                  type="text"
                  name="shop"
                  placeholder="your-store.myshopify.com"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button className={styles.installBtn} type="submit">
                  Install free &rarr;
                </button>
              </Form>
              <p className={styles.installHint}>
                Setup takes under 5 minutes. Cancel anytime.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── Problem / Pain ── */}
      <section className={styles.pain}>
        <div className={styles.painInner}>
          <div className={styles.painCard}>
            <p className={styles.painEmoji}>😟</p>
            <h2 className={styles.painHeading}>Returns are costing you more than you think</h2>
            <p className={styles.painText}>
              The average Shopify store loses <strong>15–30% of revenue</strong> to returns.
              Most of those refunds could have been kept as store credit — but without the
              right tool in place, customers just get their money back and never return.
            </p>
            <div className={styles.painStats}>
              <div className={styles.painStat}>
                <span className={styles.painStatVal}>$800B+</span>
                <span className={styles.painStatLbl}>lost to returns globally each year</span>
              </div>
              <div className={styles.painDivider} />
              <div className={styles.painStat}>
                <span className={styles.painStatVal}>60%</span>
                <span className={styles.painStatLbl}>of returners would accept store credit with an incentive</span>
              </div>
              <div className={styles.painDivider} />
              <div className={styles.painStat}>
                <span className={styles.painStatVal}>3×</span>
                <span className={styles.painStatLbl}>higher LTV for customers kept with store credit</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className={styles.features}>
        <div className={styles.featuresInner}>
          <p className={styles.sectionEyebrow}>Everything you need</p>
          <h2 className={styles.sectionHeading}>One app. Three powerful tools.</h2>
          <div className={styles.featureCards}>
            {FEATURES.map((f) => (
              <div key={f.title} className={styles.featureCard}>
                <div className={styles.featureIcon} style={{ background: f.color, color: f.accent }}>
                  {f.icon}
                </div>
                <h3 className={styles.featureTitle}>{f.title}</h3>
                <p className={styles.featureDesc}>{f.desc}</p>
                <ul className={styles.featureBullets}>
                  {f.bullets.map((b) => (
                    <li key={b} className={styles.featureBullet}>
                      <span className={styles.bulletCheck}>✓</span>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className={styles.how}>
        <div className={styles.howInner}>
          <p className={styles.sectionEyebrow}>Simple setup</p>
          <h2 className={styles.sectionHeading}>Up and running in 5 minutes</h2>
          <div className={styles.howSteps}>
            {HOW_IT_WORKS.map((h, i) => (
              <div key={h.step} className={styles.howStep}>
                <div className={styles.howStepNum}>{h.step}</div>
                {i < HOW_IT_WORKS.length - 1 && <div className={styles.howConnector} />}
                <h3 className={styles.howStepTitle}>{h.title}</h3>
                <p className={styles.howStepDesc}>{h.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonial ── */}
      <section className={styles.testimonial}>
        <div className={styles.testimonialInner}>
          <div className={styles.testimonialCard}>
            <div className={styles.testimonialStars}>★★★★★</div>
            <blockquote className={styles.testimonialQuote}>
              &ldquo;{TESTIMONIAL.quote}&rdquo;
            </blockquote>
            <div className={styles.testimonialAuthor}>
              <div className={styles.testimonialAvatar}>{TESTIMONIAL.initials}</div>
              <div>
                <div className={styles.testimonialName}>{TESTIMONIAL.name}</div>
                <div className={styles.testimonialRole}>{TESTIMONIAL.role}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      {showForm && (
        <section className={styles.cta}>
          <div className={styles.ctaInner}>
            <h2 className={styles.ctaHeading}>Ready to protect your revenue?</h2>
            <p className={styles.ctaSub}>
              Join 500+ stores already saving thousands per month with Return Shield.
            </p>
            <Form className={styles.ctaForm} method="post" action="/auth/login">
              <input
                className={styles.ctaInput}
                type="text"
                name="shop"
                placeholder="your-store.myshopify.com"
                autoComplete="off"
                spellCheck={false}
              />
              <button className={styles.ctaBtn} type="submit">
                Start free trial &rarr;
              </button>
            </Form>
            <p className={styles.ctaHint}>14-day free trial. No credit card. Cancel anytime.</p>
          </div>
        </section>
      )}

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerLogo}>
            <div className={styles.footerLogoIcon}>↩</div>
            <span>ReturnShield</span>
          </div>
          <p className={styles.footerCopy}>
            &copy; {new Date().getFullYear()} Return Shield. Built for Shopify merchants.
          </p>
        </div>
      </footer>

    </div>
  );
}
