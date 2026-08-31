import s from '../../app/dashboard/dashboard.module.css'

export interface ProductProfileProps {
  productName: string
  whatItIs: string
  whatItHolds: string[]
  whoItsFor: string[]
  keyBenefits: string[]
  comparisons: { product: string; difference: string; useWhen: string }[]
  whenToUseVs: { useThis: string; useAlternative: string; alternative: string }[]
  gaps: string[]  // common gaps in client plans this product addresses
}

export default function ProductProfile({
  productName, whatItIs, whatItHolds, whoItsFor, keyBenefits, comparisons, whenToUseVs, gaps,
}: ProductProfileProps) {
  return (
    <div className={s.profileSection}>
      <span className={s.eyebrow}>Product Profile</span>

      <div className={s.profileGrid}>
        {/* Card 1 — What It Is & Holds */}
        <div className={s.profileCard}>
          <div className={s.profileCardTitle}>What It Is</div>
          <p className={s.profileText}>{whatItIs}</p>
          <div className={s.profileCardTitle} style={{ marginTop: 14 }}>What Can Be Held Inside</div>
          <div className={s.profileChips}>
            {whatItHolds.map(item => (
              <span key={item} className={s.profileChip}>{item}</span>
            ))}
          </div>
          <div className={s.profileCardTitle} style={{ marginTop: 14 }}>Key Benefits</div>
          <div className={s.profileBulletList}>
            {keyBenefits.map(item => (
              <div key={item} className={s.profileBullet}>
                <span className={s.profileDotOnline} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Card 2 — Who It's For */}
        <div className={s.profileCard}>
          <div className={s.profileCardTitle}>Typical Client Profile</div>
          <div className={s.profileBulletList}>
            {whoItsFor.map(item => (
              <div key={item} className={s.profileBullet}>
                <span className={s.profileDotAccent} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Card 3 — Common Gaps It Addresses */}
        <div className={s.profileCard}>
          <div className={[s.profileCardTitle, s.profileCardTitleIdle].join(' ')}>Gaps It Fixes</div>
          <div className={s.profileBulletList}>
            {gaps.map(item => (
              <div key={item} className={s.profileBullet}>
                <span className={s.profileDotIdle} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Card 4 — Compare It To */}
        <div className={s.profileCard}>
          <div className={s.profileCardTitle}>How It Compares</div>
          <div className={s.profileComparisonList}>
            {comparisons.map(c => (
              <div key={c.product} className={s.profileComparison}>
                <span className={s.profileChip}>{c.product}</span>
                <p className={s.profileText}>{c.difference}</p>
                <p className={s.profileUseWhen}>Use this when: {c.useWhen}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Decision Guide — full width below the grid */}
      <div className={s.profileDecisionCard}>
        <div className={s.profileCardTitle}>Decision Guide</div>
        <div className={s.profileDecisionTable}>
          <div className={s.profileDecisionHead}>
            <span>Use {productName} when…</span>
            <span>Use the alternative instead when…</span>
          </div>
          {whenToUseVs.map(row => (
            <div key={row.useThis} className={s.profileDecisionRow}>
              <span>{row.useThis}</span>
              <span>{row.useAlternative} — <em>{row.alternative}</em></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
