export function packingAnnouncement(order:any):string;
export function createScanFeedback(env?:any):{prime:()=>Promise<void>;success:()=>void;speak:(text:string)=>boolean;close:()=>void};
