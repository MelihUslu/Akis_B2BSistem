import React from 'react';
import api from '../services/api';
import { useTenant } from '../context/TenantContext';
import { ForgotPasswordForm } from '../components/auth/PasswordReset';

const ForgotPassword = () => {
  const { tenant } = useTenant();
  return <ForgotPasswordForm client={api} brand={tenant?.name} />;
};

export default ForgotPassword;
