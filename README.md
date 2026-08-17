# Ajar

**TOEFL 2026 practice, built around real student life — not textbook drills.**

🔗 **Live app:** https://croxatte-tech-solutions.github.io/ajar/

Built by **Croxatte Tech Solutions** for the TOEFL Preparation class at [a language school](https://example.com) (Denver, CO), and free for anyone to use.

## The name

*Ajar* — a door neither shut nor fully open. It is the moment these students actually live: the nerve it takes to open your mouth in a language you are still learning, and the invitation to step into a culture that is not yet yours. The mark is a mouth, slightly open, in the brand green.

The name was chosen after several candidates were dropped for real trademark collisions in the language-teaching market (Real Life English, Levo, Utter, Bocca, Bravo, among others). *Ajar* came through that check clean.

**Product name vs. address.** The product is called **Ajar** — in the app, in the logo, in any store listing, everywhere a person can see it. The domain and social handles use the **`tryajar`** prefix (e.g. `tryajar.com`) only because `ajar` alone was already taken. That prefix belongs to the address and must never leak into the product's name in code, UI text, or a store listing.

## What this is

A free, browser-based companion app covering the real TOEFL 2026 task types, generated around 14 real-life themes (campus & F1 student life, work & career, health, environment, money, housing, travel, media, and more) instead of abstract grammar drills. No app install, no account, no cost.

**Reading** — Complete the Words
**Listening** — Listen and Choose a Response · Listen to an Announcement · Listen to a Conversation · Listen to an Academic Talk
**Writing** — Build a Sentence · Write an Email · Write for an Academic Discussion
**Speaking** — Listen and Repeat · Take an Interview

Timing, word counts, and difficulty are matched to ETS's published 2026 specs, and where ETS publishes only a loose range, to measurements taken from the official practice tests — the academic talks, for instance, are written to the 163–230 words the real items actually run rather than the "100–250" the spec declares. Anywhere this app uses a practice-only estimate instead of an official number, that is called out in the UI rather than presented as authoritative.

Every generated string is checked against 16 official ETS documents before release (`scripts/ip_audit.js`): any 7-word sequence shared with ETS material fails the build. Nothing here reproduces ETS's wording.

## "Padrão C" — the one non-negotiable rule

The teacher always has the final word. **Nothing generated here reaches a student, and nothing a student does here counts, until the teacher reviews and approves it.** This is data modelling, not a button: a suggestion lives as a pending record and only an explicit approval makes it visible. This tool suggests; it never decides.

The app also never touches SEVIS/I-20 or any immigration data — its scope is strictly pedagogical — and it never produces a clinical diagnosis or label for a student. Friction in learning is treated as something to scaffold through, not something to flag a student *as*.

## Features

- 10 task types × 14 real-life themes, unlimited fresh practice ("practice again" regenerates without repeating content)
- Pre-rendered audio for every spoken line, so a student on an old phone hears the same voice as a student on a new one; two-speaker conversations are stitched from two voices at build time
- Teacher batch-approval workflow, individual per-student assignment (own task type + theme, independent of the class), whole-class QR-code sharing
- Classroom-aware audio: one shared playback through the room speakers instead of 13 phones firing out of sync, with a "who's speaking this round" control to avoid mic crosstalk
- Self-practice mode for studying solo, including a shuffle-bag "surprise practice" that cycles through every task type × theme combination before repeating any
- Per-student progress history, synced across devices via Firebase — with strengths/weak-spot tips and a practice streak, not just a raw log
- Weekly (Thursday) opt-in feedback prompt, auto-detects the student's device language and invites writing in it
- Teacher-to-class announcements riding the same share link

## Status

Early pilot. No official grades or scores are ever recorded here — this is a practice tool, not a system of record.

**Known gaps, deliberately open:**
- No CEFR/GSE level scale yet. Exercises are organised by theme and task type; the school's A1–C2 scale is not modelled. When it is added, it must be the CSE's existing scale, never an invented one.
- No L1 (native-language) support tiering yet. CSE policy is that beginners get L1 support which tapers to none at advanced levels.
- Students are identified by the name they type, not by an account. `firestore.rules` therefore cannot stop one student from logging attempts under another student's name, or from reading another student's history. Closing that needs per-student accounts, which costs more than it buys for a class of 13 sharing a room with their teacher. The serious case — forging or overwriting what the class receives — **is** closed.

## Tech

Static HTML/CSS/JS, no build step, no framework — one `index.html`. Data sync is Firebase (Firestore + anonymous auth), configured for a free-tier pilot at classroom scale. Deployed via GitHub Pages.

One identifier deliberately keeps the pre-rebrand string because it is infrastructure rather than brand: the Firebase project id (`real-life-english`). Renaming it means creating a new Firebase project, so it stays until there is a reason to migrate. Everything else — including the service-worker cache keys — now uses the `ajar` prefix.

`scripts/` holds the content pipeline and the regression suites — audio generation, the ETS copyright audit, difficulty calibration, and a per-task-type checker for every exercise type.

## License

[GNU AGPL v3](LICENSE) — open-core: use it, fork it, self-host it. If you run a modified version as a network service, the AGPL requires you to make your source available to its users too.
