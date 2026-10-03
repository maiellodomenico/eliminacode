import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export type TotemConfig = {
  stationId: string;
  adminPin: string;
  printerName: string;
  printerEnabled: boolean;
  ticketWidthMm: 58 | 80;
  ticketCopies: number;
  showLogo: boolean;
  showDateTime: boolean;
  showPeopleAhead: boolean;
  showQrOnPaper: boolean;
  title: string;
  subtitle: string;
  footer: string;
  numberFontSize: number;
  departmentFontSize: number;
  autoResetSeconds: number;
};

const defaults: TotemConfig = {
  stationId: 'TOTEM-001',
  adminPin: '1234',
  printerName: '',
  printerEnabled: false,
  ticketWidthMm: 80,
  ticketCopies: 1,
  showLogo: true,
  showDateTime: true,
  showPeopleAhead: true,
  showQrOnPaper: true,
  title: 'ELIMINACODE',
  subtitle: 'Il tuo turno',
  footer: 'Conserva il ticket e attendi la chiamata',
  numberFontSize: 64,
  departmentFontSize: 22,
  autoResetSeconds: 20
};

function filePath(){ return path.join(app.getPath('userData'),'totem-config.json'); }

export function loadConfig(): TotemConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath(),'utf8'));
    return {...defaults, ...raw};
  } catch { return {...defaults}; }
}

export function saveConfig(next: Partial<TotemConfig>): TotemConfig {
  const merged = {...loadConfig(), ...next};
  fs.mkdirSync(path.dirname(filePath()),{recursive:true});
  fs.writeFileSync(filePath(), JSON.stringify(merged,null,2),'utf8');
  return merged;
}
