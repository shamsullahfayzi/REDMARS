# Kabul ICPC cheat sheet: proposed 50-page outline and progress ledger

Updated: 22 October 2026. Status: outline approved by user's CONTINUE; Batch 2 complete, awaiting CONTINUE for Batch 3. Source analysis: historical-analysis.md in this folder.

## Contract

- Primary language C++17; paired standard Python 3 for all input formats and compact container reference.
- First section is I/O; second is syntax/data-structure reference. No standalone title page or introductory theory page.
- Exactly 50 numbered pages is the working target. The user also allows justified growth to 50-60; do not change this approved outline without explaining why. Verify actual pagination after consolidation, never claim it from an outline alone.
- Each algorithm uses: when/clues, idea, implementation, complexity, example, failure cases, realistic alternative.
- Every I/O format uses: sample, interpretation, minimal working C++17 and Python examples, caveat.
- Standard headers required. Clearly label fragments and shared-header dependencies. Full I/O examples must run independently.
- New examples are labeled illustrative; historical labels retain actual titles/years. Candidate solutions are inferred, never labeled official.
- Artifacts remain outside application code; CRM/finance application files are not involved.

## Proposed page allocation

| Page | Section and content | Evidence or purpose |
|---:|---|---|
| 1 | I/O: single integer/string, multiple integers, mixed integer/string pair; C++ fast-I/O and Python setup | Immediate usable input; compact section/page locator after examples |
| 2 | I/O: known fixed case count, leading test count, EOF loop, sentinel loop | Distinguish four stopping rules; STUDY |
| 3 | I/O: variable-length integer lines, strings with spaces, blank lines, mixed token/line input | LTRFRQ, ELVSEQ, OVRSPED |
| 4 | I/O: comma/colon/arrow fields; records; optional whitespace; numeric conversion; formatted output | Most papers; 12T24, BARCHART, BESTFRIEND |
| 5 | I/O: character grids, rectangular integer matrices, whitespace versus CSV rows | Waterfall, Sudoku, Minimum Passes |
| 6 | I/O: graph/tree edges, weights, adjacency lists, edge lists, 0/1 indexing, large-input patterns | ROAD, Two-Edge-Connected Graph; complete I/O pitfall checklist |
| 7 | STL: vector, array, string; insertion/deletion, lookup, slices, capacity, invalidation | Core storage and text |
| 8 | STL: pair/tuple, map/unordered_map; find/count/operator[]/at/erase, safe erase iteration | Explicit C++17 versus C++20 contains warning |
| 9 | STL: set/unordered_set, stack, queue, deque; operation/complexity table | Ordered/hash distinctions, traversal |
| 10 | STL: max/min priority_queue, comparators; sort/stable_sort/reverse and pair/custom ordering | Heaps, ranking, scheduling |
| 11 | STL: bounds/search, min/max, accumulate/count/find/unique, next_permutation, bitset/bits, headers | Return types, erase-unique, numeric promotion |
| 12 | Python containers: list/tuple/string/set/dict, Counter/defaultdict/deque, heapq/bisect, sorted/enumerate/zip/itertools | Compact practical syntax reference |
| 13 | Constraints and complexity; integer limits, memory estimates, recursion depth; rough feasibility table | Limits are heuristics, not runtime guarantees |
| 14 | Frequency tables, sorting/searching, prefix sums/frequencies, difference arrays, Kadane | Foundational array toolkit |
| 15 | Fixed/variable windows, two pointers, distinct counts and minimum covering substring | 2025 E; negative-value counterexample |
| 16 | Binary search: lower/upper boundary, first/last feasible, answer search and proof of monotonicity | Foundational; no claim of direct repeated evidence |
| 17 | Monotonic stacks: circular next greater and histogram maximum rectangle | 2025 B, 2024 H |
| 18 | Merge-sort inversion counting; balanced-parentheses index stack | 2023 B, 2024 F |
| 19 | Greedy intervals: maximum disjoint set, merging, minimum resources; endpoint conventions and exchange proofs | 2022 CPU, 2023 D, 2025 H |
| 20 | Greedy pairing, circular fuel balance, heap choice; how to disprove greedy with a small counterexample | 2023 E, 2025 D |
| 21 | Recursion, subsets/combinations/permutations, masks/XOR; bounded IP splits and pruning | 2025 A; foundational enumeration |
| 22 | Backtracking: visited/undo discipline, grid search, Sudoku candidate masks and MRV | 2025 C |
| 23 | Graph model; BFS/DFS, connected components, tree traversal and basic properties | Foundation for all graph pages |
| 24 | Grid traversal, multi-source BFS, layer counting, parent/path reconstruction | 2025 I and J |
| 25 | Dijkstra and tiny-graph Floyd-Warshall; unreachable vertices, numeric guards, negative-edge exclusion | 2022 OVRSPED |
| 26 | Directed/undirected cycle tests, bipartite checking, Kahn topological order | 2023 H and graph foundations |
| 27 | DSU and Kruskal; savings versus MST cost; disconnected inputs | 2022 ROAD |
| 28 | Strongly connected components and condensation source counting | 2024 Airport Connections |
| 29 | Bridges/low links, two-edge-connected predicate, edge IDs and disconnected cases | 2025 F |
| 30 | A* on a unit grid, Manhattan heuristic assumptions, stale entries, parents; comparison with BFS/Dijkstra | 2025 J explicitly requests A* |
| 31 | DP state design, recurrence/base/order, Fibonacci illustration, grid paths and obstacles | 2023 F/J; Fibonacci uncertainty noted |
| 32 | 0/1 versus unbounded knapsack; coin min/count; loop-order and impossible-state warnings | 2022 STUDY; foundational coin variants |
| 33 | Edit distance, subsequence versus substring, compact LIS | 2023 I; LIS labeled foundational |
| 34 | Palindrome minimum cuts and at-most-K stock transactions | 2023 C, 2024 B |
| 35 | Residual-range memoization and Catalan shape counts; progress/zero transitions | 2024 J, 2023 G |
| 36 | GCD/LCM, divisibility/parity, sieve/factorization, normalized modulo, fast exponentiation | Compact mathematical foundations |
| 37 | Binomial/exact counts, overflow/big-integer choices, division/rounding, squared-distance tests | 2023 F/G; 2024 Circular game/Tax |
| 38 | Worked archetypes: parse -> validate -> aggregate -> rank/format | 2022 LTRFRQ/SUGITEMS/BARCHART, 2023 BESTFRIEND, 2024 Red light/Tax; selected short adaptations |
| 39 | Worked archetypes: concurrent resources, pairing exchange, circular prefix balance | CPU/laptop Rentals; Tandem Bicycle; Valid Starting City |
| 40 | Worked archetypes: multiplicity-aware windows and stack boundaries | Smallest Substring; Next Greater/Skyline; reference templates instead of repetition |
| 41 | Worked archetypes: x/y length equation; overlapping string matches -> merged spans, compact KMP option | Pattern Matcher and Underscorify |
| 42 | Worked archetypes: route cost versus connectivity versus vulnerability; reduce before choosing algorithm | ROAD/OVRSPED/Airport/Two-Edge-Connected; one compact reduction core each as space permits |
| 43 | Worked archetypes: choose a DP state, compare brute force, separate exact from modular counting | STUDY, Max Profit, Palindrome, Ambiguous Measurements; selected representative traces |
| 44 | Worked archetypes: explicit BST comparison, waterfall mass propagation, axis-aligned rectangle pair counting | Same BSTs, Waterfall Streams, Rectangle Mania; compact distinct cores |
| 45 | Submission kit: standard headers/main, input dispatch, comparators, arithmetic helpers and template locator | Reusable integration, not repeated full chapters |
| 46 | Emergency cores: BFS/DFS, DSU, Dijkstra and graph initialization checklist | Compact reusable forms with pointers to full explanations |
| 47 | Emergency cores: binary search, prefix/window, basic DP; C++ undefined behavior and iterator traps | Short adapters and failure checks |
| 48 | Statement-to-algorithm decision framework and characteristics-to-candidates table | All ten requested diagnostic questions; proof and constraints over keywords |
| 49 | Boundary-case checklist, complexity/type table, brute-force comparison workflow, contest triage | Empty/singleton/duplicates/disconnected/overflow/reset/format |
| 50 | One-page contest-time index and detailed contents locator | Symptoms -> technique -> page; also exported separately as Deliverable C |

Section totals: I/O 6; language/library 6; complexity/arrays 6; greedy/search 4; graphs 8; DP 5; mathematics 2; historical archetypes 7; templates/pitfalls 3; decisions/checklist/index 3. Total 50.

## Drafting batches

| Batch | Pages | Scope | Status |
|---|---|---|---|
| 1 | 1-6 | Input/output survival guide | COMPLETE: six-page PDF, 21 paired examples, 63 Python checks passed |
| 2 | 7-12 | STL and Python reference | COMPLETE: six-page PDF, 22 C++ fragments, 5 Python snippets, 26 Python assertions passed |
| 3 | 13-18 | Constraints, arrays, strings | Pending CONTINUE |
| 4 | 19-24 | Greedy, backtracking, graph foundations | Pending CONTINUE |
| 5 | 25-30 | Graph algorithms | Pending CONTINUE |
| 6 | 31-37 | Dynamic programming and mathematics | Pending CONTINUE |
| 7 | 38-44 | Historical archetypes | Pending CONTINUE |
| 8 | 45-50 | Templates, decision tables, final index | Pending CONTINUE |

Every response starts with batch/section/exact page range, ends at a page boundary, reports completed/next pages, and waits for instruction. Final batch is followed by authorized consolidation and verification, with no unsupported claim of compilation or pagination.

## Page and validation design

- A4 portrait, searchable text and copyable code, running section title/page number, restrained grayscale-safe accents.
- Two columns where appropriate; longer templates may use full width. Target readable body/code around 9-10 pt, with layout adjustment rather than unreadable shrinking.
- Page 1 begins with I/O. A compact contents locator shares page 1; detailed reverse index is page 50. No filler cover.
- Prefer one canonical implementation per technique, with concise adapters in the emergency kit. Historical pages focus on reduction, traces, failure modes, and distinct cores.
- Compile standalone C++17 examples and fragment harnesses when a compiler is available; execute Python parsing examples against displayed samples.
- Use meaningful small-case brute-force comparisons for windows, greedy, inversion counts, stacks, graph algorithms, and DP. Run structural checks for Sudoku and returned paths.
- Damaged historical samples are evidence of ambiguity, not test oracles. Use original, clearly labeled examples with explicit assumptions instead.
- Render each batch and inspect layout; final consolidation checks page count, cross-references, missing/duplicate sections, text extraction, and code copyability.
- Deliverable A is the current historical analysis. Deliverable B is the final manual. Deliverable C is a one-page export of page 50. Deliverable D reports actual tests and limits after generation.

## Persistent progress ledger

- Outline approved: YES, by the user's CONTINUE following the approval request.
- Completed manual pages: 1-12 (Batches 1-2).
- Remaining manual pages: 13-50.
- Historical review: COMPLETE, 42/42 problems; local source analysis saved.
- Latest authorized step: Batch 2, pages 7-12; completed. Wait for CONTINUE before Batch 3.
- Next action after CONTINUE: Batch 3, pages 13-18 only, constraints, arrays, and strings.
- Unresolved source issues: TXTCMP ID base; CAESAR decryption sign; SUGITEMS tie order; BARCHART zero/width; ELVSEQ duplicates; 2023 malformed samples/bounds; case sensitivity; Fibonacci definition; exact count representation; BESTFRIEND percentage/ranking conventions; zero-measurement semantics; missing 2025 outer framing/empty outputs/path tie rules.
- Resolve in manual using explicit illustrative assumptions, never fabricated official rules. No need to ask user to choose topics.
- C++ code compiled: none yet; 43 examples/fragments reviewed (21 in Batch 1, 22 in Batch 2). No compiler found in PATH or common checked installation/runtime directories. Do not claim compilation.
- Python manual examples tested: 26 programs/snippets. Batch 1: 63 sample/edge test runs passed for 21 programs. Batch 2: 26 assertion statements passed for 5 snippets. These are distinct measures, not one homogeneous test count.
- Batch 1 PDF pagination verified: exactly six A4 pages, numbered 1-6; all six pages visually inspected. All 42 PDF code blocks match source ignoring whitespace.
- Batch 2 PDF pagination verified: exactly six A4 pages, numbered 7-12; all six final pages visually inspected. All 27 PDF code blocks match source ignoring whitespace.
- Final 50-page pagination: not yet applicable; the first 12 pages exist across two batch PDFs.
- Batch files: ../pdf/kabul-icpc-part-01-pages-01-06.pdf; part-01-pages-01-06.md; batch-01-code.zip; batch-01-validation.json; batch-01-quality-report.md.
- Batch 2 files: ../pdf/kabul-icpc-part-02-pages-07-12.pdf; part-02-pages-07-12.md; batch-02-code.zip; batch-02-validation.json; batch-02-quality-report.md.
- Batch 2 layout: two columns, 9 pt body and Consolas code, 8.6 pt table text; consistent blue headings and gray code panels. C++ fragments explicitly identify headers and main-body context; complete independent harnesses are in the source archive.
- Layout: A4, 30 pt side margins, 9 pt Consolas code, 8.6 pt supporting notes, blue headings, gray code panels. Complete C++ programs on left; paired Python, interpretation/sample and warnings distributed across two columns. No manual page is a cover.
- Consolidation reminder: page 1 currently says pages 7-50 are planned/not yet issued; remove that provisional clause once all pages exist. Footers currently say /50 planned; change only after final pagination verification.
