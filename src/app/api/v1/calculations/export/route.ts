import { NextResponse } from 'next/server'

import { calculate } from '@/lib/engine/calculate'
import type { InputPayload } from '@/lib/engine/types'
import { buildPdf } from '@/lib/report/pdf'
import { buildWorkbook } from '@/lib/report/workbook'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let body: { payload: InputPayload; format: 'json' | 'xlsx' | 'pdf' }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { payload, format } = body
  if (!payload) return NextResponse.json({ error: 'Missing payload' }, { status: 400 })

  const result = calculate(payload)
  const base = `scope1-${(payload.facility?.name ?? 'facility').replace(/\s+/g, '_')}-FY${result.reportingPeriod.year}`

  if (format === 'json') {
    return new NextResponse(JSON.stringify({ inputPayload: payload, result }, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${base}.json"`,
      },
    })
  }

  if (format === 'xlsx') {
    const buf = await buildWorkbook(payload, result)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${base}.xlsx"`,
      },
    })
  }

  if (format === 'pdf') {
    const buf = await buildPdf(payload, result)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${base}.pdf"`,
      },
    })
  }

  return NextResponse.json({ error: 'Unknown format' }, { status: 400 })
}
