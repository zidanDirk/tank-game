# Issue implementer

This automation turns a small, human-approved GitHub Issue into a pull request. It is intentionally fail-closed: a failed or incomplete gate archives evidence and never pushes a branch.

## Required Issue contract

- The Issue is open and has the `同意实现` label.
- Every acceptance criterion is a Markdown checkbox (`- [ ] ...`).
- At most five acceptance criteria, three explicitly named files, and four concern groups are allowed. An implementation may change at most three files and 350 lines. Larger Issues are split into independently approved child Issues instead of being implemented as one change.

## Gates

1. A deterministic policy classifies the Issue before any model call. Oversized Issues are idempotently split into linked child Issues; the parent approval label is removed and each child waits for a fresh human approval.
2. A separate model pass writes one acceptance test. It must fail before implementation and is committed before the implementation pass.
3. The implementation model cannot use general Bash, the network, GitHub credentials, dependency manifests, automation files, or the immutable acceptance test. Its only executable tool selects the fixed `unit` or `build` verifier with a credential-free environment and timeout.
4. Unit tests, a production build, and the three browser scenarios run through `verify.sh`.
5. A final read-only model pass must account for every acceptance criterion using a validated JSON protocol.
6. The pull request is created only after all automated gates pass. Merging additionally requires the `人工试玩通过` label. Any new commit removes stale playtest approval, forcing a fresh playtest of the current head.

## Runtime prerequisites

- Node.js 20.19+ or 22.12+
- `claude`, `git`, `gh`, `jq`, `npm`, `flock`, `rg`, `grep`, and `curl`
- A Chrome/Chromium executable in `CHROME_PATH`, or Playwright Chromium installed with `npx playwright install chromium`
- `GH_TOKEN` and `GH_REPO` in the service environment; GitHub credentials are removed from every model subprocess

Set `AUTO_CREATE_SPLIT_ISSUES=false` to produce only a local split proposal. The default is `true`. Automatically created children never receive the `同意实现` label.

The service should keep exit status `75` as its five-hour retry signal. The resume file records the exact phase (`acceptance`, `implementation`, `verification`, or `review`), so a quota reset resumes the retained worktree without repeating completed model work. Ordinary validation failures return status `1` and must not be retried automatically.

## Verification

```bash
scripts/issue-implementer/verify.sh unit
scripts/issue-implementer/verify.sh build
scripts/issue-implementer/verify.sh browser
scripts/issue-implementer/verify.sh full
```

GitHub Actions runs `full` on every pull request and push to `master`. Configure both `Quality Gate / Unit, build, and browser acceptance` and `Quality Gate / Human playtest approval` as required checks in branch protection before relying on automatic PR creation.
