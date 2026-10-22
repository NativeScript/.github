Thanks for helping make NativeScript safe for everyone.

# Security

NativeScript takes the security of our software seriously, including all of the open source code repositories managed through our GitHub organizations, such as [NativeScript](https://github.com/NativeScript).

## Reporting Security Issues

If you believe you have found a security vulnerability in any NativeScript-owned repository, please report it to us through coordinated disclosure. Before reporting, please check your finding against the [Threat Model](#threat-model) below to confirm it is a vulnerability in NativeScript itself rather than an application, environment, or dependency concern.

**Please do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

The preferred channel is GitHub's private vulnerability reporting: open a draft security advisory on the affected NativeScript repository from its "Security" tab ("Report a vulnerability"). This routes the report privately to the maintainers and gives us per-issue tracking and a collaborator workflow. If you cannot use GitHub private vulnerability reporting, email `support[@]nativescript.org` as a fallback.

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

It covers the NativeScript organization as a whole: the CLI (`nativescript` / `ns`), the iOS and Android runtimes, `@nativescript/core`, and the officially maintained plugins. A vulnerability that requires the compromise of a trusted element is outside the scope of this threat model.

### Scope and inheritance

NativeScript builds and runs native mobile applications from JavaScript and TypeScript. Its defining property, stated throughout the documentation, is that application code has direct access to native platform APIs (file system, keychain, network, camera, and so on). There is no JavaScript sandbox between application code and the device: application JavaScript runs with the full privileges of the installed app.

The NativeScript CLI is a Node.js application. For the CLI, this model inherits the [Node.js threat model](https://github.com/nodejs/node/blob/main/SECURITY.md): the operating system, the developer, and the developer's infrastructure are trusted, and a report cannot assume a trusted element has been compromised. The runtimes and `@nativescript/core` are not server-side Node.js, but the same principles apply, with the mobile operating system and its sandbox added as trusted elements.

### Trusted elements

NativeScript trusts:

- The developer and the infrastructure that build, sign, and publish the app, including the build host, CI runners, and the files and environment under the developer's control.
- The application's own JavaScript and TypeScript code and the code it chooses to run, including plugins and dependencies installed from npm. Application code runs with full native privileges by design.
- The mobile operating system (Android, iOS, visionOS), its sandbox and permission model, the device, and anything under the control of the operating system.
- The build toolchain (Gradle, Xcode, the Android and Apple SDKs) and the JavaScript engines (V8, JavaScriptCore).

### Untrusted elements

NativeScript does not trust data that reaches a running application from outside it, where NativeScript itself parses or marshals that data before the application sees it:

- Responses received over the network through NativeScript APIs.
- Deep links, app links, custom URL schemes, Android intents, and iOS universal links that launch or message the app.
- Inter-process input from other applications on the device.
- Content rendered in a WebView.
- Remotely loaded modules, which are governed by the remote-module security control described below.

If such input can make NativeScript take an action beyond those documented for its APIs, that is likely a vulnerability.

### What constitutes a vulnerability

A defect in NativeScript that an untrusted element can use to cross one of the boundaries above is in scope. Examples:

- **Bypass of the remote-module control.** NativeScript blocks remote ES module loading in production by default (`security.allowRemoteModules` defaults to `false`) and restricts it to an allowlist when enabled (`security.remoteModuleAllowlist`). Because remotely loaded code gains full native-API access and bypasses store review, a way to load or execute a remote module that the configured allowlist and production block should have refused is a vulnerability. Developer choices such as enabling remote modules or configuring a broad allowlist are out of scope (see below).
- **Bypass of a documented authentication control.** For example, defeating the biometric authentication provided by `@nativescript/biometrics` (or the legacy fingerprint-auth plugin), including the enrolled-fingerprint-change check, so that authentication succeeds when it should fail.
- **Mishandling of untrusted runtime input.** A flaw in a runtime or in `@nativescript/core` where a network response, deep link, intent, or other untrusted input triggers behavior beyond the documented API: memory corruption in the bridge, unintended native calls, an unrecoverable crash reachable from untrusted input, or disclosure or loss of integrity of data protected through the correct use of NativeScript APIs.
- **Bypass of documented containment or validation.** Where a NativeScript API documents a containment or validation guarantee, a way to defeat it is in scope, even if the equivalent unguaranteed behavior would be an application concern.

### Examples of non-vulnerabilities

The following are not considered vulnerabilities in NativeScript:

- **Application code vulnerabilities.** Insecure data storage, hardcoded secrets, missing certificate pinning, injection, or other flaws in developer-written application code, plugins, or configuration. Application code is trusted and runs with full native privileges by design.
- **The direct native-API access model.** That NativeScript code can reach the file system, keychain, network, camera, and other native APIs is documented and intentional. It is not a sandbox escape.
- **CLI behavior on a shared or multi-tenant build host.** The CLI is a development-time tool and inherits the Node.js threat model, under which the operating system and the developer's infrastructure are trusted. A report whose exposure depends on another local account on the build host, or on build output (logs, process arguments, CI artifacts) being retained or shared, requires a trusted element and is a hardening concern rather than a vulnerability. Such reports may be accepted as security-interest improvements without a CVE.
- **Attacker-controlled build inputs or a compromised development environment.** Reports that require the attacker to control inputs to a developer-run build step (for example a project name or path fed into `ns create`), or that assume a compromised developer machine or build host, are out of scope.
- **Developer misconfiguration.** Security issues arising from developer choices, such as enabling remote modules, configuring a broad or user-controlled `remoteModuleAllowlist`, or granting broad app permissions. Configuration is trusted.
- **Vulnerabilities in trusted dependencies or the platform.** Issues in the mobile operating system, V8 or JavaScriptCore, Gradle or Xcode, or third-party plugins and npm dependencies. These are fixed as regular dependency updates when applicable, and updating a dependency is not itself a vulnerability.
- **Device compromise or physical access.** Reports that require a rooted or jailbroken device, a device under the attacker's physical control, or a malicious application already granted elevated privileges by the user.
