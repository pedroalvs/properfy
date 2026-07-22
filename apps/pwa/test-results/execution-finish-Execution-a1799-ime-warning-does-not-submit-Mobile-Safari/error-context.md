# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: execution-finish.spec.ts >> Execution finish confirmations >> cancelling the past-time warning does not submit
- Location: tests/e2e/execution-finish.spec.ts:196:3

# Error details

```
Error: browserType.launch: Executable doesn't exist at /Users/pedro/Library/Caches/ms-playwright/webkit-2272/pw_run.sh
╔════════════════════════════════════════════════════════════╗
║ Looks like Playwright was just installed or updated.       ║
║ Please run the following command to download new browsers: ║
║                                                            ║
║     pnpm exec playwright install                           ║
║                                                            ║
║ <3 Playwright Team                                         ║
╚════════════════════════════════════════════════════════════╝
```