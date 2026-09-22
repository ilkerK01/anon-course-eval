# Product Proposal

## What is the product, and who uses it?

Candor is an anonymous, verifiable course evaluation system. Students rate the courses they took, and nobody can link a rating to the student who gave it.

- **Students** get an enrollment code from their own browser, hand it to the instructor, and later submit one anonymous rating per course.
- **Instructors and departments** create an evaluation for each course, load the roster as anonymous codes, open and close the rating window, and read results they can trust.
- **The public, student unions and accreditation bodies** can audit the tally: every rating comes from someone on the roster, and nobody rated twice.

The first users are students and instructors in university departments. The same flow works for any closed group that needs honest feedback: employee surveys, conference session ratings, club elections.

## Why Midnight specifically?

Evaluation platforms today ask students to trust the operator: the server knows who submitted each form, and students know it, so they soften or skip their feedback. A transparent blockchain makes it worse, because every rating is tied to a public address forever.

Midnight lets the contract check the two facts that matter, *this rater is enrolled* and *this rater has not rated before*, inside a zero-knowledge proof. The chain stores only the tally and a one-time nullifier. The roster is public so anyone can audit it, but membership is proven without revealing which member is speaking. Selective disclosure (`disclose()` on the rating and nullifier only) is exactly the tool this needs. On a transparent chain we would have to choose between integrity (known voters) and honesty (anonymous voters). Midnight gives both.

## Data Model

| Data Point | Type | Disclosed To |
|------------------|----------------|--------------|
| Course code | Public ledger | Everyone |
| Phase (enrollment, open, closed) | Public ledger | Everyone |
| Instructor key `hash("instructor", sk)` | Public ledger | Everyone, secret stays hidden |
| Roster of enrollment codes `hash("student", sk)` | Public ledger (Merkle tree) | Everyone, as opaque hashes |
| Nullifier `hash("nullifier", course, sk)` | Public ledger (set) | Everyone, unlinkable to the enrollment code |
| Rating value (1 to 5) | Public ledger (tally and histogram) | Everyone, but not who gave it |
| Number of ratings and rating sum | Public ledger | Everyone |
| Student secret key | Private witness | No one |
| Instructor secret key | Private witness | No one |
| Merkle path of the rater's code | Private witness | No one |
| Which roster entry a rating came from | Never stored | No one |

## Mainnet Feasibility

Realistic. The contract is small (5 circuits, the largest is `submitRating` with a depth-10 Merkle proof) and already runs end to end on Preprod. The fee model fits: each student pays one transaction's DUST, and instructors pay for roster updates.

Known limit today: the roster is only as honest as the holder of the instructor key, since the contract cannot tell a real student's code from one the instructor generated. The roster being public keeps this auditable, and item 2 below removes the conflict of interest.

Remaining work before Mainnet:

1. **Hosted proving.** Replace the local proof server requirement with wallet-side proving or a hosted proof server, so students need nothing but Lace.
2. **Roster onboarding.** Bulk enrollment (many codes per transaction) and a registrar role so departments, not individual instructors, own the roster.
3. **Multi-question forms and optional comments.** Several rated dimensions per course and short text feedback.
4. **Key backup.** A simple recovery flow for the student secret.
5. **Pilot.** Run it for a set of real courses at one department, gather feedback, then move to Mainnet with a small group of instructors.
