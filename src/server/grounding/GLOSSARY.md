# Glossary — curriculum and sources

Vocabulary for `src/server/grounding/`. Meaning only. Product words live in the root [GLOSSARY.md](../../GLOSSARY.md); the map is [GLOSSARY-MAP.md](../../GLOSSARY-MAP.md).

### Source material

A document a teacher supplies so a draft can be grounded in it: a PDF, a text file, or a markdown file. Source material is not a **source item**, which is the left-hand column of a matching task, and it is not the seeded curriculum.

**Implementing names:** `source_snapshots`

### Source snapshot

One accepted upload with its extracted text, page count, content hash, and gap list. A snapshot is immutable once reviewed; a correction produces a new state, not a new document identity.

### Extraction

The reading of text out of a source material. Extraction reports what it could not read; it does not silently drop it.

### Gap

A specific piece of a source material that extraction could not read, with a page or a range and a severity. A gap is not a failure unless generation is asked to proceed with it unresolved.

### Source review

The teacher's inspection of extracted text, gaps, and any correction before the source can ground a draft. This is not **draft review**.

### Source gate

The rule that a generation request cannot start while its source has unresolved blocking gaps. The gate produces a verdict, not a warning.

### Grounding

The use of a specific, reviewed source snapshot as the factual basis of a draft, in place of, or beside, the seeded curriculum.

### Seeded curriculum

The built-in Grade 4 equivalent-fractions content: the standard, the prerequisite graph, the activity version, and the fixture attempt. It stands in for a real curriculum integration and is not teacher content.

### Curriculum port

The boundary the drafting context uses to read curriculum facts. It does not exist yet: drafting imports the seed module directly, which is the recorded boundary debt.
