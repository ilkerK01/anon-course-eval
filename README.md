<p align="center">
  <img src="ui/public/img/candor-icon-512.png" alt="Candor" width="120">
</p>

<h1 align="center">Candor</h1>

<p align="center"><strong>Every student counted. No student named.</strong><br>
Anonymous course evaluations, proven with zero-knowledge on Midnight.</p>

<p align="center">
  <a href="https://candor-gules.vercel.app"><img alt="Live demo" src="https://img.shields.io/badge/live%20demo-candor--gules.vercel.app-8b7cff?style=flat-square"></a>
  <a href="https://github.com/ilkerK01/anon-course-eval/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/ilkerK01/anon-course-eval/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Network" src="https://img.shields.io/badge/network-Midnight%20Preprod-0b0b10?style=flat-square">
  <img alt="Tests" src="https://img.shields.io/badge/tests-14%20passing-5fe0a0?style=flat-square">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-a3a3b0?style=flat-square">
</p>

<p align="center"><img src="docs/screenshots/landing.png" alt="Candor landing page" width="860"></p>

Students rarely write honest course feedback when they suspect the instructor can tell who wrote it. Candor fixes that with zero-knowledge proofs: a student proves "I am enrolled in this course and have not rated it yet" without revealing which student they are. The instructor, the university and the public see only the final tally.

Built for the Rise In × Midnight **New Moon to Full** program. Track: *Anonymous Feedback / Survey* combined with *Private Allowlist Access*.

## Live Demo

**https://candor-gules.vercel.app**

Demo course: https://candor-gules.vercel.app/?course=0d5f3114df021fc8a651d73f811e7ec0bceca69b6ea176c5345877ae5a7b09d8

Reading results needs nothing. To create a course or rate, you need Lace on Midnight Preprod with its proof server set to Local, and a local proof server on port 6300 (one `docker run`, see below), because Midnight's hosted proof server does not accept browser requests.

The demo course has already gone through the full flow on Preprod: deployed, one student enrolled, ratings opened, one anonymous rating submitted.

## Contract Address

| Network | Address |
| --- | --- |
| Preprod | `0d5f3114df021fc8a651d73f811e7ec0bceca69b6ea176c5345877ae5a7b09d8` |

Course `CENG-301 Fall 2026`. Latest on-chain call at the time of writing: transaction `3350f472cfd7f656288c82c366989ecf440db98c4671effa9d7c9cc58d15bffe`, block 2663465. Verify with the Preprod indexer:

```bash
curl -s https://indexer.preprod.midnight.network/api/v4/graphql -H 'content-type: application/json' \
  -d '{"query":"{ contractAction(address: \"0d5f3114df021fc8a651d73f811e7ec0bceca69b6ea176c5345877ae5a7b09d8\") { __typename transaction { hash block { height } } } }"}'
```

An earlier build of the same contract (without the duplicate-enrollment guard) lives at `a9d23256a40f890ba1879934e37ff4b92289579e5543025cac93542a1fdada2e`.

## Screenshots

| Student view | Results, read from the indexer |
| --- | --- |
| ![Student view](docs/screenshots/app-student.png) | ![Results](docs/screenshots/results.png) |

| Contract compiled to 4 circuits | 14 tests on the compiled circuits | Mobile |
| --- | --- | --- |
| ![Compile output](docs/screenshots/compile.png) | ![Test output](docs/screenshots/tests.png) | <img src="docs/screenshots/mobile.png" width="200" alt="Mobile layout"> |

## What This Does

1. **Enrollment.** Each student's browser generates a secret key that never leaves the device. The student sends the instructor an *enrollment code*, `hash("student", secret)`. The instructor adds the codes to the course contract, where they become leaves of a Merkle tree.
2. **Rating.** When ratings open, the student submits a 1 to 5 rating. The circuit proves the student knows a secret whose code is a leaf of the roster tree, without revealing which leaf. It also publishes a *nullifier*, `hash("nullifier", courseCode, secret)`, so the same student cannot rate twice.
3. **Results.** Anyone can read the average and the distribution straight from the chain.

**Initial product idea.** Universities run end-of-term evaluations on platforms that know exactly who submitted each form, and students know it. Candor gives every course a small contract: the registrar or instructor loads the roster as anonymous codes, students rate from their own browser, and the tally is public and tamper-proof. Nobody, including the platform operator, can link a rating to a student, and nobody can stuff the ballot box.

## Privacy Model

- **PUBLIC:** course code, phase (enrollment, open, closed), instructor key hash, roster of enrollment codes as opaque hashes, spent nullifiers, number of ratings, rating sum and the 1 to 5 star histogram.
- **PRIVATE:** each student's and the instructor's secret key (kept in browser storage, passed to circuits only as witnesses), and the Merkle path used in the proof.
- **PROVED without revealing:** that the rater is on the roster, that this rater has not rated before, and that the caller of instructor actions holds the instructor key.

| Data | Where it lives | Who can see it |
| --- | --- | --- |
| Course code, phase | Public ledger | Everyone |
| Instructor key `hash("instructor", secret)` | Public ledger | Everyone, reveals nothing about the secret |
| Roster of enrollment codes (Merkle tree) | Public ledger | Everyone, as opaque hashes |
| Nullifiers of students who rated | Public ledger | Everyone, not linkable to enrollment codes |
| Rating count, sum, histogram | Public ledger | Everyone |
| Student and instructor secret keys | Browser storage, witness only | Only the owner |
| Which roster entry a rating came from | Nowhere, only inside the proof | Nobody |

## Privacy Claim

An on-chain observer **can see** that a rating of, say, 4 was added to course `CENG-301`, that the course has 30 enrolled codes and 18 ratings, and that a new nullifier was spent.

An on-chain observer **cannot see** which of the 30 enrolled students submitted that rating. The instructor, who handed out the codes and knows which student owns which code, cannot tell either: the nullifier is a different hash of the student's secret, and the proof never reveals the Merkle leaf. The one thing a student can reveal is their own secret, which only they hold.

### Trust assumptions and known limits

- **Roster integrity depends on whoever holds the instructor key.** The contract proves that every rating comes from a code on the roster and that each code rates at most once. It cannot prove that a code belongs to a real student, so an instructor could enroll codes they generated themselves. Mitigations: the roster is public, so the enrolled count can be checked against the class list, every student can verify their own code is on it, and the duplicate-enrollment guard stops the count from being padded with repeats. A registrar-held key (see PROPOSAL.md) moves this trust away from the person being evaluated.
- **One secret per browser.** A student who clears browser storage without the backup loses the ability to rate; a student who shares the secret gives away their vote.
- **Proof generation runs where the user is.** Anyone submitting a transaction needs a proof server they control (see below).

## Contract

`contract/course-eval.compact`

| Circuit | Who | What it does |
| --- | --- | --- |
| `constructor(code)` | Instructor | Stores the course code and the instructor key |
| `enroll(commitment)` | Instructor | Adds a student's enrollment code to the roster, rejects duplicates |
| `openEvaluation()` | Instructor | Closes enrollment and opens ratings |
| `closeEvaluation()` | Instructor | Stops accepting ratings, results become final |
| `submitRating(rating)` | Enrolled student | Proves roster membership, spends a nullifier, updates the tally |

Compiled output (circuits, prover and verifier keys, ZKIR, TypeScript bindings) is committed in `contract/managed/`.

## Tech Stack

- **Contract:** Compact (compiler 0.31.1, language 0.23), `HistoricMerkleTree<10, Bytes<32>>`, `Set<Bytes<32>>` for nullifiers and enrolled codes, counters for the tally
- **SDK:** Midnight.js 4.1.1, compact-js 2.5.1, compact-runtime 0.16.0, ledger v8
- **Wallet:** Lace (Midnight Preprod) through the DApp Connector API 4.x
- **Frontend:** React 19, Vite 7, TypeScript. Typefaces: Aspekta, Geist and Fasthand, all under the SIL Open Font License, self-hosted in `ui/public/fonts`
- **Proving:** local proof server `midnightntwrk/proof-server:8.1.0`
- **Tests:** Vitest against the compiled contract
- **CI:** GitHub Actions

## Prerequisites

- Node.js 22
- Docker
- Compact toolchain, `compact update 0.31.1`
- Lace wallet with Midnight set to **Preprod**, some tNIGHT from the [faucet](https://faucet.preprod.midnight.network/) and tDUST generation turned on

On Windows, run everything inside WSL (Ubuntu).

## Setup & Run Locally

```bash
git clone https://github.com/ilkerK01/anon-course-eval.git
cd anon-course-eval

docker run -d --name midnight-proof -p 6300:6300 midnightntwrk/proof-server:8.1.0 midnight-proof-server -v

npm install
npm run compile
npm test

cd ui
npm run dev
```

Open http://localhost:3000 and connect Lace.

- **Instructor:** Instructor tab, enter a course code, *Create*. Paste the students' enrollment codes, *Add to roster*, then *Open ratings*. Share the page link.
- **Student:** Student tab, copy the enrollment code and send it to the instructor. When ratings are open, pick 1 to 5 stars and *Submit anonymous rating*.
- **Anyone:** Results tab shows the average, turnout and histogram.

In Lace, open **Settings → Midnight → Proof Server** and choose **Local (http://localhost:6300)**. Lace proves the fee part of every transaction, and with the remote setting that step fails for this dApp's transactions.

Proofs are generated by the proof server in `VITE_PROOF_SERVER_URL` (default `http://localhost:6300`). Midnight's hosted Preprod proof server rejects browser requests (CORS), so a local proof server is required. If the variable is empty, the app uses the wallet's own proving provider.

## Run Tests

```bash
npm test
```

`contract/test/course-eval.test.ts` runs the compiled circuits with the Compact runtime, no mocks. 14 tests cover:

- circuit logic: tally, average inputs and histogram across several students
- state transitions: enrollment → open → closed, and what each phase allows
- access control: only the instructor key can enroll, open or close
- roster integrity: the same code cannot be enrolled twice, and a student enrolled early can still rate after many later enrollments
- privacy and integrity: outsiders cannot rate, nobody can rate twice, and the stored nullifier never equals the student's enrollment code

## CI/CD

`.github/workflows/ci.yml` runs on every push to `main` and every pull request:

1. installs Node 22 and the Compact toolchain pinned to 0.31.1
2. compiles the contract to ZK circuits
3. installs dependencies with `npm ci`
4. runs the contract test suite
5. type-checks the API layer
6. builds the production web app

## Product Proposal

See [PROPOSAL.md](PROPOSAL.md).

## Notes for reviewers

- **Reading needs nothing.** Open the demo course link; the Results tab reads the tally from the public indexer.
- **Writing needs Lace + a local proof server.** Install Lace, switch Midnight to Preprod, get tNIGHT from the faucet, wait for tDUST, set Lace's proof server to Local, and run the `docker run` line above. The live site is served over HTTPS and calls `http://localhost:6300`; Chrome allows this because localhost counts as a secure context.
- **Pinned dependency versions** in the root `package.json` `overrides` are deliberate. `@midnight-ntwrk/ledger-v8` and `@midnight-ntwrk/onchain-runtime-v3` must resolve to a single copy each, otherwise two WASM instances end up in the bundle and transactions fail with `expected instance of _LedgerParameters`. `@swc/core` is pinned because newer builds break `vite-plugin-top-level-await`.
- **License:** MIT, see [LICENSE](LICENSE).

## Brand

| Mark | Wordmark | Icon |
| --- | --- | --- |
| <img src="ui/public/img/candor-mark.svg" width="64" alt="Candor mark"> | <img src="ui/public/img/candor-logo.svg" width="240" alt="Candor wordmark"> | <img src="ui/public/img/candor-icon-512.png" width="64" alt="Candor icon"> |

A padlock whose body is a speech bubble, with a star inside: a rating given in confidence. Files live in `ui/public/img/`.

## Project Layout

```
contract/   Compact contract, witnesses, compiled output (managed/), tests
api/        Deploy / join / call helpers shared by the web app
ui/         React + Vite web app with Lace wallet integration
docs/       Screenshots used in this README
```
