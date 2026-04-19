// dashboard/lib/secret-patterns.ts
// Authoritative source: .planning/phases/03-editor/03-RESEARCH.md §Secret-Pattern Source
// (based on gitleaks.toml default ruleset as of 2026-04).
//
// This module is imported by BOTH the client-side preview scan
// (editor-client.tsx debounced 250ms) AND the server-authoritative scan
// (actions.ts saveRoutine). Any drift is a Pitfall-#5 bug — that is why
// the regex table lives here and is shared by construction.
//
// Every regex uses the /g flag so scanForSecrets can iterate all matches via exec-loop.

export interface SecretPattern {
  name: string;
  regex: RegExp;
  description: string;
}

export const SECRET_PATTERNS: readonly SecretPattern[] = [
  { name: "stripe-live-key",   regex: /\bsk_live_[0-9a-zA-Z]{24,}\b/g,                                description: "Stripe live API key" },
  { name: "stripe-test-key",   regex: /\bsk_test_[0-9a-zA-Z]{24,}\b/g,                                description: "Stripe test API key" },
  { name: "github-pat",        regex: /\bghp_[0-9a-zA-Z]{36,}\b/g,                                    description: "GitHub personal access token" },
  { name: "github-oauth",      regex: /\bgho_[0-9a-zA-Z]{36,}\b/g,                                    description: "GitHub OAuth token" },
  { name: "aws-access-key",    regex: /\bAKIA[0-9A-Z]{16}\b/g,                                        description: "AWS access key ID" },
  { name: "slack-token",       regex: /\bxox[baprs]-[0-9a-zA-Z-]{10,}\b/g,                            description: "Slack token" },
  { name: "openai-key",        regex: /\bsk-[A-Za-z0-9]{20,}T3BlbkFJ[A-Za-z0-9]{20,}\b/g,             description: "OpenAI API key" },
  { name: "anthropic-key",     regex: /\bsk-ant-[A-Za-z0-9_-]{32,}\b/g,                               description: "Anthropic API key" },
  { name: "google-api-key",    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,                                   description: "Google API key" },
  { name: "generic-40-hex",    regex: /\b[0-9a-fA-F]{40,}\b/g,                                        description: "Generic 40+ char hex secret (SHA1 / HMAC / entropy)" },
  { name: "pem-private-key",   regex: /-----BEGIN (RSA |EC |DSA |OPENSSH |)PRIVATE KEY-----/g,        description: "PEM-encoded private key header" },
] as const;
