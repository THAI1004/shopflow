export function parseSellerText(text:string):any[];
export function makeBookmarklet(origin:string):string;
export function decodeImportFragment(raw:string):any[];
export function readOrderFile(file:File):Promise<any[]>;
export function ordersFromRows(rows:any[][]):any[];
export function csvRows(text:string):string[][];
