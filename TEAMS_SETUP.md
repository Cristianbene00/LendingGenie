# Microsoft Teams Setup — User-Consent OAuth

No Azure admin needed. You log in with your own Microsoft account, grant permission once, and the agent reads the channel as you.

## What you need

1. Your Microsoft account (the one you use for Teams)
2. 2 minutes to register a free app in Azure AD (no admin approval)
3. Your Teams channel link

## Step 1: Register an app (2 minutes, no admin)

1. Go to **https://portal.azure.com**
2. Search for **App registrations** in the top search bar
3. Click **New registration**
4. Fill in:
   - **Name**: `Cashera KB Trainer`
   - **Supported account types**: "Accounts in this organizational directory only"
   - **Redirect URI**: Select **Public client/native (mobile & desktop)** → enter `http://localhost`
5. Click **Register**
6. Copy the **Application (client) ID** — a UUID like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

That's it. No secrets, no certificates, no admin consent.

## Step 2: Get your channel IDs

1. Open Microsoft Teams
2. Right-click the **engineering channel** in the sidebar
3. Click **Get link to channel** (or "Copy link to channel")
4. The link looks like:
   ```
   https://teams.microsoft.com/l/channel/19%3Aabc123%40thread.tacv2/Engineering?groupId=def456-...&tenantId=...
   ```
5. Extract:
   - **Team ID** = the `groupId` parameter → `def456-...`
   - **Channel ID** = between `/channel/` and the next `/` → `19%3Aabc123%40thread.tacv2`

6. Combine with a colon:
   ```
   TEAMS_ENG_CHANNEL=def456-...:19%3Aabc123%40thread.tacv2
   ```

## Step 3: Fill in .env

```env
MS_GRAPH_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
TEAMS_ENG_CHANNEL=def456-...:19%3Aabc123%40thread.tacv2
```

## Step 4: First sync

Restart the worker, then either:

**Web UI**: Go to Upload / Sync tab → click "Sync Teams now"

**CLI**:
```powershell
npm run sync:teams
```

A browser window opens → log in with your Microsoft account → click Accept.

The token is cached. Future syncs are automatic (no login prompt).

## Troubleshooting

**Browser doesn't open**: Copy the URL from the terminal and paste it into your browser manually.

**"Insufficient privileges"**: Your account may not have access to that channel. Verify you can see the channel in Teams.

**"AADSTS700016" error**: The Client ID is wrong. Go back to Azure portal → App registrations → copy the correct Application ID.

**Want to re-login as a different user?**
```powershell
# Windows
Remove-Item "$env:USERPROFILE\.msal_cache*"

# macOS/Linux
rm ~/.msal_cache*
```
Then re-run the sync — it will prompt for login again.
