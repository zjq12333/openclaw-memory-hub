#!/usr/bin/env python3
"""
AAAK Dialect integration for openclaws-memory-hub.

Incorporated from mempalace by milla-jovovich.
License: MIT
Original: https://github.com/milla-jovovich/mempalace/blob/main/mempalace/dialect.py
"""

"""
AAAK Dialect -- Structured Symbolic Summary Format
====================================================

A lossy summarization format that extracts entities, topics, key sentences,
emotions, and flags from plain text into a compact structured representation.
Any LLM reads it natively -- no decoder required.

Works with: Claude, ChatGPT, Gemini, Llama, Mistral -- any model that reads text.

NOTE: AAAK is NOT lossless compression. The original text cannot be reconstructed
from AAAK output. It is a structured summary layer (closets) that points to the
original verbatim content (drawers). The 96.6% benchmark score is from raw mode,
not AAAK mode.
"""

import json
import re
from typing import List, Dict, Optional


# === EMOTION CODES (universal) ===

EMOTION_CODES = {
    "vulnerability": "vul",
    "vulnerable": "vul",
    "joy": "joy",
    "joyful": "joy",
    "fear": "fear",
    "mild_fear": "fear",
    "trust": "trust",
    "trust_building": "trust",
    "grief": "grief",
    "raw_grief": "grief",
    "wonder": "wonder",
    "philosophical_wonder": "wonder",
    "rage": "rage",
    "anger": "rage",
    "love": "love",
    "devotion": "love",
    "hope": "hope",
    "despair": "despair",
    "hopelessness": "despair",
    "peace": "peace",
    "relief": "relief",
    "humor": "humor",
    "dark_humor": "humor",
    "tenderness": "tender",
    "raw_honesty": "raw",
    "brutal_honesty": "raw",
    "self_doubt": "doubt",
    "anxiety": "anx",
    "exhaustion": "exhaust",
    "conviction": "convict",
    "quiet_passio": "passion",
    "warmth": "warm",
    "curiosity": "curious",
    "gratitude": "grat",
    "frustration": "frust",
    "confusion": "confus",
    "satisfaction": "satis",
    "excitement": "excit",
    "determination": "determ",
    "surprise": "surprise",
}

# Keywords that signal emotions in plain text
EMOTION_SIGNALS = {
    "decided": "determ",
    "prefer": "convict",
    "worried": "anx",
    "excited": "excit",
    "frustrated": "frust",
    "confused": "confus",
    "loved": "love",
    "hated": "rage",
    "hope": "hope",
    "fear": "fear",
    "trust": "trust",
    "happy": "joy",
    "sad": "grief",
    "surprised": "surprise",
    "grateful": "grat",
    "curious": "curious",
    "wonder": "wonder",
}

# Keywords that signal flags
FLAG_SIGNALS = {
    "decided": "DECISION",
    "chose": "DECISION",
    "switched": "DECISION",
    "migrated": "DECISION",
    "replaced": "DECISION",
    "instead": "DECISION",
    "because": "DECISION",
    "founded": "ORIGIN",
    "created": "ORIGIN",
    "started": "ORIGIN",
    "born": "ORIGIN",
    "launched": "ORIGIN",
    "first": "ORIGIN",
    "core": "CORE",
    "fundamental": "CORE",
    "essential": "CORE",
    "principle": "CORE",
    "belief": "CORE",
    "always": "CORE",
    "never": "CORE",
    "turning": "PIVOT",
    "changed": "PIVOT",
    "realized": "PIVOT",
    "breakthrough": "PIVOT",
    "epiphany": "PIVOT",
    "api": "TECHNICAL",
    "database": "TECHNICAL",
    "architecture": "TECHNICAL",
    "deploy": "TECHNICAL",
    "infrastructure": "TECHNICAL",
    "algorithm": "TECHNICAL",
    "framework": "TECHNICAL",
    "server": "TECHNICAL",
    "config": "TECHNICAL",
}

# Common filler/stop words to strip from topic extraction
STOP_WORDS = {
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "shall",
    "can",
    "to",
    "of",
    "in",
    "for",
    "on",
    "with",
    "at",
    "by",
    "from",
    "as",
    "into",
    "about",
    "between",
    "through",
    "during",
    "before",
    "after",
    "above",
    "below",
    "up",
    "down",
    "out",
    "off",
    "over",
    "under",
    "again",
    "further",
    "then",
    "once",
    "here",
    "there",
    "when",
    "where",
    "why",
    "how",
    "all",
    "each",
    "every",
    "both",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "no",
    "nor",
    "not",
    "only",
    "own",
    "same",
    "so",
    "than",
    "too",
    "very",
    "just",
    "don",
    "now",
    "and",
    "but",
    "or",
    "if",
    "while",
    "that",
    "this",
    "these",
    "those",
    "it",
    "its",
    "i",
    "we",
    "you",
    "he",
    "she",
    "they",
    "me",
    "him",
    "her",
    "us",
    "them",
    "my",
    "your",
    "his",
    "our",
    "their",
    "what",
    "which",
    "who",
    "whom",
}


class AAAKDialect:
    """
    AAAK Dialect encoder -- compresses plain text into compact structured format.

    Usage:
        # Basic: compress any text
        dialect = AAAKDialect()
        compressed = dialect.compress("We decided to use GraphQL instead of REST...")

        # With pre-defined entity mappings
        dialect = AAAKDialect(entities={"openclaw": "OCW", "memory": "MEM"})
        compressed = dialect.compress("We decided to use GraphQL instead of REST...")

    Formats text into compact structured format that any LLM can read natively.
    This is **lossy** compression -- original cannot be reconstructed from output.
    """

    def __init__(self, entities: Dict[str, str] = None, skip_names: List[str] = None):
        self.entity_codes = {}
        if entities:
            for name, code in entities.items():
                self.entity_codes[name] = code
                self.entity_codes[name.lower()] = code
        self.skip_names = [n.lower() for n in skip_names] if skip_names else []

    def encode_entity(self, name: str) -> str | None:
        """Convert a person/entity name to its short code."""
        if any([s in name.lower() for s in self.skip_names]):
            return None
        if name in self.entity_codes:
            return self.entity_codes[name]
        # Auto-code: first 3 chars uppercase
        clean = re.sub(r"[^a-zA-Z]", "", name)
        code = clean[:3].upper()
        if code not in self.entity_codes:
            self.entity_codes[code] = code
        return code if len(name) >= 1 else None

    def get