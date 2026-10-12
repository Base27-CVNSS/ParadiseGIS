'use strict';
const $=id=>document.getElementById(id), C=window.ParadiseCore;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors={entities:'#e64444',officers:'#3869cc',intermediaries:'#a16b24',addresses:'#798799',others:'#798799'};
const types={entities:'Pháp nhân',officers:'Cá nhân / tổ chức',intermediaries:'Trung gian',addresses:'Địa chỉ',others:'Khác'};
let data,byId,selected=null,selectedEdge=null,path=null,visibleNodes=[],visibleEdges=[],map,layer,view='harmony',graphScale=1;
let toastTimer,playTimer=null,activeStep=0,basemapManager=null,vietflexApp=null;
const sourceColors={'Panama Papers':'#ffd166','Paradise Papers - Appleby':'#56d8ed','Paradise Papers':'#56d8ed','Pandora Papers':'#ff78bd','Offshore Leaks':'#94e37e','Bahamas Leaks':'#c6a3ff'};
const sourceColor=source=>sourceColors[source]||(/Paradise/.test(source||'')?'#56d8ed':/Pandora/.test(source||'')?'#ff78bd':'#98b6ef');

function toast(s){$('toast').textContent=s;$('toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.display='none',5500);}
function initMap(){
 if(!window.L){$('map').textContent='Không đọc được thư viện bản đồ. Chuyển sang đồ thị để xem hồ sơ.';return;}
 map=L.map('map',{worldCopyJump:true,minZoom:1,maxZoom:18}).setView([20,75],3);
 basemapManager=window.ParadiseBasemap.createBasemap(map,window.WORLD_LAND,status=>{$('basemapStatus').textContent=status;});
 layer=L.featureGroup().addTo(map);map.on('zoomend',()=>{if(data)drawMap();});
}
function loadData(next){
 C.validate(next);stopPlayback();activeStep=0;data=next;byId=new Map(data.nodes.map(n=>[n.id,n]));selected=null;selectedEdge=null;path=null;
 $('search').value='';$('type').value='';$('edgeKind').value='';
 $('source').innerHTML='<option value="">Tất cả</option>'+[...new Set(data.nodes.map(n=>n.source).filter(Boolean))].sort().map(s=>`<option>${esc(s)}</option>`).join('');
 for(const id of ['start','end'])$(''+id).innerHTML='<option value="">Chọn hồ sơ…</option>'+[...data.nodes].sort((a,b)=>a.name.localeCompare(b.name)).map(n=>`<option value="${esc(n.id)}">${esc(n.name)} · ${esc(n.id)}</option>`).join('');
 $('scope').textContent=`${data.meta?.provider||'Dữ liệu nhập'} · ${data.meta?.scope||'Tập dữ liệu do người dùng cung cấp'}. ${data.meta?.generation||''}. ${data.nodes.length.toLocaleString('vi-VN')} hồ sơ. Đây là tập con, không phải toàn bộ ICIJ.`;
 $('detail').innerHTML='<div class="empty">◎<h3>Bắt đầu từ một hồ sơ</h3><p>Chọn điểm hoặc kết quả tra cứu để xem nội dung gốc.</p></div>';
 render();fit();
}
function filterData(){
 const q=$('search').value.trim().toLocaleLowerCase('vi');
 const matches=data.nodes.filter(n=>(!$('type').value||n.type===$('type').value)&&(!$('source').value||n.source===$('source').value)&&(!q||[n.name,n.id,n.countries,n.jurisdiction,n.address].join(' ').toLocaleLowerCase('vi').includes(q)));
 const matching=new Set(matches.map(n=>n.id));
 let edges=data.edges.filter(e=>(!$('edgeKind').value||e.kind===$('edgeKind').value)&&matching.has(e.from)&&matching.has(e.to));
 let nodes=matches;
 // Selecting a record reveals its direct neighbourhood while retaining the active edge/source filters.
 if(selected){edges=data.edges.filter(e=>(e.from===selected||e.to===selected)&&(!$('edgeKind').value||e.kind===$('edgeKind').value)&&(!$('source').value||e.source===$('source').value));const ids=new Set([selected,...edges.flatMap(e=>[e.from,e.to])]);nodes=data.nodes.filter(n=>ids.has(n.id));}
 if(path){const ids=new Set(path.nodes),es=new Set(path.edges);nodes=data.nodes.filter(n=>ids.has(n.id));edges=data.edges.filter(e=>es.has(e.id));}
 return {matches,nodes,edges};
}
function render(){
 const {matches,nodes,edges}=filterData();visibleNodes=nodes;visibleEdges=edges;
 $('resultCount').textContent=matches.length.toLocaleString('vi-VN')+' kết quả';
 $('results').innerHTML=matches.slice(0,150).map(n=>`<button class="result ${n.id===selected?'active':''}" data-node="${esc(n.id)}"><b>${esc(n.name)}</b><small>${esc(types[n.type]||n.type||'Hồ sơ')} · ${esc(n.jurisdiction||n.countries||'Chưa xác định')}<br>${esc(n.source||'Dữ liệu nhập')} / ${esc(n.id)}</small></button>`).join('')||'<p class="muted">Không có hồ sơ phù hợp trong tập này. Thử tra cứu toàn bộ ICIJ.</p>';
 if(matches.length>150)$('results').insertAdjacentHTML('beforeend','<p class="muted">Hiển thị 150 kết quả đầu. Nhập thêm ký tự để thu hẹp.</p>');
 $('nodeCount').textContent=nodes.length.toLocaleString('vi-VN');$('edgeCount').textContent=edges.filter(e=>e.kind==='relationship').length.toLocaleString('vi-VN');$('transferCount').textContent=edges.filter(e=>e.kind==='transaction').length.toLocaleString('vi-VN');$('missingCount').textContent=nodes.filter(n=>!C.validPoint(n)).length.toLocaleString('vi-VN');
 $('canvasTitle').textContent=path?'Chuỗi liên kết đã chọn':selected?'Các quan hệ trực tiếp':'Mạng lưới offshore';
 const mapped=nodes.filter(C.validPoint).length, drawable=edges.filter(e=>C.validPoint(byId.get(e.from))&&C.validPoint(byId.get(e.to))).length;
 $('canvasStatus').textContent=`${mapped}/${nodes.length} điểm · ${drawable}/${edges.length} tuyến định vị được · Vị trí đại diện`;
 $('edgeRows').innerHTML=edges.slice(0,300).map(e=>`<tr class="${e.id===selectedEdge?'selected':''}"><td><button data-node="${esc(e.from)}">${esc(byId.get(e.from).name)}</button></td><td><button data-edge="${esc(e.id)}">${esc(e.kind==='transaction'?`${new Intl.NumberFormat('vi-VN').format(e.amount)} ${e.currency} →`:(e.label||e.relation||'Quan hệ'))}</button></td><td><button data-node="${esc(e.to)}">${esc(byId.get(e.to).name)}</button></td><td>${esc(e.source||'Dữ liệu nhập')}</td></tr>`).join('')||'<tr><td colspan="4">Không có tuyến phù hợp.</td></tr>';
 if(edges.length>300)$('edgeRows').insertAdjacentHTML('beforeend',`<tr><td colspan="4">Hiển thị 300/${edges.length} tuyến. Chọn một hồ sơ để thu hẹp.</td></tr>`);
 drawMap();drawGraph();renderChain();renderSourceLegend();
}
function drawMap(){
 if(!map)return;layer.clearLayers();
 const harmony=document.body.classList.contains('harmony'),groups=new Map();
 for(const n of visibleNodes.filter(C.validPoint)){const key=n.lat+','+n.lon;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(n);}
 const summary=C.aggregateRoutes(visibleNodes,visibleEdges),activeId=path?.nodes[activeStep];
 const aggregate=$('aggregate').checked&&!path;
 const routes=aggregate?summary.routes:visibleEdges.filter(e=>C.validPoint(byId.get(e.from))&&C.validPoint(byId.get(e.to))).map(e=>({...e,edges:[e.id]}));
 const activeEdgeId=path?.edges[Math.max(0,activeStep-1)];
 for(const route of routes){
  const a=byId.get(route.from),b=byId.get(route.to);if(a.lat===b.lat&&a.lon===b.lon)continue;
  const points=harmony?C.routeCurve(a,b):C.routePoints(a,b),txn=route.kind==='transaction';
  const active=route.edges.includes(activeEdgeId)||route.edges.includes(selectedEdge);
  const color=harmony?sourceColor(route.source):(txn?'#e64444':'#627f9c');
  const weight=active?4:path?2.7:Math.min(3,.9+Math.log2(route.edges.length+1)*.35);
  const offsets=harmony?[-360,0,360]:[0];
  for(const offset of offsets){
   const display=points.map(([lat,lon])=>[lat,lon+offset]);
   if(harmony)L.polyline(display,{color,weight:weight+4,opacity:active?.18:.05,interactive:false}).addTo(layer);
   const line=L.polyline(display,{color,weight,opacity:active?1:path?.76:.53,dashArray:txn?undefined:(harmony?'3 5':'5 7'),className:active?'trace-active':harmony?'route-glow':txn?'flow':''}).addTo(layer);
   line.bindTooltip(esc(`${a.jurisdiction||a.countries||a.name} ${txn?'→':'↔'} ${b.jurisdiction||b.countries||b.name} · ${route.edges.length} ${txn?'giao dịch nhập':'quan hệ hồ sơ'} · ${route.source||'nguồn nhập'}`));
   if(route.edges.length===1)line.on('click',()=>showEdge(route.edges[0]));
   else{
    const panel=document.createElement('div');const heading=document.createElement('b');heading.textContent=`${route.edges.length} quan hệ cùng hai vị trí đại diện`;panel.append(heading);
    for(const id of route.edges.slice(0,30)){const e=data.edges.find(e=>e.id===id),button=document.createElement('button');button.textContent=`${byId.get(e.from).name} ${txn?'→':'↔'} ${byId.get(e.to).name}`;button.style.cssText='display:block;font-size:10px;text-align:left;margin:6px 0';button.onclick=()=>showEdge(id);panel.append(button);}
    if(route.edges.length>30){const note=document.createElement('p');note.textContent='30 quan hệ đầu; dùng tra cứu hoặc bảng cạnh để thu hẹp.';panel.append(note);}line.bindPopup(panel);
   }
   if(txn){const end=display.at(-1),before=display.at(-2),p1=map.project(before,map.getZoom()),p2=map.project(end,map.getZoom()),angle=Math.atan2(p2.y-p1.y,p2.x-p1.x)*180/Math.PI;
    L.marker(end,{interactive:false,icon:L.divIcon({className:'route-arrow',html:`<span style="display:block;color:${color};font-size:17px;transform:rotate(${angle}deg)">➤</span>`,iconSize:[18,18],iconAnchor:[9,9]})}).addTo(layer);
   }
  }
 }
 for(const nodes of groups.values()){
  const n=nodes[0],active=nodes.some(n=>n.id===activeId),radius=Math.min(16,4+Math.log2(nodes.length+1)*1.7),color=active?'#ffd166':harmony?(nodes.length===1?sourceColor(n.source):'#63d9ee'):(nodes.length===1?(colors[n.type]||colors.others):'#172033');
  for(const offset of harmony?[-360,0,360]:[0]){
   const location=[n.lat,n.lon+offset];
   if(harmony)L.circleMarker(location,{radius:radius+(active?12:7),color,weight:1,fillColor:color,fillOpacity:active?.1:.05,opacity:active?.6:.18,interactive:false}).addTo(layer);
   const marker=L.circleMarker(location,{radius,color:active?'#fff':harmony?color:'#fff',weight:active?2:1.5,fillColor:color,fillOpacity:.9,className:active?'hub-active':harmony?'hub-glow':''}).addTo(layer);
   const popup=document.createElement('div'),title=document.createElement('b');title.textContent=nodes.length===1?n.name:`${nodes.length} hồ sơ cùng vị trí đại diện`;popup.append(title);
   const note=document.createElement('p');note.textContent=n.location_basis||'Tọa độ do người dùng cung cấp';popup.append(note);
   for(const item of nodes.slice(0,40)){const button=document.createElement('button');button.textContent=item.name;button.style.cssText='display:block;margin:5px 0;font-size:11px;max-width:260px;text-align:left';button.onclick=()=>showNode(item.id);popup.append(button);}
   if(nodes.length>40){const note=document.createElement('p');note.textContent='40 hồ sơ đầu; dùng tra cứu để xem các hồ sơ khác.';popup.append(note);}
   marker.bindPopup(popup);if(nodes.length===1)marker.on('click',()=>showNode(n.id,false));
   if($('showLabels').checked){const steps=path?path.nodes.map((id,i)=>nodes.some(n=>n.id===id)?i+1:null).filter(Boolean):[];const label=(n.jurisdiction||n.countries||'Điểm nhập')+(steps.length?' · bước '+steps.join(','):' · '+nodes.length);marker.bindTooltip(esc(label),{permanent:true,direction:'top',offset:[0,-radius-2],className:'hub-tooltip'});}
  }
 }
 const mapped=visibleNodes.filter(C.validPoint).length;
 $('canvasStatus').textContent=`${mapped}/${visibleNodes.length} hồ sơ định vị · ${aggregate?summary.routes.length:routes.length} tuyến ${aggregate?'đã gom':'hiển thị'} · ${summary.colocated} quan hệ cùng điểm · ${summary.unmapped} chưa định vị`;
}
function renderSourceLegend(){
 const sources=[...new Set(visibleEdges.map(e=>e.source||'Nguồn nhập'))].sort();
 $('sourceLegend').innerHTML='<b>MÀU TUYẾN / BỘ HỒ SƠ</b>'+sources.map(source=>`<button data-source="${esc(source)}"><i style="background:${sourceColor(source)}"></i>${esc(source)}</button>`).join('')+'<small class="geonote">Độ dày = số quan hệ đã gom, không phải số tiền.<br>Tuyến cong minh họa kết nối, không phải lộ trình.</small>';
}
function stopPlayback(){if(playTimer){clearInterval(playTimer);playTimer=null;}$('playChain').textContent='▷ Phát từng bước';$('canvasPlay').textContent='▷ Phát';}
function renderChain(){
 const exists=Boolean(path&&path.nodes.length);$('traceHud').hidden=!exists;
 for(const id of ['previousStep','playChain','nextStep','chainClear','canvasPrevious','canvasPlay','canvasNext'])$(id).disabled=!exists;
 if(!exists){$('chainTitle').textContent='Chọn một chuỗi để bắt đầu';$('chainSteps').innerHTML='<p class="muted">Bấm “Chuỗi mẫu ICIJ”, hoặc chọn điểm đầu–cuối và Truy tuyến.</p>';return;}
 activeStep=Math.min(activeStep,path.nodes.length-1);
 $('chainTitle').textContent=`${path.nodes.length} hồ sơ · ${path.edges.length} bước · đang xem bước ${activeStep+1}`;
 $('chainSteps').innerHTML=path.nodes.map((id,i)=>{const n=byId.get(id),previous=i?data.edges.find(e=>e.id===path.edges[i-1]):null;const connector=previous?`<div class="step-connector"><span>${previous.kind==='transaction'?'→':'↔'}</span><button data-edge="${esc(previous.id)}">${esc(previous.kind==='transaction'?`${previous.amount} ${previous.currency}`:previous.label||previous.relation||'Quan hệ')}</button></div>`:'';return connector+`<button class="chain-step ${i===activeStep?'active':''} ${C.validPoint(n)?'':'unmapped'}" data-step="${i}" aria-current="${i===activeStep?'step':'false'}"><span class="step-number">${i===0?'ĐIỂM ĐẦU':i===path.nodes.length-1?'ĐIỂM CUỐI':'BƯỚC '+(i+1)}</span><b>${esc(n.name)}</b><small>${esc(n.jurisdiction||n.countries||'Chưa định vị')} · ${esc(n.source||'Nguồn nhập')}</small></button>`;}).join('');
 $('previousStep').disabled=activeStep===0;$('nextStep').disabled=activeStep===path.nodes.length-1;$('canvasPrevious').disabled=activeStep===0;$('canvasNext').disabled=activeStep===path.nodes.length-1;$('hudStep').textContent=`TRACE ${activeStep+1} / ${path.nodes.length} · ${byId.get(path.nodes[activeStep]).jurisdiction||byId.get(path.nodes[activeStep]).countries||'Chưa định vị'}`;
 const current=byId.get(path.nodes[activeStep]);
 $('chainNote').textContent=`Bước ${activeStep+1}: ${current.name}. ${C.validPoint(current)?'Điểm trên bản đồ là vị trí đại diện.':'Hồ sơ chưa định vị; vẫn hiện trong chuỗi và đồ thị.'} Phát từng bước là duyệt chứng cứ, không phải thời gian chuyển tiền.`;
}
function inspectStep(index){
 if(!path)return;activeStep=Math.max(0,Math.min(index,path.nodes.length-1));showNode(path.nodes[activeStep],false,true);
 $('chainSteps').querySelector('.active')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest',inline:'center'});
}
function activatePath(next){
 stopPlayback();path=next;selected=null;selectedEdge=null;activeStep=0;
 if(!path){$('routeStatus').textContent='Không tìm thấy tuyến trong tập đang mở; không kết luận về toàn bộ ICIJ.';render();return;}
 $('start').value=path.nodes[0];$('end').value=path.nodes.at(-1);
 const unknown=path.nodes.filter(id=>!C.validPoint(byId.get(id))).length;
 $('routeStatus').textContent=`${path.edges.length} bước · ${unknown} hồ sơ chưa định vị. ${$('transactionOnly').checked?'Chuỗi giao dịch có hướng từ dữ liệu nhập.':'Chuỗi quan hệ hồ sơ; không phải bằng chứng chuyển tiền.'}`;
 switchView('vietflex');inspectStep(0);fit();
}
function drawGraph(){
 if(path){drawChainGraph();return;}
 const svg=$('graphSvg');svg.replaceChildren();const NS='http://www.w3.org/2000/svg';
 function el(tag,attrs,parent=svg){const e=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,String(v));parent.append(e);return e;}
 const defs=el('defs',{}),mark=el('marker',{id:'txnArrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto'},defs);el('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#e64444'},mark);
 const g=el('g',{transform:`translate(500 300) scale(${graphScale}) translate(-500 -300)`});
 const graphNodes=[...visibleNodes].sort((a,b)=>(b.id===selected?1:0)-(a.id===selected?1:0)).slice(0,180),ids=new Set(graphNodes.map(n=>n.id));const positions=new Map();
 graphNodes.forEach((n,i)=>{const isCenter=n.id===selected;const angle=2*Math.PI*i/Math.max(1,graphNodes.length);const ring=i%3;positions.set(n.id,isCenter?[500,300]:[500+Math.cos(angle)*(140+ring*95),300+Math.sin(angle)*(95+ring*55)]);});
 for(const e of visibleEdges.filter(e=>ids.has(e.from)&&ids.has(e.to))){const[x1,y1]=positions.get(e.from),[x2,y2]=positions.get(e.to);const attrs={x1,y1,x2,y2,stroke:document.body.classList.contains('harmony')?sourceColor(e.source):(e.kind==='transaction'?'#e64444':'#9baaba'),'stroke-width':path?3:1.4,opacity:.6,tabindex:0,role:'button','aria-label':e.label||e.relation||'Giao dịch'};if(e.kind==='relationship')attrs['stroke-dasharray']='5 4';else attrs['marker-end']='url(#txnArrow)';const line=el('line',attrs,g);line.style.cursor='pointer';line.onclick=()=>showEdge(e.id);line.onkeydown=ev=>{if(ev.key==='Enter')showEdge(e.id);};}
 for(const n of graphNodes){const[x,y]=positions.get(n.id);const group=el('g',{tabindex:0,role:'button','aria-label':n.name},g);group.style.cursor='pointer';el('circle',{cx:x,cy:y,r:n.id===selected?13:7,fill:colors[n.type]||colors.others,stroke:'#fff','stroke-width':2},group);const t=el('text',{x:x+10,y:y+3},group);t.textContent=n.name.length>24?n.name.slice(0,22)+'…':n.name;const title=el('title',{},group);title.textContent=n.name;group.onclick=()=>showNode(n.id);group.onkeydown=ev=>{if(ev.key==='Enter')showNode(n.id);};}
 if(visibleNodes.length>180){const t=el('text',{x:20,y:580});t.textContent=`Đồ thị hiển thị 180/${visibleNodes.length} nút. Chọn một hồ sơ để xem vùng lân cận.`;}
}
function drawChainGraph(){
 const svg=$('graphSvg'),NS='http://www.w3.org/2000/svg';svg.replaceChildren();
 function el(tag,attrs,parent=svg){const node=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))node.setAttribute(k,String(v));parent.append(node);return node;}
 const rows=Math.ceil(path.nodes.length/5),height=Math.max(600,rows*170+110);svg.setAttribute('viewBox',`0 0 1000 ${height}`);
 const defs=el('defs',{}),marker=el('marker',{id:'chainTxnArrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto'},defs);el('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#ffd166'},marker);
 const heading=el('text',{x:35,y:45,'font-size':16,'font-weight':700});heading.textContent='TRACE CHAIN · THỨ TỰ DUYỆT HỒ SƠ';
 const sub=el('text',{x:35,y:64,'font-size':10});sub.textContent='Bố cục logic, không phải vị trí địa lý. Nét đứt = quan hệ; mũi tên = giao dịch nhập.';
 const g=el('g',{transform:`translate(500 ${height/2}) scale(${graphScale}) translate(-500 ${-height/2})`});
 const positions=path.nodes.map((id,i)=>{const row=Math.floor(i/5),col=row%2?4-i%5:i%5;return [40+col*192,100+row*170];});
 path.edges.forEach((id,i)=>{
  const e=data.edges.find(e=>e.id===id),[x1,y1]=positions[i],[x2,y2]=positions[i+1],sameRow=y1===y2;
  const forward=x2>x1,startX=sameRow?x1+(forward?168:0):x1+84,startY=sameRow?y1+45:y1+90,endX=sameRow?x2+(forward?0:168):x2+84,endY=sameRow?y2+45:y2;
  const attrs={d:`M${startX},${startY} L${endX},${endY}`,fill:'none',stroke:sourceColor(e.source),'stroke-width':i===activeStep-1?3:1.6,tabindex:0,role:'button','aria-label':e.label||e.relation||'Giao dịch'};
  if(e.kind==='transaction')attrs['marker-end']='url(#chainTxnArrow)';else attrs['stroke-dasharray']='5 4';
  const line=el('path',attrs,g);line.style.cursor='pointer';line.onclick=()=>showEdge(id);line.onkeydown=ev=>{if(ev.key==='Enter')showEdge(id);};
 });
 path.nodes.forEach((id,i)=>{
  const n=byId.get(id),[x,y]=positions[i],active=i===activeStep,group=el('g',{role:'button',tabindex:0,'aria-label':`Bước ${i+1}: ${n.name}`},g);group.style.cursor='pointer';
  el('rect',{x,y,width:168,height:90,rx:9,fill:active?'#243d6d':'#13244b',stroke:active?'#ffd166':'#345075','stroke-width':active?2:1},group);
  const badge=el('text',{x:x+12,y:y+19,'font-size':9,fill:'#82d9ed'},group);badge.textContent=`${i===0?'ĐIỂM ĐẦU':i===path.nodes.length-1?'ĐIỂM CUỐI':'BƯỚC '+(i+1)} / ${n.id}`;
  const words=n.name.split(' '),lines=[''];for(const word of words){if((lines.at(-1)+' '+word).trim().length>22&&lines.length<2)lines.push('');lines[lines.length-1]+=(lines.at(-1)?' ':'')+word;}
  lines.slice(0,2).forEach((line,j)=>{const t=el('text',{x:x+12,y:y+40+j*14,'font-size':10,'font-weight':600},group);t.textContent=line.length>24?line.slice(0,22)+'…':line;});
  const place=el('text',{x:x+12,y:y+77,'font-size':9},group);place.textContent=(n.jurisdiction||n.countries||'Chưa định vị').slice(0,27);
  const title=el('title',{},group);title.textContent=n.name;group.onclick=()=>{stopPlayback();inspectStep(i);};group.onkeydown=ev=>{if(ev.key==='Enter'){stopPlayback();inspectStep(i);}};
 });
}

function fields(items){return '<dl>'+items.filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')+'</dl>';}
function sourceLink(url,label){return C.safeURL(url)?`<a class="evidence-link" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`:'<p class="muted">Chưa có liên kết nguồn.</p>';}
function showNode(id,focus=true,keepPath=false){
 const n=byId.get(id);if(!n)return;
 const preserve=path&&(keepPath||path.nodes.includes(id));
 if(!keepPath)stopPlayback();
 if(preserve)activeStep=path.nodes.indexOf(id);else{path=null;activeStep=0;}
 selected=id;selectedEdge=null;
 $('detail').innerHTML=`<span class="detail-type">${esc(types[n.type]||n.type||'HỒ SƠ')}</span><h3 class="detail-name">${esc(n.name)}</h3><span class="detail-id">NODE / ${esc(n.id)}</span>${fields([['Bộ hồ sơ',n.source],['Quốc gia',n.countries],['Nơi đăng ký',n.jurisdiction],['Địa chỉ trong nguồn',n.address],['Phạm vi thời gian dữ liệu',n.valid_until],['Cơ sở định vị',n.location_basis||'Do người dùng cung cấp'],['Tọa độ',C.validPoint(n)?`${n.lat}, ${n.lon} · EPSG:4326`:'Chưa có tọa độ; vẫn xem được trên đồ thị'],['Quan hệ trực tiếp',data.edges.filter(e=>e.from===id||e.to===id).length]])}<div class="detail-actions"><button id="setStart">Đặt điểm đầu</button><button id="setEnd">Đặt điểm cuối</button></div>${sourceLink(n.url,'Mở hồ sơ nguồn')}`;
 $('setStart').onclick=()=>{$('start').value=id;toast('Đã đặt điểm đầu.');};$('setEnd').onclick=()=>{$('end').value=id;toast('Đã đặt điểm cuối.');};
 render();if(focus)fit();
}
function showEdge(id){
 const e=data.edges.find(e=>e.id===id);if(!e)return;stopPlayback();selectedEdge=id;if(path&&path.edges.includes(id))activeStep=path.edges.indexOf(id)+1;
 $('detail').innerHTML=`<span class="detail-type">${e.kind==='transaction'?'GIAO DỊCH DO NGƯỜI DÙNG NHẬP':'QUAN HỆ HỒ SƠ'}</span><h3 class="detail-name">${esc(e.label||e.relation||'Chuyển tiền')}</h3>${fields([['Điểm đầu',byId.get(e.from).name],['Điểm cuối',byId.get(e.to).name],['Loại',e.kind==='transaction'?'Giao dịch có hướng, cần đối chiếu chứng cứ':'Quan hệ, không chứng minh chuyển tiền'],['Nguồn',e.source],['Số tiền',e.kind==='transaction'?`${new Intl.NumberFormat('vi-VN').format(e.amount)} ${e.currency}`:null],['Thời gian giao dịch',e.timestamp],['Ngày bắt đầu trong hồ sơ',e.start_date],['Ngày kết thúc trong hồ sơ',e.end_date]])}${sourceLink(e.evidence_url,'Đối chiếu chứng cứ nguồn')}<p class="muted">${e.kind==='transaction'?'Ứng dụng kiểm tra cấu trúc dữ liệu; chưa xác minh độc lập chứng cứ giao dịch.':'Hướng lưu trữ node_start → node_end không phải hướng dòng tiền.'}</p>`;
 render();
}
function fit(){if(map&&visibleNodes.some(C.validPoint)){const points=visibleNodes.filter(C.validPoint).map(n=>[n.lat,n.lon]);map.fitBounds(points,{padding:[45,45],maxZoom:points.length===1?6:4});}graphScale=1;$('graphSvg').setAttribute('viewBox','0 0 1000 600');drawGraph();}
function openVietflex(){
 const target=$('vietflexMap'),error=$('vietflexError');
 error.hidden=true;target.hidden=false;
 if(!window.L||!window.VNMap||typeof window.VNMap.create!=='function'){
  error.textContent='Không tải được Vietflexmap 1.0.2. Vui lòng kiểm tra kết nối hoặc CDN.';error.hidden=false;return;
 }
 try{
  if(!vietflexApp){vietflexApp=window.VNMap.create('vietflexMap');window.vnMapApp=vietflexApp;}
  if(typeof vietflexApp.addGeoJSON==='function'&&!target.dataset.loaded&&data){
   const features=[];
   for(const n of visibleNodes)if(C.validPoint(n))features.push({type:'Feature',geometry:{type:'Point',coordinates:[n.lon,n.lat]},properties:{name:n.name||n.id,source:n.source||'',kind:n.type||''}});
   for(const e of visibleEdges){const from=byId.get(e.from),to=byId.get(e.to);if(C.validPoint(from)&&C.validPoint(to))features.push({type:'Feature',geometry:C.routeGeometry(from,to),properties:{kind:e.kind||'relationship',source:e.source||''}});}
   vietflexApp.addGeoJSON({type:'FeatureCollection',features});target.dataset.loaded='1';
  }
  if(vietflexApp.map&&typeof vietflexApp.map.invalidateSize==='function')setTimeout(()=>vietflexApp.map.invalidateSize(),60);
  $('basemapStatus').textContent='Vietflexmap 1.0.2 · dữ liệu hồ sơ là quan hệ đại diện, không phải luồng tiền';
 }catch(err){error.textContent='Không thể khởi tạo Vietflexmap: '+err.message;error.hidden=false;console.error(err);}
}
function switchView(next){
 view=next;const graph=next==='graph',vf=next==='vietflex';
 $('map').hidden=graph||vf;$('vietflexMap').hidden=!vf;$('graph').hidden=!graph;
 if(!graph)document.body.classList.toggle('harmony',next==='harmony');document.body.classList.toggle('vietflex-mode',vf);
 if(basemapManager&&!graph&&!vf){const name=next==='map'?'osm':'world';$('basemapSelect').value=name;basemapManager.set(name);}
 $('graphView').classList.toggle('active',graph);$('vietflexView').classList.toggle('active',vf);
 if(vf)openVietflex();else if(!graph&&map){map.invalidateSize();drawMap();}
 if(graph)drawGraph();
}
function clearRoute(){stopPlayback();path=null;selected=null;selectedEdge=null;activeStep=0;$('routeStatus').textContent='Đã xóa tuyến. Chọn hai hồ sơ để truy tuyến mới.';render();}
function exportGeoJSON(){
 const features=visibleNodes.filter(C.validPoint).map(n=>({type:'Feature',geometry:{type:'Point',coordinates:[n.lon,n.lat]},properties:{...n,record_type:'node'}}));
 for(const e of visibleEdges){const a=byId.get(e.from),b=byId.get(e.to);if(C.validPoint(a)&&C.validPoint(b)){features.push({type:'Feature',geometry:C.routeGeometry(a,b),properties:{...e,record_type:'edge',location_note:'Representative endpoint connection, not physical fund routing'}});}}
 const unmapped_nodes=visibleNodes.filter(n=>!C.validPoint(n)).map(n=>n.id);const unmapped_edges=visibleEdges.filter(e=>!C.validPoint(byId.get(e.from))||!C.validPoint(byId.get(e.to))).map(e=>e.id);
 const blob=new Blob([JSON.stringify({type:'FeatureCollection',metadata:data.meta,unmapped_nodes,unmapped_edges,features},null,2)],{type:'application/geo+json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='ParadiseGIS.geojson';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast(`Đã xuất ${features.length} đối tượng; ID chưa định vị được liệt kê trong tệp.`);
}
document.addEventListener('click',e=>{
 const step=e.target.closest('[data-step]'),source=e.target.closest('[data-source]'),n=e.target.closest('[data-node]'),edge=e.target.closest('[data-edge]');
 if(step){stopPlayback();inspectStep(Number(step.dataset.step));}
 else if(source){stopPlayback();selected=null;path=null;selectedEdge=null;const value=source.dataset.source;$('source').value=[...$('source').options].some(o=>o.value===value)?value:'';render();}
 else if(n)showNode(n.dataset.node);else if(edge)showEdge(edge.dataset.edge);
});
for(const id of ['search','type','source','edgeKind'])$(id).addEventListener(id==='search'?'input':'change',()=>{stopPlayback();selected=null;path=null;selectedEdge=null;$('icijSearch').href='https://offshoreleaks.icij.org/search?q='+encodeURIComponent($('search').value);render();});
$('reset').onclick=()=>loadData(window.ICIJ_DATA);$('vietflexView').onclick=()=>switchView('vietflex');
$('graphView').onclick=()=>switchView('graph');$('fit').onclick=fit;
$('trace').onclick=()=>{const a=$('start').value,b=$('end').value;if(!a||!b){toast('Hãy chọn cả điểm đầu và điểm cuối.');return;}activatePath(C.shortestPath(data.nodes,data.edges,a,b,$('transactionOnly').checked));};
$('exampleTrace').onclick=()=>{$('transactionOnly').checked=false;activatePath(C.examplePath(data.nodes,data.edges));$('chainPanel').scrollIntoView({block:'nearest'});};
$('previousStep').onclick=()=>{stopPlayback();inspectStep(activeStep-1);};$('nextStep').onclick=()=>{stopPlayback();inspectStep(activeStep+1);};
$('playChain').onclick=()=>{if(!path)return;if(playTimer){stopPlayback();return;}if(activeStep>=path.nodes.length-1)inspectStep(0);$('playChain').textContent='Ⅱ Tạm dừng';$('canvasPlay').textContent='Ⅱ Dừng';playTimer=setInterval(()=>{if(!path||activeStep>=path.nodes.length-1){stopPlayback();return;}inspectStep(activeStep+1);},1800);};
$('canvasPrevious').onclick=()=>$('previousStep').onclick();$('canvasNext').onclick=()=>$('nextStep').onclick();$('canvasPlay').onclick=()=>$('playChain').onclick();
$('chainClear').onclick=clearRoute;$('clearRoute').onclick=clearRoute;$('export').onclick=exportGeoJSON;$('load').onclick=()=>$('file').click();
for(const id of ['aggregate','showLabels'])$(id).onchange=drawMap;
$('basemapSelect').onchange=()=>{if(basemapManager)basemapManager.set($('basemapSelect').value);};
window.addEventListener('basemap-error',()=>toast('OSM chưa tải được. Chọn Nền thế giới có sẵn để tiếp tục xem bản đồ.'));
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if($('mapCanvas').requestFullscreen)await $('mapCanvas').requestFullscreen();else toast('Trình duyệt này không hỗ trợ toàn màn hình.');}catch{toast('Không mở được chế độ toàn màn hình.');}};
document.addEventListener('fullscreenchange',()=>{if(map)setTimeout(()=>map.invalidateSize(),60);if(view==='vietflex')setTimeout(()=>{const m=vietflexApp?.map||vietflexApp;if(m&&typeof m.invalidateSize==='function')m.invalidateSize();},70);});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPlayback();});
$('file').onchange=async()=>{const f=$('file').files[0];if(!f)return;try{if(f.size>12*1024*1024)throw Error('Tệp vượt 12 MB.');const next=JSON.parse(await f.text());loadData(next);toast('Đã mở hồ sơ. Giao dịch nhập chưa được xác minh độc lập.');}catch(e){toast('Không mở được tệp: '+e.message);}finally{$('file').value='';}};
$('graphPlus').onclick=()=>{graphScale=Math.min(3,graphScale+.2);drawGraph();};$('graphMinus').onclick=()=>{graphScale=Math.max(.4,graphScale-.2);drawGraph();};
let drag=null;$('graphSvg').onpointerdown=e=>{if(e.target.closest('[role="button"]'))return;drag={x:e.clientX,y:e.clientY,box:$('graphSvg').getAttribute('viewBox').split(' ').map(Number)};$('graphSvg').setPointerCapture(e.pointerId);};$('graphSvg').onpointermove=e=>{if(!drag)return;const r=$('graphSvg').getBoundingClientRect();const[x,y,w,h]=drag.box;$('graphSvg').setAttribute('viewBox',`${x-(e.clientX-drag.x)*w/r.width} ${y-(e.clientY-drag.y)*h/r.height} ${w} ${h}`);};$('graphSvg').onpointerup=()=>drag=null;$('graphSvg').onpointercancel=()=>drag=null;
try{initMap();loadData(window.ICIJ_DATA);}catch(e){toast('Không khởi tạo được: '+e.message);$('canvasStatus').textContent='Lỗi đọc dữ liệu';}
