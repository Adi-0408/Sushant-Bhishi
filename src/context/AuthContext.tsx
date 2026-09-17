import React, { createContext, useContext, useState, useEffect } from 'react';
import { Admin } from '../types';
import { StorageService } from '../services/db';

interface AuthContextType {
  currentAdmin: Admin | null;
  hasAdminRegistered: boolean;
  login: (identifier: string, pass: string) => Promise<boolean>;
  registerAdmin: (data: Omit<Admin, 'id' | 'createdAt'> & { password: string }) => Promise<Admin>;
  updateAdminProfile: (updates: Partial<Admin>) => Promise<Admin>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentAdmin, setCurrentAdmin] = useState<Admin | null>(null);
  const [hasAdminRegistered, setHasAdminRegistered] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const checkAdminState = () => {
      const exists = StorageService.hasAdmin();
      setHasAdminRegistered(exists);

      const savedAdminSession = localStorage.getItem('sb_active_session');
      if (savedAdminSession && exists) {
        try {
          const adminObj = JSON.parse(savedAdminSession);
          setCurrentAdmin(adminObj);
        } catch {
          localStorage.removeItem('sb_active_session');
        }
      }
      setLoading(false);
    };

    checkAdminState();
  }, []);

  const login = async (identifier: string, pass: string): Promise<boolean> => {
    const admins = StorageService.getAdmins();
    const storedPass = localStorage.getItem('sb_admin_pass');

    const cleanInput = identifier.trim().toLowerCase();
    const matched = admins.find(
      (a) =>
        a.mobile.trim() === identifier.trim() ||
        (a.email && a.email.trim().toLowerCase() === cleanInput)
    );

    if (matched && storedPass && storedPass === pass) {
      setCurrentAdmin(matched);
      localStorage.setItem('sb_active_session', JSON.stringify(matched));
      return true;
    }
    return false;
  };

  const registerAdmin = async (
    data: Omit<Admin, 'id' | 'createdAt'> & { password: string }
  ): Promise<Admin> => {
    if (hasAdminRegistered) {
      throw new Error('प्रशासक खाते आधीपासून अस्तित्वात आहे. फक्त एकच प्रशासक तयार करता येतो.');
    }

    const { password, ...adminInfo } = data;
    const newAdmin = StorageService.createAdmin(adminInfo);
    localStorage.setItem('sb_admin_pass', password);

    // Explicitly DO NOT auto-login. Require explicit login step!
    setHasAdminRegistered(true);
    return newAdmin;
  };

  const updateAdminProfile = async (updates: Partial<Admin>): Promise<Admin> => {
    if (!currentAdmin) throw new Error('कोणताही प्रशासक लॉगिन नाही.');
    const updated = StorageService.updateAdmin(currentAdmin.id, updates);
    setCurrentAdmin(updated);
    localStorage.setItem('sb_active_session', JSON.stringify(updated));
    return updated;
  };

  const logout = () => {
    setCurrentAdmin(null);
    localStorage.removeItem('sb_active_session');
  };

  return (
    <AuthContext.Provider
      value={{
        currentAdmin,
        hasAdminRegistered,
        login,
        registerAdmin,
        updateAdminProfile,
        logout,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
