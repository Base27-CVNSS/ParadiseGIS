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
const api={validate,validPoint,shortestPath,routePoints,routeGeometry,safeURL};
if(typeof module!=='undefined')module.exports=api;else root.ParadiseCore=api;
})(typeof window!=='undefined'?window:globalThis);
