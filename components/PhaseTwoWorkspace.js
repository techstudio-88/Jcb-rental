"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

function Panel({ title, subtitle, children, action }) {
  return <section className="card phase2Panel"><div className="sectionTitle"><div><h2>{title}</h2>{subtitle && <p className="muted">{subtitle}</p>}</div>{action}</div>{children}</section>;
}
function EmptyState({ children }) { return <div className="emptyBox"><b>{children}</b></div>; }
function TextField({ label, ...props }) { return <label className="field"><span>{label}</span><input {...props}/></label>; }
function SelectField({ label, children, ...props }) { return <label className="field"><span>{label}</span><select {...props}>{children}</select></label>; }

export default function PhaseTwoWorkspace({ tab, me, say, data, refresh, onNavigate }) {
  const [tickets, setTickets] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeTicket, setActiveTicket] = useState(null);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketCategory, setTicketCategory] = useState("general");
  const [message, setMessage] = useState("");
  const [reviews, setReviews] = useState([]);
  const [reviewBooking, setReviewBooking] = useState("");
  const [rating, setRating] = useState("5");
  const [reviewText, setReviewText] = useState("");
  const [changeBooking, setChangeBooking] = useState("");
  const [changeSite, setChangeSite] = useState("");
  const [changeDate, setChangeDate] = useState("");
  const [changeWork, setChangeWork] = useState("");
  const [changes, setChanges] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [breaks, setBreaks] = useState([]);
  const [incentives, setIncentives] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [referralPhone, setReferralPhone] = useState("");
  const [couponBooking, setCouponBooking] = useState("");
  const [selectedCoupon, setSelectedCoupon] = useState("");
  const [newCoupon, setNewCoupon] = useState({ code: "", description: "", discount_type: "percent", discount_value: "10", expires_at: "" });
  const [newMaintenance, setNewMaintenance] = useState({ machine_id: "", maintenance_type: "service", description: "", due_date: "", cost: "0" });
  const [newExpense, setNewExpense] = useState({ machine_id: "", category: "repair", amount: "", notes: "" });
  const [newIncentive, setNewIncentive] = useState({ driver_id: "", amount: "", reason: "" });
  const [loading, setLoading] = useState(false);

  const isAdmin = me?.role === "admin";
  const isDriver = me?.role === "driver";
  const myBookings = (data?.bookings || []).filter(b => b.customer_id === me?.id);
  const completedBookings = myBookings.filter(b => b.status === "done");

  const loadSupport = useCallback(async () => {
    if (!me?.id) return;
    const { data: rows, error } = await supabase.from("support_tickets").select("*").order("updated_at", { ascending: false });
    if (error) return say(error.message, "error");
    setTickets(rows || []);
  }, [me?.id, say]);

  const loadWorkspace = useCallback(async () => {
    if (!me?.id) return;
    setLoading(true);
    try {
      if (tab === "support") await loadSupport();
      if (tab === "reviews") {
        const { data: rows, error } = await supabase.from("booking_reviews").select("*,machines(model),profiles(name,phone)").order("created_at", { ascending: false });
        if (error) throw error;
        setReviews(rows || []);
      }
      if (tab === "changes") {
        const { data: rows, error } = await supabase.from("booking_change_requests").select("*,bookings(site_address,start_date,status)").order("created_at", { ascending: false });
        if (error) throw error;
        setChanges(rows || []);
      }
      if (tab === "rewards" || tab === "offers") {
        const [c, r] = await Promise.all([
          supabase.from("coupons").select("*").eq("is_active", true).order("expires_at"),
          supabase.from("referrals").select("*").order("created_at", { ascending: false })
        ]);
        if (c.error) throw c.error;
        if (r.error) throw r.error;
        setCoupons(c.data || []); setReferrals(r.data || []);
      }
      if (tab === "attendance") {
        const [a, b, i] = await Promise.all([
          supabase.from("driver_attendance").select("*").gte("attendance_date", monthStart()).order("attendance_date", { ascending: false }),
          supabase.from("operator_breaks").select("*").order("started_at", { ascending: false }).limit(40),
          supabase.from("operator_incentives").select("*").order("period_month", { ascending: false })
        ]);
        if (a.error) throw a.error; if (b.error) throw b.error; if (i.error) throw i.error;
        setAttendance(a.data || []); setBreaks(b.data || []); setIncentives(i.data || []);
      }
      if (tab === "service") {
        const [m, e] = await Promise.all([
          supabase.from("machine_maintenance").select("*,machines(model)").order("due_date"),
          supabase.from("machine_expenses").select("*,machines(model)").order("expense_date", { ascending: false }).limit(100)
        ]);
        if (m.error) throw m.error; if (e.error) throw e.error;
        setMaintenance(m.data || []); setExpenses(e.data || []);
      }
      if (tab === "payroll") {
        const [a, i] = await Promise.all([
          supabase.from("driver_attendance").select("*,profiles(name,phone,daily_wage)").gte("attendance_date", monthStart()).order("attendance_date", { ascending: false }),
          supabase.from("operator_incentives").select("*,profiles(name,phone)").order("period_month", { ascending: false })
        ]);
        if (a.error) throw a.error; if (i.error) throw i.error;
        setAttendance(a.data || []); setIncentives(i.data || []);
      }
    } catch (error) {
      say(error.message || "Could not load this section.", "error");
    } finally { setLoading(false); }
  }, [tab, me?.id, say, loadSupport]);

  useEffect(() => { loadWorkspace(); }, [loadWorkspace]);

  useEffect(() => {
    if (tab !== "support" || !activeTicket?.id) { setMessages([]); return; }
    let alive = true;
    const load = async () => {
      const { data: rows, error } = await supabase.from("support_messages").select("*,profiles(name,role)").eq("ticket_id", activeTicket.id).order("created_at");
      if (!error && alive) setMessages(rows || []);
      if (error && alive) say(error.message, "error");
    };
    load();
    const channel = supabase.channel("support-" + activeTicket.id).on("postgres_changes", { event: "*", schema: "public", table: "support_messages", filter: "ticket_id=eq." + activeTicket.id }, load).subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [tab, activeTicket?.id, say]);

  const reviewChange = async (row, approve) => {
    if (!isAdmin) return;
    if (approve) {
      const bookingUpdate = await supabase.from("bookings").update(row.requested_changes).eq("id", row.booking_id);
      if (bookingUpdate.error) return say(bookingUpdate.error.message, "error");
    }
    const { error } = await supabase.from("booking_change_requests").update({ status: approve ? "approved" : "rejected", reviewed_by: me.id, reviewed_at: new Date().toISOString() }).eq("id", row.id);
    if (error) return say(error.message, "error");
    say(approve ? "Booking change approved and applied." : "Change request rejected."); loadWorkspace(); refresh?.();
  };

  const createTicket = async () => {
    if (ticketSubject.trim().length < 4) return say("Add a short subject (at least 4 characters).", "error");
    const { data: row, error } = await supabase.from("support_tickets").insert({ user_id: me.id, subject: ticketSubject.trim(), category: ticketCategory }).select().single();
    if (error) return say(error.message, "error");
    const first = await supabase.from("support_messages").insert({ ticket_id: row.id, sender_id: me.id, message: ticketSubject.trim() });
    if (first.error) return say(first.error.message, "error");
    setTicketSubject(""); setActiveTicket(row); say("Support ticket created.", "success"); loadSupport();
  };
  const sendMessage = async () => {
    if (!activeTicket || !message.trim()) return;
    const { error } = await supabase.from("support_messages").insert({ ticket_id: activeTicket.id, sender_id: me.id, message: message.trim() });
    if (error) return say(error.message, "error");
    setMessage("");
  };
  const updateTicket = async (status) => {
    if (!activeTicket || !isAdmin) return;
    const { error } = await supabase.from("support_tickets").update({ status }).eq("id", activeTicket.id);
    if (error) return say(error.message, "error");
    setActiveTicket({ ...activeTicket, status }); loadSupport(); say("Ticket status updated.");
  };

  const moderateReview = async (row, visible) => {
    const { error } = await supabase.from("booking_reviews").update({ is_visible: visible }).eq("id", row.id);
    if (error) return say(error.message, "error");
    say(visible ? "Review published." : "Review hidden."); loadWorkspace();
  };
  const submitReview = async () => {
    const booking = completedBookings.find(b => b.id === reviewBooking);
    if (!booking) return say("Choose one of your completed bookings.", "error");
    const { error } = await supabase.from("booking_reviews").insert({ booking_id: booking.id, customer_id: me.id, machine_id: booking.machine_id, rating: Number(rating), comment: reviewText.trim() || null });
    if (error) return say(error.message, "error");
    setReviewBooking(""); setReviewText(""); say("Thanks — your review was submitted for owner moderation.", "success"); loadWorkspace();
  };
  const requestChange = async () => {
    const booking = myBookings.find(b => b.id === changeBooking && ["pending", "confirmed"].includes(b.status));
    if (!booking) return say("Choose a pending or confirmed booking.", "error");
    const requested_changes = {};
    if (changeSite.trim() && changeSite.trim() !== booking.site_address) requested_changes.site_address = changeSite.trim();
    if (changeDate && changeDate !== booking.start_date) requested_changes.start_date = changeDate;
    if (changeWork.trim() && changeWork.trim() !== booking.work_type) requested_changes.work_type = changeWork.trim();
    if (!Object.keys(requested_changes).length) return say("Enter at least one change.", "error");
    const { error } = await supabase.from("booking_change_requests").insert({ booking_id: booking.id, customer_id: me.id, requested_changes, reason: "Customer requested booking update" });
    if (error) return say(error.message, "error");
    setChangeBooking(""); setChangeSite(""); setChangeDate(""); setChangeWork(""); say("Change request sent to the owner.", "success"); loadWorkspace();
  };

  const checkIn = async () => {
    const { error } = await supabase.from("driver_attendance").upsert({ driver_id: me.id, attendance_date: today(), status: "present", check_in: new Date().toISOString(), marked_by: null }, { onConflict: "driver_id,attendance_date" });
    if (error) return say(error.message, "error");
    say("Attendance checked in.", "success"); loadWorkspace();
  };
  const checkOut = async (row) => {
    const { error } = await supabase.from("driver_attendance").update({ check_out: new Date().toISOString() }).eq("id", row.id).eq("driver_id", me.id);
    if (error) return say(error.message, "error");
    say("Attendance checked out.", "success"); loadWorkspace();
  };
  const startBreak = async () => {
    const job = (data?.bookings || []).find(b => b.driver_id === me.id && b.status === "active");
    if (!job) return say("A break can only be started during an active duty.", "error");
    if (breaks.some(b => b.driver_id === me.id && !b.ended_at)) return say("End your current break first.", "error");
    const { error } = await supabase.from("operator_breaks").insert({ booking_id: job.id, driver_id: me.id, reason: "Operator break" });
    if (error) return say(error.message, "error");
    say("Break started."); loadWorkspace();
  };
  const endBreak = async (row) => {
    const { error } = await supabase.from("operator_breaks").update({ ended_at: new Date().toISOString() }).eq("id", row.id).eq("driver_id", me.id);
    if (error) return say(error.message, "error");
    say("Break ended."); loadWorkspace();
  };

  const saveMaintenance = async () => {
    if (!newMaintenance.machine_id || newMaintenance.description.trim().length < 3) return say("Select a machine and enter maintenance details.", "error");
    const { error } = await supabase.from("machine_maintenance").insert({ ...newMaintenance, cost: Number(newMaintenance.cost) || 0, due_date: newMaintenance.due_date || null, created_by: me.id });
    if (error) return say(error.message, "error");
    setNewMaintenance({ machine_id: "", maintenance_type: "service", description: "", due_date: "", cost: "0" }); say("Maintenance scheduled.", "success"); loadWorkspace();
  };
  const completeMaintenance = async (row) => {
    const { error } = await supabase.from("machine_maintenance").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", row.id);
    if (error) return say(error.message, "error");
    say("Maintenance marked completed."); loadWorkspace();
  };
  const saveExpense = async () => {
    if (!newExpense.machine_id || Number(newExpense.amount) <= 0) return say("Select a machine and enter a valid expense.", "error");
    const { error } = await supabase.from("machine_expenses").insert({ ...newExpense, amount: Number(newExpense.amount), created_by: me.id });
    if (error) return say(error.message, "error");
    setNewExpense({ machine_id: "", category: "repair", amount: "", notes: "" }); say("Expense saved.", "success"); loadWorkspace(); refresh?.();
  };
  const saveIncentive = async () => {
    if (!newIncentive.driver_id || Number(newIncentive.amount) <= 0 || newIncentive.reason.trim().length < 2) return say("Select an operator and enter the incentive details.", "error");
    const { error } = await supabase.from("operator_incentives").insert({ ...newIncentive, amount: Number(newIncentive.amount), period_month: monthStart(), created_by: me.id });
    if (error) return say(error.message, "error");
    setNewIncentive({ driver_id: "", amount: "", reason: "" }); say("Operator incentive added.", "success"); loadWorkspace();
  };
  const markAttendance = async (driverId, status) => {
    const { error } = await supabase.from("driver_attendance").upsert({ driver_id: driverId, attendance_date: today(), status, marked_by: me.id }, { onConflict: "driver_id,attendance_date" });
    if (error) return say(error.message, "error");
    say("Attendance updated."); loadWorkspace();
  };
  const createCoupon = async () => {
    const code = newCoupon.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    if (code.length < 4 || Number(newCoupon.discount_value) <= 0) return say("Enter a valid coupon code and discount.", "error");
    const { error } = await supabase.from("coupons").insert({ ...newCoupon, code, discount_value: Number(newCoupon.discount_value), expires_at: newCoupon.expires_at || null, created_by: me.id });
    if (error) return say(error.message, "error");
    setNewCoupon({ code: "", description: "", discount_type: "percent", discount_value: "10", expires_at: "" }); say("Coupon published.", "success"); loadWorkspace();
  };
  const applyCoupon = async () => {
    const booking = myBookings.find(b => b.id === couponBooking && b.status === "pending");
    const coupon = coupons.find(c => c.id === selectedCoupon);
    if (!booking || !coupon) return say("Choose a pending booking and an active coupon.", "error");
    const base = Number(booking.quoted_rate || 0);
    if (base < Number(coupon.minimum_booking_amount || 0)) return say("This booking does not meet the coupon minimum.", "error");
    let discount = coupon.discount_type === "percent" ? Math.round(base * Number(coupon.discount_value) / 100) : Number(coupon.discount_value);
    if (coupon.maximum_discount) discount = Math.min(discount, Number(coupon.maximum_discount));
    discount = Math.max(0, Math.min(base, discount));
    if (!discount) return say("This coupon does not apply to this booking.", "error");
    const { error } = await supabase.from("coupon_redemptions").insert({ coupon_id: coupon.id, user_id: me.id, booking_id: booking.id, discount_amount: discount });
    if (error) return say(error.message, "error");
    say("Coupon applied. Your booking bill has been updated.", "success"); setCouponBooking(""); setSelectedCoupon(""); refresh?.();
  };
  const updateReferral = async (row, status) => {
    if (!isAdmin) return;
    const { error } = await supabase.from("referrals").update({ status, qualified_at: status === "qualified" ? new Date().toISOString() : row.qualified_at, rewarded_at: status === "rewarded" ? new Date().toISOString() : row.rewarded_at }).eq("id", row.id);
    if (error) return say(error.message, "error");
    say("Referral status updated."); loadWorkspace();
  };
  const createReferral = async () => {
    if (!/^\+?\d{10,13}$/.test(referralPhone.replace(/[\s-]/g, ""))) return say("Enter a valid phone number with country code if needed.", "error");
    const referral_code = "JCB-" + me.id.replace(/-/g, "").slice(0, 8).toUpperCase();
    const { error } = await supabase.from("referrals").insert({ referrer_id: me.id, referred_phone: referralPhone.trim(), referral_code });
    if (error) return say(error.message, "error");
    setReferralPhone(""); say("Referral invitation recorded. Share your code with the customer.", "success"); loadWorkspace();
  };

  if (tab === "more") return <div className="phase2MoreGrid">{(isAdmin ? [["support","Help desk","Review and reply to customer tickets"],["changes","Booking changes","Approve or reject customer change requests"],["reviews","Reviews","Moderate customer feedback"],["service","Maintenance","Plan servicing and machine expenses"],["payroll","Payroll & incentives","Attendance register and operator incentives"],["offers","Coupons & referrals","Publish offers and manage referrals"]] : [["changes","Booking changes","Request a change to a pending or confirmed booking"],["reviews","Reviews","Rate completed rentals"],["rewards","Offers & referrals","View coupons and invite customers"],["support","Help & support","Create a ticket and contact the owner"]]).map(([key,title,desc])=><button className="phase2MoreCard" key={key} onClick={()=>onNavigate?.(key)}><b>{title}</b><span>{desc}</span><i>Open →</i></button>)}</div>;

  if (tab === "support") return <div className="phase2Grid">
    <Panel title={isAdmin ? "Customer support inbox" : "Help & support"} subtitle="Tickets and replies are stored securely and update live.">
      {!isAdmin && <><TextField label="What do you need help with?" placeholder="e.g. Booking confirmation" value={ticketSubject} onChange={e=>setTicketSubject(e.target.value)}/><SelectField label="Category" value={ticketCategory} onChange={e=>setTicketCategory(e.target.value)}><option value="general">General</option><option value="booking">Booking</option><option value="payment">Payment</option><option value="machine">Machine</option><option value="account">Account</option></SelectField><button className="btn" onClick={createTicket}>Create support ticket</button></>}
      {loading ? <EmptyState>Loading tickets…</EmptyState> : tickets.length===0 ? <EmptyState>No support tickets yet.</EmptyState> : tickets.map(t=><button key={t.id} className={"phase2ListButton "+(activeTicket?.id===t.id?"active":"")} onClick={()=>setActiveTicket(t)}><span><b>{t.subject}</b><small>{t.category} · {new Date(t.updated_at).toLocaleDateString("en-IN")}</small></span><em className={"phase2Status "+t.status}>{t.status.replace("_"," ")}</em></button>)}
    </Panel>
    <Panel title={activeTicket?.subject || "Ticket conversation"} subtitle={activeTicket ? "Reply to keep the conversation in one place." : "Choose a ticket to view messages."}>
      {activeTicket ? <><div className="phase2Messages">{messages.map(m=><div className={"phase2Message "+(m.sender_id===me.id?"mine":"")} key={m.id}><b>{m.profiles?.name || (m.sender_id===me.id?"You":"Support team")}</b><p>{m.message}</p><small>{new Date(m.created_at).toLocaleString("en-IN")}</small></div>)}</div><textarea className="input" rows={3} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Write a reply…"/><button className="btn" onClick={sendMessage}>Send reply</button>{isAdmin&&<div className="buttonRow"><button className="btn secondary" onClick={()=>updateTicket("in_progress")}>Mark in progress</button><button className="btn secondary" onClick={()=>updateTicket("resolved")}>Resolve ticket</button><button className="btn secondary" onClick={()=>updateTicket("closed")}>Close</button></div>}</> : <EmptyState>Select a ticket to start.</EmptyState>}
    </Panel>
  </div>;

  if (tab === "reviews" && isAdmin) return <Panel title="Review moderation" subtitle="Publish customer feedback after checking it.">{reviews.map(r=><article className="phase2Row" key={r.id}><div><b>{r.machines?.model || "Machine"} · {"★".repeat(r.rating)}</b><small>{r.profiles?.name || r.profiles?.phone || "Customer"} · {new Date(r.created_at).toLocaleDateString("en-IN")}</small><p>{r.comment || "No written feedback."}</p></div>{r.is_visible?<button className="btn secondary" onClick={()=>moderateReview(r,false)}>Hide</button>:<button className="btn" onClick={()=>moderateReview(r,true)}>Publish</button>}</article>)}{reviews.length===0&&<EmptyState>No customer reviews submitted yet.</EmptyState>}</Panel>;

  if (tab === "reviews") return <div className="phase2Grid">
    <Panel title="Rate your completed rental" subtitle="One verified review per completed booking. Reviews are published after owner moderation.">
      <SelectField label="Completed booking" value={reviewBooking} onChange={e=>setReviewBooking(e.target.value)}><option value="">Choose a booking</option>{completedBookings.filter(b=>!reviews.some(r=>r.booking_id===b.id)).map(b=><option key={b.id} value={b.id}>{b.machines?.model || "Machine"} · {b.start_date}</option>)}</SelectField>
      <SelectField label="Rating" value={rating} onChange={e=>setRating(e.target.value)}>{[5,4,3,2,1].map(n=><option key={n} value={n}>{"★".repeat(n)} ({n}/5)</option>)}</SelectField>
      <label className="field"><span>Your feedback</span><textarea className="input" rows={4} value={reviewText} onChange={e=>setReviewText(e.target.value)} placeholder="Share your experience (optional)"/></label>
      <button className="btn" onClick={submitReview} disabled={!reviewBooking}>Submit review</button>
    </Panel>
    <Panel title="Your reviews"><div className="phase2Rows">{reviews.map(r=><article className="phase2Row" key={r.id}><div><b>{r.machines?.model || "Rental"} · {"★".repeat(r.rating)}</b><p>{r.comment || "No written comment."}</p><small>{new Date(r.created_at).toLocaleDateString("en-IN")} · {r.is_visible?"Published":"Awaiting moderation"}</small></div></article>)}</div>{reviews.length===0&&<EmptyState>You haven't reviewed a booking yet.</EmptyState>}</Panel>
  </div>;

  if (tab === "changes" && isAdmin) return <Panel title="Review booking change requests" subtitle="Approved changes are applied to the booking record.">{changes.map(c=><article className="phase2Row" key={c.id}><div><b>{c.bookings?.site_address || "Booking update"}</b><small>{c.bookings?.start_date} · {JSON.stringify(c.requested_changes)}</small><em className={"phase2Status "+c.status}>{c.status}</em></div>{c.status==="pending"&&<div className="buttonRow"><button className="btn" onClick={()=>reviewChange(c,true)}>Approve</button><button className="btn secondary" onClick={()=>reviewChange(c,false)}>Reject</button></div>}</article>)}{changes.length===0&&<EmptyState>No change requests waiting for review.</EmptyState>}</Panel>;

  if (tab === "changes") return <div className="phase2Grid">
    <Panel title="Request a booking change" subtitle="The owner reviews changes before they are applied.">
      <SelectField label="Booking" value={changeBooking} onChange={e=>setChangeBooking(e.target.value)}><option value="">Select booking</option>{myBookings.filter(b=>["pending","confirmed"].includes(b.status)).map(b=><option key={b.id} value={b.id}>{b.machines?.model} · {b.start_date} · {b.status}</option>)}</SelectField>
      <TextField label="New site address (optional)" value={changeSite} onChange={e=>setChangeSite(e.target.value)} placeholder="Updated work-site address"/>
      <TextField label="New start date (optional)" type="date" min={today()} value={changeDate} onChange={e=>setChangeDate(e.target.value)}/>
      <TextField label="New work type (optional)" value={changeWork} onChange={e=>setChangeWork(e.target.value)} placeholder="Digging, road work…"/>
      <button className="btn" onClick={requestChange}>Send change request</button>
    </Panel>
    <Panel title="Change request history">{changes.map(c=><article className="phase2Row" key={c.id}><div><b>{c.bookings?.site_address || "Booking update"}</b><p>{JSON.stringify(c.requested_changes)}</p><small>{new Date(c.created_at).toLocaleString("en-IN")}</small></div><em className={"phase2Status "+c.status}>{c.status}</em></article>)}{changes.length===0&&<EmptyState>No change requests yet.</EmptyState>}</Panel>
  </div>;

  if (tab === "rewards") return <div className="phase2Grid">
    <Panel title="Referral programme" subtitle="Invite another customer. Referral rewards are recorded and verified by the owner.">
      <div className="phase2ReferralCode"><small>YOUR REFERRAL CODE</small><b>JCB-{me.id.replace(/-/g,"").slice(0,8).toUpperCase()}</b><button className="btn secondary" onClick={()=>navigator.clipboard?.writeText("JCB-"+me.id.replace(/-/g,"").slice(0,8).toUpperCase())}>Copy referral code</button></div>
      <TextField label="Friend's mobile number" value={referralPhone} onChange={e=>setReferralPhone(e.target.value)} placeholder="+91 98765 43210" inputMode="tel"/>
      <button className="btn" onClick={createReferral}>Record referral invitation</button>
      {referrals.map(r=><article className="phase2Row" key={r.id}><div><b>{r.referred_phone}</b><small>{r.referral_code} · {new Date(r.created_at).toLocaleDateString("en-IN")}</small></div><em className={"phase2Status "+r.status}>{r.status}</em></article>)}
    </Panel>
    <Panel title="Available offers" subtitle="Apply an active coupon to one of your pending bookings."><SelectField label="Pending booking" value={couponBooking} onChange={e=>setCouponBooking(e.target.value)}><option value="">Choose booking</option>{myBookings.filter(b=>b.status==="pending").map(b=><option key={b.id} value={b.id}>{b.machines?.model} · {b.start_date}</option>)}</SelectField><SelectField label="Coupon" value={selectedCoupon} onChange={e=>setSelectedCoupon(e.target.value)}><option value="">Choose coupon</option>{coupons.map(c=><option key={c.id} value={c.id}>{c.code} · {c.discount_type==="percent"?c.discount_value+"%":money(c.discount_value)} off</option>)}</SelectField><button className="btn" onClick={applyCoupon} disabled={!couponBooking||!selectedCoupon}>Apply coupon to booking</button>
      {coupons.length===0?<EmptyState>No active coupons at the moment.</EmptyState>:coupons.map(c=><article className="phase2Coupon" key={c.id}><div><b>{c.code}</b><small>{c.description || "JCB Rental offer"} · Expires {c.expires_at?new Date(c.expires_at).toLocaleDateString("en-IN"):"No expiry"}</small></div><strong>{c.discount_type==="percent"?c.discount_value+"%":money(c.discount_value)} OFF</strong></article>)}
    </Panel>
  </div>;

  if (tab === "attendance") {
    const todayRow = attendance.find(a=>a.driver_id===me.id&&a.attendance_date===today());
    const openBreak = breaks.find(b=>b.driver_id===me.id&&!b.ended_at);
    const monthHours = (data?.logs || []).filter(l=>l.bookings?.driver_id===me.id&&l.start_at>=monthStart()).reduce((sum,l)=>sum+Math.max(0,((l.end_at?new Date(l.end_at):new Date())-new Date(l.start_at))/3600000),0);
    const earned = incentives.filter(i=>i.driver_id===me.id).reduce((s,i)=>s+Number(i.amount),0);
    return <div className="phase2Grid">
      <Panel title="Attendance" subtitle={"Today · "+today()}><div className="phase2Metric"><b>{todayRow?.check_in?new Date(todayRow.check_in).toLocaleTimeString("en-IN"):"—"}</b><small>Check-in</small></div><div className="phase2Metric"><b>{todayRow?.check_out?new Date(todayRow.check_out).toLocaleTimeString("en-IN"):"—"}</b><small>Check-out</small></div>{!todayRow?.check_in?<button className="btn" onClick={checkIn}>Check in</button>:!todayRow.check_out?<button className="btn" onClick={()=>checkOut(todayRow)}>Check out</button>:<em className="phase2Status present">Attendance completed</em>}</Panel>
      <Panel title="Duty breaks" subtitle="Breaks are linked to your active assigned job.">{openBreak?<><p>Break started at {new Date(openBreak.started_at).toLocaleTimeString("en-IN")}</p><button className="btn" onClick={()=>endBreak(openBreak)}>End break</button></>:<button className="btn" onClick={startBreak}>Start break</button>}{breaks.filter(b=>b.driver_id===me.id).slice(0,8).map(b=><article className="phase2Row" key={b.id}><div><b>{new Date(b.started_at).toLocaleDateString("en-IN")}</b><small>{new Date(b.started_at).toLocaleTimeString("en-IN")} – {b.ended_at?new Date(b.ended_at).toLocaleTimeString("en-IN"):"In progress"}</small></div></article>)}</Panel>
      <Panel title="This month's work" subtitle="Hours from your verified work log."><div className="phase2Metric"><b>{monthHours.toFixed(1)} h</b><small>Logged hours</small></div><div className="phase2Metric"><b>{money(earned)}</b><small>Owner-approved incentives</small></div><p className="muted">Daily wage: {money(me.daily_wage)} · Attendance and incentive records are visible to you and the owner.</p></Panel>
    </div>;
  }

  if (tab === "service") return <div className="phase2Grid">
    <Panel title="Schedule machine maintenance" subtitle="Track service, repairs, inspections, insurance and permit expiry.">
      <SelectField label="Machine" value={newMaintenance.machine_id} onChange={e=>setNewMaintenance(v=>({...v,machine_id:e.target.value}))}><option value="">Choose machine</option>{(data?.machines||[]).map(m=><option key={m.id} value={m.id}>{m.model} · {m.reg_no||"No reg."}</option>)}</SelectField>
      <SelectField label="Type" value={newMaintenance.maintenance_type} onChange={e=>setNewMaintenance(v=>({...v,maintenance_type:e.target.value}))}>{["service","repair","inspection","insurance","permit","other"].map(x=><option key={x}>{x}</option>)}</SelectField>
      <TextField label="Description" value={newMaintenance.description} onChange={e=>setNewMaintenance(v=>({...v,description:e.target.value}))} placeholder="e.g. 500-hour service"/>
      <TextField label="Due date" type="date" value={newMaintenance.due_date} onChange={e=>setNewMaintenance(v=>({...v,due_date:e.target.value}))}/>
      <TextField label="Estimated cost (₹)" type="number" min="0" value={newMaintenance.cost} onChange={e=>setNewMaintenance(v=>({...v,cost:e.target.value}))}/>
      <button className="btn" onClick={saveMaintenance}>Schedule maintenance</button>
    </Panel>
    <Panel title="Maintenance calendar">{maintenance.map(m=><article className="phase2Row" key={m.id}><div><b>{m.machines?.model} · {m.maintenance_type}</b><small>{m.description} · Due {m.due_date||"not set"} · {money(m.cost)}</small></div>{m.status!=="completed"?<button className="btn secondary" onClick={()=>completeMaintenance(m)}>Complete</button>:<em className="phase2Status completed">Done</em>}</article>)}{maintenance.length===0&&<EmptyState>No maintenance scheduled.</EmptyState>}</Panel>
    <Panel title="Record machine expense" subtitle="Manual expense entries are stored separately from operator photo-proof logs.">
      <SelectField label="Machine" value={newExpense.machine_id} onChange={e=>setNewExpense(v=>({...v,machine_id:e.target.value}))}><option value="">Choose machine</option>{(data?.machines||[]).map(m=><option key={m.id} value={m.id}>{m.model}</option>)}</SelectField>
      <SelectField label="Category" value={newExpense.category} onChange={e=>setNewExpense(v=>({...v,category:e.target.value}))}>{["diesel","repair","service","transport","permit","other"].map(x=><option key={x}>{x}</option>)}</SelectField>
      <TextField label="Amount (₹)" type="number" min="1" value={newExpense.amount} onChange={e=>setNewExpense(v=>({...v,amount:e.target.value}))}/>
      <TextField label="Notes" value={newExpense.notes} onChange={e=>setNewExpense(v=>({...v,notes:e.target.value}))}/>
      <button className="btn" onClick={saveExpense}>Save expense</button>
    </Panel>
    <Panel title="Recent expenses">{expenses.map(e=><article className="phase2Row" key={e.id}><div><b>{e.machines?.model} · {e.category}</b><small>{e.notes||"—"} · {new Date(e.expense_date).toLocaleDateString("en-IN")}</small></div><strong>{money(e.amount)}</strong></article>)}{expenses.length===0&&<EmptyState>No machine expenses recorded.</EmptyState>}</Panel>
  </div>;

  if (tab === "payroll") return <div className="phase2Grid">
    <Panel title="Mark today's attendance" subtitle="Only the owner can create or edit attendance on behalf of operators.">
      {(data?.users||[]).filter(u=>u.role==="driver").map(d=><article className="phase2Row" key={d.id}><div><b>{d.name||d.phone||"Operator"}</b><small>Daily wage · {money(d.daily_wage)}</small></div><div className="buttonRow"><button className="btn secondary" onClick={()=>markAttendance(d.id,"present")}>Present</button><button className="btn secondary" onClick={()=>markAttendance(d.id,"absent")}>Absent</button><button className="btn secondary" onClick={()=>markAttendance(d.id,"half_day")}>Half day</button></div></article>)}
    </Panel>
    <Panel title="Add operator incentive"><SelectField label="Operator" value={newIncentive.driver_id} onChange={e=>setNewIncentive(v=>({...v,driver_id:e.target.value}))}><option value="">Choose operator</option>{(data?.users||[]).filter(u=>u.role==="driver").map(d=><option key={d.id} value={d.id}>{d.name||d.phone}</option>)}</SelectField><TextField label="Amount (₹)" type="number" min="1" value={newIncentive.amount} onChange={e=>setNewIncentive(v=>({...v,amount:e.target.value}))}/><TextField label="Reason" value={newIncentive.reason} onChange={e=>setNewIncentive(v=>({...v,reason:e.target.value}))} placeholder="On-time completion, extra shift…"/><button className="btn" onClick={saveIncentive}>Add incentive</button></Panel>
    <Panel title="Attendance register">{attendance.map(a=><article className="phase2Row" key={a.id}><div><b>{a.profiles?.name||a.profiles?.phone||"Operator"}</b><small>{a.attendance_date} · {a.check_in?new Date(a.check_in).toLocaleTimeString("en-IN"):"No check-in"} – {a.check_out?new Date(a.check_out).toLocaleTimeString("en-IN"):"—"}</small></div><em className={"phase2Status "+a.status}>{a.status}</em></article>)}{attendance.length===0&&<EmptyState>No attendance entries this month.</EmptyState>}</Panel>
    <Panel title="Incentive ledger">{incentives.map(i=><article className="phase2Row" key={i.id}><div><b>{i.profiles?.name||i.profiles?.phone||"Operator"}</b><small>{i.reason} · {i.period_month}</small></div><strong>{money(i.amount)}</strong></article>)}{incentives.length===0&&<EmptyState>No incentives recorded.</EmptyState>}</Panel>
  </div>;

  if (tab === "offers") return <div className="phase2Grid">
    <Panel title="Publish a coupon" subtitle="Coupons are time-bound and have server-side redemption limits."><TextField label="Coupon code" value={newCoupon.code} onChange={e=>setNewCoupon(v=>({...v,code:e.target.value.toUpperCase()}))} placeholder="WELCOME10"/><TextField label="Description" value={newCoupon.description} onChange={e=>setNewCoupon(v=>({...v,description:e.target.value}))} placeholder="New customer offer"/><SelectField label="Discount type" value={newCoupon.discount_type} onChange={e=>setNewCoupon(v=>({...v,discount_type:e.target.value}))}><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></SelectField><TextField label="Discount value" type="number" min="1" value={newCoupon.discount_value} onChange={e=>setNewCoupon(v=>({...v,discount_value:e.target.value}))}/><TextField label="Expiry (optional)" type="datetime-local" value={newCoupon.expires_at} onChange={e=>setNewCoupon(v=>({...v,expires_at:e.target.value?new Date(e.target.value).toISOString():""}))}/><button className="btn" onClick={createCoupon}>Publish coupon</button></Panel>
    <Panel title="Active coupons">{coupons.map(c=><article className="phase2Coupon" key={c.id}><div><b>{c.code}</b><small>{c.description||"Offer"} · {c.expires_at?new Date(c.expires_at).toLocaleDateString("en-IN"):"No expiry"}</small></div><strong>{c.discount_type==="percent"?c.discount_value+"%":money(c.discount_value)} OFF</strong></article>)}{coupons.length===0&&<EmptyState>No coupons published.</EmptyState>}</Panel><Panel title="Referral invitations">{referrals.map(r=><article className="phase2Row" key={r.id}><div><b>{r.referred_phone}</b><small>{r.referral_code} · {r.status}</small></div><div className="buttonRow"><button className="btn secondary" onClick={()=>updateReferral(r,"qualified")}>Qualify</button><button className="btn" onClick={()=>updateReferral(r,"rewarded")}>Rewarded</button></div></article>)}{referrals.length===0&&<EmptyState>No referrals recorded.</EmptyState>}</Panel>
  </div>;

  return null;
}
