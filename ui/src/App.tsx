import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CourseEvalAPI, instructorKeyOf, studentCommitment, type CourseState } from '../../api/src/index';
import { connectWallet, readDust, type WalletSession } from './wallet';
import { exportSecret, importSecret, loadSecret } from './identity';
import { isContractAddress, useCourseState } from './useCourseState';

type Tab = 'student' | 'instructor' | 'results';

const DEMO_COURSE = '0d5f3114df021fc8a651d73f811e7ec0bceca69b6ea176c5345877ae5a7b09d8';
const REPO_URL = 'https://github.com/ilkerK01/anon-course-eval';

const shorten = (value: string, head = 10, tail = 6) =>
  value.length > head + tail + 3 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;

const formatDust = (value: bigint) => {
  const whole = Number(value / 10n ** 12n) / 1_000_000;
  return whole.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const readCourseFromUrl = () => new URLSearchParams(window.location.search).get('course') ?? '';

const writeCourseToUrl = (address: string) => {
  const url = new URL(window.location.href);
  if (address) url.searchParams.set('course', address);
  else url.searchParams.delete('course');
  window.history.replaceState(null, '', url);
};

const scrollToId = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

const errorText = (e: unknown) => {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);
  if (/already evaluated/.test(raw)) return 'You have already rated this course. Each student gets exactly one anonymous rating.';
  if (/not on this course roster|not on the course roster/.test(raw))
    return 'Your enrollment code is not on this course roster. Send it to the instructor first.';
  if (/only the instructor/.test(raw)) return 'Only the instructor who created this course can do that.';
  if (/not open/.test(raw)) return 'Ratings are not open for this course right now.';
  if (/rejected|denied|cancel/i.test(raw)) return 'The transaction was cancelled in Lace.';
  return raw;
};

const describeError = (e: unknown) => {
  const chain: string[] = [];
  let cause: unknown = e;
  while (cause) {
    chain.push(cause instanceof Error ? cause.message : JSON.stringify(cause));
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  const all = chain.join(' ');
  if (/Wallet\.Proving|Failed to prove transaction/.test(all))
    return 'Lace could not prove the fee. In Lace open Settings → Midnight, choose Proof Server: Local (http://localhost:6300), save, and try again.';
  if (/Insufficient|not enough|dust/i.test(all) && /balance|fee|funds/i.test(all))
    return 'Not enough tDUST to pay the fee. Wait for your tDUST to refill in Lace and try again.';
  return errorText(e);
};

function Sprite() {
  const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <symbol id="i-key" viewBox="0 0 24 24" {...s}><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3M14 9l2 2" /></symbol>
      <symbol id="i-star" viewBox="0 0 24 24" {...s}><path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4l-5.5 2.9 1-6.2L3 9.7l6.2-.9L12 3Z" /></symbol>
      <symbol id="i-plus" viewBox="0 0 24 24" {...s}><rect x="3" y="3" width="18" height="18" rx="6" /><path d="M12 8v8M8 12h8" /></symbol>
      <symbol id="i-chart" viewBox="0 0 24 24" {...s}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></symbol>
      <symbol id="i-lock" viewBox="0 0 24 24" {...s}><rect x="4" y="10" width="16" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></symbol>
      <symbol id="i-once" viewBox="0 0 24 24" {...s}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0M15 16l2 2 4-4" /></symbol>
      <symbol id="i-eye" viewBox="0 0 24 24" {...s}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></symbol>
      <symbol id="i-shield" viewBox="0 0 24 24" {...s}><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></symbol>
      <symbol id="i-moon" viewBox="0 0 24 24" {...s}><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5Z" /></symbol>
      <symbol id="i-chat" viewBox="0 0 24 24" {...s}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /><path d="M8.5 11h.01M12 11h.01M15.5 11h.01" /></symbol>
      <symbol id="i-cube" viewBox="0 0 24 24" {...s}><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="M12 12l8-4.5M12 12v9M12 12 4 7.5" /></symbol>
      <symbol id="i-check" viewBox="0 0 24 24" {...s} strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></symbol>
      <symbol id="i-x" viewBox="0 0 24 24" {...s} strokeWidth={1.8}><path d="M6 6l12 12M18 6 6 18" /></symbol>
      <symbol id="i-copy" viewBox="0 0 24 24" {...s}><rect x="8" y="8" width="12" height="12" rx="3" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></symbol>
      <symbol id="i-user" viewBox="0 0 24 24" {...s}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></symbol>
      <symbol id="i-board" viewBox="0 0 24 24" {...s}><rect x="3" y="4" width="18" height="13" rx="3" /><path d="M8 21h8M12 17v4M7 9h6M7 12h10" /></symbol>
      <symbol id="i-mark" viewBox="0 0 64 64"><path d="M32 8a12 12 0 0 1 12 12v6h-6v-6a6 6 0 0 0-12 0v6h-6v-6A12 12 0 0 1 32 8Z" fill="currentColor" /><path fillRule="evenodd" d="M18 25h28a6 6 0 0 1 6 6v17a6 6 0 0 1-6 6H31l-8 7v-7h-5a6 6 0 0 1-6-6V31a6 6 0 0 1 6-6Zm14 4-3.3 6.7-7.4 1.1 5.4 5.2-1.3 7.3 6.6-3.5 6.6 3.5-1.3-7.3 5.4-5.2-7.4-1.1Z" fill="currentColor" /></symbol>
    </svg>
  );
}

const Ico = ({ id, className }: { id: string; className?: string }) => (
  <svg className={className} aria-hidden="true">
    <use href={`#${id}`} />
  </svg>
);

function useReveal() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );
    document.querySelectorAll('.reveal, .path').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

export default function App() {
  const [secret, setSecret] = useState<Uint8Array>(() => loadSecret());
  const [session, setSession] = useState<WalletSession | null>(null);
  const [dust, setDust] = useState<{ balance: bigint; cap: bigint } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [courseInput, setCourseInput] = useState(readCourseFromUrl);
  const [course, setCourse] = useState(() => (isContractAddress(readCourseFromUrl()) ? readCourseFromUrl() : ''));
  const [tab, setTab] = useState<Tab>('student');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const apiRef = useRef<{ address: string; api: CourseEvalAPI } | null>(null);

  const { state, error: stateError, refresh } = useCourseState(course || null);
  const commitment = useMemo(() => studentCommitment(secret), [secret]);
  const isInstructor = !!state && state.instructorKey === instructorKeyOf(secret);

  useReveal();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!session) return;
    const tick = () => readDust(session).then(setDust).catch(() => setDust(null));
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [session]);

  const connect = async () => {
    setConnecting(true);
    setNotice(null);
    try {
      setSession(await connectWallet());
    } catch (e) {
      setNotice({ kind: 'err', text: errorText(e) });
      scrollToId('app');
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    setSession(null);
    setDust(null);
    apiRef.current = null;
    setNotice({ kind: 'ok', text: 'Wallet disconnected from Candor.' });
  };

  const openCourse = (address: string) => {
    const clean = address.trim();
    if (!isContractAddress(clean)) {
      setNotice({ kind: 'err', text: 'A course address is 64 hex characters.' });
      return false;
    }
    apiRef.current = null;
    setCourse(clean);
    setCourseInput(clean);
    writeCourseToUrl(clean);
    setNotice(null);
    return true;
  };

  const goToApp = (next: Tab) => {
    setTab(next);
    scrollToId('app');
  };

  const courseApi = useCallback(async (): Promise<CourseEvalAPI> => {
    if (!session) throw new Error('Connect your Lace wallet first.');
    if (apiRef.current?.address === course) return apiRef.current.api;
    const api = await CourseEvalAPI.join(session.providers, course, secret);
    apiRef.current = { address: course, api };
    return api;
  }, [session, course, secret]);

  const run = async (label: string, action: () => Promise<string | void>, success: string) => {
    setBusy(label);
    setNotice(null);
    try {
      const txId = await action();
      setNotice({ kind: 'ok', text: txId ? `${success} Transaction ${shorten(String(txId), 8, 8)}` : success });
      await refresh();
    } catch (e) {
      console.error(e);
      setNotice({ kind: 'err', text: describeError(e) });
    } finally {
      setBusy(null);
    }
  };

  const createCourse = (code: string) =>
    run(
      'Deploying your course contract. Lace will ask you to approve.',
      async () => {
        if (!session) throw new Error('Connect your Lace wallet first.');
        const api = await CourseEvalAPI.deploy(session.providers, secret, code);
        apiRef.current = { address: api.contractAddress, api };
        setCourse(api.contractAddress);
        setCourseInput(api.contractAddress);
        writeCourseToUrl(api.contractAddress);
        setTab('instructor');
      },
      'Course created. Share the link with your students.',
    );

  return (
    <>
      <Sprite />
      <header className={`nav${scrolled ? ' scrolled' : ''}`}>
        <div className="wrap nav-in">
          <a href="#top" className="brand">
            <Ico id="i-mark" className="mark" />
            Candor
          </a>
          <a href="#top" className="nav-mid" aria-label="Back to top">
            <img src="/img/candor-mascot.webp" alt="" width="36" height="34" />
          </a>
          <div className="nav-right">
            <a href="#why" className="link hide-sm">Why anonymous</a>
            <a href="#how" className="link hide-sm">How it works</a>
            {session ? (
              <div className="wallet-pill">
                <span className="dot" />
                <span className="addr" title={session.address}>{shorten(session.address, 12, 5)}</span>
                {dust && <span className="dust">{formatDust(dust.balance)} tDUST</span>}
                <button className="btn btn-ghost btn-sm" onClick={disconnect}>Disconnect</button>
              </div>
            ) : (
              <button className="btn btn-light btn-sm" onClick={connect} disabled={connecting}>
                {connecting ? 'Connecting…' : 'Connect Lace'}
              </button>
            )}
          </div>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="wrap hero-copy">
            <span className="script">Speak freely!</span>
            <h1>Every student counted. No student named.</h1>
            <p className="lead">
              Candor collects course feedback that is provably anonymous. Every rating comes from an enrolled student, nobody
              rates twice, and nobody can tell who said what.
            </p>
          </div>
          <div className="hero-stage">
            <img className="art l" src="/img/candor-hero-left.webp" alt="" />
            <img className="art r" src="/img/candor-hero-right.webp" alt="" />
            <div className="menu-card" role="menu" aria-label="What would you like to do?">
              <button className="menu-item" role="menuitem" onClick={() => goToApp('student')}>
                <Ico id="i-key" />
                <div>
                  <b>Get your enrollment code</b>
                  <span>A secret that never leaves your device</span>
                </div>
              </button>
              <button className="menu-item" role="menuitem" onClick={() => goToApp('student')}>
                <Ico id="i-star" />
                <div>
                  <b>Rate a course</b>
                  <span>One anonymous rating, proven on-chain</span>
                </div>
              </button>
              <button className="menu-item" role="menuitem" onClick={() => goToApp('instructor')}>
                <Ico id="i-plus" />
                <div>
                  <b>Create a course</b>
                  <span>Deploy your own evaluation contract</span>
                </div>
              </button>
              <button className="menu-item" role="menuitem" onClick={() => goToApp('results')}>
                <Ico id="i-chart" />
                <div>
                  <b>See live results</b>
                  <span>Read the tally straight from Midnight</span>
                </div>
              </button>
            </div>
            <button className="fab" aria-label="Open the app" onClick={() => goToApp('student')}>
              <img src="/img/candor-mascot.webp" alt="" />
            </button>
          </div>
        </section>

        <section className="letter">
          <div className="wrap letter-grid">
            <div className="letter-head reveal">
              <div className="brand-row">
                <Ico id="i-mark" className="mark big" />
                <span className="script">Open letter</span>
              </div>
              <h2>
                Dear instructor,
                <br />
                <span>your students already know what to fix. They just won't sign it.</span>
              </h2>
            </div>
            <div className="letter-body reveal">
              <p>End-of-term surveys ask for honesty, then ask students to log in with their student ID.</p>
              <p>So the most useful feedback never gets written. It gets softened, skipped, or saved for the hallway.</p>
              <p>Give them a way to be counted without being named. Provably enrolled, provably once.</p>
              <p>
                <strong>Candor does the counting. Midnight does the forgetting.</strong>
              </p>
            </div>
          </div>
          <PathLine />
        </section>

        <section className="why" id="why">
          <div className="wrap center">
            <span className="script reveal">Why it holds</span>
            <h2 className="reveal">Prove it, don't promise it</h2>
            <p className="lead reveal">Most surveys promise anonymity. Candor makes it a property of the math.</p>
            <div className="why-grid">
              <article className="why-card reveal">
                <div className="ico" style={{ background: 'var(--violet)' }}><Ico id="i-lock" /></div>
                <h3>Honest by default</h3>
                <p>Students say what they think when their name is not attached. Candor removes the name at the proof level, not with a privacy policy.</p>
              </article>
              <article className="why-card reveal">
                <div className="ico" style={{ background: 'var(--coral)' }}><Ico id="i-once" /></div>
                <h3>One student, one rating</h3>
                <p>Every rating spends a nullifier derived from the student's secret. A second rating from the same student is rejected by the contract itself.</p>
              </article>
              <article className="why-card reveal">
                <div className="ico" style={{ background: 'var(--amber)' }}><Ico id="i-eye" /></div>
                <h3>Anyone can verify</h3>
                <p>The roster, the tally and every spent nullifier live on Midnight. Nobody has to trust the instructor, the university or us.</p>
              </article>
              <article className="why-card reveal">
                <div className="ico" style={{ background: 'var(--mint)' }}><Ico id="i-shield" /></div>
                <h3>Not even Candor</h3>
                <p>The secret stays in the student's browser. The proof shows that a rater is on the roster, never which one. There is no database to leak.</p>
              </article>
            </div>
          </div>
        </section>

        <HowItWorks commitment={commitment} />

        <section className="deal" id="app">
          <div className="wrap">
            <div className="center">
              <span className="script reveal">The app</span>
              <h2 className="reveal">Run a real evaluation on Midnight</h2>
              <p className="lead reveal">
                Everything below talks to the Preprod network through your Lace wallet. Proofs are generated on your machine.
              </p>
              {!session && (
                <button className="btn btn-ghost reveal" onClick={connect} disabled={connecting}>
                  {connecting ? 'Connecting…' : 'Connect Lace to start'}
                </button>
              )}
            </div>

            <div className="dash reveal">
              <nav className="rail" aria-label="App sections" role="tablist">
                <Ico id="i-mark" className="mark rail-mark" />
                {(
                  [
                    ['student', 'i-user', 'Student'],
                    ['instructor', 'i-board', 'Instructor'],
                    ['results', 'i-chart', 'Results'],
                  ] as const
                ).map(([key, icon, label]) => (
                  <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>
                    <Ico id={icon} />
                    <span>{label}</span>
                  </button>
                ))}
              </nav>

              <div className="dash-main">
                <div className="course-bar">
                  <label htmlFor="course">Course address</label>
                  <div className="row">
                    <input
                      id="course"
                      className="field"
                      value={courseInput}
                      placeholder="Paste the course address your instructor shared"
                      onChange={(e) => setCourseInput(e.target.value)}
                      spellCheck={false}
                    />
                    <button className="btn btn-ghost btn-sm" onClick={() => openCourse(courseInput)}>Open</button>
                  </div>
                  {course && state && (
                    <div className="course-meta">
                      <strong>{state.courseCode}</strong>
                      <PhaseBadge phase={state.phase} />
                      <span>{state.enrolled} enrolled · {state.responses} rated</span>
                      <button className="link sm" onClick={() => navigator.clipboard.writeText(window.location.href)}>Copy share link</button>
                    </div>
                  )}
                  {course && stateError && !state && <p className="muted small">{stateError}</p>}
                </div>

                {busy && (
                  <div className="banner busy">
                    <span className="spinner" />
                    <span>{busy} Generating the zero-knowledge proof can take a minute.</span>
                  </div>
                )}
                {notice && <div className={`banner ${notice.kind}`}>{notice.text}</div>}

                <div className="panel">
                  {tab === 'student' && (
                    <StudentPanel
                      commitment={commitment}
                      secret={secret}
                      onImport={(hex) => {
                        try {
                          setSecret(importSecret(hex));
                          apiRef.current = null;
                          setNotice({ kind: 'ok', text: 'Identity restored on this browser.' });
                        } catch (e) {
                          setNotice({ kind: 'err', text: errorText(e) });
                        }
                      }}
                      state={state}
                      canSubmit={!!session && !!course && state?.phase === 'open' && !busy}
                      walletReady={!!session}
                      onSubmit={(rating) =>
                        run(
                          'Submitting your anonymous rating.',
                          async () => (await courseApi()).submitRating(rating),
                          'Your rating is on-chain. Nobody can link it to you.',
                        )
                      }
                    />
                  )}
                  {tab === 'instructor' && (
                    <InstructorPanel
                      state={state}
                      hasCourse={!!course}
                      isInstructor={isInstructor}
                      walletReady={!!session}
                      busy={!!busy}
                      onCreate={createCourse}
                      onEnroll={(codes) =>
                        run(
                          `Adding ${codes.length} student${codes.length > 1 ? 's' : ''}.`,
                          async () => {
                            const api = await courseApi();
                            let last = '';
                            for (const code of codes) last = await api.enroll(code);
                            return last;
                          },
                          'Roster updated.',
                        )
                      }
                      onOpen={() => run('Opening ratings.', async () => (await courseApi()).openEvaluation(), 'Ratings are open.')}
                      onClose={() => run('Closing ratings.', async () => (await courseApi()).closeEvaluation(), 'Ratings are closed. Results are final.')}
                    />
                  )}
                  {tab === 'results' && <ResultsPanel state={state} hasCourse={!!course} />}
                </div>
              </div>
            </div>
          </div>
        </section>

        <OpenCourse
          onOpen={(address) => {
            if (openCourse(address)) goToApp('student');
          }}
        />
      </main>

      <footer className="foot">
        <div className="wrap">
          <div className="foot-mid">
            <Ico id="i-mark" className="mark" />
            <p>Honest feedback, counted exactly once, proven without names.</p>
            <small>Demo contract on Midnight Preprod</small>
            <a
              href={`?course=${DEMO_COURSE}`}
              onClick={(e) => {
                e.preventDefault();
                if (openCourse(DEMO_COURSE)) goToApp('results');
              }}
            >
              {shorten(DEMO_COURSE, 10, 8)}
            </a>
          </div>
          <div className="foot-bot">
            <span>© 2026 Candor · Rise In × Midnight, New Moon to Full</span>
            <nav aria-label="Footer">
              <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
              <a href="#how">How it works</a>
              <a href={`${REPO_URL}#privacy-model`} target="_blank" rel="noreferrer">Privacy model</a>
              <a href="https://midnight.network" target="_blank" rel="noreferrer">Midnight</a>
            </nav>
          </div>
        </div>
      </footer>
    </>
  );
}

function PathLine() {
  const nodes: [string, number, number, string][] = [
    ['i-key', 0.04, 0.18, 'var(--violet)'],
    ['i-chat', 0.2, 0.42, 'var(--fg)'],
    ['i-lock', 0.36, 0.62, 'var(--coral)'],
    ['i-star', 0.5, 0.68, 'var(--amber)'],
    ['i-cube', 0.66, 0.52, 'var(--cyan)'],
    ['i-moon', 0.82, 0.3, 'var(--amber)'],
    ['i-check', 0.96, 0.12, 'var(--mint)'],
  ];
  return (
    <div className="path" aria-hidden="true">
      <svg className="line" viewBox="0 0 1440 220" preserveAspectRatio="none">
        <path d="M0 40 C 300 30, 420 150, 720 150 S 1200 60, 1440 20" fill="none" stroke="var(--line)" strokeWidth="1.5" strokeDasharray="4 6" />
      </svg>
      {nodes.map(([icon, x, y, color], i) => (
        <div key={icon} className="node" style={{ left: `${x * 100}%`, top: `${y * 100}%`, color, transitionDelay: `${i * 0.12}s` }}>
          <Ico id={icon} />
        </div>
      ))}
    </div>
  );
}

function HowItWorks({ commitment }: { commitment: string }) {
  const [mode, setMode] = useState(0);
  const tabs: [string, string, string][] = [
    ['i-key', 'Enrollment code', 'A hash of a secret made in your browser.'],
    ['i-star', 'Anonymous rating', 'A zero-knowledge proof of roster membership.'],
    ['i-once', 'One per student', 'A nullifier stops double ratings.'],
    ['i-chart', 'Live results', 'Totals anyone can read, names nobody can.'],
  ];
  let preview: ReactNode;
  if (mode === 0) {
    preview = (
      <>
        <div className="widget-head"><span>Your enrollment code</span><Ico id="i-key" className="x" /></div>
        <p className="w-note">Send this to your instructor. It is <code>hash("student", secret)</code>, so it reveals nothing.</p>
        <code className="code">{commitment}</code>
        <div className="widget-foot"><span className="muted small">Secret: stored in this browser</span><span className="btn btn-light btn-sm"><Ico id="i-copy" className="i16" />Copy</span></div>
      </>
    );
  } else if (mode === 1) {
    preview = (
      <>
        <div className="widget-head"><span>Rate CENG-301</span><Ico id="i-x" className="x" /></div>
        <p className="w-note">How was this course?</p>
        <div className="stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} className={n <= 4 ? 'star on' : 'star'}><Ico id="i-star" /></span>
          ))}
        </div>
        <div className="proof-row"><Ico id="i-shield" className="i16" />Proves: you are on the roster</div>
        <div className="proof-row off"><Ico id="i-eye" className="i16" />Reveals: nothing about which student</div>
        <div className="widget-foot"><span className="muted small">Fee paid in tDUST</span><span className="btn btn-light btn-sm">Submit</span></div>
      </>
    );
  } else if (mode === 2) {
    preview = (
      <>
        <div className="widget-head"><span>Rate CENG-301</span><Ico id="i-x" className="x" /></div>
        <div className="w-err">
          <b>Already rated</b>
          <span>This student's nullifier is already spent. The contract rejects a second rating before it ever reaches the chain.</span>
        </div>
        <div className="nullifier"><span>nullifier</span><code>hash("nullifier", course, secret)</code></div>
      </>
    );
  } else {
    preview = (
      <>
        <div className="widget-head"><span>Results · CENG-301</span><Ico id="i-chart" className="x" /></div>
        <div className="mini-stats"><div><b>4.25</b><span>average</span></div><div><b>24</b><span>ratings</span></div><div><b>80%</b><span>turnout</span></div></div>
        {[
          [5, 11],
          [4, 8],
          [3, 3],
          [2, 1],
          [1, 1],
        ].map(([s, c]) => (
          <div className="mini-bar" key={s}><span>{s}★</span><i style={{ width: `${(c / 11) * 100}%` }} /><em>{c}</em></div>
        ))}
        <p className="muted small">Example data</p>
      </>
    );
  }
  return (
    <section className="features" id="how">
      <div className="wrap">
        <div className="center">
          <span className="script reveal">How it works</span>
          <h2 className="reveal">Four steps, zero names</h2>
          <p className="lead reveal">The instructor never learns who said what. The contract still makes sure every voice counts exactly once.</p>
        </div>
        <div className="feat-grid">
          <div className="feat-list" role="tablist" aria-label="How Candor works">
            {tabs.map(([icon, title, text], i) => (
              <button key={title} className="feat-tab" role="tab" aria-selected={mode === i} onClick={() => setMode(i)}>
                <span className="fi"><Ico id={icon} /></span>
                <span>
                  <b>{title}</b>
                  <span>{text}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="feat-stage" role="tabpanel">
            <div className="widget" key={mode}>{preview}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function OpenCourse({ onOpen }: { onOpen: (address: string) => void }) {
  const [value, setValue] = useState('');
  const [bad, setBad] = useState(false);
  return (
    <section className="wait">
      <div className="wrap wait-grid">
        <div className="wait-copy reveal">
          <span className="script">Your turn</span>
          <h2>Open a course</h2>
          <p className="lead">Paste the address your instructor shared, or step into the live demo course on Preprod.</p>
          <form
            className="wait-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const ok = isContractAddress(value.trim());
              setBad(!ok);
              if (ok) onOpen(value.trim());
            }}
          >
            <label htmlFor="openAddr" className="sr">Course address</label>
            <input
              id="openAddr"
              className={`field${bad ? ' err' : ''}`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="64-character course address"
              spellCheck={false}
            />
            <button className="btn btn-light" type="submit">Open course</button>
          </form>
          <p className="form-note">
            {bad ? (
              <span className="error">A course address is 64 hex characters.</span>
            ) : (
              <button className="link sm" onClick={() => onOpen(DEMO_COURSE)}>Or open the demo course →</button>
            )}
          </p>
        </div>
        <img className="wait-art" src="/img/candor-cta.webp" alt="" />
      </div>
    </section>
  );
}

function PhaseBadge({ phase }: { phase: CourseState['phase'] }) {
  const label = phase === 'enrollment' ? 'Enrollment' : phase === 'open' ? 'Ratings open' : 'Closed';
  return <span className={`badge ${phase}`}>{label}</span>;
}

function StudentPanel(props: {
  commitment: string;
  secret: Uint8Array;
  onImport: (hex: string) => void;
  state: CourseState | null;
  canSubmit: boolean;
  walletReady: boolean;
  onSubmit: (rating: number) => void;
}) {
  const [rating, setRating] = useState(0);
  const [showBackup, setShowBackup] = useState(false);
  const [restore, setRestore] = useState('');
  const labels = ['', 'Poor', 'Weak', 'Okay', 'Good', 'Excellent'];

  return (
    <div className="grid">
      <article className="card">
        <h3>1 · Your enrollment code</h3>
        <p className="muted">
          Send this code to your instructor. It is a hash of a secret that never leaves this browser, so the code cannot be
          linked to the rating you give later.
        </p>
        <code className="code">{props.commitment}</code>
        <div className="row">
          <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(props.commitment)}>
            <Ico id="i-copy" className="i16" />Copy code
          </button>
          <button className="link sm" onClick={() => setShowBackup((v) => !v)}>{showBackup ? 'Hide backup' : 'Back up or restore'}</button>
        </div>
        {showBackup && (
          <div className="backup">
            <p className="muted small">
              Keep this secret somewhere safe. Anyone who has it can rate as you. Clearing browser data without a backup means you
              cannot rate courses you enrolled in.
            </p>
            <code className="code secret">{exportSecret(props.secret)}</code>
            <div className="row">
              <input className="field" aria-label="Saved secret" value={restore} onChange={(e) => setRestore(e.target.value)} placeholder="Paste a saved secret to restore" spellCheck={false} />
              <button className="btn btn-ghost btn-sm" onClick={() => props.onImport(restore)} disabled={!restore}>Restore</button>
            </div>
          </div>
        )}
      </article>

      <article className="card">
        <h3>2 · Rate the course</h3>
        {!props.state ? (
          <p className="muted">Open a course above to rate it.</p>
        ) : props.state.phase === 'enrollment' ? (
          <p className="muted">The instructor has not opened ratings yet.</p>
        ) : props.state.phase === 'closed' ? (
          <p className="muted">Ratings for this course are closed.</p>
        ) : (
          <>
            <p className="muted">One rating per student. Your wallet pays the fee, your identity stays out of the transaction.</p>
            <div className="stars big" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} className={rating >= n ? 'star on' : 'star'} onClick={() => setRating(n)}>
                  <Ico id="i-star" />
                </button>
              ))}
              <span className="star-label">{labels[rating]}</span>
            </div>
            <button className="btn btn-light wide" disabled={!props.canSubmit || rating === 0} onClick={() => props.onSubmit(rating)}>
              {props.walletReady ? 'Submit anonymous rating' : 'Connect Lace to submit'}
            </button>
          </>
        )}
      </article>
    </div>
  );
}

function InstructorPanel(props: {
  state: CourseState | null;
  hasCourse: boolean;
  isInstructor: boolean;
  walletReady: boolean;
  busy: boolean;
  onCreate: (code: string) => void;
  onEnroll: (codes: string[]) => void;
  onOpen: () => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState('');
  const parsed = codes
    .split(/[\s,]+/)
    .map((c) => c.trim().replace(/^0x/, ''))
    .filter(Boolean);
  const invalid = parsed.filter((c) => !/^[0-9a-fA-F]{64}$/.test(c));

  return (
    <div className="grid">
      <article className="card">
        <h3>Create a course</h3>
        <p className="muted">Deploys a new evaluation contract. You become its instructor through a key stored in this browser.</p>
        <div className="row">
          <input className="field" aria-label="Course code" value={code} maxLength={32} onChange={(e) => setCode(e.target.value)} placeholder="Course code, e.g. CENG-301 Fall 2026" />
          <button className="btn btn-light btn-sm" disabled={!props.walletReady || !code.trim() || props.busy} onClick={() => props.onCreate(code)}>
            Create
          </button>
        </div>
        {!props.walletReady && <p className="muted small">Connect Lace to deploy.</p>}
      </article>

      <article className="card">
        <h3>Manage this course</h3>
        {!props.hasCourse || !props.state ? (
          <p className="muted">Create a course or open one you created.</p>
        ) : !props.isInstructor ? (
          <p className="muted">This browser does not hold the instructor key for {props.state.courseCode}.</p>
        ) : (
          <>
            <p className="muted">
              {props.state.enrolled} students enrolled, {props.state.responses} ratings received.
            </p>
            {props.state.phase === 'enrollment' && (
              <>
                <label htmlFor="codes">Student enrollment codes</label>
                <textarea
                  id="codes"
                  className="field"
                  rows={5}
                  value={codes}
                  onChange={(e) => setCodes(e.target.value)}
                  placeholder="One code per line"
                  spellCheck={false}
                />
                {invalid.length > 0 && <p className="error small">{invalid.length} code(s) are not 64 hex characters.</p>}
                <div className="row">
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={!parsed.length || invalid.length > 0 || props.busy}
                    onClick={() => {
                      props.onEnroll(parsed);
                      setCodes('');
                    }}
                  >
                    Add {parsed.length || ''} to roster
                  </button>
                  <button className="btn btn-light btn-sm" disabled={props.state.enrolled === 0 || props.busy} onClick={props.onOpen}>
                    Open ratings
                  </button>
                </div>
              </>
            )}
            {props.state.phase === 'open' && (
              <button className="btn btn-light btn-sm" disabled={props.busy} onClick={props.onClose}>
                Close ratings
              </button>
            )}
            {props.state.phase === 'closed' && <p className="muted">This evaluation is closed. Results are final.</p>}
          </>
        )}
      </article>
    </div>
  );
}

function ResultsPanel({ state, hasCourse }: { state: CourseState | null; hasCourse: boolean }) {
  if (!hasCourse || !state)
    return (
      <article className="card empty">
        <img src="/img/candor-mascot.webp" alt="" width="96" height="91" />
        <p className="muted">Open a course to see its results.</p>
      </article>
    );
  const max = Math.max(1, ...state.distribution);
  const turnout = state.enrolled ? Math.round((state.responses / state.enrolled) * 100) : 0;
  return (
    <article className="card results">
      <div className="stats">
        <div>
          <span className="big">{state.average === null ? '–' : state.average.toFixed(2)}</span>
          <span className="muted">average of 5</span>
        </div>
        <div>
          <span className="big">{state.responses}</span>
          <span className="muted">ratings</span>
        </div>
        <div>
          <span className="big">{turnout}%</span>
          <span className="muted">turnout</span>
        </div>
      </div>
      <div className="bars">
        {[5, 4, 3, 2, 1].map((n) => {
          const count = state.distribution[n - 1];
          return (
            <div className="bar-row" key={n}>
              <span className="bar-label">{n} ★</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(count / max) * 100}%` }} />
              </div>
              <span className="bar-count">{count}</span>
            </div>
          );
        })}
      </div>
      <p className="muted small">Read straight from the Midnight indexer. Only totals exist on-chain, so there is nothing to de-anonymise.</p>
    </article>
  );
}
