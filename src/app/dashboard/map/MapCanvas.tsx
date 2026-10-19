'use client'

// The actual Leaflet map — split out from MapWorkspace.tsx and loaded via
// next/dynamic with ssr:false there, since Leaflet touches window/document
// at mount and can't be server-rendered.

import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import type { MapCompanyWithStats } from '../../../../tools/map-db'

interface Props {
  companies: MapCompanyWithStats[]
  selectedId: number | null
  onSelect: (id: number) => void
}

// Greater Geneva — matches the spec's seed data footprint.
const CENTER: [number, number] = [46.2044, 6.1432]
const ZOOM = 11

// Uniform small pins, not sized by headcount — central Geneva is dense
// enough that size-by-employees just produced overlapping blobs. Headcount
// still shows in the right panel.
function getPinColour(c: MapCompanyWithStats): string {
  if (c.prospect_priority === 'avoid') return '#e74c3c'
  if (c.prospect_priority === 'high' && c.total_booked === 0 && c.total_washed === 0) return '#9b59b6'
  if (c.total_booked >= 3) return '#e8621a'
  if (c.total_booked > 0) return '#f39c12'
  if (c.total_washed > 0) return '#3498db'
  return '#666666'
}

function createPinIcon(colour: string, selected: boolean): L.DivIcon {
  const stroke = selected ? '#fff' : 'none'
  const strokeWidth = selected ? 1.5 : 0
  return L.divIcon({
    className: '',
    html: `
      <svg width="20" height="28" viewBox="0 0 20 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 0C4.48 0 0 4.48 0 10C0 17.5 10 28 10 28C10 28 20 17.5 20 10C20 4.48 15.52 0 10 0Z" fill="${colour}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
        <circle cx="10" cy="10" r="4" fill="white" fill-opacity="0.9"/>
      </svg>
    `,
    iconSize: [20, 28],
    iconAnchor: [10, 28],
  })
}

export default function MapCanvas({ companies, selectedId, onSelect }: Props) {
  return (
    <MapContainer center={CENTER} zoom={ZOOM} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      {companies.map(c => (
        <Marker
          key={c.id}
          position={[c.lat, c.lng]}
          icon={createPinIcon(getPinColour(c), c.id === selectedId)}
          eventHandlers={{ click: () => onSelect(c.id) }}
        />
      ))}
    </MapContainer>
  )
}
