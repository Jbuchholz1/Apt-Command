const TENANT_ID = import.meta.env.VITE_AZURE_TENANT_ID;
const CLIENT_ID = import.meta.env.VITE_AZURE_CLIENT_ID;

if (!TENANT_ID || !CLIENT_ID) {
  if (import.meta.env.DEV) {
    console.error('VITE_AZURE_TENANT_ID and VITE_AZURE_CLIENT_ID must be set');
  }
}

export const msalConfig = {
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage', // Clears on tab close — good for shared workstations
    storeAuthStateInCookie: false,
  },
};

// Scopes requested during login
export const loginRequest = {
  scopes: ['User.Read'],
};
