# NativeScript Contributor License Agreement (CLA)

All external pull requests across the [`NativeScript`](https://github.com/NativeScript) GitHub organization require a signed Contributor License Agreement before merging. Contributors retain copyright in their work while granting the license described in the agreement.

- **Individuals:** [Individual Contributor License Agreement (ICLA v2.0)](./docs/legal/individual-cla.md)
- **Organizations / Employers:** [Corporate Contributor License Agreement (CCLA)](./docs/legal/corporate-cla.md)

---

## How to Sign (Individual)

1. Open your pull request in any `NativeScript` repository.
2. Read the [Individual CLA](./docs/legal/individual-cla.md).
3. Post a comment on the pull request with the exact text:

   ```text
   I have read the CLA and I hereby sign the CLA
   ```

4. That comment immediately satisfies the `✍️ CLA` status check on your pull request (only when posted by the pull request author or commit author). A bystander comment cannot sign on behalf of another contributor.

### Sign Once for the Entire `NativeScript` Organization

- **Signing once covers past, present, and future contributions** from your GitHub account across **every repository** in `github.com/NativeScript`.
- Previous signers of the OpenJS Foundation NativeScript CLA have already been migrated into [`cla-signers.json`](https://github.com/NativeScript/.github/blob/cla-signatures/cla-signers.json) on the `cla-signatures` branch and will pass automatically.
- After your pull request merges, our workflow automatically records your GitHub username on the [`cla-signatures`](https://github.com/NativeScript/.github/blob/cla-signatures/cla-signers.json) branch so future pull requests pass silently with zero extra steps.
- Because signer records are read from the protected `cla-signatures` branch (never from the pull request branch), editing `cla-signers.json` inside a pull request does not pass the check.

---

## How to Sign (Corporate / Entity)

If an employer or legal entity owns the contribution and requires a corporate agreement rather than individual sign-off under Section 4 of the ICLA, follow the steps in the [Corporate CLA guide](./docs/legal/corporate-cla.md) via [operations@openjsf.org](mailto:operations@openjsf.org).

---

## Troubleshooting

### Commit author is not linked to a GitHub account

If a commit in your pull request was authored with a local `git config user.email` address that is not registered on your GitHub account, GitHub cannot associate that commit with your GitHub username. To resolve it:

1. Add the commit email address to your GitHub account at [github.com/settings/emails](https://github.com/settings/emails), **or** amend the commit author (`git commit --amend --reset-author`) using your GitHub-verified email and force-push your branch.
2. Comment `I have read the CLA and I hereby sign the CLA` if you have not yet signed.

---

## Who Does Not Need to Sign

The following accounts are allowlisted in [`cla-signers.json`](https://github.com/NativeScript/.github/blob/cla-signatures/cla-signers.json) and pass automatically:

- Active `NativeScript` organization maintainers and service accounts listed in `allowlist.github`
- Automated GitHub accounts ending in `[bot]` or prefixed with `app/` (e.g., `dependabot[bot]`, `github-actions[bot]`)

---

## Maintainer Reference

- **Do not merge** a pull request while the `✍️ CLA` check is failing.
- Individual signatures are recorded automatically on `cla-signatures` when a pull request merges and synced org-wide to `NativeScript/.github@cla-signatures` (you can also trigger the `Sync Org CLA Signers` workflow manually via `workflow_dispatch`).
- **Recording a Corporate CLA:** Add authorized GitHub usernames to `cla-signers.json` on the `cla-signatures` branch of `NativeScript/.github` with `"signedAt": "YYYY-MM-DD"` and `"cla": "corporate"`.
- **Carrying commits from a superseded PR:** If a contributor signed on an earlier closed pull request and a maintainer carries their commits into a new pull request, record their original signing comment onto `NativeScript/.github@cla-signatures`:

  ```sh
  git fetch origin cla-signatures:refs/remotes/origin/cla-signatures
  git worktree add --detach ../cla-signatures origin/cla-signatures
  node scripts/check-cla.mjs --signers ../cla-signatures/cla-signers.json --record-signer <login> --signed-at <YYYY-MM-DD> --comment-file <comment-body-file>
  git -C ../cla-signatures commit -am "chore(cla): record @<login> from #<pr>"
  git -C ../cla-signatures push origin HEAD:cla-signatures
  git worktree remove ../cla-signatures
  ```
