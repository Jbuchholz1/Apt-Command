import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { msalConfig } from './lib/authConfig';
import { initApi } from './lib/api';
import './index.css';
import App from './App.jsx';

const msalInstance = new PublicClientApplication(msalConfig);

// Give the API module access to MSAL so it can attach tokens to requests
initApi(msalInstance);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MsalProvider instance={msalInstance}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </MsalProvider>
  </StrictMode>,
);
