// Microsoft Graph client for app-only (client credentials) auth.
//
// Used by the nightly export cron to upload Excel files to a SharePoint
// document library. We can't reuse the delegated-auth pattern in routes/search.js
// because cron runs unattended — there's no user JWT to forward.
//
// Required env vars:
//   AZURE_TENANT_ID         (already used by middleware/auth.js)
//   AZURE_CLIENT_ID         (already used by middleware/auth.js)
//   AZURE_CLIENT_SECRET     (generate in Azure portal)
//
// Plus ONE of the following destination identifiers (drive ID is preferred):
//   SHAREPOINT_DRIVE_ID     Target a specific document library (any library on
//                           any site). Get it via Graph Explorer:
//                             GET /sites/{tenant}.sharepoint.com:/sites/{site}:/drives
//                           Then copy the `id` of the library you want.
//   SHAREPOINT_SITE_ID      Fallback. Uploads to the site's *default* document
//                           library (named "Documents"). Only useful when the
//                           destination is the default library.
//
// Required Azure app permission: Sites.ReadWrite.All (Application, admin-consented).

const { ConfidentialClientApplication } = require('@azure/msal-node');

let cachedApp = null;

function getApp() {
  if (cachedApp) return cachedApp;
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('SharePoint upload requires AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET');
  }
  cachedApp = new ConfidentialClientApplication({
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
  });
  return cachedApp;
}

async function getAccessToken() {
  const app = getApp();
  const result = await app.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });
  if (!result?.accessToken) {
    throw new Error('Graph token acquisition returned no access token');
  }
  return result.accessToken;
}

// Upload a buffer as a file at {folderPath}/{filename} inside the configured
// SharePoint document library. PUT to /content overwrites any existing file at
// that path. Files <4MB only — we're well under that.
//
// Destination resolution: prefer SHAREPOINT_DRIVE_ID (lets us target any
// library on any site). Fall back to SHAREPOINT_SITE_ID, which uploads to the
// site's default ("Documents") library only.
async function uploadFile(folderPath, filename, buffer) {
  const driveId = process.env.SHAREPOINT_DRIVE_ID;
  const siteId = process.env.SHAREPOINT_SITE_ID;
  if (!driveId && !siteId) {
    throw new Error('SharePoint upload requires SHAREPOINT_DRIVE_ID (preferred) or SHAREPOINT_SITE_ID');
  }

  const token = await getAccessToken();
  const cleanFolder = folderPath.replace(/^\/+|\/+$/g, '');
  const encodedPath = cleanFolder
    ? `${encodeURI(cleanFolder)}/${encodeURIComponent(filename)}`
    : encodeURIComponent(filename);
  const url = driveId
    ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root:/${encodedPath}:/content`
    : `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/drive/root:/${encodedPath}:/content`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
    body: buffer,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SharePoint upload failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const json = await res.json();
  return { id: json.id, webUrl: json.webUrl, name: json.name };
}

module.exports = { getAccessToken, uploadFile };
