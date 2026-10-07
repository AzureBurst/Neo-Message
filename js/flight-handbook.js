// =====================================================================
//  FLIGHT PORTAL — Justice University Student Handbook
//
//  The handbook text lives here as data. To change it, edit the
//  chapters below: a "policy" is a bold term followed by its text, "p"
//  is a plain paragraph, "list" is a bullet list and "h" a sub-heading.
//  Text ending in "…" is an excerpt — the full policy runs on.
// =====================================================================

export const HANDBOOK_TITLE = 'Justice University Student Handbook';

export const HANDBOOK = [
  {
    id: 'housing', title: 'Housing Policies', label: 'Section 5-A',
    blocks: [
      { type: 'policy', term: 'General Conduct', text: 'Students at Justice University should respect the privacy of their fellow residents. The use of powers inside the dormitory is prohibited, and any damage to the dormitory should be reported as soon as possible. Students should only access other rooms with the use of doors, and climbing, jumping, flying and any other way to access the dormitory is strictly prohibited. Unauthorized entry will trigger the security measures installed in the building.' },
      { type: 'policy', term: 'Alcohol', text: 'Alcoholic beverages are prohibited in residence halls. This regulation pertains to any person, regardless of age, student status, or position within or outside of the university setting. To avoid…' },
      { type: 'policy', term: 'Alterations to Rooms', text: 'Residents shall not install or attach any of the following in their rooms: a) large furniture, air-conditioning or heating units, b) locks, c) decals or transfer pictures, d) outside antenna, e) objects outside of the confines of your dorm room f) additional electrical wiring…' },
      { type: 'policy', term: 'Animals', text: 'For health reasons, animals are not permitted in the halls or on the premises. The only exceptions to this policy are: (1) fish in aquariums of 10 gallons or less; (2) service animals; and (3) emotional support animals that have been approved by the Office of Student Disability Services as a reasonable accommodation for a student’s disability.' },
      { type: 'policy', term: 'Commercial Activity', text: 'A resident shall not use any facility or areas of the residence halls, including the room, suite, or apartment assigned to the resident for any commercial purpose or activity. No one is permitted to place materials on, a or under resident room, suite, or apartment doors unless for official University/University Housing business or communication between known acquaintances. At no time and under no circumstances will door to door solicitation be permitted…' },
      { type: 'policy', term: 'Drugs and Drug Paraphernalia', text: 'Using, manufacturing, possessing, distributing, selling, dispensing, or being under the influence of drugs, if prohibited by federal, state, or local law…' },
      { type: 'policy', term: 'Electrical', text: 'Tampering with existing wiring such as removing or replacing a light fixture or electrical outlet is prohibited. Students may not wire any appliance or equipment directly into the university wiring. When additional electrical outlets are needed, students…' },
      { type: 'policy', term: 'Fire Safety and Open Flame', text: 'Candles, incense, hot plates, and any device with an exposed heating element or open flame are prohibited in residence halls. Students whose powers produce heat, flame, sparks, or electrical discharge must register with University Housing and the Heroics Office at move-in so that their room can be assigned appropriate fire protection. Registration does not authorize the use of a power inside the dormitory. Tampering with, covering, or disabling a smoke detector, sprinkler head, or fire door is a serious violation and may result in immediate removal from housing…' },
      { type: 'policy', term: 'Guests and Visitation', text: 'Residents living in university housing may host guests in their own rooms between 8:00 a.m. and midnight. All guests must be signed in at the front desk, carry a visitor pass, and be escorted at all times. Residents are responsible for the conduct of their guests. Guests, including agency representatives, and members of the press, may not use powers or take photographs inside the residence halls. Overnight guests must be approved by University Housing and the host’s roommate in advance…' },
      { type: 'policy', term: 'Hazardous and Iso Materials', text: 'Iso-derived devices, unlicensed power-enhancing equipment, and any material that is flammable, corrosive, radioactive, or otherwise hazardous may not be stored, used, or brought into residence halls. Students who come into possession of an unidentified crystal, fluid, or gas should leave it where it is, move away, and contact University Safety immediately. Do not touch it, even if it appears to be harmless…' },
      { type: 'policy', term: 'Quiet Hours', text: 'Quiet hours are from 10:00 p.m. to 8:00 a.m. Sunday through Thursday, and from midnight to 9:00 a.m. on Friday and Saturday. Courtesy hours are in effect at all other times. Sound produced by powers counts toward noise regulations, including sonic, resonant, or musical effects, and anything a roommate or neighbor can reasonably hear or feel through a wall…' },
      { type: 'policy', term: 'Room Entry and Inspections', text: 'University Housing staff may enter a room with 24 hours’ notice for maintenance, health and safety inspections, or pest control. Staff may enter without notice in an emergency, when there is reason to believe a policy has been violated, or when the room’s security system has been triggered…' },
      { type: 'policy', term: 'Roommates and Resident Assistants', text: 'Roommates are expected to agree on shared-space expectations in the first two weeks of the semester. Resident Assistants (RAs) are upper-level students trained to support residents, mediate disputes, enforce housing policy, and respond to emergencies on their floor or wing. RAs are not law enforcement and not licensed heroes, but they are required to report any unauthorized power use, safety concerns, or policy violations to University Housing…' },
      { type: 'policy', term: 'Security Measures', text: 'Residence halls are equipped with automated entry systems, motion and pressure sensors. Residents must carry their student ID at all times. Do not prop, tamper with, or attempt to bypass an entry point. If you are locked out, contact the front desk. Do not climb, phase, teleport, or otherwise bypass the door…' },
      { type: 'policy', term: 'Weapons and Dangerous Items', text: 'Firearms, explosives, bladed weapons, tasers, and any other item designed to harm are not permitted in residence halls or anywhere on campus without written authorization. Combat gear, hero costumes with integrated equipment, and training weapons must be stored in the Heroics Department, not in dorm rooms…' }
    ]
  },
  {
    id: 'hero', title: 'Hero Program Violations',
    blocks: [
      { type: 'p', text: 'Possible violations include but are not limited to the following:' },
      { type: 'list', items: [
        'The disruptive use of a power on campus on any circumstance that is not considered to be extenuating.',
        'Initiation of a violent confrontation with another student, visitor, faculty member or otherwise.',
        'Entering and using training facilities without the permission and supervision of the faculty.',
        'Do not share training material with anyone outside of the heroics course. Online guidelines for non-protected information can be found on page…',
        'Acting as, or presenting oneself to the public as, a licensed hero while not holding a valid license. Provisional students may respond to emergencies only under the direction of faculty, and may not patrol, pursue, or detain anyone on their own.',
        'Using a power off campus in a manner that causes injury, property damage, or a disturbance, except in a genuine emergency where it was necessary to prevent immediate harm.',
        'Entering, or attempting to enter, a restricted area, or a site closed by emergency services without written authorization from the Heroics Department.',
        'Failing to report an injury, power malfunction or loss of control during training or on duty within 24 hours.',
        'Giving false information about your power, its limits, or its effects, or failing to update the University’s Health Services upon encountering a new discovery.',
        'Failing to report the use of medication, a device, or a substance that suppresses, enhances, or alters a power. Students must disclose this to University Health Services.',
        'Accepting a sponsorship, endorsement, or paid media appearance without prior written approval, or representing the University in any media without authorization. The University’s name and logo may not be used for any commercial purpose.',
        'Sparring, dueling, or any contest of powers outside of a supervised training session, including “friendly” matches, dares, and challenges recorded for social media.'
      ] }
    ]
  },
  {
    id: 'honor', title: 'Honor Code Violations',
    blocks: [
      { type: 'p', text: 'Justice University students strive to pursue intellectual knowledge with curiosity and humility. They engage in a partnership of learning and discovery, where the scholarly exploration of ideas is not only protected, but encouraged.' },
      { type: 'p', text: 'Accordingly, acts that inhibit learning or that violate the Honor Code and thereby break the trust of the academic community are prohibited. Violations of the Honor Code are cause for disciplinary actions imposed by the appropriate Honor Council.' },
      { type: 'h', text: 'General Violations' },
      { type: 'p', text: 'Possible violations include but are not limited to the following:' },
      { type: 'p', text: '**Giving and/or receiving unauthorized aid** or attempting to give and/or receive unauthorized aid on an assignment, report, paper, exercise, problem, test or examination, presentation, film, or computer program submitted by a student to meet course requirements. Such aid includes, but is not limited to, the following:' },
      { type: 'list', items: [
        'use or production of unauthorized aids, which may include cheat sheets, answer keys, or computer programs;',
        'use of texts, papers, computer programs, or other class work prepared by commercial or noncommercial agents and submitted as a student’s own work;',
        'copying from another student’s work;',
        'unauthorized collaboration;',
        'unauthorized posting, sharing, taking, or distribution of past or present examinations or other course materials;',
        'unauthorized advance access to examinations or other assignments;',
        'compromising a testing environment or violating specified testing conditions;',
        'unauthorized use of books, notes, websites, phones, watches, calculators, or other outside materials or devices during an examination;',
        'soliciting, giving, and/or receiving unauthorized aid orally or in writing; or',
        'any other similar action that is contrary to the principles of academic honesty.'
      ] },
      { type: 'p', text: '**Plagiarism** on an assigned paper, theme, report, or other material submitted to meet course requirements. Plagiarism is defined as incorporating into one’s own work the work or ideas of another without properly indicating that source. A full discussion of plagiarism and proper citation is provided in the section below…' },
      { type: 'h', text: 'Power-Assisted Violations' },
      { type: 'p', text: 'Powers do not exempt a student from the Honor Code, and a power that makes a violation easier does not make it less of one. Possible violations include but are not limited to the following:' },
      { type: 'list', items: [
        'Using a power to obtain information during an assessment that you are not permitted to have, including reading minds, seeing the future, perceiving through walls, or sensing the answers of nearby students.',
        'Using a power to alter, copy, erase, or interfere with another student’s work, the testing environment, or university records.',
        'Sending a duplicate, a double, a projection, or any other person or form to attend class, take an exam, or complete an assignment in your place. Allowing someone else to do the same on your behalf is also a violation.',
        'Using a power to hide your identity, your location, or your presence when you are required to be seen or accounted for.',
        'Manipulating a person’s memory, perception, or emotions to affect a grade, a decision, or a disciplinary proceeding.'
      ] },
      { type: 'h', text: 'Fabrication and Falsification' },
      { type: 'list', items: [
        'Falsifying training logs, attendance records, injury reports, field assessments, or performance evaluations in the Heroics program.',
        'Fabricating data, sources, results, or a rescue or incident report.',
        'Misrepresenting your power, rank, licensing status, or achievements on an application, resume, or public profile.'
      ] },
      { type: 'h', text: 'Honor Council Process' },
      { type: 'p', text: 'A report may be made by any member of the community. A Council will review the report, notify the student in writing, and hold a hearing. Students have the right to be informed of the allegation, to respond, to bring an advisor, and to appeal. Sanctions for a finding of responsibility range from a warning and grade penalty to suspension or expulsion. Violations in the Heroics program may also be reported to the appropriate licensing authority…' }
    ]
  },
  {
    id: 'conduct', title: 'Student Conduct',
    blocks: [
      { type: 'policy', term: 'Standards of Conduct', text: 'Justice University expects students to behave with integrity and with respect for the safety, dignity, and rights of others, both on and off campus.' },
      { type: 'policy', term: 'Sanctions', text: 'Depending on the nature and severity of the violation, sanctions may include, but are not limited to: a warning; a written reprimand; a fine or restitution; mandatory training or counseling; loss of privileges (including access to training facilities); conduct probation; removal from University housing; suspension; expulsion; and a report to the appropriate licensing authority.' },
      { type: 'policy', term: 'Amnesty', text: 'A student who seeks emergency medical help for themselves or another person, or reports a dangerous power incident in good faith, will not be disciplined for the related low-level policy violations, such as alcohol or curfew, that are discovered as a result.' }
    ]
  },
  {
    id: 'harassment', title: 'Anti-Harassment and Anti-Discrimination',
    blocks: [
      { type: 'p', text: 'Justice University prohibits harassment and discrimination on the basis of race, color, national origin, sex, gender identity or expression, sexual orientation, religion, age, disability, power, or perceived power. The University recognizes the history of fear and prejudice that people have faced, and will not tolerate harmful terms, exclusion, intimidation, or unequal treatment targeting any member of our community.' },
      { type: 'p', text: 'Prohibited conduct includes, but is not limited to: harmful terminology, “jokes,” and nicknames based on a person’s power or appearance; unauthorized disclosure of a student’s medical status, or registration information; threats, stalking, or use of a power to intimidate; and retaliation against anyone who reports a concern…' }
    ]
  },
  {
    id: 'academic', title: 'Academic Policies',
    blocks: [
      { type: 'policy', term: 'Attendance', text: 'Regular attendance is required in all courses unless otherwise specified. Students who miss more than the number of sessions allowed by the instructor may be withdrawn from the course or receive a failing grade. Absences caused by an emergency response, injury, or power-related medical issue should be reported to the instructor and to the Dean’s Office as soon as possible…' },
      { type: 'policy', term: 'Heroics Coursework', text: 'Students in the Heroics program are evaluated in three areas: classroom coursework, practical training, and field synergy co-ops. Passing grades in all three are required to advance. Practical training and field synergy co-ops are supervised and may be recorded for assessment and safety purposes…' },
      { type: 'policy', term: 'Academic Standing', text: 'Students whose GPA falls below the minimum for their program will be placed on academic probation. Heroics students on probation may be restricted from field synergy co-ops and training facilities until they return to good standing…' },
      { type: 'policy', term: 'Class Groups', text: 'Students are placed in class groups at the start of each academic year. Group assignment is determined by program, year, and the results of the placement evaluation, and may be adjusted by the Heroics Department. Group coordinators, resident assistants, and advisors are assigned to each group.' }
    ]
  },
  {
    id: 'health', title: 'Health and Wellness',
    blocks: [
      { type: 'policy', term: 'University Health Services', text: 'The University maintains a medical clinic staffed by licensed physicians and nurses with training in power-related medicine. Students are encouraged to register on arrival, and to report any injury, illness, or change in their power that affects their health.' },
      { type: 'policy', term: 'Medical Information', text: 'Medical records are confidential and will be shared only with the student’s written consent, in an emergency, or as required by law. Students should be aware that some Heroics program requirements, such as power assessments, may involve information being shared with program faculty.' },
      { type: 'policy', term: 'Counseling and Support', text: 'Counseling services are available to all students at no cost, including individual support, group sessions, and crisis care. Students who are struggling with stress, grief, burnout, or the aftermath of a traumatic incident are encouraged to seek help early…' }
    ]
  },
  {
    id: 'emergency', title: 'Emergency Procedures',
    blocks: [
      { type: 'policy', term: 'Shelter-in-Place', text: 'Each building has a designated shelter area with supplies and shielding. Learn the location of your shelter area, your evacuation route, and your building’s emergency contact in the first week of the semester. Drills are mandatory.' },
      { type: 'policy', term: 'Emergency Response by Students', text: 'Students may not enter a hazardous area to assist in an emergency without the instruction of University Safety or faculty. If you are in immediate danger, protect yourself and others and call for help. Emergency response by students should be reported to the Heroics Office as soon as possible…' }
    ]
  },
  {
    id: 'tech', title: 'Campus Technology',
    blocks: [
      { type: 'policy', term: 'Network and Device Use', text: 'Students are responsible for any activity on their accounts and devices. Do not share your login, attempt to access systems or data you are not authorized to use, or use university networks for illegal activity or harassment. Because Iso interference can disrupt electronics, students are advised to back up important work frequently, and to keep paper copies of critical documents.' },
      { type: 'policy', term: 'Recording and Surveillance', text: 'Recording of any person in a private space, including residence halls, bathrooms, and locker rooms, is prohibited. Campus security systems may record in public areas, training facilities, and building entrances for safety and conduct purposes…' }
    ]
  },
  {
    id: 'orgs', title: 'Student Organizations and Media',
    blocks: [
      { type: 'policy', term: 'Student Organizations', text: 'Registered student organizations must have a faculty or staff advisor, an approved constitution, and a designated student leader. Organizations may not use powers in the course of an event in a way that has not been approved in advance.' },
      { type: 'policy', term: 'Media and Social Media', text: 'Students are responsible for what they post. Do not post footage of other students’ powers, training sessions, or restricted facilities without their consent and the approval of the Heroics Department. Students should be aware that public attention may result in contact from agencies, sponsors, and the press, and that all offers should be referred to the Heroics Office before any response is given…' }
    ]
  }
];

/* ------------------------------------------------------------------ */
/*  rendering + search (pure, so it can be tested on its own)         */
/* ------------------------------------------------------------------ */

const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Escapes, applies **bold**, then highlights the search term. */
function fmt(text, q) {
  let h = escHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  if (q) {
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    // only outside tags
    h = h.replace(/(<[^>]+>)|([^<]+)/g, (m, tag, txt) => tag || txt.replace(re, '<mark>$1</mark>'));
  }
  return h;
}

const blockText = b => b.type === 'list' ? b.items.join(' ') : `${b.term || ''} ${b.text || ''}`;
export const chapterText = c => `${c.title} ${c.label || ''} ${c.blocks.map(blockText).join(' ')}`.replace(/\*\*/g, '');

/** How many matches a chapter has for a search (0 = hide it). */
export function chapterHits(c, q) {
  if (!q) return 1;
  const t = chapterText(c).toLowerCase(), n = q.toLowerCase();
  let i = 0, count = 0;
  while ((i = t.indexOf(n, i)) !== -1) { count++; i += n.length; }
  return count;
}

/** A chapter as HTML. While searching, every match is highlighted. */
export function renderChapter(c, q = '') {
  return `
    <section class="hb-chapter" id="hb-${c.id}">
      ${c.label ? `<div class="hb-label">${fmt(c.label, q)}</div>` : ''}
      <h2>${fmt(c.title, q)}</h2>
      ${c.blocks.map(b => {
        if (b.type === 'h') return `<h3>${fmt(b.text, q)}</h3>`;
        if (b.type === 'list') return `<ul>${b.items.map(i => `<li>${fmt(i, q)}</li>`).join('')}</ul>`;
        if (b.type === 'policy') return `<p class="hb-policy"><strong>${fmt(b.term, q)}.</strong> ${fmt(b.text, q)}</p>`;
        return `<p>${fmt(b.text, q)}</p>`;
      }).join('')}
    </section>`;
}
