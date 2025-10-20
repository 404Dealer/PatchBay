# Security Policy

- Report vulnerabilities privately via email or GitHub Security Advisories.
- Do not open public issues for security bugs.
- Rotate any leaked credentials immediately; revoke tokens in Vault.
- Webhooks are validated (Twilio signatures). Keep `TWILIO_AUTH_TOKEN` secret.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser; it is for Edge/Server only.
