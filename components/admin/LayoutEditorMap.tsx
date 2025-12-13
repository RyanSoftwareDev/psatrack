"use client";

import {
  MapContainer as LeafletMapContainer,
  TileLayer as LeafletTileLayer,
  CircleMarker as LeafletCircleMarker,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

const MapContainer = LeafletMapContainer as any;
const TileLayer = LeafletTileLayer as any;
const CircleMarker = LeafletCircleMarker as any;

type LatLng = { lat: number; lon: number };

type Gate = {
  id: string;
  position: LatLng;
};

type Props = {
  center: LatLng;
  gates: Gate[];
  onAddGate: (pos: LatLng) => void;
};

function ClickToAddGate({
  onAdd,
}: {
  onAdd: (pos: LatLng) => void;
}) {
  useMapEvents({
    click(e: any) {
      console.log("Map click:", e.latlng);
      onAdd({ lat: e.latlng.lat, lon: e.latlng.lng });
    },
  });
  return null;
}

export function LayoutEditorMap({
  center,
  gates,
  onAddGate,
}: Props) {
  return (
    <MapContainer
      key={`${center.lat}-${center.lon}-${gates.length}`}
      center={[center.lat, center.lon]}
      zoom={14}
      className="h-[500px] w-full rounded-xl"
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      <ClickToAddGate onAdd={onAddGate} />

      {gates.map((g) => (
        <CircleMarker
          key={g.id}
          center={[g.position.lat, g.position.lon]}
          radius={5}
          pathOptions={{ color: "#22c55e" }}
        />
      ))}
    </MapContainer>
  );
}