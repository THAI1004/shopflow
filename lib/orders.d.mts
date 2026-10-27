export const tz:string;
export function day(value?:string|Date):string;
export function normalizeOrders(input:any):any[];
export function pendingFor(orders:any[],date:string):any[];
export function pickList(orders:any[]):any[];
export function csv(rows:any[][]):string;
export function mergeOrder(previous:any,incoming:any):any;

export function filterOrderDate(order:any,date:string,mode?:string,field?:string):boolean;
