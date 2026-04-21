'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Zap, BarChart3, Brain, TrendingUp } from 'lucide-react';
import { useAuthStore } from '@/lib/store';

// ✅ IMPORT THIS
import { connectMetaAds } from '@/lib/connectMeta';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

const features = [
  { icon: BarChart3, label: 'Real-time campaign analytics', color: 'text-brand-400' },
  { icon: Brain, label: 'AI-powered optimization', color: 'text-accent-cyan' },
  { icon: TrendingUp, label: 'Anomaly detection & alerts', color: 'text-accent-green' },
  { icon: Zap, label: 'Automated health scoring', color: 'text-accent-amber' },
];

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      await login(data.email, data.password);
      router.push('/');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Login failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-surface-1000 grid-bg flex">
      {/* Left — Brand Panel */}
      <div className="hidden lg:flex flex-col justify-between w-[480px] shrink-0 bg-gradient-to-b from-surface-950 to-surface-1000 border-r border-white/5 p-12">
        <div>
          <div className="flex items-center gap-2.5 mb-16">
            <div className="w-8 h-8 rounded-lg bg-gradient-brand flex items-center justify-center">
              <Zap size={16} className="text-white" />
            </div>
            <span className="font-semibold text-lg">AdInsight</span>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h1 className="text-4xl font-bold text-white leading-tight mb-4">
              Your Meta Ads,{' '}
              <span className="text-gradient">Intelligently Managed</span>
            </h1>
            <p className="text-surface-400 text-lg leading-relaxed">
              Stop leaving money on the table. AdInsight analyzes your campaigns 24/7,
              detects issues before they cost you, and tells you exactly what to do.
            </p>
          </motion.div>

          <div className="mt-10 space-y-4">
            {features.map((f, i) => (
              <motion.div
                key={f.label}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-lg bg-surface-900 border border-white/5 flex items-center justify-center shrink-0">
                  <f.icon size={15} className={f.color} />
                </div>
                <span className="text-surface-300 text-sm">{f.label}</span>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="border-t border-white/5 pt-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex -space-x-2">
              {['#5b63f8','#22d3ee','#4ade80'].map((c, i) => (
                <div key={i} className="w-7 h-7 rounded-full border-2 border-surface-950" style={{ background: c }} />
              ))}
            </div>
            <p className="text-surface-400 text-xs">
              <span className="text-white font-medium">2,400+ marketers</span> trust AdInsight
            </p>
          </div>
          <div className="flex gap-1">
            {[...Array(5)].map((_, i) => (
              <span key={i} className="text-accent-amber text-sm">★</span>
            ))}
            <span className="text-surface-400 text-xs ml-1">4.9/5 across 800+ reviews</span>
          </div>
        </div>
      </div>

      {/* Right — Login Form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-[400px]"
        >
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-gradient-brand flex items-center justify-center">
              <Zap size={16} className="text-white" />
            </div>
            <span className="font-semibold text-lg">AdInsight</span>
          </div>

          <h2 className="text-2xl font-bold text-white mb-1">Welcome back</h2>
          <p className="text-surface-400 text-sm mb-8">Sign in to your account to continue</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Email address</label>
              <input {...register('email')} type="email" placeholder="you@company.com" className="input" />
              {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input {...register('password')} type={showPassword ? 'text' : 'password'} className="input pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password.message}</p>}
            </div>

            <button type="submit" disabled={isLoading} className="btn-primary w-full py-3">
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          {/* ✅ META BUTTON FIXED */}
          <button
            onClick={connectMetaAds}
            className="btn-secondary w-full py-3 gap-3 mt-4"
          >
            Continue with Meta
          </button>

          <p className="text-center text-sm mt-6">
            Don&apos;t have an account?{' '}
            <Link href="/signup">Sign up free</Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}