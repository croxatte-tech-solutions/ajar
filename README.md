# Ajar

**TOEFL 2026 practice, built around real student life — not textbook drills.**

🔗 **Live app:** https://hiajar.com

A student project by **@croxatte tech solutions**, built while preparing for the exam himself.

## The name

*Ajar* — a door neither shut nor fully open. It is the moment these students actually live: the nerve it takes to open your mouth in a language you are still learning, and the invitation to step into a culture that is not yet yours. The mark is a mouth, slightly open, in the brand green.

The name was chosen after several candidates were dropped for real trademark collisions in the language-teaching market (Real Life English, Levo, Utter, Bocca, Bravo, among others). *Ajar* came through that check clean.

**Product name vs. address.** The product is called **Ajar** — in the app, in the logo, in any store listing, everywhere a person can see it. The address is **hiajar.com**, because `ajar.com` has been taken since 2004 and `ajar.link` turned out to be a premium registration at thirteen times the price of a `.com`. That `hi` belongs to the address and must never leak into the product's name in code, UI text, or a store listing.

## What this is

A browser-based companion app covering the real TOEFL 2026 task types, generated around 14 real-life themes (campus & F1 student life, work & career, health, environment, money, housing, travel, media, and more) instead of abstract grammar drills. Nothing to install.

**Reading** — Complete the Words · Read in Daily Life · Read an Academic Passage
**Listening** — Listen and Choose a Response · Listen to an Announcement · Listen to a Conversation · Listen to an Academic Talk
**Writing** — Build a Sentence · Write an Email · Write for an Academic Discussion
**Speaking** — Listen and Repeat · Take an Interview

464 distinct exercises: every one of the twelve task types exists in every one of the fourteen themes.

Timing, word counts, and difficulty are matched to ETS's published 2026 specs, and where ETS publishes only a loose range, to measurements taken from the official practice tests — the academic talks, for instance, are written to the 163–230 words the real items actually run rather than the "100–250" the spec declares. Anywhere this app uses a practice-only estimate instead of an official number, that is called out in the UI rather than presented as authoritative.

Every generated string is checked against the official ETS corpus before release (`scripts/ip_audit.js`): any 7-word sequence shared with ETS material fails. That corpus is never committed, so the audit runs locally rather than in CI. Nothing here reproduces ETS's wording.

## "Padrão C" — the one non-negotiable rule

The teacher always has the final word. **Nothing generated here reaches a student, and nothing a student does here counts, until the teacher reviews and approves it.** This is data modelling, not a button: a suggestion lives as a pending record and only an explicit approval makes it visible. This tool suggests; it never decides.

The app also never touches SEVIS/I-20 or any immigration data — its scope is strictly pedagogical — and it never produces a clinical diagnosis or label for a student. Friction in learning is treated as something to scaffold through, not something to flag a student *as*.

## Accounts

**A class needs an account, and so does a teacher.** Sign in with Google, or with an email and a password. This changed in August 2026 and it changed for one reason: a class has to know who is in it. A teacher cannot see whose work she is looking at, and practice cannot follow a student from a phone to a laptop to the computer in the lab, for somebody the app cannot name.

- **A teacher is somebody with a teacher record**, not somebody with a login. Signing up as a teacher files a request and grants nothing — the school name typed into that form is evidence for a person to read, never authority the database honours. An administrator approves.
- **Two names.** The full name is yours, in your own language and alphabet, and never leaves your own profile. The name your class and your teacher see is the one you choose to be called by, and it is the only one that travels.
- **Age 13 and over.** The date of birth is used once, to check that, and is never shown to a classmate or a teacher.
- **Practising alone needs no account** and writes nothing to any school.

Email, country and date of birth are readable by their owner and by the person who runs the service — never by a classmate, never by a teacher. The privacy notice in the app says exactly this, and a check compares that notice against `firestore.rules` in both directions, because a promise a product does not keep is worse than one it never made.

## Features

- 12 task types × 14 real-life themes, unlimited fresh practice ("practice again" regenerates without repeating content)
- **Live round** — the audio plays once from the teacher's screen and the phones show only the answers, because thirteen phones playing the same clip in one room is noise. She opens and closes each question; the screen shows how many have answered, never who
- **Listening works like the exam** — the questions and options stay hidden until the audio ends, in solo practice as well as in class
- Pre-rendered audio for every spoken line, so a student on an old phone hears the same voice as a student on a new one; two-speaker conversations are stitched from two voices at build time
- Teacher batch-approval workflow, individual per-student assignment (own task type + theme, independent of the class), whole-class QR-code sharing
- **A class health line** at the top of the teacher's panel that reads only what the database has confirmed, never what her own screen believes
- **Private notes** on a student, which the student cannot see and the database enforces
- **Sentence of the day and six words of the day**, public-domain and rotating every 24 hours, from the Academic Word List
- **Full mock exam** — Reading 50 items in 30 minutes, Listening 47 in 29, Speaking 11 in 8, Writing 12 in 23
- Self-practice mode for studying solo, including a shuffle-bag "surprise practice" that cycles through every task type × theme combination before repeating any
- Per-student progress history, synced across devices — with strengths/weak-spot tips and a practice streak, not just a raw log
- Weekly (Thursday) opt-in feedback prompt, auto-detects the student's device language and invites writing in it
- Installable to a home screen, and it keeps working offline

## Status

Early pilot. No official grades or scores are ever recorded here — this is a practice tool, not a system of record.

Speaking and writing scores are text and timing proxies, not the ETS rubric, and the app says so in plain words on the screen. It marks what it can defend — right-or-wrong answers, and how closely a spoken sentence matched its target — and hands an email, a discussion post or an interview answer to a human.

## Multiple schools

Everything a school owns lives under `schools/{schoolId}/`. A teacher's own document names the one school they may write to, and `firestore.rules` checks that comparison in the database, so a teacher at one school cannot publish into another's classroom whatever the client sends.

A student's record is keyed by their account, and only they may write it. The school id travels in the share link and should still be treated as a secret, but it is no longer the only thing standing between a class and a stranger: reading anything a class owns requires an account that names that school.

**Known gaps, deliberately open:**
- No CEFR/GSE level scale yet. Exercises are organised by theme and task type; the school's A1–C2 scale is not modelled. When it is added, it must be the CSE's existing scale, never an invented one.
- No L1 (native-language) support tiering yet. CSE policy is that beginners get L1 support which tapers to none at advanced levels.
- Classmates see each other's chosen name and progress, which is what a class list is for. Nobody sees anybody else's email, country or date of birth.

**Closed in August 2026, and worth naming because it was open here for a while:** students used to be identified by a name they typed, which meant no rule could stop one of them logging attempts under another's name. Records are keyed by account now, and the emulator asserts that a classmate can neither overwrite another student's record nor add to a history that is not theirs.

## Tech

Static HTML/CSS/JS, no build step, no framework — one `index.html`. Data sync is Firebase: Auth for accounts and Firestore for everything a class shares. Hosted on Cloudflare Pages, which unlike GitHub Pages allows the cache policy in `_headers` — the audio is content-addressed and therefore genuinely immutable, while the page itself must never be stale.

**One exception to the single file.** `functions/api/` holds Cloudflare Pages Functions, and there is exactly one. It fetches the weather shown beside the date, and it exists for a privacy reason rather than a technical one: calling a weather service from the browser would hand every student's IP address to a company they have never heard of, so the call is made at the edge and a student's device talks only to `hiajar.com`.

One identifier deliberately keeps the pre-rebrand string because it is infrastructure rather than brand: the Firebase project id (`real-life-english`). Renaming it means creating a new Firebase project, so it stays until there is a reason to migrate. Everything else — including the service-worker cache keys — uses the `ajar` prefix.

## Tests

```bash
sh scripts/qa.sh
```

**3,880+ assertions across 47 files**, all green, run by a pre-commit hook and again by GitHub Actions. They run on a machine that has only `node` — no framework, no fixtures, no network.

```bash
AJAR_RULES=1 sh scripts/qa.sh
```

adds **150+ assertions against the real Firestore emulator** (needs Java). Run it before publishing rules. It has found live holes on its first run more than once.

When a check disagrees with the app, the question is which of the two is wrong. It has been both.

`scripts/` also holds the content pipeline: audio generation, the ETS copyright audit, difficulty calibration, and answer-key analysis that measures whether an exercise can be solved without understanding it.

## License

[GNU AGPL v3](LICENSE) — open-core: use it, fork it, self-host it. If you run a modified version as a network service, the AGPL requires you to make your source available to its users too.
