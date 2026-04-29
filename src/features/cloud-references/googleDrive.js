import { createOAuthState, openOAuthPopup } from './oauthPopup';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

export const connectGoogleDrive = async () => {
  const clientId = import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID;
  if (!clientId) {
    throw new Error('Missing VITE_GOOGLE_DRIVE_CLIENT_ID.');
  }

  const state = createOAuthState();
  const redirectUri = `${window.location.origin}/oauth-callback.html`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: GOOGLE_DRIVE_SCOPE,
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
  });

  const result = await openOAuthPopup({
    authorizationUrl: `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`,
    state,
  });

  return {
    provider: 'googleDrive',
    accessToken: result.accessToken,
    expiresAt: Date.now() + result.expiresIn * 1000,
  };
};

export const listGoogleDriveChildren = async ({ accessToken, parentId = 'root' }) => {
  const query = `'${parentId}' in parents and trashed=false`;

  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', query);
  url.searchParams.set('pageSize', '25');
  url.searchParams.set('fields', 'files(id,name,mimeType,webViewLink,modifiedTime)');
  url.searchParams.set('orderBy', 'modifiedTime desc');
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('includeItemsFromAllDrives', 'true');

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    let errorPayload = null;
    try {
      errorPayload = await response.json();
    } catch {
      errorPayload = null;
    }

    const reason = errorPayload?.error?.errors?.[0]?.reason || '';

    if (response.status === 401) {
      throw new Error('Google Drive session expired. Disconnect and reconnect, then browse again.');
    }

    if (response.status === 403) {
      if (reason === 'insufficientPermissions') {
        throw new Error('Google Drive permissions are insufficient. Disconnect and reconnect to grant Drive read access.');
      }

      throw new Error('Google Drive permission denied. Confirm Drive API is enabled and this Google account can access Drive.');
    }

    throw new Error(`Unable to list Google Drive resources (${response.status}).`);
  }

  const payload = await response.json();
  const files = Array.isArray(payload.files) ? payload.files : [];

  return files.map((file) => ({
    id: file.id,
    name: file.name,
    webUrl: file.webViewLink || '',
    resourceType: file.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
    mimeType: file.mimeType || '',
    modifiedTime: file.modifiedTime || '',
  }));
};

const exportMimeTypeByNativeFile = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.presentation': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
};

export const downloadGoogleDriveFile = async ({ accessToken, fileId, mimeType = '' }) => {
  const isNativeGoogleFile = mimeType.startsWith('application/vnd.google-apps.');
  const exportMimeType = exportMimeTypeByNativeFile[mimeType] || '';

  const endpoint = isNativeGoogleFile
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMimeType || 'text/plain')}`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Google Drive session expired while loading file content. Reconnect and try again.');
    }

    if (response.status === 403) {
      throw new Error('Google Drive denied file download. Confirm Drive API access and reconnect.');
    }

    throw new Error(`Could not download Google Drive file (${response.status}).`);
  }

  return {
    arrayBuffer: await response.arrayBuffer(),
    contentType: response.headers.get('content-type') || '',
  };
};
