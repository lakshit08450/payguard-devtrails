import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../api';
import { T } from '../i18n';

const AppCtx = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [admin, setAdmin] = useState(() => {
    const token = localStorage.getItem('pg_admin_token');
    const username = localStorage.getItem('pg_admin_user');
    return token && username ? { token, username, role: 'admin' } : null;
  });
  const [selectedRole, setSelectedRole] = useState(localStorage.getItem('pg_role') || 'worker');
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState(localStorage.getItem('pg_lang') || 'en');
  const [theme, setTheme] = useState(localStorage.getItem('pg_theme') || 'dark');
  const t = T[lang] || T.en;

  useEffect(() => {
    const token = localStorage.getItem('pg_token');
    if (token) {
      authAPI.me().then(r => setUser(r.data.user)).catch(() => localStorage.removeItem('pg_token')).finally(() => setLoading(false));
    } else { setLoading(false); }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('pg_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('pg_role', selectedRole);
  }, [selectedRole]);

  const login = (token, userData) => {
    localStorage.removeItem('pg_admin_token');
    localStorage.removeItem('pg_admin_user');
    setAdmin(null);
    localStorage.setItem('pg_token', token);
    setUser(userData);
    setSelectedRole('worker');
  };
  const logout = () => {
    localStorage.removeItem('pg_token');
    setUser(null);
  };
  const loginAdmin = (token, adminData) => {
    localStorage.removeItem('pg_token');
    setUser(null);
    localStorage.setItem('pg_admin_token', token);
    localStorage.setItem('pg_admin_user', adminData.username);
    setAdmin({ token, username: adminData.username, role: 'admin' });
    setSelectedRole('admin');
  };
  const logoutAdmin = () => {
    localStorage.removeItem('pg_admin_token');
    localStorage.removeItem('pg_admin_user');
    setAdmin(null);
  };
  const changeLang = (l) => { setLang(l); localStorage.setItem('pg_lang', l); };
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <AppCtx.Provider
      value={{
        user,
        setUser,
        admin,
        selectedRole,
        setSelectedRole,
        loading,
        login,
        logout,
        loginAdmin,
        logoutAdmin,
        lang,
        changeLang,
        theme,
        toggleTheme,
        t,
      }}
    >
      {children}
    </AppCtx.Provider>
  );
}

export const useApp = () => useContext(AppCtx);
