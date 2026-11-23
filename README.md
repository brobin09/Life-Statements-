# Life Statements

Review your life like a set of financial statements: a balance sheet, an income statement and cash flow, by line item and by area. Local-first: everything is stored in your browser on your device. No accounts, no server.

## Run

```bash
npm install
npm run dev
```

Other scripts: `npm test`, `npm run typecheck`, `npm run build` (output in `dist/`).

## Use on iPhone

The app is an installable web app. After it is published at an HTTPS address, open that address in Safari, tap Share, then Add to Home Screen. In the app, "Areas & data" has a card that turns the address into a QR code.

Phone and computer keep separate data. Use backup and restore on the Export tab to move it.

## Publish with GitHub Pages

1. Push this project to the `main` branch of a GitHub repository.
2. In the repository, open Settings, then Pages, and set Source to **GitHub Actions**.
3. The workflow in `.github/workflows/pages.yml` runs the checks, builds and deploys. The address is `https://<user>.github.io/<repository>/`.

Only the app files are published. Your data never leaves your device.
