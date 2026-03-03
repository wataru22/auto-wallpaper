# Goal Wallpaper URL (Web Only)

Generates a **daily-updating countdown wallpaper** at a URL for iOS Shortcuts automation.

## Run

```bash
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Endpoints

- `GET /` setup page (goal form, preview, copy URL)
- `GET /goal.png?...` returns PNG wallpaper as a downloadable image file
- `GET /goal?...` and `GET /wallpaper.png?...` aliases

## Query params

- `goal` text shown on wallpaper (default: `My Goal`)
- `start` start date `YYYY-MM-DD`
- `deadline` deadline date `YYYY-MM-DD`
- `model` one of `iphone15`, `iphone15proMax`, `iphone14`, `iphone14plus`, `iphoneSE`
- `tz` IANA timezone (for daily rollover), e.g. `America/Toronto`

Example:

```text
http://localhost:3000/goal.png?goal=43&start=2026-03-01&deadline=2026-12-31&model=iphone15&tz=America/Toronto
```

## iOS Shortcut flow

1. Create a daily automation in Shortcuts (`Run Immediately`).
2. Add `Get Contents of URL` with your generated `/goal.png?...` URL.
3. Add `Set Wallpaper Photo` for Lock Screen.
4. Disable `Show Preview` and `Crop to Subject`.

## Deploy on Vercel

```bash
bunx vercel
```

After first deploy:

1. Copy your production URL.
2. Open `/` on that URL and generate your `/goal.png?...` link.
3. Use that link in iOS Shortcuts.
