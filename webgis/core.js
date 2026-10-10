/* Pure data contracts and graph operations. No implied transfers in ICIJ edges. */
(function(root){
'use strict';
const validPoint=n=>Number.isFinite(n.lat)&&Number.isFinite(n.lon)&&Math.abs(n.lat)<=85.05112878&&Math.abs(n.lon)<=180;
function validate(data){
 if(!data||!Array.isArray(data.nodes)||!Array.isArray(data.edges))throw Error('Cần nodes[] và edges[].');
 if(data.nodes.length>5000||data.edges.length>10000)throw Error('Giới hạn 5.000 nút / 10.000 tuyến mỗi tệp.');
 const ids=new Set();
 for(const n of data.nodes){if(typeof n.id!=='string'||!n.id||ids.has(n.id))throw Error('ID nút thiếu hoặc trùng.');ids.add(n.id);if(typeof n.name!=='string')throw Error('Tên nút phải là chuỗi.');if((n.lat!=null||n.lon!=null)&&!validPoint(n))throw Error('Tọa độ phải là EPSG:4326 hợp lệ (lat, lon), vĩ độ trong phạm vi Mercator.');if(n.url&&!safeURL(n.url))throw Error('URL nút phải dùng HTTPS.');}
 const edgeIds=new Set();
 for(const e of data.edges){if(!e.id||edgeIds.has(e.id))throw Error('ID tuyến thiếu hoặc trùng.');edgeIds.add(e.id);if(!ids.has(e.from)||!ids.has(e.to))throw Error('Tuyến tham chiếu nút không tồn tại.');if(!['relationship','transaction'].includes(e.kind))throw Error('kind cần relationship hoặc transaction.');if(e.evidence_url&&!safeURL(e.evidence_url))throw Error('URL chứng cứ phải dùng HTTPS.');if(e.kind==='transaction'&&(!safeURL(e.evidence_url)||!Number.isFinite(e.amount)||e.amount<=0||typeof e.currency!=='string'||!e.currency.trim()||!/^\d{4}-\d{2}-\d{2}T/.test(e.timestamp||'')||!Number.isFinite(Date.parse(e.timestamp))))throw Error('Giao dịch cần chứng cứ HTTPS, số tiền dương, đơn vị và timestamp ISO.');}
 return data;
}
function safeURL(value){try{return new URL(value).protocol==='https:';}catch{return false;}}
function shortestPath(nodes,edges,from,to,transactionOnly=false){
 if(!nodes.some(n=>n.id===from)||!nodes.some(n=>n.id===to))return null;
 const adj=new Map(nodes.map(n=>[n.id,[]]));
 for(const e of edges){if(transactionOnly&&e.kind!=='transaction')continue;adj.get(e.from)?.push([e.to,e.id]);if(e.kind==='relationship'&&!transactionOnly)adj.get(e.to)?.push([e.from,e.id]);}
 const prev=new Map([[from,null]]), queue=[from];
 for(let i=0;i<queue.length;i++){const cur=queue[i];if(cur===to)break;for(const [next,id]of adj.get(cur)||[])if(!prev.has(next)){prev.set(next,[cur,id]);queue.push(next);}}
 if(!prev.has(to))return null;
 const result={nodes:[to],edges:[]};let cur=to;while(prev.get(cur)){let[p,e]=prev.get(cur);result.nodes.unshift(p);result.edges.unshift(e);cur=p;}return result;
}
// Unwrap longitudes so crossings take the short side of the antimeridian.
function routePoints(a,b){let lon=b.lon;while(lon-a.lon>180)lon-=360;while(lon-a.lon< -180)lon+=360;return [[a.lat,a.lon],[b.lat,lon]];}
function routeGeometry(a,b){
 const p=routePoints(a,b), end=p[1][1];
 if(end>=-180&&end<=180)return {type:'LineString',coordinates:p.map(([lat,lon])=>[lon,lat])};
 const boundary=end>180?180:-180, t=(boundary-a.lon)/(end-a.lon), lat=a.lat+t*(b.lat-a.lat);
 return {type:'MultiLineString',coordinates:[[[a.lon,a.lat],[boundary,lat]],[[-boundary,lat],[b.lon,b.lat]]]};
}
// Great-circle display sampling. It illustrates a connection, never an observed itinerary.
function routeCurve(a,b,segments=48){
 if(!validPoint(a)||!validPoint(b))return [];
 if(!Number.isInteger(segments)||segments<2||segments>256)throw Error('segments must be 2..256');
 const rad=Math.PI/180;
 const vector=n=>[Math.cos(n.lat*rad)*Math.cos(n.lon*rad),Math.cos(n.lat*rad)*Math.sin(n.lon*rad),Math.sin(n.lat*rad)];
 const u=vector(a),v=vector(b),dot=Math.max(-1,Math.min(1,u.reduce((sum,x,i)=>sum+x*v[i],0))),omega=Math.acos(dot),sin=Math.sin(omega),straight=routePoints(a,b);
 const points=[];let previous=a.lon;
 for(let i=0;i<=segments;i++){
  const t=i/segments;let lat,lon;
  if(Math.abs(sin)<1e-7){lat=a.lat+(b.lat-a.lat)*t;lon=a.lon+(straight[1][1]-a.lon)*t;}
  else{const x=u.map((value,j)=>(Math.sin((1-t)*omega)*value+Math.sin(t*omega)*v[j])/sin);lat=Math.atan2(x[2],Math.hypot(x[0],x[1]))/rad;lon=Math.atan2(x[1],x[0])/rad;}
  while(lon-previous>180)lon-=360;while(lon-previous< -180)lon+=360;
  points.push([Math.max(-85.05112878,Math.min(85.05112878,lat)),lon]);previous=lon;
 }
 points[0]=[a.lat,a.lon];points[points.length-1][0]=b.lat;
 return points;
}
function aggregateRoutes(nodes,edges){
 const lookup=new Map(nodes.map(n=>[n.id,n])),groups=new Map();let unmapped=0,colocated=0;
 for(const e of edges){
  const a=lookup.get(e.from),b=lookup.get(e.to);if(!a||!b||!validPoint(a)||!validPoint(b)){unmapped++;continue;}
  let start=`${a.lat},${a.lon}`,end=`${b.lat},${b.lon}`;
  if(start===end){colocated++;continue;}
  if(e.kind==='relationship'&&start>end)[start,end]=[end,start];
  const key=JSON.stringify([start,end,e.kind,e.source||'']);
  if(!groups.has(key))groups.set(key,{id:key,from:e.from,to:e.to,kind:e.kind,source:e.source||'',edges:[]});
  groups.get(key).edges.push(e.id);
 }
 return {routes:[...groups.values()],unmapped,colocated};
}
function examplePath(nodes,edges){
 // A bounded genuine component walk, not a fabricated example or shortest-money-flow claim.
 const lookup=new Map(nodes.map(n=>[n.id,n])),adj=new Map(nodes.map(n=>[n.id,[]]));
 for(const e of edges){adj.get(e.from)?.push([e.to,e.id]);if(e.kind==='relationship')adj.get(e.to)?.push([e.from,e.id]);}
 const candidates=nodes.filter(n=>validPoint(n)&&String(n.country_codes||'').split(';').includes('VNM')).slice(0,20);
 if(!candidates.length)candidates.push(...nodes.filter(validPoint).slice(0,20));
 let best=null,bestScore=-1;
 for(const start of candidates){
  const previous=new Map([[start.id,null]]),depth=new Map([[start.id,0]]),queue=[start.id];
  for(let i=0;i<queue.length;i++){const cur=queue[i];if(depth.get(cur)>=12)continue;for(const [next,e]of adj.get(cur)||[])if(!previous.has(next)){previous.set(next,[cur,e]);depth.set(next,depth.get(cur)+1);queue.push(next);}}
  for(const end of queue){
   if(end===start.id||!validPoint(lookup.get(end)))continue;
   const p={nodes:[end],edges:[]};let cur=end;
   while(previous.get(cur)){const[before,e]=previous.get(cur);p.nodes.unshift(before);p.edges.unshift(e);cur=before;}
   if(p.edges.length>12)continue;
   const places=new Set(p.nodes.map(id=>{const n=lookup.get(id);return validPoint(n)?`${n.lat},${n.lon}`:null;}).filter(Boolean));
   const score=places.size*100+Math.min(p.edges.length,8);
   if(score>bestScore){bestScore=score;best=p;}
  }
 }
 return best;
}
const api={validate,validPoint,shortestPath,routePoints,routeGeometry,routeCurve,aggregateRoutes,examplePath,safeURL};
if(typeof module!=='undefined')module.exports=api;else root.ParadiseCore=api;
})(typeof window!=='undefined'?window:globalThis);
