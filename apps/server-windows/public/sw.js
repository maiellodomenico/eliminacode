'use strict';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let p={title:'Eliminacode',body:'Apri per controllare il tuo turno.',url:'/client'};
 try{p={...p,...event.data.json()};}catch{}
 event.waitUntil(self.registration.showNotification(p.title,{body:p.body,icon:'/client-icon.png',badge:'/client-icon.png',tag:p.tag||'eliminacode',data:{url:p.url},requireInteraction:true}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const url=new URL(event.notification.data?.url||'/client',self.location.origin);
 if(url.origin!==self.location.origin)return;
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
  const c=clients.find(c=>new URL(c.url).origin===url.origin);
  if(c){await c.navigate(url.href);await c.focus();}else await self.clients.openWindow(url.href);
 }));
});
