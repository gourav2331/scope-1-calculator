import { NextResponse } from 'next/server'

import { calculateOilGas } from '@/lib/engine/oilgas'
import type { OilGasInputPayload } from '@/lib/engine/oilgas'
import { buildOilGasPdf } from '@/lib/report/oilgas-pdf'
import { buildOilGasWorkbook } from '@/lib/report/oilgas-workbook'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let body: { payload: OilGasInputPayload; format: 'json' | 'xlsx' | 'pdf' }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { payload, format } = body
  if (!payload) return NextResponse.json({ error: 'Missing payload' }, { status: 400 })

  const result = calculateOilGas(payload)
  // Strip non-ASCII characters from the filename — Content-Disposition
  // headers must be ASCII-only (bytes 0-255). Em-dash / smart quotes /
  // accented chars in facility names would otherwise crash with
  // "Cannot convert argument to a ByteString...".
  const safeName = (payload.facility?.name ?? 'facility')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
  const base = `scope1-oilgas-${safeName}-FY${result.reportingPeriod.year}`

  if (format === 'json') {
    return new NextResponse(JSON.stringify({ inputPayload: payload, result }, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${base}.json"`,
      },
    })
  }

  if (format === 'xlsx') {
    const buf = await buildOilGasWorkbook(payload, result)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${base}.xlsx"`,
      },
    })
  }

  if (format === 'pdf') {
    const buf = await buildOilGasPdf(payload, result)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${base}.pdf"`,
      },
    })
  }

  return NextResponse.json({ error: 'Unknown format' }, { status: 400 })
}
