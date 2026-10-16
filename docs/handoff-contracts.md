# Versioned pipeline handoffs

Add an optional `output_contract` to a pipeline step, or use **Output contract** in
the step settings. The runner and standalone CLI use the same bounded validator.
The model receives the schema in its instructions; CrewForm validates the actual
returned JSON before handing it to the next step. API execution, native CLI and
ACP all use this check. It is not a provider-specific structured-output guarantee.

```json
{
  "version": 1,
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["schemaVersion", "source", "finding"],
    "properties": {
      "schemaVersion": {"type": "integer", "enum": [1]},
      "source": {"type": "string", "minLength": 1},
      "finding": {"type": "string", "minLength": 1}
    }
  }
}
```

The contract format version and your payload's schema version are separate.
Include a payload version when consumers need it. No contract preserves the
existing text-output behavior. Unsupported contract versions fail before any
pipeline model call. A validation failure stops the pipeline even when retry or
skip is configured; it does not automatically repeat a potentially costly call.

Version 1 supports this **limited JSON-schema subset**:

- Explicit `type`: object, array, string, number, integer, boolean or null.
- Objects: `properties`, `required`, boolean `additionalProperties` (default true).
- Arrays: required `items`, optional `minItems` and `maxItems`.
- Strings: `minLength` and `maxLength` measured in JavaScript string units.
- Numbers: `minimum` and `maximum`; primitive `enum` values for all types.

References, remote schemas, regexes, formats, coercion and unknown keywords are
rejected. Contracts are limited to 32 KiB, 256 schema nodes and depth 8; output is
limited to 1 MiB, 10,000 checked values and depth 32. Configure explicit item counts
and `additionalProperties: false` for a stricter boundary.

For a fan-out step, the contract applies to its final aggregate/merged result.
Configure a merge agent to return the expected JSON; concatenated text branches
will not match an object contract. Individual branches do not inherit the final
aggregate's schema. Both sequential and fan-out step settings expose the final
output contract field.

Schema validation checks shape, not truth, authorization or the safety of an action.
Treat agent output as untrusted data and review evidence before external writes.
See [pipeline recovery](pipeline-recovery.md) for uncertainty and human decisions.

## Supported execution paths

| Path | API keys | Native login | Contracts | Durable continuation |
|---|---|---|---|---|
| Standalone API/Ollama pipeline | Provider-dependent | No | Yes | No |
| Standalone Codex/Claude CLI pipeline | No API fallback | Installed agent | Yes | No |
| Standalone ACP pipeline | Adapter/provider-dependent | Installed agent | Yes | No |
| Trusted self-hosted runner pipeline | Provider-dependent | Explicit owner consent for native agents | Yes | Committed step boundaries |
| CrewForm Cloud managed pipeline | Provider-dependent | No shared native login | Yes | Committed step boundaries |
| Paired laptop worker | No API fallback | Device owner's installed agent | Single-agent tasks only | Teams not yet supported |

Native eligibility, account limits and ACP adapter compatibility must be checked
separately. `doctor` checks executable availability only. Unknown native usage is
reported as unknown.
