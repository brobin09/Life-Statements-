import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

const isLocal = (h: string) => h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(h);

function initialUrl(): string {
  try { const u = new URL(window.location.href); u.hash = ''; u.search = ''; return isLocal(u.hostname) ? '' : u.href; } catch { return ''; }
}

/** QR code for the address where this app is hosted, so a phone can open it and install it. */
export function InstallPanel() {
  const [url, setUrl] = useState(initialUrl);
  const [png, setPng] = useState<string | null>(null);
  let parsed: URL | null = null;
  try { parsed = url.trim() ? new URL(url.trim()) : null; } catch { parsed = null; }
  const valid = !!parsed && (parsed.protocol === 'https:' || parsed.protocol === 'http:');

  useEffect(() => {
    let live = true;
    if (!valid) { setPng(null); return; }
    QRCode.toDataURL(parsed!.href, { margin: 2, width: 240, errorCorrectionLevel: 'M' }).then((d) => live && setPng(d)).catch(() => live && setPng(null));
    return () => { live = false; };
  }, [valid, parsed?.href]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card">
      <h2>Use on your iPhone</h2>
      <p className="muted small">
        A QR code can only carry a web address, so it points to wherever this app is hosted. Your data is never part of it and stays on each device.
      </p>
      <label className="small muted">Address where the app is hosted
        <input value={url} placeholder="https://your-site.example/life-statements/" inputMode="url" autoCapitalize="off" autoCorrect="off"
          onChange={(e) => setUrl(e.target.value)} style={{ width: '100%' }} aria-label="App address" />
      </label>
      {url.trim() !== '' && !valid && <p className="error small" role="alert">Enter a full address starting with https://</p>}
      {valid && parsed!.protocol === 'http:' && <p className="small">This address is not secure (http). It will open, but your phone can only install it and use it offline over https.</p>}
      {valid && png && (
        <figure className="qr">
          <img src={png} width={240} height={240} alt={`QR code for ${parsed!.href}`} />
          <figcaption className="small muted">Point the iPhone camera at this code.</figcaption>
        </figure>
      )}
      <ol className="small">
        <li>Scan the code and open the link in <strong>Safari</strong>.</li>
        <li>Tap the Share button, then <strong>Add to Home Screen</strong>.</li>
        <li>Open it from the home screen. After the first load it works offline.</li>
      </ol>
      <p className="muted small">Phone and computer don’t sync. To move your data between them, use backup and restore on the Export tab.</p>
    </div>
  );
}
