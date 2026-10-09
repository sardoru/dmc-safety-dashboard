import { useEffect, useState } from 'react';
import { Copy, Download, Printer, QrCode } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Overlay';
import { joinLink, type AccessCode } from './membership';

/** QR card for a code: scan → /join?code=… with the code filled in. */
export default function AccessCodeQr({ code, onClose }: { code: AccessCode | null; onClose: () => void }) {
  const { push } = useToast();
  const [png, setPng] = useState<string | null>(null);
  const link = code ? joinLink(code.code) : '';

  useEffect(() => {
    if (!code) return;
    let active = true;
    // Loaded on demand — the QR library only ships when someone opens this.
    import('qrcode')
      .then((QR) => QR.toDataURL(joinLink(code.code), { margin: 1, width: 640, color: { dark: '#0b1222', light: '#ffffff' } }))
      .then((url) => {
        if (active) setPng(url);
      })
      .catch(() => {
        if (active) setPng(null);
      });
    return () => {
      active = false;
      setPng(null);
    };
  }, [code]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      push({ title: 'Invite link copied', body: link, tone: 'success' });
    } catch {
      window.prompt('Copy this link', link);
    }
  };

  const print = () => {
    if (!code || !png) return;
    const w = window.open('', '_blank', 'width=640,height=820');
    if (!w) return;
    const role = code.role === 'officer' ? 'public-safety officer' : 'member business';
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${code.code} · Join the Downtown safety network</title>
<style>body{font-family:Inter,system-ui,sans-serif;color:#0b1222;margin:0;display:flex;justify-content:center;padding:40px}
.card{width:420px;border:2px solid #c5a55a;border-radius:24px;padding:32px;text-align:center}
.k{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#8c7032;font-weight:700}
h1{font-size:24px;margin:10px 0 4px}p{color:#3d4658;margin:6px 0 0;font-size:14px}
img{width:280px;height:280px;margin:22px auto 10px;display:block}
.code{font:700 30px/1.2 ui-monospace,Menlo,monospace;letter-spacing:.12em;margin-top:8px}
.foot{margin-top:18px;font-size:12px;color:#586174}</style></head><body><div class="card">
<div class="k">Core Downtown Memphis · Safety Dashboard</div>
<h1>Join the Downtown safety network</h1><p>Scan to join as a ${role}. No password needed.</p>
<img src="${png}" alt="QR code"><div class="code">${code.code}</div>
<p>or go to <b>${window.location.host}/join</b> and enter the code</p>
<div class="foot">In danger? Call 911 first — this dashboard is not an emergency line.</div>
</div><script>onload=()=>{print()}</script></body></html>`);
    w.document.close();
  };

  return (
    <Dialog
      open={code !== null}
      onClose={onClose}
      size="sm"
      icon={<QrCode className="h-5 w-5" />}
      title={code ? `Access code ${code.code}` : ''}
      description={code?.label || undefined}
      footer={
        <>
          <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => void copy()}>
            Copy link
          </Button>
          {png && (
            <a href={png} download={`${code?.code ?? 'access-code'}.png`} className="contents">
              <Button variant="secondary" icon={<Download className="h-4 w-4" />}>
                PNG
              </Button>
            </a>
          )}
          <Button icon={<Printer className="h-4 w-4" />} onClick={print} disabled={!png}>
            Print card
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center text-center">
        {png ? (
          <img src={png} alt={`QR code that opens ${link}`} className="h-56 w-56 rounded-2xl border border-line bg-white p-2" />
        ) : (
          <div className="h-56 w-56 animate-pulse rounded-2xl bg-surface-3" aria-hidden />
        )}
        <p className="mt-4 font-mono text-2xl font-bold tracking-[0.12em] text-ink">{code?.code}</p>
        <p className="mt-1 break-all text-[12px] text-muted">{link}</p>
      </div>
    </Dialog>
  );
}
