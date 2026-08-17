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
  await setDoc(doc(db, 'admins', 'the_admin'), { note: 'owner' });
  await setDoc(doc(db, 'users', 'anon_student'), { displayName: 'Ana', email: 'ana@x.test',
    country: 'Brazil', birthDate: '2007-04-11', role: 'student', schoolId: SCHOOL, createdAt: 1 });
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
const admin     = env.authenticatedContext('the_admin').firestore();
const applicant = env.authenticatedContext('applicant').firestore();
const outsider  = env.authenticatedContext('outsider').firestore();

//===================================================================
// NOBODY MAKES THEMSELVES A TEACHER BY TYPING A SCHOOL NAME
//===================================================================
// The signup form asks for the school. That string is evidence, never
// authority — if typing it granted access, anyone could sign up as a teacher
// at any school and read its class, its results and its private notes.
await check('an applicant can file their own request', () =>
  assertSucceeds(setDoc(doc(applicant, 'teacherRequests', 'applicant'),
    { name: 'B. New', email: 'b@x.test', schoolNameTyped: 'Alpha', requestedAt: 2 })));
await check('but filing it grants nothing — they are still not a teacher', () =>
  assertFails(setDoc(doc(applicant, 'schools', SCHOOL, 'classroom', 'current'), { items: [] })));
await check('and they cannot write their own teacher record', () =>
  assertFails(setDoc(doc(applicant, 'teachers', 'applicant'), { name: 'B', schoolId: SCHOOL })));
await check('a request cannot name a school it does not have to justify', () =>
  assertFails(setDoc(doc(outsider, 'teacherRequests', 'outsider'),
    { name: 'B', email: 'b@x.test', schoolNameTyped: 'Alpha', schoolId: SCHOOL, requestedAt: 2 })));
await check('nor arrive with no school named at all', () =>
  assertFails(setDoc(doc(outsider, 'teacherRequests', 'outsider'),
    { name: 'B', email: 'b@x.test', schoolNameTyped: '', requestedAt: 2 })));
await check('nobody files a request in somebody else\'s name', () =>
  assertFails(setDoc(doc(outsider, 'teacherRequests', 'applicant'),
    { name: 'X', email: 'x@x.test', schoolNameTyped: 'Alpha', requestedAt: 2 })));
await check('an anonymous visitor cannot flood the queue', () =>
  assertFails(setDoc(doc(student, 'teacherRequests', 'anon_student'),
    { name: 'X', email: 'x@x.test', schoolNameTyped: 'Alpha', requestedAt: 2 })));
await check('a request cannot be edited after it is filed', () =>
  assertFails(updateDoc(doc(applicant, 'teacherRequests', 'applicant'), { schoolNameTyped: 'Beta' })));
await check('one applicant cannot read another\'s request', () =>
  assertFails(getDoc(doc(outsider, 'teacherRequests', 'applicant'))));
await check('a teacher cannot read the queue either', () =>
  assertFails(getDoc(doc(alpha, 'teacherRequests', 'applicant'))));

//===================================================================
// THE ADMINISTRATOR, AND THE FACT THAT ONE CANNOT BE INVENTED
//===================================================================
await check('the administrator reads the queue', () =>
  assertSucceeds(getDoc(doc(admin, 'teacherRequests', 'applicant'))));
await check('and is the one who can create a teacher', () =>
  assertSucceeds(setDoc(doc(admin, 'teachers', 'applicant'), { name: 'B. New', schoolId: SCHOOL, schoolName: 'Alpha' })));
await check('and can clear the request once it is handled', () =>
  assertSucceeds(deleteDoc(doc(admin, 'teacherRequests', 'applicant'))));
await check('NOBODY CAN MAKE THEMSELVES AN ADMINISTRATOR', () =>
  assertFails(setDoc(doc(outsider, 'admins', 'outsider'), { note: 'me' })));
await check('not even a teacher', () =>
  assertFails(setDoc(doc(alpha, 'admins', 'teacher_alpha'), { note: 'me' })));
await check('not even the administrator can mint another', () =>
  assertFails(setDoc(doc(admin, 'admins', 'outsider'), { note: 'friend' })));
await check('the list of administrators is not enumerable by anyone', () =>
  assertFails(getDoc(doc(outsider, 'admins', 'the_admin'))));
await check('a teacher cannot promote themselves to another school', () =>
  assertFails(setDoc(doc(alpha, 'teachers', 'teacher_alpha'), { name: 'M', schoolId: OTHER })));

//===================================================================
// PERSONAL DATA STAYS WITH THE PERSON
//===================================================================
// Email, country and date of birth live in users/{uid} and nowhere else.
// A teacher does not need any student's date of birth in order to teach them.
await check('a student reads their own profile', () =>
  assertSucceeds(getDoc(doc(student, 'users', 'anon_student'))));
await check('a classmate cannot read it', () =>
  assertFails(getDoc(doc(student2, 'users', 'anon_student'))));
await check('THEIR OWN TEACHER CANNOT READ IT EITHER', () =>
  assertFails(getDoc(doc(alpha, 'users', 'anon_student'))));
await check('nor can the administrator', () =>
  assertFails(getDoc(doc(admin, 'users', 'anon_student'))));
await check('a profile with an invented field is refused', () =>
  assertFails(setDoc(doc(student, 'users', 'anon_student'),
    { displayName: 'Ana', country: 'Brazil', birthDate: '2007-04-11', role: 'student', isAdmin: true })));
await check('a profile claiming a role that is not a role is refused', () =>
  assertFails(setDoc(doc(student, 'users', 'anon_student'),
    { displayName: 'Ana', country: 'Brazil', birthDate: '2007-04-11', role: 'admin' })));
await check('a profile with no country is refused', () =>
  assertFails(setDoc(doc(student, 'users', 'anon_student'),
    { displayName: 'Ana', country: '', birthDate: '2007-04-11', role: 'student' })));
await check('a malformed birth date is refused', () =>
  assertFails(setDoc(doc(student, 'users', 'anon_student'),
    { displayName: 'Ana', country: 'Brazil', birthDate: '11/04/07', role: 'student' })));
await check('and nobody writes a profile under another person\'s id', () =>
  assertFails(setDoc(doc(outsider, 'users', 'anon_student'),
    { displayName: 'Ana', country: 'Brazil', birthDate: '2007-04-11', role: 'student' })));

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
