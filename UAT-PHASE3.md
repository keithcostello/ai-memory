# Phase 3 UAT — Human Testing Instructions

Run these steps in a terminal (PowerShell, CMD, or VS Code terminal). You can also paste each block into Cursor chat and ask the AI to run it.

---

## Setup

Create a folder **outside** the project so the CLI doesn't find the repo's `.git`:

```powershell
mkdir c:\PROJECTS\ai-memory-uat
```

(If you use `temp1` inside the project, the CLI finds the parent `.git` and skips init because memory already exists.)

---

## Step 1: Init

**What it does:** Scaffolds the memory system into the UAT folder.

**Run this:**

```powershell
cd c:\PROJECTS\ai-memory-uat
npx c:\PROJECTS\ai-memory_v1 init
```

**Expected:** Message says "ai-memory initialized successfully". No errors.

---

## Step 2: Status

**What it does:** Shows memory health report.

**Run this:**

```powershell
cd c:\PROJECTS\ai-memory-uat
npx c:\PROJECTS\ai-memory_v1 status
```

**Expected:** Report shows Tier 1 files (USER.md, WAITING_ON.md, etc.) and Tier 2. No errors.

---

## Step 3: Archive

**What it does:** Archives old logs (none yet, so it reports "no work").

**Run this:**

```powershell
cd c:\PROJECTS\ai-memory-uat
npx c:\PROJECTS\ai-memory_v1 archive
```

**Expected:** Message says "Archive complete". No errors.

---

## Step 4: Tests

**What it does:** Runs all automated tests, including ensureDir path containment.

**Run this:**

```powershell
cd c:\PROJECTS\ai-memory_v1
npm test
```

**Expected:** All tests pass. Look for "ensureDir" tests: "rejects path escaping", "succeeds when path is contained", "succeeds without projectRoot".

---

## Step 5: SECURITY.md

**What it does:** Confirms TOCTOU and ensureDir are documented.

**Action:** Open `c:\PROJECTS\ai-memory_v1\SECURITY.md` and skim:

- Symlink Handling section mentions "TOCTOU" and "acceptable risk"
- Path Traversal section mentions "ensureDir" and "projectRoot"

**Expected:** Both are present.

---

## Sign-Off

- [ ] Step 1 passed
- [ ] Step 2 passed
- [ ] Step 3 passed
- [ ] Step 4 passed (all tests green)
- [ ] Step 5 passed (docs look correct)

**UAT passed:** _______________ (date)  
**Reviewer:** _______________
