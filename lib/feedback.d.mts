export function packingAnnouncement(order:any):string;
export function createScanFeedback(env?:any,onSpeechIssue?:(message:string)=>void):{prime:()=>Promise<void>;success:()=>void;speak:(text:string)=>boolean;close:()=>void};
