# Issue implementer

This automation turns a small, human-approved GitHub Issue into a pull request. It is intentionally fail-closed: a failed or incomplete gate archives evidence and never pushes a branch.

## Required Issue contract

- The Issue is open and has the `同意实现` label.
- Every acceptance criterion is a Markdown checkbox (`- [ ] ...`).
- At most five acceptance criteria, four explicitly named files, and four concern groups are allowed. Larger Issues produce `split-proposal.md` for human review instead of being implemented.

## Gates

1. A deterministic policy classifies the Issue before any model call.
2. A separate model pass writes one acceptance test. It must fail before implementation and is committed before the implementation pass.
3. The implementation model cannot use Bash, the network, GitHub credentials, dependency manifests, automation files, or the immutable acceptance test.
4. Unit tests, a production build, and the three browser scenarios run through `verify.sh`.
5. A final read-only model pass must account for every acceptance criterion using a validated JSON protocol.
6. The pull request is created only after all gates pass. Merging remains a human action.

## Runtime prerequisites

- Node.js 20.19+ or 22.12+
- `claude`, `git`, `gh`, `jq`, `npm`, `flock`, `rg`, `grep`, and `curl`
- A Chrome/Chromium executable in `CHROME_PATH`, or Playwright Chromium installed with `npx playwright install chromium`
- `GH_TOKEN` and `GH_REPO` in the service environment; GitHub credentials are removed from every model subprocess

The service should keep exit status `75` as its five-hour retry signal. The resume file records the exact phase (`acceptance`, `implementation`, `verification`, or `review`), so a quota reset resumes the retained worktree without repeating completed model work. Ordinary validation failures return status `1` and must not be retried automatically.

## Verification

```bash
scripts/issue-implementer/verify.sh unit
scripts/issue-implementer/verify.sh build
scripts/issue-implementer/verify.sh browser
scripts/issue-implementer/verify.sh full
```

GitHub Actions runs `full` on every pull request and push to `master`. Configure the `Quality Gate / Unit, build, and browser acceptance` check as required in branch protection before relying on automatic PR creation.
