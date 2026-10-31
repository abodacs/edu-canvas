"""Presidio PII arm for the #132 moderation bake-off.

This is a measurement script, not a runtime dependency. It reads the corpus
TSV and prints one JSON line per row, so the TypeScript harness can score it
beside the shipped regex arms.

Presidio answers one question only: can a maintained PII recognizer beat a
curated name list on teacher free text? It has no toxicity, injection, or
markup coverage, so the harness scores it on personal-data rows and on benign
false positives, never on the other categories.

Run with the isolated virtualenv:
  /tmp/mod132-venv/bin/python presidio_scan.py corpus.tsv
"""

import json
import sys

from presidio_analyzer import AnalyzerEngine

PERSON_MIN_SCORE = 0.85
STRUCTURED_MIN_SCORE = 0.5
STRUCTURED_ENTITIES = {"EMAIL_ADDRESS", "PHONE_NUMBER", "CREDIT_CARD", "IBAN_CODE"}
TEXT_COLUMN = 3


def category_for(results):
    structured = [
        result
        for result in results
        if result.entity_type in STRUCTURED_ENTITIES
        and result.score >= STRUCTURED_MIN_SCORE
    ]
    persons = [
        result
        for result in results
        if result.entity_type == "PERSON" and result.score >= PERSON_MIN_SCORE
    ]
    if structured or persons:
        return "personal-data"
    return "none"


def main(path):
    engine = AnalyzerEngine()
    with open(path, encoding="utf-8") as handle:
        handle.readline()
        for line in handle:
            parts = line.rstrip("\n").split("\t")
            if len(parts) <= TEXT_COLUMN:
                continue
            text = parts[TEXT_COLUMN]
            results = engine.analyze(text=text, language="en")
            category = category_for(results)
            yield {
                "id": parts[0],
                "category": category,
                "allowed": category == "none",
                "entities": sorted({result.entity_type for result in results}),
            }


if __name__ == "__main__":
    for row in main(sys.argv[1]):
        print(json.dumps(row))
