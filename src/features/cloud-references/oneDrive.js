import { createOAuthState, openOAuthPopup } from './oauthPopup';

const MS_AUTH_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MS_SCOPE = 'Files.Read User.Read';

export const connectOneDrive = async () => {
  const clientId = import.meta.env.VITE_ONEDRIVE_CLIENT_ID;
  if (!clientId) {
    throw new Error('Missing VITE_ONEDRIVE_CLIENT_ID.');
  }

  const state = createOAuthState();
  const redirectUri = `${window.location.origin}/oauth-callback.html`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    response_mode: 'fragment',
    scope: MS_SCOPE,
    prompt: 'select_account',
    state,
  });

  const result = await openOAuthPopup({
    authorizationUrl: `${MS_AUTH_ENDPOINT}?${params.toString()}`,
    state,
  });

  return {
    provider: 'oneDrive',
    accessToken: result.accessToken,
    expiresAt: Date.now() + result.expiresIn * 1000,
  };
};

export const listOneDriveChildren = async ({ accessToken, parentId = 'root' }) => {
  const endpoint = parentId === 'root'
    ? 'https://graph.microsoft.com/v1.0/me/drive/root/children?$top=50&$select=id,name,webUrl,file,folder,lastModifiedDateTime'
    : `https://graph.microsoft.com/v1.0/me/drive/items/${parentId}/children?$top=50&$select=id,name,webUrl,file,folder,lastModifiedDateTime`;

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Unable to list OneDrive resources.');
  }

  const payload = await response.json();
  const values = Array.isArray(payload.value) ? payload.value : [];

  return values.map((item) => ({
    id: item.id,
    name: item.name,
    webUrl: item.webUrl || '',
    resourceType: item.folder ? 'folder' : 'file',
    mimeType: item.file?.mimeType || '',
    modifiedTime: item.lastModifiedDateTime || '',
  }));
};

export const downloadOneDriveFile = async ({ accessToken, fileId }) => {
  const endpoint = `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}/content`;
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('OneDrive session expired while loading file content. Reconnect and try again.');
    }

    if (response.status === 403) {
      throw new Error('OneDrive denied file download. Reconnect and verify file permissions.');
    }

    throw new Error(`Could not download OneDrive file (${response.status}).`);
  }

  return {
    arrayBuffer: await response.arrayBuffer(),
    contentType: response.headers.get('content-type') || '',
  };
};
