# Real Life English

**TOEFL 2026 practice, built around real student life — not textbook drills.**

🔗 **Live app:** https://croxatte-tech-solutions.github.io/real-life-english/

Built by **Croxatte Tech Solutions** for the TOEFL Preparation class at [a language school](https://example.com) (Denver, CO), and free for anyone to use.

## What this is

A free, browser-based companion app covering all 6 real TOEFL 2026 task types — Write an Email, Write for an Academic Discussion, Build a Sentence, Complete the Words, Listen and Repeat, Take an Interview — generated around 9 real-life themes (campus life, work & career, health, technology, daily logistics, and more) instead of abstract grammar drills. No app install, no account, no cost.

Timing, word counts, and scoring dimensions are matched to ETS's official 2026 specs wherever ETS publishes them; anywhere this app uses a practice-only estimate instead of an official number, that's called out explicitly in the UI rather than presented as authoritative.

## "Padrão C" — the one non-negotiable rule

The teacher always has the final word. **Nothing generated here reaches a student, and nothing a student does here counts, until the teacher reviews and approves it.** This tool suggests; it never decides. The app also never touches SEVIS/I-20 or any immigration data, and it never produces a clinical diagnosis or label for a student — friction in learning is treated as something to scaffold through, not something to flag a student *as*.

## Features

- All 6 task types, 9 real-life themes, unlimited fresh practice ("practice again" regenerates without repeating content)
- Teacher batch-approval workflow, individual per-student assignment (own task type + theme, independent of the class), whole-class QR-code sharing
- Classroom-aware audio: one shared playback through the room speakers instead of 13 phones firing out of sync, with a "who's speaking this round" control to avoid mic crosstalk
- Self-practice mode for studying solo, including a shuffle-bag "surprise practice" that cycles through every task type × theme combination before repeating any
- Per-student progress history, synced across devices (phone today, tablet tomorrow) via Firebase — with strengths/weak-spot tips and a practice streak, not just a raw log
- Weekly (Thursday) opt-in feedback prompt for app suggestions, auto-detects the student's device language and invites writing in it
- Teacher-to-class announcements riding the same share link, no separate channel needed

## Status

Early pilot. No official grades or scores are ever recorded here — this is a practice tool, not a system of record.

## Tech

Static HTML/CSS/JS, no build step, no framework — one `index.html`. Data sync is Firebase (Firestore + anonymous auth), configured for a free-tier pilot at classroom scale. Deployed via GitHub Pages.

## License

[GNU AGPL v3](LICENSE) — open-core: use it, fork it, self-host it. If you run a modified version as a network service, the AGPL requires you to make your source available to its users too.
