/**
 * Microsoft Graph API connector — covers Teams, Outlook, SharePoint
 *
 * Setup (10 min):
 * 1. portal.azure.com → Azure AD → App registrations → New registration
 *    Name: "CT Brain"  |  Redirect URI: http://localhost:3001/auth/microsoft/callback
 * 2. Certificates & secrets → New client secret → copy value
 * 3. API permissions → Add:
 *    - Teams.ReadBasic.All
 *    - ChannelMessage.Read.All
 *    - Mail.Read
 *    - Files.Read.All
 *    - Sites.Read.All
 *    → Grant admin consent
 * 4. Add to .env:
 *    MICROSOFT_CLIENT_ID=...
 *    MICROSOFT_CLIENT_SECRET=...
 *    MICROSOFT_TENANT_ID=...
 *    MICROSOFT_USER_ID=...   (the UPN or object-id of the account to read on behalf of)
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

let _cachedToken: { token: string; expiresAt: number } | null = null

/** Get an app-level access token using client credentials flow */
async function getAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _cachedToken.expiresAt - 60_000) {
    return _cachedToken.token
  }

  const { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT_ID } = process.env

  if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET || !MICROSOFT_TENANT_ID) {
    throw new Error(
      'Microsoft Graph not configured. Add MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT_ID to .env'
    )
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: MICROSOFT_CLIENT_ID,
    client_secret: MICROSOFT_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
  })

  const res = await fetch(
    `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
    { method: 'POST', body: params }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Microsoft auth failed: ${err}`)
  }

  const data = await res.json()
  _cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return _cachedToken.token
}

async function graphGet(path: string): Promise<any> {
  const token = await getAccessToken()
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Graph API error ${res.status}: ${err}`)
  }
  return res.json()
}

// ─── Teams ────────────────────────────────────────────────────────────────

export async function searchTeamsMessages(query: string, maxResults = 5): Promise<string> {
  try {
    const data = await graphGet(
      `/search/query?$search="${encodeURIComponent(query)}"&entityTypes=chatMessage&size=${maxResults}`
    )
    const hits = data?.value?.[0]?.hitsContainers?.[0]?.hits ?? []
    if (!hits.length) return 'No Teams messages found for that query.'

    return hits.map((h: any) => {
      const msg = h.resource
      return `[Teams] ${msg.from?.emailAddress?.name ?? 'Unknown'}: ${msg.body?.content?.replace(/<[^>]+>/g, '') ?? ''}`.slice(0, 300)
    }).join('\n\n')
  } catch (err: any) {
    return `Teams search unavailable: ${err.message}`
  }
}

export async function listTeamsChannels(): Promise<string> {
  try {
    const userId = process.env.MICROSOFT_USER_ID
    if (!userId) return 'MICROSOFT_USER_ID not set in .env'

    const data = await graphGet(`/users/${userId}/joinedTeams`)
    const teams = data.value ?? []
    return teams.map((t: any) => `${t.displayName} (${t.id})`).join('\n') || 'No teams found.'
  } catch (err: any) {
    return `Teams list unavailable: ${err.message}`
  }
}

// ─── Outlook ──────────────────────────────────────────────────────────────

export async function searchEmails(query: string, maxResults = 5): Promise<string> {
  try {
    const userId = process.env.MICROSOFT_USER_ID
    if (!userId) return 'MICROSOFT_USER_ID not set in .env'

    const data = await graphGet(
      `/users/${userId}/messages?$search="${encodeURIComponent(query)}"&$top=${maxResults}&$select=subject,from,bodyPreview,receivedDateTime`
    )
    const emails = data.value ?? []
    if (!emails.length) return 'No emails found for that query.'

    return emails.map((e: any) =>
      `[Email] From: ${e.from?.emailAddress?.address} | ${new Date(e.receivedDateTime).toLocaleDateString()}\nSubject: ${e.subject}\n${e.bodyPreview?.slice(0, 250)}`
    ).join('\n\n')
  } catch (err: any) {
    return `Email search unavailable: ${err.message}`
  }
}

// ─── SharePoint / OneDrive ────────────────────────────────────────────────

export async function searchSharePoint(query: string, maxResults = 5): Promise<string> {
  try {
    const data = await graphGet(
      `/search/query?$search="${encodeURIComponent(query)}"&entityTypes=driveItem&size=${maxResults}`
    )
    const hits = data?.value?.[0]?.hitsContainers?.[0]?.hits ?? []
    if (!hits.length) return 'No SharePoint/OneDrive files found for that query.'

    return hits.map((h: any) => {
      const item = h.resource
      return `[File] ${item.name} — ${item.webUrl}\n  Modified: ${item.lastModifiedDateTime?.slice(0, 10) ?? 'unknown'}`
    }).join('\n\n')
  } catch (err: any) {
    return `SharePoint search unavailable: ${err.message}`
  }
}

export function isMicrosoftConfigured(): boolean {
  return !!(
    process.env.MICROSOFT_CLIENT_ID &&
    process.env.MICROSOFT_CLIENT_SECRET &&
    process.env.MICROSOFT_TENANT_ID
  )
}
