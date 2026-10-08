const assets=[
["TSLA","Tesla","$248.50",2.1],["NVDA","NVIDIA","$186.72",1.7],["AAPL","Apple","$256.30",-0.4],["MSFT","Microsoft","$521.40",0.8],["SPY","S&P 500 ETF","$672.18",0.5],["QQQ","Nasdaq ETF","$604.10",1.2]
];
const vehicles=[
["Model Y L Premium","Long Wheelbase Midsize SUV","Starting at $61,990","../assets/vehicle-model-y-l.jpg"],
["Model 3","Sport Sedan","Lease From $419/mo","../assets/vehicle-model-3.jpg"],
["Model Y","Midsize SUV","Lease From $499/mo","../assets/vehicle-model-y.jpg"],
["Cybertruck","Utility Truck","Lease From $1,129/mo","../assets/vehicle-cybertruck.jpg"],
["Certified Pre-Owned","Pre-Owned Vehicles","Fully inspected and road ready","../assets/vehicle-certified-preowned.jpg"]];
const leaders=[["Elon Musk","Founder & CEO","../assets/elon-musk.jpg"],["Gwynne Shotwell","President & COO","../assets/gwynne-shotwell.jpg"],["Bret Johnson","Finance leadership","../assets/bret-johnson.jpg"],["Martin Eberhard","Tesla co-founder","../assets/martin-eberhard.jpg"],["Marc Tarpenning","Tesla co-founder","../assets/marc-tarpenning.jpg"]];
const $=s=>document.querySelector(s);
function modal(el){el.classList.add("show")} function close(el){el.classList.remove("show")}
const authModal=$("#authModal"),infoModal=$("#infoModal"),authBody=$("#authBody"),infoBody=$("#infoBody");
function loginForm(register=false){
 authBody.innerHTML=register?`<h2>Create your account</h2><p>Set up your customer access.</p><form class="form" id="authForm"><input required name="name" placeholder="Full name"><input required name="email" type="email" placeholder="Email address"><input required name="phone" placeholder="Phone number"><input required name="password" type="password" placeholder="Password"><button class="blue">Create account</button></form><p class="switch">Already registered? <button id="switchLogin">Sign in</button></p>`:`<h2>Sign in</h2><p>Access your asset dashboard.</p><form class="form" id="authForm"><input required name="email" type="email" placeholder="Email address"><input required name="password" type="password" placeholder="Password"><button class="blue">Sign in</button></form><p class="switch">New customer? <button id="switchRegister">Create account</button></p>`;
 modal(authModal);
 $("#switchLogin")?.addEventListener("click",()=>loginForm(false));$("#switchRegister")?.addEventListener("click",()=>loginForm(true));
 $("#authForm").onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));let users=JSON.parse(localStorage.getItem("tm_users")||"[]");if(register){if(users.some(u=>u.email.toLowerCase()===d.email.toLowerCase()))return alert("Account already exists.");users.push({name:d.name,email:d.email,phone:d.phone,password:d.password,balance:10000,invested:0,profit:0,holdings:[]});localStorage.setItem("tm_users",JSON.stringify(users));localStorage.setItem("tm_current",d.email);showDashboard()}else{const u=users.find(x=>x.email.toLowerCase()===d.email.toLowerCase()&&x.password===d.password);if(!u)return alert("Incorrect email or password.");localStorage.setItem("tm_current",u.email);showDashboard()}}
}
function showDashboard(){location.href="dashboard.html"}
function renderHome(){ $("#vehicleGrid").innerHTML=vehicles.map((v,i)=>`<article class="vehicle-card"><div class="vehicle-photo" style="background-image:url('${v[3]}')"></div><div class="vehicle-info"><h3>${v[0]}</h3><p>${v[1]} · ${v[2]}</p><button onclick="vehicleInfo(${i})">View Vehicle</button></div></article>`).join("");$("#tickerGrid").innerHTML=assets.map(a=>`<article class="ticker"><div class="sym">${a[0]}</div><div class="company">${a[1]}</div><div class="price">${a[2]}</div><div class="${a[3]>=0?"up":"down"}">${a[3]>=0?"+":""}${a[3]}%</div></article>`).join("");$("#leaders").innerHTML=leaders.map(l=>`<article class="leader"><img class="leader-photo" src="${l[2]}" alt="${l[0]}"><div class="leader-info"><h3>${l[0]}</h3><p>${l[1]}</p></div></article>`).join("")}
function vehicleInfo(i){const v=vehicles[i];infoBody.innerHTML=`<h2>${v[0]}</h2><p>${v[1]} · ${v[2]}</p><button class="blue" onclick="close(infoModal);loginForm(true)">Create account to continue</button>`;modal(infoModal)}
function learn(){infoBody.innerHTML="<h2>Explore the technology</h2><p>Scroll through the page to explore vehicles, self-driving, energy and asset markets.</p>";modal(infoModal)}
$("#loginOpen").onclick=()=>loginForm(false);$("#registerOpen").onclick=()=>loginForm(true);$("#ctaRegister").onclick=()=>loginForm(true);$("#marketLogin").onclick=()=>loginForm(false);$("#heroOrder").onclick=()=>loginForm(true);$("#vehicleOrder").onclick=()=>loginForm(true);$("#drawerLogin").onclick=()=>loginForm(false);$("#heroLearn").onclick=learn;$("#watchVideo").onclick=()=>document.querySelector("video").play();$("#authClose").onclick=()=>close(authModal);$("#infoClose").onclick=()=>close(infoModal);$("#menuOpen").onclick=()=>$("#drawer").classList.add("open");$("#drawerClose").onclick=()=>$("#drawer").classList.remove("open");[authModal,infoModal].forEach(m=>m.onclick=e=>{if(e.target===m)close(m)});
const heroPhotos=["../assets/hero-slide-1.jpg","../assets/hero-slide-2.jpg","../assets/hero-slide-3.jpg"];
let heroIndex=0;
const heroBg=document.getElementById("heroBg");
const heroDots=document.querySelectorAll("#heroDots .dot");
function setHeroSlide(i){
  heroIndex=Number(i);
  heroBg.style.opacity="0";
  setTimeout(()=>{
    heroBg.style.backgroundImage=`url("${heroPhotos[heroIndex]}")`;
    heroBg.style.opacity="1";
    heroDots.forEach((d,n)=>d.classList.toggle("active",n===heroIndex));
  },120);
}
heroDots.forEach(dot=>dot.addEventListener("click",()=>setHeroSlide(dot.dataset.slide)));
setHeroSlide(0);

renderHome();
