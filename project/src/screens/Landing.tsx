import { Link } from 'react-router-dom';
import { Shield, Users, MapPin, Heart, ArrowRight } from 'lucide-react';
import { Logo, Disclaimer } from '@/components/ui';

export function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 via-white to-teal-accent-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex flex-col">
      <div className="flex-1 max-w-md mx-auto w-full px-6 py-8 flex flex-col">
        <div className="flex justify-between items-center mb-12">
          <Logo size="md" />
        </div>

        <div className="flex-1 flex flex-col justify-center gap-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white leading-tight">
              Walk safe, <span className="text-brand-700 dark:text-brand-300">together</span>.
            </h1>
            <p className="mt-3 text-gray-600 dark:text-gray-400 text-lg">
              A peer-transit and safety companion for female students and staff of MANIT Bhopal.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: Users, title: 'Find companions', desc: 'Match with students walking the same route' },
              { icon: Shield, title: 'One-tap SOS', desc: 'Instant alert to campus security and contacts' },
              { icon: MapPin, title: 'Live tracking', desc: 'Real-time location sharing with companions' },
              { icon: Heart, title: 'Trust built in', desc: 'Verified profiles, ratings, and safety index' },
            ].map((f) => (
              <div key={f.title} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                <f.icon size={24} className="text-brand-600 dark:text-brand-400 mb-2" />
                <p className="font-semibold text-sm text-gray-900 dark:text-white">{f.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <Link to="/auth" className="btn-primary w-full text-lg">
              Get Started <ArrowRight size={20} />
            </Link>
            <Link to="/demo" className="btn-secondary w-full">
              Try Demo
            </Link>
          </div>

          <Disclaimer />
        </div>
      </div>
    </div>
  );
}
