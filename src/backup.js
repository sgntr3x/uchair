import { exportAll } from './db.js';
import { saveSettings } from './store.js';

const pad = (n) => String(n).padStart(2, '0');

/** Yedek dosyasını Paylaş menüsüyle gönderir (iCloud/WhatsApp/Dosyalar). Başarılıysa true. */
export async function runBackup() {
  const data = await exportAll();
  const d = new Date();
  const name = `uChair-yedek-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
  const file = new File([JSON.stringify(data)], name, { type: 'application/json' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'uChair yedek' });
    } catch (e) {
      if (e.name === 'AbortError') return false; // kullanıcı vazgeçti
      return download(file); // paylaşım başarısız: indirmeyi dene
    }
    await saveSettings({ lastBackupAt: new Date().toISOString() });
    return true;
  }
  return download(file);
}

async function download(file) {
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  await saveSettings({ lastBackupAt: new Date().toISOString() });
  return true;
}

export async function readBackupFile(file) {
  const data = JSON.parse(await file.text());
  if (!data || !Array.isArray(data.customers) || !Array.isArray(data.appointments)) throw new Error('Geçerli bir uChair yedeği değil');
  return data;
}
