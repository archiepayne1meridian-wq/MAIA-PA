import s from '../hub.module.css'

export default function DvLogo() {
  return (
    <svg className={s.dvLogo} viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="19" cy="19" r="17.5" fill="rgba(232,114,28,0.1)" stroke="#E8721C" strokeWidth="1.5" />
      <text x="19" y="26" textAnchor="middle" fontFamily="Georgia, serif" fontSize="17" fontWeight="700" fill="#E8721C">
        d<tspan fill="#F59E0B">V</tspan>
      </text>
    </svg>
  )
}
