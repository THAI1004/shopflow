(function(){
 const text=node=>(node?.innerText||node?.textContent||'').replace(/\s+/g,' ').trim();
 const moneyPattern=/-?\s*[₫đ]\s*-?\s*\d[\d.,]*|-?\s*\d[\d.,]*\s*[₫đ]/gi;
 const parseMoney=value=>{const digits=Number(value.replace(/[^0-9]/g,''));return /[-−]/.test(value)?-digits:digits;};
 const codePattern=/\b\d{6}[A-Z0-9]{8,12}\b/g;
 function extract(doc=document){
  const active=text(doc.querySelector('.eds-tabs__nav-tab--active, .shopee-tabs__nav-tab--active, [role="tab"][aria-selected="true"]'));
  const unpaid=/chưa thanh toán/i.test(active)||(!/đã thanh toán/i.test(active)&&new URL(location.href).searchParams.get('type')==='1');
  if(!unpaid)throw Error('Mở tab Chưa thanh toán trên trang Doanh thu Shopee trước khi đọc.');
  const headers=Array.from(doc.querySelectorAll('th,[role="columnheader"],.eds-table__header-cell,.shopee-table__header-cell'));
  const amountIndex=headers.findIndex(h=>/số tiền chưa thanh toán/i.test(text(h)));
  const candidates=new Set(doc.querySelectorAll('tr,[role="row"],.eds-table__row,.shopee-table__row,.income-item,.income-list-item'));
  // Some Seller versions use cards rather than table rows.
  for(const el of doc.querySelectorAll('span,a,div')){
   if(!/^\d{6}[A-Z0-9]{8,12}$/.test(text(el)))continue;
   for(let node=el.parentElement,depth=0;node&&depth<8;node=node.parentElement,depth++){
    const value=text(node),ids=[...new Set(value.match(codePattern)||[])];
    if(ids.length>1)break;
    if(ids.length===1&&/[₫đ]\s*[\d.,]+|[\d.,]+\s*[₫đ]/i.test(value)){candidates.add(node);break;}
   }
  }
  const overviewValues=new Set();
  for(const label of doc.querySelectorAll('div,span,h2,h3,h4,p')){
   if(text(label)!=='Chưa thanh toán')continue;
   for(let node=label.parentElement,depth=0;node&&depth<8;node=node.parentElement,depth++){
    const found=text(node).match(/Chưa thanh toán\s*Tổng cộng\s*([₫đ]\s*[\d.,]+|[\d.,]+\s*[₫đ])/i);
    if(found){const amount=Number(found[1].replace(/[^0-9]/g,''));if(Number.isSafeInteger(amount))overviewValues.add(amount);break;}
   }
  }
  const payoutOverviewTotal=overviewValues.size===1?[...overviewValues][0]:null,payoutOverviewReadAt=new Date().toISOString();
  const orders=new Map(),detectedIds=new Set();let skipped=0;
  for(const row of candidates){
   const value=text(row),ids=[...new Set(value.match(codePattern)||[])];if(ids.length!==1)continue;detectedIds.add(ids[0]);
   const cells=Array.from(row.querySelectorAll('td,[role="cell"],.eds-table__cell,.shopee-table__cell'));
   const amountText=amountIndex>=0&&cells[amountIndex]?text(cells[amountIndex]):value;
   const money=amountText.replace(/−/g,'-').match(moneyPattern)||[];
   if(money.length!==1){skipped++;continue;}
   const amount=parseMoney(money[0]);if(!Number.isSafeInteger(amount)){skipped++;continue;}
   const buyer=value.match(/Người mua\s*:\s*([^\s]+)/i)?.[1]||'';
   const payoutStage=value.match(/Đang chờ đơn hoàn tất|Đang tính toán|Đang thanh toán/i)?.[0]||'Chưa thanh toán';
   const payoutExpectedDay=value.match(/\b\d{2}\/\d{2}\/\d{4}\b/)?.[0]||'';
   orders.set(ids[0],{...(payoutOverviewTotal!==null?{payoutOverviewTotal,payoutOverviewReadAt}:{}),id:ids[0],buyer,items:[],status:'',pendingPayout:amount,payoutStatus:'unpaid',payoutStage,payoutExpectedDay,payoutReadAt:new Date().toISOString(),isPendingFinal:true});
  }
  const list=[...orders.values()];return {payoutOverviewTotal,payoutOverviewReadAt,orders:list,detectedOrderIds:[...detectedIds],currentTab:'Doanh thu · Chưa thanh toán',exactFinalCount:0,pendingPayoutTotal:list.reduce((sum,o)=>sum+o.pendingPayout,0),warnings:[...(skipped?['Một số dòng chưa đọc chắc chắn số tiền, đã bỏ qua.']:[]),'Chỉ tổng hợp các trang đã đọc. Chuyển trang Shopee rồi bấm Đọc để gộp đủ danh sách.']};
 }
 async function extractAll(doc=document){
  if(globalThis.__SHOPFLOW_FINANCE_READING__)throw Error('Đang đọc danh sách. Chờ hoàn tất.');
  globalThis.__SHOPFLOW_FINANCE_READING__=true;
  const orders=new Map(),detectedAll=new Set(),seenPages=new Set(),started=Date.now(),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  let latest,notice='',pages=0;
  const collect=()=>{const r=extract(doc);latest=r;for(const id of r.detectedOrderIds||[])detectedAll.add(id);for(const o of r.orders)orders.set(o.id,o);return r;};
  const signature=()=>extract(doc).orders.map(o=>o.id).sort().join('|');
  try{
   for(let page=0;page<50&&Date.now()-started<50000;page++){
    pages++;collect();
    // Read successive positions so virtual/lazy rows are retained before they disappear.
    const root=doc.scrollingElement||doc.documentElement;
    const roots=[root,...Array.from(doc.querySelectorAll('div')).filter(el=>el.clientHeight>150&&el.scrollHeight>el.clientHeight+80&&(!globalThis.getComputedStyle||/auto|scroll/.test(getComputedStyle(el).overflowY))&&el.querySelector('table,[role="row"],.income-item,.income-list-item'))];
    for(const scroller of new Set(roots)){
     if(!scroller)continue;scroller.scrollTop=0;await pause(250);collect();
     let idle=0;
     for(let step=0;step<160&&Date.now()-started<50000;step++){
      const before=scroller.scrollTop;scroller.scrollTop=Math.min(scroller.scrollHeight, before+Math.max(150,scroller.clientHeight*.7));
      await pause(250);collect();
      if(scroller.scrollTop===before){if(++idle>=3)break;}else idle=0;
     }
    }
    collect();const sig=signature();
    if(seenPages.has(sig)){notice='Dừng vì trang không đổi. Chưa xác nhận đã đọc hết.';break;}seenPages.add(sig);
    const next=Array.from(doc.querySelectorAll('.eds-pagination__next,.shopee-pagination__next,.eds-pager__button-next,[aria-label="Next page"],[aria-label="Trang tiếp theo"]')).find(el=>el.getClientRects().length&&!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&!/disabled/.test(el.className));
    if(!next){notice='Đã cuộn hết danh sách đang mở. Nếu Shopee còn trang khác, mở trang đó và đọc tiếp.';break;}
    if(next.tagName==='BUTTON')next.setAttribute('type','button');next.click();
    let changed=false;for(let attempt=0;attempt<20;attempt++){await pause(250);if(signature()&&signature()!==sig){changed=true;break;}}
    if(!changed){notice='Chưa tải được trang tiếp theo. Mở trang tiếp rồi bấm Đọc lại.';break;}
   }
   if(Date.now()-started>=50000)notice='Đã dừng sau 50 giây. Đọc tiếp để lấy phần còn lại.';
   const list=[...orders.values()];return {...latest,orders:list,pendingPayoutTotal:list.reduce((sum,o)=>sum+o.pendingPayout,0),pagesRead:pages,warnings:[notice,...(detectedAll.size>orders.size?['Phát hiện '+detectedAll.size+' mã nhưng mới đọc chắc chắn tiền của '+orders.size+' đơn. Còn dòng chưa đọc được số tiền.']:[]),...(latest?.warnings||[])]};
  }finally{globalThis.__SHOPFLOW_FINANCE_READING__=false;}
 }
 globalThis.ShopFlowFinanceParser={extract,extractAll};
})();
