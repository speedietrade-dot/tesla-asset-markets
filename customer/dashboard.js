(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const state = { user:null, holdings:[], transactions:[], plans:[], bitcoinAddress:'', carFilter:'All Tesla Cars' };
  const stocks = [
    {symbol:'TSLA',name:'Tesla, Inc.',price:214.32,change:2.45,mark:'T',cls:'tsla'},
    {symbol:'NVDA',name:'NVIDIA Corp.',price:875.21,change:1.92,mark:'N',cls:'nvda'},
    {symbol:'AAPL',name:'Apple Inc.',price:178.34,change:.88,mark:'●',cls:'aapl'},
    {symbol:'MSFT',name:'Microsoft Corp.',price:417.16,change:1.13,mark:'▦',cls:'msft'},
    {symbol:'AMZN',name:'Amazon.com Inc.',price:188.70,change:-.42,mark:'a',cls:'amzn'},
    {symbol:'GOOGL',name:'Alphabet Inc.',price:142.56,change:1.11,mark:'G',cls:'googl'}
  ];
  const cars = [
    {name:'Model S',type:'Model S',price:80000,from:1000,cls:'red',image:'model-s.jpg',desc:'Premium electric sedan'},
    {name:'Model 3',type:'Model 3',price:45000,from:500,cls:'silver',image:'model-3.jpg',desc:'Electric sport sedan'},
    {name:'Model X',type:'Model X',price:90000,from:1000,cls:'dark',image:'model-x.jpg',desc:'Premium electric SUV'},
    {name:'Model Y',type:'Model Y',price:52000,from:500,cls:'blue',image:'model-y.jpg',desc:'Electric midsize SUV'},
    {name:'Cybertruck',type:'Cybertruck',price:100000,from:1000,cls:'truck',image:'cybertruck.jpg',desc:'All-electric utility truck'},
    {name:'Cybercab',type:'Cybercab',price:120000,from:1000,cls:'gold',image:'cybercab.jpg',desc:'Autonomous mobility concept'},
    {name:'Roadster',type:'Roadster',price:200000,from:1000,cls:'red',image:'roadster.jpg',desc:'Electric performance concept'}
  ];
  const money = n => '$' + Number(n || 0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(url, options={}) {
    const response = await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
    let data={}; try{data=await response.json()}catch(_){}
    if(!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }
  let toastTimer;
  function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3200)}
  function openModal(html){$('#modalBody').innerHTML=html;$('#modal').classList.add('show');$('#modal').setAttribute('aria-hidden','false')}
  function closeModal(){$('#modal').classList.remove('show');$('#modal').setAttribute('aria-hidden','true')}
  function addActivityIcon(type){return type==='withdrawal'?'⇄':type==='funding'?'＋':type==='investment_plan'?'◈':type==='stock_order'?'↗':type==='vehicle_order'?'▰':'▤'}
  function statusClass(s){return String(s||'pending').toLowerCase()==='approved'?'approved':String(s||'pending').toLowerCase()==='rejected'?'rejected':''}
  function drawMini(){return `<svg class="mini-chart" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,17 9,15 18,16 27,9 36,13 45,7 54,11 63,4 72,8 82,3 91,5 100,1" fill="none" stroke="${Math.random()>.15?'#11a96b':'#dc2b40'}" stroke-width="2"/></svg>`}
  function stockCard(s){return `<article class="stock-card"><div class="stock-top ${s.cls}">${s.mark}</div><div class="stock-info"><b>${s.symbol}</b><small>${s.name}</small><div class="stock-price">${money(s.price)}</div><div class="stock-change ${s.change>=0?'up':'down'}">${s.change>=0?'+':''}${s.change.toFixed(2)}%</div>${drawMini()}<button data-stock="${s.symbol}">Buy Stock</button></div></article>`}
  function carCard(c){return `<article class="car-card"><div class="car-photo ${c.cls}" style="background-image:url('/assets/cars/${esc(c.image)}')" role="img" aria-label="${esc(c.name)} from the supplied dashboard reference"></div><div class="car-copy"><h3>${esc(c.name)}</h3><p>${esc(c.desc)}</p><div class="car-price">${money(c.price)}</div><small>Illustrative price · From ${money(c.from)}</small><button data-car="${esc(c.name)}">Buy Now</button></div></article>`}
  function renderStocks(){ $('#dashboardStocks').innerHTML=stocks.map(stockCard).join('');$('#marketStocks').innerHTML=stocks.map(stockCard).join('');$('#allStocks').innerHTML=stocks.map(stockCard).join(''); }
  function carFilters(containerId){const labels=['All Tesla Cars','Model S','Model 3','Model X','Model Y','Cybertruck','Cybercab','Roadster'];$(containerId).innerHTML=labels.map(x=>`<button class="${state.carFilter===x?'active':''}" data-car-filter="${x}">${x}</button>`).join('')}
  function renderCars(){carFilters('#dashboardCarFilters');carFilters('#carFilters');const shown=cars.filter(c=>state.carFilter==='All Tesla Cars'||c.type===state.carFilter);$('#dashboardCars').innerHTML=shown.slice(0,7).map(carCard).join('');$('#allCars').innerHTML=shown.map(carCard).join('')}
  function drawPortfolio(){const canvas=$('#portfolioChart');if(!canvas)return;const rect=canvas.getBoundingClientRect();const dpr=window.devicePixelRatio||1;canvas.width=Math.max(320,rect.width*dpr);canvas.height=150*dpr;const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);const w=canvas.width/dpr,h=canvas.height/dpr;ctx.clearRect(0,0,w,h);ctx.strokeStyle='#202733';ctx.lineWidth=1;for(let i=0;i<5;i++){let y=12+i*28;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}const points=[];for(let i=0;i<52;i++){let x=4+i*(w-8)/51;let trend=h*.64-i*.45;let wobble=Math.sin(i*1.7)*9+Math.sin(i*.37)*10+(Math.sin(i*2.2)*3);points.push([x,Math.max(13,Math.min(h-10,trend+wobble))])}const grad=ctx.createLinearGradient(0,0,0,h);grad.addColorStop(0,'rgba(232,33,39,.42)');grad.addColorStop(1,'rgba(232,33,39,0)');ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.closePath();ctx.fillStyle=grad;ctx.fill();ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.strokeStyle='#ed1b32';ctx.lineWidth=1.8;ctx.stroke();}
  function renderUser(){const u=state.user;if(!u)return;const first=(u.name||'Customer').trim().split(/\s+/)[0];$('#welcome').textContent=`Welcome Back, ${first} 👋` ;$('#userName').textContent=u.name||'Customer';$('#userId').textContent=`CUSTOMER #${u.id}`;$('#avatar').textContent=first.charAt(0).toUpperCase();$('#profileAvatar').textContent=first.charAt(0).toUpperCase();$('#profileName').textContent=u.name||'Customer';$('#profileEmail').textContent=u.email||'';const balance=Number(u.balance||0),invested=Number(u.investment||0),profit=Number(u.profit||0);$('#balance').textContent=money(balance+invested+profit);$('#invested').textContent=money(invested);$('#profit').textContent=money(profit);$('#available').textContent=money(balance);$('#portfolioValue').innerHTML=`${money(balance+invested+profit)} <span>Demo portfolio</span>`;$('#walletAddress').textContent=state.bitcoinAddress||'Bitcoin payment address has not been configured by the admin.';}
  function renderHoldings(){const rows=state.holdings.map(h=>`<tr><td><b>${esc(h.symbol)}</b></td><td>${Number(h.units||0).toLocaleString('en-US',{maximumFractionDigits:8})}</td><td>${money(h.investment)}</td><td>${money(h.current_value)}</td><td class="${Number(h.profit)>=0?'up':'down'}">${money(h.profit)}</td></tr>`).join('');$('#holdingsRows').innerHTML=rows||'<tr><td colspan="5" class="muted">No holdings recorded yet. Your admin can add demo stock holdings.</td></tr>';}
  function renderTransactions(){const rows=state.transactions.map(t=>`<tr><td>${esc(String(t.type||'transaction').replaceAll('_',' '))}</td><td>${esc(t.description||'Account activity')}</td><td>${money(t.amount)}</td><td><span class="status ${statusClass(t.status)}">${esc(t.status||'pending')}</span></td><td>${t.created_at?new Date(t.created_at).toLocaleString():'—'}</td></tr>`).join('');$('#transactionRows').innerHTML=rows||'<tr><td colspan="5" class="muted">No transactions yet.</td></tr>';const recent=state.transactions.slice(0,4);$('#recentActivity').innerHTML=recent.length?recent.map(t=>`<div class="activity-item"><div class="activity-icon">${addActivityIcon(t.type)}</div><div><b>${esc(String(t.type||'Activity').replaceAll('_',' ').replace(/^\w/,c=>c.toUpperCase()))} · ${money(t.amount)}</b><small>${esc(t.status||'pending')} · ${t.created_at?new Date(t.created_at).toLocaleDateString():'Just now'}</small></div></div>`).join(''):'<p class="muted">No transactions yet. Your activity will appear here.</p>';}
  function renderPlans(){const el=$('#customerPlans');el.innerHTML=state.plans.map((p,i)=>`<article class="plan-card"><div class="plan-top"><span class="plan-symbol">◈</span><span class="status">Available</span></div><h3>${esc(p.name)}</h3><div class="plan-amount">${money(p.amount)}</div><p>Bitcoin payment · Payment review required</p><button data-plan="${p.id}">View payment details</button></article>`).join('')||'<div class="panel"><p>No active investment plans are configured yet. Please check back later.</p></div>';}
  async function refresh(){const [me,holds,tx,planData]=await Promise.all([api('/api/auth/me'),api('/api/customer/holdings'),api('/api/customer/transactions'),api('/api/customer/investment-plans')]);state.user=me.user;state.holdings=holds.holdings||[];state.transactions=tx.transactions||[];state.plans=planData.plans||[];state.bitcoinAddress=planData.bitcoinAddress||'';renderUser();renderHoldings();renderTransactions();renderPlans();renderStocks();renderCars();requestAnimationFrame(drawPortfolio);}
  function navigate(section){document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));const view=$(`#view-${section}`);if(view)view.classList.remove('hidden');document.querySelectorAll('.nav[data-section]').forEach(b=>b.classList.toggle('active',b.dataset.section===section));$('#sidebar').classList.remove('open');window.scrollTo({top:0,behavior:'smooth'});}
  function fundingModal(){openModal(`<h2>Add Funds</h2><p>Submit a funding request for administrator review. This academic demo does not process real deposits.</p><form class="form-stack" id="fundForm"><label>Amount (USD)<input name="amount" type="number" min="1" step="0.01" required placeholder="Enter amount"></label><label>Payment reference<input name="reference" maxlength="180" placeholder="Enter your payment reference" required></label><button type="submit">Submit funding request</button></form>`);$('#fundForm').addEventListener('submit',async e=>{e.preventDefault();try{const fd=new FormData(e.target);const amount=Number(fd.get('amount'));const reference=String(fd.get('reference')||'').trim();await api('/api/customer/funding-request',{method:'POST',body:JSON.stringify({amount,reference})});closeModal();await refresh();toast('Funding request submitted for review.')}catch(err){toast(err.message)}})}
  function withdrawModal(){openModal(`<h2>Withdraw funds</h2><p>Enter your assigned single-use withdrawal token. A submitted request remains pending for admin review; no payment is sent automatically.</p><div class="inline-note">Available balance: <b>${money(state.user?.balance||0)}</b></div><form class="form-stack" id="withdrawForm"><label>Amount (USD)<input name="amount" type="number" min="1" max="${Math.max(0,Number(state.user?.balance||0))}" step="0.01" required></label><label>Withdrawal method<select name="method"><option>Bitcoin wallet</option><option>Bank transfer</option></select></label><label>Destination details<input name="destination" required maxlength="180" placeholder="Your wallet address or bank details"></label><label>Withdrawal token<input name="token" required minlength="8" maxlength="128" autocomplete="one-time-code" placeholder="Token assigned by admin"></label><button type="submit">Submit withdrawal request</button></form>`);$('#withdrawForm').addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));try{await api('/api/customer/withdrawal',{method:'POST',body:JSON.stringify({amount:Number(d.amount),token:d.token,method:d.method,destination:d.destination})});closeModal();await refresh();toast('Withdrawal submitted. It is pending review.')}catch(err){toast(err.message)}})}
  function planModal(id){const p=state.plans.find(x=>String(x.id)===String(id));if(!p)return;openModal(`<h2>${esc(p.name)}</h2><p>Plan amount: <b>${money(p.amount)}</b></p><div class="inline-note"><b>Bitcoin payment address</b><br>${esc(state.bitcoinAddress||'The admin has not configured a Bitcoin address yet.')}</div><p>Only continue after independently confirming the payment address. Submitting a transaction reference does not prove payment; admin review is required.</p><form class="form-stack" id="planPayForm"><label>Bitcoin transaction ID / reference<input name="reference" maxlength="180" required placeholder="Paste your transaction ID"></label><button type="submit" ${state.bitcoinAddress?'':'disabled'}>Submit payment reference</button></form>`);$('#planPayForm').addEventListener('submit',async e=>{e.preventDefault();const reference=new FormData(e.target).get('reference');try{await api('/api/customer/investment-plan-request',{method:'POST',body:JSON.stringify({planId:p.id,paymentReference:reference})});closeModal();await refresh();toast('Plan request submitted and marked pending verification.')}catch(err){toast(err.message)}})}
  function stockModal(symbol){
    const s=stocks.find(x=>x.symbol===symbol);
    if(!s)return;
    openModal(`<h2>Buy ${esc(s.symbol)}</h2><p>${esc(s.name)} · Listed price per share ${money(s.price)}</p><div class="inline-note">This submits an order request for administrator review. No real stock trade is executed.</div><form class="form-stack" id="stockOrderForm"><label>Quantity (shares)<input name="quantity" type="number" min="1" step="1" value="1" required></label><p>Total: <strong id="stockOrderTotal">${money(s.price)}</strong></p><button type="submit">Submit stock order request</button></form>`);
    const form=$('#stockOrderForm');
    const quantityInput=form.elements.quantity;
    const total=$('#stockOrderTotal');
    const updateTotal=()=>{
      const q=Number(quantityInput.value);
      total.textContent=Number.isSafeInteger(q)&&q>0?money(s.price*q):'Enter a valid quantity';
    };
    quantityInput.addEventListener('input',updateTotal);
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const quantity=Number(quantityInput.value);
      if(!Number.isSafeInteger(quantity)||quantity<1)return toast('Enter a whole-number quantity of at least 1.');
      const amount=Number((s.price*quantity).toFixed(2));
      try{
        await api('/api/customer/asset-order',{method:'POST',body:JSON.stringify({kind:'stock',symbol:s.symbol,name:s.name,amount,note:`Quantity: ${quantity}; listed price per share: ${s.price}; total: ${amount}`})});
        closeModal();await refresh();toast('Stock order request submitted for admin review.');
      }catch(err){toast(err.message)}
    });
  }
  function carModal(name){
    const c=cars.find(x=>x.name===name);
    if(!c)return;
    openModal(`<h2>Pre-order ${esc(c.name)}</h2><p>${esc(c.desc)} · Listed price ${money(c.price)}</p><div class="inline-note">Your request will be reviewed by an administrator. Submitting this form does not complete payment or purchase.</div><form class="form-stack" id="carOrderForm"><label>Full name<input name="customerName" required maxlength="100"></label><label>Phone number<input name="phone" type="tel" required maxlength="40"></label><label>Delivery address<input name="address" required maxlength="250"></label><label>Additional note (optional)<input name="note" maxlength="120" placeholder="Any extra details"></label><button type="submit">Submit pre-order request</button></form>`);
    $('#carOrderForm').addEventListener('submit',async e=>{
      e.preventDefault();
      const f=new FormData(e.target);
      const details=[
        'Pre-order contact: '+String(f.get('customerName')||'').trim(),
        'Phone: '+String(f.get('phone')||'').trim(),
        'Address: '+String(f.get('address')||'').trim(),
        'Note: '+String(f.get('note')||'').trim()
      ].filter(Boolean).join(' | ');
      try{
        await api('/api/customer/asset-order',{method:'POST',body:JSON.stringify({kind:'vehicle',name:c.name,amount:c.price,note:details})});
        closeModal();await refresh();toast('Pre-order request submitted for admin review.');
      }catch(err){toast(err.message)}
    });
  }
})();
