let pendingPdf = null;

function escHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, function(m){
    return ({
      '&':'&amp;', // Corrigido para &amp;
      '<':'&lt;',   // Corrigido para &lt;
      '>':'&gt;',   // Corrigido para &gt;
      '"':'&quot;',
      "'":'&#39;'
    })[m];
  });
}

function parseMoney(v){
  return parseFloat(
    String(v ?? '')
      .replace(/\s/g,'')
      .replace(/[R$]/g,'')
      .replace(/\./g,'')
      .replace(',', '.')
      .replace(/[^\d.-]/g,'')
  ) || 0;
}

function dateBRtoISO(v){
  const m = String(v ?? '').match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : today();
}
const SK = 'cfv7'; // Storage Key
const DEFAULT_EXP_CATS = ['Alimentação', 'Transporte e veículos', 'Moradia', 'Lazer e entretenimento', 'Saúde', 'Educação', 'Assinaturas', 'Pets', 'Outros'];
const DEFAULT_INC_CATS = ['Salário', 'Freelance', 'Investimentos', 'Presente', 'Outros'];
const DEFAULT_CARD = {name: 'Meu Cartão', closeDay: 10, dueDay: 17, limit: 2000};

// Seed data (dados de exemplo)
const SEED_EXP = [
  {id:'e1',date:'2024-05-15',amount:120.50,desc:'Supermercado',cat:'Alimentação',sub:'Compras',type:'cartao',note:''},
  {id:'e2',date:'2024-05-20',amount:45.00,desc:'Uber',cat:'Transporte e veículos',sub:'Aplicativo',type:'cartao',note:''},
  {id:'e3',date:'2024-05-25',amount:80.00,desc:'Restaurante',cat:'Alimentação',sub:'Jantar',type:'cartao',note:''},
  {id:'e4',date:'2024-06-01',amount:1500.00,desc:'Aluguel',cat:'Moradia',sub:'Mensal',type:'fixo',note:''},
  {id:'e5',date:'2024-06-05',amount:30.00,desc:'Café',cat:'Alimentação',sub:'Lanche',type:'pix',note:''},
  {id:'e6',date:'2024-06-12',amount:75.00,desc:'Cinema',cat:'Lazer e entretenimento',sub:'Filme',type:'cartao',note:''}
];
const SEED_INC = [
  {id:'i1',date:'2024-05-30',amount:3000.00,desc:'Salário',cat:'Salário',sub:'Mensal',note:''},
  {id:'i2',date:'2024-06-10',amount:500.00,desc:'Freelance',cat:'Freelance',sub:'Projeto X',note:''}
];

var STATE = {};
var editExpId = null;
var editIncId = null;
var printCtx = {};

// ── UTILS ──────────────────────────────────────────────────────
function uid(){return 'x'+Date.now().toString(36)+Math.random().toString(36).slice(2);}
function pad(n){return String(n).padStart(2,'0');}
function money(v){return 'R$ '+((+v)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}
function today(){var d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function currentMonth(){var d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1);}
function monthKey(date){return (date||'').substr(0,7);}
function monthLabel(mk){if(!mk)return '';var m=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];var p=mk.split('-');return m[parseInt(p[1])-1]+' '+p[0];}
function fmtDate(d){if(!d)return '';var p=d.split('-');return p.length<3?d:p[2]+'/'+p[1]+'/'+p[0];}
function clone(x){return JSON.parse(JSON.stringify(x));}
function ge(id){return document.getElementById(id);}
function setHTML(id,html){var el=ge(id);if(el)el.innerHTML=html;}
function sumAmounts(arr){return arr.reduce(function(s,x){return s+(+x.amount||0);},0);}
function groupByCategory(arr){var m={};arr.forEach(function(x){m[x.cat]=(m[x.cat]||0)+(+x.amount||0);});return m;}
function uniqueMonths(arr){var s={};arr.forEach(function(x){if(x.date)s[monthKey(x.date)]=1;});return Object.keys(s).sort();}

// ── STATE ──────────────────────────────────────────────────────
function freshState(){return {expenses:clone(SEED_EXP),incomes:clone(SEED_INC),expCats:clone(DEFAULT_EXP_CATS),incCats:clone(DEFAULT_INC_CATS),smartMap:{},card:clone(DEFAULT_CARD)};}
function loadState(){
  try{
    var s=localStorage.getItem(SK);
    if(s){
      var p=JSON.parse(s);
      STATE={
        expenses:Array.isArray(p.expenses)?p.expenses:clone(SEED_EXP),
        incomes:Array.isArray(p.incomes)?p.incomes:clone(SEED_INC),
        expCats:Array.isArray(p.expCats)&&p.expCats.length?p.expCats:clone(DEFAULT_EXP_CATS),
        incCats:Array.isArray(p.incCats)&&p.incCats.length?p.incCats:clone(DEFAULT_INC_CATS),
        smartMap:p.smartMap||{},
        card:p.card?p.card:clone(DEFAULT_CARD) // Carrega ou usa default
      };
    }else{STATE=freshState();}
  }catch(e){STATE=freshState();}
}
function saveState(){try{localStorage.setItem(SK,JSON.stringify(STATE));}catch(e){}updateInfo();}
function updateInfo(){var el=ge('storageInfo');if(el)el.innerHTML='<p class="note">'+STATE.expenses.length+' gastos · '+STATE.incomes.length+' receitas · '+Object.keys(STATE.smartMap||{}).length+' termos aprendidos</p>';}

// ── INVOICE ────────────────────────────────────────────────────
function invoiceInfo(mk){
  var closeDay=STATE.card.closeDay||10;
  var dueDay=STATE.card.dueDay||17;
  var p=mk.split('-').map(Number),y=p[0],m=p[1];
  var pm=m-1,py=y;if(pm<1){pm=12;py--;}
  var nm=m+1,ny=y;if(nm>12){nm=1;ny++;}
  function z(n){return String(n).padStart(2,'0');}
  return {
    open:py+'-'+z(pm)+'-'+z(closeDay+1),
    close:y+'-'+z(m)+'-'+z(closeDay),
    post:y+'-'+z(m)+'-'+z(dueDay-3), // Postagem 3 dias antes do vencimento
    due:y+'-'+z(m)+'-'+z(dueDay),
    next:ny+'-'+z(nm)+'-'+z(closeDay)
  };
}
function invoiceRows(mk){var fi=invoiceInfo(mk);return STATE.expenses.filter(function(e){return e.type==='cartao'&&e.date>=fi.open&&e.date<=fi.close;});}

// ── FILLS ──────────────────────────────────────────────────────
function fillMonthSelect(ids,months){
  var opts='<option value="">Todos os meses</option>'+months.map(function(m){return '<option value="'+m+'">'+monthLabel(m)+'</option>';}).join('');
  ids.forEach(function(id){var el=ge(id);if(!el)return;var cur=el.value;el.innerHTML=opts;if(cur&&months.indexOf(cur)>=0)el.value=cur;else if(months.length)el.value=months[months.length-1];});
}
function fillInvSelect(months){
  var el=ge('invMonth');if(!el)return;
  var cur=el.value;
  el.innerHTML=months.map(function(m){return '<option value="'+m+'">'+monthLabel(m)+'</option>';}).join('');
  if(cur&&months.indexOf(cur)>=0)el.value=cur;else{var cm=currentMonth();el.value=months.indexOf(cm)>=0?cm:(months[months.length-1]||cm);}
}
function fillCatSelect(id,cats,withAll){
  var el=ge(id);if(!el)return;
  var cur=el.value;
  el.innerHTML=(withAll?'<option value="">Todas categorias</option>':'')+cats.map(function(c){return '<option value="'+c+'">'+c+'</option>';}).join('');
  if(cur&&cats.indexOf(cur)>=0)el.value=cur;
}

// ── NAV ────────────────────────────────────────────────────────
function goTab(id,el){
  document.querySelectorAll('.pnl').forEach(function(p){p.classList.remove('on');});
  document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('on');});
  ge(id).classList.add('on');
  el.classList.add('on');
  if(id==='t6') renderConfig(); // Renderiza configs ao abrir a aba
}
function clearFilters(){
  ['sumSearch','invSearch','expSearch','incSearch'].forEach(function(id){var el=ge(id);if(el)el.value='';});
  ['expCatF','expTypeF','incCatF'].forEach(function(id){var el=ge(id);if(el)el.value='';});
  render();
}

// ── WIDGET ─────────────────────────────────────────────────────
function renderWidget(){
  var box=ge('quickWidget');if(!box)return;
  var mk=currentMonth();
  var exps=STATE.expenses.filter(function(x){return x.date&&x.date.substr(0,7)===mk;});
  var incs=STATE.incomes.filter(function(x){return x.date&&x.date.substr(0,7)===mk;});
  var te=sumAmounts(exps),ti=sumAmounts(incs),sal=ti-te;
  var last=STATE.expenses.slice().sort(function(a,b){return a.date<b.date?1:-1;})[0]||null;
  var iv=invoiceRows(mk),it=sumAmounts(iv),fi=invoiceInfo(mk);
  var sal_col=sal>=0?'#70d090':'#f09090';
  var limit=STATE.card.limit||0;
  var usedPct=limit?Math.min(100,(it/limit)*100):0;
  var col=usedPct>=90?'#f09090':usedPct>=75?'#f0c040':'#70d090';

  box.innerHTML=
    '<div class="qw-head"><div><div class="qw-title">📊 Resumo — '+monthLabel(mk)+'</div></div><button class="btn soft" onclick="openQuick()">+ Gasto</button></div>'+
    '<div class="qw-grid">'+
    '<div class="qw-item"><div class="qw-label">Saldo</div><div class="qw-value" style="color:'+sal_col+'">'+money(sal)+'</div></div>'+
    '<div class="qw-item"><div class="qw-label">Gastos</div><div class="qw-value" style="color:#f09090">'+money(te)+'</div></div>'+
    '<div class="qw-item"><div class="qw-label">Fatura '+STATE.card.name+'</div><div class="qw-value" style="color:#f0c040">'+money(it)+'</div></div>'+
    '<div class="qw-item"><div class="qw-label">Vencimento</div><div class="qw-value" style="font-size:13px">'+fmtDate(fi.due)+'</div></div>'+
    '</div>'+
    (limit?'<div style="height:8px;background:#07111f;border-radius:99px;overflow:hidden;margin-bottom:8px"><div style="width:'+usedPct.toFixed(1)+'%;height:100%;background:'+col+';border-radius:99px"></div></div>':'')+
    '<div class="qw-last">'+(last?'Último: '+last.desc+' · '+money(last.amount):'Sem lançamentos')+'</div>';
}
function openQuick(){
  document.querySelectorAll('.tab')[2].click();
  var d=ge('expDate');if(d&&!d.value)d.value=today();
  setTimeout(function(){var v=ge('expValue');if(v)v.focus();},60);
}

// ── SMART CAT ──────────────────────────────────────────────────
var RULES=[
  {k:['UBER','99POP','TAXI'],cat:'Transporte e veículos',sub:'Aplicativo'},
  {k:['POSTO','PETROCAL','GASOLINA','COMBUST','IPIRANGA','SHELL'],cat:'Transporte e veículos',sub:'Combustível'},
  {k:['PARKING','ESTACIONAMENTO','EPARK'],cat:'Transporte e veículos',sub:'Estacionamento'},
  {k:['IFOOD','RAPPI','DELIVERY'],cat:'Alimentação',sub:'Delivery'},
  {k:['RESTAURANTE','SUSHI','PIZZA','BURGER','CAFE','PADARIA'],cat:'Alimentação',sub:'Restaurante'},
  {k:['MIX MATEUS','MATEUS','MERCADO','SUPERMERCADO','EXTRA','ASSAI','CARREFOUR'],cat:'Alimentação',sub:'Supermercado'},
  {k:['HORTIFRUTI','VERDFRUT'],cat:'Alimentação',sub:'Hortifruti'},
  {k:['NETFLIX','SPOTIFY','YOUTUBE','CANVA','OPENAI','CHATGPT','APPLE','DISNEY','AMAZON PRIME'],cat:'Assinaturas',sub:'Streaming'},
  {k:['COBASI','AMIGO BICHO','PET'],cat:'Pets',sub:'Pet shop'},
  {k:['PAGUE MENOS','FARMAC','DROGARIA'],cat:'Saúde',sub:'Farmácia'},
  {k:['GOL','AZUL','LATAM'],cat:'Viagens',sub:'Passagem aérea'},
  {k:['AMAZON','MERCADOLIVRE','SHOPEE','MAGALU'],cat:'Outros',sub:'Marketplace'}
];
function norm(t){return(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();}
function smartSuggest(desc){
  var t=norm(desc);if(!t)return null;
  if(STATE.smartMap[t])return STATE.smartMap[t];
  var rk=t.split(' ').slice(0,3).join(' ');
  if(STATE.smartMap[rk])return STATE.smartMap[rk];
  for(var i=0;i<RULES.length;i++){var r=RULES[i];for(var j=0;j<r.k.length;j++){if(t.indexOf(norm(r.k[j]))>=0)return{cat:r.cat,sub:r.sub};}}
  return null;
}
function learn(desc,cat,sub){
  var t=norm(desc);if(!t||!cat)return;
  var v={cat:cat,sub:sub||''};
  STATE.smartMap[t]=v;
  STATE.smartMap[t.split(' ').slice(0,3).join(' ')]=v;
  saveState();
}
function suggestCat(){
  var d=ge('expDesc'),c=ge('expCat'),s=ge('expSub'),h=ge('expHint');
  if(!d||!c)return;
  var sug=smartSuggest(d.value);
  if(sug){
    for(var i=0;i<c.options.length;i++){if(c.options[i].value===sug.cat){c.value=sug.cat;break;}}
    if(s&&!s.value&&sug.sub)s.value=sug.sub;
    if(h)h.textContent='💡 Sugestão: '+sug.cat+(sug.sub?' · '+sug.sub:'');
  }else{if(h)h.textContent='';}
}

// ── REUSABLE RENDER FUNCTIONS ──────────────────────────────────
function renderKpi(lbl,val,hint,cls){return '<div class="kc '+cls+'"><div class="kl">'+lbl+'</div><div class="kv">'+val+'</div><div class="kh">'+hint+'</div></div>';}
function renderBarRow(id,data,cls){
  var pairs=Object.entries(data).sort(function(a,b){return b[1]-a[1];});
  var max=pairs.length?pairs[0][1]:1;
  setHTML(id,pairs.slice(0,8).map(function(p){
    var w=Math.min(100,(p[1]/max)*100).toFixed(1);
    return '<div class="br-row"><div class="br-lbl" title="'+p[0]+'">'+p[0]+'</div><div class="br-trk"><div class="br-fill'+(cls?' '+cls:'')+'" style="width:'+w+'%"></div></div><div class="br-val">'+money(p[1])+'</div></div>';
  }).join('')||'<p class="note">Sem dados.</p>');
}
function renderCatLine(id,cats,type){
  setHTML(id,cats.map(function(c){
    var delFn = type === 'exp' ? 'delExpCat' : 'delIncCat';
    return '<div class="catline"><span class="catname">'+c+'</span><button class="db" onclick="'+delFn+'(\''+c.replace(/'/g,"\\'")+'\')" title="Excluir">✕</button></div>';
  }).join('')||'<p class="note">Nenhuma categoria.</p>');
}
function renderTableRows(id,headers,data,rowMapper,emptyMsg){
  var tableHtml = '<thead><tr>'+headers.map(function(h){return '<th>'+h+'</th>';}).join('')+'</tr></thead><tbody>';
  tableHtml += data.length ? data.map(rowMapper).join('') : '<tr><td colspan="'+headers.length+'" style="text-align:center;padding:12px;color:#7a9cbf">'+emptyMsg+'</td></tr>';
  tableHtml += '</tbody>';
  setHTML(id,tableHtml);
}

// ── RENDER ─────────────────────────────────────────────────────
function render(){
  var allM=uniqueMonths(STATE.expenses.concat(STATE.incomes));
  fillMonthSelect(['sumMonth','expMonth','incMonth'],allM);
  fillInvSelect(allM);
  fillCatSelect('expCat',STATE.expCats,false);
  fillCatSelect('expCatF',STATE.expCats,true);
  fillCatSelect('incCat',STATE.incCats,false);
  fillCatSelect('incCatF',STATE.incCats,true);

  renderWidget();

  var sMon=ge('sumMonth')?ge('sumMonth').value:'';
  var sSrc=ge('sumSearch')?(ge('sumSearch').value||'').toLowerCase().trim():'';

  function mE(e,mon,cat,typ,q){return(!mon||monthKey(e.date)===mon)&&(!cat||e.cat===cat)&&(!typ||e.type===typ)&&(!q||(e.desc+' '+e.cat+' '+(e.sub||'')+' '+(e.note||'')).toLowerCase().indexOf(q)>=0);}
  function mI(i,mon,cat,q){return(!mon||monthKey(i.date)===mon)&&(!cat||i.cat===cat)&&(!q||(i.desc+' '+i.cat+' '+(i.sub||'')).toLowerCase().indexOf(q)>=0);}

  var fE=STATE.expenses.filter(function(e){return mE(e,sMon,'','',sSrc);});
  var fI=STATE.incomes.filter(function(i){return mI(i,sMon,'',sSrc);});
  var tE=sumAmounts(fE),tI=sumAmounts(fI),sal=tI-tE;

  var invMk=ge('invMonth')&&ge('invMonth').value?ge('invMonth').value:currentMonth();
  var fi=invoiceInfo(invMk),ivR=invoiceRows(invMk),tInv=sumAmounts(ivR);

  // KPIs
  setHTML('kpis',
    renderKpi('Gastos',money(tE),sMon?monthLabel(sMon):'Histórico completo','re')+
    renderKpi('Receitas',money(tI),sMon?monthLabel(sMon):'Histórico completo','pu')+
    renderKpi('Saldo',money(sal),sal>=0?'Positivo ✓':'Negativo ✗',sal>=0?'gr':'re')+
    renderKpi('Fatura',money(tInv),'Vence '+fmtDate(fi.due),'y')
  );

  // Invoice summary in resumo
 setHTML('sumInvoice',
  '<div class="invoice-mini">' +
    '<div class="mini-top">' +
      '<div>' +
        '<div class="mini-title">Fatura atual</div>' +
        '<div class="mini-value">' + money(tInv) + '</div>' +
      '</div>' +
      '<span class="pill wn">' + fmtDate(fi.due) + '</span>' +
    '</div>' +
    '<div class="mini-meta">' +
      ivR.length + ' compras · Fechamento ' + fmtDate(fi.close) + ' · Vencimento ' + fmtDate(fi.due) +
    '</div>' +
  '</div>'
);

  // Bars exp/inc
  renderBarRow('barsExp',groupByCategory(fE),'');
  renderBarRow('barsInc',groupByCategory(fI),'i');

  // Month-to-month bars
  var mMapE={},mMapI={};
  STATE.expenses.forEach(function(x){mMapE[monthKey(x.date)]=(mMapE[monthKey(x.date)]||0)+(+x.amount||0);});
  STATE.incomes.forEach(function(x){mMapI[monthKey(x.date)]=(mMapI[monthKey(x.date)]||0)+(+x.amount||0);});
  var mList=Object.keys(mMapE).concat(Object.keys(mMapI)).filter(function(v,i,a){return a.indexOf(v)===i;}).sort();
  var mMax=mList.length?Math.max.apply(null,mList.map(function(m){return Math.max(mMapE[m]||0,mMapI[m]||0);})):'1';
  setHTML('barsMonth',mList.slice(-6).map(function(m){
    var pE=Math.min(100,((mMapE[m]||0)/mMax)*100).toFixed(1);
    var pI=Math.min(100,((mMapI[m]||0)/mMax)*100).toFixed(1);
    return '<div class="br-row"><div class="br-lbl">'+monthLabel(m)+'</div><div style="flex:1;display:flex;flex-direction:column;gap:2px"><div class="br-trk" style="height:6px"><div class="br-fill" style="width:'+pE+'%"></div></div><div class="br-trk" style="height:6px"><div class="br-fill i" style="width:'+pI+'%"></div></div></div><div class="br-val">'+money(mMapE[m]||0)+'</div></div>';
  }).join('')||'<p class="note">Sem dados.</p>');

  // Meta alerts
  var catByPeriod=groupByCategory(fE);
  var metas=[{cat:'Alimentação',teto:1800},{cat:'Lazer e entretenimento',teto:900},{cat:'Viagens',teto:2500}];
  setHTML('metaAlerts',metas.map(function(mt){
    var g=catByPeriod[mt.cat]||0,p=Math.min(100,(g/mt.teto)*100);
    var cls=p>=100?'dn':p>=80?'wn':'ok';
    var col=p>=100?'#f09090':p>=80?'#f0c040':'#70d090';
    return '<div style="margin-bottom:10px">'+
      '<div class="row" style="justify-content:space-between;margin-bottom:3px"><span style="font-size:11px;font-weight:800">'+mt.cat+'</span><span class="note">'+money(g)+' / '+money(mt.teto)+'</span></div>'+
      '<div style="height:8px;background:#07111f;border-radius:99px;overflow:hidden;margin-bottom:5px"><div style="width:'+p.toFixed(1)+'%;height:100%;background:'+col+';border-radius:99px"></div></div>'+
      '<span class="pill '+cls+'">'+(p>=100?'Estourou!':p>=80?'Atenção':'OK')+' · '+p.toFixed(0)+'%</span>'+
    '</div>';
  }).join(''));

  // Recent tables
  var recE=fE.slice().sort(function(a,b){return a.date<b.date?1:-1;}).slice(0,6);
  renderTableRows('sumExpT',['Data','Descrição','Categoria','Valor'],recE,function(e){
    return '<tr><td>'+fmtDate(e.date)+'</td><td>'+e.desc+'</td><td>'+e.cat+'</td><td class="tr" style="color:#f09090">'+money(e.amount)+'</td></tr>';
  },'Nenhum gasto.');
  var recI=fI.slice().sort(function(a,b){return a.date<b.date?1:-1;}).slice(0,6);
  renderTableRows('sumIncT',['Data','Descrição','Categoria','Valor'],recI,function(i){
    return '<tr><td>'+fmtDate(i.date)+'</td><td>'+i.desc+'</td><td>'+i.cat+'</td><td class="tr" style="color:#c0a0f0">'+money(i.amount)+'</td></tr>';
  },'Nenhuma receita.');

  // Invoice tab
  var invSrc=ge('invSearch')?(ge('invSearch').value||'').toLowerCase().trim():'';
  var invFilt=ivR.filter(function(e){return !invSrc||(e.desc+' '+e.cat+' '+(e.sub||'')).toLowerCase().indexOf(invSrc)>=0;}).sort(function(a,b){return a.date<b.date?-1:1;});

  setHTML('invSummary',
    '<div class="fat"><h2>💳 Fatura '+monthLabel(invMk)+' · '+STATE.card.name+'</h2>'+
    '<div class="fat-tot"><div class="fv">'+money(tInv)+'</div><div class="fi">'+ivR.length+' compras · Vence em '+fmtDate(fi.due)+'</div></div>'+
    '<div class="fat-gr">'+
    '<div><div class="fdl">Abertura</div><div class="fdv">'+fmtDate(fi.open)+'</div></div>'+
    '<div><div class="fdl">Fechamento</div><div class="fdv">'+fmtDate(fi.close)+'</div></div>'+
    '<div><div class="fdl">Vencimento</div><div class="fdv" style="color:#f0c040">'+fmtDate(fi.due)+'</div></div>'+
    '</div></div>'
  );
  renderTableRows('invT',['Data','Descrição','Categoria','Sub.','Valor'],invFilt,function(e){
    return '<tr><td>'+fmtDate(e.date)+'</td><td>'+e.desc+'</td><td>'+e.cat+'</td><td>'+(e.sub||'')+'</td><td class="tr">'+money(e.amount)+'</td></tr>';
  },'Nenhuma compra neste ciclo.');

  printCtx={month:invMk,rows:invFilt,total:tInv,info:fi};

  // Expenses tab
  var eMon=ge('expMonth')?ge('expMonth').value:'';
  var eCat=ge('expCatF')?ge('expCatF').value:'';
  var eTyp=ge('expTypeF')?ge('expTypeF').value:'';
  var eSrc=ge('expSearch')?(ge('expSearch').value||'').toLowerCase().trim():'';
  var expList=STATE.expenses.filter(function(e){return mE(e,eMon,eCat,eTyp,eSrc);}).sort(function(a,b){return a.date<b.date?1:-1;});

  renderTableRows('expT',['Data','Descrição','Categoria','Sub.','Tipo','Obs.','Valor','Ações'],expList,function(e){
    return '<tr>'+
      '<td>'+fmtDate(e.date)+'</td>'+
      '<td>'+e.desc+'</td>'+
      '<td>'+e.cat+'</td>'+
      '<td>'+(e.sub||'')+'</td>'+
      '<td>'+e.type+'</td>'+
      '<td>'+(e.note||'')+'</td>'+
      '<td class="tr" style="color:#f09090">'+money(e.amount)+'</td>'+
      '<td><button class="eb" onclick="editExpense(\''+e.id+'\')">Editar</button> <button class="db" onclick="deleteExpense(\''+e.id+'\')">✕</button></td>'+
    '</tr>';
  },'Nenhum gasto.');

  // Incomes tab
  var iMon=ge('incMonth')?ge('incMonth').value:'';
  var iCat=ge('incCatF')?ge('incCatF').value:'';
  var iSrc=ge('incSearch')?(ge('incSearch').value||'').toLowerCase().trim():'';
  var incList=STATE.incomes.filter(function(i){return mI(i,iMon,iCat,iSrc);}).sort(function(a,b){return a.date<b.date?1:-1;});

  renderTableRows('incT',['Data','Descrição','Categoria','Sub.','Obs.','Valor','Ações'],incList,function(i){
    return '<tr>'+
      '<td>'+fmtDate(i.date)+'</td>'+
      '<td>'+i.desc+'</td>'+
      '<td>'+i.cat+'</td>'+
      '<td>'+(i.sub||'')+'</td>'+
      '<td>'+(i.note||'')+'</td>'+
      '<td class="tr" style="color:#c0a0f0">'+money(i.amount)+'</td>'+
      '<td><button class="eb" onclick="editIncome(\''+i.id+'\')">Editar</button> <button class="db" onclick="deleteIncome(\''+i.id+'\')">✕</button></td>'+
    '</tr>';
  },'Nenhuma receita.');

  // Categories tab
  renderCatLine('expCatList',STATE.expCats,'exp');
  renderCatLine('incCatList',STATE.incCats,'inc');

  // Print area
  setHTML('printArea',
    '<div class="card">'+
      '<h2>Fatura do Cartão · '+monthLabel(printCtx.month)+' · '+money(printCtx.total)+'</h2>'+
      '<div class="fat-tot" style="margin-bottom:12px">'+
        '<div class="kl">Total da fatura</div>'+
        '<div class="fv">'+money(printCtx.total)+'</div>'+
        '<div class="fi">'+printCtx.rows.length+' compras · Vence em '+fmtDate(printCtx.info.due)+'</div>'+
      '</div>'+
      '<div class="fat-gr" style="margin-bottom:14px">'+
        '<div><div class="fdl">Abertura</div><div class="fdv">'+fmtDate(printCtx.info.open)+'</div></div>'+
        '<div><div class="fdl">Fechamento</div><div class="fdv">'+fmtDate(printCtx.info.close)+'</div></div>'+
        '<div><div class="fdl">Postagem</div><div class="fdv">'+fmtDate(printCtx.info.post)+'</div></div>'+
        '<div><div class="fdl">Vencimento</div><div class="fdv">'+fmtDate(printCtx.info.due)+'</div></div>'+
        '<div><div class="fdl">Próx. fechamento</div><div class="fdv">'+fmtDate(printCtx.info.next)+'</div></div>'+
        '<div><div class="fdl">Compras</div><div class="fdv">'+printCtx.rows.length+' lançamentos</div></div>'+
      '</div>'+
      '<div class="tw">'+
        '<table>'+
          '<thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Sub.</th><th class="tr">Valor</th></tr></thead>'+
          '<tbody>'+
            (printCtx.rows.length ? printCtx.rows.map(function(e){
              return '<tr><td>'+fmtDate(e.date)+'</td><td>'+e.desc+'</td><td>'+e.cat+'</td><td>'+(e.sub||'')+'</td><td class="tr">'+money(e.amount)+'</td></tr>';
            }).join('') : '<tr><td colspan="5" style="text-align:center;padding:12px">Nenhuma compra neste ciclo.</td></tr>') +
          '</tbody>'+
        '</table>'+
      '</div>'+
    '</div>'
  );
}

function printInvoice(){
  render();
  window.print();
}

function saveExpense(ev){
  ev.preventDefault();
  var date = ge('expDate').value;
  var amount = parseFloat(ge('expValue').value);
  var desc = ge('expDesc').value.trim();
  var cat = ge('expCat').value;
  var sub = ge('expSub').value.trim();
  var type = ge('expType').value;
  var note = ge('expNote').value.trim();
  if(!date || !amount || !desc || !cat) return;

  if(editExpId){
    var idx = STATE.expenses.findIndex(function(e){ return e.id === editExpId; });
    if(idx >= 0) STATE.expenses[idx] = {id:editExpId,date:date,amount:amount,desc:desc,cat:cat,sub:sub,type:type,note:note};
    editExpId = null;
  }else{
    STATE.expenses.push({id:uid(),date:date,amount:amount,desc:desc,cat:cat,sub:sub,type:type,note:note});
  }
  learn(desc,cat,sub); // Aprende a categoria
  saveState();
  clearExpForm();
  render();
}

function clearExpForm(){
  ge('expDate').value = today();
  ge('expValue').value = '';
  ge('expDesc').value = '';
  ge('expSub').value = '';
  ge('expNote').value = '';
  ge('expTitle').textContent = 'Novo Gasto';
  ge('expAviso').style.display = 'none';
  ge('expHint').textContent = ''; // Limpa a sugestão
  editExpId = null;
}

function cancelExpense(){
  clearExpForm();
  render();
}

function editExpense(id){
  var e = STATE.expenses.find(function(x){ return x.id === id; });
  if(!e) return;
  editExpId = id;
  ge('expDate').value = e.date;
  ge('expValue').value = e.amount;
  ge('expDesc').value = e.desc;
  ge('expCat').value = e.cat;
  ge('expSub').value = e.sub || '';
  ge('expType').value = e.type;
  ge('expNote').value = e.note || '';
  ge('expTitle').textContent = 'Editando: ' + e.desc;
  ge('expAviso').style.display = 'block';
  goTab('t3', document.querySelectorAll('.tab')[2]);
  ge('expDate').scrollIntoView({behavior:'smooth',block:'center'});
}

function deleteExpense(id){
  if(!confirm('Excluir este gasto?')) return;
  STATE.expenses = STATE.expenses.filter(function(e){ return e.id !== id; });
  saveState();
  render();
}

function saveIncome(ev){
  ev.preventDefault();
  var date = ge('incDate').value;
  var amount = parseFloat(ge('incValue').value);
  var desc = ge('incDesc').value.trim();
  var cat = ge('incCat').value;
  var sub = ge('incSub').value.trim();
  var note = ge('incNote').value.trim();
  if(!date || !amount || !desc || !cat) return;

  if(editIncId){
    var idx = STATE.incomes.findIndex(function(i){ return i.id === editIncId; });
    if(idx >= 0) STATE.incomes[idx] = {id:editIncId,date:date,amount:amount,desc:desc,cat:cat,sub:sub,note:note};
    editIncId = null;
  }else{
    STATE.incomes.push({id:uid(),date:date,amount:amount,desc:desc,cat:cat,sub:sub,note:note});
  }
  saveState();
  clearIncForm();
  render();
}

function clearIncForm(){
  ge('incDate').value = today();
  ge('incValue').value = '';
  ge('incDesc').value = '';
  ge('incSub').value = '';
  ge('incNote').value = '';
  ge('incTitle').textContent = 'Nova Receita';
  ge('incAviso').style.display = 'none';
  editIncId = null;
}

function cancelIncome(){
  clearIncForm();
  render();
}

function editIncome(id){
  var i = STATE.incomes.find(function(x){ return x.id === id; });
  if(!i) return;
  editIncId = id;
  ge('incDate').value = i.date;
  ge('incValue').value = i.amount;
  ge('incDesc').value = i.desc;
  ge('incCat').value = i.cat;
  ge('incSub').value = i.sub || '';
  ge('incNote').value = i.note || '';
  ge('incTitle').textContent = 'Editando: ' + i.desc;
  ge('incAviso').style.display = 'block';
  goTab('t4', document.querySelectorAll('.tab')[3]);
  ge('incDate').scrollIntoView({behavior:'smooth',block:'center'});
}

function deleteIncome(id){
  if(!confirm('Excluir esta receita?')) return;
  STATE.incomes = STATE.incomes.filter(function(i){ return i.id !== id; });
  saveState();
  render();
}

function addExpCat(){
  var el = ge('newExpCat');
  var v = el.value.trim();
  if(!v) return;
  if(STATE.expCats.indexOf(v) >= 0){ alert('Categoria já existe.'); return; }
  STATE.expCats.push(v);
  el.value = '';
  saveState();
  render();
}

function delExpCat(cat){
  var inUse = STATE.expenses.some(function(e){ return e.cat === cat; });
  if(inUse){ alert('Categoria em uso. Reclassifique os lançamentos antes de excluir.'); return; }
  if(!confirm('Excluir categoria "' + cat + '"?')) return;
  STATE.expCats = STATE.expCats.filter(function(c){ return c !== cat; });
  saveState();
  render();
}

function addIncCat(){
  var el = ge('newIncCat');
  var v = el.value.trim();
  if(!v) return;
  if(STATE.incCats.indexOf(v) >= 0){ alert('Categoria já existe.'); return; }
  STATE.incCats.push(v);
  el.value = '';
  saveState();
  render();
}

function delIncCat(cat){
  var inUse = STATE.incomes.some(function(i){ return i.cat === cat; });
  if(inUse){ alert('Categoria em uso. Reclassifique os lançamentos antes de excluir.'); return; }
  if(!confirm('Excluir categoria "' + cat + '"?')) return;
  STATE.incCats = STATE.incCats.filter(function(c){ return c !== cat; });
  saveState();
  render();
}

// ── CARD SETTINGS ──────────────────────────────────────────────
function renderConfig(){
  ge('cfgName').value = STATE.card.name || '';
  ge('cfgClose').value = STATE.card.closeDay || '';
  ge('cfgDue').value = STATE.card.dueDay || '';
  ge('cfgLimit').value = STATE.card.limit || '';
}

function saveCardSettings(ev){
  ev.preventDefault();
  var name = ge('cfgName').value.trim();
  var closeDay = parseInt(ge('cfgClose').value);
  var dueDay = parseInt(ge('cfgDue').value);
  var limit = parseFloat(ge('cfgLimit').value);

  if(!name || !closeDay || !dueDay || closeDay < 1 || closeDay > 28 || dueDay < 1 || dueDay > 28){
    alert('Por favor, preencha todos os campos obrigatórios e verifique os dias (entre 1 e 28).');
    return;
  }

  STATE.card.name = name;
  STATE.card.closeDay = closeDay;
  STATE.card.dueDay = dueDay;
  STATE.card.limit = limit > 0 ? limit : 0; // Garante que o limite seja 0 ou positivo

  saveState();
  alert('Configurações do cartão salvas com sucesso!');
  render(); // Re-renderiza para atualizar o widget e fatura
}

// ── BACKUP ─────────────────────────────────────────────────────
function exportJSON(){
  var safeState = { // Exporta apenas dados não sensíveis
    expenses: STATE.expenses,
    incomes: STATE.incomes,
    expCats: STATE.expCats,
    incCats: STATE.incCats,
    smartMap: STATE.smartMap,
    card: STATE.card // Inclui configurações do cartão (não sensíveis)
  };
  var data = JSON.stringify(safeState, null, 2);
  var blob = new Blob([data], {type:'application/json'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'financas_backup.json';
  a.click();
  URL.revokeObjectURL(url);
}

function exportCSV(){
  var rows = [];
  rows.push('tipo;data;descricao;valor;categoria;subcategoria;tipo_pag;observacao');
  STATE.expenses.forEach(function(e){
    rows.push([
      'gasto',
      e.date,
      (e.desc || '').replace(/;/g,' '),
      String(e.amount || '').replace('.',','),
      (e.cat || '').replace(/;/g,' '),
      (e.sub || '').replace(/;/g,' '),
      (e.type || '').replace(/;/g,' '),
      (e.note || '').replace(/;/g,' ')
    ].join(';'));
  });
  STATE.incomes.forEach(function(i){
    rows.push([
      'receita',
      i.date,
      (i.desc || '').replace(/;/g,' '),
      String(i.amount || '').replace('.',','),
      (i.cat || '').replace(/;/g,' '),
      (i.sub || '').replace(/;/g,' '),
      '—',
      (i.note || '').replace(/;/g,' ')
    ].join(';'));
  });
  var blob = new Blob([rows.join('\n')], {type:'text/csv;charset=utf-8;'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'financas_backup.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function importJSON(){
  var file = ge('jsonFile').files[0];
  if(!file){ alert('Selecione um arquivo JSON.'); return; }
  var reader = new FileReader();
  reader.onload = function(e){
    try{
      var p = JSON.parse(e.target.result);
      STATE = {
        expenses: Array.isArray(p.expenses) ? p.expenses : clone(SEED_EXP),
        incomes: Array.isArray(p.incomes) ? p.incomes : clone(SEED_INC),
        expCats: Array.isArray(p.expCats) && p.expCats.length ? p.expCats : clone(DEFAULT_EXP_CATS),
        incCats: Array.isArray(p.incCats) && p.incCats.length ? p.incCats : clone(DEFAULT_INC_CATS),
        card: p.card ? p.card : clone(DEFAULT_CARD), // Importa configs do cartão ou usa default
        smartMap: p.smartMap || {}
      };
      saveState();
      render();
      alert('Importado com sucesso!');
    }catch(err){
      alert('Arquivo inválido.');
    }
  };
  reader.readAsText(file);
}

function restoreSeed(){
  if(!confirm('Restaurar os dados de exemplo? Os dados atuais serão substituídos.')) return;
  STATE = freshState();
  saveState();
  render();
}

function clearAll(){
  if(!confirm('Limpar TODOS os dados? Essa ação não pode ser desfeita.')) return;
  STATE = {
    expenses: [],
    incomes: [],
    expCats: clone(DEFAULT_EXP_CATS),
    incCats: clone(DEFAULT_INC_CATS),
    card: clone(DEFAULT_CARD), // Reseta as configs do cartão também
    smartMap: {}
  };
  saveState();
  render();
}

async function extractPdfText(file){
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];

  for(let p = 1; p <= pdf.numPages; p++){
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const text = content.items.map(i => i.str).join(' ');
    pages.push(text);
  }

  return pages.join('\n');
}

function inferPdfData(text, fileName){
  const clean = String(text || '').replace(/\s+/g, ' ').trim();

  const dateMatch = clean.match(/
\b
(\d{2}[\/\-]\d{2}[\/\-]\d{4})
\b
/);
  const moneyMatches = [...clean.matchAll(/R\$\s?(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)/g)];

  const amount = moneyMatches.length
    ? parseMoney(moneyMatches[moneyMatches.length - 1][1])
    : 0;

  const rawName = String(fileName || '')
    .replace(/\.pdf
$
/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();

  let desc = rawName || 'Documento importado';
  const lines = clean.split(/\s{2,}/).map(x => x.trim()).filter(Boolean);

  const candidate = lines.find(l =>
    l.length > 4 &&
    !/
^
(r\$|\d|cpf|cnpj|comprovante|fatura|boleto|pagina|page)/i.test(l)
  );

  if(candidate){
    desc = candidate;
  }

  const sug = smartSuggest(desc) || null;

  return {
    date: dateMatch ? dateBRtoISO(dateMatch[1]) : today(),
    amount,
    desc,
    cat: sug ? sug.cat : 'Outros',
    sub: sug ? sug.sub : '',
    raw: clean
  };
}

function renderPdfPreview(data){
  if(!data){
    setHTML('pdfPreview', '');
    if(ge('pdfUploadHint')){
      ge('pdfUploadHint').textContent =
        'Envie um PDF com texto para extrair os dados e revisar antes de salvar.';
    }
    return;
  }

  const catOptions = ['<option value="">Selecione</option>']
    .concat(STATE.expCats.map(function(c){
      return '<option value="' + escHtml(c) + '"' + (c === data.cat ? ' selected' : '') + '>' + escHtml(c) + '</option>';
    }))
    .join('');

  setHTML('pdfPreview',
    '<div class="pdf-box">' +
      '<div class="pdf-grid">' +
        '<div class="fld">' +
          '<label>Data</label>' +
          '<input id="pdfDate" type="date" value="' + escHtml(data.date) + '">' +
        '</div>' +
        '<div class="fld">' +
          '<label>Valor R$</label>' +
          '<input id="pdfAmount" type="number" step="0.01" value="' + escHtml(data.amount || '') + '">' +
        '</div>' +
        '<div class="fld">' +
          '<label>Descrição</label>' +
          '<input id="pdfDesc" type="text" value="' + escHtml(data.desc || '') + '">' +
        '</div>' +
        '<div class="fld">' +
          '<label>Categoria</label>' +
          '<select id="pdfCat">' + catOptions + '</select>' +
        '</div>' +
        '<div class="fld" style="grid-column:1/-1">' +
          '<label>Subcategoria</label>' +
          '<input id="pdfSub" type="text" value="' + escHtml(data.sub || '') + '">' +
        '</div>' +
      '</div>' +
      '<div class="fld" style="margin-top:8px">' +
        '<label>Texto extraído</label>' +
        '<textarea id="pdfRaw" readonly>' + escHtml(data.raw || '') + '</textarea>' +
      '</div>' +
      '<div class="pdf-actions">' +
        '<button class="btn g" type="button" onclick="confirmPdfImport()">✓ Confirmar</button>' +
        '<button class="btn r" type="button" onclick="cancelPdfImport()">✕ Cancelar</button>' +
      '</div>' +
    '</div>'
  );

  if(ge('pdfUploadHint')){
    ge('pdfUploadHint').textContent =
      'Extração concluída. Revise os campos e confirme antes de salvar.';
  }
}

async function analyzePdfInvoice(){
  const fileEl = ge('pdfFile');
  const file = fileEl && fileEl.files && fileEl.files[0];

  if(!file){
    alert('Selecione um PDF.');
    return;
  }

  if(typeof pdfjsLib === 'undefined'){
    alert('A biblioteca de PDF não carregou.');
    return;
  }

  try{
    if(ge('pdfUploadHint')){
      ge('pdfUploadHint').textContent = 'Lendo PDF...';
    }

    const text = await extractPdfText(file);
    pendingPdf = inferPdfData(text, file.name);
    pendingPdf.fileName = file.name;

    renderPdfPreview(pendingPdf);
  }catch(err){
    console.error(err);
    alert('Não consegui ler esse PDF.');
    if(ge('pdfUploadHint')){
      ge('pdfUploadHint').textContent = 'Falha ao ler o PDF.';
    }
  }
}

function confirmPdfImport(){
  if(!pendingPdf) return;

  const date = ge('pdfDate').value;
  const amount = parseFloat(ge('pdfAmount').value);
  const desc = ge('pdfDesc').value.trim();
  const cat = ge('pdfCat').value;
  const sub = ge('pdfSub').value.trim();

  if(!date || !amount || !desc || !cat){
    alert('Preencha data, valor, descrição e categoria.');
    return;
  }

  STATE.expenses.push({
    id: uid(),
    date: date,
    amount: amount,
    desc: desc,
    cat: cat,
    sub: sub,
    type: 'cartao',
    note: 'Importado de PDF'
  });

  learn(desc, cat, sub);
  saveState();

  pendingPdf = null;
  if(ge('pdfFile')) ge('pdfFile').value = '';
  renderPdfPreview(null);
  render();
  goTab('t3', document.querySelectorAll('.tab')[2]);
}

function cancelPdfImport(){
  pendingPdf = null;
  if(ge('pdfFile')) ge('pdfFile').value = '';
  renderPdfPreview(null);
}

// ── INITIALIZATION ─────────────────────────────────────────────
loadState();
if(ge('expDate') && !ge('expDate').value) ge('expDate').value = today();
if(ge('incDate') && !ge('incDate').value) ge('incDate').value = today();
render();
