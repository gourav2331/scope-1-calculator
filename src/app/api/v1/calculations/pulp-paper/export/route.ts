import { NextResponse } from 'next/server'

import { calculatePulpPaper } from '@/lib/engine/pulppaper'
import type { PulpPaperInputPayload } from '@/lib/engine/pulppaper'
import { buildPulpPaperPdf } from '@/lib/report/pulppaper-pdf'
import { buildPulpPaperWorkbook } from '@/lib/report/pulppaper-workbook'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let body: { payload: PulpPaperInputPayload; format: 'json' | 'xlsx' | 'pdf' }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { payload, format } = body
  if (!payload) return NextResponse.json({ error: 'Missing payload' }, { status: 400 })

  const result = calculatePulpPaper(payload)
  const base = `scope1-pulppaper-${(payload.facility?.name ?? 'mill').replace(/\s+/g, '_')}-FY${result.reportingPeriod.year}`

  if (format === 'json') {
    return new NextResponse(JSON.stringify({ inputPayload: payload, result }, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${base}.json"`,
      },
    })
  }
  if (format === 'xlsx') {
    const buf = await buildPulpPaperWorkbook(payload, result)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${base}.xlsx"`,
      },
    })
  }
  if (format === 'pdf') {
    const buf = await buildPulpPaperPdf(payload, result)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${base}.pdf"`,
      },
    })
  }
  return NextResponse.json({ error: 'Unknown format' }, { status: 400 })
}
