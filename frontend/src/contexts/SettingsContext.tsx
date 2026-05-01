import React, { createContext, useContext, useState, useEffect } from 'react';
import { getSettings } from '@/lib/services';

interface SettingsContextType {
  business: {
    nameTH: string;
    nameEN: string;
    phone: string;
    address: string;
  };
  lending: {
    defaultInterestRate: number;
    lateFeePerDay: number;
    deductInterestUpfront: boolean;
  };
  refreshSettings: () => Promise<void>;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [business, setBusiness] = useState({
    nameTH: 'มั่งมี การเงิน',
    nameEN: 'LoanDesk Pro',
    phone: '',
    address: ''
  });
  const [lending, setLending] = useState({
    defaultInterestRate: 2,
    lateFeePerDay: 50,
    deductInterestUpfront: true
  });

  const refreshSettings = async () => {
    try {
      const data = await getSettings();
      if (data.business_profile) {
        setBusiness(prev => ({
          ...prev,
          ...data.business_profile
        }));
      }
      if (data.lending_config) {
        setLending(prev => ({
          ...prev,
          ...data.lending_config
        }));
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshSettings();
  }, []);

  // Update document title whenever business name changes
  useEffect(() => {
    const th = business.nameTH || 'มั่งมี การเงิน';
    const en = business.nameEN || 'LoanDesk Pro';
    document.title = `${th} | ${en}`;
  }, [business]);

  return (
    <SettingsContext.Provider value={{ business, lending, refreshSettings, loading }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
