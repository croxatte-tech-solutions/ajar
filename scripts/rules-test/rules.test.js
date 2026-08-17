// firestore.rules, executed.
//
// Until now these rules were verified by reading them. Reading is how the
// file and the console drifted apart once already, and it is the one place
// in this project where being wrong exposes a real student's record rather
// than showing a wrong answer. So this runs them against the actual rules
// engine, as the actual clients: an anonymous student, a signed-in teacher
// of this school, a signed-in teacher of a DIFFERENT school, and a stranger.
//
//   cd scripts/rules-test && npm test        (needs Java; downloads the emulator once)
//
// It lives in its own folder with its own package.json because the app has
// no build step and no node_modules, and that stays true.
import { readFileSync } from 'fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, addDoc, collection, deleteDoc, updateDoc } from 'firebase/firestore';

const SCHOOL = 'school-alpha-9f2c';
const OTHER  = 'school-beta-4a71';
const results = [];
const ok = (n) => results.push(n + ': PASS');
const bad = (n, e) => results.push(n + ': FAIL\n      ' + (e && e.message || e));
async function check(name, fn){ try { await fn(); ok(name); } catch(e){ bad(name, e); } }

const env = await initializeTestEnvironment({
  projectId: 'ajar-rules-test',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
});

// The teacher roster is created by hand in the console, so it is seeded here
// the same way — bypassing the rules, which is exactly what the console does.
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'teachers', 'teacher_alpha'), { name: 'M.', schoolId: SCHOOL, schoolName: 'Alpha' });
  await setDoc(doc(db, 'teachers', 'teacher_beta'),  { name: 'B.', schoolId: OTHER,  schoolName: 'Beta' });
  await setDoc(doc(db, 'schools', SCHOOL, 'classroom', 'current'), { items: [] });
  await setDoc(doc(db, 'schools', SCHOOL, 'classroom', 'roster'), { students: ['Ana', 'Bo'] });
  await setDoc(doc(db, 'schools', SCHOOL, 'classroom', 'note_ana'), { text: 'Ana still confuses -ed endings.' });
  await setDoc(doc(db, 'schools', SCHOOL, 'students', 'ana'), { displayName: 'Ana', summary: { done: 4 } });
});

// firebase.sign_in_provider is what the rules read, and it defaults to
// 'custom' here — a student simulated without it is not the client the app
// actually produces, and the test would be checking the wrong visitor.
const ANON = { firebase: { sign_in_provider: 'anonymous' } };
const student  = env.authenticatedContext('anon_student', ANON).firestore();
const student2 = env.authenticatedContext('anon_other',   ANON).firestore();
const alpha    = env.authenticatedContext('teacher_alpha').firestore();
const beta     = env.authenticatedContext('teacher_beta').firestore();
const nobody   = env.unauthenticatedContext().firestore();

//===================================================================
// THE ONE GUARANTEE THE PRODUCT RESTS ON
//===================================================================
await check('a student cannot publish an exercise to the class', () =>
  assertFails(setDoc(doc(student, 'schools', SCHOOL, 'classroom', 'current'), { items: [{ id: 'x' }] })));
await check('a student cannot publish a single exercise either', () =>
  assertFails(setDoc(doc(student, 'schools', SCHOOL, 'classroom', 'item_x'), { items: [] })));
await check('a student cannot rewrite the class list', () =>
  assertFails(setDoc(doc(student, 'schools', SCHOOL, 'classroom', 'roster'), { students: ['Ana'] })));
await check('a student cannot write the teacher\'s note about them', () =>
  assertFails(setDoc(doc(student, 'schools', SCHOOL, 'classroom', 'note_ana'), { text: 'A+' })));
await check('the school\'s own teacher can publish', () =>
  assertSucceeds(setDoc(doc(alpha, 'schools', SCHOOL, 'classroom', 'item_ok'), { items: [] })));

//===================================================================
// MULTI-TENANCY — the comparison the database makes, not the app
//===================================================================
await check('a teacher of another school cannot publish here', () =>
  assertFails(setDoc(doc(beta, 'schools', SCHOOL, 'classroom', 'current'), { items: [] })));
await check('nor write a single exercise here', () =>
  assertFails(setDoc(doc(beta, 'schools', SCHOOL, 'classroom', 'item_y'), { items: [] })));
await check('nor overwrite this school\'s student records', () =>
  assertFails(setDoc(doc(beta, 'schools', SCHOOL, 'students', 'ana'), { displayName: 'Ana' })));
await check('nor read them', () =>
  assertFails(getDoc(doc(beta, 'schools', SCHOOL, 'students', 'ana'))));
await check('nor read a student\'s attempt history', () =>
  assertFails(getDoc(doc(beta, 'schools', SCHOOL, 'students', 'ana', 'attempts', 'a1'))));
await check('while this school\'s own teacher still can', () =>
  assertSucceeds(getDoc(doc(alpha, 'schools', SCHOOL, 'students', 'ana'))));

//===================================================================
// TEACHER RECORDS ARE NOT PUBLIC — the requirement, stated as a test
//===================================================================
await check('a student cannot read the teacher\'s record', () =>
  assertFails(getDoc(doc(student, 'teachers', 'teacher_alpha'))));
await check('one teacher cannot read another\'s record', () =>
  assertFails(getDoc(doc(beta, 'teachers', 'teacher_alpha'))));
await check('a teacher can read her own', () =>
  assertSucceeds(getDoc(doc(alpha, 'teachers', 'teacher_alpha'))));
await check('a teacher can fix her own name and her school\'s name', () =>
  assertSucceeds(updateDoc(doc(alpha, 'teachers', 'teacher_alpha'), { name: 'Ms. M.', schoolName: 'Alpha School' })));
await check('but cannot move herself into another school', () =>
  assertFails(updateDoc(doc(alpha, 'teachers', 'teacher_alpha'), { schoolId: OTHER })));
await check('nor invent a new field on her record', () =>
  assertFails(updateDoc(doc(alpha, 'teachers', 'teacher_alpha'), { admin: true })));
await check('nobody can make themselves a teacher', () =>
  assertFails(setDoc(doc(student, 'teachers', 'anon_student'), { schoolId: SCHOOL })));
await check('and a teacher cannot delete herself out of the roster', () =>
  assertFails(deleteDoc(doc(alpha, 'teachers', 'teacher_alpha'))));

//===================================================================
// HISTORY IS A RECORD OF WHAT HAPPENED
//===================================================================
await check('a student may log their own attempt', () =>
  assertSucceeds(addDoc(collection(student, 'schools', SCHOOL, 'students', 'ana', 'attempts'),
    { type: 'passage', theme: 'campus', outcome: 0.8, ts: Date.now() })));
await check('an attempt with an invented field is refused', () =>
  assertFails(addDoc(collection(student, 'schools', SCHOOL, 'students', 'ana', 'attempts'),
    { type: 'passage', theme: 'campus', outcome: 0.8, ts: Date.now(), grade: 'A' })));
await check('an outcome outside 0..1 is refused', () =>
  assertFails(addDoc(collection(student, 'schools', SCHOOL, 'students', 'ana', 'attempts'),
    { type: 'passage', theme: 'campus', outcome: 7, ts: Date.now() })));
await check('a student record with an invented field is refused', () =>
  assertFails(setDoc(doc(student, 'schools', SCHOOL, 'students', 'zed'),
    { displayName: 'Zed', band: 30 })));
await check('a student record with an empty name is refused', () =>
  assertFails(setDoc(doc(student, 'schools', SCHOOL, 'students', 'zed'), { displayName: '' })));
await check('nothing can delete a student', () =>
  assertFails(deleteDoc(doc(student, 'schools', SCHOOL, 'students', 'ana'))));
await check('not even the teacher', () =>
  assertFails(deleteDoc(doc(alpha, 'schools', SCHOOL, 'students', 'ana'))));

//===================================================================
// SIGNED OUT IS OUT
//===================================================================
await check('a stranger who is not signed in reads nothing', () =>
  assertFails(getDoc(doc(nobody, 'schools', SCHOOL, 'classroom', 'current'))));
await check('and writes nothing', () =>
  assertFails(setDoc(doc(nobody, 'schools', SCHOOL, 'classroom', 'current'), { items: [] })));
await check('a collection nobody wrote a rule for is closed by default', () =>
  assertFails(getDoc(doc(student, 'invoices', 'inv1'))));
await check('including at the old pre-multi-tenancy paths', () =>
  assertFails(getDoc(doc(student, 'classroom', 'current'))));

//===================================================================
// AND THE PART THESE RULES DO NOT CLOSE, ASSERTED SO IT IS ON PURPOSE
//===================================================================
// A student holding the school id can read a classmate's private note and a
// classmate's summary. Anonymous auth is why: there is no identity to compare
// a name against, so no rule can express "only Ana". These pass as WRITTEN,
// not as WANTED — the day student accounts exist, they must flip to assertFails.
await check('KNOWN GAP: a classmate can read another student\'s teacher note', () =>
  assertSucceeds(getDoc(doc(student2, 'schools', SCHOOL, 'classroom', 'note_ana'))));
await check('KNOWN GAP: a classmate can read another student\'s summary', () =>
  assertSucceeds(getDoc(doc(student2, 'schools', SCHOOL, 'students', 'ana'))));
await check('but a teacher of another school still cannot', () =>
  assertFails(getDoc(doc(beta, 'teachers', 'teacher_alpha'))));

await env.cleanup();
console.log(results.join('\n'));
const fails = results.filter(r => r.indexOf('FAIL') > -1);
console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                         : ('ALL ' + results.length + ' CHECKS PASS'));
if(fails.length) process.exitCode = 1;
