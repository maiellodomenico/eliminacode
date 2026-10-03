export {};
declare global {
  interface Window {
    kiosk: {
      printTicket:(ticket:any)=>Promise<{ok:boolean;message?:string}>;
      getConfig:()=>Promise<any>;
      saveConfig:(config:any)=>Promise<any>;
      listPrinters:()=>Promise<any[]>;
      openPrinterSettings:()=>Promise<void>;
      testPrint:()=>Promise<{ok:boolean;message?:string}>;
      exitKiosk:()=>Promise<boolean>;
      enterKiosk:()=>Promise<boolean>;
    }
  }
}
