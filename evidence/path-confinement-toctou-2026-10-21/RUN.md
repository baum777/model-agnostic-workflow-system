# MAWS — TOCTOU residual lane for the shared path-confinement primitive

Date: 2026-10-21. This run works the TOCTOU residual classes of
`scripts/tools/path-confinement.mjs` as far as the runtime's public API
actually allows, per the owner ticket of 2026-10-21. It is a NEW bounded
change on top of the merged state; the S5, S8 and S9 slices' closures are NOT
re-opened (their closures are pinned to their published commits), and the
S9 qualification of the same day is untouched.

---

## 1. What was implemented

**The procfs rooted descriptor binding.** Where the platform provides
`/proc/self/fd` (Linux), `confineFileToBase` records
`descriptor_binding: 'proc_fd_rooted'` (exported constant
`DESCRIPTOR_BINDING_PROC_ROOTED`) together with the base directory's own
device/inode identity (`baseDev`, `baseIno`), and `readConfinedFile` produces
the descriptor through `openProcRooted`:

1. the verified base directory is opened once with `O_RDONLY|O_DIRECTORY|
   O_NOFOLLOW` and fstat-verified against the identity the containment check
   observed — a base that moved between check and open is refused
   (`PATH_CHANGED_DURING_RESOLUTION`);
2. every INTERMEDIATE component is opened with `O_NOFOLLOW|O_DIRECTORY`
   relative to the previous descriptor's procfs magic link
   (`/proc/self/fd/<fd>/<component>`), so the traversal is rooted at the
   verified base inode: whatever sits at the old paths is irrelevant;
3. the final component is opened with `O_NOFOLLOW|O_NONBLOCK` relative to the
   last pinned descriptor;
4. a symbolic link introduced at any intermediate component is refused with
   `PATH_ESCAPES_BASE_THROUGH_SYMLINK` (empirically the kernel answers
   `O_NOFOLLOW|O_DIRECTORY` on a symlink component with ELOOP or ENOTDIR
   depending on shape; both codes are disambiguated by `lstat` of the
   component, so a file replacement is still reported as
   `PATH_CHANGED_DURING_RESOLUTION` and only a link is an escape);
5. every existing guard is unchanged and still runs on the produced
   descriptor: the regular-file check, the C3 device/inode identity binding,
   the parent-directory identity re-check and the C5 link-count comparison.

Where the binding is not available (non-Linux, no procfs), the record carries
`descriptor_binding: 'real_path_fallback'` and the read keeps the previous
real-path open with all its guards. The strategy is decided at CONFINE time
and recorded, so it can never silently change between the check and the open.

## 2. Effect on the residual classes

- **R1** (in-place rewrite of the same inode; a link created after the
  descriptor was opened) — UNCHANGED and still documented as not eliminated.
  The descriptor pins the inode; a writer who can rewrite the file in place
  is not detected by any check this module can make, and the corpus digest
  the records carry remains the visibility for it.
- **R2** (parent-directory replacement) — materially SHRUNK where the rooted
  binding is active: the read is confined BY CONSTRUCTION to the base
  subtree, because the resolution starts at the pinned base inode and every
  component is O_NOFOLLOW. A swap is either detected (the identity checks) or
  resolves inside the base. What remains of R2 there is a same-name race
  inside ONE component resolution, which nothing this runtime exposes can
  close; on a platform without the rooted binding, the full R2 race remains
  as before. The module header states exactly this.
- **R3** (hung filesystem) — UNCHANGED.
- **R4** (bind mount inside the base) — UNCHANGED.

## 3. Tests and probes

Three new tests in `tests/vnext/s5-path-confinement.test.mjs` (Linux-gated
where the mechanism is asserted): the binding decision is recorded; a nested
target is read through the pinned base descriptor; an intermediate directory
swapped to a symbolic link AFTER the check is refused with the escape code —
and the restored layout reads back the confined content. Suite: 30 pass /
0 fail (27 prior + 3 new). The S8 (25/0) and S9 (24/0) suites, which consume
the primitive, and `eval:skill-effectiveness` (final verdict
IMPROVEMENT_PROVEN) are green on the same tree.

| Probe | Neutered guard | Result |
|---|---|---|
| B1 | the procfs decision (always fall back) | "a nested target is read through the pinned base descriptor" and "an intermediate directory swapped to a symbolic link …" both fail (28/2): the fallback follows the introduced link and refuses with the identity code instead of the escape code |
| B2 | the intermediate `O_NOFOLLOW\|O_DIRECTORY` | exactly "an intermediate directory swapped to a symbolic link …" fails (29/1): the link is followed to the replacement, which the identity checks catch as a change, not as an escape |

Both probes were reverted; the tracked tree is pristine and the suite is
30/0 after restoration.

## 4. Registration surfaces

- Owner-side classification: `registry-disposition.v1` NO_CHANGE with
  `affected_records` empty — no CONTRACT_RECORD, PROVENANCE or SUPERSESSION
  class changes; the primitive is a tool surface and its new fields are
  additive. The change registration is the new Registry record
  (`MAWS_PATH_CONFINEMENT_TOCTOU_2026_10_21_001`); the Atlas representation
  trails it as its own claim.
- No registered object is mutated: the S5/S8/S9 records stay bound to their
  published commits and remain factually true for their events.

## 5. Limits — what this run does NOT claim

- R1, R3 and R4 are NOT claimed as eliminated or narrowed; only R2 is
  narrowed, and only where the rooted binding is active.
- No adversarial parallel writer is claimed as tested beyond the bound tests;
  the races are narrowed, not eliminated, and the header says so.
- Hosted GitHub Actions remains blocked account-wide (billing lock); every
  gate here is a LOCAL run under Node v24.19.0. No hosted result is claimed.
- No security-scan claim: the external deep scanner's analysed set contains
  no `.mjs` material (measured the same day). The establishment of an
  actually .mjs-capable check is the ticket's third item and belongs to its
  own lane.
