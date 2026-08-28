import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { IconTrendingUp, IconClock, IconMapPin, IconArrowLeft } from '@tabler/icons-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card, CardContent } from '../components/ui/Card';
import { Checkbox } from '../components/ui/Checkbox';
import { Alert } from '../components/ui/Alert';
import { useAuth } from '../contexts/AuthContext';
import { loginMockUser, quickLoginMockUser } from '../services/authService';

/**
 * Quick Login options, labeled by account scope only — no seeded email or
 * password lives in the client bundle. Each card sends its opaque `scope` to
 * `POST /api/auth/quick-login`, which resolves it to a demo user server-side
 * (`resolveQuickLoginUser`, `api/_lib/demoUsers.ts`) and mints the same
 * signed `ggx_session` cookie manual login does (see `handleQuickLogin`).
 *
 * Rendered on every environment, including hosted Vercel Preview/Production
 * (§21.7 reverted the earlier deploy-tier gate on both the client and
 * `api/auth/quick-login.ts`) — the fixed scope→user mapping is the security
 * boundary, not build target. See
 * docs/migration/ggx-corporate-heyq-live-ticketing.md §21.7.
 */
export const QUICK_LOGIN_ACCOUNTS = [
  {
    scope: 'main',
    label: 'Main Account',
    description: 'Access to the main corporate account with broader administrative capabilities.',
  },
  {
    scope: 'subaccount',
    label: 'Subaccount',
    description: 'Access scoped to a managed subaccount for day-to-day operations.',
  },
] as const;

export function Login() {
  const navigate = useNavigate();
  const { isAuthenticated, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [showForgotHelp, setShowForgotHelp] = useState(false);
  const [registerData, setRegisterData] = useState({
    companyName: '',
    monthlyVolume: '',
    avgProductPrice: '',
    fullName: '',
    phoneNumber: '',
    email: '',
    websiteUrl: '',
    remarks: '',
  });

  // Already signed in → skip Login.
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    // Credential validation happens server-side (see authService/api/auth/login.ts).
    const result = await loginMockUser(email.trim().toLowerCase(), password);
    if (result.success && result.user) {
      const u = result.user;
      // Map the richer service user to the context's AuthUser shape.
      login({
        name: u.name,
        email: u.email,
        role: u.role,
        accountId: u.accountId,
        accountName: u.accountName,
      });
      navigate('/dashboard');
    } else {
      alert('Invalid email or password.');
    }
  };

  const handleQuickLogin = async (account: (typeof QUICK_LOGIN_ACCOUNTS)[number]) => {
    // Same signed-session path as manual login — resolves the seeded account
    // server-side from an opaque scope, never a credential held here.
    const result = await quickLoginMockUser(account.scope);
    if (result.success && result.user) {
      const u = result.user;
      login({
        name: u.name,
        email: u.email,
        role: u.role,
        accountId: u.accountId,
        accountName: u.accountName,
      });
      navigate('/dashboard');
    } else {
      alert('Quick Login failed. Please try again or sign in manually.');
    }
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Thank you for your interest! Our team will contact you shortly.');
    setShowRegister(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl grid lg:grid-cols-2 gap-8 items-center">
        <div className="order-1 lg:order-1">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-6">
              <img
                src="https://gogoxpress.com/wp-content/uploads/2022/07/gogox-logo.png"
                alt="GoGo Xpress"
                className="h-10 w-auto"
              />
              <div className="flex items-center leading-tight">
                <span className="italic font-light text-[24px] text-gray-700">Business+</span>
              </div>
            </div>
            {!showRegister ? (
              <>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome back</h1>
                <p className="text-gray-600">
                  Manage your business shipments, billing, analytics, and API access in one place.
                </p>
              </>
            ) : (
              <>
                <button
                  onClick={() => setShowRegister(false)}
                  className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4"
                >
                  <IconArrowLeft className="w-4 h-4" />
                  Back to login
                </button>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Join GoGo Xpress Business+</h1>
                <p className="text-gray-600">
                  Start managing your business deliveries efficiently. Our team will reach out to set up your account.
                </p>
              </>
            )}
          </div>

          <Card>
            <CardContent className="p-6">
              {!showRegister ? (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                      Email address
                    </label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@yourcompany.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                      Password
                    </label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <label className="flex items-center gap-2">
                      <Checkbox />
                      <span className="text-gray-700">Remember me</span>
                    </label>
                    <button type="button" onClick={() => setShowForgotHelp(!showForgotHelp)} className="text-blue-600 hover:text-blue-700 font-medium">Forgot password?</button>
                  </div>

                  {showForgotHelp && (
                    <Alert variant="info">
                      Password resets aren&apos;t available yet. Please email{' '}
                      <a href="mailto:support@gogoxpress.com" className="font-medium underline hover:text-blue-700">support@gogoxpress.com</a>{' '}
                      and our team will help you regain access.
                    </Alert>
                  )}

                  <Button type="submit" className="w-full">Sign in</Button>

                  <div className="relative pt-2">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-200" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="px-2 bg-white text-gray-500 font-medium">Quick Login</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {QUICK_LOGIN_ACCOUNTS.map((account) => (
                      <button
                        key={account.scope}
                        type="button"
                        onClick={() => handleQuickLogin(account)}
                        className="flex flex-col items-start gap-0.5 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-left hover:bg-gray-50 hover:border-gray-400 transition-colors"
                      >
                        <span className="text-sm font-medium text-gray-900">{account.label}</span>
                        <span className="text-[11px] text-gray-500 leading-snug">{account.description}</span>
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-300" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-2 bg-white text-gray-500">Or continue with</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <button type="button" disabled title="Coming soon" className="flex flex-col items-center justify-center gap-2 px-3 py-4 rounded-lg border border-gray-300 bg-white opacity-60 cursor-not-allowed transition-colors">
                      <svg className="w-6 h-6" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" fill="#1877F2" />
                      </svg>
                      <span className="text-xs font-medium text-gray-700">Facebook</span>
                    </button>
                    <button type="button" disabled title="Coming soon" className="flex flex-col items-center justify-center gap-2 px-3 py-4 rounded-lg border border-gray-300 bg-white opacity-60 cursor-not-allowed transition-colors">
                      <svg className="w-6 h-6" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                      </svg>
                      <span className="text-xs font-medium text-gray-700">Google</span>
                    </button>
                    <button type="button" disabled title="Coming soon" className="flex flex-col items-center justify-center gap-2 px-3 py-4 rounded-lg border border-gray-300 bg-white opacity-60 cursor-not-allowed transition-colors">
                      <svg className="w-6 h-6" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" fill="#000000" />
                      </svg>
                      <span className="text-xs font-medium text-gray-700">Apple</span>
                    </button>
                  </div>

                  <div className="text-center pt-2">
                    <button type="button" onClick={() => setShowRegister(true)} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                      Don't have an account? Register here
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-blue-900 font-medium mb-2">Why choose GoGo Xpress Business+?</p>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>• Dedicated account management and support</li>
                      <li>• Volume-based pricing and discounts</li>
                      <li>• Advanced API integration for your systems</li>
                      <li>• Real-time tracking and analytics dashboard</li>
                    </ul>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Company Name *</label>
                    <Input required placeholder="Your company name" value={registerData.companyName} onChange={(e) => setRegisterData({ ...registerData, companyName: e.target.value })} />
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Monthly Volume *</label>
                      <Select required value={registerData.monthlyVolume} onChange={(e) => setRegisterData({ ...registerData, monthlyVolume: e.target.value })}>
                        <option value="">Select range</option>
                        <option value="1-50">1-50</option>
                        <option value="51-100">51-100</option>
                        <option value="101-250">101-250</option>
                        <option value="251-500">251-500</option>
                        <option value="501-1000">501-1000</option>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Average Product Price *</label>
                      <Select required value={registerData.avgProductPrice} onChange={(e) => setRegisterData({ ...registerData, avgProductPrice: e.target.value })}>
                        <option value="">Select range</option>
                        <option value="below-500">Below Php 500</option>
                        <option value="500-999">Php 500 - Php 999</option>
                        <option value="1000-1499">Php 1000 - Php 1499</option>
                        <option value="above-1500">Above Php 1500</option>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
                    <Input required placeholder="Your full name" value={registerData.fullName} onChange={(e) => setRegisterData({ ...registerData, fullName: e.target.value })} />
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number *</label>
                      <Input required type="tel" placeholder="+63 912 345 6789" value={registerData.phoneNumber} onChange={(e) => setRegisterData({ ...registerData, phoneNumber: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Email *</label>
                      <Input required type="email" placeholder="your@email.com" value={registerData.email} onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Website URL</label>
                    <Input type="url" placeholder="https://yourcompany.com" value={registerData.websiteUrl} onChange={(e) => setRegisterData({ ...registerData, websiteUrl: e.target.value })} />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Remarks</label>
                    <textarea
                      className="w-full h-24 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="Any additional information you'd like to share..."
                      value={registerData.remarks}
                      onChange={(e) => setRegisterData({ ...registerData, remarks: e.target.value })}
                    />
                  </div>

                  <Button type="submit" className="w-full">Submit Registration</Button>

                  <div className="text-center pt-2">
                    <button type="button" onClick={() => setShowRegister(false)} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                      Already have an account? Login here
                    </button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>

          {!showRegister && (
            <p className="text-sm text-gray-600 text-center mt-6">
              Need help? Contact{' '}
              <a href="mailto:support@gogoxpress.com" className="text-blue-600 hover:text-blue-700 font-medium">support@gogoxpress.com</a>
            </p>
          )}
        </div>

        <div className="order-2 lg:order-2">
          <Card className="bg-gradient-to-br from-blue-600 to-blue-700 border-blue-700">
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold text-white mb-6">Your logistics command center</h2>
              <div className="space-y-4">
                {[
                  { icon: IconTrendingUp, title: 'Flexible Pricing', desc: 'Fixed, volumetric, weight-based, and tiered pricing options that align with your operational needs.' },
                  { icon: IconClock, title: 'Seamless Booking', desc: 'Effortlessly integrate our API for automated booking processes and efficient operations.' },
                  { icon: IconMapPin, title: 'Tailored Data Analytics', desc: 'Track KPIs and gain valuable insights for informed decisions and optimized performance.' },
                  { icon: IconTrendingUp, title: 'Exclusive Business+ Support', desc: 'Priority service and personalized care for seamless operations and customer satisfaction.' },
                ].map((f, i) => (
                  <div key={i} className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                        <f.icon className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-white mb-1">{f.title}</div>
                        <div className="text-sm text-blue-100">{f.desc}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 pt-6 border-t border-white/20">
                <p className="text-sm text-blue-100">
                  Trusted by businesses across the Philippines for reliable business logistics solutions.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
