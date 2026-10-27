import api from '../services/api';
import { ResetPasswordForm } from '../components/auth/PasswordReset';

const ResetPassword = () => <ResetPasswordForm client={api} />;

export default ResetPassword;
