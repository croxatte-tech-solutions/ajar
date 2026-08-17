# Ajar — build log

A record of what was built and when, kept so the project's own history can
be read without digging through a chat transcript. Numbers here are
measured, not estimated: commit counts come from `git log`, test counts
from running the suite, content counts from the banks themselves.

Reproduce any of them:

```bash
git log --since="24 hours ago" --oneline | wc -l
for f in scripts/check_*.js; do node "$f" index.html audio; done
node scripts/ip_audit.js
```

---

## Session 1 — 16 Aug 2026, 12:18 → 17 Aug 2026, 02:07

**13.8 hours · 50 commits · 3.6 commits/hour · 332 files, +8,838 / −588**

By type: 25 `feat`, 14 `fix`, 4 `docs`, 4 `chore`, 1 each `test`, `refactor`, `build`.

### Where the app stood at the end

| | |
|---|---|
| App | 11,008 lines, single file, no build step |
| Tests | 19 files, **2,473 checks**, all green |
| Content | 464 distinct exercises across 14 themes |
| Audio | 672 clips, content-addressed |
| Copyright audit | 3,970 strings vs 16 ETS documents, zero 7-word overlaps |
| Live | https://hiajar.com (Cloudflare Pages + Firebase) |

### What was built

**The mock exam** — all four sections, sat under test conditions with one
clock each and no going back. 120 items, 90 minutes together.

- Reading: 50 questions / 30 min
- Listening: 47 / 29, **audio plays once** where practice gives two
- Writing: 12 / 23, band covers the ten sentences only
- Speaking: 11 / 8. Built with what exists rather than waiting for the
  speech engine. Repeat Accuracy is marked — the target sentence is known,
  so a transcript can be aligned against it — and the interview is not,
  because length and word variety are pacing hints, not a mark.

A sat section cannot reach the practice log: `logUsage` returns early, so
a rehearsal physically cannot land in the day's best score.

**Content rotation** — a shuffle bag per (type, theme) so a student works
through a bank before meeting anything twice. Measured over 40 trials of
six Reading sittings each: memoryless picking gave a median 27% repeats
(range 18–33%); the bag gives 16% (10–25%).

**Instructions on every exercise** — an "On the real test" note on all 12
task types, saying what test day does and where we differ on purpose.

**Writing has to be the student's own** — a long paste into the email,
discussion post or typed interview answer is refused, across three routes
(keyboard, drag-and-drop, and a length-jump backstop). Stated as a
deterrent, not a lock.

**Privacy and access**

- The teacher panel opens only after sign-in. Publishing was never at risk
  — the rules always required a teacher account — but *reading* was: every
  visitor is signed in anonymously so students need no account, and the
  read rule accepted that. Anyone opening the address saw the class list.
- A teacher's own record is now readable only by her.
- She can correct her own name (that field only; `schoolId` stays out of
  reach so no account can move itself into another school).
- The repository and its 60 commits of history were rewritten to remove a
  real teacher's name, student names, and the school's identity.

**The teacher panel, rebuilt** — 664 words on screen at once became 107
signed out, 86 on a working tab. Real tabs instead of a scroll position,
explanations collapsed, twelve task buttons grouped into four labelled
rows by exam section.

**Trial run** — a tab where she sits a section herself, plus the brief to
hand a native speaker who has never met the exam. With review mode on, the
results screen asks for notes and the ordinary exit is replaced; an empty
submission is refused.

**The front door** — typing the address always lands on the welcome screen
in the visitor's own language. It previously sent returning visitors to
whatever view was initialised by default, which was the teacher panel.

### Bugs found by the user, not by the tests

Worth recording separately, because each marks a blind spot:

1. **A section had no way forward.** Every type ends on a "Done" screen
   whose only control offered to re-draw the same exercise. All checks
   drove `advanceExam()` directly, so 76 of them passed against a screen
   with no button wired to it.
2. **Listening reused the previous exercise's state.** Every exam item was
   built with the same id, so the guard that resets per-exercise progress
   never fired. New questions appeared attached to audio already heard.
3. **Build a Sentence stuck after Check.** Six types re-render into a Done
   panel and pick up the finished footer; two write a line in place and
   left the footer offering to skip work already done.
4. **The teacher panel opened with no sign-in.** Found in an anonymous tab.
5. **Typing the address landed on the teacher panel.**
6. **A Listening section promised two listens and gave one.** Found in the
   iOS simulator: `maxListens()` was right, and the sentence describing it
   was three separate hardcoded strings. The student reads the sentence.

### QR codes

Verified end to end rather than by inspection: `scripts/qr_render.js`
renders PNGs with the app's own library, `scripts/qrdecode.swift` decodes
them with Apple's Vision framework — the detector behind the iPhone
camera — and `scripts/qr_verify.py` compares. All 12 task types decode to
exactly their own link.

```bash
python3 scripts/qr_verify.py --count 12
```

Building it found the worst bug of the session: without Firebase loaded,
the share link packs the whole exercise into the URL (3276 characters
against a QR maximum near 2331) and the generator threw rather than
degrading. School wifi blocking a CDN would have broken every QR code
mid-lesson.

### Mistakes worth not repeating

- **Three bad tests.** Two flaky, one failing about three runs in four. All
  came from turning a single observation into an absolute — including
  reporting a 30%→11% improvement that was one lucky run against one
  unlucky one. The honest figure was 27%→16%.
- **Template-literal escaping, four times.** `\b`, `\s`, backticks in
  comments, and `/\\s+/` in a word count that reported every essay as one
  word.
- **`[^;]*` in a regex, three times**, matching across a line with several
  statements and failing text that was plainly present.
- **A wrong diagnosis I repeated for hours.** "code length overflow
  (26868>18672)" in the preview browser: I called it a JS engine
  bytecode ceiling, said the preview could not run this app, and
  discounted my own visual checks all session on that basis. It was the QR
  library failing because the preview does not load Firebase. Bit counts,
  not bytecode. The evidence was on screen the whole time and I explained
  it away instead of following it.
- **A comment describing a layout nobody wrote** — claimed the teacher nav
  became a left rail above 1220px. No such media query existed.
- **The guide, in both directions.** Left stale describing an app two
  features behind, then rewritten to 544 and 572 words — three minutes of
  reading in a box that opens on arrival. Halved.

### Open at the end of the session

- Speech engine: pace and pauses from local audio analysis. Pronunciation
  is out of reach without an acoustic model, and is never to be claimed.
- Recording the graded session on the teacher's device
- Backup, a separate test environment, monitoring
- Whitepaper (deliberately last)
- **Tested on real iOS** (iPhone 17 Pro and both iPads, Safari): front
  door, language detection, section clock, briefs, footers and the sign-in
  gate all correct. The iPhone run found the listens bug in twenty minutes.
  Measured at 1366px: the teacher nav stays a horizontal strip, no sideways
  overflow.
- **The teacher panel signed IN is still unverified by eye** — it needs her
  password, which is not mine to type.
---

## Session 2 — 17 Aug 2026, 02:31 → 07:39 · 29 commits

Measured from the commit timestamps, not estimated. Session 1 ended at 02:07 the
same night; this picked up shortly after and ran until he left for school.

### What he asked for, in order

1. **His school out of the code.** `cse-den-8f3a91` in CONFIG, then `CSE` in four
   comments, then the `cse_` prefix on all 22 storage keys. The first two were text.
   The third was a data migration — see below.
2. **The byline off the app.** Masthead, tab title, meta description, manifest.
   Only the developer's address in the feedback panel remains.
3. **A classroom screen** showing nothing but the QR code — HIS idea, better than
   the panel-wide switch I had proposed, and the reasons are in the commit for
   `b7fc699`.
4. **The welcome copy**: less melancholy, student to student, and legally careful
   about ETS. Ended as three phases of 18 seconds each, and a door explained in
   two sentences instead of four.
5. **A full autonomous sweep** while he travelled.

### The three findings that mattered

- **The Speaking section had no way off its first screen.** Listen and Repeat never
  appended its footer. Same dead end reported in session 1, fixed then in the path
  that was reported, still alive in the one section nobody had sat. It survived
  2897 green checks and was found by USING the app. Fixed in the wrapper so a
  thirteenth renderer cannot bring it back.
- **The primary button measured 2.01:1 in dark mode** — white on light mint, below
  AA at any size, on Start, Approve and Generate. The contrast checker written
  right after found three more of the same class, all "selected" states: the
  role switch, the chosen task type, the current panel tab.
- **Assigning to one student published without approval.** The whole-class path
  always required approving each item; naming a student marked them approved at
  creation, so it sent an exercise she had never read.

### The migration, because renaming a key is not free

All 22 keys went `cse_` to `ajar_`. On a device already in use, the app would have
looked for `ajar_student_name`, found nothing, and asked a student who had been
practising for weeks to introduce themselves again — losing the name their whole
history is filed under. So old keys are copied forward once and removed.
Enumerated rather than listed, because two are prefixes with an id or role
appended and no hand-written list can know every suffix on every device.

### Numbers at the end

- **2911 checks across 27 files**, green. Session 1 ended at 2524 in 19 files.
- Six new check files: contrast (reads the palette out of the app), hygiene,
  conformance (the four untouchable rules), school clock, names, migration,
  no-dead-ends.
- `sh scripts/qa.sh` runs everything; a pre-commit hook refuses a red commit.
- QR: 12 types, 12 distinct codes, all decoded by Apple Vision.
- Copyright audit: 3970 strings, no 7-word overlap with ETS material.

### Mistakes worth not repeating

- **A backslash inside a template literal, seven times.** The worst was
  `split(/\s+/)` becoming `split(/s+/)` — it split the welcome text on the letter
  "s", counted 31 pieces instead of 61 words, and made FOUR reading-rate
  assertions pass while the real numbers said they should fail. The two files
  written after that (`check_names.js`, `check_migration.js`) have no template
  literal at all, deliberately.
- **Four of my own new checker rules were false positives on their first run**,
  and three of them fired on the comment documenting the very mistake they hunt.
  A checker that cries wolf teaches its reader to skim it.
- **An aria-label read `v` where the variable was `a`**, which takes the whole
  panel down, and it shipped past 2811 green checks because nothing ever called
  `renderIndividualList`. Green is not the same as exercised.
- **Two probes reported "12 of 12 broken" when nothing was**, both because they
  read the app through my assumptions rather than its code.
- **Arithmetic written by hand, three times wrong** in the QA report alone.

### Open at the end

- **`firestore.rules` needs republishing in the console.** The `schoolName` field
  does not save without it. This is the only open item that can affect a class.
- The report's item 20 (the answer field sitting 1440px down on a phone) is a
  product decision, not a bug.
- The "read more about the project" link still carries the org name in its href.
  Removing it removes a feature rather than a credit, so it was left.
- The teacher panel signed IN is still unverified by eye — it needs her password.

