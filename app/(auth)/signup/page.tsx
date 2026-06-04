import { redirect } from 'next/navigation';

// Public signup is disabled — accounts are created by platform admin only
export default function SignupPage() {
  redirect('/login');
}
