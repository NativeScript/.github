import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

import {
	applyIndividualClaSigningComment,
	applyIndividualClaSigningComments,
	checkClaIdentities,
	individualClaSigningPhrase,
	isIndividualClaSigningComment,
	mergeClaSignersFiles,
	parseClaSignersFile,
	pickClaRerunCandidate,
	runCli,
	serializeClaSignersFile,
	shouldRunClaCheckJob,
} from './check-cla.mjs';

const require = createRequire(import.meta.url);
const {
	isRetryableGithubApiError,
	withGithubApiRetry,
} = require('./github-api-retry.cjs');

function makeBaseSigners() {
	return {
		version: 1,
		document: 'docs/legal/individual-cla.md',
		allowlist: {
			github: ['NathanWalker', 'nativescript-oss'],
			email: ['noreply@anthropic.com'],
		},
		signers: [
			{
				github: 'ExistingContributor',
				signedAt: '2026-01-15',
				cla: 'individual',
			},
		],
	};
}

test('matches exact signing comment with optional surrounding whitespace only', () => {
	assert.equal(isIndividualClaSigningComment(individualClaSigningPhrase), true);
	assert.equal(
		isIndividualClaSigningComment(`  \n${individualClaSigningPhrase}\n `),
		true,
	);
	assert.equal(
		isIndividualClaSigningComment('I hereby sign the CLA'),
		false,
	);
	assert.equal(
		isIndividualClaSigningComment(`${individualClaSigningPhrase}.`),
		false,
	);
});

test('allows bots, app/*, allowlisted logins/emails, and existing signers case-insensitively', () => {
	const file = makeBaseSigners();
	const res = checkClaIdentities(
		[
			{ githubLogin: 'nathanwalker', name: 'Nathan', email: null },
			{ githubLogin: 'dependabot[bot]', name: 'dependabot', email: null },
			{ githubLogin: 'app/dependabot', name: 'dependabot', email: null },
			{ githubLogin: null, name: 'Claude', email: 'NOREPLY@anthropic.com' },
			{ githubLogin: 'existingcontributor', name: 'EC', email: null },
		],
		file,
	);
	assert.deepEqual(res, { ok: true });
});

test('fails unsigned contributors and bystander comments do not sign for PR author', () => {
	const base = makeBaseSigners();
	const withBystander = applyIndividualClaSigningComments(base, [
		{
			login: 'RandomBystander',
			createdAt: '2026-11-22T18:00:00Z',
			body: individualClaSigningPhrase,
		},
	]).file;

	const res = checkClaIdentities(
		[{ githubLogin: 'NewContributor', name: 'New', email: 'new@example.com' }],
		withBystander,
	);
	assert.equal(res.ok, false);
	assert.equal(res.missing.length, 1);
	assert.match(res.missing[0].reason, /@NewContributor has not signed the CLA/);
});

test('passes when unsigned contributor posts exact signing comment', () => {
	const base = makeBaseSigners();
	const afterSign = applyIndividualClaSigningComments(base, [
		{
			login: 'NewContributor',
			createdAt: '2026-11-22T18:50:35Z',
			body: individualClaSigningPhrase,
		},
	]);
	assert.deepEqual(afterSign.recorded, ['NewContributor']);
	const res = checkClaIdentities(
		[{ githubLogin: 'newcontributor', name: 'New', email: null }],
		afterSign.file,
	);
	assert.deepEqual(res, { ok: true });
});

test('provides actionable diagnostics when commit has no linked GitHub login', () => {
	const base = makeBaseSigners();
	const res = checkClaIdentities(
		[{ githubLogin: null, name: 'Local Dev', email: 'dev@local.invalid' }],
		base,
	);
	assert.equal(res.ok, false);
	assert.match(
		res.missing[0].reason,
		/Local Dev <dev@local\.invalid>.*https:\/\/github\.com\/settings\/emails/,
	);
});

test('merges org and repo-local signers without duplicates and skips known signers on record', () => {
	const org = makeBaseSigners();
	const local = {
		version: 1,
		document: 'docs/legal/individual-cla.md',
		allowlist: { github: ['nathanwalker', 'ExtraMaintainer'], email: [] },
		signers: [
			{ github: 'existingcontributor', signedAt: '2026-02-01', cla: 'individual' },
			{ github: 'RepoLocalSigner', signedAt: '2026-11-22', cla: 'individual' },
		],
	};

	const merged = mergeClaSignersFiles(org, local);
	assert.equal(merged.allowlist.github.length, 3);
	assert.equal(merged.signers.length, 2);
	assert.deepEqual(
		checkClaIdentities(
			[{ githubLogin: 'repolocalsigner', name: null, email: null }],
			merged,
		),
		{ ok: true },
	);

	// Recording someone already in org signers against an empty repo-local file skips adding
	const emptyLocal = {
		version: 1,
		document: 'docs/legal/individual-cla.md',
		allowlist: { github: [], email: [] },
		signers: [],
	};
	const skipRes = applyIndividualClaSigningComment({
		file: emptyLocal,
		knownSignersFile: org,
		github: 'ExistingContributor',
		signedAt: '2026-11-22',
		comment: individualClaSigningPhrase,
	});
	assert.equal(skipRes.status, 'already_signed');
	assert.equal(skipRes.file.signers.length, 0);
});

test('CLI check and record modes write expected files and exit codes', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'ns-cla-test-'));
	try {
		const signersPath = join(dir, 'cla-signers.json');
		const identitiesPath = join(dir, 'identities.json');
		const commentsPath = join(dir, 'comments.json');
		const missingPath = join(dir, 'missing.json');

		await writeFile(signersPath, serializeClaSignersFile(makeBaseSigners()), 'utf8');
		await writeFile(
			identitiesPath,
			JSON.stringify([{ githubLogin: 'AliceDev', name: 'Alice', email: null }]),
			'utf8',
		);
		await writeFile(commentsPath, '[]', 'utf8');

		const prevCode = process.exitCode;
		process.exitCode = 0;
		await runCli([
			'--signers',
			signersPath,
			'--identities-json',
			identitiesPath,
			'--signing-comments-json',
			commentsPath,
			'--missing-json',
			missingPath,
		]);
		assert.equal(process.exitCode, 1);
		process.exitCode = prevCode;

		const missing = JSON.parse(await readFile(missingPath, 'utf8'));
		assert.equal(missing.length, 1);

		// Now sign via comment and record
		await writeFile(
			commentsPath,
			JSON.stringify([
				{
					login: 'AliceDev',
					createdAt: '2026-11-22T19:00:00Z',
					body: individualClaSigningPhrase,
				},
			]),
			'utf8',
		);
		await runCli([
			'--signers',
			signersPath,
			'--record-comments-json',
			commentsPath,
		]);
		const updated = parseClaSignersFile(await readFile(signersPath, 'utf8'));
		assert.equal(
			updated.signers.some((s) => s.github === 'AliceDev'),
			true,
		);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('workflow event helpers and retry helper behave deterministically', async () => {
	assert.equal(
		shouldRunClaCheckJob({ eventName: 'pull_request_target', action: 'opened' }),
		true,
	);
	assert.equal(
		shouldRunClaCheckJob({ eventName: 'pull_request_target', action: 'closed' }),
		false,
	);
	assert.deepEqual(
		pickClaRerunCandidate([
			{ id: 1, event: 'pull_request_target', status: 'completed', conclusion: 'skipped' },
			{ id: 2, event: 'pull_request_target', status: 'completed', conclusion: 'failure' },
		]),
		{ id: 2, event: 'pull_request_target', status: 'completed', conclusion: 'failure' },
	);

	let attempts = 0;
	const value = await withGithubApiRetry(
		async () => {
			attempts += 1;
			if (attempts < 3) {
				const err = new Error('Bad Gateway');
				err.status = 502;
				throw err;
			}
			return 'ok';
		},
		{ maxAttempts: 4, baseDelayMs: 1 },
	);
	assert.equal(value, 'ok');
	assert.equal(attempts, 3);
	assert.equal(isRetryableGithubApiError({ status: 404 }), false);
});
