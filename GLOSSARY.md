# Glossary — product language

The words a teacher uses. This file records meaning only, and it owns the vocabulary that belongs to the product rather than to one code context. Context vocabulary lives beside its code; see [GLOSSARY-MAP.md](GLOSSARY-MAP.md).

Terms here were rebuilt from the desk study in [#94](https://github.com/abodacs/edu-canvas/issues/94) and from [the as-is stories](docs/domain/01-as-is-stories.md). The stories are reconstructed, not observed. Where the code has no record for a term, the entry says so.

## Teaching

### Lesson

A planned period of teaching and student work, with a beginning, an end, and one learning objective. A lesson is what the teacher prepares, approves, and teaches; it is not the same as its written draft, its stored version, or its rendering.

No single record holds a lesson. It exists as a draft, then a version, then a publication; see those entries.

### Learning

A change in what a student knows or can do. A lesson aims at learning; attendance, completion, or a score alone do not show it.

### Learning objective

The intended result of one lesson, written from a curriculum standard. A standard states what students should know by the end of a grade band; an objective states what this lesson will achieve today. The objective is narrower than the standard and is not a summary of the activities.

### Curriculum

What students study and how that content develops over time.

### Curriculum standard

A statement of what students are expected to know or do, published by a curriculum authority. A standard is not a lesson plan. One standard can support many lessons, and one lesson may address only part of a standard.

**Implementing names:** `standards`

### Prerequisite

Knowledge or a skill a student needs before a later task. A prerequisite is a relationship between concepts, not a previous lesson and not a record of what a student has done.

**Implementing names:** `prerequisite_nodes`, `prerequisite_edges`

### Equivalent fractions

Different fraction names for the same number: `1/2`, `2/4`, and `3/6` name the same quantity. The seed lesson teaches this relationship.

### Misconception

A wrong idea that produces a wrong answer, as distinct from a slip. A misconception is what a teacher names when two wrong answers come from the same reasoning.

### Differentiation

Changes to teaching or practice for students with different current requirements. Different colours, or four versions of the same task, do not by themselves differentiate anything.

### Mastery

A judgement that a student can use a skill without support, now. Mastery is not a score and is not permanent. No record in the code models it.

### Adaptation

A change to the next activity based on what a student did. Adaptation is the product's intended action after evidence; the stories show a teacher choosing, not a system proposing.

## Work in the classroom

### Worked example

A solution shown with the reasoning for each step, before students work alone.

### Guided practice

A task a student attempts with teacher guidance or a hint available.

### Independent check

A task attempted without a hint before the first response. It is what produces independent learning evidence.

### Independent learning evidence

Work produced without an answer or a hint during the task. It does not mean home use without a teacher, and it is not the same as research evidence.

### Feedback

Information about a response that helps a student choose the next action. A score is not feedback.

### Distractor

An incorrect option chosen to reveal a specific error. A distractor is not a random wrong answer.

### Representation

A diagram or notation that shows a mathematical idea, such as a partitioned rectangle or a number line.

### Answer key

The teacher's record of correct responses for one task. It is private to the teacher and never reaches the student during the attempt.

### Assessment

The collection and interpretation of evidence about learning. Formative assessment uses that evidence to change the next teaching action; a score is one record inside assessment, not a replacement for it.

### Reteaching

Teaching the same objective again by a different route, after evidence shows it was not learned.

### Remediation

Work on a prerequisite that the lesson assumed, for a student who does not have it.

## Evidence and claims

### Research evidence

A record that makes a claim checkable: a trial, a survey, an observation with a date and a method. It is not the same as learning evidence collected from a class.

### Claim

A statement that needs evidence.

### Hypothesis

A possible explanation that needs a test. A hypothesis stated clearly is not a weakness in a plan.

### Observed, inferred, assumed

Three confidence labels. **Observed** means a concrete interaction or result is recorded. **Inferred** means a requirement or workflow strongly suggests it. **Assumed** means it still needs evidence. Every statement about teachers or students carries one of the three.

## Class

### Class

A named group of students taught together by one teacher. Every as-is story touches a class: its period, its materials, its list, its misconceptions.

**Not implemented.** The schema has `class_assignments` — a teacher-to-class link — and no record for the class itself. The class exists as an identifier with no name and no member list.

### Learner

A student in one tenant, as the product sees them. A learner is not the same as an actor: an actor signs in, a learner receives work.

## Legacy names

These names refer to the retired fixture model. They are kept because the tables still exist.

### Legacy activity

A seeded activity record from the pre-record model, with its content frozen in an activity version. It is fixture data, not the lesson the teacher edits, and it does not imply the learner flow uses it.

**Implementing names:** `activities`, `activity_versions`

### Legacy attempt

A seeded attempt row from the pre-record model. It is fixture data, not a learner attempt and not a generation attempt.

**Implementing names:** `attempts`
