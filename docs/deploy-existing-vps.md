# Deploy an update to the existing Axon VPS

The existing installation serves the web app at `https://app.axon.af` and the API at `https://api.axon.af`. Use PowerShell for the first block and the VPS root shell for the remaining blocks. Each comment explains the command immediately below it.

## 1. Push the release and connect

```powershell
# From the local REDMARS repository, show the branch and any uncommitted work.
git status --short --branch
# Review the commits queued for GitHub.
git log --oneline origin/redmars-v2..redmars-v2
# Publish the committed release.
git push origin redmars-v2
# Copy this full commit ID if you want to deploy a specific version.
git rev-parse redmars-v2
# Open the existing VPS with the local deployment key.
ssh -i "$env:USERPROFILE/.ssh/bluehost_rsa" root@129.121.171.221
```

## 2. Deploy on the VPS

Paste the entire block. It builds the fetched tip of `redmars-v2`. To pin a release, replace `origin/redmars-v2` on the `target=` line with the commit ID you reviewed. The parentheses keep error handling inside this operation, so a failed command leaves your SSH session open.

```bash
(
  # Stop this deployment when a command or pipeline fails.
  set -euo pipefail
  # Enter the existing source checkout.
  cd /opt/redmars/app
  # Check that this checkout is on the deployment branch.
  test "$(git branch --show-current)" = redmars-v2
  # Stop if local changes would be included in the image.
  test -z "$(git status --porcelain)"
  # Retrieve the latest published release.
  git fetch origin redmars-v2
  # Resolve the release once, so the build and health checks refer to the same commit.
  target=$(git rev-parse origin/redmars-v2)
  # Confirm the target belongs to the published branch and can be fast-forwarded.
  git merge-base --is-ancestor "$target" origin/redmars-v2
  git merge-base --is-ancestor HEAD "$target"
  # Show what will ship.
  git log --oneline HEAD.."$target"
  # Record the latest backup filename before creating a new backup.
  previous=$(find /var/backups/redmars-testing -maxdepth 1 -name '*.dump' -printf '%f\n' | sort | tail -1)
  # Run the installed backup helper directly.
  bash /opt/redmars-testing/backup-testing.sh
  # Find the new dump and confirm this run produced it.
  latest=$(find /var/backups/redmars-testing -maxdepth 1 -name '*.dump' -printf '%f\n' | sort | tail -1)
  test -n "$latest" && test "$latest" != "$previous" || { echo 'Fresh backup not confirmed'; exit 1; }
  # Verify the dump against its checksum.
  (cd /var/backups/redmars-testing && sha256sum -c "$latest.sha256")
  # Advance the checked-out source to the reviewed commit.
  git merge --ff-only "$target"
  # Use the short commit ID as the Docker image tag.
  tag=$(git rev-parse --short HEAD)
  # Build both images while the previous release is still serving.
  RELEASE_TAG="$tag" redmars-test build api web
  # Confirm the installed configuration has a release setting.
  grep -q '^RELEASE_TAG=' /etc/redmars-testing/stack.env
  # Select the newly built images for this installation.
  sed -i "s/^RELEASE_TAG=.*/RELEASE_TAG=$tag/" /etc/redmars-testing/stack.env
  # Recreate the API and web containers and wait for readiness. API startup applies pending migrations.
  redmars-test up -d --no-deps --force-recreate --wait api web
  # Display container status and release image tags.
  redmars-test ps
  # Verify the public API through HTTPS.
  curl -fsS --retry 8 --retry-all-errors --retry-delay 3 https://api.axon.af/health
  # Verify that the public login page loads.
  curl -fsS --retry 8 --retry-all-errors -o /dev/null -w '\nLogin HTTP %{http_code}\n' https://app.axon.af/login
)
```

Expect the API to be healthy, both image tags to match the short commit ID, and the login check to print `200`. If a check fails, inspect `redmars-test ps` and `redmars-test logs --tail=80 api web` before retrying. A backup and a Git pull alone do not replace the running images.

## 3. Load diagnosis codes for the catalog release

Run this once when introducing the complete WHO ICD-10 catalog. Repeat runs preserve local translations and existing patient diagnoses.

```bash
(
  # Stop if either the download/import generator or PostgreSQL fails.
  set -euo pipefail
  # Use the importer from the deployed release.
  cd /opt/redmars/app
  # Download and verify the pinned WHO archive, then apply the catalog update in one database transaction.
  python3 scripts/import-who-icd10.py | redmars-test exec -T postgres sh -c 'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
)
```

Expect `who_codes_present` to equal **12,221**, followed by `COMMIT`. To check the clinician workflow, open **ICD Lookup**, search for **F32.1**, then clear the search and select **Next**.
