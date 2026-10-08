import { useCallback, useEffect, useState } from 'react';

export type NotificationState = NotificationPermission | 'unsupported';

function readPermission(): NotificationState {
  try {
    return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
  } catch {
    return 'unsupported';
  }
}

/** The browser's notification permission, kept in sync if the user changes it in site settings. */
export function useNotificationPermission(): {
  permission: NotificationState;
  request: () => Promise<NotificationState>;
} {
  const [permission, setPermission] = useState<NotificationState>(readPermission);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return;
    let status: PermissionStatus | null = null;
    let cancelled = false;
    const onChange = () => setPermission(readPermission());
    navigator.permissions
      .query({ name: 'notifications' })
      .then((s) => {
        if (cancelled) return;
        status = s;
        s.addEventListener('change', onChange);
      })
      .catch(() => {
        /* Some browsers can't query this permission — the button still works. */
      });
    return () => {
      cancelled = true;
      status?.removeEventListener('change', onChange);
    };
  }, []);

  const request = useCallback(async (): Promise<NotificationState> => {
    if (readPermission() === 'unsupported') return 'unsupported';
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    } catch {
      const current = readPermission();
      setPermission(current);
      return current;
    }
  }, []);

  return { permission, request };
}
