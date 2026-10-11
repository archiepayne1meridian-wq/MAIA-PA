'use client'

import { useState } from 'react'
import s from '../dashboard.module.css'

export interface CrmRow {
  firstName: string
  lastName: string
  company: string
  jobRole: string
  linkedinUrl: string
}

const CRM_COLUMNS = ['First Name', 'Last Name', 'Company', 'Job Title', 'Employment Status', 'Lead Channel', 'Country', 'LinkedIn URL']

// Employment Status / Lead Channel / Country are always these three fixed
// values for every row, per the CRM export spec — never read from the
// prospect record.
export function toCrmTSV(rows: CrmRow[]): string {
  const lines = rows.map(r => [
    r.firstName, r.lastName, r.company, r.jobRole, 'Employee', 'Cold - LinkedIn', 'Switzerland', r.linkedinUrl,
  ].join('\t'))
  return [CRM_COLUMNS.join('\t'), ...lines].join('\n')
}

export default function CrmExportPanel({ rows }: { rows: CrmRow[] }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(toCrmTSV(rows))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={s.nexusCrmExport}>
      <div className={s.nexusCrmExportHead}>CRM Export — ready to copy</div>
      <div className={s.nexusCrmExportTableWrap}>
        <table className={s.nexusCrmExportTable}>
          <thead>
            <tr>{CRM_COLUMNS.map(c => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={CRM_COLUMNS.length} className={s.nexusCrmExportEmpty}>No rows to export.</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i}>
                <td>{r.firstName}</td>
                <td>{r.lastName}</td>
                <td>{r.company}</td>
                <td>{r.jobRole}</td>
                <td>Employee</td>
                <td>Cold - LinkedIn</td>
                <td>Switzerland</td>
                <td>{r.linkedinUrl}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className={`${s.nexusBtn} ${s.nexusBtnPrimary}`} onClick={() => void copy()} disabled={rows.length === 0}>
        {copied ? 'Copied!' : 'Copy for CRM ↑'}
      </button>
    </div>
  )
}
