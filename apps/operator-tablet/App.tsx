import React,{useEffect,useMemo,useState} from 'react';
import {SafeAreaView,ScrollView,StyleSheet,Text,TouchableOpacity,View,useWindowDimensions} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {action,queue,QueueItem} from './src/api';

export default function App(){
 const {width,height}=useWindowDimensions();
 const compact=width<760;
 const [items,setItems]=useState<QueueItem[]>([]);
 const [selected,setSelected]=useState<QueueItem|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);

 useEffect(()=>{
  let alive=true;
  const load=async()=>{
   try{
    const q=await queue();
    if(alive){
     setItems(q);
     setError('');
     setSelected(s=>s?q.find(x=>x.ticketId===s.ticketId)||null:s);
    }
   }catch(e:any){if(alive)setError(e.message)}
  };
  load();
  const t=setInterval(load,2000);
  return()=>{alive=false;clearInterval(t)};
 },[]);

 const current=useMemo(()=>items.find(x=>x.status==='CALLED'||x.status==='SERVING')||null,[items]);

 async function act(i:QueueItem,a:'call'|'serve'|'skip'|'recall'){
  if(busy)return;
  setBusy(true);
  try{
   const n=await action(i.ticketId,a);
   setItems(n);
   setSelected(n.find(x=>x.ticketId===i.ticketId)||null);
   setError('');
  }catch(e:any){setError(e.message)}
  finally{setBusy(false)}
 }

 const queuePanel=<View style={[s.panel,s.queuePanel]}>
   <View style={s.panelHead}>
    <View>
     <Text style={s.section}>Coda del reparto</Text>
     <Text style={s.helper}>Solo i ticket assegnati a questo reparto</Text>
    </View>
    <View style={s.badge}><Text style={s.badgeText}>{items.length}</Text></View>
   </View>
   <ScrollView contentContainerStyle={s.queueList}>
    {items.length===0?<View style={s.emptyQueue}><Text style={s.emptyQueueTitle}>Nessun cliente in attesa</Text><Text style={s.helper}>La coda si aggiorna automaticamente.</Text></View>:
    items.map(i=><TouchableOpacity key={i.ticketId} onPress={()=>setSelected(i)} style={[s.row,selected?.ticketId===i.ticketId&&s.rowSel]}>
      <View style={s.rowMain}><Text style={s.rowNum}>{i.number}</Text><Text style={s.rowInfo}>{i.hasOrder?'🛒 Preordine':'Nessun preordine'}</Text></View>
      <Text style={[s.state,i.status==='CALLED'&&s.stateCalled,i.status==='SERVING'&&s.stateServing]}>{i.status}</Text>
    </TouchableOpacity>)}
   </ScrollView>
  </View>;

 const detailPanel=<View style={[s.panel,s.detailPanel]}>
  {selected?<>
   <View style={s.detailTop}>
    <View><Text style={s.detailLabel}>TICKET SELEZIONATO</Text><Text style={s.ticket}>{selected.number}</Text></View>
    {compact?<TouchableOpacity onPress={()=>setSelected(null)} style={s.closeDetail}><Text style={s.closeDetailText}>Chiudi</Text></TouchableOpacity>:null}
   </View>
   <Text style={s.orderTitle}>Ordine / note</Text>
   <View style={s.orderBox}><Text style={s.order}>{selected.order||'Nessun ordine inserito.'}</Text></View>
   <View style={s.actions}>
    <TouchableOpacity disabled={busy} style={[s.primary,busy&&s.disabled]} onPress={()=>act(selected,'call')}><Text style={s.white}>CHIAMA</Text></TouchableOpacity>
    <TouchableOpacity disabled={busy} style={[s.ok,busy&&s.disabled]} onPress={()=>act(selected,'serve')}><Text style={s.white}>SERVITO</Text></TouchableOpacity>
    <TouchableOpacity disabled={busy} style={[s.secondary,busy&&s.disabled]} onPress={()=>act(selected,'recall')}><Text style={s.dark}>RICHIAMA</Text></TouchableOpacity>
    <TouchableOpacity disabled={busy} style={[s.secondary,busy&&s.disabled]} onPress={()=>act(selected,'skip')}><Text style={s.dark}>SALTA</Text></TouchableOpacity>
   </View>
  </>:<View style={s.empty}><Text style={s.emptyText}>Seleziona un numero dalla coda</Text><Text style={s.helper}>Qui compariranno preordine e comandi operatore.</Text></View>}
 </View>;

 return <SafeAreaView style={s.safe}>
  <StatusBar style="dark"/>
  <View style={[s.header,compact&&s.headerCompact]}>
   <View style={s.brandWrap}><Text style={[s.logo,compact&&s.logoCompact]}>ELIMINACODE</Text><Text style={s.dept}>Operatore • reparto assegnato</Text></View>
   <View style={s.current}><Text style={s.currentLabel}>IN SERVIZIO</Text><Text style={[s.currentNum,compact&&s.currentNumCompact]}>{current?.number||'—'}</Text></View>
  </View>
  {error?<Text style={s.err}>{error}</Text>:null}
  {compact?
   <ScrollView contentContainerStyle={s.mobileBody}>{queuePanel}{selected?detailPanel:null}</ScrollView>:
   <View style={s.body}>{queuePanel}{detailPanel}</View>}
 </SafeAreaView>
}

const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:'#eef4f0'},
 header:{minHeight:112,paddingHorizontal:28,paddingVertical:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:'#fff',gap:16},
 headerCompact:{minHeight:92,paddingHorizontal:18,paddingVertical:12},
 brandWrap:{flex:1},logo:{fontWeight:'900',fontSize:30,color:'#174b35'},logoCompact:{fontSize:24},dept:{fontSize:15,color:'#6f7e78',marginTop:2},
 current:{alignItems:'center',minWidth:120},currentLabel:{fontSize:11,color:'#6f7e78',fontWeight:'800'},currentNum:{fontSize:44,fontWeight:'900',color:'#174b35'},currentNumCompact:{fontSize:34},
 err:{paddingHorizontal:16,paddingVertical:11,backgroundColor:'#fee2e2',color:'#991b1b',fontSize:13},
 body:{flex:1,flexDirection:'row',gap:18,padding:18},mobileBody:{padding:12,gap:12,paddingBottom:30},
 panel:{backgroundColor:'#fff',borderRadius:22,padding:18},queuePanel:{flex:1.15,minHeight:280},detailPanel:{flex:1,minHeight:280},
 panelHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:10},section:{fontSize:22,fontWeight:'900',color:'#17352a'},helper:{fontSize:13,color:'#718078',marginTop:3},badge:{minWidth:34,height:34,borderRadius:17,backgroundColor:'#edf7f1',alignItems:'center',justifyContent:'center'},badgeText:{fontWeight:'900',color:'#174b35'},
 queueList:{paddingBottom:8},row:{minHeight:72,borderBottomWidth:1,borderBottomColor:'#e7eeea',flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:10,paddingVertical:10,gap:10},rowSel:{backgroundColor:'#edf7f1',borderRadius:14,borderBottomColor:'transparent'},rowMain:{flex:1,flexDirection:'row',alignItems:'center',gap:14},rowNum:{fontSize:28,fontWeight:'900',minWidth:92,color:'#17352a'},rowInfo:{flex:1,fontSize:15,color:'#46564f'},state:{fontSize:11,fontWeight:'900',color:'#63756e',backgroundColor:'#f0f4f2',paddingHorizontal:8,paddingVertical:5,borderRadius:10},stateCalled:{color:'#7a4b00',backgroundColor:'#fff2d8'},stateServing:{color:'#174b35',backgroundColor:'#dff3e8'},
 emptyQueue:{paddingVertical:40,alignItems:'center'},emptyQueueTitle:{fontSize:17,fontWeight:'800',color:'#17352a'},
 detailTop:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between'},detailLabel:{fontSize:11,fontWeight:'900',color:'#6f7e78'},ticket:{fontSize:64,fontWeight:'900',color:'#174b35',lineHeight:70},closeDetail:{paddingHorizontal:12,paddingVertical:8,backgroundColor:'#eef4f0',borderRadius:12},closeDetailText:{fontWeight:'800',color:'#174b35'},
 orderTitle:{fontSize:17,fontWeight:'800',marginBottom:10,color:'#17352a'},orderBox:{minHeight:110,backgroundColor:'#f5f8f6',padding:16,borderRadius:16},order:{fontSize:17,lineHeight:25,color:'#263a32'},
 actions:{flexDirection:'row',flexWrap:'wrap',gap:10,marginTop:14},primary:{backgroundColor:'#174b35',padding:16,borderRadius:14,minWidth:130,flexGrow:1,alignItems:'center'},ok:{backgroundColor:'#287a50',padding:16,borderRadius:14,minWidth:130,flexGrow:1,alignItems:'center'},secondary:{backgroundColor:'#e8efeb',padding:16,borderRadius:14,minWidth:130,flexGrow:1,alignItems:'center'},disabled:{opacity:.55},white:{color:'#fff',fontWeight:'900'},dark:{color:'#17352a',fontWeight:'900'},
 empty:{flex:1,minHeight:220,alignItems:'center',justifyContent:'center'},emptyText:{fontSize:20,color:'#718078',fontWeight:'700',textAlign:'center'}
});
