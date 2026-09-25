import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const REQUIRED_FILES = [
  'discovery.md',
  'research.md',
  'plan.md',
  'progress.md',
  'PERSONAL_AI_COMMAND_CENTER_PRD.md',
  'STUDENT_DECISIONS.md',
  'RELEASE_CHECKLIST.md',
  '.nvmrc',
  '.gitignore',
  '.github/workflows/secrets.yml',
];

test('contains every required project file', () => {
  for (const f of REQUIRED_FILES) {
    assert.ok(existsSync(join(root, f)), `missing required file: ${f}`);
  }
});

test('project memory files are not empty', () => {
  for (const f of ['discovery.md', 'research.md', 'plan.md', 'progress.md']) {
    assert.ok(statSync(join(root, f)).size > 200, `${f} is empty or a stub`);
  }
});

test('discovery.md carries the source separation rule', () => {
  const text = read('discovery.md');
  assert.match(
    text,
    /must not read, import, copy, translate, reconstruct, or paraphrase any private command center source/i,
  );
});

test('discovery.md records host OS, installed providers and the first release definition', () => {
  const text = read('discovery.md');
  assert.match(text, /macOS/);
  assert.match(text, /Claude Code/);
  assert.match(text, /first release/i);
});

test('research.md records installed Node.js and provider versions', () => {
  const text = read('research.md');
  assert.match(text, /Node\.js\s+24\.\d+\.\d+/);
  assert.match(text, /Claude Code\s+\d+\.\d+\.\d+/);
});

test('node version is pinned to the recorded LTS', () => {
  assert.match(read('.nvmrc').trim(), /^24\.\d+\.\d+$/);
});

test('plan.md names exactly one current task', () => {
  const matches = read('plan.md').match(/^Current task:\s*TASK_\d{3}\s*$/gm) ?? [];
  assert.equal(matches.length, 1, 'plan.md must contain exactly one "Current task: TASK_NNN" line');
});

test('plan.md records every task 001 to 034 with a status', () => {
  const text = read('plan.md');
  for (let i = 1; i <= 34; i += 1) {
    const id = `TASK_${String(i).padStart(3, '0')}`;
    assert.match(text, new RegExp(`\\|\\s*${id}\\s*\\|`), `plan.md is missing ${id}`);
  }
});

test('excluded tasks are recorded as not_applicable with a governing decision', () => {
  const text = read('plan.md');
  for (const id of ['TASK_033', 'TASK_034']) {
    const row = text.split('\n').find((l) => l.includes(`| ${id} |`));
    assert.ok(row && row.includes('not_applicable'), `${id} must be not_applicable`);
    assert.match(row, /STUDENT_DECISIONS/, `${id} must cite the governing decision`);
  }
});

test('plan.md records the owner gates and open items that stop the build', () => {
  const text = read('plan.md');
  assert.match(text, /^## Owner gates$/m);
  assert.match(text, /^## Open items$/m);
  for (const gate of [/device pairing design/i, /public hostname/i, /second provider/i, /tmux/i]) {
    assert.match(text, gate, `plan.md owner gates must mention ${String(gate)}`);
  }
});

test('research.md records environment notes and known follow-ups', () => {
  const text = read('research.md');
  assert.match(text, /^## Environment notes$/m);
  assert.match(text, /^## Follow-ups and known gaps$/m);
  // The phrase is kept on purpose. research.md no longer poses branch
  // protection as an open question, it records the decision — but the topic
  // itself still has to be findable here, because the ruleset is not created
  // yet and the reason why is written down in that entry.
  assert.match(text, /branch protection/i);
  assert.match(text, /nvm use/);
});

test('no stale reference to a handoff document remains', () => {
  for (const f of ['plan.md', 'research.md', 'discovery.md']) {
    assert.doesNotMatch(read(f), /HANDOFF\.md/, `${f} still references HANDOFF.md`);
  }
});

test('memory files contain no stray literal backslash-n from a scripted edit', () => {
  for (const f of ['discovery.md', 'research.md', 'plan.md', 'progress.md']) {
    assert.doesNotMatch(read(f), /\\n/, `${f} contains a literal backslash-n sequence`);
  }
});

test('plan.md tells a returning session where to resume', () => {
  const text = read('plan.md');
  assert.match(text, /^## Next steps \(resume here\)$/m);
  const section = text.split(/^## Next steps \(resume here\)$/m)[1]?.split(/^## /m)[0] ?? '';
  const current = text.match(/^Current task:\s*(TASK_\d{3})\s*$/m)?.[1];
  assert.ok(current, 'plan.md has no current task');
  assert.ok(section.includes(current), `the resume section must mention ${current}`);
  // Pin the durable property, not one question's wording. An earlier version of
  // this test asserted the resume section still mentioned "branch protection",
  // which pinned an OPEN question — so answering it would have turned the test
  // red. A resume section has to carry decisions and their dates; which
  // decisions those are changes every time one is made.
  assert.match(
    section,
    /Decided \d{4}-\d{2}-\d{2}/,
    'the resume section must record decisions with the date they were made',
  );
});

test('research.md does not claim stacked pull requests retarget automatically', () => {
  const text = read('research.md');
  assert.doesNotMatch(text, /(?<!not )retarget automatically/i, 'the false positive claim is back');
  assert.match(text, /gh pr edit <child> --base main/, 'the correct remedy must be written down');
  assert.match(
    text.split(/^## Failed approaches$/m)[1] ?? '',
    /stacked pull request/i,
    'the mistake must also be recorded under Failed approaches',
  );
});

test('progress.md has a dated entry', () => {
  assert.match(read('progress.md'), /^##\s+\d{4}-\d{2}-\d{2}/m);
});

test('a secrets scanner runs in CI', () => {
  const wf = read('.github/workflows/secrets.yml');
  assert.match(wf, /gitleaks/i);
});

const workflowFiles = () =>
  readdirSync(join(root, '.github/workflows'))
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => `.github/workflows/${f}`);

test('every workflow file exists and is discovered, not hard-coded', () => {
  const files = workflowFiles();
  assert.ok(files.length >= 1, 'there must be at least one workflow');
  assert.ok(
    files.includes('.github/workflows/secrets.yml'),
    'the secrets workflow must still be there',
  );
});

test('every workflow keeps its token read-only, at the top level and in every job', () => {
  for (const file of workflowFiles()) {
    const wf = read(file);
    assert.match(
      wf,
      /^permissions:\n {2}contents:\s*read$/m,
      `${file} must declare a read-only top-level permissions block`,
    );
    // Deliberately stricter than least privilege, not equal to it. A job-level
    // block that only NARROWS scope is GitHub's own recommendation and would be
    // rejected here too. The blanket ban is the cheap, unambiguous rule while
    // no job needs a scope; when one genuinely does — TASK_023 and TASK_024 may
    // want a write scope or OIDC id-token: write — relax this assertion to
    // allow that specific job and scope rather than dropping the guard.
    assert.doesNotMatch(wf, /:\s*write\b/, `${file} grants a write scope somewhere`);
    assert.doesNotMatch(
      wf,
      /^ {4}permissions:/m,
      `${file} sets a job-level permissions block, which can widen the top-level one`,
    );
  }
});

test('no workflow contains a credential literal', () => {
  const CREDENTIAL = /(?:ghp_|github_pat_|gho_|AKIA|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
  for (const file of workflowFiles()) {
    assert.doesNotMatch(read(file), CREDENTIAL, `${file} contains a credential literal`);
    assert.doesNotMatch(
      read(file),
      /\b[A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY)\s*:\s*['"]?[A-Za-z0-9_\-]{16,}/,
      `${file} assigns a hard-coded credential value`,
    );
  }
});

test('every action in every workflow is pinned to a commit SHA, not a tag', () => {
  for (const file of workflowFiles()) {
    for (const [, rawRef] of read(file).matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)/gm)) {
      const ref = rawRef.replace(/^['"]|['"]$/g, '');
      const isPinnable =
        !ref.startsWith('./') && !ref.startsWith('../') && !ref.startsWith('docker://');
      if (!isPinnable) continue;
      assert.match(
        ref,
        /@[0-9a-f]{40}$/,
        `${file} uses ${ref}, which is a moving tag; pin it to a 40-character commit SHA`,
      );
    }
  }
});

test('CI does not use the gitleaks action, whose commit range can be empty', () => {
  assert.doesNotMatch(
    read('.github/workflows/secrets.yml'),
    /gitleaks\/gitleaks-action/,
    'the action scans a commit range that is empty after a merge-commit merge, yet reports success',
  );
});

test('CI installs a pinned gitleaks and verifies its checksum before running it', () => {
  const wf = read('.github/workflows/secrets.yml');
  const version = wf.match(/GITLEAKS_VERSION:\s*(\d+\.\d+\.\d+)/)?.[1];
  assert.ok(version, 'workflow must pin GITLEAKS_VERSION');
  assert.match(wf, /GITLEAKS_LINUX_X64_SHA256:\s*[0-9a-f]{64}\b/);
  assert.match(wf, /sha256sum --check --strict/);
  const recorded = read('research.md').match(/gitleaks (\d+\.\d+\.\d+)/)?.[1];
  assert.equal(version, recorded, 'CI must use the same gitleaks version research.md records');
});

test('CI scans the full working tree and the full history with the local scripts', () => {
  const wf = read('.github/workflows/secrets.yml');
  assert.match(wf, /fetch-depth:\s*0/, 'history scan needs the full clone');
  assert.match(wf, /run:\s*npm run scan:secrets$/m);
  assert.match(wf, /run:\s*npm run scan:secrets:history$/m);
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.equal(scripts['scan:secrets'], 'gitleaks dir . --no-banner --redact');
  assert.equal(scripts['scan:secrets:history'], 'node scripts/scan-history.mjs');
});

test('the gitleaks install step runs before the tests that need it', () => {
  const wf = read('.github/workflows/secrets.yml');
  const install = wf.indexOf('Install gitleaks');
  const tests = wf.indexOf('npm run test:repo');
  assert.ok(install >= 0, 'workflow must have an "Install gitleaks" step');
  assert.ok(tests >= 0, 'workflow must run npm run test:repo');
  assert.ok(install < tests, 'gitleaks must be installed before the tests that call it');
});

test('CI runs the same npm scripts a developer runs locally', () => {
  const wf = read('.github/workflows/secrets.yml');
  assert.match(wf, /run:\s*npm run test:repo/);
  assert.match(wf, /run:\s*npm run scan:source/);
  assert.doesNotMatch(wf, /node --test/, 'call npm run test:repo so CI and local cannot diverge');
});

test('CI push trigger is limited to main so branch pushes do not run twice', () => {
  const wf = read('.github/workflows/secrets.yml');
  assert.match(wf, /push:\n\s+branches:\s*\[main\]/);
  assert.match(wf, /pull_request:/);
});

test('local-only files are gitignored', () => {
  const ignore = read('.gitignore');
  for (const entry of ['node_modules', '.env', '.source-protection-denylist']) {
    assert.ok(
      ignore.split('\n').includes(entry) || ignore.includes(`${entry}\n`),
      `.gitignore must list ${entry}`,
    );
  }
});

function timeoutForProject(config, projectName) {
  const nameIndex = config.search(new RegExp(`name:\\s*'${projectName}'`));
  assert.ok(nameIndex >= 0, `a project named ${projectName} must exist`);
  const match = config.slice(nameIndex).match(/testTimeout:\s*([\d_]+)/);
  assert.ok(match, `testTimeout must be set for the ${projectName} project`);
  return Number(match[1].replace(/_/g, ''));
}

test('unit and integration tests are separate Vitest projects with separate timeouts', () => {
  const config = read('vitest.config.ts');
  assert.match(config, /name:\s*'unit'/, 'a project named unit must exist');
  assert.match(config, /name:\s*'integration'/, 'a project named integration must exist');

  const scripts = JSON.parse(read('package.json')).scripts;
  assert.equal(scripts.test, 'vitest run --project unit');
  assert.equal(scripts['test:integration'], 'vitest run --project integration');
  assert.match(
    scripts['test:coverage'],
    /--coverage/,
    'test:coverage must actually collect coverage',
  );

  const unitTimeout = timeoutForProject(config, 'unit');
  const integrationTimeout = timeoutForProject(config, 'integration');
  assert.ok(
    unitTimeout <= 10_000,
    `unit project testTimeout must be at most 10000, found ${unitTimeout}`,
  );
  assert.ok(
    integrationTimeout >= 60_000,
    `integration project testTimeout must be at least 60000, found ${integrationTimeout}`,
  );
  assert.notEqual(
    unitTimeout,
    integrationTimeout,
    'unit and integration testTimeout values must differ',
  );
});

test('coverage thresholds are set and cannot silently drop', () => {
  const config = read('vitest.config.ts');
  const thresholds = config.match(/thresholds:\s*\{[^}]*\}/s)?.[0];
  assert.ok(thresholds, 'coverage.thresholds must be configured');
  for (const metric of ['lines', 'functions', 'branches', 'statements']) {
    const value = Number(thresholds.match(new RegExp(`${metric}:\\s*(\\d+)`))?.[1]);
    assert.ok(value >= 80, `${metric} coverage threshold must be at least 80, found ${value}`);
  }
});

test('the browser smoke test retains screenshots and traces on failure', () => {
  assert.ok(existsSync(join(root, 'playwright.config.ts')), 'playwright.config.ts must exist');
  const config = read('playwright.config.ts');
  assert.match(config, /screenshot:\s*'only-on-failure'/, 'failures must keep a screenshot');
  assert.match(config, /trace:\s*'retain-on-failure'/, 'failures must keep a trace');
  assert.match(config, /video:\s*'retain-on-failure'/, 'failures must keep a video');

  const scripts = JSON.parse(read('package.json')).scripts;
  assert.equal(scripts['test:e2e'], 'playwright test');
  assert.ok(existsSync(join(root, 'tests/e2e/smoke.spec.ts')), 'a smoke spec must exist');

  const ignore = read('.gitignore').split('\n');
  for (const entry of ['playwright-report', 'test-results']) {
    assert.ok(ignore.includes(entry), `${entry} must be gitignored, never committed`);
  }
});

const VALIDATE_STEPS = [
  'format:check',
  'lint',
  'typecheck',
  'test:repo',
  'test:coverage',
  'test:integration',
  'build',
  'test:e2e',
  'scan:source',
  'scan:secrets',
  'scan:secrets:history',
];

test('one command runs the complete local validation', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.ok(scripts.validate, 'a validate script must exist');
  for (const step of VALIDATE_STEPS) {
    assert.ok(scripts[step], `validate refers to ${step}, which must itself be a script`);
    assert.match(
      scripts.validate,
      new RegExp(`\\bnpm run ${step}\\b`),
      `validate must run ${step}`,
    );
  }
});

test('validate runs the cheap checks before the expensive ones', () => {
  const validate = JSON.parse(read('package.json')).scripts.validate;
  const at = (step) => validate.indexOf(`npm run ${step}`);
  assert.ok(at('format:check') < at('typecheck'), 'format check is cheapest, it goes first');
  assert.ok(
    at('typecheck') < at('lint'),
    'type-check must run before lint: type-aware lint rules resolve cross-workspace imports ' +
      'through project-reference declaration files that only tsc -b emits, so on a clean ' +
      'tree (no leftover dist/ from a prior build) linting before type-checking makes those ' +
      'imports resolve to any and trips the unsafe-* and restrict-template-expressions rules',
  );
  assert.ok(at('typecheck') < at('test:coverage'), 'type-check before unit tests');
});

const STEP_PATTERN = /npm run [\w:-]+/g;

function validateSteps(validate) {
  return [...validate.matchAll(STEP_PATTERN)];
}

test('validate joins every step with &&, so an early failure stops the run', () => {
  const validate = JSON.parse(read('package.json')).scripts.validate;
  const steps = validateSteps(validate);
  assert.equal(
    steps.length,
    VALIDATE_STEPS.length,
    `validate must contain exactly ${VALIDATE_STEPS.length} npm run steps, found ${steps.length}`,
  );
  for (let i = 0; i < steps.length - 1; i += 1) {
    const between = validate.slice(steps[i].index + steps[i][0].length, steps[i + 1].index).trim();
    assert.equal(
      between,
      '&&',
      `"${steps[i][0]}" and "${steps[i + 1][0]}" must be joined by exactly &&, found "${between}" instead: ` +
        'any other operator (such as ; or & or ||) lets an earlier failure continue instead of stopping the run, ' +
        'silently reporting later steps as green even though an earlier one failed',
    );
  }
});

test('validate has no content before the first step or after the last step', () => {
  const validate = JSON.parse(read('package.json')).scripts.validate;
  const steps = validateSteps(validate);
  const trimmed = validate.trim();
  const first = steps[0][0];
  const last = steps[steps.length - 1][0];
  assert.ok(
    trimmed.startsWith(first),
    `validate must begin with its first step ("${first}"), with nothing before it: a leading command ` +
      'would run outside the && chain, so its failure could never stop the chain',
  );
  assert.ok(
    trimmed.endsWith(last),
    `validate must end with its last step ("${last}"), with nothing after it: a trailing command ` +
      'would run outside the && chain, so it would run even after every real step, and the run could ' +
      'still exit 0 no matter what it does',
  );
});

test('validate runs build immediately before test:e2e, joined by exactly &&, with nothing else between them', () => {
  const validate = JSON.parse(read('package.json')).scripts.validate;
  const steps = validateSteps(validate);
  const buildIndex = steps.findIndex((m) => m[0] === 'npm run build');
  const e2eIndex = steps.findIndex((m) => m[0] === 'npm run test:e2e');
  assert.ok(buildIndex >= 0, 'validate must run build');
  assert.ok(e2eIndex >= 0, 'validate must run test:e2e');
  assert.equal(
    e2eIndex,
    buildIndex + 1,
    'build must be the step immediately before test:e2e, with no other npm-run step between them',
  );
  const between = validate
    .slice(steps[buildIndex].index + steps[buildIndex][0].length, steps[e2eIndex].index)
    .trim();
  assert.equal(
    between,
    '&&',
    'build and test:e2e must be joined by exactly && with nothing else between them: any command in ' +
      'between (not just another npm-run step, e.g. a bare `rm -rf apps/web/dist` or a raw ' +
      '`npx vitest run --project integration`) can still delete apps/web/dist and leave the browser test ' +
      'with nothing to serve',
  );
});

// Splits validate.yml into a map of job name -> job body, so guards below can assert
// against a single job's own text instead of the whole file. A file-wide assert.match
// is satisfied by a single occurrence anywhere, so a regression confined to one job can
// hide behind a sibling job that still does the right thing; parsing jobs closes that.
function parseWorkflowJobs(wf) {
  const jobsHeader = wf.match(/^jobs:$/m);
  assert.ok(jobsHeader, 'workflow must declare a top-level jobs: section');
  const body = wf.slice(jobsHeader.index + jobsHeader[0].length);
  const headers = [...body.matchAll(/^ {2}([\w-]+):$/gm)];
  const jobs = {};
  headers.forEach((h, i) => {
    const start = h.index + h[0].length;
    const end = i + 1 < headers.length ? headers[i + 1].index : body.length;
    jobs[h[1]] = body.slice(start, end);
  });
  return jobs;
}

// Returns every actions/upload-artifact step, tagged with the job it lives in, by
// splitting each job's body on its step markers ("      - ").
function uploadArtifactSteps(wf) {
  const jobs = parseWorkflowJobs(wf);
  const steps = [];
  for (const [jobName, jobBody] of Object.entries(jobs)) {
    for (const step of jobBody.split(/\n(?=      - )/)) {
      if (/uses:\s*actions\/upload-artifact@/.test(step)) {
        steps.push({ jobName, step });
      }
    }
  }
  return steps;
}

// Returns every value assigned to a `path:` key under an artifact upload, whether written
// on the same line (`path: coverage`) or as a multi-line block scalar (`path: |` followed
// by indented entries, the form the e2e job already uses for playwright-report/test-results).
function pathEntries(wf) {
  const entries = [];
  const lines = wf.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const header = lines[i].match(/^(\s*)path:\s*(.*)$/);
    if (!header) continue;
    const [, indent, rest] = header;
    const trimmedRest = rest.trim();
    if (trimmedRest && trimmedRest !== '|' && trimmedRest !== '>') {
      entries.push(trimmedRest);
      continue;
    }
    let j = i + 1;
    while (j < lines.length) {
      const line = lines[j];
      if (line.trim() === '') {
        j += 1;
        continue;
      }
      const lineIndent = line.match(/^(\s*)/)[1].length;
      if (lineIndent <= indent.length) break;
      entries.push(line.trim());
      j += 1;
    }
  }
  return entries;
}

test('CI runs every required step on the full validation, never caching secrets or mutable database state', () => {
  const wf = read('.github/workflows/validate.yml');
  assert.doesNotMatch(wf, /\.env|data\/|\.db\b/, 'never cache secrets or mutable database state');
  for (const step of ['format:check', 'lint', 'typecheck', 'test:coverage', 'build']) {
    assert.match(wf, new RegExp(`npm run ${step}\\b`), `CI must run ${step}`);
  }
  // test:repo belongs to the secrets workflow, which is the one that installs
  // gitleaks. Running it here too would fail on a missing binary.
  assert.match(
    read('.github/workflows/secrets.yml'),
    /npm run test:repo\b/,
    'the repo suite must still run somewhere in CI',
  );
  assert.match(wf, /npm run test:integration\b/, 'CI must run the integration project');
  assert.match(wf, /npm run test:e2e\b/, 'CI must run the browser smoke test');
  assert.match(wf, /npm ci\b/, 'CI installs from the lockfile, never npm install');
});

test('every job sets up Node from .nvmrc and caches npm dependencies', () => {
  const wf = read('.github/workflows/validate.yml');
  const jobs = parseWorkflowJobs(wf);
  for (const [name, jobBody] of Object.entries(jobs)) {
    assert.match(
      jobBody,
      /node-version-file:\s*\.nvmrc/,
      `job ${name} must read its Node version from .nvmrc, never inline`,
    );
    assert.match(
      jobBody,
      /cache:\s*npm/,
      `job ${name} must cache npm dependencies; a cache dropped from one job must not hide behind a sibling job that still has it`,
    );
  }
});

test('every artifact upload step keeps running on failure', () => {
  const wf = read('.github/workflows/validate.yml');
  const steps = uploadArtifactSteps(wf);
  assert.ok(steps.length >= 2, 'expected at least the coverage and browser-report uploads');
  for (const { jobName, step } of steps) {
    assert.match(
      step,
      /if:\s*\$\{\{\s*(?:!\s*cancelled\(\)|always\(\))\s*\}\}/,
      `the upload-artifact step in job ${jobName} must keep running on failure (if: !cancelled() or always()); an artifact is most valuable on the run that failed`,
    );
  }
});

test('the coverage and browser-report uploads pin different if-no-files-found values on purpose', () => {
  const wf = read('.github/workflows/validate.yml');
  const steps = uploadArtifactSteps(wf);
  const coverage = steps.find(({ step }) => /name:\s*coverage\b/.test(step));
  const report = steps.find(({ step }) => /name:\s*playwright-report\b/.test(step));
  const failures = steps.find(({ step }) => /name:\s*playwright-failures\b/.test(step));
  assert.ok(coverage, 'a coverage upload-artifact step must exist');
  assert.ok(report, 'a playwright-report upload-artifact step must exist');
  assert.ok(failures, 'a playwright-failures upload-artifact step must exist');

  // The report and the failure artifacts are uploaded separately because they
  // have genuinely different emptiness semantics. Bundling them forced the
  // whole upload down to `ignore`, which silently gave up the false-green
  // protection on a report that is in fact always written.
  for (const [label, step] of [
    ['coverage', coverage.step],
    ['browser report', report.step],
  ]) {
    assert.match(
      step,
      /if-no-files-found:\s*error/,
      `the ${label} upload must use if-no-files-found: error; it is written on every run, so a missing one means something went wrong — the false-green shape of bug #3`,
    );
  }
  assert.match(
    failures.step,
    /if-no-files-found:\s*ignore/,
    'test-results is the one directory that is correctly empty when nothing failed, so only it may ignore a missing path',
  );
});

test('CI retains coverage and browser failure artifacts', () => {
  const wf = read('.github/workflows/validate.yml');
  assert.match(wf, /actions\/upload-artifact@[0-9a-f]{40}/, 'artifacts are uploaded');
  assert.match(wf, /coverage/, 'coverage must be retained');
  assert.match(wf, /playwright-report/, 'the browser report must be retained');
  assert.match(wf, /test-results/, 'screenshots, traces and videos must be retained');
});

// This is a two-file coupling on purpose: the branch-protection ruleset on
// main requires the checks by the literal names "validate" and "e2e", so
// renaming a job here silently stops a required check from ever reporting and
// blocks every merge. Adding a job is a two-file change for the same reason —
// decide whether the ruleset should require it, then update both.
test('the required check names the ruleset depends on do not drift', () => {
  const wf = read('.github/workflows/validate.yml');
  const jobs = parseWorkflowJobs(wf);
  assert.deepEqual(
    Object.keys(jobs).sort(),
    ['e2e', 'validate'],
    'the workflow must define exactly the jobs validate and e2e, no more, no fewer, so a rename or an added job cannot go unnoticed',
  );
});

test('a dist cache is never keyed without its build info', () => {
  const wf = read('.github/workflows/validate.yml');
  const distEntries = pathEntries(wf).filter((entry) => /\bdist\b/.test(entry));
  if (distEntries.length > 0) {
    assert.match(wf, /tsbuildinfo/, 'caching dist without its .tsbuildinfo causes stale builds');
  }
});
