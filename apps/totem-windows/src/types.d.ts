export {};
declare global {
  interface Window {
    kiosk: {
      printTicket: (ticket: any) => Promise<{ok:boolean;message?:string}>;
      getConfig: () => Promise<any>;
    }
  }
}
