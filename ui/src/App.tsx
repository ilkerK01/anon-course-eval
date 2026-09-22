import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CourseEvalAPI, instructorKeyOf, studentCommitment, type CourseState } from '../../api/src/index';
import { connectWallet, readDust, type WalletSession } from './wallet';
import { exportSecret, importSecret, loadSecret } from './identity';
import { isContractAddress, useCourseState } from './useCourseState';

type Tab = 'student' | 'instructor' | 'results';

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
  const apiRef = useRef<{ address: string; api: CourseEvalAPI } | null>(null);

  const { state, error: stateError, refresh } = useCourseState(course || null);
  const commitment = useMemo(() => studentCommitment(secret), [secret]);
  const isInstructor = !!state && state.instructorKey === instructorKeyOf(secret);

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
      return;
    }
    apiRef.current = null;
    setCourse(clean);
    setCourseInput(clean);
    writeCourseToUrl(clean);
    setNotice(null);
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
    <div className="shell">
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden>◐</span>
          <div>
            <h1>Candor</h1>
            <p>Anonymous course evaluations, proven on Midnight</p>
          </div>
        </div>
        <div className="wallet">
          {session ? (
            <>
              <div className="wallet-info">
                <span className="dot on" />
                <span title={session.address}>{shorten(session.address, 14, 6)}</span>
                {dust && <span className="dust">{formatDust(dust.balance)} tDUST</span>}
              </div>
              <button className="ghost" onClick={disconnect}>Disconnect</button>
            </>
          ) : (
            <button className="primary" onClick={connect} disabled={connecting}>
              {connecting ? 'Connecting…' : 'Connect Lace'}
            </button>
          )}
        </div>
      </header>

      <section className="course-bar">
        <label htmlFor="course">Course address</label>
        <div className="row">
          <input
            id="course"
            value={courseInput}
            placeholder="Paste the course address your instructor shared"
            onChange={(e) => setCourseInput(e.target.value)}
            spellCheck={false}
          />
          <button className="ghost" onClick={() => openCourse(courseInput)}>Open</button>
        </div>
        {course && state && (
          <p className="course-meta">
            <strong>{state.courseCode}</strong>
            <PhaseBadge phase={state.phase} />
            <span>{state.enrolled} enrolled · {state.responses} rated</span>
            <button className="link" onClick={() => navigator.clipboard.writeText(window.location.href)}>Copy share link</button>
          </p>
        )}
        {course && stateError && !state && <p className="muted">{stateError}</p>}
      </section>

      <nav className="tabs" role="tablist">
        {(['student', 'instructor', 'results'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'student' ? 'Student' : t === 'instructor' ? 'Instructor' : 'Results'}
          </button>
        ))}
      </nav>

      {busy && (
        <div className="banner busy">
          <span className="spinner" />
          <span>{busy} Generating the zero-knowledge proof can take a minute.</span>
        </div>
      )}
      {notice && <div className={`banner ${notice.kind}`}>{notice.text}</div>}

      <main>
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
              run('Submitting your anonymous rating.', async () => (await courseApi()).submitRating(rating), 'Your rating is on-chain. Nobody can link it to you.')
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
      </main>

      <footer>
        <p>
          Your rating is a zero-knowledge proof that you are on the roster. The chain stores only a one-time nullifier and the
          tally, never your identity. Built on Midnight Preprod.
        </p>
      </footer>
    </div>
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
        <h2>1 · Your enrollment code</h2>
        <p className="muted">
          Send this code to your instructor. It is a hash of a secret that never leaves this browser, so the code cannot be
          linked to the rating you give later.
        </p>
        <code className="code">{props.commitment}</code>
        <div className="row">
          <button className="ghost" onClick={() => navigator.clipboard.writeText(props.commitment)}>Copy code</button>
          <button className="link" onClick={() => setShowBackup((v) => !v)}>{showBackup ? 'Hide backup' : 'Back up or restore'}</button>
        </div>
        {showBackup && (
          <div className="backup">
            <p className="muted">
              Keep this secret somewhere safe. Anyone who has it can rate as you. Clearing browser data without a backup means you
              cannot rate courses you enrolled in.
            </p>
            <code className="code secret">{exportSecret(props.secret)}</code>
            <div className="row">
              <input value={restore} onChange={(e) => setRestore(e.target.value)} placeholder="Paste a saved secret to restore" spellCheck={false} />
              <button className="ghost" onClick={() => props.onImport(restore)} disabled={!restore}>Restore</button>
            </div>
          </div>
        )}
      </article>

      <article className="card">
        <h2>2 · Rate the course</h2>
        {!props.state ? (
          <p className="muted">Open a course above to rate it.</p>
        ) : props.state.phase === 'enrollment' ? (
          <p className="muted">The instructor has not opened ratings yet.</p>
        ) : props.state.phase === 'closed' ? (
          <p className="muted">Ratings for this course are closed.</p>
        ) : (
          <>
            <p className="muted">One rating per student. Your wallet pays the fee, your identity stays out of the transaction.</p>
            <div className="stars" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} role="radio" aria-checked={rating === n} className={rating >= n ? 'star on' : 'star'} onClick={() => setRating(n)}>
                  ★
                </button>
              ))}
              <span className="star-label">{labels[rating]}</span>
            </div>
            <button className="primary wide" disabled={!props.canSubmit || rating === 0} onClick={() => props.onSubmit(rating)}>
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
        <h2>Create a course</h2>
        <p className="muted">Deploys a new evaluation contract. You become its instructor through a key stored in this browser.</p>
        <div className="row">
          <input value={code} maxLength={32} onChange={(e) => setCode(e.target.value)} placeholder="Course code, e.g. CENG-301 Fall 2026" />
          <button className="primary" disabled={!props.walletReady || !code.trim() || props.busy} onClick={() => props.onCreate(code)}>
            Create
          </button>
        </div>
        {!props.walletReady && <p className="muted small">Connect Lace to deploy.</p>}
      </article>

      <article className="card">
        <h2>Manage this course</h2>
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
                  rows={5}
                  value={codes}
                  onChange={(e) => setCodes(e.target.value)}
                  placeholder="One code per line"
                  spellCheck={false}
                />
                {invalid.length > 0 && <p className="error small">{invalid.length} code(s) are not 64 hex characters.</p>}
                <div className="row">
                  <button
                    className="ghost"
                    disabled={!parsed.length || invalid.length > 0 || props.busy}
                    onClick={() => {
                      props.onEnroll(parsed);
                      setCodes('');
                    }}
                  >
                    Add {parsed.length || ''} to roster
                  </button>
                  <button className="primary" disabled={props.state.enrolled === 0 || props.busy} onClick={props.onOpen}>
                    Open ratings
                  </button>
                </div>
              </>
            )}
            {props.state.phase === 'open' && (
              <button className="primary" disabled={props.busy} onClick={props.onClose}>
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
  if (!hasCourse || !state) return <article className="card"><p className="muted">Open a course to see its results.</p></article>;
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
