import React from 'react';
import ReactDOM from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { ptBR } from '@mui/material/locale';
import App from './App';

const theme = createTheme(
  {
    palette: { primary: { main: '#2d3277' }, secondary: { main: '#00a650' }, background: { default: '#f5f5f7' } },
    components: { MuiTextField: { defaultProps: { size: 'small', fullWidth: true } }, MuiSelect: { defaultProps: { size: 'small' } } },
  },
  ptBR,
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
