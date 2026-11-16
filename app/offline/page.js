"use client";
import Link from "next/link";
export default function OfflinePage() {
  return <main style={{minHeight:"100dvh",display:"grid",placeItems:"center",padding:24,background:"#101114",color:"#f7f8fa",fontFamily:"system-ui"}}>
    <section style={{maxWidth:380,textAlign:"center",padding:28,border:"1px solid #303740",borderRadius:24,background:"#191d23"}}>
      <div style={{fontSize:56}}>🚜</div><p style={{letterSpacing:3,fontSize:10,color:"#ffb51b",fontWeight:800}}>JCB RENTAL</p>
      <h1 style={{fontSize:28}}>You’re offline</h1><p style={{color:"#aeb6c0",lineHeight:1.6}}>Your connection is unavailable. Reconnect to load live bookings, payments and machine locations. Previously opened app assets remain cached.</p>
      <button onClick={()=>location.reload()} style={{marginTop:12,border:0,borderRadius:12,padding:"13px 20px",background:"#ffb51b",fontWeight:800}}>Try again</button>
      <p style={{fontSize:11,color:"#89929d",marginTop:20}}>For safety, offline actions are not submitted or queued.</p>
    </section>
  </main>;
}
