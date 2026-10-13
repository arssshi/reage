# Reage for Windows — installer and portable builds

The Windows x64 release offers two ways to run Reage:

- **Installer** (\`Reage-X.Y.Z-Windows-Setup.exe\`): a conventional per-user Windows installer. It offers a selectable installation directory, creates Start menu and desktop shortcuts, and does not require administrator rights by default.
- **Portable** (\`Reage-X.Y.Z-Windows-Portable.exe\`): a single executable that does not require an installation wizard.

Both packages include the Electron desktop shell and bundled local PDF-processing service. A separate Python installation is not required.

## Create a release

1. Open the Actions tab in the CHEYCKIT/reage repository.
2. Select **Windows desktop release**.
3. Select **Run workflow** on the main branch.
4. Wait for the workflow to finish, then open the release named **Reage vX.Y.Z — Windows Installer + Portable** on the repository's Releases page.

The workflow builds the Vite frontend, freezes the Python/FastAPI service with PyInstaller, smoke-tests the bundled API, packages both Windows targets with Electron Builder, verifies that both executables exist, generates a SHA-256 checksum for each, and publishes all four files as GitHub release assets. The release tag is named windows-vX.Y.Z so it does not collide with an upstream source release tag.

## Runtime and privacy

PDF operations use the bundled local service bound to 127.0.0.1 on a free local port. Uploaded PDFs are processed on the same machine and kept in the service's in-memory session, not sent to Reage's hosted API. Export the edited PDF before closing the app because sessions are temporary.

First-use OCR language models and optional Google Fonts downloads need an internet connection. Cache files are kept beside the portable executable in a ReageData folder when that location is writable; otherwise the app uses the current user's application-data folder. Installed builds keep the cache in the user's Reage application-data directory. No PDF documents are intentionally written to these cache locations.

## Windows notes

The builds are unsigned. Windows SmartScreen or antivirus software may show a first-run reputation prompt. The checksum assets let you verify downloaded executables, but they are not code-signing certificates.

The installer is per-user and provides the standard Windows uninstall entry. Uninstalling does not intentionally delete Reage's cache and application data. The portable build does not install into Windows.

Generated build output, the server executable, the icon, and release files are produced by the workflow and are not committed to the source tree.
