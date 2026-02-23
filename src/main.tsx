import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import { ProfileProvider } from './context/ProfileContext';
import { AlertProvider } from './context/AlertContext';
import { RadioProvider } from './context/RadioContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ProfileProvider>
        <AlertProvider>
          <RadioProvider>
            <App />
          </RadioProvider>
        </AlertProvider>
      </ProfileProvider>
    </ThemeProvider>
  </StrictMode>,
);
