# Rigel

Rigel is a Telegram interface for deploying and managing KeeperHub workflows.
Upload a workflow JSON once, then manage the live KeeperHub workflow directly from
Telegram.

## Features

- Deploy KeeperHub workflow JSON files from Telegram
- List workflows from KeeperHub
- Pause and resume workflows
- Manually trigger a workflow
- Export a live workflow as JSON
- Delete workflows
- View recent workflow executions
- Uses KeeperHub as the source of truth

## Tech Stack

- Node.js
- TypeScript
- Grammy for the Telegram bot
- KeeperHub REST API for workflow deployment and management
- dotenv for local environment configuration

## Requirements

- Node.js 18+
- Telegram bot token from BotFather
- KeeperHub API key

## Setup

Install dependencies:

```bash
npm install
```

Create a `.env` file:

```bash
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
KEEPERHUB_API_KEY=your_keeperhub_api_key
KEEPERHUB_BASE_URL=https://app.keeperhub.com/api
```

Optional project scoping:

```bash
KEEPERHUB_PROJECT_ID=your_project_id
```

If `KEEPERHUB_PROJECT_ID` is set and no workflows are found, Rigel retries the
workflow list without the project filter.

## Running

```bash
npm run dev
```


## Bot Commands

```text
/jsonup  - deploy a workflow from a KeeperHub JSON file
/list    - see your workflows
/pause   - pause a workflow
/resume  - resume a workflow
/run     - manually trigger a workflow
/export  - download workflow JSON
/delete  - delete a workflow
/status  - see recent executions
/cancel  - cancel current action
```

## Workflow Upload Format

Uploaded files must be valid KeerpHub workflow JSON and include at least:

```json
{
  "name": "Example Workflow",
  "description": "Optional description",
  "nodes": [],
  "edges": []
}
```

Rigel sends `name`, `description`, `nodes`, and `edges` to KeeperHub using the
workflow creation API.

## Notes

Rigel does not store workflow state on disk. Workflow lists are fetched from
KeeperHub before management actions, while the bot only keeps short-lived
conversation state in memory for selections like "pause workflow #2".

If `/list` returns no workflows even though they exist in KeeperHub, check that
`KEEPERHUB_API_KEY` belongs to the same KeeperHub org/account and that
`KEEPERHUB_PROJECT_ID` is not filtering them out.
