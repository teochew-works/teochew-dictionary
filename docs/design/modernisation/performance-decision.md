# Payload experiment: retain the format pending device evidence

Related to #296. Reproduce with `node web/scripts/measure-payload-options.mjs`
after building the root dataset. The adjacent JSON report records the source hash.

The rebuilt source is 48,887,163 bytes / 2,730,951 gzip bytes. A minified version
is 29,962,270 bytes / 2,299,668 gzip bytes. A deliberately incomplete search/list
projection is 3,978,431 bytes / 962,936 gzip bytes. Adding 128-entry detail shards
brings the combined gzip payload to 3,333,688 bytes over 128 resources including
the index, before a manifest or HTTP overhead. This could improve first lookup,
but increases a complete offline download relative to the monolithic source.

The projection omits metadata needed for complete grouping, audio filtering and
study. It is an experiment, not a production contract. It also uses source-order
shards, which are unsuitable as stable cache identifiers.

## Decision for this series

Keep production artifacts and offline formats unchanged. Ship demand loading,
shared search indexes and route splitting first. Do not infer device gains from
Node size/timing proxies. The baseline measured roughly 24–66ms median Fuse search
on an Apple M5 Max; it does not include application reranking or browser rendering.
Those timings warrant a worker investigation on slower hardware, but do not by
themselves choose an implementation or justify an incompatible data migration.

## Adoption gates

- Capture browser input latency, indexing time and peak memory on a named
  mid-range phone, plus at least one desktop comparison.
- Compare worker startup/clone costs with transferable/lightweight records;
  protect against stale responses and terminate work when the dataset changes.
- Define a complete projection covering all existing filters, grouping, study,
  alternate readings, provenance and audio availability before measuring savings.
- Use content-addressed/versioned shards with a manifest that cannot combine
  unrelated dataset generations. Preserve opt-in offline coverage and handle
  interrupted downloads/quota failure without deleting the previous usable copy.
- Run the existing representative ranking corpus through old and proposed paths.
- Demonstrate a measured improvement against agreed browser budgets, including
  all-offline download size and request count, before adopting either approach.

Worker and sharding adoption are explicitly deferred, not reported as completed.
The experiment is reproducible without adding runtime dependencies or changing
user storage. Revisit after the device baseline, with results attached to #296.
