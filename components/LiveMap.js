"use client";
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const machineIcon = L.divIcon({ html: "<div style='font-size:32px;filter:drop-shadow(0 3px 5px #000)'>🚜</div>", className: "", iconSize: [38,38], iconAnchor: [19,19] });
function Follow({ point }) {
  const map = useMap();
  useEffect(() => { if (point) map.flyTo(point, Math.max(map.getZoom(), 15), { duration: 0.8 }); }, [point?.[0], point?.[1], map]);
  return null;
}
export default function LiveMap({ supabase, bookingId }) {
  const [point, setPoint] = useState(null);
  const [updated, setUpdated] = useState(null);
  useEffect(() => {
    let alive = true;
    supabase.from("locations").select("*").eq("booking_id", bookingId).maybeSingle().then(({data}) => {
      if (alive && data) { setPoint([data.lat, data.lng]); setUpdated(data.updated_at); }
    });
    const channel = supabase.channel("location-" + bookingId)
      .on("postgres_changes", { event: "*", schema: "public", table: "locations", filter: "booking_id=eq." + bookingId }, (payload) => {
        if (payload.new?.lat != null && payload.new?.lng != null) {
          setPoint([payload.new.lat, payload.new.lng]); setUpdated(payload.new.updated_at);
        }
      }).subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [supabase, bookingId]);
  if (!point) return <div className="emptyBox"><div className="emptyIcon">📡</div><b>Waiting for GPS</b><p>The operator needs to start work and allow location access.</p></div>;
  return <div className="mapWrap">
    <MapContainer center={point} zoom={15} scrollWheelZoom style={{height:300,width:"100%"}}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap contributors"/>
      <Marker position={point} icon={machineIcon}/><Follow point={point}/>
    </MapContainer>
    <div className="mapMeta">Last GPS update: {updated ? new Date(updated).toLocaleTimeString("en-IN") : "—"}</div>
  </div>;
}
