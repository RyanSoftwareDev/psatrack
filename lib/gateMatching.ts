export function metersBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function matchAircraftToGates(aircraft: any[], gates: any[]) {
  return gates.map((gate) => {
    const nearby = aircraft.find((a) => {
      const lat = a?.lat;
      const lon = a?.lon ?? a?.lng; // support either shape

      if (typeof lat !== "number" || typeof lon !== "number") return false;

      const d = metersBetween({ lat, lon }, gate.position);

      // Gate occupancy rule: very close + basically stopped
      const speed = a?.velocity ?? 999; // m/s
      return d < 40 && speed < 5;
    });

    return { gateId: gate.id, aircraft: nearby || null };
  });
}
