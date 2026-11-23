Thanks for helping make NativeScript safe for everyone.

# Security

NativeScript takes the security of our software seriously, including all of the open source code repositories managed through our GitHub organizations, such as [NativeScript](https://github.com/NativeScript).

## Reporting Security Issues

If you believe you have found a security vulnerability in any NativeScript-owned repository, please report it to us through coordinated disclosure. Before reporting, please check your finding against the [Threat Model](#threat-model) below to confirm it is a vulnerability in NativeScript itself rather than an application, environment, or dependency concern.

**Please do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

The preferred channel is GitHub's private vulnerability reporting: open a draft security advisory on the affected NativeScript repository from its "Security" tab ("Report a vulnerability"). This routes the report privately to the maintainers and gives us per-issue tracking and a collaborator workflow. If you are unsure which repository is affected, submit the advisory on [NativeScript/NativeScript](https://github.com/NativeScript/NativeScript/security/advisories/new). If you cannot use GitHub private vulnerability reporting, email `support[@]nativescript.org` as a fallback.

Please include as much of the information listed below as you can to help us better understand and resolve the issue:

  * The type of issue (e.g., buffer overflow, SQL injection, or cross-site scripting)
  * Full paths of source file(s) related to the manifestation of the issue
  * The location of the affected source code (tag/branch/commit or direct URL)
  * Any special configuration required to reproduce the issue
  * Step-by-step instructions to reproduce the issue
  * Proof-of-concept or exploit code (if possible)
  * Impact of the issue, including how an attacker might exploit the issue

This information will help us triage your report more quickly.

## Escalation

If you do not receive an acknowledgement of your report within 6 business days, or if you cannot find a private security contact for the project, you may escalate to the OpenJS Foundation CNA at `security@lists.openjsf.org`.

If the project acknowledges your report but does not provide any further response or engagement within 14 days, escalation is also appropriate.

## Threat Model

This section defines the trusted and untrusted elements of NativeScript so that a security report can be judged consistently: is the reported behavior a vulnerability in NativeScript, or is it the responsibility of the application, the operating system, the developer's environment, or a dependency?

It covers the NativeScript organization as a whole: the CLI (`nativescript` / `ns`), the official bundlers (`@nativescript/webpack`, `@nativescript/vite`), the native runtimes (iOS, Android, macOS, visionOS), `@nativescript/core`, and the officially maintained plugins. A vulnerability that requires the compromise of a trusted element is outside the scope of this threat model.

### Scope and inheritance

NativeScript builds and runs native applications from JavaScript and TypeScript. Its defining property, stated throughout the documentation, is that application code has direct access to native platform APIs (file system, keychain, network, camera, and so on). There is no JavaScript sandbox between application code and the device: application JavaScript runs with the full privileges of the installed app.

The NativeScript CLI and official bundler packages (`@nativescript/webpack`, `@nativescript/vite`) are Node.js development-time tools. For these tools, this model inherits the [Node.js threat model](https://github.com/nodejs/node/blob/main/SECURITY.md): the operating system, the developer, and the developer's infrastructure are trusted, and a report cannot assume a trusted element has been compromised. The runtimes, `@nativescript/core`, and official plugins are not server-side Node.js, but the same principles apply, with the host operating system and its sandbox added as trusted elements.

### Trusted elements

NativeScript trusts:

- The developer and the infrastructure that build, sign, and publish the app, including the build host, CI runners, and the files and environment under the developer's control.
- The application's own JavaScript and TypeScript code and the code it chooses to run, including plugins and dependencies installed from npm. Application code runs with full native privileges by design.
- The host operating system (Android, iOS, macOS, visionOS), its sandbox and permission model, the device, and anything under the control of the operating system.
- The build toolchain (Gradle, Xcode, the Android and Apple SDKs) and the underlying JavaScript engines (V8, JavaScriptCore, Hermes, QuickJS).

### Untrusted elements

NativeScript does not trust data that reaches a running application from outside it, where NativeScript itself parses or marshals that data before the application sees it:

- Responses received over the network through NativeScript APIs.
- Deep links, app links, custom URL schemes, Android intents, and iOS universal links that launch or message the app.
- Inter-process input from other applications on the device.
- Files, archives, or other external payloads parsed or extracted by NativeScript APIs or official plugins (for example, archive extraction in `@nativescript/zip`).
- Content rendered in a WebView, where NativeScript's wrapper or bridge must not expose unintended native capabilities beyond what the application explicitly enables.
- Remotely loaded modules, which are governed by the remote-module security control described below.

If such input can make NativeScript take an action beyond those documented for its APIs, that is likely a vulnerability.

### What constitutes a vulnerability

A defect in NativeScript that an untrusted element can use to cross one of the boundaries above is in scope. Examples:

- **Bypass of the remote-module control.** NativeScript blocks remote ES module loading in production by default (`security.allowRemoteModules` defaults to `false`) and, when enabled, restricts it to configured URL prefixes if `security.remoteModuleAllowlist` is set. Because remotely loaded code gains full native-API access and bypasses store review, a way to load or execute a remote module that the configured allowlist or production block should have refused is a vulnerability. Developer choices such as enabling remote modules or configuring an empty or overly broad allowlist are out of scope (see below).
- **Bypass of a documented authentication control.** For example, defeating the biometric authentication provided by `@nativescript/biometrics` (or the legacy `@nativescript/fingerprint-auth` plugin), including the enrolled-biometrics-change check, so that authentication succeeds when it should fail.
- **Mishandling of untrusted runtime input.** A flaw in a runtime or in `@nativescript/core` where a network response, deep link, intent, or other untrusted input triggers behavior beyond the documented API: memory corruption in the bridge, unintended native calls, an unrecoverable crash reachable from untrusted input, or disclosure or loss of integrity of data protected through the correct use of NativeScript APIs (such as `@nativescript/secure-storage`).
- **Bypass of documented containment or validation.** Where a NativeScript API or official plugin documents a containment or validation guarantee (such as path containment during archive extraction in `@nativescript/zip`), a way to defeat it is in scope, even if the equivalent unguaranteed behavior would be an application concern.

### Examples of non-vulnerabilities

The following are not considered vulnerabilities in NativeScript:

- **Application code vulnerabilities.** Insecure data storage, hardcoded secrets, missing certificate pinning, injection, or other flaws in developer-written application code, plugins, or configuration. Application code is trusted and runs with full native privileges by design.
- **The direct native-API access model.** That NativeScript code can reach the file system, keychain, network, camera, and other native APIs is documented and intentional. It is not a sandbox escape.
- **CLI, bundler, or dev/debug tooling exposure.** The CLI, bundlers (`@nativescript/webpack`, `@nativescript/vite`), LiveSync / HMR dev servers, and debug builds (`ns debug`, Chrome DevTools inspector) are development-time tools that inherit the Node.js threat model, under which the operating system and the developer's infrastructure are trusted. Debug builds and local dev servers intentionally allow live code evaluation and inspection from the developer's workstation and are not intended for untrusted networks or production use. A report whose exposure depends on another local account on the build host, an exposed dev/HMR server, or build output (logs, process arguments, CI artifacts) being retained or shared is a hardening concern rather than a vulnerability. Such reports may be accepted as security-interest improvements without a CVE.
- **Attacker-controlled build inputs or a compromised development environment.** Reports that require the attacker to control inputs to a developer-run build step (for example a project name or path fed into `ns create`), or that assume a compromised developer machine or build host, are out of scope.
- **Developer misconfiguration.** Security issues arising from developer choices, such as enabling remote modules, configuring an empty, broad, or user-controlled `remoteModuleAllowlist`, shipping debug builds to production, or granting broad app permissions. Configuration is trusted.
- **Vulnerabilities in trusted dependencies, dev tooling, or the platform.** Issues in the host operating system, underlying WebView engines (WebKit, Chromium), JavaScript engines (V8, JavaScriptCore, Hermes, QuickJS), Gradle or Xcode, or third-party plugins and npm dependencies. These are fixed as regular dependency updates when applicable, and updating a dependency is not itself a vulnerability. Likewise, automated scanner or `npm audit` findings without a demonstrated, reachable exploit in a published NativeScript package (such as workspace-only `devDependencies` or unreachable transitive code paths) are not security vulnerabilities and should be raised as regular issues or pull requests rather than security advisories.
- **Device compromise or physical access.** Reports that require a rooted or jailbroken device, a device under the attacker's physical control, or a malicious application already granted elevated privileges by the user.
- **Unsupported versions and archived repositories.** Security fixes target actively maintained release lines. Archived repositories and end-of-life majors (such as NativeScript `< 8` / legacy `tns-*` packages) are out of scope.
