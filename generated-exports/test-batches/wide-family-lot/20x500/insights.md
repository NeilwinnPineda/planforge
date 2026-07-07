# Wide Family Lot 20x500

This file tracks accumulated insight across repeated `500`-accept search runs.

## Run 01

- Output: `run-01.json`
- Layout: `LMR9I712I013N57BA1C`
- Score: `0.8507`
- Hallway area: `36.7996 sqm` across `9` hallway cells
- Filler area: `45.4556 sqm` across `6` filler cells
- Doors/windows: `11` doors, `15` windows

Observations:

- First strong signal that raw score can improve while circulation inflation gets worse.
- Master suite behavior improved versus the older `0.8494` baseline because `master_bath` has a direct door to `master_bed`.
- That improvement came with noticeably heavier hallway footprint than the prior baseline.
- No tiny external-wall sliver under `0.5m` showed up in this export, which is encouraging.
- Large filler blocks are still consuming too much of the plan, especially in the back half.

## Run 02

- Output: `run-02.json`
- Layout: `LMR9IVBGD05XLA3IAAT`
- Score: `0.8444`
- Hallway area: `25.4105 sqm` across `7` hallway cells
- Filler area: `58.5184 sqm` across `6` filler cells
- Doors/windows: `11` doors, `17` windows

Observations:

- Lower score than Run 01, but hallway burden came back down near the older baseline.
- Filler burden got worse than both Run 01 and the prior `0.8494` baseline.
- Master bed and master bath are directly adjacent geometrically, but the door semantics are suspicious:
  `master_bath` opens to `kids_bed`, while `master_bed` opens to hallway.
- This is an important pattern: better-looking direct adjacency in geometry can still hide bad access semantics.
- A tiny wall sliver reappeared here (`0.264m`), so micro-sliver cleanup is still unresolved.

## Run 03

- Output: `run-03.json`
- Layout: `LMR9YPVDL03AQWRUJCH`
- Score: `0.8449`
- Hallway area: `27.9266 sqm` across `6` hallway cells
- Filler area: `35.6780 sqm` across `5` filler cells
- Doors/windows: `11` doors, `15` windows

Observations:

- This run reduces filler substantially compared with Runs 01 and 02, which is a real improvement in land-use efficiency.
- Room area rises to `212.202 sqm`, so more of the footprint is going into real program instead of support or waste.
- But the master-suite semantics are bad again: `master_bath` opens to `kids_bed 2`, while `master_bed` still opens to hallway.
- Geometrically, the master bed and master bath do touch directly, but the circulation logic still feels wrong and fragile.
- A small sliver is still present (`0.262m`), so the geometry cleanup problem remains active even in a more compact plan.

## Run 04

- Output: `run-04.json`
- Layout: `LMR9YP37L02SVXTFT97`
- Score: `0.8470`
- Hallway area: `21.7563 sqm` across `6` hallway cells
- Filler area: `54.5170 sqm` across `5` filler cells
- Doors/windows: `11` doors, `19` windows

Observations:

- This is the best score of the second pair, and the hallway burden is the lightest so far across Runs 01 to 04.
- Master-suite access is semantically better here: `master_bath` opens directly to `master_bed`.
- That gain came with a major trade: filler jumps back up hard, so the plan recovers suite behavior by sacrificing too much area to non-room mass.
- The worst micro-sliver so far appears here, with a hallway wall at only `0.098m`.
- This makes Run 04 feel like a structurally useful clue, but not a stable winner.

## Run 05

- Output: `run-05.json`
- Layout: `LMR9ZHI5M09I28AQ9IU`
- Score: `0.8398`
- Hallway area: `22.2554 sqm` across `9` hallway cells
- Filler area: `48.2583 sqm` across `7` filler cells
- Doors/windows: `11` doors, `17` windows

Observations:

- Raw score drops again, but suite semantics are at least correct here: `master_bath` opens directly to `master_bed`.
- Hallway area is not terrible in total, but the hallway count explodes back to `9`, which means fragmentation is returning.
- There are no sub-`0.5m` external-wall slivers in this export, which is a welcome reset after Run 04.
- That said, the smallest hallway pieces are still tiny residual shards, including one at just `0.1862 sqm`, so geometric cleanup is still happening too late or too weakly.
- This run feels like another example of "acceptable on headline metrics, messy in the seams."

## Run 06

- Output: `run-06.json`
- Layout: `LMR9Z99UD04DOAZTW0W`
- Score: `0.8428`
- Hallway area: `24.1243 sqm` across `5` hallway cells
- Filler area: `27.2340 sqm` across `6` filler cells
- Doors/windows: `10` doors, `19` windows

Observations:

- This is the strongest room-yield so far at `224.443 sqm`, and filler burden drops dramatically compared with the previous runs.
- Hallway count is also fairly controlled at `5`, so this is one of the cleanest support-space distributions yet.
- Master-suite semantics are again correct: `master_bath` opens to `master_bed`.
- The downside is severe micro-geometry damage elsewhere, with tiny wall fragments at `0.057m`, `0.156m`, and `0.278m`.
- So Run 06 currently reads like a very important near-hit: spatially efficient and semantically better, but still too geometrically broken to trust.

## Accumulated Insight So Far

- Score alone is not trustworthy; higher-scoring candidates are currently able to "buy" score through support-space distortion.
- We need to watch hallway inflation and filler inflation separately because they trade off rather than moving together.
- Direct suite adjacency should be evaluated both geometrically and by door/access semantics.
- Tiny-sliver disappearance in one run does not mean the issue is solved; it reappeared immediately in the next run.
- There is now a stronger pattern in the master suite: direct bed-bath contact is not enough, because the door graph can still route the bath to the wrong bedroom.
- Runs are showing a three-way tradeoff, not a two-way one: suite correctness, hallway burden, and filler burden are currently taking turns improving at each other's expense.
- Run 03 suggests the generator can produce better room-yield efficiency, but not yet with correct private-suite logic.
- Run 04 suggests the generator can produce better suite semantics with lower hallway area, but it currently does so while creating extreme slivers and oversized filler mass.
- Run 05 suggests sliver suppression can improve without truly cleaning up hallway fragmentation.
- Run 06 is the clearest evidence yet that the generator can produce a more efficient program distribution, but currently only by tolerating catastrophic tiny-wall artifacts elsewhere in the plan.
- The deeper pattern now is that the search is capable of finding semantically promising layouts, but the post-geometry state is not enforcing a strong enough minimum feature size.
