import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const individualClaSigningPhrase =
	'I have read the CLA and I hereby sign the CLA';

const githubBotLoginPattern = /\[bot\]$/i;

export function normalize(value) {
	return String(value).trim().toLowerCase();
}

function identityLabel(identity) {
	if (identity.githubLogin) {
		return `@${identity.githubLogin}`;
	}
	if (identity.name && identity.email) {
		return `${identity.name} <${identity.email}>`;
	}
	if (identity.email) {
		return identity.email;
	}
	if (identity.name) {
		return identity.name;
	}
	return 'unknown identity';
}

export function parseClaSignersFile(raw) {
	const parsed = JSON.parse(raw);
	if (
		typeof parsed !== 'object' ||
		parsed === null ||
		!('version' in parsed) ||
		parsed.version !== 1
	) {
		throw new Error('CLA signers file must be version 1 JSON');
	}

	if (
		typeof parsed.document !== 'string' ||
		typeof parsed.allowlist !== 'object' ||
		parsed.allowlist === null ||
		!Array.isArray(parsed.allowlist.github) ||
		!Array.isArray(parsed.allowlist.email) ||
		!Array.isArray(parsed.signers)
	) {
		throw new Error('CLA signers file is missing allowlist or signers');
	}

	return parsed;
}

export function serializeClaSignersFile(file) {
	return `${JSON.stringify(file, null, '\t')}\n`;
}

export function mergeClaSignersFiles(primary, extra) {
	if (!extra) return primary;

	const seenGithubAllow = new Set(primary.allowlist.github.map(normalize));
	const allowGithub = [...primary.allowlist.github];
	for (const login of extra.allowlist.github) {
		const key = normalize(login);
		if (key && !seenGithubAllow.has(key)) {
			seenGithubAllow.add(key);
			allowGithub.push(login);
		}
	}

	const seenEmailAllow = new Set(primary.allowlist.email.map(normalize));
	const allowEmail = [...primary.allowlist.email];
	for (const email of extra.allowlist.email) {
		const key = normalize(email);
		if (key && !seenEmailAllow.has(key)) {
			seenEmailAllow.add(key);
			allowEmail.push(email);
		}
	}

	const seenSigners = new Set(primary.signers.map((s) => normalize(s.github)));
	const signers = [...primary.signers];
	for (const signer of extra.signers) {
		const key = normalize(signer.github);
		if (key && !seenSigners.has(key)) {
			seenSigners.add(key);
			signers.push(signer);
		}
	}

	return {
		...primary,
		allowlist: {
			github: allowGithub,
			email: allowEmail,
		},
		signers,
	};
}

export function isIndividualClaSigningComment(body) {
	return typeof body === 'string' && body.trim() === individualClaSigningPhrase;
}

export function applyIndividualClaSigningComment(input) {
	if (!isIndividualClaSigningComment(input.comment)) {
		return {
			file: input.file,
			status: 'ignored',
			reason: 'not_signing_comment',
		};
	}

	const login = String(input.github ?? '').trim();
	if (!login) {
		return { file: input.file, status: 'ignored', reason: 'missing_login' };
	}

	const normalizedLogin = normalize(login);
	if (
		input.file.signers.some((signer) => normalize(signer.github) === normalizedLogin) ||
		input.file.allowlist.github.some((entry) => normalize(entry) === normalizedLogin) ||
		(input.knownSignersFile &&
			(input.knownSignersFile.signers.some(
				(signer) => normalize(signer.github) === normalizedLogin,
			) ||
				input.knownSignersFile.allowlist.github.some(
					(entry) => normalize(entry) === normalizedLogin,
				)))
	) {
		return { file: input.file, status: 'already_signed', github: login };
	}

	return {
		file: {
			...input.file,
			signers: [
				...input.file.signers,
				{
					github: login,
					signedAt: input.signedAt,
					cla: 'individual',
				},
			],
		},
		status: 'recorded',
		github: login,
	};
}

export function applyIndividualClaSigningComments(
	file,
	comments,
	knownSignersFile = null,
) {
	let updated = file;
	const recorded = [];
	const recordedLogins = new Set();

	for (const comment of comments) {
		const signedAt =
			typeof comment.createdAt === 'string' && comment.createdAt.length >= 10
				? comment.createdAt.slice(0, 10)
				: new Date().toISOString().slice(0, 10);
		const result = applyIndividualClaSigningComment({
			file: updated,
			knownSignersFile,
			github: comment.login,
			signedAt,
			comment: comment.body,
		});
		updated = result.file;
		if (result.status !== 'recorded') {
			continue;
		}

		const login = normalize(result.github);
		if (recordedLogins.has(login)) {
			continue;
		}
		recordedLogins.add(login);
		recorded.push(result.github);
	}

	return { file: updated, recorded };
}

export function isAllowlistedIdentity(identity, signersFile) {
	const login = identity.githubLogin ? normalize(identity.githubLogin) : null;
	if (
		login &&
		(githubBotLoginPattern.test(login) || login.startsWith('app/'))
	) {
		return true;
	}
	if (
		login &&
		signersFile.allowlist.github.some((entry) => normalize(entry) === login)
	) {
		return true;
	}

	const email = identity.email ? normalize(identity.email) : null;
	return Boolean(
		email &&
			signersFile.allowlist.email.some((entry) => normalize(entry) === email),
	);
}

export function hasSignedCla(identity, signersFile) {
	const login = identity.githubLogin ? normalize(identity.githubLogin) : null;
	if (!login) {
		return false;
	}

	return signersFile.signers.some(
		(signer) => normalize(signer.github) === login,
	);
}

export function checkClaIdentities(identities, signersFile) {
	const missing = [];
	const seen = new Set();

	for (const identity of identities) {
		const key = [identity.githubLogin, identity.email, identity.name]
			.map((part) => (part ? normalize(part) : ''))
			.join('|');
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);

		if (isAllowlistedIdentity(identity, signersFile)) {
			continue;
		}
		if (hasSignedCla(identity, signersFile)) {
			continue;
		}

		const reason = identity.githubLogin
			? `${identityLabel(identity)} has not signed the CLA`
			: `Commit author \`${identityLabel(identity)}\` is not linked to a GitHub account (add this email at https://github.com/settings/emails or amend the commit author, then sign the CLA)`;
		missing.push({ identity, reason });
	}

	return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

export function formatClaFailure(result) {
	const lines = [
		'Unsigned contributions cannot merge.',
		'Read https://github.com/NativeScript/.github/blob/master/docs/legal/individual-cla.md (or corporate-cla.md if an organization owns the work).',
		`Comment on the pull request: ${individualClaSigningPhrase}`,
		'That signing comment satisfies this check across all NativeScript repositories.',
		'The signer is recorded on the cla-signatures branch after the pull request merges.',
		'',
		'Missing CLA status:',
		...result.missing.map((entry) => `- ${entry.reason}`),
	];
	return lines.join('\n');
}

export function shouldRunClaCheckJob(input) {
	return input.eventName === 'pull_request_target' && input.action !== 'closed';
}

export function pickClaRerunCandidate(runs) {
	for (const run of runs) {
		if (run.status !== 'completed') {
			return run;
		}
		if (run.conclusion !== 'skipped') {
			return run;
		}
	}
	return null;
}

function readFlag(args, flag) {
	const index = args.indexOf(flag);
	if (index === -1) {
		return null;
	}
	const value = args[index + 1];
	if (!value || value.startsWith('--')) {
		return null;
	}
	return value;
}

async function runRecordSingleCli(args) {
	const signersPath = readFlag(args, '--signers');
	const github = readFlag(args, '--record-signer');
	const signedAt = readFlag(args, '--signed-at');
	const commentPath = readFlag(args, '--comment-file');

	if (!signersPath || !github || !signedAt || !commentPath) {
		throw new Error(
			'Usage: node scripts/check-cla.mjs --signers <file> --record-signer <login> --signed-at <YYYY-MM-DD> --comment-file <file>',
		);
	}

	const current = parseClaSignersFile(await readFile(signersPath, 'utf8'));
	const recorded = applyIndividualClaSigningComment({
		file: current,
		github,
		signedAt,
		comment: await readFile(commentPath, 'utf8'),
	});

	switch (recorded.status) {
		case 'ignored':
			console.log('skipped=true');
			console.log('added=false');
			break;
		case 'already_signed':
			console.log('skipped=false');
			console.log('added=false');
			console.log(`github=${recorded.github}`);
			break;
		case 'recorded':
			await writeFile(
				signersPath,
				serializeClaSignersFile(recorded.file),
				'utf8',
			);
			console.log('skipped=false');
			console.log('added=true');
			console.log(`github=${recorded.github}`);
			break;
		default:
			throw new Error(`Unhandled CLA record status: ${JSON.stringify(recorded)}`);
	}
}

async function runRecordCommentsCli(args) {
	const signersPath = readFlag(args, '--signers');
	const knownSignersPath = readFlag(args, '--known-signers');
	const commentsPath = readFlag(args, '--record-comments-json');
	const importSignersPath = readFlag(args, '--import-signers-json');

	if (!signersPath || (!commentsPath && !importSignersPath)) {
		throw new Error(
			'Usage: node scripts/check-cla.mjs --signers <file> [--known-signers <file>] --record-comments-json <file> [--import-signers-json <file>]',
		);
	}

	let current = parseClaSignersFile(await readFile(signersPath, 'utf8'));
	const known = knownSignersPath
		? parseClaSignersFile(await readFile(knownSignersPath, 'utf8'))
		: null;

	const recorded = [];
	const recordedLogins = new Set();

	if (commentsPath) {
		const commentsRaw = JSON.parse(await readFile(commentsPath, 'utf8'));
		if (!Array.isArray(commentsRaw)) {
			throw new Error('CLA signing comments JSON must be an array');
		}
		const commentRes = applyIndividualClaSigningComments(
			current,
			commentsRaw,
			known,
		);
		current = commentRes.file;
		for (const login of commentRes.recorded) {
			const norm = normalize(login);
			if (!recordedLogins.has(norm)) {
				recordedLogins.add(norm);
				recorded.push(login);
			}
		}
	}

	if (importSignersPath) {
		const importedRaw = JSON.parse(await readFile(importSignersPath, 'utf8'));
		if (!Array.isArray(importedRaw)) {
			throw new Error('Imported signers JSON must be an array');
		}
		for (const entry of importedRaw) {
			if (!entry || typeof entry.github !== 'string' || !entry.github.trim()) {
				continue;
			}
			const norm = normalize(entry.github);
			const existsInCurrent =
				current.signers.some((s) => normalize(s.github) === norm) ||
				current.allowlist.github.some((a) => normalize(a) === norm);
			const existsInKnown =
				known &&
				(known.signers.some((s) => normalize(s.github) === norm) ||
					known.allowlist.github.some((a) => normalize(a) === norm));
			if (existsInCurrent || existsInKnown) {
				continue;
			}
			current = {
				...current,
				signers: [
					...current.signers,
					{
						github: entry.github.trim(),
						signedAt:
							typeof entry.signedAt === 'string' && entry.signedAt.trim()
								? entry.signedAt.trim()
								: new Date().toISOString().slice(0, 10),
						cla: entry.cla === 'corporate' || entry.cla === 'entity' ? entry.cla : 'individual',
					},
				],
			};
			if (!recordedLogins.has(norm)) {
				recordedLogins.add(norm);
				recorded.push(entry.github.trim());
			}
		}
	}

	if (recorded.length > 0) {
		await writeFile(signersPath, serializeClaSignersFile(current), 'utf8');
	}

	console.log(`added=${recorded.length > 0}`);
	console.log(`github=${recorded.join(',')}`);
}

async function runCheckCli(args) {
	const signersPath = readFlag(args, '--signers');
	const extraSignersPath = readFlag(args, '--extra-signers');
	const identitiesPath = readFlag(args, '--identities-json');
	const signingCommentsPath = readFlag(args, '--signing-comments-json');
	const missingJsonPath = readFlag(args, '--missing-json');

	if (
		!signersPath ||
		!identitiesPath ||
		(args.includes('--signing-comments-json') && !signingCommentsPath)
	) {
		throw new Error(
			'Usage: node scripts/check-cla.mjs --signers <file> [--extra-signers <file>] --identities-json <file> [--signing-comments-json <file>] [--missing-json <file>]',
		);
	}

	let signersFile = parseClaSignersFile(await readFile(signersPath, 'utf8'));
	if (extraSignersPath) {
		const extraFile = parseClaSignersFile(
			await readFile(extraSignersPath, 'utf8'),
		);
		signersFile = mergeClaSignersFiles(signersFile, extraFile);
	}

	if (signingCommentsPath) {
		const commentsRaw = JSON.parse(await readFile(signingCommentsPath, 'utf8'));
		if (!Array.isArray(commentsRaw)) {
			throw new Error('CLA signing comments JSON must be an array');
		}
		signersFile = applyIndividualClaSigningComments(
			signersFile,
			commentsRaw,
		).file;
	}

	const identitiesRaw = JSON.parse(await readFile(identitiesPath, 'utf8'));
	if (!Array.isArray(identitiesRaw)) {
		throw new Error('Identities JSON must be an array');
	}

	const result = checkClaIdentities(identitiesRaw, signersFile);
	if (!result.ok) {
		if (missingJsonPath) {
			await writeFile(
				missingJsonPath,
				`${JSON.stringify(result.missing, null, '\t')}\n`,
				'utf8',
			);
		}
		console.error(formatClaFailure(result));
		process.exitCode = 1;
	} else if (missingJsonPath) {
		await writeFile(missingJsonPath, '[]\n', 'utf8');
	}
}

export async function runCli(args) {
	if (
		args.includes('--record-comments-json') ||
		args.includes('--import-signers-json')
	) {
		await runRecordCommentsCli(args);
		return;
	}

	if (args.includes('--record-signer')) {
		await runRecordSingleCli(args);
		return;
	}

	await runCheckCli(args);
}

const isDirectRun =
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
	await runCli(process.argv.slice(2));
}
