'use strict';
const $=id=>document.getElementById(id), C=window.ParadiseCore;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors={entities:'#e64444',officers:'#3869cc',intermediaries:'#a16b24',addresses:'#798799',others:'#798799'};
const types={entities:'Pháp nhân',officers:'Cá nhân / tổ chức',intermediaries:'Trung gian',addresses:'Địa chỉ',others:'Khác'};
let data,byId,selected=null,selectedEdge=null,path=null,visibleNodes=[],visibleEdges=[],map,layer,view='map',graphScale=1;
let toastTimer;
function toast(s){$('toast').textContent=s;$('toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.display='none',5500);}
function initMap(){
 if(!window.L){$('map').textContent='Không đọc được thư viện bản đồ. Chuyển sang đồ thị để xem hồ sơ.';return;}
 map=L.map('map',{worldCopyJump:true,minZoom:2,maxZoom:18}).setView([20,75],3);
 const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
 let tileWarning=false;tiles.on('tileerror',()=>{if(!tileWarning){tileWarning=true;toast('Không tải được nền OSM. Điểm và tuyến vẫn có thể xem; kiểm tra kết nối.');}});
 layer=L.featureGroup().addTo(map);map.on('zoomend',()=>{if(data)drawMap();});
}
function loadData(next){
 C.validate(next);data=next;byId=new Map(data.nodes.map(n=>[n.id,n]));selected=null;selectedEdge=null;path=null;
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
 drawMap();drawGraph();
}
function drawMap(){
 if(!map)return;layer.clearLayers();
 const groups=new Map();for(const n of visibleNodes.filter(C.validPoint)){const key=n.lat+','+n.lon;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(n);}
 // Several records share a representative capital. Aggregate symbols, never jitter invented locations.
 for(const nodes of groups.values()){
 const n=nodes[0];const marker=L.circleMarker([n.lat,n.lon],{radius:Math.min(18,6+Math.log2(nodes.length+1)*2),color:'#fff',weight:2,fillColor:nodes.length===1?(colors[n.type]||colors.others):'#172033',fillOpacity:.9}).addTo(layer);
 const popup=document.createElement('div');const title=document.createElement('b');title.textContent=nodes.length===1?n.name:`${nodes.length} hồ sơ cùng vị trí đại diện`;popup.append(title);const note=document.createElement('p');note.textContent=n.location_basis||'Tọa độ do người dùng cung cấp';popup.append(note);
 for(const item of nodes.slice(0,40)){const b=document.createElement('button');b.textContent=item.name;b.style.cssText='display:block;margin:5px 0;font-size:11px;max-width:260px;text-align:left';b.onclick=()=>showNode(item.id);popup.append(b);}if(nodes.length>40){const p=document.createElement('p');p.textContent='40 hồ sơ đầu; dùng tra cứu để xem các hồ sơ khác.';popup.append(p);}
 marker.bindPopup(popup);if(nodes.length===1)marker.on('click',()=>showNode(n.id,false));
 }
 for(const e of visibleEdges){const a=byId.get(e.from),b=byId.get(e.to);if(!C.validPoint(a)||!C.validPoint(b))continue;
 const isTxn=e.kind==='transaction',points=C.routePoints(a,b);const line=L.polyline(points,{color:isTxn?'#e64444':'#627f9c',weight:path?4:2,opacity:path?.9:.55,dashArray:isTxn?undefined:'5 7',className:isTxn?'flow':''}).addTo(layer);
 line.bindTooltip(esc(isTxn?`${a.name} → ${b.name} · ${e.amount} ${e.currency}`:`${a.name} ↔ ${b.name} · ${e.label||e.relation}`));line.on('click',()=>showEdge(e.id));
 if(isTxn&&!(a.lat===b.lat&&a.lon===b.lon)){
 const p1=map.project(points[0],map.getZoom()),p2=map.project(points[1],map.getZoom());const angle=Math.atan2(p2.y-p1.y,p2.x-p1.x)*180/Math.PI;
 L.marker(points[1],{interactive:false,icon:L.divIcon({className:'route-arrow',html:`<span style="display:block;color:#e64444;font-size:20px;transform:rotate(${angle}deg)">➤</span>`,iconSize:[20,20],iconAnchor:[10,10]})}).addTo(layer);
 }
 }
}
function drawGraph(){
 const svg=$('graphSvg');svg.replaceChildren();const NS='http://www.w3.org/2000/svg';
 function el(tag,attrs,parent=svg){const e=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,String(v));parent.append(e);return e;}
 const defs=el('defs',{}),mark=el('marker',{id:'txnArrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto'},defs);el('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#e64444'},mark);
 const g=el('g',{transform:`translate(500 300) scale(${graphScale}) translate(-500 -300)`});
 const graphNodes=[...visibleNodes].sort((a,b)=>(b.id===selected?1:0)-(a.id===selected?1:0)).slice(0,180),ids=new Set(graphNodes.map(n=>n.id));const positions=new Map();
 graphNodes.forEach((n,i)=>{const isCenter=n.id===selected;const angle=2*Math.PI*i/Math.max(1,graphNodes.length);const ring=i%3;positions.set(n.id,isCenter?[500,300]:[500+Math.cos(angle)*(140+ring*95),300+Math.sin(angle)*(95+ring*55)]);});
 for(const e of visibleEdges.filter(e=>ids.has(e.from)&&ids.has(e.to))){const[x1,y1]=positions.get(e.from),[x2,y2]=positions.get(e.to);const attrs={x1,y1,x2,y2,stroke:e.kind==='transaction'?'#e64444':'#9baaba','stroke-width':path?3:1.4,opacity:.6,tabindex:0,role:'button','aria-label':e.label||e.relation||'Giao dịch'};if(e.kind==='relationship')attrs['stroke-dasharray']='5 4';else attrs['marker-end']='url(#txnArrow)';const line=el('line',attrs,g);line.style.cursor='pointer';line.onclick=()=>showEdge(e.id);line.onkeydown=ev=>{if(ev.key==='Enter')showEdge(e.id);};}
 for(const n of graphNodes){const[x,y]=positions.get(n.id);const group=el('g',{tabindex:0,role:'button','aria-label':n.name},g);group.style.cursor='pointer';el('circle',{cx:x,cy:y,r:n.id===selected?13:7,fill:colors[n.type]||colors.others,stroke:'#fff','stroke-width':2},group);const t=el('text',{x:x+10,y:y+3},group);t.textContent=n.name.length>24?n.name.slice(0,22)+'…':n.name;const title=el('title',{},group);title.textContent=n.name;group.onclick=()=>showNode(n.id);group.onkeydown=ev=>{if(ev.key==='Enter')showNode(n.id);};}
 if(visibleNodes.length>180){const t=el('text',{x:20,y:580});t.textContent=`Đồ thị hiển thị 180/${visibleNodes.length} nút. Chọn một hồ sơ để xem vùng lân cận.`;}
}
function fields(items){return '<dl>'+items.filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')+'</dl>';}
function sourceLink(url,label){return C.safeURL(url)?`<a class="evidence-link" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`:'<p class="muted">Chưa có liên kết nguồn.</p>';}
function showNode(id,focus=true){
 const n=byId.get(id);if(!n)return;selected=id;selectedEdge=null;path=null;
 $('detail').innerHTML=`<span class="detail-type">${esc(types[n.type]||n.type||'HỒ SƠ')}</span><h3 class="detail-name">${esc(n.name)}</h3><span class="detail-id">NODE / ${esc(n.id)}</span>${fields([['Bộ hồ sơ',n.source],['Quốc gia',n.countries],['Nơi đăng ký',n.jurisdiction],['Địa chỉ trong nguồn',n.address],['Phạm vi thời gian dữ liệu',n.valid_until],['Cơ sở định vị',n.location_basis||'Do người dùng cung cấp'],['Tọa độ',C.validPoint(n)?`${n.lat}, ${n.lon} · EPSG:4326`:'Chưa có tọa độ; vẫn xem được trên đồ thị'],['Quan hệ trực tiếp',data.edges.filter(e=>e.from===id||e.to===id).length]])}<div class="detail-actions"><button id="setStart">Đặt điểm đầu</button><button id="setEnd">Đặt điểm cuối</button></div>${sourceLink(n.url,'Mở hồ sơ nguồn')}`;
 $('setStart').onclick=()=>{$('start').value=id;toast('Đã đặt điểm đầu.');};$('setEnd').onclick=()=>{$('end').value=id;toast('Đã đặt điểm cuối.');};
 render();if(focus)fit();
}
function showEdge(id){
 const e=data.edges.find(e=>e.id===id);if(!e)return;selectedEdge=id;
 $('detail').innerHTML=`<span class="detail-type">${e.kind==='transaction'?'GIAO DỊCH DO NGƯỜI DÙNG NHẬP':'QUAN HỆ HỒ SƠ'}</span><h3 class="detail-name">${esc(e.label||e.relation||'Chuyển tiền')}</h3>${fields([['Điểm đầu',byId.get(e.from).name],['Điểm cuối',byId.get(e.to).name],['Loại',e.kind==='transaction'?'Giao dịch có hướng, cần đối chiếu chứng cứ':'Quan hệ, không chứng minh chuyển tiền'],['Nguồn',e.source],['Số tiền',e.kind==='transaction'?`${new Intl.NumberFormat('vi-VN').format(e.amount)} ${e.currency}`:null],['Thời gian giao dịch',e.timestamp],['Ngày bắt đầu trong hồ sơ',e.start_date],['Ngày kết thúc trong hồ sơ',e.end_date]])}${sourceLink(e.evidence_url,'Đối chiếu chứng cứ nguồn')}<p class="muted">${e.kind==='transaction'?'Ứng dụng kiểm tra cấu trúc dữ liệu; chưa xác minh độc lập chứng cứ giao dịch.':'Hướng lưu trữ node_start → node_end không phải hướng dòng tiền.'}</p>`;
 render();
}
function fit(){if(map&&visibleNodes.some(C.validPoint)){const points=visibleNodes.filter(C.validPoint).map(n=>[n.lat,n.lon]);map.fitBounds(points,{padding:[45,45],maxZoom:points.length===1?6:4});}graphScale=1;drawGraph();}
function switchView(next){view=next;$('map').hidden=next!=='map';$('graph').hidden=next!=='graph';$('mapView').classList.toggle('active',next==='map');$('graphView').classList.toggle('active',next==='graph');if(next==='map'&&map){map.invalidateSize();drawMap();}}
function clearRoute(){path=null;selected=null;selectedEdge=null;$('routeStatus').textContent='Đã xóa tuyến. Chọn hai hồ sơ để truy tuyến mới.';render();}
function exportGeoJSON(){
 const features=visibleNodes.filter(C.validPoint).map(n=>({type:'Feature',geometry:{type:'Point',coordinates:[n.lon,n.lat]},properties:{...n,record_type:'node'}}));
 for(const e of visibleEdges){const a=byId.get(e.from),b=byId.get(e.to);if(C.validPoint(a)&&C.validPoint(b)){features.push({type:'Feature',geometry:C.routeGeometry(a,b),properties:{...e,record_type:'edge',location_note:'Representative endpoint connection, not physical fund routing'}});}}
 const unmapped_nodes=visibleNodes.filter(n=>!C.validPoint(n)).map(n=>n.id);const unmapped_edges=visibleEdges.filter(e=>!C.validPoint(byId.get(e.from))||!C.validPoint(byId.get(e.to))).map(e=>e.id);
 const blob=new Blob([JSON.stringify({type:'FeatureCollection',metadata:data.meta,unmapped_nodes,unmapped_edges,features},null,2)],{type:'application/geo+json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='ParadiseGIS.geojson';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast(`Đã xuất ${features.length} đối tượng; ID chưa định vị được liệt kê trong tệp.`);
}
document.addEventListener('click',e=>{const n=e.target.closest('[data-node]'),edge=e.target.closest('[data-edge]');if(n)showNode(n.dataset.node);if(edge)showEdge(edge.dataset.edge);});
for(const id of ['search','type','source','edgeKind'])$(id).addEventListener(id==='search'?'input':'change',()=>{selected=null;path=null;selectedEdge=null;$('icijSearch').href='https://offshoreleaks.icij.org/search?q='+encodeURIComponent($('search').value);render();});
$('reset').onclick=()=>loadData(window.ICIJ_DATA);$('mapView').onclick=()=>switchView('map');$('graphView').onclick=()=>switchView('graph');$('fit').onclick=fit;
$('trace').onclick=()=>{const a=$('start').value,b=$('end').value;if(!a||!b){toast('Hãy chọn cả điểm đầu và điểm cuối.');return;}path=C.shortestPath(data.nodes,data.edges,a,b,$('transactionOnly').checked);if(!path){$('routeStatus').textContent='Không tìm thấy tuyến trong tập đang mở. Không suy ra rằng hai hồ sơ không liên quan trong toàn bộ ICIJ.';selected=null;render();return;}selected=null;const unknown=path.nodes.filter(id=>!C.validPoint(byId.get(id))).length;$('routeStatus').textContent=`${path.edges.length} bước · ${unknown} nút chưa định vị. ${$('transactionOnly').checked?'Chuỗi giao dịch có hướng từ dữ liệu nhập.':'Đường ngắn nhất theo số quan hệ, không phải tuyến chuyển tiền.'}`;render();fit();};
$('clearRoute').onclick=clearRoute;$('export').onclick=exportGeoJSON;$('load').onclick=()=>$('file').click();
$('file').onchange=async()=>{const f=$('file').files[0];if(!f)return;try{if(f.size>12*1024*1024)throw Error('Tệp vượt 12 MB.');const next=JSON.parse(await f.text());loadData(next);toast('Đã mở hồ sơ. Giao dịch nhập chưa được xác minh độc lập.');}catch(e){toast('Không mở được tệp: '+e.message);}finally{$('file').value='';}};
$('graphPlus').onclick=()=>{graphScale=Math.min(3,graphScale+.2);drawGraph();};$('graphMinus').onclick=()=>{graphScale=Math.max(.4,graphScale-.2);drawGraph();};
let drag=null;$('graphSvg').onpointerdown=e=>{if(e.target.closest('[role="button"]'))return;drag={x:e.clientX,y:e.clientY,box:$('graphSvg').getAttribute('viewBox').split(' ').map(Number)};$('graphSvg').setPointerCapture(e.pointerId);};$('graphSvg').onpointermove=e=>{if(!drag)return;const r=$('graphSvg').getBoundingClientRect();const[x,y,w,h]=drag.box;$('graphSvg').setAttribute('viewBox',`${x-(e.clientX-drag.x)*w/r.width} ${y-(e.clientY-drag.y)*h/r.height} ${w} ${h}`);};$('graphSvg').onpointerup=()=>drag=null;$('graphSvg').onpointercancel=()=>drag=null;
try{initMap();loadData(window.ICIJ_DATA);}catch(e){toast('Không khởi tạo được: '+e.message);$('canvasStatus').textContent='Lỗi đọc dữ liệu';}
