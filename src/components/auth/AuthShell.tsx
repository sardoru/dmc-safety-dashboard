import { Shield } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTheme } from '../../context/ThemeContext';

interface AuthShellProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export default function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  const { theme } = useTheme();
  const dark = theme === 'dark';

  return (
    <div
      className={`min-h-dvh flex flex-col items-center justify-center px-4 py-10 ${
        dark ? 'bg-surface-dark text-neutral-200' : 'bg-surface-light text-neutral-800'
      }`}
    >
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-6 justify-center">
          <div className="p-2 rounded-xl bg-navy-600">
            <Shield className="w-7 h-7 text-gold-400" />
          </div>
          <div>
            <h1
              className={`font-bold fluid-text-lg leading-tight ${
                dark ? 'text-gold-400' : 'text-navy-600'
              }`}
            >
              Core Downtown Memphis
            </h1>
            <p className={`fluid-text-xs ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
              Safety Dashboard
            </p>
          </div>
        </div>

        <div
          className={`rounded-2xl p-6 sm:p-7 ${
            dark ? 'bg-neutral-900 border border-white/10' : 'bg-white shadow-2xl'
          }`}
        >
          {title && <h2 className="font-bold fluid-text-xl mb-1">{title}</h2>}
          {subtitle && (
            <p className={`fluid-text-sm mb-5 ${dark ? 'text-neutral-400' : 'text-neutral-500'}`}>
              {subtitle}
            </p>
          )}
          {children}
        </div>

        {footer && (
          <div
            className={`text-center mt-5 fluid-text-sm ${
              dark ? 'text-neutral-500' : 'text-neutral-500'
            }`}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
