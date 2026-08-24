# Crystal Translator

Automatic **French ↔ English** Discord translation relay powered locally by **Bergamot**.

## What this version does

- `#fr` → automatic English translation in `#en`.
- `#en` → automatic French translation in `#fr`.
- Translated messages use a Discord webhook with the original member's server display name and avatar.
- Small `FR → EN` / `EN → FR` marker.
- FFXIV/community protected terms and a directional dictionary in `terms.json`.
- Discord mentions, custom emojis, timestamps, URLs and code are protected from translation.
- Message edits are re-translated for **60 minutes** by default.
- Message deletions are synchronized during the same 60-minute window (configurable).
- Attachments are copied to the translated message.
- Replies link to the already translated counterpart when one is known.
- Message IDs are retained for 30 days so reply links can still work; message text is **not** stored.
- Strict application-level FIFO: creations, edits and deletions are relayed one at a time in Discord arrival order.
- One Bergamot worker, batch size 1, with Mozilla `base-memory` FR/EN release models.
- Model files are cached on disk after the first download.

## Requirements

- Linux VPS (2 GB RAM is comfortable for this configuration).
- Node.js 20.12+ (Node.js 22 LTS recommended).
- A Discord bot/application.
- Internet access for the first model download.

## Discord setup

In the Discord Developer Portal, enable the **Message Content Intent** for the bot.

Invite it with permissions for both translation channels:

- View Channel
- Send Messages
- Read Message History
- Manage Webhooks
- Attach Files
- Embed Links

The bot automatically creates one `Crystal Translator` webhook in each target channel when needed.

## Installation

```bash
cp .env.example .env
nano .env
nano config.json
npm install
npm run warmup
npm start
```

Put the bot token in `.env`:

```env
DISCORD_TOKEN=your_token_here
```

Put the two Discord channel IDs in `config.json`:

```json
{
  "channels": {
    "fr": "123456789012345678",
    "en": "234567890123456789"
  }
}
```

Do not commit `.env` or `data/webhooks.json`; both contain credentials.

## Protected terms

Edit `terms.json` without touching the source code.

`protectedTerms` stay exactly as written:

```json
"protectedTerms": [
  "FFXIV",
  "Party Finder",
  "Duty Finder",
  "Crystal Planner",
  "Cozy Events"
]
```

The directional dictionary forces specific translations:

```json
"dictionary": {
  "fr-en": {
    "Sadique": "Savage",
    "Extrême": "Extreme"
  },
  "en-fr": {
    "Savage": "Sadique",
    "Extreme": "Extrême"
  }
}
```

## Edit window

Default:

```json
"editWindowMinutes": 60,
"syncDeletesWithinEditWindow": true
```

During that hour, editing the original message re-runs Bergamot and edits the translated webhook message. After the hour, the old translation is left unchanged.

## Strict FIFO queue

All relay operations use one global in-process FIFO queue:

```text
Message A ─┐
Message B ─┼──► FIFO ─► translate/publish A ─► translate/publish B ─► translate/publish C
Message C ─┘
```

A task does not start until the previous task has fully finished, including webhook publication and message-ID storage. Edits and deletions use the same queue, so they cannot overtake a message that is still being translated. A failed task is logged and does not block later tasks.

The queue is intentionally in memory only: after a process restart Discord resumes with new events; it does not persist stale translation jobs.

## Bergamot models

This project reads Mozilla's current public model registry and selects the `Release` + `base-memory` models for:

- `fr-en`
- `en-fr`

The compressed downloads are unpacked and cached under `data/models/`. On later restarts they are read locally.

## Running with systemd

An example unit is included at:

```text
systemd/crystal-translator.service.example
```

Adjust the Linux user and installation path, copy it to `/etc/systemd/system/crystal-translator.service`, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now crystal-translator
sudo systemctl status crystal-translator
```

## Notes

Incoming translated webhook messages are ignored by the bot, preventing FR → EN → FR loops.

The bot disables `allowed_mentions` on relayed messages. Mentions remain visually recognizable, but users/roles are not pinged a second time by the translation.
