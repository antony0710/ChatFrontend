import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { Provider } from './components/ui/provider.tsx';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MyLayout from './MyLayout.tsx';
import DYSChat from './DYSChat.tsx';
import FirstPage from './FirstPage.tsx';
export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MyLayout />}>
          <Route index element={<App />} />
          <Route path="dys-chat" element={<DYSChat />} />
          <Route path="first-page" element={<FirstPage />} />
        </Route>

      </Routes>
    </BrowserRouter>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider>
      <AppRoutes />
    </Provider>
  </StrictMode>,
)
