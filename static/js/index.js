const API = 'http://localhost:8000';
const _token   = localStorage.getItem('bq_token');
const _usuario = JSON.parse(localStorage.getItem('bq_usuario') || 'null');
if (!_token) { window.location.href = 'login.html'; }
let compras = [];
let vendas  = [];
let editingId = null;
let _planoInfo = {plano:'gratis', compras_usadas:0, compras_limite:15, limites:{exportar:false, foto:false, relatorios:false}};
let compraFotoBase64 = null;
let sortState = {};
const LEVELS=[
  {n:1,m:'🥉',name:'Iniciante',   min:0,    max:500,   perks:['Registro de compras e vendas','Dashboard de métricas','Controle de estoque']},
  {n:2,m:'🥈',name:'Aprendiz',    min:500,  max:2000,  perks:['Histórico completo','Cálculo automático de ROI','Ranking de categorias']},
  {n:3,m:'🥇',name:'Revendedor',  min:2000, max:5000,  perks:['Análise por item','Gráfico de evolução mensal','Insights de desempenho']},
  {n:4,m:'💎',name:'Profissional', min:5000, max:15000, perks:['Metas de vendas mensais','Relatório premium','Projeção de crescimento']},
  {n:5,m:'🚀',name:'Expert',       min:15000,max:50000, perks:['Análise avançada','Multi-estoque','Indicadores de mercado']},
  {n:6,m:'👑',name:'Mestre',       min:50000,max:1/0,   perks:['Status de elite','Acesso completo','Conquistas exclusivas']},
];
const getLv=l=>LEVELS.findLast(v=>l>=v.min)||LEVELS[0];
const lvPct=l=>{const v=getLv(l);if(v.max===1/0)return 100;return Math.min((l-v.min)/(v.max-v.min)*100,100);};
const fmt=v=>'R$ '+Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtP=v=>(v>=0?'+':'')+Number(v).toFixed(1)+'%';
const CE={Eletrônicos:'💻',Roupas:'👕',Calçados:'👟',Móveis:'🪑',Games:'🎮',Celulares:'📱',Acessórios:'⌚',Outros:'📦'};
const CT={Novo:'tg',Seminovo:'tb',Bom:'tgo',Regular:'to',Ruim:'tr_'};
const iBI=id=>compras.find(c=>c.id===Number(id)||c.id===id);
const isV=id=>{const c=compras.find(c=>c.id===id);return c?c.vendida:false;};
const ltot=()=>vendas.reduce((a,v)=>a+(v.lucro||0),0);
function authHeaders(){return{'Content-Type':'application/json','Authorization':'Bearer '+_token};}
function logout(){localStorage.removeItem('bq_token');localStorage.removeItem('bq_usuario');window.location.href='login.html';}
async function loadData(){
  try{
    const[rc,rv,rp,rme]=await Promise.all([
      fetch(`${API}/compras`,{headers:authHeaders()}),
      fetch(`${API}/vendas`, {headers:authHeaders()}),
      fetch(`${API}/meu-plano`,{headers:authHeaders()}),
      fetch(`${API}/auth/me`,{headers:authHeaders()}),
    ]);
    if(rc.status===401||rv.status===401){logout();return;}
    if(!rc.ok||!rv.ok)throw new Error('Falha ao carregar dados');
    compras=await rc.json();
    vendas =await rv.json();
    if(rp.ok) _planoInfo = await rp.json();
    if(rme.ok){
      const me = await rme.json();
      localStorage.setItem('bq_usuario', JSON.stringify(me));
    }
    atualizarUIPlano();
    render();
    checkConquistas();
  }catch(e){toast('Não foi possível conectar à API. Inicie o servidor Python.',false);}
}
function atualizarUIPlano(){
  const p = _planoInfo;
  const el = document.getElementById('plano-label');
  const mel = document.getElementById('menu-plano-label');
  if(p.plano==='pro'){
    if(el){el.textContent='Plano Pro';el.style.color='var(--green)';}
    if(mel)mel.textContent='Plano Pro ativo';
  } else if(p.plano==='business'){
    if(el){el.textContent='Business';el.style.color='var(--purple)';}
    if(mel)mel.textContent='Plano Business ativo';
  } else {
    const txt=`Grátis · ${p.compras_usadas||0}/${p.compras_limite||15} compras`;
    if(el){el.textContent=txt;el.style.color='var(--txt3)';}
    if(mel)mel.textContent=txt;
    if((p.compras_usadas||0)>=(p.compras_limite||15)) showUpgradeBanner();
  }
  const canExport = p.plano==='pro'||p.plano==='business';
  document.querySelectorAll('[onclick*="exportCSV"]').forEach(btn=>{
    btn.style.opacity=canExport?'1':'0.4';
    btn.title=canExport?'Exportar CSV':'Disponível no plano Pro ou Business';
  });
  mostrarNavEquipe();
}
async function apiPost(path,body){
  const r=await fetch(`${API}${path}`,{method:'POST',headers:authHeaders(),body:JSON.stringify(body)});
  if(r.status===401){logout();return;}
  if(!r.ok){
    const err=await r.json().catch(()=>({}));
    const detail=typeof err.detail==='object'?JSON.stringify(err.detail):(err.detail||'Erro na API');
    const e=new Error(detail);
    e.status=r.status;
    throw e;
  }
  return r.json();
}
async function apiPut(path,body){
  const r=await fetch(`${API}${path}`,{method:'PUT',headers:authHeaders(),body:JSON.stringify(body)});
  if(r.status===401){logout();return;}
  if(!r.ok){const err=await r.json().catch(()=>({}));throw new Error(err.detail||'Erro na API');}
  return r.json();
}
async function apiDelete(path){
  const r=await fetch(`${API}${path}`,{method:'DELETE',headers:authHeaders()});
  if(r.status===401){logout();return;}
  if(!r.ok)throw new Error('Erro ao deletar');
}
function initUserUI(){
  if(!_usuario)return;
  const initials=_usuario.nome.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const fotoUrl=localStorage.getItem('bq_foto_'+_usuario.id)||_usuario.foto_url||null;
  document.getElementById('sf-nome').textContent=_usuario.nome;
  document.getElementById('sf-init').textContent=initials;
  if(fotoUrl){
    const sfImg=document.getElementById('sf-img');
    sfImg.src=fotoUrl;sfImg.style.display='block';
    document.getElementById('sf-init').style.display='none';
  }
  const avatarHtml=fotoUrl
    ?`<div id="tb-av" style="width:32px;height:32px;border-radius:50%;overflow:hidden;flex-shrink:0;cursor:pointer;box-shadow:0 0 0 2px var(--orange)" onclick="toggleUserMenu()"><img src="${fotoUrl}" style="width:100%;height:100%;object-fit:cover;display:block;"/></div>`
    :`<div id="tb-av" style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--orange),#FF3D00);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0;cursor:pointer;box-shadow:0 0 0 2px var(--orange)" onclick="toggleUserMenu()">${initials}</div>`;
  document.querySelector('.topbar').insertAdjacentHTML('beforeend',`
    <div style="display:flex;align-items:center;gap:10px;margin-left:8px;padding-left:12px;border-left:1px solid var(--border);position:relative;" id="user-widget">
      <div style="text-align:right">
        <div style="font-size:12px;font-weight:600;color:var(--txt)">${_usuario.nome}</div>
        <div style="font-size:10px;color:var(--txt3)" id="plano-label">—</div>
      </div>
      ${avatarHtml}
      <div id="user-menu" style="display:none;position:absolute;top:44px;right:0;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--r);min-width:200px;overflow:hidden;box-shadow:0 12px 32px rgba(0,0,0,0.5);z-index:200;">
        <div style="padding:12px 14px;border-bottom:1px solid var(--border);">
          <div style="font-size:12px;font-weight:700">${_usuario.nome}</div>
          <div style="font-size:10px;color:var(--txt3)">${_usuario.email}</div>
          <div style="font-size:10px;color:var(--orange);font-weight:700;margin-top:3px;" id="menu-plano-label"></div>
        </div>
        <div onclick="window.location.href='perfil.html'" style="padding:10px 14px;cursor:pointer;font-size:12px;font-weight:600;display:flex;align-items:center;gap:8px;color:var(--txt);transition:background .1s" onmouseover="this.style.background='var(--bg4)'" onmouseout="this.style.background=''">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Meu Perfil
        </div>
        <div style="height:1px;background:var(--border)"></div>
        <div onclick="logout()" style="padding:10px 14px;cursor:pointer;font-size:12px;font-weight:600;display:flex;align-items:center;gap:8px;color:var(--red);transition:background .1s" onmouseover="this.style.background='var(--rd)'" onmouseout="this.style.background=''">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> Sair
        </div>
      </div>
    </div>`);
  document.addEventListener('click',e=>{const w=document.getElementById('user-widget');if(w&&!w.contains(e.target))closeUserMenu();});
}
function toggleUserMenu(){const m=document.getElementById('user-menu');m.style.display=m.style.display==='none'?'block':'none';}
function closeUserMenu(){const m=document.getElementById('user-menu');if(m)m.style.display='none';}
function showUpgradeBanner(){
  if(document.getElementById('upgrade-banner'))return;
  const content=document.querySelector('.content');
  if(!content)return;
  content.insertAdjacentHTML('afterbegin',`
    <div id="upgrade-banner" style="
      background:linear-gradient(135deg,rgba(255,107,43,0.1),rgba(0,212,138,0.06));
      border:1px solid rgba(255,107,43,0.3);border-radius:var(--r);
      padding:14px 18px;margin-bottom:16px;
      display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
      <span style="font-size:22px">🚀</span>
      <div style="flex:1;min-width:180px">
        <div style="font-family:'Syne',sans-serif;font-size:13px;font-weight:800;color:var(--orange);margin-bottom:2px">Limite do plano Grátis atingido</div>
        <div style="font-size:11px;color:var(--txt2)">Upgrade para Pro por <strong style="color:var(--green)">R$ 29/mês</strong> — compras ilimitadas + relatórios completos</div>
      </div>
      <button onclick="window.location.href='planos.html'"
        style="font-family:'Syne',sans-serif;font-size:12px;font-weight:700;
               background:var(--green);color:#fff;padding:9px 18px;border-radius:var(--rs);
               border:none;cursor:pointer;white-space:nowrap;box-shadow:0 4px 14px rgba(0,212,138,0.3);">
        Ver planos de assinatura
      </button>
      <button onclick="document.getElementById('upgrade-banner').remove()"
        style="background:transparent;border:none;color:var(--txt3);cursor:pointer;font-size:18px;padding:0 4px;">×</button>
    </div>`);
}
function toggleSidebar(){
  const sb=document.getElementById('sidebar');
  const ov=document.getElementById('sb-overlay');
  sb.classList.toggle('open');
  ov.classList.toggle('active', sb.classList.contains('open'));
}
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sb-overlay').classList.remove('active');
}
const PTITLES={dashboard:'Dashboard',niveis:'Níveis & Conquistas',produtos:'Produtos em Estoque',compras:'Compras',vendas:'Vendas',relatorios:'Relatórios',equipe:'Minha Equipe'};
const PBTNS={
  dashboard:'',niveis:'',relatorios:'',
  produtos:`<button class="btn bp bs" onclick="oOv('ov-c');setEditMode(false)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Registrar Compra</button>`,
  compras:`<button class="btn bp bs" onclick="oOv('ov-c');setEditMode(false)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Registrar Compra</button>`,
  vendas:`<button class="btn bp bs" onclick="openV()"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Registrar Venda</button>`,
};
function goto(id,el){
  document.querySelectorAll('.sec').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.ni').forEach(n=>n.classList.remove('active'));
  document.getElementById('sec-'+id)?.classList.add('active');
  if(el&&el.classList)el.classList.add('active');
  document.getElementById('ptitle').textContent=PTITLES[id]||id;
  document.getElementById('tbtns').innerHTML=PBTNS[id]||'';
  if(id==='relatorios')rRelatorios();
  if(id==='equipe')eqCarregar();
  document.querySelectorAll('.bn-item').forEach(b=>b.classList.remove('active'));
  const bn=document.getElementById('bn-'+id);
  if(bn)bn.classList.add('active');
  closeSidebar();
}
function render(){
  const l=ltot();
  checkLevelUp(l);
  const lv=getLv(l);
  const pct=lvPct(l);
  const next=LEVELS.find(v=>v.n===lv.n+1);
  document.getElementById('sb-badge').textContent='Nível '+lv.n+' · '+lv.name;
  document.getElementById('sb-lname').textContent=lv.m+' '+lv.name;
  document.getElementById('sb-xp').textContent=fmt(l)+' / '+fmt(lv.max===1/0?l:lv.max)+' de lucro';
  document.getElementById('sb-fill').style.width=pct+'%';
  document.getElementById('sb-next').textContent=next?'Próximo: '+next.name:'Nível Máximo';
  const em=compras.filter(c=>!isV(c.id));
  document.getElementById('nb-p').textContent=em.length;
  document.getElementById('nb-c').textContent=compras.length;
  document.getElementById('nb-v').textContent=vendas.length;
  rDash(l,lv,pct,next);
  rNiveis(l,lv,pct,next);
  rProdFiltered();
  rCTFiltered();
  rVTFiltered();
  rAlertas();
  rNotifPanel();
  const em2=compras.filter(c=>!isV(c.id));
  const bnBp=document.getElementById('bn-badge-p');
  if(bnBp){bnBp.textContent=em2.length;bnBp.classList.toggle('show',em2.length>0);}
}
const CAT_ICONS={
  'Eletrônicos':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
  'Roupas':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.57a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.57a2 2 0 00-1.34-2.23z"/></svg>',
  'Calçados':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10v4a1 1 0 001 1h4l2 3h8a2 2 0 002-2v-1a3 3 0 00-3-3H3z"/><path d="M3 10l5-7 3 4"/></svg>',
  'Móveis':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  'Games':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>',
  'Celulares':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
  'Acessórios':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  'Outros':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>',
};
const CAT_COLORS=['#FF6B2B','#4D9EFF','#00D48A','#FFB800','#A855F7','#FF4D6A','#06B6D4','#78716C'];
function rDash(l,lv,pct,next){
  const nome=_usuario?.nome?.split(' ')[0]||'—';
  document.getElementById('h-username').textContent=nome;
  document.getElementById('hl-n').textContent=lv.name;
  document.getElementById('hl-f').style.width=pct+'%';
  document.getElementById('hl-p').textContent=Math.round(pct)+'%';
  document.getElementById('hl-nx').textContent=next?'→ '+next.name:'Nível Máximo';
  document.getElementById('h-lucro').textContent=fmt(l);
  rGoal(l);
  rMetrics8(l);
  rBarChart();
  rCumChart();
  rRankCat();
  rStockDist();
  rDashTabs();
  rAdvMetrics();
  rGiroChart();
}
function rMetrics8(l){
  const em=compras.filter(c=>!isV(c.id));
  const totalInv=compras.reduce((a,c)=>a+c.custo_total,0);
  const totalVend=vendas.reduce((a,v)=>a+v.preco_venda,0);
  const roi=totalInv>0?(l/totalInv*100):0;
  const ticket=vendas.length>0?(totalVend/vendas.length):0;
  const valEstoque=em.reduce((a,c)=>a+c.custo_total,0);
  const now=new Date().toISOString().slice(0,7);
  const prev=new Date(new Date().setMonth(new Date().getMonth()-1)).toISOString().slice(0,7);
  const lMes=vendas.filter(v=>v.data_venda.slice(0,7)===now).reduce((a,v)=>a+(v.lucro||0),0);
  const lPrev=vendas.filter(v=>v.data_venda.slice(0,7)===prev).reduce((a,v)=>a+(v.lucro||0),0);
  const diffMes=lPrev>0?((lMes-lPrev)/lPrev*100):null;
  const ISVG={
    profit:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>`,
    box:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
    roi:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
    ticket:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12V22H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/></svg>`,
  };
  const cards=[
    {k:'profit',lbl:'Lucro Total',v:fmt(l),s:vendas.length+' vendas realizadas',g:'var(--green)',bg:'var(--gd)',trend:diffMes},
    {k:'box',lbl:'Valor em Estoque',v:fmt(valEstoque),s:em.length+' ite'+( em.length===1?'m':'ns')+' aguardando venda',g:'var(--blue)',bg:'var(--bd)',trend:null},
    {k:'roi',lbl:'ROI Geral',v:fmtP(roi),s:'Sobre '+fmt(totalInv)+' investido',g:'var(--gold)',bg:'var(--gold-d)',trend:null},
    {k:'ticket',lbl:'Ticket Médio',v:fmt(ticket),s:'Por venda · '+compras.length+' compra'+(compras.length===1?'':'s'),g:'var(--orange)',bg:'var(--og)',trend:null},
  ];
  document.getElementById('dash-m').innerHTML=cards.map(x=>{
    const trendHtml=x.trend!==null?`<div class="mc-trend ${x.trend>=0?'up':'dn'}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">${x.trend>=0?'<polyline points="18 15 12 9 6 15"/>':'<polyline points="6 9 12 15 18 9"/>'}</svg>
      ${Math.abs(x.trend).toFixed(1)}% vs mês ant.
    </div>`:'';
    return`<div class="mc">
      <div class="mc-glow" style="background:${x.g}"></div>
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;">
        <div class="mc-ico" style="background:${x.bg};color:${x.g}">${ISVG[x.k].replace('stroke="currentColor"','stroke="'+x.g+'"')}</div>
      </div>
      <div class="mc-lbl">${x.lbl}</div>
      <div class="mc-v" style="color:${x.g}">${x.v}</div>
      <div class="mc-s">${x.s}</div>
      ${trendHtml}
    </div>`;}).join('');
}
function rBarChart(){
  const rpm={},lpm={};
  vendas.forEach(v=>{
    const k=v.data_venda.slice(0,7);
    rpm[k]=(rpm[k]||0)+v.preco_venda;
    lpm[k]=(lpm[k]||0)+(v.lucro||0);
  });
  const sorted=Object.entries(rpm).sort((a,b)=>a[0].localeCompare(b[0])).slice(-8);
  const now=new Date().toISOString().slice(0,7);
  if(!sorted.length){
    document.getElementById('c-bars').innerHTML='<div style="color:var(--txt3);font-size:11px;padding:30px;text-align:center;width:100%">Sem vendas ainda</div>';
    document.getElementById('c-range').textContent='—';
    document.getElementById('chart-legend').innerHTML='';
    return;
  }
  const maxV=Math.max(...sorted.map(([,v])=>v),1);
  document.getElementById('c-range').textContent=sorted[0][0]+' — '+sorted[sorted.length-1][0];
  document.getElementById('chart-legend').innerHTML=`
    <div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--txt2)"><span style="width:8px;height:8px;border-radius:2px;background:rgba(77,158,255,0.6);display:inline-block"></span>Receita</div>
    <div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--txt2)"><span style="width:8px;height:8px;border-radius:2px;background:var(--orange);display:inline-block"></span>Mês atual</div>`;
  document.getElementById('c-bars').innerHTML=sorted.map(([k,v])=>`
    <div class="bbar-wrap">
      <div class="bbar-val">${fmt(v)}</div>
      <div class="bbar ${k===now?'cur':'has'}" style="height:${Math.max(v/maxV*100,4)}%"></div>
      <div class="bbar-lbl">${k.slice(5)}</div>
    </div>`).join('');
}
function rCumChart(){
  const monthly={};
  vendas.forEach(v=>{const k=v.data_venda.slice(0,7);monthly[k]=(monthly[k]||0)+(v.lucro||0);});
  const sorted=Object.entries(monthly).sort((a,b)=>a[0].localeCompare(b[0])).slice(-12);
  if(sorted.length<2){
    document.getElementById('cum-chart').innerHTML='<div style="color:var(--txt3);font-size:11px;padding:20px;text-align:center">Vendas insuficientes</div>';
    return;
  }
  let acc=0;
  const points=sorted.map(([k,v])=>{acc+=v;return{k,v:acc};});
  const maxV=Math.max(...points.map(p=>p.v),1);
  const W=400,H=100,padX=8,padY=14;
  const xs=points.map((_,i)=>padX+i*(W-2*padX)/(points.length-1));
  const ys=points.map(p=>H-padY-(p.v/maxV)*(H-2*padY));
  let d=`M${xs[0]},${ys[0]}`;
  for(let i=1;i<xs.length;i++){
    const cp1x=xs[i-1]+(xs[i]-xs[i-1])*0.4,cp1y=ys[i-1];
    const cp2x=xs[i]-(xs[i]-xs[i-1])*0.4,cp2y=ys[i];
    d+=` C${cp1x},${cp1y} ${cp2x},${cp2y} ${xs[i]},${ys[i]}`;
  }
  const areaD=d+` L${xs[xs.length-1]},${H} L${xs[0]},${H} Z`;
  const lastX=xs[xs.length-1],lastY=ys[ys.length-1];
  document.getElementById('cum-chart').innerHTML=`
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;overflow:visible">
      <defs>
        <linearGradient id="cg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="var(--green)" stop-opacity=".2"/>
          <stop offset="100%" stop-color="var(--green)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${areaD}" fill="url(#cg)"/>
      <path d="${d}" fill="none" stroke="var(--green)" stroke-width="1.8" stroke-linecap="round"/>
      ${points.map((p,i)=>`<circle cx="${xs[i]}" cy="${ys[i]}" r="2.5" fill="var(--green)" opacity=".7"><title>${p.k}: ${fmt(p.v)}</title></circle>`).join('')}
      <circle cx="${lastX}" cy="${lastY}" r="4.5" fill="var(--green)"/>
      <circle cx="${lastX}" cy="${lastY}" r="8" fill="var(--green)" opacity=".15"/>
      <text x="${lastX}" y="${lastY-11}" text-anchor="${lastX>W*0.7?'end':'middle'}" fill="var(--green)" font-size="9" font-family="Syne,sans-serif" font-weight="700">${fmt(points[points.length-1].v)}</text>
      ${points.filter((_,i)=>i===0||i===points.length-1||points.length<=6).map((p,_,arr)=>{const i=points.indexOf(p);return`<text x="${xs[i]}" y="${H}" text-anchor="middle" fill="var(--txt3)" font-size="8">${p.k.slice(5)}</text>`;}).join('')}
    </svg>`;
  document.getElementById('cum-sub').textContent='Total: '+fmt(points[points.length-1].v);
}
function rRankCat(){
  const cat={};
  vendas.forEach(v=>{const it=iBI(v.compra_id);if(it)cat[it.categoria]=(cat[it.categoria]||0)+(v.lucro||0);});
  const s=Object.entries(cat).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const el=document.getElementById('d-rank');
  if(!s.length){el.innerHTML='<div style="text-align:center;padding:20px;color:var(--txt3);font-size:12px">Nenhuma venda ainda</div>';return;}
  const maxC=s[0][1]||1;
  el.innerHTML=s.map(([c,v],i)=>{
    const color=CAT_COLORS[i%CAT_COLORS.length];
    const medals=['#FFB800','#A0A0A0','#CD7F32'];
    const nColor=i<3?medals[i]:'var(--txt3)';
    return`<div class="rr">
      <div class="rn" style="color:${nColor};font-weight:900">${i+1}</div>
      <div class="re" style="background:${color}18;color:${color}">${CAT_ICONS[c]||CAT_ICONS['Outros']}</div>
      <div class="ri">
        <div class="rname">${c}</div>
        <div class="rt"><div class="rf" style="width:${Math.max(v/maxC*100,4)}%;background:${color}"></div></div>
      </div>
      <div class="rv" style="color:${color}">${fmt(v)}</div>
    </div>`;}).join('');
}
function rStockDist(){
  const cat={};
  const em=compras.filter(c=>!isV(c.id));
  em.forEach(c=>{cat[c.categoria]=(cat[c.categoria]||0)+1;});
  const total=em.length||1;
  const s=Object.entries(cat).sort((a,b)=>b[1]-a[1]).slice(0,6);
  document.getElementById('stock-sub').textContent=em.length+' itens em estoque';
  document.getElementById('stock-dist').innerHTML=!s.length
    ?'<div style="color:var(--txt3);font-size:12px;padding:10px;text-align:center">Estoque vazio</div>'
    :s.map(([c,n],i)=>{
      const color=CAT_COLORS[i%CAT_COLORS.length];
      const pct=n/total*100;
      return`<div style="display:flex;align-items:center;gap:8px;">
        <div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
            <span style="font-size:11px;font-weight:600">${c}</span>
            <span style="font-size:10px;color:var(--txt2)">${n} · ${Math.round(pct)}%</span>
          </div>
          <div style="height:3px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${color};border-radius:2px"></div>
          </div>
        </div>
      </div>`;}).join('');
}
function rAdvMetrics(){
  const el=document.getElementById('adv-metrics');
  const girosMs=vendas.map(v=>{const c=iBI(v.compra_id);if(!c)return null;const dc=new Date(c.data_compra),dv=new Date(v.data_venda);return(dv-dc)/(1000*60*60*24);}).filter(v=>v!==null&&v>=0);
  const giroMed=girosMs.length>0?Math.round(girosMs.reduce((a,b)=>a+b,0)/girosMs.length):null;
  const txVenda=compras.length>0?(vendas.length/compras.length*100):0;
  const rpm={};vendas.forEach(v=>{const k=v.data_venda.slice(0,7);rpm[k]=(rpm[k]||0)+(v.lucro||0);});
  const best=Object.entries(rpm).sort((a,b)=>b[1]-a[1])[0];
  const bestV=vendas.length>0?vendas.reduce((a,v)=>(v.lucro||0)>(a.lucro||0)?v:a,vendas[0]):null;
  const now=new Date().toISOString().slice(0,7);
  const lMes=vendas.filter(v=>v.data_venda.slice(0,7)===now).reduce((a,v)=>a+(v.lucro||0),0);
  const vendasMes=vendas.filter(v=>v.data_venda.slice(0,7)===now).length;
  const SVGS={
    clock:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    percent:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>`,
    star:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    diamond:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12l4 6-10 13L2 9z"/><path d="M11 3L8 9l4 13 4-13-3-6"/><path d="M2 9h20"/></svg>`,
    calendar:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  };
  const items=[
    {svg:SVGS.clock,lbl:'Giro médio',v:giroMed!==null?giroMed+' dias':'—',s:'da compra à venda',c:'var(--blue)'},
    {svg:SVGS.percent,lbl:'Taxa de venda',v:txVenda.toFixed(1)+'%',s:vendas.length+' / '+compras.length+' itens',c:'var(--green)'},
    {svg:SVGS.star,lbl:'Melhor mês',v:best?best[0]:'—',s:best?fmt(best[1]):'Sem dados',c:'var(--gold)'},
    {svg:SVGS.diamond,lbl:'Maior lucro',v:bestV?fmt(bestV.lucro||0):'—',s:bestV?iBI(bestV.compra_id)?.titulo?.slice(0,22)||'—':'—',c:'var(--orange)'},
    {svg:SVGS.calendar,lbl:'Lucro este mês',v:fmt(lMes),s:vendasMes+' venda(s) em '+now,c:'var(--green)'},
  ];
  el.innerHTML=items.map(x=>`
    <div style="display:flex;align-items:center;gap:9px;padding:7px 8px;border-radius:8px;background:var(--bg4);">
      <div style="width:28px;height:28px;border-radius:7px;background:${x.c}18;color:${x.c};display:flex;align-items:center;justify-content:center;flex-shrink:0">${x.svg.replace('stroke="currentColor"','stroke="'+x.c+'"')}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:9px;font-weight:700;color:var(--txt3);text-transform:uppercase;letter-spacing:.5px">${x.lbl}</div>
        <div style="font-family:'Syne',sans-serif;font-size:13px;font-weight:800;color:var(--txt);line-height:1.2">${x.v}</div>
        <div style="font-size:10px;color:var(--txt2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${x.s}</div>
      </div>
    </div>`).join('');
}
function rGiroChart(){
  const catGiro={};
  vendas.forEach(v=>{
    const c=iBI(v.compra_id);if(!c)return;
    const dias=(new Date(v.data_venda)-new Date(c.data_compra))/(1000*60*60*24);
    if(dias<0)return;
    if(!catGiro[c.categoria])catGiro[c.categoria]={sum:0,n:0};
    catGiro[c.categoria].sum+=dias;catGiro[c.categoria].n++;
  });
  const s=Object.entries(catGiro).map(([k,v])=>({cat:k,med:Math.round(v.sum/v.n)})).sort((a,b)=>a.med-b.med).slice(0,6);
  const el=document.getElementById('giro-chart');
  if(!s.length){el.innerHTML='<div style="color:var(--txt3);font-size:12px;padding:10px;text-align:center">Sem dados de giro</div>';return;}
  const max=Math.max(...s.map(x=>x.med),1);
  el.innerHTML=s.map((x,i)=>{
    const color=x.med<=7?'var(--green)':x.med<=30?'var(--orange)':'var(--red)';
    return`<div style="display:flex;align-items:center;gap:8px;">
      <div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
          <span style="font-size:11px;font-weight:600">${x.cat}</span>
          <span style="font-size:10px;font-weight:700;color:${color}">${x.med}d</span>
        </div>
        <div style="height:3px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${x.med/max*100}%;background:${color};border-radius:2px"></div>
        </div>
      </div>
    </div>`;}).join('');
}
function rDashTabs(){
  const ct=document.querySelector('#dt-c tbody');ct.innerHTML='';
  const uc=[...compras].reverse().slice(0,6);
  if(!uc.length)ct.innerHTML='<tr><td colspan="3" style="text-align:center;padding:14px;color:var(--txt3)">Sem compras</td></tr>';
  else uc.forEach(c=>{const s=isV(c.id);ct.innerHTML+=`<tr><td><strong style="font-size:12px">${c.titulo}</strong></td><td style="white-space:nowrap">${fmt(c.custo_total)}</td><td><span class="tag ${s?'tg':'to'}" style="font-size:9px">${s?'Vendido':'Estoque'}</span></td></tr>`;});
  const vt=document.querySelector('#dt-v tbody');vt.innerHTML='';
  const uv=[...vendas].reverse().slice(0,6);
  if(!uv.length)vt.innerHTML='<tr><td colspan="3" style="text-align:center;padding:14px;color:var(--txt3)">Sem vendas</td></tr>';
  else uv.forEach(v=>{const it=iBI(v.compra_id),l=v.lucro||0;vt.innerHTML+=`<tr><td><strong style="font-size:12px">${it?it.titulo:'—'}</strong></td><td style="white-space:nowrap">${fmt(v.preco_venda)}</td><td class="${l>=0?'pp':'pn'}" style="white-space:nowrap">${fmt(l)}</td></tr>`;});
}
function getGoal(){return parseFloat(localStorage.getItem('bq_goal')||'0');}
function rGoal(lucroMes){
  const goal=getGoal();
  const now=new Date().toISOString().slice(0,7);
  const lucro=vendas.filter(v=>v.data_venda.slice(0,7)===now).reduce((a,v)=>a+(v.lucro||0),0);
  const pct=goal>0?Math.min(lucro/goal*100,100):0;
  const gb=document.getElementById('goal-bar');
  if(!goal){
    document.getElementById('goal-lbl').textContent='Meta mensal: não definida';
    document.getElementById('goal-pct').textContent='';
    document.getElementById('goal-fill').style.width='0%';
    document.getElementById('goal-fill').style.background='var(--orange)';
    return;
  }
  document.getElementById('goal-lbl').textContent=`Meta: ${fmt(lucro)} / ${fmt(goal)}`;
  document.getElementById('goal-pct').textContent=Math.round(pct)+'%';
  const color=pct>=100?'var(--green)':pct>=60?'var(--orange)':'var(--blue)';
  document.getElementById('goal-fill').style.width=pct+'%';
  document.getElementById('goal-fill').style.background=color;
  document.getElementById('goal-pct').style.color=color;
}
function openGoalModal(){
  document.getElementById('goal-input').value=getGoal()||'';
  oOv('ov-goal');
}
function saveGoal(){
  const v=parseFloat(document.getElementById('goal-input').value)||0;
  localStorage.setItem('bq_goal',v);
  cOv('ov-goal');
  rGoal(ltot());
  toast('Meta definida: '+fmt(v));
}
function rNiveis(l,lv,pct,next){
  document.getElementById('np-s').textContent='Lucro acumulado · '+lv.name;
  document.getElementById('np-v').textContent=fmt(l);
  document.getElementById('np-l1').textContent=lv.name+' ('+fmt(lv.min)+')';
  document.getElementById('np-l2').textContent=next?next.name+' ('+fmt(next.min)+')':'Nível Máximo';
  document.getElementById('np-b').style.width=pct+'%';
  document.getElementById('np-p').textContent=Math.round(pct)+'%';
  document.getElementById('lv-grid').innerHTML=LEVELS.map(v=>{
    const done=l>=v.max,cur=v.n===lv.n,locked=l<v.min;
    return `<div class="lb ${cur?'cur':done?'done':locked?'locked':''}">
      <span class="lbbdg ${cur?'b-cur':done?'b-done':'b-lock'}">${cur?'Atual':done?'Concluído':'Bloqueado'}</span>
      <div class="lb-med">${v.m}</div><div class="lb-n">Nível ${v.n}</div>
      <div class="lb-name" style="color:${cur?'var(--orange)':done?'var(--green)':'var(--txt)'}">${v.name}</div>
      <div class="lb-req">${v.max===1/0?'A partir de '+fmt(v.min):fmt(v.min)+' – '+fmt(v.max)}</div>
      ${v.perks.map(p=>`<div class="lb-p">${p}</div>`).join('')}
    </div>`;}).join('');
}
function rProdFiltered(){
  const q=(document.getElementById('prod-search')?.value||'').toLowerCase();
  const cat=document.getElementById('prod-cat')?.value||'';
  const cond=document.getElementById('prod-cond')?.value||'';
  const est=compras.filter(c=>!isV(c.id)).filter(c=>{
    if(q&&!c.titulo.toLowerCase().includes(q)&&!(c.marca||'').toLowerCase().includes(q))return false;
    if(cat&&c.categoria!==cat)return false;
    if(cond&&c.condicao!==cond)return false;
    return true;
  });
  document.getElementById('prod-count').textContent=est.length+' item(ns)';
  const el=document.getElementById('prod-g');
  if(!est.length){
    el.innerHTML='<div class="empty"><div class="ei"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".3"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg></div><div class="et">Nenhum produto encontrado</div><div style="font-size:12px">Tente outros filtros ou registre uma compra</div></div>';return;
  }
  el.innerHTML=est.map(c=>{
    const fotoHtml=c.foto_url
      ?`<img class="ic-img" src="${c.foto_url}" alt="${c.titulo}" onerror="this.style.display='none';this.nextSibling.style.display='flex'"/><div class="ic-img-ph" style="display:none">${CE[c.categoria]||'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".4"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>'}</div>`
      :`<div class="ic-img-ph">${CE[c.categoria]||'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".4"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>'}</div>`;
    return`<div class="ic">
      ${fotoHtml}
      <div class="ic-body">
        <div class="ic-top"><span class="tag ${CT[c.condicao]||'tgr'}">${c.condicao||'—'}</span><span class="tag tgr" style="font-size:9px">${c.categoria||'—'}</span></div>
        <div class="ic-name">${c.titulo}</div>
        <div class="ic-cat">${c.marca||''}${c.modelo?' · '+c.modelo:''}</div>
        ${c.notas?`<div class="ic-notes">📝 ${c.notas}</div>`:''}
        <div class="ic-foot">
          <div class="ic-c">Custo <strong>${fmt(c.custo_total)}</strong></div>
          <div class="ic-actions">
            <button class="btn bg bs" onclick="event.stopPropagation();openEdit('${c.id}')" style="padding:4px 8px;font-size:10px">Editar</button>
            <button class="btn bp bs" onclick="event.stopPropagation();openV('${c.id}')">Vender</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}
let coSortKey='',coSortDir=1,veSortKey='',veSortDir=1;
function sortTable(t,k){
  if(t==='co'){coSortKey=coSortKey===k?k:k;coSortDir=coSortKey===k?(coSortDir*-1):1;coSortKey=k;}
  else{veSortKey=veSortKey===k?k:k;veSortDir=veSortKey===k?(veSortDir*-1):1;veSortKey=k;}
  if(t==='co')rCTFiltered();else rVTFiltered();
}
function rCTFiltered(){
  const q=(document.getElementById('co-search')?.value||'').toLowerCase();
  const cat=document.getElementById('co-cat')?.value||'';
  const st=document.getElementById('co-status')?.value||'';
  let data=[...compras].filter(c=>{
    if(q&&!c.titulo.toLowerCase().includes(q)&&!(c.marca||'').toLowerCase().includes(q))return false;
    if(cat&&c.categoria!==cat)return false;
    if(st==='estoque'&&isV(c.id))return false;
    if(st==='vendido'&&!isV(c.id))return false;
    return true;
  });
  if(coSortKey)data.sort((a,b)=>{const va=a[coSortKey]||'',vb=b[coSortKey]||'';return typeof va==='number'?(va-vb)*coSortDir:String(va).localeCompare(String(vb))*coSortDir;});
  else data=data.reverse();
  document.getElementById('co-count').textContent=data.length+' registro(s)';
  const tb=document.querySelector('#tb-co tbody');tb.innerHTML='';
  if(!data.length){tb.innerHTML='<tr><td colspan="9" style="text-align:center;padding:26px;color:var(--txt3)">Nenhuma compra encontrada</td></tr>';renderPagination('pag-co',0,1,'setCoPg');return;}
  const total=data.length;
  const page=data.slice((coPg-1)*PG_SIZE,coPg*PG_SIZE);
  renderPagination('pag-co',total,coPg,'setCoPg');
  page.forEach(c=>{const s=isV(c.id);tb.innerHTML+=`<tr>
    <td><strong>${c.titulo}</strong>${c.marca?`<br><span style="font-size:10px;color:var(--txt3)">${c.marca}${c.modelo?' '+c.modelo:''}</span>`:''}${c.notas?`<br><span style="font-size:10px;color:var(--txt2);font-style:italic">📝 ${c.notas.slice(0,40)}${c.notas.length>40?'...':''}</span>`:''}</td>
    <td><span class="tag tgr">${c.categoria||'—'}</span></td>
    <td><span class="tag ${CT[c.condicao]||'tgr'}">${c.condicao||'—'}</span></td>
    <td><strong>${fmt(c.custo_total)}</strong></td>
    <td>${c.pagamento||'—'}</td><td>${c.fonte||'—'}</td><td>${c.data_compra||'—'}</td>
    <td><span class="tag ${s?'tg':'to'}">${s?'Vendido':'Estoque'}</span></td>
    <td style="white-space:nowrap">
      ${!s?`<button class="btn bg bs" onclick="openEdit('${c.id}')" style="margin-right:4px;font-size:10px;padding:4px 8px">Editar</button>`:''}
      <button class="btn bg bs" onclick="confirmDelete('compra','${c.id}','${c.titulo.replace(/'/g,"\\'")}')" style="color:var(--red);border-color:rgba(255,77,106,0.2);font-size:10px;padding:4px 8px">Excluir</button>
    </td>
  </tr>`;});
}
function rVTFiltered(){
  const q=(document.getElementById('ve-search')?.value||'').toLowerCase();
  const canal=document.getElementById('ve-canal')?.value||'';
  let data=[...vendas].filter(v=>{
    const it=iBI(v.compra_id);
    if(q&&!(it?.titulo||'').toLowerCase().includes(q))return false;
    if(canal&&v.canal!==canal)return false;
    return true;
  });
  if(veSortKey)data.sort((a,b)=>{const va=a[veSortKey]||0,vb=b[veSortKey]||0;return(va-vb)*veSortDir;});
  else data=data.reverse();
  document.getElementById('ve-count').textContent=data.length+' registro(s)';
  const tb=document.querySelector('#tb-ve tbody');tb.innerHTML='';
  if(!data.length){tb.innerHTML='<tr><td colspan="8" style="text-align:center;padding:26px;color:var(--txt3)">Nenhuma venda encontrada</td></tr>';renderPagination('pag-ve',0,1,'setVePg');return;}
  const total=data.length;
  const page=data.slice((vePg-1)*PG_SIZE,vePg*PG_SIZE);
  renderPagination('pag-ve',total,vePg,'setVePg');
  page.forEach(v=>{
    const it=iBI(v.compra_id),cu=it?it.custo_total:0,lu=v.lucro||0,roi=cu>0?(lu/cu*100):0;
    const nome=it?it.titulo:'';
    tb.innerHTML+=`<tr data-id="${v.id}" data-nome="${nome.replace(/"/g,'&quot;')}" style="position:relative;">
      <td><strong style="font-size:12px">${it?it.titulo:'—'}</strong></td>
      <td style="white-space:nowrap">${fmt(cu)}</td>
      <td style="white-space:nowrap">${fmt(v.preco_venda)}</td>
      <td class="${lu>=0?'pp':'pn'}" style="white-space:nowrap">${fmt(lu)}</td>
      <td class="${roi>=0?'pp':'pn'}" style="white-space:nowrap">${fmtP(roi)}</td>
      <td>${v.canal||'—'}</td>
      <td style="white-space:nowrap">${v.data_venda||'—'}</td>
      <td style="white-space:nowrap">
        <button class="btn bg bs" onclick="openEditVenda('${v.id}')" style="font-size:10px;padding:4px 8px;margin-right:4px">Editar</button>
        <button class="btn bg bs" onclick="confirmDelete('venda','${v.id}','${nome.replace(/'/g,"\\'")}')\" style="color:var(--red);border-color:rgba(255,77,106,0.2);font-size:10px;padding:4px 8px">Excluir</button>
        <div class="swipe-del-btn" style="position:absolute;right:0;top:0;bottom:0;background:var(--red);width:80px;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;border-radius:0 var(--rs) var(--rs) 0;font-size:11px;font-weight:700;color:#fff;">Excluir</div>
      </td>
    </tr>`;
  });
  if(window.innerWidth<=600){
    initSwipeDelete('tb-ve',(id,nome)=>confirmDelete('venda',id,nome));
  }
}
function confirmDelete(tipo,id,nome){
  showConfirmDialog(
    tipo==='compra'?'Remover compra?':'Remover venda?',
    (nome?`<strong>"${nome}"</strong><br><br>`:'')+(tipo==='compra'
      ?'Esta compra e todos os seus dados serão removidos permanentemente. Se já foi vendido, a venda também será apagada.'
      :'A venda será removida e o item voltará ao estoque.')
    +`<br><br><span style="color:var(--red);font-size:11px;font-weight:700">Esta ação não pode ser desfeita.</span>`,
    'Excluir','Cancelar','danger'
  ).then(async ok=>{
    if(!ok)return;
    try{
      if(tipo==='compra'){await apiDelete('/compras/'+id);logAtividade('delete','Compra removida: '+(nome||id),'');}
      else{await apiDelete('/vendas/'+id);logAtividade('delete','Venda removida','');}
      await loadData();
      toast(tipo==='compra'?'Compra removida':'Venda removida');
    }catch(e){toast('Erro: '+e.message,false);}
  });
}
function setEditMode(editing){
  editingId=editing?editingId:null;
  const t=document.getElementById('ov-c-title');
  const b=document.getElementById('btn-save-c');
  if(editing){t.textContent='Editar Compra';b.textContent='Salvar Alterações';}
  else{t.textContent='Registrar Compra';b.textContent='Salvar Compra';}
}
function openEdit(id){
  const c=iBI(id);if(!c)return;
  editingId=c.id;
  setEditMode(true);
  document.getElementById('ci-t').value=c.titulo||'';
  document.getElementById('ci-ca').value=c.categoria||'';
  document.getElementById('ci-cn').value=c.condicao||'';
  document.getElementById('ci-ma').value=c.marca||'';
  document.getElementById('ci-mo').value=c.modelo||'';
  document.getElementById('ci-p').value=c.preco_compra||0;
  document.getElementById('ci-f').value=c.frete||0;
  document.getElementById('ci-co').value=c.conserto||0;
  document.getElementById('ci-ou').value=c.outros_custos||0;
  document.getElementById('ci-d').value=c.data_compra||'';
  document.getElementById('ci-pg').value=c.pagamento||'PIX';
  document.getElementById('ci-fo').value=c.fonte||'OLX';
  document.getElementById('ci-ci').value=c.cidade||'';
  document.getElementById('ci-l').value=c.link||'';
  document.getElementById('ci-notas').value=c.notas||'';
  compraFotoBase64=c.foto_url||null;
  const preview=document.getElementById('ci-foto-preview');
  const ph=document.getElementById('ci-foto-ph');
  if(c.foto_url){preview.src=c.foto_url;preview.classList.add('show');ph.style.display='none';}
  else{preview.classList.remove('show');ph.style.display='flex';}
  cC();
  oOv('ov-c');
}
function handleCompraFoto(input){
  if(!input.files||!input.files[0])return;
  if(_planoInfo.plano==='gratis'){
    input.value='';
    const zone=document.getElementById('photo-zone');
    if(zone){
      zone.style.borderColor='var(--orange)';
      zone.style.background='rgba(255,107,43,0.04)';
      const ph=document.getElementById('ci-foto-ph');
      if(ph) ph.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2" width="24" height="24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg><span style="color:var(--orange);font-weight:700;">Foto disponível no Pro</span><a href="planos.html" style="font-size:10px;color:var(--orange);text-decoration:underline;margin-top:2px;">Ver planos</a>`;
      setTimeout(()=>{ zone.style.borderColor=''; zone.style.background=''; },2000);
    }
    toast('⚡ Foto de produto disponível no plano Pro ou Business',false);
    return;
  }
  const file=input.files[0];
  if(file.size>5*1024*1024){toast('Imagem muito grande (máx 5MB)',false);return;}
  const reader=new FileReader();
  reader.onload=e=>{
    compraFotoBase64=e.target.result;
    const preview=document.getElementById('ci-foto-preview');
    preview.src=compraFotoBase64;preview.classList.add('show');
    document.getElementById('ci-foto-ph').style.display='none';
  };
  reader.readAsDataURL(file);
}
function oOv(id){document.getElementById(id).classList.add('open');}
function cOv(id){document.getElementById(id).classList.remove('open');}
let selI=null;
function openV(pid){
  const em=compras.filter(c=>!isV(c.id));
  if(!em.length){toast('Nenhum item em estoque!',false);return;}
  selI=pid||null;
  document.getElementById('vi-d').value=new Date().toISOString().split('T')[0];
  document.getElementById('vi-p').value='';
  ['vl-c','vl-p','vl-l'].forEach(id=>document.getElementById(id).textContent='—');
  document.getElementById('vl').innerHTML=em.map(c=>`<div class="vi ${c.id==pid?'sel':''}" id="vi-${c.id}" onclick="sVI('${c.id}')">
    <span style="font-size:20px">${c.foto_url?`<img src="${c.foto_url}" style="width:32px;height:32px;border-radius:6px;object-fit:cover"/>`:CE[c.categoria]||'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".4"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>'}</span>
    <div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:700">${c.titulo}</div><div style="font-size:10px;color:var(--txt3)">${c.categoria||''} · Custo: ${fmt(c.custo_total)}</div></div>
  </div>`).join('');
  if(pid)setTimeout(()=>cL(),30);
  oOv('ov-v');
}
function cC(){
  const p=+document.getElementById('ci-p').value||0,f=+document.getElementById('ci-f').value||0,co=+document.getElementById('ci-co').value||0,o=+document.getElementById('ci-ou').value||0;
  document.getElementById('cc-p').textContent=fmt(p);document.getElementById('cc-f').textContent=fmt(f);
  document.getElementById('cc-c').textContent=fmt(co);document.getElementById('cc-o').textContent=fmt(o);
  document.getElementById('cc-t').textContent=fmt(p+f+co+o);
}
function cL(){
  if(!selI)return;const it=iBI(selI);if(!it)return;
  const vp=+document.getElementById('vi-p').value||0,lu=vp-it.custo_total;
  document.getElementById('vl-c').textContent=fmt(it.custo_total);document.getElementById('vl-p').textContent=fmt(vp);
  const el=document.getElementById('vl-l');el.textContent=fmt(lu);el.style.color=lu>=0?'var(--green)':'var(--red)';
}
async function saveC(){
  const titulo=document.getElementById('ci-t').value.trim();
  const categoria=document.getElementById('ci-ca').value;
  const preco_compra=+document.getElementById('ci-p').value||0;
  const data_compra=document.getElementById('ci-d').value;
  if(!titulo){toast('Informe o título!',false);return;}
  if(!categoria){toast('Selecione uma categoria!',false);return;}
  if(!preco_compra||preco_compra<=0){toast('Preço de compra deve ser maior que zero!',false);return;}
  if(!data_compra){toast('Informe a data da compra!',false);return;}
  if(data_compra>new Date().toISOString().slice(0,10)){
    toast('A data da compra não pode ser no futuro!',false);return;
  }
  if(!editingId){
    const dc=new Date(data_compra);
    const semana7=new Date(dc);semana7.setDate(dc.getDate()+7);
    const dup=compras.find(c=>{
      if(c.titulo.toLowerCase()===titulo.toLowerCase()){
        const cd=new Date(c.data_compra);
        return cd>=dc||cd>=new Date(dc.getTime()-7*86400000);
      }return false;
    });
    if(dup){
      const ok=await showConfirmDialog(
        'Possível duplicata',
        `Você já tem "<strong>${dup.titulo}</strong>" registrado recentemente (${dup.data_compra}).<br><br>Deseja registrar mesmo assim?`,
        'Registrar mesmo assim','Cancelar','warning'
      );
      if(!ok)return;
    }
  }
  const body={
    titulo,categoria,
    condicao:document.getElementById('ci-cn').value,
    marca:document.getElementById('ci-ma').value.trim(),
    modelo:document.getElementById('ci-mo').value.trim(),
    data_compra,preco_compra,
    frete:+document.getElementById('ci-f').value||0,
    conserto:+document.getElementById('ci-co').value||0,
    outros_custos:+document.getElementById('ci-ou').value||0,
    pagamento:document.getElementById('ci-pg').value,
    fonte:document.getElementById('ci-fo').value,
    cidade:document.getElementById('ci-ci').value.trim(),
    link:document.getElementById('ci-l').value.trim(),
    notas:document.getElementById('ci-notas').value.trim(),
    foto_url:compraFotoBase64||null,
  };
  const btn=document.getElementById('btn-save-c');
  btn.disabled=true;
  btn.innerHTML='<span style="display:inline-flex;align-items:center;gap:6px"><svg style="animation:spin .6s linear infinite" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>Salvando...</span>';
  try{
    if(editingId){
      await apiPut('/compras/'+editingId,body);
      haptic('light');
      toast('Compra atualizada!');
      logAtividade('edit','Compra editada: '+titulo,'Dados atualizados',preco_compra);
    }else{
      await apiPost('/compras',body);
      haptic('medium');
      toast('Compra registrada!');
      logAtividade('compra','Compra registrada: '+titulo,'Nova compra',preco_compra);
      checkOnboardingStep('compra');
    }
    cOv('ov-c');resetC();
    await loadData();
    rNotifPanel();
  }catch(e){
    if(e.status===402||e.message.includes('limite_plano')){
      cOv('ov-c');
      showUpgradeBanner();
      toast('⚡ Limite do plano Grátis atingido! Faça upgrade para continuar.',false);
    }else{
      toast('Erro: '+e.message,false);
    }
  }
  finally{btn.disabled=false;setEditMode(false);btn.innerHTML='Salvar Compra';}
}
async function saveV(){
  if(!selI){toast('Selecione um produto!',false);return;}
  const preco_venda=+document.getElementById('vi-p').value||0;
  const data_venda=document.getElementById('vi-d').value;
  if(!preco_venda||preco_venda<=0){toast('Preço de venda deve ser maior que zero!',false);return;}
  if(!data_venda){toast('Informe a data da venda!',false);return;}
  if(data_venda>new Date().toISOString().slice(0,10)){
    toast('A data da venda não pode ser no futuro!',false);return;
  }
  const it=iBI(selI);
  if(it&&data_venda<it.data_compra){
    toast('A data da venda não pode ser anterior à data da compra!',false);return;
  }
  try{
    await apiPost('/vendas',{
      compra_id:Number(selI),preco_venda,data_venda,
      canal:document.getElementById('vi-ca').value,
      pagamento:document.getElementById('vi-pg').value
    });
    haptic('success');
    cOv('ov-v');selI=null;
    await loadData();
    toast('Venda registrada!');
    if(it)logAtividade('venda','Venda: '+it.titulo,'Item vendido',preco_venda);
    rNotifPanel();
    checkOnboardingStep('venda');
    checkGoalAchieved();
  }catch(e){toast('Erro: '+e.message,false);}
}
function resetC(){
  ['ci-t','ci-ma','ci-mo','ci-p','ci-f','ci-co','ci-ou','ci-ci','ci-l','ci-notas'].forEach(i=>document.getElementById(i).value='');
  document.getElementById('ci-ca').value='';document.getElementById('ci-cn').value='';
  document.getElementById('ci-d').value=new Date().toISOString().split('T')[0];
  document.getElementById('ci-foto-preview').classList.remove('show');
  document.getElementById('ci-foto-ph').style.display='flex';
  document.getElementById('ci-foto-input').value='';
  compraFotoBase64=null;editingId=null;setEditMode(false);cC();
}
function exportCSV(tipo){
  if(_planoInfo.plano==='gratis'){
    showUpgradeBanner();
    toast('Exportação CSV disponível no plano Pro ou Business',false);
    return;
  }
  let rows,headers,filename;
  if(tipo==='compras'){
    headers=['ID','Título','Categoria','Condição','Marca','Modelo','Data','Preço Compra','Frete','Conserto','Outros','Custo Total','Pagamento','Fonte','Cidade','Status','Notas'];
    rows=compras.map(c=>[c.id,c.titulo,c.categoria,c.condicao||'',c.marca||'',c.modelo||'',c.data_compra,c.preco_compra,c.frete,c.conserto,c.outros_custos,c.custo_total,c.pagamento||'',c.fonte||'',c.cidade||'',isV(c.id)?'Vendido':'Estoque',(c.notas||'').replace(/,/g,';')]);
    filename='compras_briqueOS.csv';
  }else{
    headers=['ID','Item','Custo','Preço Venda','Lucro','ROI%','Canal','Pagamento','Data'];
    rows=vendas.map(v=>{const it=iBI(v.compra_id),cu=it?it.custo_total:0,lu=v.lucro||0,roi=cu>0?((lu/cu)*100).toFixed(1):0;return[v.id,it?it.titulo:'—',cu,v.preco_venda,lu,roi,v.canal||'',v.pagamento||'',v.data_venda];});
    filename='vendas_briqueOS.csv';
  }
  const bom='\uFEFF';
  const csv=bom+[headers,...rows].map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
  const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);a.download=filename;a.click();
  toast('CSV exportado!');
}
function toast(msg,ok=true){
  document.getElementById('tdot').style.background=ok?'var(--green)':'var(--red)';
  document.getElementById('tmsg').textContent=msg;
  const t=document.getElementById('toast');
  t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3500);
}
function rAlertas(){
  const DIAS_ALERTA=30;
  const hoje=new Date();
  const parados=compras.filter(c=>{
    if(isV(c.id))return false;
    const dc=new Date(c.data_compra);
    const dias=(hoje-dc)/(1000*60*60*24);
    return dias>=DIAS_ALERTA;
  }).sort((a,b)=>{
    const da=(hoje-new Date(a.data_compra))/(1000*60*60*24);
    const db=(hoje-new Date(b.data_compra))/(1000*60*60*24);
    return db-da;
  });
  const bar=document.getElementById('alertas-bar');
  if(!parados.length){bar.style.display='none';return;}
  bar.style.display='block';
  const n=parados.length;
  const maxDias=Math.round((hoje-new Date(parados[0].data_compra))/(1000*60*60*24));
  const valParado=parados.reduce((a,c)=>a+c.custo_total,0);
  bar.innerHTML=`
    <div style="background:rgba(255,184,0,0.07);border:1px solid rgba(255,184,0,0.25);border-radius:var(--r);padding:14px 18px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
      <div style="width:36px;height:36px;border-radius:9px;background:rgba(255,184,0,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      </div>
      <div style="flex:1;min-width:200px;">
        <div style="font-family:'Syne',sans-serif;font-size:13px;font-weight:800;color:var(--gold);margin-bottom:2px;">${n} produto${n>1?'s':''} parado${n>1?'s':''} no estoque</div>
        <div style="font-size:11px;color:var(--txt2);">${fmt(valParado)} investido · Maior: ${maxDias} dias sem vender</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${parados.slice(0,3).map(c=>{
          const dias=Math.round((hoje-new Date(c.data_compra))/(1000*60*60*24));
          const urgency=dias>=90?'var(--red)':dias>=60?'var(--orange)':'var(--gold)';
          return`<div style="background:var(--bg4);border:1px solid var(--border2);border-radius:var(--rs);padding:6px 10px;font-size:11px;max-width:160px;">
            <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.titulo}</div>
            <div style="color:${urgency};font-weight:700;font-size:10px;">${dias}d · ${fmt(c.custo_total)}</div>
          </div>`;}).join('')}
        ${n>3?`<div style="font-size:11px;color:var(--txt2);align-self:center;">+${n-3} mais</div>`:''}
      </div>
      <button class="btn bg bs" onclick="goto('relatorios',document.querySelector(\"[onclick*=\\'relatorios\\']\"))" style="white-space:nowrap;flex-shrink:0;">Ver todos</button>
    </div>`;
}
let relPeriod='mes';
function setRelPeriod(p,btn){
  relPeriod=p;
  document.querySelectorAll('.rel-per-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  rRelatorios();
}
function getRelDates(){
  const now=new Date();
  if(relPeriod==='tudo')return{from:null,to:null};
  const from=new Date(now);
  if(relPeriod==='mes')from.setDate(1);
  else if(relPeriod==='trim')from.setMonth(now.getMonth()-2,1);
  else if(relPeriod==='semestre')from.setMonth(now.getMonth()-5,1);
  else if(relPeriod==='ano')from.setMonth(0,1);
  from.setHours(0,0,0,0);
  return{from,to:now};
}
function filterByPeriod(arr,dateField){
  const{from,to}=getRelDates();
  if(!from)return arr;
  return arr.filter(x=>{const d=new Date(x[dateField]);return d>=from&&d<=to;});
}
function rRelatorios(){
  if(_planoInfo.plano==='gratis'){
    const secs=['rel-kpis','rel-barchart','rel-donut','rel-donut-legend','rel-top-table','rel-parado-table','rel-canal','rel-evo'];
    secs.forEach(id=>{ const el=document.getElementById(id); if(el)el.innerHTML=''; });
    const kpis=document.getElementById('rel-kpis');
    if(kpis) kpis.innerHTML=`<div style="grid-column:1/-1;background:linear-gradient(135deg,rgba(255,107,43,0.08),rgba(168,85,247,0.04));border:1px solid rgba(255,107,43,0.25);border-radius:var(--r);padding:32px;text-align:center;">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="1.5" style="margin-bottom:12px"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
      <div style="font-family:Syne,sans-serif;font-size:16px;font-weight:800;margin-bottom:6px;">Relatórios disponíveis no Plano Pro</div>
      <div style="font-size:13px;color:var(--txt2);margin-bottom:18px;">Veja gráficos completos, distribuição por categoria, estoque parado e muito mais.</div>
      <button onclick="window.location.href='planos.html'" class="btn bp" style="margin:0 auto;">Ver planos</button>
    </div>`;
    return;
  }
  const vP=filterByPeriod(vendas,'data_venda');
  const cP=filterByPeriod(compras,'data_compra');
  const labels={'mes':'Este mês','trim':'Último trimestre','semestre':'Último semestre','ano':'Este ano','tudo':'Todo o período'};
  const label=labels[relPeriod];
  const totalRec=vP.reduce((a,v)=>a+v.preco_venda,0);
  const totalLuc=vP.reduce((a,v)=>a+(v.lucro||0),0);
  const totalInv=cP.reduce((a,c)=>a+c.custo_total,0);
  const margem=totalRec>0?(totalLuc/totalRec*100):0;
  const roi=totalInv>0?(totalLuc/totalInv*100):0;
  const ticket=vP.length>0?(totalRec/vP.length):0;
  const girosP=vP.map(v=>{const c=iBI(v.compra_id);if(!c)return null;return(new Date(v.data_venda)-new Date(c.data_compra))/(86400000);}).filter(v=>v!==null&&v>=0);
  const giroMed=girosP.length>0?Math.round(girosP.reduce((a,b)=>a+b)/girosP.length):null;
  const ISVG={
    rec:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>`,
    luc:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>`,
    roi:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
    mar:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85"/></svg>`,
    tic:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12V22H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/></svg>`,
    qty:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
    inv:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>`,
    giro:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  };
  const kpis=[
    {k:'rec',lbl:'Receita',v:fmt(totalRec),s:vP.length+' vendas',g:'var(--blue)',bg:'var(--bd)'},
    {k:'luc',lbl:'Lucro',v:fmt(totalLuc),s:`Margem ${fmtP(margem)}`,g:'var(--green)',bg:'var(--gd)'},
    {k:'roi',lbl:'ROI do Período',v:fmtP(roi),s:'Investido: '+fmt(totalInv),g:'var(--gold)',bg:'var(--gold-d)'},
    {k:'mar',lbl:'Margem Média',v:fmtP(margem),s:'lucro / receita',g:'var(--orange)',bg:'var(--og)'},
    {k:'tic',lbl:'Ticket Médio',v:fmt(ticket),s:'por venda',g:'var(--blue)',bg:'var(--bd)'},
    {k:'qty',lbl:'Vendas',v:vP.length+'',s:cP.length+' compras',g:'var(--green)',bg:'var(--gd)'},
    {k:'inv',lbl:'Total Investido',v:fmt(totalInv),s:cP.length+' itens comprados',g:'var(--gold)',bg:'var(--gold-d)'},
    {k:'giro',lbl:'Tempo de Giro',v:giroMed!==null?giroMed+'d':'—',s:'média da compra à venda',g:'var(--orange)',bg:'var(--og)'},
  ];
  document.getElementById('rel-kpis').innerHTML=kpis.map(x=>`<div class="mc">
    <div class="mc-glow" style="background:${x.g}"></div>
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;">
      <div class="mc-ico" style="background:${x.bg};color:${x.g}">${ISVG[x.k].replace('stroke="currentColor"','stroke="'+x.g+'"')}</div>
    </div>
    <div class="mc-lbl">${x.lbl}</div>
    <div class="mc-v" style="color:${x.g}">${x.v}</div>
    <div class="mc-s">${x.s}</div>
  </div>`).join('');
  rRelBarChart(vP,label);
  rRelDonut(vP);
  rRelTopTable(vP);
  rRelParado();
  rRelCanal(vP);
  rRelEvo();
}
function rRelBarChart(vP,label){
  document.getElementById('rel-chart-sub').textContent=label;
  const rpm={},lpm={};
  vP.forEach(v=>{const k=v.data_venda.slice(0,7);rpm[k]=(rpm[k]||0)+v.preco_venda;lpm[k]=(lpm[k]||0)+(v.lucro||0);});
  const keys=Object.keys({...rpm,...lpm}).sort().slice(-8);
  if(!keys.length){document.getElementById('rel-barchart').innerHTML='<div style="color:var(--txt3);font-size:12px;padding:20px;text-align:center">Sem dados no período</div>';return;}
  const maxV=Math.max(...keys.map(k=>rpm[k]||0),1);
  const W=460,H=120,pad=8,gH=90;
  const bw=Math.max((W-2*pad)/keys.length-6,8);
  let svgContent='';
  keys.forEach((k,i)=>{
    const x=pad+i*(W-2*pad)/keys.length+((W-2*pad)/keys.length-bw*2-4)/2;
    const rh=Math.max(((rpm[k]||0)/maxV)*gH,2);
    const lh=Math.max(((lpm[k]||0)/maxV)*gH,2);
    const ry=H-pad-rh,ly=H-pad-lh;
    svgContent+=`<rect x="${x}" y="${ry}" width="${bw}" height="${rh}" rx="3" fill="rgba(77,158,255,0.5)"><title>${k}: ${fmt(rpm[k]||0)}</title></rect>`;
    svgContent+=`<rect x="${x+bw+3}" y="${ly}" width="${bw}" height="${lh}" rx="3" fill="rgba(0,212,138,0.7)"><title>${k} lucro: ${fmt(lpm[k]||0)}</title></rect>`;
    svgContent+=`<text x="${x+bw+1.5}" y="${H}" text-anchor="middle" fill="var(--txt3)" font-size="8">${k.slice(5)}</text>`;
  });
  document.getElementById('rel-barchart').innerHTML=`
    <div style="display:flex;gap:12px;margin-bottom:8px;justify-content:flex-end;">
      <div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--txt2)"><span style="width:8px;height:8px;border-radius:2px;background:rgba(77,158,255,0.5);display:inline-block"></span>Receita</div>
      <div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--txt2)"><span style="width:8px;height:8px;border-radius:2px;background:rgba(0,212,138,0.7);display:inline-block"></span>Lucro</div>
    </div>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;overflow:visible">${svgContent}</svg>`;
}
function rRelDonut(vP){
  const cat={};
  vP.forEach(v=>{const it=iBI(v.compra_id);if(it)cat[it.categoria]=(cat[it.categoria]||0)+(v.lucro||0);});
  const entries=Object.entries(cat).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const total=entries.reduce((a,[,v])=>a+v,0);
  if(!entries.length||!total){
    document.getElementById('rel-donut').innerHTML='<div style="color:var(--txt3);font-size:12px;text-align:center">Sem dados</div>';
    document.getElementById('rel-donut-legend').innerHTML='';
    return;
  }
  const R=55,cx=65,cy=65,stroke=18;
  let offset=0;
  const circ=2*Math.PI*R;
  let paths='';
  entries.forEach(([c,v],i)=>{
    const color=CAT_COLORS[i%CAT_COLORS.length];
    const pct=v/total;
    const dash=pct*circ;
    paths+=`<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-dasharray="${dash} ${circ}" stroke-dashoffset="${-offset*circ}" stroke-linecap="butt" transform="rotate(-90 ${cx} ${cy})"><title>${c}: ${fmt(v)} (${(pct*100).toFixed(1)}%)</title></circle>`;
    offset+=pct;
  });
  document.getElementById('rel-donut').innerHTML=`
    <svg viewBox="0 0 130 130" width="130" height="130" class="donut-svg">
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="${stroke}"/>
      ${paths}
      <text x="${cx}" y="${cy-6}" text-anchor="middle" fill="var(--txt)" font-size="11" font-family="Syne,sans-serif" font-weight="800">${fmt(total)}</text>
      <text x="${cx}" y="${cy+9}" text-anchor="middle" fill="var(--txt3)" font-size="8">lucro total</text>
    </svg>`;
  document.getElementById('rel-donut-legend').innerHTML=entries.map(([c,v],i)=>`
    <div style="display:flex;align-items:center;gap:7px;font-size:11px;">
      <div style="width:9px;height:9px;border-radius:3px;background:${CAT_COLORS[i%CAT_COLORS.length]};flex-shrink:0"></div>
      <span style="color:var(--txt2);flex:1">${c}</span>
      <span style="font-weight:700;color:var(--txt)">${fmt(v)}</span>
    </div>`).join('');
}
function rRelTopTable(vP){
  const sorted=[...vP].sort((a,b)=>(b.lucro||0)-(a.lucro||0)).slice(0,10);
  const tb=document.querySelector('#rel-top-table tbody');
  tb.innerHTML='';
  if(!sorted.length){tb.innerHTML='<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--txt3)">Sem vendas no período</td></tr>';return;}
  sorted.forEach((v,i)=>{
    const it=iBI(v.compra_id),lu=v.lucro||0,cu=it?it.custo_total:0;
    const roi=cu>0?(lu/cu*100).toFixed(1):0;
    const dias=it?Math.round((new Date(v.data_venda)-new Date(it.data_compra))/86400000):null;
    const medal=i<3?['#FFB800','#A0A0A0','#CD7F32'][i]:'var(--txt3)';
    tb.innerHTML+=`<tr>
      <td style="font-weight:800;color:${medal};text-align:center">${i+1}</td>
      <td><strong style="font-size:12px">${it?it.titulo:'—'}</strong></td>
      <td style="white-space:nowrap">${fmt(cu)}</td>
      <td style="white-space:nowrap">${fmt(v.preco_venda)}</td>
      <td class="${lu>=0?'pp':'pn'}" style="white-space:nowrap">${fmt(lu)}</td>
      <td class="${roi>=0?'pp':'pn'}" style="white-space:nowrap">${roi}%</td>
      <td style="color:var(--txt2)">${dias!==null?dias+'d':'—'}</td>
    </tr>`;
  });
}
function rRelParado(){
  const hoje=new Date();
  const parados=compras.filter(c=>{
    if(isV(c.id))return false;
    return(hoje-new Date(c.data_compra))/86400000>=30;
  }).map(c=>({...c,dias:Math.round((hoje-new Date(c.data_compra))/86400000)})).sort((a,b)=>b.dias-a.dias);
  const tb=document.querySelector('#rel-parado-table tbody');
  tb.innerHTML='';
  if(!parados.length){tb.innerHTML='<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--txt3)">Nenhum item parado há mais de 30 dias</td></tr>';return;}
  parados.slice(0,8).forEach(c=>{
    const urgency=c.dias>=90?'var(--red)':c.dias>=60?'var(--orange)':'var(--gold)';
    tb.innerHTML+=`<tr>
      <td><strong style="font-size:12px">${c.titulo}</strong>${c.notas?`<br><span style="font-size:10px;color:var(--txt2);font-style:italic">${c.notas.slice(0,35)}...</span>`:''}</td>
      <td><span class="tag tgr">${c.categoria}</span></td>
      <td>${fmt(c.custo_total)}</td>
      <td><span style="font-weight:800;color:${urgency}">${c.dias}d</span></td>
      <td><button class="btn bp bs" style="font-size:10px;padding:4px 10px" onclick="openV('${c.id}');goto('vendas',document.querySelector('[onclick*=vendas]'))">Vender</button></td>
    </tr>`;
  });
}
function rRelCanal(vP){
  const canal={};
  vP.forEach(v=>{const k=v.canal||'Outro';canal[k]=(canal[k]||{n:0,rec:0});canal[k].n++;canal[k].rec+=v.preco_venda;});
  const entries=Object.entries(canal).sort((a,b)=>b[1].rec-a[1].rec);
  const maxRec=entries.length?entries[0][1].rec:1;
  document.getElementById('rel-canal').innerHTML=!entries.length
    ?'<div style="color:var(--txt3);font-size:12px;padding:10px;text-align:center">Sem dados</div>'
    :entries.map(([k,v],i)=>{
      const color=CAT_COLORS[i%CAT_COLORS.length];
      return`<div style="display:flex;align-items:center;gap:8px;">
        <div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
            <span style="font-size:11px;font-weight:600">${k}</span>
            <span style="font-size:10px;color:var(--txt2)">${v.n} venda${v.n>1?'s':''} · ${fmt(v.rec)}</span>
          </div>
          <div style="height:3px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${v.rec/maxRec*100}%;background:${color};border-radius:2px"></div>
          </div>
        </div>
      </div>`;}).join('');
}
function rRelEvo(){
  document.getElementById('rel-evo-sub').textContent='Últimos 12 meses';
  const cpm={},vpm={};
  compras.forEach(c=>{const k=c.data_compra.slice(0,7);cpm[k]=(cpm[k]||0)+c.custo_total;});
  vendas.forEach(v=>{const k=v.data_venda.slice(0,7);vpm[k]=(vpm[k]||0)+v.preco_venda;});
  const allKeys=[...new Set([...Object.keys(cpm),...Object.keys(vpm)])].sort().slice(-12);
  if(!allKeys.length){document.getElementById('rel-evo').innerHTML='<div style="color:var(--txt3);font-size:12px;padding:20px;text-align:center">Sem dados</div>';return;}
  const maxV=Math.max(...allKeys.map(k=>Math.max(cpm[k]||0,vpm[k]||0)),1);
  const W=440,H=100,pad=8,gH=80;
  const bw=Math.max((W-2*pad)/allKeys.length-8,6);
  let svgC='';
  allKeys.forEach((k,i)=>{
    const x=pad+i*(W-2*pad)/allKeys.length+((W-2*pad)/allKeys.length-bw*2-4)/2;
    const ch=Math.max(((cpm[k]||0)/maxV)*gH,2),vh=Math.max(((vpm[k]||0)/maxV)*gH,2);
    svgC+=`<rect x="${x}" y="${H-pad-ch}" width="${bw}" height="${ch}" rx="2" fill="rgba(255,107,43,0.5)"><title>Compras ${k}: ${fmt(cpm[k]||0)}</title></rect>`;
    svgC+=`<rect x="${x+bw+3}" y="${H-pad-vh}" width="${bw}" height="${vh}" rx="2" fill="rgba(77,158,255,0.6)"><title>Vendas ${k}: ${fmt(vpm[k]||0)}</title></rect>`;
    if(i===0||i===allKeys.length-1||allKeys.length<=6)svgC+=`<text x="${x+bw+1.5}" y="${H}" text-anchor="middle" fill="var(--txt3)" font-size="8">${k.slice(5)}</text>`;
  });
  document.getElementById('rel-evo').innerHTML=`
    <div style="display:flex;gap:12px;margin-bottom:8px;justify-content:flex-end;">
      <div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--txt2)"><span style="width:8px;height:8px;border-radius:2px;background:rgba(255,107,43,0.5);display:inline-block"></span>Compras</div>
      <div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--txt2)"><span style="width:8px;height:8px;border-radius:2px;background:rgba(77,158,255,0.6);display:inline-block"></span>Vendas</div>
    </div>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;overflow:visible">${svgC}</svg>`;
}
function printRelatorio(){
  const label={'mes':'Este Mês','trim':'Trimestre','semestre':'Semestre','ano':'Ano','tudo':'Período Completo'}[relPeriod];
  const w=window.open('','_blank','width=900,height=700');
  const rel=document.getElementById('sec-relatorios').innerHTML;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Relatório BriqueOS — ${label}</title>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" rel="stylesheet"/>
  <style>
    :root{--bg:#fff;--bg2:#f8f9fa;--bg3:#f1f3f5;--bg4:#e9ecef;--border:rgba(0,0,0,.08);--border2:rgba(0,0,0,.15);--txt:#1a1a2e;--txt2:#555;--txt3:#888;--orange:#FF6B2B;--orange2:#FF8F5C;--og:rgba(255,107,43,0.1);--green:#00a86b;--gd:rgba(0,168,107,.1);--red:#d63031;--rd:rgba(214,48,49,.08);--blue:#2563EB;--bd:rgba(37,99,235,.1);--gold:#d4a017;--gold-d:rgba(212,160,23,.1);--r:10px;--rs:6px;}
    *{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Plus Jakarta Sans',sans-serif;background:#fff;color:var(--txt);padding:32px;}
    h1{font-family:'Syne',sans-serif;font-size:22px;font-weight:800;margin-bottom:4px;}
    .sub{font-size:13px;color:var(--txt2);margin-bottom:24px;}
    .mtr8{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px;}
    .mc{background:#f8f9fa;border:1px solid var(--border2);border-radius:var(--r);padding:14px;position:relative;overflow:hidden;}
    .mc-lbl{font-size:9px;font-weight:700;color:var(--txt3);text-transform:uppercase;letter-spacing:.7px;margin-bottom:4px;}
    .mc-v{font-family:'Syne',sans-serif;font-size:18px;font-weight:800;line-height:1;margin-bottom:3px;}
    .mc-s{font-size:10px;color:var(--txt2);}
    .mc-glow{position:absolute;top:0;left:0;right:0;height:2px;}
    .mc-ico{width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;margin-bottom:10px;}
    .card{background:#f8f9fa;border:1px solid var(--border2);border-radius:var(--r);overflow:hidden;margin-bottom:16px;}
    .ch{padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;}
    .ch-left{display:flex;align-items:center;gap:8px;}
    .ch-ico{width:24px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;}
    .ct{font-family:'Syne',sans-serif;font-size:12px;font-weight:700;}
    .csub{font-size:10px;color:var(--txt3);}
    .dt{width:100%;border-collapse:collapse;font-size:11px;}
    .dt th{font-size:9px;font-weight:700;color:var(--txt3);text-transform:uppercase;padding:7px 12px;text-align:left;border-bottom:1.5px solid var(--border2);}
    .dt td{padding:8px 12px;border-bottom:1px solid var(--border);}
    .dt tr:last-child td{border-bottom:none;}
    .pp{color:var(--green);font-weight:700;}.pn{color:var(--red);font-weight:700;}
    .tag{font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;display:inline-block;background:#e9ecef;color:#555;}
    .rel-per-btn,.btn,.sec-toolbar,.goal-bar,.hamburger,.topbar,.sidebar,.ov,.mc-trend{display:none!important;}
    @media print{body{padding:16px;}h1{font-size:18px;}}
  </style></head><body>
  <h1>Relatório BriqueOS</h1>
  <div class="sub">Período: ${label} · Gerado em ${new Date().toLocaleString('pt-BR')}</div>
  ${rel}
  <script>window.onload=()=>window.print();<\/script>
  </body></html>`);
  w.document.close();
}
let _theme=localStorage.getItem('bq_theme')||'dark';
function applyTheme(t){
  _theme=t;
  document.documentElement.setAttribute('data-theme',t);
  localStorage.setItem('bq_theme',t);
  const btn=document.getElementById('theme-btn');
  if(btn)btn.innerHTML=t==='dark'
    ?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>'
    :'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
}
function toggleTheme(){applyTheme(_theme==='dark'?'light':'dark');}
applyTheme(_theme);
const MAX_HIST=80;
function logAtividade(tipo,titulo,detalhe,valor){
  const entries=JSON.parse(localStorage.getItem('bq_hist')||'[]');
  entries.unshift({tipo,titulo,detalhe,valor,ts:Date.now()});
  if(entries.length>MAX_HIST)entries.length=MAX_HIST;
  localStorage.setItem('bq_hist',JSON.stringify(entries));
}
function rHistPanel(){
  const entries=JSON.parse(localStorage.getItem('bq_hist')||'[]');
  const el=document.getElementById('hist-list');
  if(!el)return;
  if(!entries.length){el.innerHTML='<div class="hist-empty">Nenhuma atividade ainda</div>';return;}
  const TIPO={
    compra:{color:'var(--orange)',bg:'var(--og)',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/></svg>'},
    venda:{color:'var(--green)',bg:'var(--gd)',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>'},
    delete:{color:'var(--red)',bg:'var(--rd)',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>'},
    edit:{color:'var(--blue)',bg:'var(--bd)',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'},
    meta:{color:'var(--gold)',bg:'var(--gold-d)',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>'},
  };
  function tsLabel(ts){
    const d=new Date(ts),n=new Date();
    const diff=(n-d)/1000;
    if(diff<60)return'agora mesmo';
    if(diff<3600)return Math.round(diff/60)+'min atrás';
    if(diff<86400)return Math.round(diff/3600)+'h atrás';
    return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
  }
  el.innerHTML=entries.map((e,i)=>{
    const t=TIPO[e.tipo]||TIPO.compra;
    return`<div class="hist-item hist-line">
      <div class="hist-dot" style="background:${t.bg};color:${t.color}">${t.icon.replace('stroke="currentColor"','stroke="'+t.color+'"')}</div>
      <div class="hist-content">
        <div class="hist-text">${e.titulo}</div>
        <div class="hist-detail">${e.detalhe||''}${e.valor?` · <strong style="color:${t.color}">${fmt(e.valor)}</strong>`:''}</div>
        <div class="hist-ts">${tsLabel(e.ts)}</div>
      </div>
    </div>`;}).join('');
}
function toggleHist(){
  const p=document.getElementById('hist-panel');
  const isOpen=p.classList.contains('open');
  if(!isOpen)rHistPanel();
  p.classList.toggle('open');
  closeNotif();
}
let _notifsRead=JSON.parse(localStorage.getItem('bq_notif_read')||'[]');
function computeNotifs(){
  const ns=[];
  const hoje=new Date();
  const goal=getGoal();
  if(goal>0){
    const now=hoje.toISOString().slice(0,7);
    const lMes=vendas.filter(v=>v.data_venda.slice(0,7)===now).reduce((a,v)=>a+(v.lucro||0),0);
    const pct=lMes/goal*100;
    if(pct>=100)ns.push({id:'goal_done',tipo:'meta',msg:'Meta do mês atingida!',det:`Lucro de ${fmt(lMes)} — ${Math.round(pct)}% da meta`,icon:'gold'});
    else if(pct>=80)ns.push({id:'goal_80',tipo:'meta',msg:'Quase lá! 80% da meta',det:`${fmt(lMes)} de ${fmt(goal)} — faltam ${fmt(goal-lMes)}`,icon:'gold'});
  }
  const parados=compras.filter(c=>{if(isV(c.id))return false;return(hoje-new Date(c.data_compra))/86400000>=45;});
  if(parados.length>0)ns.push({id:`parado_${parados.length}`,tipo:'alerta',msg:`${parados.length} produto${parados.length>1?'s':''} parado${parados.length>1?'s':''} há 45+ dias`,det:`Capital imobilizado: ${fmt(parados.reduce((a,c)=>a+c.custo_total,0))}`,icon:'red'});
  const now=hoje.toISOString().slice(0,7);
  const vendasMes=vendas.filter(v=>v.data_venda.slice(0,7)===now).length;
  const diasMes=hoje.getDate();
  if(diasMes>=10&&vendasMes===0&&vendas.length>0)ns.push({id:'no_sales',tipo:'alerta',msg:'Nenhuma venda este mês ainda',det:`Já se passaram ${diasMes} dias do mês`,icon:'red'});
  const totalInv=compras.reduce((a,c)=>a+c.custo_total,0);
  const l=ltot();
  const roi=totalInv>0?(l/totalInv*100):0;
  if(vendas.length>=5&&roi<10)ns.push({id:'roi_low',tipo:'alerta',msg:`ROI geral baixo: ${roi.toFixed(1)}%`,det:'Considere revisar preços de compra e venda',icon:'orange'});
  return ns;
}
function rNotifPanel(){
  const ns=computeNotifs();
  const dot=document.getElementById('notif-dot');
  const unread=ns.filter(n=>!_notifsRead.includes(n.id));
  if(dot)dot.classList.toggle('show',unread.length>0);
  const el=document.getElementById('notif-list');
  if(!el)return;
  if(!ns.length){el.innerHTML='<div class="notif-empty">Tudo em ordem por aqui</div>';return;}
  const ICONS={
    meta:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
    alerta:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  };
  const COLS={gold:'var(--gold)',red:'var(--red)',orange:'var(--orange)',green:'var(--green)'};
  const BGS={gold:'var(--gold-d)',red:'var(--rd)',orange:'var(--og)',green:'var(--gd)'};
  el.innerHTML=ns.map(n=>{
    const col=COLS[n.icon]||'var(--orange)';
    const bg=BGS[n.icon]||'var(--og)';
    const isUnread=!_notifsRead.includes(n.id);
    return`<div class="notif-item ${isUnread?'unread':''}">
      <div class="notif-ico" style="background:${bg};color:${col}">${ICONS[n.tipo]?.replace('stroke="currentColor"','stroke="'+col+'"')||''}</div>
      <div class="notif-body">
        <div class="notif-msg">${n.msg}</div>
        <div style="font-size:11px;color:var(--txt2);">${n.det}</div>
      </div>
    </div>`;}).join('');
}
function toggleNotif(){
  const p=document.getElementById('notif-panel');
  const wasOpen=p.classList.contains('open');
  p.classList.toggle('open');
  if(!wasOpen){
    rNotifPanel();
    const ns=computeNotifs();
    _notifsRead=[...new Set([..._notifsRead,...ns.map(n=>n.id)])];
    localStorage.setItem('bq_notif_read',JSON.stringify(_notifsRead));
    const dot=document.getElementById('notif-dot');
    if(dot)dot.classList.remove('show');
  }
  const hp=document.getElementById('hist-panel');
  if(hp)hp.classList.remove('open');
}
function closeNotif(){document.getElementById('notif-panel')?.classList.remove('open');}
function clearNotifs(){_notifsRead=[];localStorage.removeItem('bq_notif_read');rNotifPanel();}
document.addEventListener('click',e=>{
  const np=document.getElementById('notif-panel');
  const nb=document.getElementById('notif-btn');
  if(np&&!np.contains(e.target)&&nb&&!nb.contains(e.target))closeNotif();
});
let coPg=1,vePg=1;
const PG_SIZE=15;
function renderPagination(id,total,cur,setCb){
  const el=document.getElementById(id);
  if(!el)return;
  const pages=Math.ceil(total/PG_SIZE);
  if(pages<=1){el.innerHTML='';return;}
  let html=`<button class="pag-btn" onclick="${setCb}(${cur-1})" ${cur<=1?'disabled':''}>‹</button>`;
  const range=[];
  for(let i=1;i<=pages;i++){
    if(i===1||i===pages||Math.abs(i-cur)<=1)range.push(i);
    else if(range[range.length-1]!=='…')range.push('…');
  }
  range.forEach(p=>{
    if(p==='…')html+=`<span class="pag-info">…</span>`;
    else html+=`<button class="pag-btn ${p===cur?'active':''}" onclick="${setCb}(${p})">${p}</button>`;
  });
  html+=`<button class="pag-btn" onclick="${setCb}(${cur+1})" ${cur>=pages?'disabled':''}>›</button>`;
  html+=`<span class="pag-info">${(cur-1)*PG_SIZE+1}–${Math.min(cur*PG_SIZE,total)} de ${total}</span>`;
  el.innerHTML=html;
}
function setCoPg(p){coPg=p;rCTFiltered();}
function setVePg(p){vePg=p;rVTFiltered();}
function acTitulo(input){
  const q=input.value.trim().toLowerCase();
  const ac=document.getElementById('ac-titulo');
  if(!ac)return;
  if(q.length<2){ac.classList.remove('open');return;}
  const prev=[...new Set(compras.map(c=>c.titulo))].filter(t=>t.toLowerCase().includes(q)).slice(0,6);
  if(!prev.length){ac.classList.remove('open');return;}
  ac.innerHTML=prev.map(t=>`<div class="ac-item" onclick="selectAC('${t.replace(/'/g,"\\'")}')">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    ${t}
  </div>`).join('');
  ac.classList.add('open');
}
function selectAC(val){
  const inp=document.getElementById('ci-t');
  if(inp){inp.value=val;}
  const existing=compras.filter(c=>c.titulo===val)[0];
  if(existing){
    if(existing.categoria)document.getElementById('ci-ca').value=existing.categoria;
    if(existing.condicao)document.getElementById('ci-cn').value=existing.condicao;
    if(existing.marca)document.getElementById('ci-ma').value=existing.marca;
    if(existing.modelo)document.getElementById('ci-mo').value=existing.modelo;
  }
  document.getElementById('ac-titulo')?.classList.remove('open');
}
document.addEventListener('click',e=>{
  if(!e.target.closest('.ac-wrap'))document.getElementById('ac-titulo')?.classList.remove('open');
});
function exportBackup(){
  const data={
    version:2,
    exported:new Date().toISOString(),
    usuario:_usuario,
    meta_mensal:localStorage.getItem('bq_goal'),
    historico:localStorage.getItem('bq_hist'),
    compras,vendas
  };
  const json=JSON.stringify(data,null,2);
  const a=document.createElement('a');
  a.href='data:application/json;charset=utf-8,'+encodeURIComponent(json);
  a.download='backup_briqueOS_'+new Date().toISOString().slice(0,10)+'.json';
  a.click();
  const info=document.getElementById('backup-info');
  if(info)info.textContent=`Backup gerado: ${compras.length} compras e ${vendas.length} vendas · ${new Date().toLocaleString('pt-BR')}`;
  logAtividade('meta','Backup exportado',`${compras.length} compras, ${vendas.length} vendas`);
  toast('Backup exportado com sucesso!');
}
async function importBackup(input){
  if(!input.files||!input.files[0])return;
  const reader=new FileReader();
  reader.onload=async e=>{
    try{
      const data=JSON.parse(e.target.result);
      if(!data.compras||!data.vendas)throw new Error('Arquivo inválido');
      if(!confirm(`Restaurar ${data.compras.length} compras e ${data.vendas.length} vendas?\n\nIsso vai sobrescrever seus dados atuais.`))return;
      if(data.meta_mensal)localStorage.setItem('bq_goal',data.meta_mensal);
      if(data.historico)localStorage.setItem('bq_hist',data.historico);
      toast('Dados restaurados — recarregue a página para sincronizar com o servidor');
      logAtividade('edit','Backup restaurado',`${data.compras.length} compras importadas`);
    }catch(err){toast('Arquivo inválido ou corrompido',false);}
  };
  reader.readAsText(input.files[0]);
  input.value='';
}
let _deferredPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();_deferredPrompt=e;
  if(!localStorage.getItem('bq_pwa_dismissed'))
    setTimeout(()=>document.getElementById('pwa-banner')?.classList.add('show'),3000);
});
window.addEventListener('appinstalled',()=>{
  document.getElementById('pwa-banner')?.classList.remove('show');
  toast('BriqueOS instalado com sucesso!');
  _deferredPrompt=null;
});
function installPWA(){
  if(_deferredPrompt){_deferredPrompt.prompt();_deferredPrompt.userChoice.then(()=>{_deferredPrompt=null;document.getElementById('pwa-banner')?.classList.remove('show');});}
}
function dismissPWA(){document.getElementById('pwa-banner')?.classList.remove('show');localStorage.setItem('bq_pwa_dismissed','1');}
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT')return;
  const key=e.key.toLowerCase();
  if(e.key==='Escape'){['ov-c','ov-v','ov-confirm','ov-goal','ov-backup'].forEach(id=>cOv(id));closeNotif();document.getElementById('hist-panel')?.classList.remove('open');}
  if(key==='n'&&!e.ctrlKey&&!e.metaKey){oOv('ov-c');setEditMode(false);e.preventDefault();}
  if(key==='v'&&!e.ctrlKey&&!e.metaKey){openV();e.preventDefault();}
  if(key==='/'&&!e.ctrlKey&&!e.metaKey){const s=document.querySelector('.search-inp');if(s){s.focus();e.preventDefault();}}
});
function gotoMobile(id,el){
  document.querySelectorAll('.ni').forEach(b=>b.classList.remove('active'));
  const ni=document.querySelector(`.ni[onclick*="'${id}'"]`);
  if(ni)ni.classList.add('active');
  document.querySelectorAll('.bn-item').forEach(b=>b.classList.remove('active'));
  if(el)el.classList.add('active');
  document.querySelectorAll('.sec').forEach(s=>s.classList.remove('active'));
  document.getElementById('sec-'+id)?.classList.add('active');
  document.getElementById('ptitle').textContent=PTITLES[id]||id;
  document.getElementById('tbtns').innerHTML=PBTNS[id]||'';
  if(id==='relatorios')rRelatorios();
  closeSidebar();
}
function fabAction(){
  const cur=document.querySelector('.sec.active')?.id?.replace('sec-','');
  if(cur==='vendas')openV();
  else{oOv('ov-c');setEditMode(false);}
}
function sVI(id){
  selI=id;
  document.querySelectorAll('.vi').forEach(e=>e.classList.remove('sel'));
  const el=document.getElementById('vi-'+id);
  if(el)el.classList.add('sel');
  cL();
}
function haptic(type='light'){
  if(!navigator.vibrate)return;
  const patterns={light:[10],medium:[20],success:[10,50,10],error:[40,20,40]};
  navigator.vibrate(patterns[type]||patterns.light);
}
function showConfirmDialog(title,msg,okLabel='Confirmar',cancelLabel='Cancelar',type='danger'){
  return new Promise(resolve=>{
    const colors={danger:'var(--red)',warning:'var(--gold)',info:'var(--blue)'};
    const col=colors[type]||colors.danger;
    const icon={
      danger:`<svg viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`,
      warning:`<svg viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
      info:`<svg viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    };
    document.getElementById('confirm-title').textContent=title;
    document.getElementById('confirm-msg').innerHTML=msg;
    document.getElementById('confirm-ico').style.background=col+'18';
    document.getElementById('confirm-ico').innerHTML=icon[type]||icon.danger;
    const okBtn=document.getElementById('confirm-ok');
    okBtn.textContent=okLabel;
    okBtn.style.background=type==='danger'?col:type==='warning'?col:'var(--orange)';
    okBtn.style.boxShadow=`0 4px 14px ${col}40`;
    const newOk=okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOk,okBtn);
    newOk.onclick=()=>{cOv('ov-confirm');resolve(true);};
    document.getElementById('confirm-cancel-btn').onclick=()=>{cOv('ov-confirm');resolve(false);};
    oOv('ov-confirm');
  });
}
function checkGoalAchieved(){
  const goal=getGoal();if(!goal)return;
  const now=new Date().toISOString().slice(0,7);
  const lMes=vendas.filter(v=>v.data_venda.slice(0,7)===now).reduce((a,v)=>a+(v.lucro||0),0);
  const key='bq_goal_notified_'+now;
  if(lMes>=goal&&!localStorage.getItem(key)){
    localStorage.setItem(key,'1');
    haptic('success');
    setTimeout(()=>toast('Meta do mês atingida! '+fmt(lMes)+' de lucro'),500);
    logAtividade('meta','Meta do mês atingida!',fmt(lMes)+' lucro em '+now,lMes);
  }
}
function showSkeleton(){
  const sk=(n,h=60)=>Array(n).fill(`<div style="height:${h}px;background:linear-gradient(90deg,var(--bg3) 25%,var(--bg4) 50%,var(--bg3) 75%);background-size:200%;border-radius:var(--rs);animation:skPulse 1.4s ease infinite;"></div>`).join('');
  const dm=document.getElementById('dash-m');
  if(dm)dm.innerHTML=`<style>@keyframes skPulse{0%{background-position:200% 0}100%{background-position:-200% 0}}</style>`+sk(4,88);
  const hl=document.getElementById('h-lucro');
  if(hl)hl.textContent='—';
}
function hideSkeleton(){
}
const OB_STEPS=[
  {
    title:'Registre sua primeira compra',
    desc:'Cadastre um produto que você comprou para revender. Informe o título, categoria, preço pago e a data de compra.',
    action:'Registrar compra',
    fn:()=>{skipOnboarding();oOv('ov-c');setEditMode(false);},
    ico:`<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>`,
    color:'var(--og)',
    progress:'33%',
  },
  {
    title:'Registre sua primeira venda',
    desc:'Quando vender um produto, registre aqui. O BriqueOS calcula automaticamente o seu lucro e ROI.',
    action:'Registrar venda',
    fn:()=>{skipOnboarding();openV();},
    ico:`<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
    color:'var(--gd)',
    progress:'66%',
  },
  {
    title:'Veja seu lucro no Dashboard',
    desc:'Com compras e vendas registradas, o Dashboard mostra seu lucro, ROI, gráficos de evolução e muito mais!',
    action:'Ver Dashboard',
    fn:()=>{skipOnboarding();goto('dashboard',document.querySelector('[onclick*="dashboard"]'));},
    ico:`<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
    color:'var(--bd)',
    progress:'100%',
  }
];
let obStep=0;
function initOnboarding(){
  if(localStorage.getItem('bq_onboarded'))return;
  if(compras.length>0){localStorage.setItem('bq_onboarded','1');return;}
  obStep=0;
  renderObStep();
  const el=document.getElementById('onboarding');
  if(el)el.style.display='flex';
}
function renderObStep(){
  const s=OB_STEPS[obStep];if(!s)return;
  document.getElementById('ob-ico').style.background=s.color;
  document.getElementById('ob-ico').innerHTML=s.ico;
  document.getElementById('ob-step').textContent=`Passo ${obStep+1} de 3`;
  document.getElementById('ob-title').textContent=s.title;
  document.getElementById('ob-desc').textContent=s.desc;
  document.getElementById('ob-action').textContent=s.action;
  document.getElementById('ob-progress').style.width=s.progress;
  [1,2,3].forEach(i=>{
    const d=document.getElementById('ob-dot-'+i);
    if(!d)return;
    d.style.width=i===obStep+1?'8px':'6px';
    d.style.height=i===obStep+1?'8px':'6px';
    d.style.background=i<=obStep+1?'var(--orange)':'var(--border2)';
  });
}
function obAction(){OB_STEPS[obStep]?.fn();}
function skipOnboarding(){
  const el=document.getElementById('onboarding');
  if(el)el.style.display='none';
  localStorage.setItem('bq_onboarded','1');
}
function checkOnboardingStep(type){
  const el=document.getElementById('onboarding');
  if(!el||el.style.display==='none')return;
  if(type==='compra'&&obStep===0){obStep=1;renderObStep();}
  else if(type==='venda'&&obStep===1){obStep=2;renderObStep();}
}
let editingVendaId=null;
function openEditVenda(id){
  const v=vendas.find(v=>v.id===Number(id)||v.id===id);
  if(!v)return;
  editingVendaId=v.id;
  const it=iBI(v.compra_id);
  document.getElementById('ev-sub').textContent=it?`Produto: ${it.titulo}`:'Editar venda';
  document.getElementById('ev-p').value=v.preco_venda;
  document.getElementById('ev-d').value=v.data_venda;
  document.getElementById('ev-ca').value=v.canal||'OLX';
  document.getElementById('ev-pg').value=v.pagamento||'PIX';
  const cu=it?it.custo_total:0;
  const lu=v.preco_venda-cu;
  document.getElementById('ev-resumo').innerHTML=`
    <div class="cr_"><span>Custo do item</span><span>${fmt(cu)}</span></div>
    <div class="cr_"><span>Preço de venda</span><span>${fmt(v.preco_venda)}</span></div>
    <div class="cr_ tot"><span>Lucro</span><span class="${lu>=0?'pp':'pn'}">${fmt(lu)}</span></div>`;
  oOv('ov-ev');
}
async function saveEditVenda(){
  const preco_venda=+document.getElementById('ev-p').value||0;
  const data_venda=document.getElementById('ev-d').value;
  if(!preco_venda||preco_venda<=0){toast('Preço deve ser maior que zero!',false);return;}
  if(!data_venda){toast('Informe a data!',false);return;}
  if(data_venda>new Date().toISOString().slice(0,10)){toast('Data não pode ser no futuro!',false);return;}
  const v=vendas.find(v=>v.id===editingVendaId);
  const it=v?iBI(v.compra_id):null;
  if(it&&data_venda<it.data_compra){toast('Data anterior à compra!',false);return;}
  const btn=document.querySelector('#ov-ev .btn.bp');
  if(btn){btn.disabled=true;btn.textContent='Salvando...';}
  try{
    await apiPut('/vendas/'+editingVendaId,{
      preco_venda,data_venda,
      canal:document.getElementById('ev-ca').value,
      pagamento:document.getElementById('ev-pg').value
    });
    haptic('light');
    cOv('ov-ev');editingVendaId=null;
    await loadData();
    toast('Venda atualizada!');
    logAtividade('edit','Venda editada',fmt(preco_venda),preco_venda);
  }catch(e){toast('Erro: '+e.message,false);}
  finally{if(btn){btn.disabled=false;btn.textContent='Salvar alterações';}}
}
const DB_NAME='briqueosOffline',DB_VERSION=1,STORE='queue';
let offlineDb=null;
function initOfflineDB(){
  if(!window.indexedDB)return;
  const req=indexedDB.open(DB_NAME,DB_VERSION);
  req.onupgradeneeded=e=>{e.target.result.createObjectStore(STORE,{keyPath:'id',autoIncrement:true});};
  req.onsuccess=e=>{offlineDb=e.target.result;processOfflineQueue();};
}
function addToOfflineQueue(method,path,body){
  if(!offlineDb)return;
  const tx=offlineDb.transaction(STORE,'readwrite');
  tx.objectStore(STORE).add({method,path,body,ts:Date.now()});
  toast('Sem conexão — operação salva e será enviada quando a internet voltar',false);
}
async function processOfflineQueue(){
  if(!offlineDb||navigator.onLine===false)return;
  const tx=offlineDb.transaction(STORE,'readwrite');
  const store=tx.objectStore(STORE);
  const all=await new Promise(r=>{const req=store.getAll();req.onsuccess=()=>r(req.result);});
  for(const item of all){
    try{
      const r=await fetch(`${API}${item.path}`,{
        method:item.method,
        headers:authHeaders(),
        body:item.body?JSON.stringify(item.body):undefined
      });
      if(r.ok){
        const tx2=offlineDb.transaction(STORE,'readwrite');
        tx2.objectStore(STORE).delete(item.id);
      }
    }catch(e){break;}
  }
  if(all.length){await loadData();toast(all.length+' operação(ões) sincronizada(s)!');}
}
window.addEventListener('online',()=>{processOfflineQueue();toast('Conexão restaurada!');});
window.addEventListener('offline',()=>{toast('Sem internet — operações serão salvas localmente',false);});
function initSwipeDelete(tableId,deleteFn){
  let startX=0,startY=0,activeRow=null,activeType=null;
  const cleanup=()=>{
    if(activeRow){
      activeRow.style.transform='';
      activeRow.style.transition='transform .3s ease';
      const btn=activeRow.querySelector('.swipe-del-btn');
      if(btn)btn.style.opacity='0';
      activeRow=null;
    }
  };
  document.getElementById(tableId)?.addEventListener('touchstart',e=>{
    const tr=e.target.closest('tr[data-id]');
    if(!tr)return;
    cleanup();
    activeRow=tr;
    startX=e.touches[0].clientX;
    startY=e.touches[0].clientY;
    tr.style.transition='';
  },{passive:true});
  document.getElementById(tableId)?.addEventListener('touchmove',e=>{
    if(!activeRow)return;
    const dx=e.touches[0].clientX-startX;
    const dy=Math.abs(e.touches[0].clientY-startY);
    if(dy>20){cleanup();return;}
    if(dx<-10){
      activeRow.style.transform=`translateX(${Math.max(dx,-80)}px)`;
      const btn=activeRow.querySelector('.swipe-del-btn');
      if(btn)btn.style.opacity=Math.min(-dx/80,1)+'';
    }
  },{passive:true});
  document.addEventListener('touchend',()=>{
    if(!activeRow)return;
    const tr=activeRow;
    const dx=parseFloat(tr.style.transform.replace('translateX(',''))||0;
    if(dx<-60){
      const id=tr.dataset.id;
      const nome=tr.dataset.nome||'';
      cleanup();
      deleteFn(id,nome);
    }else{cleanup();}
  });
}
function launchConfetti(duration=3000){
  const colors=['#FF6B2B','#FFB800','#00D48A','#4D9EFF','#A855F7','#FF4D6A'];
  const total=120;
  for(let i=0;i<total;i++){
    setTimeout(()=>{
      const el=document.createElement('div');
      el.style.cssText=`position:fixed;z-index:9999;pointer-events:none;
        width:${6+Math.random()*8}px;height:${6+Math.random()*8}px;
        border-radius:${Math.random()>.5?'50%':'2px'};
        background:${colors[Math.floor(Math.random()*colors.length)]};
        left:${Math.random()*100}vw;top:-10px;
        animation:confettiFall ${1.5+Math.random()*2}s ease-in forwards;
        transform:rotate(${Math.random()*360}deg);`;
      document.body.appendChild(el);
      setTimeout(()=>el.remove(),3000);
    },Math.random()*duration*.6);
  }
}
(()=>{
  if(document.getElementById('confetti-style'))return;
  const s=document.createElement('style');
  s.id='confetti-style';
  s.textContent=`@keyframes confettiFall{
    0%{transform:translateY(0) rotate(0deg);opacity:1;}
    100%{transform:translateY(100vh) rotate(720deg);opacity:0;}
  }`;
  document.head.appendChild(s);
})();
let _lastLevel = 0;
function checkLevelUp(lucro){
  const lv = getLv(lucro);
  if(_lastLevel > 0 && lv.n > _lastLevel){
    launchConfetti(3000);
    showLevelUpModal(lv);
    haptic('success');
  }
  _lastLevel = lv.n;
}
function showLevelUpModal(lv){
  const existing = document.getElementById('levelup-modal');
  if(existing) existing.remove();
  const m = document.createElement('div');
  m.id = 'levelup-modal';
  m.style.cssText=`position:fixed;inset:0;z-index:999;display:flex;align-items:center;
    justify-content:center;padding:20px;background:rgba(0,0,0,.7);backdrop-filter:blur(6px);`;
  m.innerHTML=`
    <div style="background:var(--bg2);border:2px solid var(--gold);border-radius:24px;
      padding:36px 28px;text-align:center;max-width:360px;width:100%;
      box-shadow:0 0 60px rgba(255,184,0,.3);animation:su .4s cubic-bezier(.34,1.56,.64,1)">
      <div style="font-size:52px;margin-bottom:12px">${lv.m}</div>
      <div style="font-size:11px;font-weight:700;color:var(--gold);text-transform:uppercase;
        letter-spacing:1.5px;margin-bottom:6px">Novo Nível Desbloqueado!</div>
      <div style="font-family:'Syne',sans-serif;font-size:26px;font-weight:900;
        color:var(--gold);margin-bottom:6px">Nível ${lv.n} — ${lv.name}</div>
      <div style="font-size:13px;color:var(--txt2);margin-bottom:22px">
        Você atingiu <strong>${fmt(lv.min)}</strong> de lucro. Continue assim!
      </div>
      <button onclick="document.getElementById('levelup-modal').remove()"
        class="btn bp" style="width:100%;justify-content:center;font-size:14px;padding:12px">
        Continuar
      </button>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e=>{ if(e.target===m) m.remove(); });
}
let _conquistas = {conquista_10k: false, conquista_50k: false};
async function checkConquistas(){
  if(!_token) return;
  try{
    const r = await fetch(`${API}/auth/me/conquistas`, {headers:authHeaders()});
    if(!r.ok) return;
    const data = await r.json();
    const key50 = 'bq_cel_50k', key10 = 'bq_cel_10k';
    if(data.conquista_50k && !localStorage.getItem(key50)){
      localStorage.setItem(key50, '1');
      _mostrarParabens('R$ 50.000', '👑');
    } else if(data.conquista_10k && !localStorage.getItem(key10)){
      localStorage.setItem(key10, '1');
      _mostrarParabens('R$ 10.000', '🏆');
    }
    _conquistas = data;
  }catch(e){}
}
function _mostrarParabens(marco, emoji){
  launchConfetti(4000);
  haptic('success');
  if(document.getElementById('parabens-modal')) return;
  const m = document.createElement('div');
  m.id = 'parabens-modal';
  m.style.cssText = `position:fixed;inset:0;z-index:998;display:flex;align-items:center;
    justify-content:center;padding:20px;background:rgba(0,0,0,.75);backdrop-filter:blur(6px);`;
  m.innerHTML = `
    <div style="background:var(--bg2);border:2px solid var(--gold);border-radius:24px;
      padding:36px 28px;max-width:380px;width:100%;text-align:center;
      box-shadow:0 0 60px rgba(255,184,0,.3);animation:su .4s cubic-bezier(.34,1.56,.64,1)">
      <div style="font-size:56px;margin-bottom:14px;">${emoji}</div>
      <div style="font-family:'Syne',sans-serif;font-size:11px;font-weight:800;
        color:var(--gold);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;">
        Marco atingido!
      </div>
      <div style="font-family:'Syne',sans-serif;font-size:24px;font-weight:900;
        color:var(--gold);margin-bottom:10px;">
        ${marco} de lucro!
      </div>
      <div style="font-size:13px;color:var(--txt2);line-height:1.7;margin-bottom:24px;">
        Parabéns! Você atingiu <strong style="color:var(--gold)">${marco}</strong> de lucro acumulado.<br/>
        Continue assim e conquiste ainda mais! 🚀
      </div>
      <button onclick="document.getElementById('parabens-modal').remove()"
        class="btn bp" style="width:100%;justify-content:center;font-size:14px;padding:13px;">
        Obrigado! 🎉
      </button>
    </div>`;
  m.addEventListener('click', e => { if(e.target === m) m.remove(); });
  document.body.appendChild(m);
}
const VAPID_PUBLIC = 'BOC7nEeFT5Q_2U9jME_NX1z8Hy1Y4FPDpF_UMwGp9E1jK3xOaFqR2sYJ5LcN8V6mQdTbZ3';
async function initPushNotifications(){
  if(!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try{
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if(existing) return; // já inscrito
    const perm = await Notification.requestPermission();
    if(perm !== 'granted') return;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: VAPID_PUBLIC,
    });
    await fetch(`${API}/push/subscribe`,{
      method:'POST', headers:authHeaders(),
      body: JSON.stringify(sub.toJSON())
    });
    console.log('[Push] Inscrito com sucesso');
  }catch(e){
    console.log('[Push] Não disponível:', e.message);
  }
}
async function eqCarregar(){
  const lista = document.getElementById('eq-lista-main');
  if(!lista) return;
  lista.innerHTML = '<div style="padding:24px;text-align:center;color:var(--txt3);font-size:12px;">Carregando...</div>';
  const eu = JSON.parse(localStorage.getItem('bq_usuario')||'null');
  const isDono = !eu?.conta_pai_id;
  const convidarCard = document.getElementById('eq-convidar-card');
  if(convidarCard) convidarCard.style.display = isDono ? 'block' : 'none';
  try{
    const r = await fetch(`${API}/equipe`,{headers:authHeaders()});
    if(!r.ok) throw new Error('Erro ao carregar equipe');
    const membros = await r.json();
    const counter = document.getElementById('eq-counter-main');
    if(isDono){
      if(counter){ counter.textContent = `${membros.length} / 4 membros`; counter.style.display=''; }
      const nb = document.getElementById('nb-equipe');
      if(nb){ nb.textContent = membros.length; nb.style.display = membros.length > 0 ? 'inline-flex' : 'none'; }
    } else {
      if(counter) counter.style.display = 'none';
    }
    if(!membros.length){
      lista.innerHTML = `<div style="text-align:center;padding:40px 20px;">
        <div style="font-size:32px;margin-bottom:12px;opacity:.4;">👥</div>
        <div style="font-size:13px;font-weight:600;color:var(--txt2);margin-bottom:4px;">Nenhum membro ainda</div>
        <div style="font-size:11px;color:var(--txt3);">${isDono ? 'Convide até 4 pessoas acima' : 'Nenhum colega na equipe ainda'}</div>
      </div>`;
      return;
    }
    lista.innerHTML = membros.map(m => {
      const colors=['#FF6B2B','#00D48A','#4D9EFF','#FFB800','#A855F7','#FF4D6A'];
      let h=0; for(const c of m.nome||'') h=(h+c.charCodeAt(0))%colors.length;
      const init=(m.nome||'?').trim().split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase();
      const acoes = isDono
        ? `<button onclick="eqRemover(${m.id},'${(m.nome||'').replace(/'/g,"\'")}')"
            class="btn bg" style="padding:5px 10px;font-size:10px;color:var(--red);border-color:rgba(255,77,106,0.2);">
            Remover
           </button>`
        : '';
      return `<div style="display:flex;align-items:center;gap:14px;padding:14px 20px;border-bottom:1px solid var(--border);">
        <div style="width:40px;height:40px;border-radius:50%;background:${colors[h]};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;flex-shrink:0;">${init}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${m.nome}</div>
          <div style="font-size:11px;color:var(--txt2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${m.email}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
          <span class="tag ${m.ativo?'tg':'tgr'}">${m.ativo?'Ativo':'Inativo'}</span>
          ${acoes}
        </div>
      </div>`;
    }).join('')+'<div style="height:4px;"></div>';
  }catch(e){
    lista.innerHTML=`<div style="color:var(--red);font-size:12px;padding:16px 20px;">Erro: ${e.message}</div>`;
  }
}
async function eqConvidar(){
  const nome  = document.getElementById('eq-nome-main')?.value.trim();
  const email = document.getElementById('eq-email-main')?.value.trim();
  const alertEl = document.getElementById('eq-alert-main');
  const btn   = document.getElementById('eq-btn-main');
  const showAlert = (msg,ok)=>{
    if(!alertEl) return;
    alertEl.style.cssText=`display:flex;margin-top:12px;padding:10px 13px;border-radius:var(--rs);font-size:12px;align-items:center;gap:8px;background:${ok?'var(--gd)':'var(--rd)'};color:${ok?'var(--green)':'var(--red)'};border:1px solid ${ok?'rgba(0,212,138,0.25)':'rgba(255,77,106,0.25)'};`;
    alertEl.textContent=msg;
  };
  if(!nome||nome.length<2){showAlert('Informe o nome do membro',false);return;}
  if(!email||!email.includes('@')){showAlert('Informe um e-mail válido',false);return;}
  if(btn){btn.disabled=true;btn.textContent='Enviando...';}
  try{
    const r=await fetch(`${API}/equipe/convidar`,{
      method:'POST',headers:authHeaders(),body:JSON.stringify({nome,email})
    });
    const data=await r.json();
    if(!r.ok) throw new Error(data.detail||'Erro ao convidar');
    showAlert(`✓ Convite enviado para ${email}`,true);
    document.getElementById('eq-nome-main').value='';
    document.getElementById('eq-email-main').value='';
    toast('Convite enviado!');
    setTimeout(eqCarregar,1000);
  }catch(e){showAlert(e.message,false);}
  finally{
    if(btn){btn.disabled=false;btn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Enviar convite`;}
  }
}
async function eqRemover(id,nome){
  if(!confirm(`Remover ${nome} da equipe?`)) return;
  try{
    const r=await fetch(`${API}/equipe/${id}`,{method:'DELETE',headers:authHeaders()});
    if(!r.ok) throw new Error('Erro ao remover');
    toast(`${nome} removido da equipe`);
    eqCarregar();
  }catch(e){toast('Erro: '+e.message,false);}
}
function mostrarNavEquipe(){
  const plano=_planoInfo?.plano||'gratis';
  const ni=document.getElementById('ni-equipe');
  if(ni) ni.style.display=plano==='business'?'flex':'none';
}
document.getElementById('ci-d').value=new Date().toISOString().split('T')[0];
document.getElementById('tbtns').innerHTML='';
initUserUI();
showSkeleton();
loadData().then(()=>{
  initOnboarding();
  checkGoalAchieved();
  setTimeout(initPushNotifications, 5000);
}).catch(()=>{});
initOfflineDB();
const _ovAll=['ov-c','ov-v','ov-ev','ov-confirm','ov-goal','ov-backup'];
_ovAll.forEach(id=>{
  const el=document.getElementById(id);
  if(el)el.addEventListener('click',function(e){if(e.target===this)cOv(id);});
});
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
if(location.hash==='#compra'){oOv('ov-c');setEditMode(false);location.hash='';}
if(location.hash==='#venda'){setTimeout(openV,800);location.hash='';}
if(window.innerWidth>768){
  setTimeout(()=>{
    const t=document.getElementById('tbtns');
    if(t&&!t.innerHTML.trim()){
      t.innerHTML=`<span style="font-size:10px;color:var(--txt3);display:flex;gap:10px;align-items:center">
        <span><kbd class="kbd">N</kbd> nova compra</span>
        <span><kbd class="kbd">V</kbd> nova venda</span>
        <span><kbd class="kbd">/</kbd> buscar</span>
      </span>`;
    }
  },1200);
}
