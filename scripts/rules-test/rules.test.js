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
  // The owner is a student here too — an account, a profile naming this
  // school, and no teacher record anywhere.
  await setDoc(doc(db, 'users', 'the_admin'), { displayName: 'Rony', email: 'r@x.test',
    country: 'Brazil', birthDate: '1990-01-01', role: 'student', schoolId: SCHOOL, createdAt: 1 });
  await setDoc(doc(db, 'users', 'signed_in_student'), { displayName: 'Ana', email: 'a@x.test',
    country: 'Brazil', birthDate: '2005-01-01', role: 'student', schoolId: SCHOOL, createdAt: 1 });
  await setDoc(doc(db, 'users', 'other_school_student'), { displayName: 'Zed', email: 'z@x.test',
    country: 'Chile', birthDate: '2005-01-01', role: 'student', schoolId: OTHER, createdAt: 1 });
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
const signedInStudent    = env.authenticatedContext('signed_in_student').firestore();
const otherSchoolStudent = env.authenticatedContext('other_school_student').firestore();
const applicant = env.authenticatedContext('applicant').firestore();
const outsider  = env.authenticatedContext('outsider').firestore();
// The person this app is built by AND used by: an account holder who is a
// student here, and the administrator, and not a teacher of anything.
const owner     = env.authenticatedContext('the_admin').firestore();

//===================================================================
// AN ACCOUNT IS WHAT PUTS YOU IN A CLASS
//===================================================================
// Anonymous stays, and is now exactly what it says: practise alone, nothing
// about you written anywhere. It buys no place in a class.
await check('an anonymous visitor cannot read the class batch', () =>
  assertFails(getDoc(doc(student, 'schools', SCHOOL, 'classroom', 'current'))));
await check('nor a single shared exercise', () =>
  assertFails(getDoc(doc(student, 'schools', SCHOOL, 'classroom', 'item_ok'))));
await check('nor the class list of names', () =>
  assertFails(getDoc(doc(student, 'schools', SCHOOL, 'classroom', 'roster'))));
await check('AND THE PRIVATE NOTE THEY COULD READ BEFORE IS NOW SHUT TO THEM', () =>
  assertFails(getDoc(doc(student, 'schools', SCHOOL, 'classroom', 'note_ana'))));
await check('nor does anything about them get written to a school', () =>
  assertFails(setDoc(doc(student2, 'schools', SCHOOL, 'students', 'someone'),
    { displayName: 'Someone' })));
// The hole the emulator found on this very change: isMemberOf() asks only
// whether a profile names this school, so an anonymous session able to write
// itself a profile could issue its own membership card.
await check('AN ANONYMOUS SESSION CANNOT WRITE ITSELF A PROFILE', () =>
  assertFails(setDoc(doc(student2, 'users', 'anon_other'),
    { displayName: 'X', email: 'x@x.test', country: 'Brazil',
      birthDate: '2000-01-01', role: 'student', schoolId: SCHOOL, createdAt: 1 })));
await check('and therefore cannot make itself a member of a class', () =>
  assertFails(setDoc(doc(student2, 'schools', SCHOOL, 'students', 'x'), { displayName: 'X' })));
await check('nor read its own profile, having none it may write', () =>
  assertFails(getDoc(doc(student2, 'users', 'anon_other'))));
await check('an account holder who has not joined yet can still read the class', () =>
  assertSucceeds(getDoc(doc(outsider, 'schools', SCHOOL, 'classroom', 'current'))));
await check('but writes nothing there until their profile names the school', () =>
  assertFails(setDoc(doc(outsider, 'schools', SCHOOL, 'students', 'zed'), { displayName: 'Zed' })));

//===================================================================
// A STUDENT WITH AN ACCOUNT CAN STILL RECORD THEIR OWN PRACTICE
//===================================================================
// The case that did not exist when these rules were tightened. Students were
// all anonymous, so "anonymous, or this school's teacher" covered everyone.
// A student signed in with Google is neither, and their practice would have
// been refused on every exercise they finished.
await check('a signed-in student of this school records an attempt', () =>
  assertSucceeds(setDoc(doc(signedInStudent, 'schools', SCHOOL, 'students', 'ana'),
    { displayName: 'Ana', summary: { done: 1 } })));
await check('and their attempt history', () =>
  assertSucceeds(addDoc(collection(signedInStudent, 'schools', SCHOOL, 'students', 'ana', 'attempts'),
    { type: 'passage', theme: 'campus', outcome: 0.9, ts: Date.now() })));
await check('and can read the class list, which is how they pick their name', () =>
  assertSucceeds(getDoc(doc(signedInStudent, 'schools', SCHOOL, 'classroom', 'roster'))));
await check('a signed-in student of ANOTHER school cannot write here', () =>
  assertFails(setDoc(doc(otherSchoolStudent, 'schools', SCHOOL, 'students', 'ana'),
    { displayName: 'Ana' })));
await check('nor read this school\'s student records', () =>
  assertFails(getDoc(doc(otherSchoolStudent, 'schools', SCHOOL, 'students', 'ana'))));
await check('an account with no profile at all writes nothing', () =>
  assertFails(setDoc(doc(outsider, 'schools', SCHOOL, 'students', 'ana'), { displayName: 'Ana' })));
await check('being the administrator does not by itself grant a school', () =>
  assertFails(setDoc(doc(admin, 'schools', OTHER, 'students', 'x'), { displayName: 'X' })));
await check('but the owner practising as a student of this school can', () =>
  assertSucceeds(setDoc(doc(owner, 'schools', SCHOOL, 'students', 'rony'),
    { displayName: 'Rony', summary: { done: 2 } })));
await check('and is still not a teacher of it', () =>
  assertFails(setDoc(doc(owner, 'schools', SCHOOL, 'classroom', 'current'), { items: [] })));

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
// Every actor here holds a real account: an anonymous session cannot have a
// profile at all any more, which is a state the old fixtures pretended to.
await check('a student reads their own profile', () =>
  assertSucceeds(getDoc(doc(signedInStudent, 'users', 'signed_in_student'))));
await check('a classmate cannot read it', () =>
  assertFails(getDoc(doc(otherSchoolStudent, 'users', 'signed_in_student'))));
await check('THEIR OWN TEACHER CANNOT READ IT EITHER', () =>
  assertFails(getDoc(doc(alpha, 'users', 'signed_in_student'))));
// Changed deliberately on 18 August 2026, by the owner's decision, with the
// privacy policy reworded in the same commit. The administrator runs the
// service and answers for it, so he may READ.
await check('the administrator may read it, because he answers for the service', () =>
  assertSucceeds(getDoc(doc(admin, 'users', 'signed_in_student'))));
// And that is where it stops. Reading is what running a service needs;
// rewriting somebody's profile is not, and a profile an administrator can
// edit is one its owner cannot rely on.
await check('AND STILL CANNOT WRITE IT', () =>
  assertFails(setDoc(doc(admin, 'users', 'signed_in_student'),
    { displayName: 'Ana', country: 'Brazil', birthDate: '2005-01-01', role: 'student' })));
await check('nor delete it', () =>
  assertFails(deleteDoc(doc(admin, 'users', 'signed_in_student'))));
await check('a profile with an invented field is refused', () =>
  assertFails(setDoc(doc(signedInStudent, 'users', 'signed_in_student'),
    { displayName: 'Ana', country: 'Brazil', birthDate: '2005-01-01', role: 'student', isAdmin: true })));
await check('a profile claiming a role that is not a role is refused', () =>
  assertFails(setDoc(doc(signedInStudent, 'users', 'signed_in_student'),
    { displayName: 'Ana', country: 'Brazil', birthDate: '2005-01-01', role: 'admin' })));
await check('a profile with no country is refused', () =>
  assertFails(setDoc(doc(signedInStudent, 'users', 'signed_in_student'),
    { displayName: 'Ana', country: '', birthDate: '2005-01-01', role: 'student' })));
await check('a malformed birth date is refused', () =>
  assertFails(setDoc(doc(signedInStudent, 'users', 'signed_in_student'),
    { displayName: 'Ana', country: 'Brazil', birthDate: '01/01/05', role: 'student' })));
await check('and nobody writes a profile under another person\'s id', () =>
  assertFails(setDoc(doc(outsider, 'users', 'signed_in_student'),
    { displayName: 'Ana', country: 'Brazil', birthDate: '2005-01-01', role: 'student' })));

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
// THE BIRTHDAY THE CLASS CAN SEE, AND THE AGE IT CANNOT
//===================================================================
// A class that wishes someone a happy birthday needs the day and the month.
// The year is the part that reveals age, and age is the one fact about these
// users the law actually cares about. So the class-visible field is MM-DD and
// the rules refuse anything that carries a year — which is the difference
// between a nice feature and publishing every student's age.
await check('a student may share the day and month of their birthday', () =>
  assertSucceeds(setDoc(doc(student, 'schools', SCHOOL, 'students', 'ana'),
    { displayName: 'Ana', birthday: '04-11' })));
await check('A FULL DATE IN THE CLASS-VISIBLE FIELD IS REFUSED', () =>
  assertFails(setDoc(doc(student, 'schools', SCHOOL, 'students', 'ana'),
    { displayName: 'Ana', birthday: '2007-04-11' })));
await check('and so is a year smuggled in beside it', () =>
  assertFails(setDoc(doc(student, 'schools', SCHOOL, 'students', 'ana'),
    { displayName: 'Ana', birthday: '04-11', birthYear: 2007 })));
await check('and so is anything that is not a date at all', () =>
  assertFails(setDoc(doc(student, 'schools', SCHOOL, 'students', 'ana'),
    { displayName: 'Ana', birthday: 'April 11th' })));
await check('sharing it stays optional — a record without one is fine', () =>
  assertSucceeds(setDoc(doc(student, 'schools', SCHOOL, 'students', 'ana'),
    { displayName: 'Ana' })));
await check('the full date is still readable only by the person it belongs to', () =>
  assertFails(getDoc(doc(student2, 'users', 'anon_student'))));

//===================================================================
// THE LIVE ROUND: EVERYONE ANSWERS, NOBODY WATCHES ANYONE ELSE
//===================================================================
// Thirteen phones playing one clip in one room is unusable, so the audio goes
// to the screen at the front and the phones carry only the four options. The
// count on the wall is the class against the material — never a ranking of
// thirteen people who know each other by name.
const ANS = { index: 2, choice: 1, correct: true, at: 1755400000000 };
await check('a student in the class answers the open question', () =>
  assertSucceeds(setDoc(doc(signedInStudent, 'schools', SCHOOL, 'live', 'signed_in_student'), ANS)));
await check('and can read their own answer back', () =>
  assertSucceeds(getDoc(doc(signedInStudent, 'schools', SCHOOL, 'live', 'signed_in_student'))));
await check('A CLASSMATE CANNOT SEE WHAT THEY ANSWERED', () =>
  assertFails(getDoc(doc(otherSchoolStudent, 'schools', SCHOOL, 'live', 'signed_in_student'))));
await check('the teacher can, because the count is hers to show', () =>
  assertSucceeds(getDoc(doc(alpha, 'schools', SCHOOL, 'live', 'signed_in_student'))));
await check('nobody answers in somebody else\'s name', () =>
  assertFails(setDoc(doc(outsider, 'schools', SCHOOL, 'live', 'signed_in_student'), ANS)));
await check('an anonymous visitor does not join the round at all', () =>
  assertFails(setDoc(doc(student2, 'schools', SCHOOL, 'live', 'anon_other'), ANS)));
await check('a student of another school cannot answer here', () =>
  assertFails(setDoc(doc(otherSchoolStudent, 'schools', SCHOOL, 'live', 'other_school_student'), ANS)));
// The index travels with the answer so a late tap on question 2 cannot be
// counted against question 3 after she has moved on.
await check('an answer must say which question it was for', () =>
  assertFails(setDoc(doc(signedInStudent, 'schools', SCHOOL, 'live', 'signed_in_student'),
    { choice: 1, correct: true, at: 1 })));
await check('and cannot smuggle a field nobody asked for', () =>
  assertFails(setDoc(doc(signedInStudent, 'schools', SCHOOL, 'live', 'signed_in_student'),
    { ...ANS, points: 500 })));
await check('a choice outside the options is refused', () =>
  assertFails(setDoc(doc(signedInStudent, 'schools', SCHOOL, 'live', 'signed_in_student'),
    { ...ANS, choice: 99 })));
await check('clearing the round between questions is the teacher\'s', () =>
  assertSucceeds(deleteDoc(doc(alpha, 'schools', SCHOOL, 'live', 'signed_in_student'))));
await check('and not a student\'s', () =>
  assertFails(deleteDoc(doc(signedInStudent, 'schools', SCHOOL, 'live', 'nobody'))));

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
// Erasure of your own data is a right, not a favour, and the privacy notice
// promises it. What stays shut is deleting somebody ELSE's record — which is
// what the old blanket rule was really protecting.
await check('a student can erase their own record, because the notice promises it', () =>
  assertSucceeds(deleteDoc(doc(signedInStudent, 'schools', SCHOOL, 'students', 'signed_in_student'))));
await check('and their own attempts, or the profile goes and the data stays', () =>
  assertSucceeds(deleteDoc(doc(signedInStudent, 'schools', SCHOOL, 'students', 'signed_in_student', 'attempts', 'a1'))));
await check('A CLASSMATE CANNOT DELETE THEIRS', () =>
  assertFails(deleteDoc(doc(otherSchoolStudent, 'schools', SCHOOL, 'students', 'ana'))));
await check('and neither can their teacher', () =>
  assertFails(deleteDoc(doc(alpha, 'schools', SCHOOL, 'students', 'ana'))));
await check('nor an anonymous visitor', () =>
  assertFails(deleteDoc(doc(student2, 'schools', SCHOOL, 'students', 'ana'))));
await check('editing an attempt is still impossible, for anyone', () =>
  assertFails(updateDoc(doc(signedInStudent, 'schools', SCHOOL, 'students', 'signed_in_student', 'attempts', 'a1'),
    { outcome: 1 })));

//===================================================================
// THE SCHOOL DOCUMENT ANSWERS NOBODY
//===================================================================
// It was readable by anyone signed in — which is everyone, since students are
// signed in anonymously — and that made it an enumeration oracle for the one
// secret this model rests on: guess a schoolId, read the answer off exists(),
// then spend a throwaway account on the ones that came back true.
await check('an anonymous visitor cannot confirm a school exists', () =>
  assertFails(getDoc(doc(student, 'schools', SCHOOL))));
await check('nor can an account holder who is not in it', () =>
  assertFails(getDoc(doc(outsider, 'schools', SCHOOL))));
await check('nor a student who IS in it, since nothing reads this document', () =>
  assertFails(getDoc(doc(signedInStudent, 'schools', SCHOOL))));
await check('nor its own teacher', () =>
  assertFails(getDoc(doc(alpha, 'schools', SCHOOL))));
await check('and a guessed id gives away nothing either', () =>
  assertFails(getDoc(doc(student, 'schools', 'school-guessed-0001'))));

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
// THE TEACHER'S PRIVATE NOTE, WHERE ONLY TWO PEOPLE CAN REACH IT
//===================================================================
// The first of the two known gaps, closed. It used to live under classroom/,
// keyed by a typed name, on a path that must stay readable without an account
// for a QR to work — and the class list publishes every classmate's name.
await env.withSecurityRulesDisabled(async c => {
  await setDoc(doc(c.firestore(), 'schools', SCHOOL, 'students', 'signed_in_student', 'private', 'note'),
    { text: 'Still confuses -ed endings.' });
});
await check('a student reads the note their teacher wrote about them', () =>
  assertSucceeds(getDoc(doc(signedInStudent, 'schools', SCHOOL, 'students', 'signed_in_student', 'private', 'note'))));
await check('their teacher writes it', () =>
  assertSucceeds(setDoc(doc(alpha, 'schools', SCHOOL, 'students', 'signed_in_student', 'private', 'note'),
    { text: 'Much better this week.' })));
await check('A CLASSMATE CANNOT READ IT ANY MORE', () =>
  assertFails(getDoc(doc(otherSchoolStudent, 'schools', SCHOOL, 'students', 'signed_in_student', 'private', 'note'))));
await check('nor can an anonymous visitor holding the school id', () =>
  assertFails(getDoc(doc(student2, 'schools', SCHOOL, 'students', 'signed_in_student', 'private', 'note'))));
await check('nor a teacher of another school', () =>
  assertFails(getDoc(doc(beta, 'schools', SCHOOL, 'students', 'signed_in_student', 'private', 'note'))));
await check('nor the administrator, who is not in this class', () =>
  assertFails(getDoc(doc(admin, 'schools', SCHOOL, 'students', 'signed_in_student', 'private', 'note'))));
await check('and a student cannot write a note about somebody else', () =>
  assertFails(setDoc(doc(signedInStudent, 'schools', SCHOOL, 'students', 'other_school_student', 'private', 'note'),
    { text: 'anything' })));

//===================================================================
// AND THE PART THESE RULES DO NOT CLOSE, ASSERTED SO IT IS ON PURPOSE
//===================================================================
// A student holding the school id can read a classmate's private note and a
// classmate's summary. Anonymous auth is why: there is no identity to compare
// a name against, so no rule can express "only Ana". These pass as WRITTEN,
// not as WANTED — the day student accounts exist, they must flip to assertFails.
// Narrowed, not closed. Anonymous can no longer reach either of these, so
// the gap is now only between CLASSMATES — people who are in the class and
// have every reason to be reading it. It closes for good when the student
// record is keyed by uid instead of by the name they typed.
await check('KNOWN GAP: a classmate can read another student\'s teacher note', () =>
  assertSucceeds(getDoc(doc(signedInStudent, 'schools', SCHOOL, 'classroom', 'note_ana'))));
await check('KNOWN GAP: a classmate can read another student\'s summary', () =>
  assertSucceeds(getDoc(doc(signedInStudent, 'schools', SCHOOL, 'students', 'ana'))));
await check('but a teacher of another school still cannot', () =>
  assertFails(getDoc(doc(beta, 'teachers', 'teacher_alpha'))));

await env.cleanup();
console.log(results.join('\n'));
const fails = results.filter(r => r.indexOf('FAIL') > -1);
console.log(fails.length ? ('FAILURES: ' + fails.length + ' / ' + results.length)
                         : ('ALL ' + results.length + ' CHECKS PASS'));
if(fails.length) process.exitCode = 1;
