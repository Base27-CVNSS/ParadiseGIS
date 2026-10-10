/* Local world basemap with an optional online OSM layer. No prefetch or tile retries. */
(function(root){
'use strict';
function shiftedFeatures(geojson,offset){
 function coordinates(value){return typeof value[0]==='number'?[value[0]+offset,...value.slice(1)]:value.map(coordinates);}
 return {type:'FeatureCollection',features:geojson.features.map(feature=>({...feature,geometry:{...feature.geometry,coordinates:coordinates(feature.geometry.coordinates)}}))};
}
function createBasemap(map,land,onStatus){
 const pane=map.createPane('worldBasemap');pane.style.zIndex=190;pane.style.pointerEvents='none';
 const credit='Made with <a href="https://www.naturalearthdata.com/">Natural Earth</a>';
 const outline=L.featureGroup().addTo(map);
 for(const offset of [-360,0,360])L.geoJSON(shiftedFeatures(land,offset),{pane:'worldBasemap',interactive:false,style:{color:'#7898b7',weight:.7,fillColor:'#374f72',fillOpacity:1}}).addTo(outline);
 const labels=L.layerGroup();
 const continents=[['BẮC MỸ',45,-105],['NAM MỸ',-16,-60],['CHÂU ÂU',54,15],['CHÂU PHI',7,20],['CHÂU Á',47,90],['CHÂU ĐẠI DƯƠNG',-27,136]];
 for(const offset of [-360,0,360])for(const [name,lat,lon]of continents)L.marker([lat,lon+offset],{pane:'worldBasemap',interactive:false,icon:L.divIcon({className:'basemap-label',html:name,iconSize:[120,20],iconAnchor:[60,10]})}).addTo(labels);
 let tileLayer=null,active='world',noticeShown=false;
 function set(name){
  active=name==='osm'?'osm':'world';document.body.classList.toggle('world-basemap',active==='world');
  if(active==='world'){
   if(tileLayer&&map.hasLayer(tileLayer))map.removeLayer(tileLayer);
   labels.addTo(map);map.attributionControl.removeAttribution(credit);map.attributionControl.addAttribution(credit);
   onStatus('Nền thế giới có sẵn · Natural Earth 1:110M');
  }else{
   map.removeLayer(labels);map.attributionControl.removeAttribution(credit);
   if(!tileLayer){
    tileLayer=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'});
    tileLayer.on('tileload',()=>{if(active==='osm')onStatus('OpenStreetMap · nền trực tuyến');});
    tileLayer.on('tileerror',()=>{if(active==='osm'){onStatus('OSM chưa tải được · chọn Nền thế giới có sẵn');if(!noticeShown){noticeShown=true;root.dispatchEvent(new CustomEvent('basemap-error'));}}});
   }
   tileLayer.addTo(map);onStatus('Đang tải OpenStreetMap…');
  }
  map.invalidateSize();
 }
 set('world');return {set,getActive:()=>active};
}
const api={shiftedFeatures,createBasemap};if(typeof module!=='undefined')module.exports=api;else root.ParadiseBasemap=api;
})(typeof window!=='undefined'?window:globalThis);
