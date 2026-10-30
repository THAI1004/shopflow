(function(){
 const text=node=>(node?.innerText||node?.textContent||'').replace(/\s+/g,' ').trim();
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
  const orders=new Map();let skipped=0;
  for(const row of candidates){
   const value=text(row),ids=[...new Set(value.match(codePattern)||[])];if(ids.length!==1)continue;
   const cells=Array.from(row.querySelectorAll('td,[role="cell"],.eds-table__cell,.shopee-table__cell'));
   const amountText=amountIndex>=0&&cells[amountIndex]?text(cells[amountIndex]):value;
   const money=amountText.match(/[₫đ]\s*[\d][\d.,]*|[\d][\d.,]*\s*[₫đ]/gi)||[];
   if(money.length!==1){skipped++;continue;}
   const amount=Number(money[0].replace(/[^0-9]/g,''));if(!Number.isSafeInteger(amount)||amount<0){skipped++;continue;}
   const buyer=value.match(/Người mua\s*:\s*([^\s]+)/i)?.[1]||'';
   const payoutStage=value.match(/Đang chờ đơn hoàn tất|Đang tính toán|Đang thanh toán/i)?.[0]||'Chưa thanh toán';
   const payoutExpectedDay=value.match(/\b\d{2}\/\d{2}\/\d{4}\b/)?.[0]||'';
   orders.set(ids[0],{...(payoutOverviewTotal!==null?{payoutOverviewTotal,payoutOverviewReadAt}:{}),id:ids[0],buyer,items:[],status:'',pendingPayout:amount,payoutStatus:'unpaid',payoutStage,payoutExpectedDay,payoutReadAt:new Date().toISOString(),isPendingFinal:true});
  }
  const list=[...orders.values()];return {payoutOverviewTotal,payoutOverviewReadAt,orders:list,currentTab:'Doanh thu · Chưa thanh toán',exactFinalCount:0,pendingPayoutTotal:list.reduce((sum,o)=>sum+o.pendingPayout,0),warnings:[...(skipped?['Một số dòng chưa đọc chắc chắn số tiền, đã bỏ qua.']:[]),'Chỉ tổng hợp các trang đã đọc. Chuyển trang Shopee rồi bấm Đọc để gộp đủ danh sách.']};
 }
 globalThis.ShopFlowFinanceParser={extract};
})();
