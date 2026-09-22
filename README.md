# Candor

[![CI](https://github.com/ilkerK01/anon-course-eval/actions/workflows/ci.yml/badge.svg)](https://github.com/ilkerK01/anon-course-eval/actions/workflows/ci.yml)

> Anonymous course evaluations: students prove they are enrolled and rate once, without anyone learning who said what.

Built for the Rise In × Midnight **New Moon to Full** program. Track: *Anonymous Feedback / Survey* combined with *Private Allowlist Access*.

## Live Demo

**https://candor-gules.vercel.app**

Demo course: https://candor-gules.vercel.app/?course=a9d23256a40f890ba1879934e37ff4b92289579e5543025cac93542a1fdada2e

Reading results needs nothing. To create a course or rate, you need Lace on Midnight Preprod and a local proof server on port 6300 (one `docker run`, see below), because Midnight's hosted proof server does not accept browser requests.

## Contract Address

| Network | Address |
| --- | --- |
| Preprod | `a9d23256a40f890ba1879934e37ff4b92289579e5543025cac93542a1fdada2e` |

Deploy transaction `6afb86bfe712fc460eae95a0ec0c95af16934a8d71eb11326bad44cd8320b2fc` (block 2661277), course `CENG-301 Fall 2026`.

## What This Does

Students rarely write honest course feedback when they suspect the instructor can tell who wrote it. Candor fixes that with zero-knowledge proofs.

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

## Tech Stack

- **Contract:** Compact (compiler 0.31.1, language 0.23), `HistoricMerkleTree<10, Bytes<32>>`, `Set<Bytes<32>>` for nullifiers, counters for the tally
- **SDK:** Midnight.js 4.1.1, compact-js 2.5.1, compact-runtime 0.16.0, ledger v8
- **Wallet:** Lace (Midnight Preprod) through the DApp Connector API 4.x
- **Frontend:** React 19, Vite 7, TypeScript
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

Proofs are generated by the proof server in `VITE_PROOF_SERVER_URL` (default `http://localhost:6300`). Midnight's hosted Preprod proof server rejects browser requests (CORS), so a local proof server is required. If the variable is empty, the app uses the wallet's own proving provider.

## Run Tests

```bash
npm test
```

`contract/test/course-eval.test.ts` runs the compiled circuits with the Compact runtime, no mocks. 12 tests cover:

- circuit logic: tally, average inputs and histogram across several students
- state transitions: enrollment → open → closed, and what each phase allows
- access control: only the instructor key can enroll, open or close
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

## Project Layout

```
contract/   Compact contract, witnesses, compiled output (managed/), tests
api/        Deploy / join / call helpers shared by the web app
ui/         React + Vite web app with Lace wallet integration
```
