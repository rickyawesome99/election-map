const { chromium } = require('playwright');
const fs=require('fs');
(async () => {
  const [out,year,name,fname,page_]=process.argv.slice(2);
  const b = await chromium.launch({headless:true, channel:'chromium'});
  const ctx = await b.newContext({acceptDownloads:true,userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'});
  const p = await ctx.newPage();
  const url='https://aws.state.ak.us/ApocReports/CampaignDisclosure/'+(page_||'CDIncome.aspx');
  await p.goto(url,{waitUntil:'networkidle'});
  const P='#M_C_sCDTransactions_csfFilter_';
  await p.selectOption(P+'ddlReportYear',year);
  if(name){ await p.selectOption(P+'ddlNameType','CandidateName').catch(()=>{}); await p.fill(P+'txtName',name);}
  await p.click(P+'btnSearch');
  await p.waitForFunction(()=>document.body && !document.body.innerText.includes("Press 'Search' to Load"),null,{timeout:300000});
  await p.waitForTimeout(2000);
  const txt = await p.innerText('body');
  const m = txt.match(/[0-9,]+ items? in [0-9,]+ pages?|No Results|Page \d+ of [0-9,]+[^\n]*/); console.log('search:', m&&m[0]);
  fs.writeFileSync(out+'/'+fname+'.html', await p.content());
  await Promise.all([p.waitForNavigation({timeout:300000}).catch(()=>{}), p.click(P+'btnExport')]);
  await p.waitForSelector('[id$=ExportDialog_hlAllCSV]',{timeout:60000});
  const href = await p.getAttribute('[id$=ExportDialog_hlAllCSV]','href'); console.log('href',href);
  const csv = await p.evaluate(async(h)=>{const r=await fetch(h,{credentials:'include'}); return r.headers.get('content-type')+'|'+r.headers.get('content-disposition')+'\n'+await r.text();}, href);
  fs.writeFileSync(out+'/'+fname+'.csv', csv); console.log('bytes',csv.length);
  await b.close();
})();
