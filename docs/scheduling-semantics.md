# Scheduling semantics

Runner and Edge schedulers share one generated evaluator and UTC context builder.
CI checks generated copies and executes identical cron fixtures in Node and Deno.

Expressions have five numeric fields: minute, hour, day of month, month and day of
week. Lists, inclusive ranges and steps are supported. Sunday is 0 or 7. Days and
months start at 1, including stepped wildcards. Malformed tokens, reversed ranges
and out-of-range values are rejected rather than partially parsed.

When both day of month and day of week are restricted, either matching field
selects the day. With a wildcard day field, both field matches are required.
This corrects the former evaluator's AND behavior for two restricted day fields;
review existing combined-day expressions before deployment.

Evaluation uses UTC, independent of the host timezone. A missed firing can catch
up within 48 hours, bounded by creation time and the last observed firing. Invalid
or future timestamps do not fire. Database claiming still atomically compares
the last observed firing to prevent two evaluators from enqueueing the same work.
Catch-up coalesces missed work into one firing; it does not replay every missed slot.

Both hosts attach requested task, delegation and usage context for the previous
UTC day. Queries are workspace-scoped and bounded to the latest 1000 records per
section; truncated summaries are labeled as samples. Usage reads current
`cost_usd` and metadata fields and labels unreported native usage as unknown.
If requested context cannot be loaded, that firing is deferred and logged rather
than running a report with silently missing context.

These changes do not enable a disabled Edge scheduler. Deploy the matching
`cron-evaluate` function before enabling it alongside the runner scheduler.
