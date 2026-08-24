# Security policy

## Supported versions

Security support begins with the first stable release. The latest stable minor
release will receive security fixes. Pre-release builds are provided for testing
and may change without a migration path.

## Reporting a vulnerability

Do not open a public issue for an undisclosed vulnerability. Once the GitHub
repository is published, use its private vulnerability-reporting feature. Until
then, hold the report or contact the maintainer privately if you already have a
trusted contact channel.

Include affected versions, reproduction steps, impact, and any suggested
mitigation. Please allow reasonable time for investigation and coordinated
disclosure.

## Extension boundary

Registered strategies and renderers are trusted application code, not sandboxed
plugins. Serialized palette documents never cause code to be installed, fetched,
imported, or evaluated automatically.
