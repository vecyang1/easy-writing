#!/usr/bin/env node
/**
 * Sync fork cleanly to the latest stable semver release tag (vX.Y.Z) on `upstream`.
 * - Ignores prereleases (alpha/beta/rc/dev) and unstable WIP commits.
 * - Fails closed on dirty working tree, merge conflicts, or verification failure (auto-rolls back).
 * - Usage:
 *     node scripts/sync-upstream-stable.mjs                 # dry-run check
 *     node scripts/sync-upstream-stable.mjs --apply         # merge + verify locally
 *     node scripts/sync-upstream-stable.mjs --apply --push  # merge + verify + push origin/main
 */
import { execFileSync, spawnSync } from 'node:child_process'

const args = new Set(process.argv.slice(2))
const apply = args.has('--apply')
const push = args.has('--push')
const verifyCmd = 'pnpm check:frontend && node --test edge-tests/edge-functions.test.mjs && pnpm build'

function git(cmdArgs, opts = {}) {
  return execFileSync('git', cmdArgs, { encoding: 'utf8', ...opts }).trim()
}

function parseSemver(tag) {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function cmpSemver(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

function main() {
  git(['fetch', 'upstream', '--tags', '--prune'])
  const tagsRaw = git(['ls-remote', '--tags', '--refs', 'upstream'])
  const stableTags = tagsRaw
    .split('\n')
    .map(line => line.split('\t')[1]?.replace('refs/tags/', '') || '')
    .filter(tag => parseSemver(tag) !== null)
    .sort((a, b) => cmpSemver(parseSemver(b), parseSemver(a)))

  if (stableTags.length === 0) {
    console.log(JSON.stringify({ status: 'NO_STABLE_TAGS' }, null, 2))
    process.exit(0)
  }

  const latestTag = stableTags[0]
  const head = git(['rev-parse', '--short', 'HEAD'])
  let alreadyMerged = false
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', latestTag, 'HEAD'], { stdio: 'ignore' })
    alreadyMerged = true
  } catch {
    alreadyMerged = false
  }

  const dirty = git(['status', '--porcelain'])
  if (alreadyMerged) {
    console.log(JSON.stringify({ status: 'UP_TO_DATE', latestStableTag: latestTag, head, dirty: Boolean(dirty) }, null, 2))
    process.exit(0)
  }

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          status: 'UPDATE_AVAILABLE',
          latestStableTag: latestTag,
          head,
          dirty: Boolean(dirty),
          nextStep: 'node scripts/sync-upstream-stable.mjs --apply --push',
        },
        null,
        2,
      ),
    )
    process.exit(0)
  }

  if (dirty) {
    console.error('Refusing to sync: working tree has uncommitted changes.')
    process.exit(2)
  }

  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  const backupBranch = `backup/pre-sync-${latestTag}-${stamp}`
  git(['branch', backupBranch])

  const mergeRes = spawnSync(
    'git',
    ['merge', '--no-ff', latestTag, '-m', `chore(upstream): sync stable release ${latestTag}`],
    { encoding: 'utf8' },
  )
  if (mergeRes.status !== 0) {
    spawnSync('git', ['merge', '--abort'], { stdio: 'ignore' })
    console.error(`Merge conflict syncing ${latestTag}; aborted cleanly.\n${mergeRes.stderr || mergeRes.stdout}`)
    process.exit(3)
  }

  const verifyRes = spawnSync('sh', ['-lc', verifyCmd], { encoding: 'utf8', stdio: 'inherit' })
  if (verifyRes.status !== 0) {
    git(['reset', '--hard', backupBranch])
    console.error(`Verification failed after merging ${latestTag}; rolled back to ${backupBranch}.`)
    process.exit(4)
  }

  if (push) {
    git(['push', 'origin', 'main'], { stdio: 'inherit' })
  }

  console.log(
    JSON.stringify(
      {
        status: push ? 'SYNCED_AND_PUSHED' : 'SYNCED_LOCAL',
        latestStableTag: latestTag,
        backupBranch,
        head: git(['rev-parse', '--short', 'HEAD']),
      },
      null,
      2,
    ),
  )
}

main()
