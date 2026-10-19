'use client'

// The actual Leaflet map — split out from MapWorkspace.tsx and loaded via
// next/dynamic with ssr:false there, since Leaflet touches window/document
// at mount and can't be server-rendered.

import 'leaflet/dist/leaflet.css'
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet'
import type { MapCompanyWithStats } from '../../../../tools/map-db'

interface Props {
  companies: MapCompanyWithStats[]
  selectedId: number | null
  onSelect: (id: number) => void
}

// Greater Geneva — matches the spec's seed data footprint.
const CENTER: [number, number] = [46.2044, 6.1432]
const ZOOM = 11

function radiusFor(employeesEst: number | null): number {
  const n = employeesEst ?? 0
  if (n < 100) return 8
  if (n < 300) return 12
  if (n < 700) return 16
  if (n < 1500) return 22
  return 30
}

// Priority order matters: a compliance "avoid" flag always wins (red), then
// booking volume (hot/warm), then whether it's being worked at all (cold),
// then a flagged-but-untouched target (purple), else plain untouched (grey).
function colourFor(c: MapCompanyWithStats): string {
  if (c.prospect_priority === 'avoid') return '#e74c3c'
  if (c.total_booked >= 3) return '#e8621a'
  if (c.total_booked >= 1) return '#f39c12'
  if (c.total_washed > 0 || c.total_calls > 0) return '#3498db'
  if (c.prospect_priority === 'high') return '#9b59b6'
  return '#666'
}

export default function MapCanvas({ companies, selectedId, onSelect }: Props) {
  return (
    <MapContainer center={CENTER} zoom={ZOOM} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      {companies.map(c => (
        <CircleMarker
          key={c.id}
          center={[c.lat, c.lng]}
          radius={radiusFor(c.employees_est)}
          pathOptions={{
            color: c.id === selectedId ? '#fff' : colourFor(c),
            weight: c.id === selectedId ? 3 : 1,
            fillColor: colourFor(c),
            fillOpacity: 0.75,
          }}
          eventHandlers={{ click: () => onSelect(c.id) }}
        />
      ))}
    </MapContainer>
  )
}
