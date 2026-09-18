import React, { createContext, useContext, useState, useEffect } from 'react';
import { Admin } from '../types';
import { StorageService } from '../services/db';

interface AuthContextType {
  currentAdmin: Admin | null;
  hasAdminRegistered: boolean;
  login: (identifier: string, pass: string) => Promise<boolean>;
  registerAdmin: (data: Omit<Admin, 'id' | 'createdAt'> & { password: string }) => Promise<Admin>;
  updateAdminProfile: (updates: Partial<Admin>) => Promise<Admin>;
  changePassword: (newPassword: string) => Promise<boolean>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentAdmin, setCurrentAdmin] = useState<Admin | null>(null);
  const [hasAdminRegistered, setHasAdminRegistered] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const checkAdminState = () => {
      setHasAdminRegistered(true);

      const savedAdminSession = localStorage.getItem('sb_active_session');
      if (savedAdminSession) {
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
    const storedPass = localStorage.getItem('sb_admin_pass') || (admins[0] as any)?.password || '123456';

    const cleanInput = identifier.trim().toLowerCase();
    const matched = admins.find(
      (a) =>
        a.mobile.trim() === identifier.trim() ||
        (a.email && a.email.trim().toLowerCase() === cleanInput)
    );

    if (matched && storedPass === pass) {
      setCurrentAdmin(matched);
      localStorage.setItem('sb_active_session', JSON.stringify(matched));
      return true;
    }
    return false;
  };

  const registerAdmin = async (
    _data: Omit<Admin, 'id' | 'createdAt'> & { password: string }
  ): Promise<Admin> => {
    throw new Error('नवीन प्रशासक नोंदणी बंद करण्यात आलेली आहे. कृपया थेट लॉगिन करा.');
  };

  const updateAdminProfile = async (updates: Partial<Admin>): Promise<Admin> => {
    if (!currentAdmin) throw new Error('कोणताही प्रशासक लॉगिन नाही.');
    const updated = StorageService.updateAdmin(currentAdmin.id, updates);
    setCurrentAdmin(updated);
    localStorage.setItem('sb_active_session', JSON.stringify(updated));
    return updated;
  };

  const changePassword = async (newPassword: string): Promise<boolean> => {
    if (!newPassword || newPassword.trim().length < 4) {
      throw new Error('नवीन पासवर्ड किमान ४ अक्षरांचा असावा.');
    }
    await StorageService.updateAdminPassword(newPassword.trim());
    return true;
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
        changePassword,
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
