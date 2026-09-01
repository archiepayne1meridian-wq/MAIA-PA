'use client'

import { useRouter } from 'next/navigation'
import s from '../dashboard.module.css'

interface ProductCard {
  id: string
  name: string
  description: string
  status: 'active' | 'coming-soon'
  accent: string
}

const products: ProductCard[] = [
  {
    id: 'structured-notes',
    name: 'Structured Notes',
    description: 'Visualize autocall barriers, coupon payments, memory function and capital protection',
    status: 'active',
    accent: '#8AA9F0',
  },
  {
    id: 'portfolio-bond',
    name: 'Portfolio Bond',
    description: 'Tax deferral vs annual taxation, 5% withdrawal allowance, time-apportionment relief',
    status: 'active',
    accent: '#7BC99A',
  },
  {
    id: 'ardan-platform',
    name: 'Ardan Platform',
    description: 'Cost transparency — platform, adviser and fund fees vs bundled alternatives',
    status: 'active',
    accent: '#B87FD4',
  },
  {
    id: 'liberty-vb',
    name: 'Liberty Vested Benefits',
    description: 'Cash at 0.02% vs Liberty Invest — real value erosion and growth comparison',
    status: 'active',
    accent: '#E0B341',
  },
  {
    id: 'axa-pillar3',
    name: 'AXA SmartFlex Pillar 3',
    description: 'Guaranteed vs market-linked split, contribution growth, Swiss tax saving',
    status: 'coming-soon',
    accent: '#5BC0C0',
  },
  {
    id: 'sipp-vs-qrops',
    name: 'SIPP vs QROPS',
    description: 'Side by side comparison — charges, portability, IHT exposure post-2027',
    status: 'coming-soon',
    accent: '#E07A5F',
  },
]

const ROUTES: Record<string, string> = {
  'structured-notes': '/dashboard/visualizer/structured-notes',
  'portfolio-bond': '/dashboard/visualizer/portfolio-bond',
  'ardan-platform': '/dashboard/visualizer/ardan-platform',
  'liberty-vb': '/dashboard/visualizer/liberty-vb',
}

export default function VisualizerHome() {
  const router = useRouter()

  return (
    <div className={s.visualizerHome}>
      <button className={s.museBackBtn} onClick={() => router.push('/dashboard')}>← MAIA</button>

      <div className={s.visualizerHomeHead}>
        <div className={s.drawerBadge}>AT</div>
        <div>
          <div className={s.drawerName}>ATLAS</div>
          <div className={s.drawerRole}>Deterministic client-facing product illustrations</div>
        </div>
      </div>

      <div className={s.visualizerGrid}>
        {products.map(p => (
          <button
            key={p.id}
            className={[
              s.visualizerCard,
              p.status === 'active' ? s.visualizerCardActive : s.visualizerCardComingSoon,
            ].join(' ')}
            style={{ borderLeftColor: p.accent }}
            onClick={() => { if (p.status === 'active' && ROUTES[p.id]) router.push(ROUTES[p.id]) }}
            disabled={p.status !== 'active'}
          >
            {p.status === 'coming-soon' && <span className={s.visualizerComingSoonChip}>Coming Soon</span>}
            <div className={s.visualizerCardName}>{p.name}</div>
            <div className={s.visualizerCardDesc}>{p.description}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
