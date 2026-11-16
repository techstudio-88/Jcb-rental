"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { money, hoursBetween, totalHours, estimateBooking, calculateBill, upiPaymentLink, WORK_TYPES } from "@/lib/domain";
import { initializeNativeExperience, tapFeedback, successFeedback, shareContent, subscribeNetwork, isNative } from "@/lib/native";
import { Geolocation } from "@capacitor/geolocation";
import PhaseTwoWorkspace from "@/components/PhaseTwoWorkspace";
import { App } from "@capacitor/app";

const LiveMap = dynamic(() => import("@/components/LiveMap"), { ssr: false, loading: () => <div className="skeleton mapSkeleton"/> });
const tabsByRole = {
  customer: [["home","⌂","Home"],["track","⌖","Track"],["bookings","▤","Bookings"],["more","•••","More"],["profile","◉","Profile"]],
  driver: [["duty","🚜","Duty"],["logs","⛽","Logs"],["attendance","◷","Attendance"],["profile","◉","Profile"]],
  admin: [["home","▦","Overview"],["bookings","▤","Bookings"],["fleet","🚜","Fleet"],["finance","₹","Finance"],["insights","◫","Insights"],["more","•••","More"],["team","♙","Team"]],
};
const statusLabel = (s) => ({pending:"Pending",confirmed:"Confirmed",active:"Working",done:"Completed",cancelled:"Cancelled",rejected:"Rejected",free:"Available",busy:"Busy",maintenance:"Maintenance",verified:"Verified"}[s] || s);
const statusClass = (s) => ["confirmed","done","free","verified"].includes(s) ? "good" : ["active","busy"].includes(s) ? "info" : ["cancelled","rejected","maintenance"].includes(s) ? "bad" : "warn";
const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const monthValue = () => { const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); };
const localDateValue = () => { const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const formatElapsed = (since, now) => { const s=Math.max(0,Math.floor((now-new Date(since).getTime())/1000)); return String(Math.floor(s/3600)).padStart(2,"0")+":"+String(Math.floor(s/60)%60).padStart(2,"0")+":"+String(s%60).padStart(2,"0"); };
const introSlides = [
  {icon:"📅",title:"Monthly or hourly",body:"Book a machine for a month, a day or just a few hours — with or without diesel."},
  {icon:"📍",title:"Track the work",body:"See your assigned machine on the map while the operator is on an active job."},
  {icon:"🧾",title:"Bills in one place",body:"Review work logs, submit payments and print your rental invoice from your phone."}
];

function useToast() {
  const [items,setItems] = useState([]);
  const say = useCallback((message,kind="info") => {
    const id = Date.now() + Math.random();
    setItems((old)=>[...old,{id,message,kind}]);
    setTimeout(()=>setItems((old)=>old.filter(x=>x.id!==id)),3600);
  },[]);
  return [items,say];
}
function Toasts({items}) {
  return <div className="toasts">{items.map(x=><motion.div key={x.id} className={"toast "+x.kind} initial={{y:-18,opacity:0}} animate={{y:0,opacity:1}} exit={{opacity:0}}>{x.message}</motion.div>)}</div>;
}
function Button({children,variant="primary",small=false,...props}) {
  const action=props.onClick;
  return <button className={"btn "+variant+(small?" small":"")} {...props} onClick={(event)=>{if(!props.disabled)tapFeedback();action?.(event);}}>{children}</button>;
}
function Badge({value}) { return <span className={"badge "+statusClass(value)}>{statusLabel(value)}</span>; }
function Field({label,...props}) { return <label className="field"><span>{label}</span><input {...props}/></label>; }
function SelectField({label,children,...props}) { return <label className="field"><span>{label}</span><select {...props}>{children}</select></label>; }
function Card({children,className=""}) { return <section className={"card "+className}>{children}</section>; }
function SkeletonList({count=2}) { return <div className="skeletonList">{Array.from({length:count},(_,i)=><div className="skeletonCard" key={i}><i className="wide"/><i/><i className="short"/></div>)}</div>; }
function Empty({icon="📭",title,children}) { return <div className="emptyBox"><div className="emptyIcon">{icon}</div><b>{title}</b><p>{children}</p></div>; }
function CountUp({value}) {
  const target=Number(value)||0;
  const [shown,setShown]=useState(0);
  useEffect(()=>{
    const start=Date.now(),duration=720;
    const timer=setInterval(()=>{const p=Math.min(1,(Date.now()-start)/duration);setShown(target*p);if(p>=1)clearInterval(timer);},16);
    return()=>clearInterval(timer);
  },[target]);
  return <>{Number.isInteger(target)?Math.round(shown).toLocaleString("en-IN"):shown.toFixed(1)}</>;
}
function Stat({label,value,accent}) {
  const numeric=typeof value==="number"||(typeof value==="string"&&value.trim()!==""&&Number.isFinite(Number(value)));
  return <div className="stat"><span>{label}</span><b className={accent||""}>{numeric?<CountUp value={value}/>:value}</b></div>;
}
function ConfettiBurst({fire}) {
  const pieces=Array.from({length:28},(_,i)=>({left:((i*37)%97)+1,delay:(i%7)*.045,rotation:(i*71)%620,color:["#ffb51b","#46c58b","#66a9ff","#ff7777","#ffffff"][i%5]}));
  return <AnimatePresence>{fire>0&&<motion.div key={fire} className="confettiLayer" initial={{opacity:1}} animate={{opacity:0}} transition={{delay:1.15,duration:.5}}>{pieces.map((p,i)=><motion.i key={i} initial={{y:-20,rotate:0,opacity:1}} animate={{y:"105vh",rotate:p.rotation,opacity:0}} transition={{duration:1.5,delay:p.delay,ease:"easeOut"}} style={{left:p.left+"%",background:p.color}}/>)}</motion.div>}</AnimatePresence>;
}
function Splash() { return <motion.div className="splash" initial={{opacity:1}} exit={{opacity:0,scale:1.04}} transition={{duration:.45}}><motion.div initial={{y:28,opacity:0}} animate={{y:0,opacity:1}} transition={{type:"spring",stiffness:100}} className="splashLogo">🚜</motion.div><div className="splashName">JCB <i>RENTAL</i></div><p>BOOK · TRACK · BILL</p><div className="loadingLine"><i/></div></motion.div>; }

function MachineIllustration({compact=false}) {
  const uid=useId().replace(/:/g,"");
  return <svg className={"machineArt"+(compact?" compact":"")} viewBox="0 0 480 250" role="img" aria-label="Yellow backhoe loader illustration">
    <defs>
      <linearGradient id={uid+"-machineYellow"} x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#ffe08a"/><stop offset=".48" stopColor="#ffb52e"/><stop offset="1" stopColor="#d97706"/></linearGradient>
      <linearGradient id={uid+"-machineGlass"} x1="0" x2="1" y1="0" y2="1"><stop stopColor="#bceaff"/><stop offset="1" stopColor="#42677d"/></linearGradient>
      <linearGradient id={uid+"-machineSteel"} x1="0" x2="0" y1="0" y2="1"><stop stopColor="#596675"/><stop offset="1" stopColor="#202a34"/></linearGradient>
    </defs>
    <ellipse cx="244" cy="222" rx="190" ry="16" fill="#02070b" opacity=".48"/>
    <path d="M62 192h331l-16 17H79z" fill="#26313b"/>
    <g fill="#121a22" stroke="#697582" strokeWidth="5"><circle cx="142" cy="190" r="42"/><circle cx="337" cy="190" r="39"/></g>
    <g fill="#53606c"><circle cx="142" cy="190" r="23"/><circle cx="337" cy="190" r="21"/></g>
    <g fill="#1b242d"><circle cx="142" cy="190" r="9"/><circle cx="337" cy="190" r="8"/></g>
    <path d="M100 166l34-58 105-10 57 31 60 7 20 37-5 23H111z" fill={"url(#"+uid+"-machineYellow)"} stroke="#8d510b" strokeWidth="4" strokeLinejoin="round"/>
    <path d="M209 98l17-58 74 0 37 61-14 42h-83z" fill={"url(#"+uid+"-machineYellow)"} stroke="#8d510b" strokeWidth="4" strokeLinejoin="round"/>
    <path d="M233 52h60l26 43h-96z" fill={"url(#"+uid+"-machineGlass)"} stroke="#5b4b32" strokeWidth="5"/>
    <path d="M262 52v43" stroke="#334b5d" strokeWidth="5"/>
    <path d="M232 101h92l-5 13h-92z" fill="#9c5e11"/>
    <path d="M122 135l82-5 19 31-14 20H105z" fill="#f59e0b"/>
    <path d="M76 149l-32 14 8 17 46-4 22-30z" fill={"url(#"+uid+"-machineYellow)"} stroke="#8d510b" strokeWidth="4"/>
    <path d="M47 160l-20 13 11 17 27-4 8-19z" fill="#3b4650"/>
    <path d="M337 105l41-14 31-50 17 9-23 65-51 29z" fill={"url(#"+uid+"-machineYellow)"} stroke="#8d510b" strokeWidth="5" strokeLinejoin="round"/>
    <path d="M416 48l22-29 13 9-16 34z" fill="#d98a18" stroke="#8d510b" strokeWidth="4"/>
    <path d="M449 28l18 3-6 24-20 3z" fill={"url(#"+uid+"-machineSteel)"} stroke="#18212a" strokeWidth="3"/>
    <path d="M343 119l-15 30 18 11 27-35" fill="none" stroke="#b96a0a" strokeWidth="9" strokeLinecap="round"/>
    <path d="M189 105l-13-21 9-8 21 29" fill="none" stroke="#d98a18" strokeWidth="8" strokeLinecap="round"/>
    <path d="M102 173h263" stroke="#ffe4a3" strokeWidth="3" opacity=".7"/>
    <path d="M289 139h36" stroke="#202a34" strokeWidth="5" strokeLinecap="round"/>
    <rect x="292" y="145" width="22" height="7" rx="3" fill="#fff1bd"/>
    <path d="M154 125h35" stroke="#fff0c2" strokeWidth="4" opacity=".65"/>
  </svg>;
}

export default function Home() {
  const [toasts,say] = useToast();
  const [splash,setSplash] = useState(true);
  const [session,setSession] = useState(null);
  const [demoMode,setDemoMode] = useState(false);
  const [demoLogin,setDemoLogin] = useState(true);
  const [me,setMe] = useState(null);
  const [booting,setBooting] = useState(true);
  const [intro,setIntro] = useState(false);
  const [slide,setSlide] = useState(0);
  const [tab,setTab] = useState("home");
  const [phone,setPhone] = useState("");
  const [otp,setOtp] = useState("");
  const [demoRole,setDemoRole] = useState("customer");
  const [otpSent,setOtpSent] = useState(false);
  const [busy,setBusy] = useState(false);
  const [name,setName] = useState("");
  const [notifications,setNotifications] = useState([]);
  const [noticeOpen,setNoticeOpen] = useState(false);
  const [profileMenuOpen,setProfileMenuOpen] = useState(false);
  const [data,setData] = useState({bookings:[],machines:[],logs:[],payments:[],expenses:[],users:[],couponRedemptions:[],jobEvents:[],signoffs:[]});
  const [dataLoading,setDataLoading] = useState(false);
  const [machineQuery,setMachineQuery] = useState("");
  const [machineFilter,setMachineFilter] = useState("all");
  const [machineSort,setMachineSort] = useState("recommended");
  const [favoriteIds,setFavoriteIds] = useState([]);
  const [savedSites,setSavedSites] = useState([]);
  const [compareIds,setCompareIds] = useState([]);
  const [compareOpen,setCompareOpen] = useState(false);
  const [bookingOpen,setBookingOpen] = useState(false);
  const [bookingType,setBookingType] = useState("monthly");
  const [bookingStep,setBookingStep] = useState(1);
  const [form,setForm] = useState({machine_id:"",site_address:"",work_type:"Digging",start_date:localDateValue(),with_diesel:true,months:1,duration_hours:4,duration_days:1});
  const [selected,setSelected] = useState(null);
  const [trackId,setTrackId] = useState(null);
  const [month,setMonth] = useState(monthValue());
  const [filter,setFilter] = useState("pending");
  const [assign,setAssign] = useState({});
  const [machineForm,setMachineForm] = useState({model:"",reg_no:"",hourly_rate:"",daily_rate:"",monthly_diesel:"",monthly_no_diesel:""});
  const [machineOpen,setMachineOpen] = useState(false);
  const [running,setRunning] = useState(null);
  const [celebration,setCelebration] = useState(0);
  const [installPrompt,setInstallPrompt] = useState(null);
  const [nativeInfo,setNativeInfo] = useState({native:false,platform:"web"});
  const [online,setOnline] = useState(true);
  const [expenseOpen,setExpenseOpen] = useState(null);
  const [expenseForm,setExpenseForm] = useState({kind:"diesel",litres:"",amount:"",notes:""});
  const [proof,setProof] = useState(null);
  const [savingProof,setSavingProof] = useState(false);
  const [now,setNow] = useState(Date.now());
  const watchRef = useRef(null);
  const lastGpsRef = useRef(0);
  const wakeRef = useRef(null);

  useEffect(()=> {
    const t=setTimeout(()=>setSplash(false),1900);
    const installHandler=(event)=>{event.preventDefault();setInstallPrompt(event);};
    window.addEventListener("beforeinstallprompt",installHandler);
    let swControllerHandler=null;
    if ("serviceWorker" in navigator) {
      if(sessionStorage.getItem("jcb_sw_reload")==="1") setTimeout(()=>sessionStorage.removeItem("jcb_sw_reload"),1800);
      navigator.serviceWorker.register("/sw.js",{updateViaCache:"none"}).then(reg=>reg.update()).catch(()=>{});
      swControllerHandler=()=>{
        if(sessionStorage.getItem("jcb_sw_reload")!=="1"){
          sessionStorage.setItem("jcb_sw_reload","1");
          window.location.reload();
        }
      };
      navigator.serviceWorker.addEventListener("controllerchange",swControllerHandler);
    }
    try { const savedDemo=localStorage.getItem("jcb_demo_session"); if(savedDemo){const parsed=JSON.parse(savedDemo);if(parsed?.isDemo){setMe(parsed);setDemoMode(true);setBooting(false);}} setIntro(!localStorage.getItem("jcb_seen")); } catch {}
    return ()=>{clearTimeout(t);window.removeEventListener("beforeinstallprompt",installHandler);if(swControllerHandler&&"serviceWorker" in navigator)navigator.serviceWorker.removeEventListener("controllerchange",swControllerHandler);};
  },[]);
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[]);
  useEffect(()=>{let alive=true,networkHandle=null;initializeNativeExperience().then(info=>{if(alive){setNativeInfo(info);if(info.network)setOnline(info.network.connected);}});const onOnline=()=>setOnline(true),onOffline=()=>setOnline(false);window.addEventListener("online",onOnline);window.addEventListener("offline",onOffline);subscribeNetwork(status=>setOnline(status.connected)).then(handle=>{networkHandle=handle;});return()=>{alive=false;networkHandle?.remove?.();window.removeEventListener("online",onOnline);window.removeEventListener("offline",onOffline);};},[]);
  const loadProfile = useCallback(async (s) => {
    if (!s?.user) { setMe(null); setSession(null); setDemoMode(false); setBooting(false); return; }
    setDemoMode(false);
    try { localStorage.removeItem("jcb_demo_session"); } catch {}
    setSession(s);
    let profile = null;
    for(let i=0;i<4&&!profile;i++){
      const {data:row}=await supabase.from("profiles").select("*").eq("id",s.user.id).maybeSingle();
      profile=row;
      if(!profile) await new Promise(r=>setTimeout(r,400));
    }
    if (!profile) {
      const {data:row,error}=await supabase.from("profiles").upsert({id:s.user.id,phone:s.user.phone,role:"customer"}).select().maybeSingle();
      if(!error) profile=row;
    }
    setMe(profile);
    setBooting(false);
  },[]);
  useEffect(()=>{
    if(!isSupabaseConfigured){setBooting(false);return;}
    try { if(localStorage.getItem("jcb_demo_session")){setBooting(false);return;} } catch {}
    supabase.auth.getSession().then(({data})=>loadProfile(data.session));
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>{setTimeout(()=>loadProfile(s),0);});
    return ()=>subscription.unsubscribe();
  },[loadProfile]);
  const refresh = useCallback(async()=>{
    if(!me?.id||demoMode||me?.isDemo)return;
    setDataLoading(true);
    const role=me.role;
    const jobs=[
      supabase.from("bookings").select("*,machines(*),customer:profiles!bookings_customer_id_fkey(name,phone),driver:profiles!bookings_driver_id_fkey(name,phone)").order("created_at",{ascending:false}),
      supabase.from("machines").select("*").order("model"),
      supabase.from("logbook").select("*,bookings(driver_id,customer_id,machine_id)"),
      supabase.from("payments").select("*,bookings(machine_id,machines(model),customer:profiles!bookings_customer_id_fkey(name))").order("created_at",{ascending:false}),
      supabase.from("diesel_logs").select("*,bookings(machine_id,machines(model),driver_id)").order("created_at",{ascending:false}),
      role==="admin" ? supabase.from("profiles").select("*").order("created_at") : Promise.resolve({data:[]}),
      supabase.from("machine_expenses").select("*,machines(model)").order("created_at",{ascending:false}),
      supabase.from("coupon_redemptions").select("*").order("created_at",{ascending:false}),
      supabase.from("driver_job_events").select("*").order("created_at",{ascending:false}),
      supabase.from("job_signoffs").select("*").order("created_at",{ascending:false}),
    ];
    const results=await Promise.all(jobs);
    for(const r of results) if(r.error) say(r.error.message,"error");
    setData({bookings:results[0].data||[],machines:results[1].data||[],logs:results[2].data||[],payments:results[3].data||[],expenses:[...(results[4].data||[]),...(results[6].data||[])],users:results[5].data||[],couponRedemptions:results[7].data||[],jobEvents:results[8].data||[],signoffs:results[9].data||[]});
    const {data:notifs}=await supabase.from("notifications").select("*").order("created_at",{ascending:false}).limit(40);
    setNotifications(notifs||[]);
    setDataLoading(false);
  },[me?.id,me?.role,demoMode,say]);
  useEffect(()=>{if(!me?.id||me?.isDemo)return;refresh();const channel=supabase.channel("app-"+me.id)
    .on("postgres_changes",{event:"*",schema:"public",table:"bookings"},refresh)
    .on("postgres_changes",{event:"*",schema:"public",table:"payments"},refresh)
    .on("postgres_changes",{event:"*",schema:"public",table:"logbook"},refresh)
    .on("postgres_changes",{event:"*",schema:"public",table:"diesel_logs"},refresh)
    .on("postgres_changes",{event:"*",schema:"public",table:"notifications",filter:"user_id=eq."+me.id},refresh)
    .subscribe();
    return()=>supabase.removeChannel(channel);
  },[me?.id,refresh]);
  useEffect(()=>{setTab(me?.role==="admin"?"home":me?.role==="driver"?"duty":"home");},[me?.role]);
  useEffect(()=>{
    if(!me?.id)return;
    const applyLink=(raw)=>{
      try{
        const url=new URL(raw,window.location.origin);
        const requestedTab=url.searchParams.get("tab");
        if(requestedTab&&tabsByRole[me.role]?.some(([key])=>key===requestedTab))setTab(requestedTab);
        if(url.searchParams.get("action")==="book"&&me.role==="customer"){setBookingType("monthly");setBookingOpen(true);}
      }catch{}
    };
    applyLink(window.location.href);
    const listener=e=>applyLink(e.detail?.url||"");
    window.addEventListener("jcb:deep-link",listener);
    return()=>window.removeEventListener("jcb:deep-link",listener);
  },[me?.id,me?.role]);
  useEffect(()=>{
    if(!me?.id)return;
    supabase.from("machine_favorites").select("machine_id").eq("user_id",me.id).then(({data:rows,error})=>{
      if(error){say(error.message,"error");return;}
      setFavoriteIds((rows||[]).map(x=>x.machine_id));
    });
    try{setSavedSites(JSON.parse(localStorage.getItem("jcb_sites_"+me.id)||"[]"));}catch{setSavedSites([]);}
  },[me?.id]);
  const toggleFavorite=async(id)=>{
    const wasSaved=favoriteIds.includes(id);
    const {error}=wasSaved
      ? await supabase.from("machine_favorites").delete().eq("user_id",me.id).eq("machine_id",id)
      : await supabase.from("machine_favorites").insert({user_id:me.id,machine_id:id});
    if(error)return say(error.message,"error");
    setFavoriteIds(current=>wasSaved?current.filter(x=>x!==id):[...current,id]);
    say(wasSaved?"Machine removed from saved list.":"Machine saved to your account.","success");
  };
  const toggleCompare=(id)=>{
    if(compareIds.includes(id)){setCompareIds(current=>current.filter(x=>x!==id));return;}
    if(compareIds.length>=2){say("Compare up to two machines at a time.");return;}
    setCompareIds(current=>[...current,id]);
  };
  const saveCurrentSite=()=>{
    const address=form.site_address.trim();
    if(!address)return say("Enter a site address first.","error");
    if(savedSites.some(x=>x.toLowerCase()===address.toLowerCase()))return say("This site is already saved.");
    const next=[address,...savedSites].slice(0,8);
    setSavedSites(next);
    try{localStorage.setItem("jcb_sites_"+me.id,JSON.stringify(next));}catch{}
    say("Site saved on this device.","success");
  };
  useEffect(()=>{if(!nativeInfo.native)return;let handle;App.addListener("backButton",()=>{if(expenseOpen)setExpenseOpen(null);else if(machineOpen)setMachineOpen(false);else if(selected)setSelected(null);else if(bookingOpen)setBookingOpen(false);else if(noticeOpen)setNoticeOpen(false);else if(tab!=="home")setTab("home");else App.exitApp();}).then(x=>{handle=x;});return()=>{handle?.remove?.();};},[nativeInfo.native,expenseOpen,machineOpen,selected,bookingOpen,noticeOpen,tab]);


  const sendOtp=async()=>{
    if(phone.length!==10)return say("Enter a valid 10-digit mobile number.","error");
    if(demoLogin){setDemoMode(true);setOtpSent(true);say("Read-only demo enabled. Enter any 4–6 digit code.");return;}
    setBusy(true);
    const {error}=await supabase.auth.signInWithOtp({phone:"+91"+phone});
    setBusy(false);
    if(error)return say(error.message,"error");
    setDemoMode(false);setOtpSent(true);
    say("Verification code sent to your mobile number.","success");
  };
  const verifyOtp=async()=>{
    if(demoMode){
      if(!/^\\d{4,6}$/.test(otp))return say("Enter any 4–6 digit demo code.","error");
      const demoUser={id:"demo-"+demoRole,phone:"+91"+phone,role:demoRole,name:demoRole==="admin"?"Demo Owner":demoRole==="driver"?"Demo Operator":"Demo Customer",daily_wage:800,isDemo:true};
      try{localStorage.setItem("jcb_demo_session",JSON.stringify(demoUser));}catch{}
      setMe(demoUser);setSession(null);setBooting(false);say("Demo sign-in successful. This preview is read-only and cannot access live business data.");return;
    }
    if(otp.length<4)return say("Enter the OTP you received.","error");
    setBusy(true);const {data:authData,error}=await supabase.auth.verifyOtp({phone:"+91"+phone,token:otp,type:"sms"});setBusy(false);
    if(error)return say(error.message,"error");
    await loadProfile(authData.session);
  };
  const saveName=async()=>{
    if(name.trim().length<2)return say("Enter your full name.","error");
    if(me?.isDemo){const updated={...me,name:name.trim()};setMe(updated);try{localStorage.setItem("jcb_demo_session",JSON.stringify(updated));}catch{}say("Demo profile updated for this device.");return;}
    const {error}=await supabase.from("profiles").update({name:name.trim()}).eq("id",me.id);
    if(error)return say(error.message,"error");
    setMe({...me,name:name.trim()});say("Profile saved.");
  };
  const signOut=async()=>{stopGps();if(me?.isDemo){try{localStorage.removeItem("jcb_demo_session");}catch{}setDemoMode(false);setMe(null);setSession(null);setOtpSent(false);setOtp("");setPhone("");return;}await supabase.auth.signOut();setMe(null);setSession(null);};
  const installApp=async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;setInstallPrompt(null);};
  const markNoticesRead=async()=>{
    await supabase.from("notifications").update({read:true}).eq("user_id",me.id).eq("read",false);
    setNotifications(old=>old.map(n=>({...n,read:true})));
  };
  const updateForm=(k,v)=>setForm(old=>({...old,[k]:v}));
  const currentMachine=data.machines.find(m=>m.id===form.machine_id);
  const estimate=estimateBooking(currentMachine,{...form,type:bookingType});
  const advanceBooking=()=>{
    if(bookingStep===1&&!form.machine_id)return say("Choose a machine first.","error");
    if(bookingStep===2&&form.site_address.trim().length<5)return say("Enter the complete work-site address.","error");
    setBookingStep(s=>Math.min(3,s+1));
  };
  const createBooking=async()=>{if(me?.isDemo){say("This is a read-only demo. Changes are not saved.");return;}
    if(!form.machine_id)return say("Choose a machine first.","error");
    if(form.site_address.trim().length<5)return say("Enter the complete work-site address.","error");
    const payload={...form,type:bookingType,customer_id:me.id,quoted_rate:bookingType==="monthly"?(form.with_diesel?currentMachine.monthly_diesel:currentMachine.monthly_no_diesel):bookingType==="daily"?(currentMachine.daily_rate||currentMachine.hourly_rate*8):currentMachine.hourly_rate,status:"pending"};
    const {error}=await supabase.from("bookings").insert(payload);
    if(error)return say(error.message,"error");
    setBookingOpen(false);setCelebration(x=>x+1);successFeedback();say("Booking request sent to the owner.");setTab("bookings");refresh();
  };
  const cancelBooking=async(b)=>{if(me?.isDemo){say("This is a read-only demo. Changes are not saved.");return;}
    const {error}=await supabase.from("bookings").update({status:"cancelled"}).eq("id",b.id);
    if(error)return say(error.message,"error");say("Booking cancelled.");refresh();
  };
  const bookingLogs=(id)=>data.logs.filter(l=>l.booking_id===id);
  const verifiedPaid=(id)=>data.payments.filter(p=>p.booking_id===id&&p.status==="verified").reduce((s,p)=>s+Number(p.amount),0);
  const allSubmitted=(id)=>data.payments.filter(p=>p.booking_id===id&&p.status!=="rejected").reduce((s,p)=>s+Number(p.amount),0);
  const billFor=(b)=>{const raw=calculateBill(b,b.machines,bookingLogs(b.id));const discount=(data.couponRedemptions||[]).filter(x=>x.booking_id===b.id).reduce((sum,x)=>sum+Number(x.discount_amount||0),0);const base=Math.max(0,raw.base-discount);const tax=Math.round(base*0.18);return {...raw,base,discount,tax,total:base+tax};};
  const payBalance=async(b,method)=>{if(me?.isDemo){say("This is a read-only demo. Changes are not saved.");return;}
    const amount=Math.max(0,billFor(b).total-allSubmitted(b.id));
    if(!amount)return say("No balance is due.");
    const {error}=await supabase.from("payments").insert({booking_id:b.id,amount:Math.ceil(amount),method,status:"pending"});
    if(error)return say(error.message,"error");
    if(method==="UPI"&&process.env.NEXT_PUBLIC_UPI_ID)window.location.href=upiPaymentLink(process.env.NEXT_PUBLIC_UPI_ID,amount,"JCB "+b.id.slice(0,8));
    setCelebration(x=>x+1);successFeedback();say("Payment recorded. The owner will verify it.");setSelected(null);refresh();
  };
  const printInvoice=(b)=>{
    const bill=billFor(b),logs=bookingLogs(b.id),paid=verifiedPaid(b.id);
    const rows=logs.map(l=>`<tr><td>${escapeHtml(new Date(l.start_at).toLocaleDateString("en-IN"))}</td><td>${escapeHtml(new Date(l.start_at).toLocaleTimeString("en-IN"))}</td><td>${l.end_at?escapeHtml(new Date(l.end_at).toLocaleTimeString("en-IN")):"Running"}</td><td>${hoursBetween(l).toFixed(2)}</td></tr>`).join("");
    const html=`<!doctype html><html><head><title>JCB Rental Invoice</title><style>body{font:14px Arial;padding:30px;color:#151515}h1{margin-bottom:3px}.line{height:6px;background:#ffb51b;margin:16px 0}table{width:100%;border-collapse:collapse;margin:20px 0}td,th{padding:9px;border-bottom:1px solid #ddd;text-align:left}.total{font-size:20px;font-weight:bold}.row{display:flex;justify-content:space-between;padding:6px 0}</style></head><body><h1>JCB RENTAL</h1><div>Rental service invoice</div><div class="line"></div><div class="row"><span>Invoice #${b.id.slice(0,8).toUpperCase()}</span><span>${new Date().toLocaleDateString("en-IN")}</span></div><p><b>Machine:</b> ${escapeHtml(b.machines?.model)}<br><b>Plan:</b> ${escapeHtml(b.type)}<br><b>Site:</b> ${escapeHtml(b.site_address)}<br><b>Work:</b> ${escapeHtml(b.work_type)}</p><table><tr><th>Date</th><th>Start</th><th>End</th><th>Hours</th></tr>${rows||"<tr><td colspan='4'>No working hours logged</td></tr>"}</table><div class="row"><span>Working hours</span><b>${bill.hours.toFixed(2)}</b></div><div class="row"><span>Rental amount</span><b>${money(bill.base)}</b></div><div class="row"><span>GST (18% estimate)</span><b>${money(bill.tax)}</b></div><div class="row total"><span>Total</span><span>${money(bill.total)}</span></div><div class="row"><span>Verified paid</span><b>${money(paid)}</b></div><div class="row total"><span>Balance</span><span>${money(Math.max(0,bill.total-paid))}</span></div><script>window.onload=()=>window.print()</script></body></html>`;
    const w=window.open("","_blank");if(!w)return say("Allow pop-ups to print the invoice.","error");w.document.open();w.document.write(html);w.document.close();
  };

  const startGps=async(b)=>{
    const persistPosition=async(pos)=>{
      if(!pos||Date.now()-lastGpsRef.current<8000)return;lastGpsRef.current=Date.now();
      const {error}=await supabase.from("locations").upsert({booking_id:b.id,lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy_m:pos.coords.accuracy,updated_at:new Date().toISOString()});
      if(error)say("GPS update failed: "+error.message,"error");
    };
    try{wakeRef.current=await navigator.wakeLock?.request("screen");}catch{}
    if(watchRef.current!==null)return;
    if(isNative()){
      try{
        await Geolocation.requestPermissions();
        const id=await Geolocation.watchPosition({enableHighAccuracy:true,maximumAge:5000,timeout:15000},(pos,error)=>{if(error)say("GPS error: "+error.message,"error");else if(pos)persistPosition(pos);});
        watchRef.current={native:true,id};
      }catch(error){say("Allow location access in device settings: "+(error?.message||"permission required"),"error");}
      return;
    }
    if(!navigator.geolocation)return say("Location is not supported on this device.","error");
    watchRef.current=navigator.geolocation.watchPosition(persistPosition,()=>say("Allow location access and keep GPS enabled.","error"),{enableHighAccuracy:true,maximumAge:5000,timeout:15000});
  };
  function stopGps(){if(watchRef.current?.native)Geolocation.clearWatch({id:watchRef.current.id}).catch(()=>{});else if(watchRef.current!==null)navigator.geolocation?.clearWatch(watchRef.current);watchRef.current=null;wakeRef.current?.release?.();wakeRef.current=null;}
  useEffect(()=>()=>stopGps(),[]);
  useEffect(()=>{
    if(me?.role!=="driver"||running)return;
    const open=data.logs.find(l=>l.bookings?.driver_id===me.id&&!l.end_at);
    const booking=open&&data.bookings.find(b=>b.id===open.booking_id);
    if(open&&booking){setRunning({...open,booking});startGps(booking);}
  },[data.logs,data.bookings,me?.id,me?.role,running]);
  const respondToDuty=async(b,event_type)=>{
    if(data.jobEvents.some(x=>x.booking_id===b.id&&x.driver_id===me.id&&["accepted","rejected"].includes(x.event_type)))return say("You have already responded to this duty.","error");
    const {error}=await supabase.from("driver_job_events").insert({booking_id:b.id,driver_id:me.id,event_type});
    if(error)return say(error.message,"error");
    say(event_type==="accepted"?"Duty accepted. You can now start work.":"Duty declined. The owner will be notified.",event_type==="accepted"?"success":"info");refresh();
  };
  const markArrived=async(b)=>{
    let latitude=null,longitude=null;
    try{
      if(isNative()){const p=await Geolocation.getCurrentPosition({enableHighAccuracy:true,timeout:10000});latitude=p.coords.latitude;longitude=p.coords.longitude;}
      else if(navigator.geolocation){const p=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:10000}));latitude=p.coords.latitude;longitude=p.coords.longitude;}
    }catch{}
    const {error}=await supabase.from("driver_job_events").insert({booking_id:b.id,driver_id:me.id,event_type:"arrived",latitude,longitude,notes:latitude===null?"Arrival marked without GPS permission":"Operator reached the work site"});
    if(error)return say(error.message,"error");say("Arrival recorded.", "success");refresh();
  };
  const reportBreakdown=async(b)=>{
    const {error}=await supabase.from("driver_job_events").insert({booking_id:b.id,driver_id:me.id,event_type:"breakdown",notes:"Operator reported a machine breakdown"});
    if(error)return say(error.message,"error");say("Breakdown reported to the owner.", "success");refresh();
  };
  const confirmJobSignoff=async(b)=>{
    const row=data.signoffs.find(x=>x.booking_id===b.id);
    if(!row)return say("Operator sign-off is not available yet.","error");
    const {error}=await supabase.from("job_signoffs").update({customer_name:me.name,customer_confirmed_at:new Date().toISOString()}).eq("id",row.id);
    if(error)return say(error.message,"error");say("Work completion confirmed.", "success");refresh();
  };
  const startWork=async(b)=>{if(me?.isDemo){say("This is a read-only demo. Changes are not saved.");return;}
    if(running)return say("End the current duty before starting another.","error");
    if(!data.jobEvents.some(x=>x.booking_id===b.id&&x.driver_id===me.id&&x.event_type==="accepted"))return say("Accept this duty before starting work.","error");
    const {data:row,error}=await supabase.from("logbook").insert({booking_id:b.id}).select().single();
    if(error)return say(error.message,"error");
    const status=await supabase.from("bookings").update({status:"active"}).eq("id",b.id);
    if(status.error)say(status.error.message,"error");
    setRunning({...row,booking:b});startGps(b);successFeedback();say("Work timer started.");refresh();
  };
  const endWork=async()=>{if(me?.isDemo){say("This is a read-only demo. Changes are not saved.");return;}
    if(!running)return;
    stopGps();
    const endedAt=new Date().toISOString();
    const {error}=await supabase.from("logbook").update({end_at:endedAt}).eq("id",running.id);
    if(error)return say(error.message,"error");
    setRunning(null);successFeedback();say("Work session ended. The owner will close the booking when the job is complete.");refresh();
  };
  const saveExpense=async()=>{if(me?.isDemo){say("This is a read-only demo. Changes are not saved.");return;}
    if(!expenseOpen)return;
    if(!expenseForm.amount||Number(expenseForm.amount)<=0)return say("Enter a valid amount.","error");
    if(!proof)return say("Attach a photo of the receipt or proof.","error");
    setSavingProof(true);
    const safe=proof.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    const path=me.id+"/"+Date.now()+"-"+safe;
    const upload=await supabase.storage.from("proofs").upload(path,proof,{contentType:proof.type,upsert:false});
    if(upload.error){setSavingProof(false);return say(upload.error.message,"error");}
    const {error}=await supabase.from("diesel_logs").insert({booking_id:expenseOpen.id,kind:expenseForm.kind,litres:expenseForm.litres?Number(expenseForm.litres):null,amount:Number(expenseForm.amount),photo_path:path,notes:expenseForm.notes||null});
    setSavingProof(false);
    if(error)return say(error.message,"error");
    setExpenseOpen(null);setProof(null);setExpenseForm({kind:"diesel",litres:"",amount:"",notes:""});say("Expense saved with proof.");refresh();
  };
  const addMachine=async()=>{if(me?.isDemo){say("This is a read-only demo. Changes are not saved.");return;}
    if(!machineForm.model.trim())return say("Enter the machine model.","error");
    const payload=Object.fromEntries(Object.entries(machineForm).map(([k,v])=>[k,["model","reg_no"].includes(k)?v:Number(v||0)]));
    const {error}=await supabase.from("machines").insert(payload);
    if(error)return say(error.message,"error");
    setMachineOpen(false);setMachineForm({model:"",reg_no:"",hourly_rate:"",daily_rate:"",monthly_diesel:"",monthly_no_diesel:""});say("Machine added.");refresh();
  };
  const updateMachine=async(m,key,value)=>{if(me?.isDemo){say("This is a read-only demo. Changes are not saved.");return;}
    const {error}=await supabase.from("machines").update({[key]:key==="status"?value:Number(value)}).eq("id",m.id);
    if(error)return say(error.message,"error");say("Fleet details updated.");refresh();
  };
  const approveBooking=async(b)=>{if(me?.isDemo){say("This is a read-only demo. Changes are not saved.");return;}
    const driver_id=assign[b.id];if(!driver_id)return say("Select a driver before approving.","error");
    const {error}=await supabase.from("bookings").update({status:"confirmed",driver_id}).eq("id",b.id);
    if(error)return say(error.message,"error");
    await supabase.from("machines").update({status:"busy"}).eq("id",b.machine_id);
    setCelebration(x=>x+1);successFeedback();say("Booking approved and driver assigned.");refresh();
  };
  const setBookingStatus=async(b,status)=>{if(me?.isDemo){say("This is a read-only demo. Changes are not saved.");return;}
    const {error}=await supabase.from("bookings").update({status}).eq("id",b.id);
    if(error)return say(error.message,"error");
    if(status==="done"&&b.driver_id&&b.customer_id){
      const existing=await supabase.from("job_signoffs").select("id").eq("booking_id",b.id).maybeSingle();
      if(!existing.data){
        const signoff=await supabase.from("job_signoffs").insert({booking_id:b.id,driver_id:b.driver_id,customer_id:b.customer_id,driver_notes:"Owner marked the booking completed"});
        if(signoff.error)say("Booking completed, but customer sign-off could not be created: "+signoff.error.message,"error");
      }
    }
    if(["done","cancelled","rejected"].includes(status)&&b.machine_id)await supabase.from("machines").update({status:"free"}).eq("id",b.machine_id);
    say("Booking "+statusLabel(status).toLowerCase()+".");refresh();
  };
  const verifyPayment=async(p,status)=>{if(me?.isDemo){say("This is a read-only demo. Changes are not saved.");return;}
    const {error}=await supabase.from("payments").update({status,verified_at:status==="verified"?new Date().toISOString():null,verified_by:status==="verified"?me.id:null}).eq("id",p.id);
    if(error)return say(error.message,"error");say("Payment "+status+".");refresh();
  };
  const reassignBooking=async(b)=>{
    const driverId=assign[b.id];
    if(!driverId)return say("Choose an operator first.","error");
    const {error}=await supabase.from("bookings").update({driver_id:driverId}).eq("id",b.id);
    if(error)return say(error.message,"error");
    say("Operator reassigned.","success");refresh();
  };
  const updateRole=async(u,role)=>{if(me?.isDemo){say("This is a read-only demo. Changes are not saved.");return;}
    const {error}=await supabase.from("profiles").update({role}).eq("id",u.id);
    if(error)return say(error.message,"error");say("Team role updated.");refresh();
  };
  const updateWage=async(u,value)=>{if(me?.isDemo){say("This is a read-only demo. Changes are not saved.");return;}
    const {error}=await supabase.from("profiles").update({daily_wage:Number(value)||0}).eq("id",u.id);
    if(error)return say(error.message,"error");say("Daily wage saved.");refresh();
  };

  const activeBookings=data.bookings.filter(b=>b.status==="active");
  const currentTrack=activeBookings.find(b=>b.id===trackId)||activeBookings[0];
  const currentTrackLog=currentTrack&&data.logs.find(l=>l.booking_id===currentTrack.id&&!l.end_at);
  const unread=notifications.filter(n=>!n.read).length;
  const filteredBookings=data.bookings.filter(b=>filter==="all"||b.status===filter);
  const monthPayments=data.payments.filter(p=>p.status==="verified"&&p.created_at?.slice(0,7)===month);
  const monthExpenses=data.expenses.filter(x=>x.created_at?.slice(0,7)===month);
  const revenue=monthPayments.reduce((s,p)=>s+Number(p.amount),0);
  const expenses=monthExpenses.reduce((s,p)=>s+Number(p.amount),0);
  const drivers=data.users.filter(u=>u.role==="driver");
  const machineReports=data.machines.map(m=>({machine:m,revenue:monthPayments.filter(p=>p.bookings?.machine_id===m.id).reduce((s,p)=>s+Number(p.amount),0),expense:monthExpenses.filter(x=>(x.bookings?.machine_id||x.machine_id)===m.id).reduce((s,x)=>s+Number(x.amount),0)}));
  const revenueTrend=Array.from({length:6},(_,i)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-(5-i));const key=d.toISOString().slice(0,7);return {key,label:d.toLocaleDateString("en-IN",{month:"short"}),value:data.payments.filter(p=>p.status==="verified"&&p.created_at?.slice(0,7)===key).reduce((sum,p)=>sum+Number(p.amount),0)};});
  const topCustomers=Object.values(data.bookings.reduce((acc,b)=>{const id=b.customer_id;if(!id)return acc;if(!acc[id])acc[id]={id,name:b.customer?.name||b.customer?.phone||"Customer",phone:b.customer?.phone||"",jobs:0,revenue:0};acc[id].jobs++;acc[id].revenue+=verifiedPaid(b.id);return acc;},{})).sort((a,b)=>b.revenue-a.revenue).slice(0,5);
  const driverPerformance=drivers.map(d=>{const logs=data.logs.filter(l=>l.bookings?.driver_id===d.id);return {id:d.id,name:d.name||d.phone||"Operator",hours:totalHours(logs),jobs:new Set(logs.map(l=>l.booking_id)).size};}).sort((a,b)=>b.hours-a.hours).slice(0,5);
  const fleetBusy=data.machines.filter(m=>m.status==="busy").length;
  const fleetPercent=data.machines.length?Math.round(fleetBusy/data.machines.length*100):0;
  const receivables=data.bookings.filter(b=>["confirmed","active","done"].includes(b.status)).reduce((sum,b)=>sum+Math.max(0,billFor(b).total-allSubmitted(b.id)),0);
  const averageBooking=data.bookings.length?Math.round(data.bookings.reduce((sum,b)=>sum+billFor(b).total,0)/data.bookings.length):0;
  const repeatCustomerCount=topCustomers.filter(x=>x.jobs>1).length;
  const rentalMix=["monthly","daily","hourly"].map(type=>({type,count:data.bookings.filter(b=>b.type===type).length}));
  const paymentMix=["UPI","Bank","Cash"].map(method=>({method,total:data.payments.filter(p=>p.status==="verified"&&p.method===method).reduce((sum,p)=>sum+Number(p.amount),0)}));
  const pendingPaymentAmount=data.payments.filter(p=>p.status==="pending").reduce((sum,p)=>sum+Number(p.amount),0);
  const bestMachine=[...machineReports].sort((a,b)=>b.revenue-a.revenue)[0];
  const completedBookings=data.bookings.filter(b=>b.status==="done").length;
  const completionRate=data.bookings.length?Math.round(completedBookings/data.bookings.length*100):0;
  const totalLoggedHours=totalHours(data.logs);
  const exportBookingsCsv=()=>{
    const rows=[["Booking ID","Customer","Phone","Machine","Operator","Type","Start date","Status","Site","Work","Quoted rate","Billed","Submitted payments","Verified paid"],...filteredBookings.map(b=>[b.id,b.customer?.name,b.customer?.phone,b.machines?.model,b.driver?.name||b.driver?.phone,b.type,b.start_date,b.status,b.site_address,b.work_type,b.quoted_rate,billFor(b).total,allSubmitted(b.id),verifiedPaid(b.id)])];
    const csv=rows.map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="jcb-bookings-"+monthValue()+".csv";a.click();URL.revokeObjectURL(url);
  };
  const exportCsv=()=>{
    const rows=[["Machine","Revenue","Diesel/repair","Profit"],...machineReports.map(x=>[x.machine.model,x.revenue,x.expense,x.revenue-x.expense]),["TOTAL",revenue,expenses,revenue-expenses]];
    const csv=rows.map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="jcb-rental-report-"+month+".csv";a.click();URL.revokeObjectURL(url);
  };
  const openProof=async(x)=>{
    const {data:link,error}=await supabase.storage.from("proofs").createSignedUrl(x.photo_path,300);
    if(error)return say(error.message,"error");window.open(link.signedUrl,"_blank","noopener,noreferrer");
  };

  if(!isSupabaseConfigured)return <main className="setupPage"><div className="setupCard"><div className="brandMark">🚜</div><h1>JCB Rental</h1><p>Supabase is not connected yet. Add the project URL and publishable key in Vercel Environment Variables.</p><code>NEXT_PUBLIC_SUPABASE_URL</code><code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code></div></main>;
  if(booting)return <main className="boot"><div className="loader"/></main>;
  if(!me&&intro)return <main className="authPage"><div className="authCard introCard"><div className="brandMark">{introSlides[slide].icon}</div><div className="eyebrow">WELCOME TO JCB RENTAL</div><h1>{introSlides[slide].title}</h1><p>{introSlides[slide].body}</p><div className="stepDots">{introSlides.map((x,i)=><i key={i} className={i===slide?"on":""}/>)}</div><Button onClick={()=>{if(slide<introSlides.length-1)setSlide(slide+1);else{localStorage.setItem("jcb_seen","1");setIntro(false);}}}>{slide<introSlides.length-1?"Next →":"Get started →"}</Button><button className="textButton" onClick={()=>{localStorage.setItem("jcb_seen","1");setIntro(false);}}>Skip introduction</button></div><Toasts items={toasts}/></main>;
  if(!me)return <main className="authPage"><AnimatePresence>{splash&&<Splash/>}</AnimatePresence>
    <div className="authCard"><div className="brandMark">🚜</div><div className="eyebrow">JCB RENTAL SERVICE</div><h1>{otpSent?"Verify your number":"Work starts here."}</h1><p>{otpSent?(demoMode?"Enter any 4–6 digit demo code.":"Enter the 6-digit verification code sent to your phone."):"Book machines, manage work and keep every bill in one place."}</p>
      {!otpSent?<><div className="authModeToggle"><button type="button" className={demoLogin?"selected":""} onClick={()=>setDemoLogin(true)}>Read-only demo</button><button type="button" className={!demoLogin?"selected":""} onClick={()=>setDemoLogin(false)}>Real phone OTP</button></div><div className="phoneInput"><span>+91</span><input autoComplete="tel-national" inputMode="numeric" maxLength={10} placeholder="10-digit mobile number" value={phone} onChange={e=>setPhone(e.target.value.replace(/\\D/g,""))}/></div>{demoLogin&&<label className="field"><span>Preview as</span><select value={demoRole} onChange={e=>setDemoRole(e.target.value)}><option value="customer">Customer</option><option value="driver">Operator</option><option value="admin">Owner / Admin</option></select></label>}<Button disabled={busy} onClick={sendOtp}>{busy?"Sending…":demoLogin?"Continue to demo →":"Send verification code →"}</Button></>:<><input className="otpInput" autoComplete="one-time-code" inputMode="numeric" maxLength={6} placeholder="• • • • • •" value={otp} onChange={e=>setOtp(e.target.value.replace(/\\D/g,""))}/><Button disabled={busy} onClick={verifyOtp}>{busy?"Verifying…":demoMode?"Enter demo →":"Verify & Continue →"}</Button><button className="textButton" onClick={()=>{setOtpSent(false);setOtp("");setDemoMode(false);}}>Change mobile number</button></>}
      <div className="authFoot">{demoLogin?"Read-only demo · fake profile · no live business data is accessible.":"Real Supabase OTP · SMS provider must be configured before sign-in can work."}</div>
    </div><Toasts items={toasts}/></main>;
  if(!me.name)return <main className="authPage"><div className="authCard"><div className="brandMark">👋</div><div className="eyebrow">ONE LAST THING</div><h1>What should we call you?</h1><p>Your name will appear on your bookings and profile.</p><input className="input" placeholder="Full name" value={name} onChange={e=>setName(e.target.value)}/><Button onClick={saveName}>Continue →</Button></div><Toasts items={toasts}/></main>;

  const isAdmin=me.role==="admin", isDriver=me.role==="driver";
  const pageTitle=({home:"Overview",track:"Live tracking",bookings:"My bookings",profile:"My profile",duty:"My duties",logs:"Fuel & repair log",attendance:"Attendance & breaks",fleet:"Fleet & rates",finance:"Payments & reports",insights:"Business insights",team:"Team & attendance",more:"More tools",changes:"Booking changes",reviews:"Customer reviews",rewards:"Offers & referrals",support:"Help & support",service:"Maintenance & expenses",payroll:"Operator payroll",offers:"Coupon management"})[tab]||"JCB Rental";
  const tabs=tabsByRole[me.role]||tabsByRole.customer;
  const compareMachines=data.machines.filter(m=>compareIds.includes(m.id));
  const visibleMachines=data.machines.filter(m=>{
    const q=machineQuery.trim().toLowerCase();
    const matchesQuery=!q||[m.model,m.reg_no].some(v=>String(v||"").toLowerCase().includes(q));
    const matchesFilter=machineFilter==="all"||(machineFilter==="available"?m.status==="free":machineFilter==="favorites"?favoriteIds.includes(m.id):true);
    return matchesQuery&&matchesFilter;
  }).sort((a,b)=>machineSort==="hourly"?Number(a.hourly_rate)-Number(b.hourly_rate):machineSort==="daily"?Number(a.daily_rate||a.hourly_rate*8)-Number(b.daily_rate||b.hourly_rate*8):a.status==="free"&&b.status!=="free"?-1:b.status==="free"&&a.status!=="free"?1:String(a.model||"").localeCompare(String(b.model||"")));
  return <main className="appShell">
    {me.isDemo&&<div style={{padding:"9px 14px",textAlign:"center",fontSize:12,background:"#fff1c2",color:"#624300",fontWeight:700}}>TEMPORARY DEMO MODE · {me.role==="admin"?"Owner / Admin":me.role==="driver"?"Driver":"Customer"} view · Changes are not saved</div>}
    <AnimatePresence>{splash&&<Splash/>}</AnimatePresence><ConfettiBurst fire={celebration}/>
    <header className="topbar"><div className="brand"><span className="brandIcon">🚜</span><span>JCB <b>RENTAL</b><small>{isAdmin?"OWNER CONSOLE":isDriver?"OPERATOR APP":"CUSTOMER APP"}</small></span></div><div className="topActions">{installPrompt&&<button className="iconButton" onClick={installApp} aria-label="Install app">↓</button>}{!online&&<span className="networkPill" role="status">OFFLINE</span>}<button className="iconButton" onClick={()=>{tapFeedback();setNoticeOpen(true);markNoticesRead();}} aria-label="Notifications">♧{unread>0&&<i>{unread}</i>}</button><div className="profileMenuWrap"><button type="button" className={"avatar profileMenuTrigger"+(profileMenuOpen?" isOpen":"")} aria-label="Open account menu" aria-haspopup="menu" aria-expanded={profileMenuOpen} onClick={()=>{tapFeedback();setProfileMenuOpen(v=>!v);}}>{(me.name||"D").slice(0,1).toUpperCase()}</button><AnimatePresence>{profileMenuOpen&&<motion.div className="profileMenu" role="menu" initial={{opacity:0,y:-8,scale:.97}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-8,scale:.97}} transition={{duration:.16}}><div className="profileMenuHead"><div className="profileMenuAvatar">{(me.name||"D").slice(0,1).toUpperCase()}</div><div><b>{me.name||"Account"}</b><small>{me.phone||"Signed in"} · {isAdmin?"Owner":isDriver?"Operator":"Customer"}</small></div></div><div className="profileMenuLabel">GO TO PAGE</div>{(tabsByRole[me.role]||[]).map(([key,icon,label])=><button type="button" role="menuitem" key={key} className={"profileMenuItem"+(tab===key?" active":"")} onClick={()=>{setTab(key);setProfileMenuOpen(false);}}><span>{icon}</span>{label}{tab===key&&<i>Current</i>}</button>)}<div className="profileMenuDivider"/><button type="button" role="menuitem" className="profileMenuSignout" onClick={()=>{setProfileMenuOpen(false);signOut();}}>↪ <span>Sign out</span></button></motion.div>}</AnimatePresence></div></div></header>
    <div className="pageHead"><div><div className="eyebrow">{new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})}</div><h1>{pageTitle}</h1></div><div className="welcomeName">Hi, {me.name.split(" ")[0]}</div></div>
    <section className="content" key={tab}>
      <PhaseTwoWorkspace tab={tab} me={me} say={say} data={data} refresh={refresh} onNavigate={setTab}/>
      {tab==="home"&&!isAdmin&&!isDriver&&<div className="customerHome">
        <div className="hero"><div className="heroText"><span className="eyebrow dark">EQUIPMENT, ON YOUR SCHEDULE</span><h2>Move your<br/>project forward.</h2><p>Reliable machines. Clear rates. Simple bookings.</p><div className="heroTrust"><span>✓ Verified rates</span><span>✓ Live job updates</span></div></div><div className="heroMachine"><MachineIllustration/></div></div>
        <div className="actionGrid"><button onClick={()=>{setBookingType("monthly");setBookingStep(1);setForm(f=>({...f,machine_id:""}));setBookingOpen(true);}}><span>▦</span><b>Monthly plan</b><small>With or without diesel</small></button><button onClick={()=>{setBookingType("hourly");setBookingStep(1);setForm(f=>({...f,machine_id:""}));setBookingOpen(true);}}><span>◷</span><b>Hourly booking</b><small>Pay by working hours</small></button><button onClick={()=>{setBookingType("daily");setBookingStep(1);setForm(f=>({...f,machine_id:""}));setBookingOpen(true);}}><span>☀</span><b>Daily booking</b><small>Book by the day</small></button></div>
        <div className="sectionTitle"><h2>Your activity</h2><span>{data.bookings.length} bookings</span></div><div className="statsGrid"><Stat label="Active jobs" value={activeBookings.filter(b=>b.customer_id===me.id).length}/><Stat label="Hours logged" value={totalHours(data.logs.filter(l=>l.bookings?.customer_id===me.id)).toFixed(1)}/><Stat label="Balance due" value={money(data.bookings.filter(b=>b.customer_id===me.id&&["confirmed","active","done"].includes(b.status)).reduce((s,b)=>s+Math.max(0,billFor(b).total-allSubmitted(b.id)),0))} accent="goldText"/></div>
        {data.bookings.filter(b=>b.customer_id===me.id).slice(0,1).map(b=><Card key={"next-"+b.id} className="nextJobCard"><div className="jobMeta"><span className="quickSectionLabel">{b.status==="active"?"LIVE JOB":b.status==="pending"?"REQUEST IN REVIEW":"LATEST BOOKING"}</span><b>{b.machines?.model||"Machine request"}</b><small>📍 {b.site_address}</small><small>{b.start_date} · {b.work_type}</small></div><div className="jobAction"><Badge value={b.status}/><Button small variant="secondary" onClick={()=>{setTab(b.status==="active"?"track":"bookings");}}>View details →</Button><Button small disabled={b.machines?.status!=="free"} onClick={()=>{setBookingType(b.type||"monthly");setBookingStep(1);setForm(f=>({...f,machine_id:b.machine_id,site_address:b.site_address,work_type:b.work_type||"Digging"}));setBookingOpen(true);}}>Book again ↗</Button></div></Card>)}
        <div className="fleetHeading"><div><div className="eyebrow">CHOOSE YOUR MACHINE</div><h2>Available fleet</h2><p>{data.machines.filter(m=>m.status==="free").length} machines ready for your next site</p></div><span className="fleetCount">{data.machines.length.toString().padStart(2,"0")}<small>FLEET</small></span></div>
        <div className="machineSearch"><span>⌕</span><input aria-label="Search machines" placeholder="Search model or registration…" value={machineQuery} onChange={e=>setMachineQuery(e.target.value)}/>{machineQuery&&<button onClick={()=>setMachineQuery("")} aria-label="Clear search">×</button>}</div>
        <div className="fleetControlRow"><div className="filterChips fleetFilters">{[["all","All"],["available","Available"],["favorites","Saved"]].map(([key,label])=><button key={key} className={machineFilter===key?"selected":""} onClick={()=>setMachineFilter(key)}>{label}{key==="favorites"&&favoriteIds.length>0?" · "+favoriteIds.length:""}</button>)}</div><label className="sortControl"><span>Sort</span><select value={machineSort} onChange={e=>setMachineSort(e.target.value)}><option value="recommended">Recommended</option><option value="hourly">Hourly price</option><option value="daily">Daily price</option></select></label></div>
        {data.machines.length===0?(dataLoading?<SkeletonList count={2}/>:<Empty icon="🚜" title="Fleet is being prepared">The owner will add machines and rates here.</Empty>):visibleMachines.length===0?<Empty icon="⌕" title="No machines found">Try another search or change the fleet filter.</Empty>:<div className="machineGrid">{visibleMachines.map(m=><Card key={m.id} className="machineCard premiumMachineCard"><div className="machineVisual"><span><MachineIllustration compact/></span><div className="machineActions"><button aria-label={favoriteIds.includes(m.id)?"Remove from saved":"Save machine"} className={favoriteIds.includes(m.id)?"isFavorite":""} onClick={()=>toggleFavorite(m.id)}>{favoriteIds.includes(m.id)?"♥":"♡"}</button><button aria-label={compareIds.includes(m.id)?"Remove from comparison":"Add to comparison"} className={compareIds.includes(m.id)?"isCompared":""} onClick={()=>toggleCompare(m.id)}>{compareIds.includes(m.id)?"✓":"⇄"}</button></div></div><div className="machineTop"><span className="machineType">BACKHOE / JCB</span><Badge value={m.status}/></div><h3>{m.model}</h3><p>{m.reg_no||"Registration details pending"}</p><div className="machineRateMain"><small>STARTING FROM</small><b>{money(m.hourly_rate)} <i>/ hour</i></b></div><div className="rateRow"><span>Daily</span><b>{money(m.daily_rate||m.hourly_rate*8)}</b></div><div className="rateRow"><span>Monthly · diesel</span><b>{money(m.monthly_diesel)}</b></div><Button small disabled={m.status!=="free"} onClick={()=>{setBookingType("monthly");setBookingStep(1);setForm(f=>({...f,machine_id:m.id}));setBookingOpen(true);}}>{m.status==="free"?"Book this machine →":"Currently unavailable"}</Button></Card>)}</div>}
        {compareIds.length>0&&<div className="compareDock"><div><b>{compareIds.length} machine{compareIds.length>1?"s":""} selected</b><small>Compare rates and availability</small></div><Button small onClick={()=>setCompareOpen(true)} disabled={compareIds.length<2}>Compare →</Button><button className="compareClear" onClick={()=>setCompareIds([])} aria-label="Clear comparison">×</button></div>}
      </div>}
      {tab==="track"&&!isAdmin&&!isDriver&&<><Card><div className="sectionTitle"><h2>Machine location</h2>{currentTrack&&<Badge value={currentTrack.status}/>}</div>{activeBookings.filter(b=>b.customer_id===me.id).length>1&&<SelectField label="Active booking" value={trackId||currentTrack?.id||""} onChange={e=>setTrackId(e.target.value)}>{activeBookings.filter(b=>b.customer_id===me.id).map(b=><option key={b.id} value={b.id}>{b.machines?.model} · {b.site_address}</option>)}</SelectField>}{currentTrack?<><LiveMap supabase={supabase} bookingId={currentTrack.id}/><div className="trackDetails"><b>{currentTrack.machines?.model}</b><span>{currentTrack.site_address}</span>{currentTrackLog&&<div className="liveTimer">{formatElapsed(currentTrackLog.start_at,now)}<small>WORKING NOW</small></div>}{currentTrack.driver&&<a href={"tel:"+currentTrack.driver.phone}>Call operator · {currentTrack.driver.name||currentTrack.driver.phone}</a>}</div></>:<Empty icon="📍" title="No active machine">Live tracking appears here once your booking is approved and the operator starts work.</Empty>}</Card></>}
      {tab==="bookings"&&!isAdmin&&!isDriver&&<><div className="sectionTitle"><h2>Bookings & bills</h2><span>{data.bookings.filter(b=>b.customer_id===me.id).length} total</span></div>{data.bookings.filter(b=>b.customer_id===me.id).length===0?(dataLoading?<SkeletonList/>:<Empty icon="🧾" title="No bookings yet">Choose a monthly, daily or hourly plan to get started.</Empty>):data.bookings.filter(b=>b.customer_id===me.id).map(b=><Card key={b.id}><div className="rowBetween"><b>{b.machines?.model||"Machine request"}</b><Badge value={b.status}/></div><p className="muted">{b.type} · {b.start_date} · {b.work_type}</p><p className="muted">📍 {b.site_address}</p>{["confirmed","active","done"].includes(b.status)&&<div className="billMini"><span>{billFor(b).hours.toFixed(1)} working hours</span><b>{money(billFor(b).total)}</b></div>}{data.signoffs.find(x=>x.booking_id===b.id)&&<div className="phase2Signoff"><b>Operator sign-off</b><small>{data.signoffs.find(x=>x.booking_id===b.id).customer_confirmed_at?"You confirmed this work.":"Please confirm the completed work."}</small>{!data.signoffs.find(x=>x.booking_id===b.id).customer_confirmed_at&&<Button small onClick={()=>confirmJobSignoff(b)}>Confirm work completed</Button>}</div>}<div className="buttonRow">{["confirmed","active","done"].includes(b.status)&&<Button small variant="secondary" onClick={()=>setSelected(b)}>View bill</Button>}{b.status==="pending"&&<Button small variant="danger" onClick={()=>cancelBooking(b)}>Cancel request</Button>}</div></Card>)}</>}
      {tab==="duty"&&isDriver&&<><div className="operatorIntro"><div className="operatorBadge">FIELD OPERATIONS</div><h2>Ready for the next job?</h2><p>Your assigned machines, site details and live work timer are all here.</p></div><div className="statsGrid"><Stat label="Assigned duties" value={data.bookings.filter(b=>b.driver_id===me.id).length}/><Stat label="Hours this month" value={totalHours(data.logs.filter(l=>l.bookings?.driver_id===me.id&&l.start_at?.slice(0,7)===monthValue())).toFixed(1)}/><Stat label="Estimated pay" value={money(new Set(data.logs.filter(l=>l.bookings?.driver_id===me.id&&l.start_at?.slice(0,7)===monthValue()).map(l=>l.start_at.slice(0,10))).size*(me.daily_wage||0))}/></div>{data.bookings.filter(b=>b.driver_id===me.id&&["confirmed","active"].includes(b.status)).length===0?(dataLoading?<SkeletonList count={2}/>:<Empty icon="😴" title="No duties assigned">Your owner will assign a machine and site details here.</Empty>):data.bookings.filter(b=>b.driver_id===me.id&&["confirmed","active"].includes(b.status)).map(b=><Card key={b.id} className={running?.booking?.id===b.id?"activeDuty":""}><div className="rowBetween"><b>{b.machines?.model}</b><Badge value={b.status}/></div><p className="muted">{b.machines?.reg_no} · {b.start_date}</p><p>📍 {b.site_address}</p><p className="muted">Work: {b.work_type}</p>{b.customer&&<a href={"tel:"+b.customer.phone}>Call customer · {b.customer.name||b.customer.phone}</a>}{running?.booking?.id===b.id?<div className="liveTimer">{formatElapsed(running.start_at,now)}<small>WORK IN PROGRESS</small></div>:null}{!data.jobEvents.some(x=>x.booking_id===b.id&&x.driver_id===me.id&&["accepted","rejected"].includes(x.event_type))&&<div className="buttonRow"><Button small onClick={()=>respondToDuty(b,"accepted")}>Accept duty</Button><Button small variant="danger" onClick={()=>respondToDuty(b,"rejected")}>Decline</Button></div>}{data.jobEvents.some(x=>x.booking_id===b.id&&x.driver_id===me.id&&x.event_type==="accepted")&&<><div className="buttonRow"><Button small variant="secondary" onClick={()=>markArrived(b)}>Mark arrived</Button><a className="btn secondary small" target="_blank" rel="noreferrer" href={"https://www.google.com/maps/dir/?api=1&destination="+encodeURIComponent(b.site_address)}>Navigate ↗</a></div><Button onClick={()=>running?.booking?.id===b.id?endWork():startWork(b)} variant={running?.booking?.id===b.id?"danger":"primary"}>{running?.booking?.id===b.id?"■ End work":"▶ Start work"}</Button><Button variant="secondary" onClick={()=>setExpenseOpen(b)}>＋ Diesel / repair entry</Button><Button variant="danger" small onClick={()=>reportBreakdown(b)}>Report breakdown</Button></>}</Card>)}</>}
      {tab==="logs"&&isDriver&&<><div className="sectionTitle"><h2>Fuel & repair records</h2></div>{data.expenses.filter(x=>x.bookings?.driver_id===me.id).length===0?<Empty icon="⛽" title="No entries yet">Add diesel or repair records from an assigned duty.</Empty>:data.expenses.filter(x=>x.bookings?.driver_id===me.id).map(x=><Card key={x.id}><div className="rowBetween"><b>{x.kind==="diesel"?"⛽ Diesel":"🔧 Repair"} · {x.bookings?.machines?.model}</b><b>{money(x.amount)}</b></div><p className="muted">{x.litres?x.litres+" litres · ":""}{new Date(x.created_at).toLocaleString("en-IN")}</p>{x.notes&&<p>{x.notes}</p>}<Button variant="secondary" small onClick={()=>openProof(x)}>View photo proof ↗</Button></Card>)}</>}
      {tab==="profile"&&<Card><div className="profileAvatar">{me.name.slice(0,1).toUpperCase()}</div><h2>{me.name}</h2><p className="muted">{me.phone}</p><Field label="Display name" value={name||me.name} onChange={e=>setName(e.target.value)}/><Button onClick={saveName}>Save profile</Button><div className="divider"/><Button variant="secondary" onClick={()=>shareContent("JCB Rental","Book machines, track work and manage rental bills.",typeof window!=="undefined"?window.location.origin:undefined)}>↗ Share app</Button><Button variant="secondary" onClick={signOut}>Sign out</Button><p className="muted">App platform: {nativeInfo.native?nativeInfo.platform.toUpperCase():"WEB / PWA"} · {online?"Connected":"Offline"}</p></Card>}
      {tab==="home"&&isDriver&&<Empty icon="🚜" title="Your operator dashboard">Open My Duties to view assigned work, start timers and record expenses.</Empty>}
      {tab==="home"&&isAdmin&&<div className="ownerDashboard"><div className="hero adminHero"><div><span className="eyebrow dark">OWNER CONTROL CENTER</span><h2>Fleet at a glance.</h2><p>Bookings, machines, payments and your team.</p></div><span className="heroMachine"><MachineIllustration/></span></div><div className="statsGrid"><Stat label="Pending requests" value={data.bookings.filter(b=>b.status==="pending").length}/><Stat label="Working now" value={data.bookings.filter(b=>b.status==="active").length}/><Stat label="Fleet available" value={data.machines.filter(m=>m.status==="free").length}/><Stat label="Net this month" value={money(revenue-expenses)} accent="goldText"/></div><div className="ownerQuickActions"><button onClick={()=>setTab("bookings")}><span>▤</span><b>Bookings</b><small>Review requests</small></button><button onClick={()=>setTab("fleet")}><span>🚜</span><b>Fleet</b><small>Manage machines</small></button><button onClick={()=>setTab("finance")}><span>₹</span><b>Finance</b><small>Payments & bills</small></button><button onClick={()=>setTab("team")}><span>♙</span><b>Team</b><small>Operators</small></button></div><div className="sectionTitle"><h2>Needs attention</h2><span>{data.payments.filter(p=>p.status==="pending").length} payments</span></div>{data.bookings.filter(b=>b.status==="pending").slice(0,4).map(b=><Card key={b.id}><div className="rowBetween"><b>{b.machines?.model||"Machine"}</b><Badge value="pending"/></div><p className="muted">{b.customer?.name} · {b.site_address}</p><Button small onClick={()=>setTab("bookings")}>Review request</Button></Card>)}{data.bookings.filter(b=>b.status==="pending").length===0&&<Empty icon="✓" title="All caught up">No pending booking requests.</Empty>}</div>}
      {tab==="bookings"&&isAdmin&&<><div className="rowBetween sectionTitle"><h2>Booking management</h2><Button small variant="secondary" onClick={exportBookingsCsv}>Export CSV ↓</Button></div><div className="filterChips">{["pending","confirmed","active","done","rejected","cancelled","all"].map(s=><button key={s} className={filter===s?"selected":""} onClick={()=>setFilter(s)}>{statusLabel(s)}</button>)}</div>{filteredBookings.length===0?(dataLoading?<SkeletonList/>:<Empty icon="📋" title="Nothing here">No bookings match this filter.</Empty>):filteredBookings.map(b=><Card key={b.id}><div className="rowBetween"><b>{b.machines?.model||"Machine request"}</b><Badge value={b.status}/></div><p className="muted">{b.customer?.name} · {b.customer?.phone}</p><p>📍 {b.site_address}</p><p className="muted">{b.type} · {b.work_type} · {b.start_date}</p>{b.status==="pending"&&<><SelectField label="Assign operator" value={assign[b.id]||""} onChange={e=>setAssign(a=>({...a,[b.id]:e.target.value}))}><option value="">Choose driver</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.name||d.phone}</option>)}</SelectField><div className="buttonRow"><Button small onClick={()=>approveBooking(b)}>Approve & assign</Button><Button small variant="danger" onClick={()=>setBookingStatus(b,"rejected")}>Reject</Button></div></>}{data.jobEvents.filter(x=>x.booking_id===b.id).slice(0,3).map(ev=><div className="phase2EventLine" key={ev.id}><b>{ev.event_type.replace("_"," ")}</b><small>{new Date(ev.created_at).toLocaleString("en-IN")} {ev.notes? " · "+ev.notes:""}</small></div>)}{data.jobEvents.some(x=>x.booking_id===b.id&&x.event_type==="rejected")&&<><SelectField label="Reassign operator" value={assign[b.id]||""} onChange={e=>setAssign(a=>({...a,[b.id]:e.target.value}))}><option value="">Choose driver</option>{drivers.filter(d=>d.id!==b.driver_id).map(d=><option key={d.id} value={d.id}>{d.name||d.phone}</option>)}</SelectField><Button small onClick={()=>reassignBooking(b)}>Reassign duty</Button></>}{["confirmed","active"].includes(b.status)&&<Button small variant="secondary" onClick={()=>setBookingStatus(b,"done")}>Mark completed</Button>}</Card>)}</>}
      {tab==="fleet"&&isAdmin&&<><div className="rowBetween sectionTitle"><h2>Machines & rates</h2><Button small onClick={()=>setMachineOpen(true)}>＋ Add machine</Button></div>{data.machines.length===0?<Empty icon="🚜" title="No machines added">Add your first machine with the actual rates and registration number.</Empty>:data.machines.map(m=><Card key={m.id}><div className="rowBetween"><b>{m.model}</b><Badge value={m.status}/></div><p className="muted">{m.reg_no||"No registration number"}</p><SelectField label="Fleet status" value={m.status} onChange={e=>updateMachine(m,"status",e.target.value)}><option value="free">Available</option><option value="busy">Busy</option><option value="maintenance">Maintenance</option></SelectField>{[["hourly_rate","Hourly rate"],["daily_rate","Daily rate"],["monthly_diesel","Monthly with diesel"],["monthly_no_diesel","Monthly without diesel"]].map(([key,label])=><Field key={key} label={label+" (₹)"} type="number" min="0" defaultValue={m[key]} onBlur={e=>Number(e.target.value)!==m[key]&&updateMachine(m,key,e.target.value)}/>)}</Card>)}</>}
      {tab==="finance"&&isAdmin&&<><div className="sectionTitle"><h2>Financial summary</h2></div><Field label="Report month" type="month" value={month} onChange={e=>setMonth(e.target.value)}/><div className="statsGrid"><Stat label="Verified revenue" value={money(revenue)}/><Stat label="Fuel & repairs" value={money(expenses)}/><Stat label="Net total" value={money(revenue-expenses)} accent="goldText"/></div><div className="sectionTitle"><h2>Payment verification</h2></div>{data.payments.filter(p=>p.status==="pending").length===0?<Empty icon="✓" title="No pending payments">Submitted payments will appear here for verification.</Empty>:data.payments.filter(p=>p.status==="pending").map(p=><Card key={p.id}><div className="rowBetween"><b>{money(p.amount)} · {p.method}</b><Badge value={p.status}/></div><p className="muted">{p.bookings?.customer?.name} · {p.bookings?.machines?.model}</p><p className="muted">Submitted {new Date(p.created_at).toLocaleString("en-IN")}</p><div className="buttonRow"><Button small onClick={()=>verifyPayment(p,"verified")}>Verify payment</Button><Button small variant="danger" onClick={()=>verifyPayment(p,"rejected")}>Reject</Button></div></Card>)}<div className="sectionTitle"><h2>Machine-wise profit</h2><Button small variant="secondary" onClick={exportCsv}>Export CSV ↓</Button></div>{machineReports.map(x=><Card key={x.machine.id}><div className="rowBetween"><b>{x.machine.model}</b><b>{money(x.revenue-x.expense)}</b></div><div className="rateRow"><span>Revenue</span><b>{money(x.revenue)}</b></div><div className="rateRow"><span>Diesel & repair</span><b>{money(x.expense)}</b></div></Card>)}</>}
      {tab==="insights"&&isAdmin&&<>
        <div className="statsGrid"><Stat label="Lifetime bookings" value={data.bookings.length}/><Stat label="Avg. booking value" value={money(averageBooking)}/><Stat label="Outstanding balance" value={money(receivables)} accent="goldText"/><Stat label="Fleet utilization" value={fleetPercent+"%"}/></div>
        <div className="statsGrid"><Stat label="Completion rate" value={completionRate+"%"}/><Stat label="Repeat customers" value={repeatCustomerCount}/><Stat label="Logged work hours" value={totalLoggedHours.toFixed(1)}/><Stat label="Pending payment claims" value={money(pendingPaymentAmount)}/></div>
        <Card><div className="rowBetween"><b>Rental plan mix</b><span className="muted">Bookings by type</span></div>{rentalMix.map(x=><div className="rateRow" key={x.type}><span>{x.type[0].toUpperCase()+x.type.slice(1)}</span><b>{x.count}</b></div>)}</Card>
        <Card><div className="rowBetween"><b>Verified payment channels</b><span className="muted">Lifetime total</span></div>{paymentMix.map(x=><div className="rateRow" key={x.method}><span>{x.method}</span><b>{money(x.total)}</b></div>)}</Card>
        <Card><div className="rowBetween"><b>Top earning machine</b><span className="muted">Verified revenue</span></div>{bestMachine?<><h2 className="goldText">{bestMachine.machine.model}</h2><div className="rateRow"><span>Revenue</span><b>{money(bestMachine.revenue)}</b></div><div className="rateRow"><span>Fuel & repair</span><b>{money(bestMachine.expense)}</b></div><div className="rateRow"><span>Net contribution</span><b>{money(bestMachine.revenue-bestMachine.expense)}</b></div></>:<Empty icon="🚜" title="No machine data">Add machines and complete bookings to see fleet performance.</Empty>}</Card>
        <Card><div className="rowBetween"><b>Revenue trend</b><span className="muted">Last 6 months · verified</span></div><div className="insightBars">{revenueTrend.map(x=><div className="insightBar" key={x.key}><div className="insightBarTrack"><i style={{height:(Math.max(4,x.value/Math.max(1,...revenueTrend.map(v=>v.value))*100))+"%"}}/></div><b>{x.value?money(x.value):"—"}</b><small>{x.label}</small></div>)}</div></Card>
        <div className="statsGrid"><Stat label="Pending requests" value={data.bookings.filter(b=>b.status==="pending").length}/><Stat label="Completed jobs" value={data.bookings.filter(b=>b.status==="done").length}/><Stat label="Active jobs" value={data.bookings.filter(b=>b.status==="active").length}/><Stat label="Available machines" value={data.machines.filter(m=>m.status==="free").length}/></div>
        <Card><div className="rowBetween"><b>Top customers</b><span className="muted">By verified payments</span></div>{topCustomers.length?topCustomers.map((x,i)=><div className="insightRow" key={x.id}><span className="insightRank">{i+1}</span><div><b>{x.name}</b><small>{x.jobs} bookings</small></div><strong>{money(x.revenue)}</strong></div>):<Empty icon="👥" title="No customer activity">Customer performance will appear after bookings arrive.</Empty>}</Card>
        <Card><div className="rowBetween"><b>Operator performance</b><span className="muted">Logged work hours</span></div>{driverPerformance.length?driverPerformance.map((x,i)=><div className="insightRow" key={x.id}><span className="insightRank">{i+1}</span><div><b>{x.name}</b><small>{x.jobs} jobs</small></div><strong>{x.hours.toFixed(1)} h</strong></div>):<Empty icon="🦺" title="No operator data">Assigned operator work logs will be summarized here.</Empty>}</Card>
        <Card><div className="rowBetween"><b>Fleet status</b><strong>{fleetPercent}% busy</strong></div><div className="fleetMeter"><i style={{width:fleetPercent+"%"}}/></div><div className="rateRow"><span>Busy machines</span><b>{fleetBusy}</b></div><div className="rateRow"><span>Available</span><b>{data.machines.filter(m=>m.status==="free").length}</b></div><div className="rateRow"><span>Maintenance</span><b>{data.machines.filter(m=>m.status==="maintenance").length}</b></div></Card>
      </>}
      {tab==="team"&&isAdmin&&<><div className="sectionTitle"><h2>Team & attendance</h2><span>{data.users.length} accounts</span></div>{data.users.map(u=>{const userLogs=data.logs.filter(l=>l.bookings?.driver_id===u.id&&l.start_at?.slice(0,7)===month);const days=new Set(userLogs.map(l=>l.start_at.slice(0,10))).size;return <Card key={u.id}><div className="rowBetween"><b>{u.name||"New user"}</b><span className="muted">{u.phone}</span></div><SelectField label="Role" value={u.role} disabled={u.id===me.id} onChange={e=>updateRole(u,e.target.value)}><option value="customer">Customer</option><option value="driver">Driver</option><option value="admin">Admin</option></SelectField>{u.role==="driver"&&<><Field label="Daily wage (₹)" type="number" min="0" defaultValue={u.daily_wage} onBlur={e=>Number(e.target.value)!==u.daily_wage&&updateWage(u,e.target.value)}/><div className="statsGrid"><Stat label="Attendance days" value={days}/><Stat label="Working hours" value={totalHours(userLogs).toFixed(1)}/><Stat label="Salary estimate" value={money(days*(u.daily_wage||0))}/></div></>}</Card>})}</>}
      {compareOpen&&<div className="overlay compareOverlay" onClick={()=>setCompareOpen(false)}><motion.div className="sheet compareSheet" initial={{y:"100%"}} animate={{y:0}} exit={{y:"100%"}} onClick={e=>e.stopPropagation()}><div className="sheetHandle"/><div className="rowBetween"><div><div className="eyebrow">SIDE-BY-SIDE</div><h2>Compare machines</h2></div><button className="textButton" onClick={()=>setCompareOpen(false)}>Close</button></div><div className="compareGrid">{compareMachines.map(m=><div className="compareColumn" key={m.id}><div className="compareMachineIcon"><MachineIllustration compact/></div><b>{m.model}</b><Badge value={m.status}/><div className="compareMetric"><small>Hourly</small><strong>{money(m.hourly_rate)}</strong></div><div className="compareMetric"><small>Daily</small><strong>{money(m.daily_rate||m.hourly_rate*8)}</strong></div><div className="compareMetric"><small>Monthly · diesel</small><strong>{money(m.monthly_diesel)}</strong></div><div className="compareMetric"><small>Monthly · no diesel</small><strong>{money(m.monthly_no_diesel)}</strong></div><Button small disabled={m.status!=="free"} onClick={()=>{setBookingType("monthly");setBookingStep(1);setForm(f=>({...f,machine_id:m.id}));setCompareOpen(false);setBookingOpen(true);}}>Select machine</Button></div>)}</div></motion.div></div>}
    </section>
    <nav className="bottomNav" aria-label="Main navigation">{tabs.map(([key,icon,label])=><button key={key} type="button" aria-current={tab===key?"page":undefined} aria-label={label} className={tab===key?"active":""} onClick={()=>{tapFeedback();setTab(key);}}><span aria-hidden="true">{icon}</span><small>{label}</small></button>)}</nav>
    <Toasts items={toasts}/>

    <AnimatePresence>{noticeOpen&&<div className="overlay" onClick={()=>setNoticeOpen(false)}><motion.div className="sheet" initial={{y:"100%"}} animate={{y:0}} exit={{y:"100%"}} onClick={e=>e.stopPropagation()}><div className="sheetHandle"/><div className="rowBetween"><h2>Notifications</h2><button className="textButton" onClick={()=>setNoticeOpen(false)}>Close</button></div>{notifications.length===0?<Empty icon="🔕" title="All quiet">New booking and payment updates will show here.</Empty>:notifications.map(n=><div className={"notice "+(n.read?"read":"")} key={n.id}><b>{n.title}</b><p>{n.body}</p><small>{new Date(n.created_at).toLocaleString("en-IN")}</small></div>)}</motion.div></div>}</AnimatePresence>
    <AnimatePresence>{bookingOpen&&<div className="overlay" onClick={()=>setBookingOpen(false)}><motion.div className="sheet" initial={{y:"100%"}} animate={{y:0}} exit={{y:"100%"}} onClick={e=>e.stopPropagation()}><div className="sheetHandle"/><div className="rowBetween"><h2>{bookingType==="monthly"?"Monthly plan":bookingType==="daily"?"Daily booking":"Hourly booking"}</h2><button className="textButton" onClick={()=>setBookingOpen(false)}>Close</button></div><div className="stepDots"><i className={bookingStep>=1?"on":""}/><i className={bookingStep>=2?"on":""}/><i className={bookingStep>=3?"on":""}/></div>
      {bookingStep===1&&<><SelectField label="Choose available machine" value={form.machine_id} onChange={e=>updateForm("machine_id",e.target.value)}><option value="">Select machine</option>{data.machines.filter(m=>m.status==="free").map(m=><option key={m.id} value={m.id}>{m.model} · {money(m.hourly_rate)}/hr</option>)}</SelectField>{currentMachine&&<div className="rateRow"><span>Selected machine</span><b>{currentMachine.model}</b></div>}</>}
      {bookingStep===2&&<><Field label="Work site address" placeholder="Full address / village / landmark" value={form.site_address} onChange={e=>updateForm("site_address",e.target.value)}/>{savedSites.length>0&&<div className="savedSites"><small>YOUR SAVED SITES</small><div>{savedSites.map(site=><button type="button" key={site} className={form.site_address===site?"active":""} onClick={()=>updateForm("site_address",site)}>{site}</button>)}</div></div>}<div className="siteSaveRow"><span>Save frequently used locations on this device</span><button type="button" onClick={saveCurrentSite}>＋ Save site</button></div><SelectField label="Type of work" value={form.work_type} onChange={e=>updateForm("work_type",e.target.value)}>{WORK_TYPES.map(w=><option key={w}>{w}</option>)}</SelectField><Field label="Start date" type="date" value={form.start_date} onChange={e=>updateForm("start_date",e.target.value)}/></>}
      {bookingStep===3&&<><Card className="reviewCard"><div className="rowBetween"><b>{currentMachine?.model}</b><Badge value="free"/></div><p className="muted">📍 {form.site_address}</p><p className="muted">{form.work_type} · Starts {form.start_date}</p></Card>{bookingType==="monthly"?<><Field label="Number of months" type="number" min="1" max="36" value={form.months} onChange={e=>updateForm("months",e.target.value)}/><div className="segmented"><button className={form.with_diesel?"on":""} onClick={()=>updateForm("with_diesel",true)}>With diesel</button><button className={!form.with_diesel?"on":""} onClick={()=>updateForm("with_diesel",false)}>Without diesel</button></div></>:bookingType==="daily"?<Field label="Number of days" type="number" min="1" value={form.duration_days} onChange={e=>updateForm("duration_days",e.target.value)}/>:<Field label="Estimated hours" type="number" min="1" step=".5" value={form.duration_hours} onChange={e=>updateForm("duration_hours",e.target.value)}/>}<div className="estimate"><span>Estimated rental (before GST)</span><b>{money(estimate)}</b><small>Final invoice is calculated from approved rates and logged work.</small></div></>}
      <div className="buttonRow">{bookingStep>1&&<Button variant="secondary" onClick={()=>setBookingStep(s=>s-1)}>← Back</Button>}{bookingStep<3?<Button onClick={advanceBooking}>Continue →</Button>:<Button onClick={createBooking}>Send booking request →</Button>}</div></motion.div></div>}</AnimatePresence>
    <AnimatePresence>{selected&&<div className="overlay" onClick={()=>setSelected(null)}><motion.div className="sheet" initial={{y:"100%"}} animate={{y:0}} exit={{y:"100%"}} onClick={e=>e.stopPropagation()}><div className="sheetHandle"/><div className="rowBetween"><h2>Logbook & bill</h2><button className="textButton" onClick={()=>setSelected(null)}>Close</button></div><Card><div className="rowBetween"><b>{selected.machines?.model}</b><Badge value={selected.status}/></div>{bookingLogs(selected.id).map(l=><div className="rateRow" key={l.id}><span>{new Date(l.start_at).toLocaleDateString("en-IN")} · {new Date(l.start_at).toLocaleTimeString("en-IN")}</span><b>{hoursBetween(l).toFixed(2)} h</b></div>)}</Card><Card>{[["Total hours",billFor(selected).hours.toFixed(2)],["Rental",money(billFor(selected).base)],["GST estimate (18%)",money(billFor(selected).tax)],["Total",money(billFor(selected).total)],["Submitted payments",money(allSubmitted(selected.id))],["Verified paid",money(verifiedPaid(selected.id))],["Balance",money(Math.max(0,billFor(selected).total-allSubmitted(selected.id)))]].map(([l,v])=><div className="rateRow" key={l}><span>{l}</span><b>{v}</b></div>)}</Card>{Math.max(0,billFor(selected).total-allSubmitted(selected.id))>0&&<><h3>Submit payment</h3>{["UPI","Bank","Cash"].map(m=><Button key={m} variant="secondary" onClick={()=>payBalance(selected,m)}>Pay / record via {m}</Button>)}</>}<Button onClick={()=>printInvoice(selected)}>Print / save invoice PDF ↓</Button></motion.div></div>}</AnimatePresence>
    <AnimatePresence>{machineOpen&&<div className="overlay" onClick={()=>setMachineOpen(false)}><motion.div className="sheet" initial={{y:"100%"}} animate={{y:0}} exit={{y:"100%"}} onClick={e=>e.stopPropagation()}><div className="sheetHandle"/><h2>Add machine</h2>{[["model","Machine model"],["reg_no","Registration number"],["hourly_rate","Hourly rate ₹"],["daily_rate","Daily rate ₹"],["monthly_diesel","Monthly with diesel ₹"],["monthly_no_diesel","Monthly without diesel ₹"]].map(([k,l])=><Field key={k} label={l} type={k.includes("rate")||k.includes("monthly")?"number":"text"} value={machineForm[k]} onChange={e=>setMachineForm(f=>({...f,[k]:e.target.value}))}/>)}<Button onClick={addMachine}>Save machine</Button></motion.div></div>}</AnimatePresence>
    <AnimatePresence>{expenseOpen&&<div className="overlay" onClick={()=>setExpenseOpen(null)}><motion.div className="sheet" initial={{y:"100%"}} animate={{y:0}} exit={{y:"100%"}} onClick={e=>e.stopPropagation()}><div className="sheetHandle"/><h2>Fuel / repair record</h2><div className="segmented"><button className={expenseForm.kind==="diesel"?"on":""} onClick={()=>setExpenseForm(f=>({...f,kind:"diesel"}))}>⛽ Diesel</button><button className={expenseForm.kind==="repair"?"on":""} onClick={()=>setExpenseForm(f=>({...f,kind:"repair"}))}>🔧 Repair</button></div>{expenseForm.kind==="diesel"&&<Field label="Litres" type="number" min="0" value={expenseForm.litres} onChange={e=>setExpenseForm(f=>({...f,litres:e.target.value}))}/>}<Field label="Amount (₹)" type="number" min="1" value={expenseForm.amount} onChange={e=>setExpenseForm(f=>({...f,amount:e.target.value}))}/><Field label="Notes (optional)" value={expenseForm.notes} onChange={e=>setExpenseForm(f=>({...f,notes:e.target.value}))}/><label className="uploadBox">📷 Add photo proof<input type="file" accept="image/*" capture="environment" onChange={e=>setProof(e.target.files?.[0]||null)}/><small>{proof?.name||"Camera or gallery · required"}</small></label><Button disabled={savingProof} onClick={saveExpense}>{savingProof?"Uploading…":"Save expense with proof"}</Button></motion.div></div>}</AnimatePresence>
  </main>;
}
