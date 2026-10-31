const canonicalize = (value: unknown): string => {
  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "boolean": {
      return value ? "true" : "false";
    }
    case "number": {
      if (!Number.isFinite(value)) {
        throw new TypeError("Canonical JSON rejects non-finite numbers.");
      }
      return JSON.stringify(value);
    }
    case "string": {
      return JSON.stringify(value);
    }
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
      }
      const record = value as Record<string, unknown>;
      const entries = Object.keys(record)
        .toSorted((left, right) => left.localeCompare(right))
        .map((key) => {
          const entry = record[key];
          if (entry === undefined) {
            throw new TypeError(
              "Canonical JSON rejects undefined; use an explicit null."
            );
          }
          return `${JSON.stringify(key)}:${canonicalize(entry)}`;
        });
      return `{${entries.join(",")}}`;
    }
    default: {
      throw new TypeError("Canonical JSON rejects unsupported values.");
    }
  }
};

/**
 * Deterministic JSON for hashing: sorted object keys, preserved array order, explicit nulls. Undefined is rejected so an absent value cannot silently change a hash.
 */
export const canonicalJson = (value: unknown): string => canonicalize(value);
