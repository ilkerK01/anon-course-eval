# Candor: anonymous course evaluation on Midnight

Students rarely write honest course feedback when they suspect the instructor can tell who wrote it. Candor fixes that with zero-knowledge proofs: a student proves "I am enrolled in this course and have not rated it yet" without revealing which student they are. The instructor, the university and the public see only the final tally.

Built for the Rise In × Midnight **New Moon to Full** program.

## How it works

1. **Enrollment.** Each student's browser generates a secret key that never leaves the device. The student sends the instructor an *enrollment code*, which is `hash("student", secret)`. The instructor adds the codes to the course contract, where they become leaves of a Merkle tree.
2. **Rating.** When ratings open, the student submits a 1 to 5 rating. The ZK circuit proves the student knows a secret whose code is a leaf in the roster tree, without revealing which leaf. It also publishes a *nullifier*, `hash("nullifier", courseCode, secret)`, so the same student cannot rate twice.
3. **Results.** Anyone can read the average and the distribution straight from the chain.

The nullifier and the enrollment code come from the same secret through different hashes. The instructor knows every code but cannot link a code to a nullifier, so a rating cannot be traced back to a student.

## Public vs private state

| Data | Where it lives | Who can see it |
| --- | --- | --- |
| Course code, phase (enrollment / open / closed) | Public ledger | Everyone |
| Instructor key (`hash("instructor", secret)`) | Public ledger | Everyone, but it reveals nothing about the secret |
| Roster of enrollment codes (Merkle tree) | Public ledger | Everyone, as opaque hashes |
| Nullifiers of students who rated | Public ledger | Everyone, not linkable to enrollment codes |
| Number of ratings, sum, 1 to 5 star histogram | Public ledger | Everyone |
| Student and instructor secret keys | Browser storage, passed to circuits as witnesses | Only the owner |
| Which roster entry a rating came from | Nowhere. It exists only inside the proof | Nobody |

## Contract

`contract/course-eval.compact`

| Circuit | Who | What it does |
| --- | --- | --- |
| `constructor(code)` | Instructor | Stores the course code and the instructor key |
| `enroll(commitment)` | Instructor | Adds a student's enrollment code to the roster |
| `openEvaluation()` | Instructor | Closes enrollment and opens ratings |
| `closeEvaluation()` | Instructor | Stops accepting ratings, results become final |
| `submitRating(rating)` | Enrolled student | Proves roster membership, spends a nullifier, updates the tally |

Compiled output (circuits, prover and verifier keys, ZKIR, TypeScript bindings) is committed in `contract/managed/`.

## Project layout

```
contract/   Compact contract, witnesses, compiled output, tests
api/        Deploy / join / call helpers shared by the web app
ui/         React + Vite web app with Lace wallet integration
```

## Run it locally

Requirements: Node 22, Docker, the Compact toolchain (`compact update 0.31.1`) and the Lace wallet with Midnight set to **Preprod**.

```bash
docker run -d -p 6300:6300 midnightntwrk/proof-server:8.1.0 midnight-proof-server -v
npm install
npm run compile
npm test
cd ui && npm run dev
```

Open http://localhost:3000, connect Lace, and either create a course (Instructor tab) or open one from its address.

## Tests

`contract/test/course-eval.test.ts` runs the compiled contract circuits with the Compact runtime (no mocks). It covers instructor-only actions, the phase machine, roster membership, the double-rating block, the rating range and the tally.

```bash
npm test
```
