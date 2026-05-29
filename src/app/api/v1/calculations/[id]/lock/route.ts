import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * Lock a saved calculation. Flips workflowStatus → 'locked' and stamps
 * lockedAt / lockedBy. The FRS state-machine intent is that a locked
 * inventory is immutable; future engine re-runs against the same row
 * are blocked. (Editability enforcement is added in the wizard.)
 *
 * Body: { actor?: string } — who locked it (free-text for now;
 * maker-checker with real user roles is a follow-up).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing calculation id' }, { status: 400 })
  let body: { actor?: string } = {}
  try { body = await req.json() } catch { /* empty body is fine */ }

  try {
    const { getPayload } = await import('payload')
    const config = (await import('@/payload.config')).default
    const cms = await getPayload({ config })
    // Cast through unknown — the generated payload-types.ts hasn't picked up
    // workflowStatus / lockedAt / lockedBy yet (regenerates on dev restart).
    const updateData: Record<string, unknown> = {
      workflowStatus: 'locked',
      lockedAt: new Date().toISOString(),
      lockedBy: body.actor || 'system',
    }
    const updated = (await cms.update({
      collection: 'calculations',
      id,
      data: updateData as never,
    })) as unknown as Record<string, unknown>
    return NextResponse.json({
      id: updated.id ?? id,
      workflowStatus: 'locked',
      lockedAt: updated.lockedAt,
      lockedBy: updated.lockedBy,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Lock failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
