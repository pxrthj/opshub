import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { ArrowRight, Check, ChevronDown, Compass, LogIn, PartyPopper, RotateCcw, X } from "lucide-react"
import { loadDb, resetDb } from "@/api/db"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/AuthContext"
import { GUIDE_STEPS, PEOPLE, meterStock, type GuidePerson, type GuideStep } from "@/lib/guide"
import { errorMessage } from "@/lib/useAsync"
import { cn } from "@/lib/utils"
import { ConfirmDialog } from "./ConfirmDialog"

const STORE_KEY = "opshub.guide.v1"

interface GuideState {
  open: boolean
  visited: Record<string, boolean>
}

function readState(): GuideState {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) return { open: true, visited: {}, ...JSON.parse(raw) }
  } catch {
    // ignore
  }
  return { open: true, visited: {} }
}

/** Renders "**bold**" segments inside an instruction line. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") ? (
          <b key={i} className="font-semibold text-slate-900">
            {part.slice(2, -2)}
          </b>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

function Avatar({ p, size = "size-7" }: { p: GuidePerson; size?: string }) {
  return <span className={cn("flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white", p.color, size)}>{p.name[0]}</span>
}

/**
 * Floating step-by-step guide for the demo story. It reads the demo data to tick steps
 * off automatically, and can log you in as the right person for each step.
 */
export function DemoGuide() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [state, setState] = useState<GuideState>(readState)
  const [tick, setTick] = useState(0)
  const [busy, setBusy] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state))
    } catch {
      // ignore
    }
  }, [state])

  // Re-check progress every second (the data lives in localStorage).
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const db = useMemo(() => loadDb(), [tick, pathname, user])
  const done = GUIDE_STEPS.map((s) => s.done({ db, visited: state.visited }))
  const currentIdx = done.findIndex((d) => !d)
  const current: GuideStep | undefined = GUIDE_STEPS[currentIdx]
  const doneCount = done.filter(Boolean).length
  const rightPerson = !!current && user?.id === current.who.id
  const onTheSpot = !!current && pathname.startsWith(current.path)

  // "Go and look" steps tick themselves off when the right person opens the right page.
  useEffect(() => {
    if (current?.visitPath && rightPerson && pathname.startsWith(current.visitPath) && !state.visited[current.id]) {
      const id = current.id
      const t = setTimeout(() => setState((s) => ({ ...s, visited: { ...s.visited, [id]: true } })), 1500)
      return () => clearTimeout(t)
    }
  }, [current, rightPerson, pathname, state.visited])

  async function switchTo(p: GuidePerson, path: string) {
    setBusy(true)
    try {
      await login(p.email, p.password)
      // wait a tick so the login page's own redirect (to "/") doesn't override ours
      setTimeout(() => navigate(path), 50)
      toast.success(`You are now ${p.name} (${p.job})`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function startOver() {
    resetDb()
    setState({ open: true, visited: {} })
    try {
      await login(PEOPLE.aarti.email, PEOPLE.aarti.password)
    } catch {
      // ignore — reload below shows the login page
    }
    window.location.assign("/")
  }

  if (!state.open) {
    return (
      <button
        onClick={() => setState((s) => ({ ...s, open: true }))}
        className="fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg hover:bg-slate-800"
      >
        <Compass className="size-4" /> Demo guide · {doneCount}/{GUIDE_STEPS.length}
      </button>
    )
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 flex max-h-[75vh] w-[350px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-sm text-slate-700 shadow-2xl">
      <div className="flex items-center gap-2 bg-slate-900 px-4 py-2.5 text-white">
        <Compass className="size-4" />
        <span className="font-semibold">Demo guide</span>
        <span className="text-xs text-slate-300">
          step {Math.min(doneCount + 1, GUIDE_STEPS.length)} of {GUIDE_STEPS.length}
        </span>
        <button className="ml-auto rounded p-1 hover:bg-white/10" onClick={() => setState((s) => ({ ...s, open: false }))} aria-label="Minimise guide">
          <ChevronDown className="size-4" />
        </button>
      </div>
      <div className="h-1 bg-slate-100">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(doneCount / GUIDE_STEPS.length) * 100}%` }} />
      </div>

      <div className="overflow-y-auto">
        {current ? (
          <div className="space-y-3 border-b bg-amber-50/60 p-4">
            <p className="text-[11px] font-semibold tracking-wider text-amber-700 uppercase">Do this now</p>
            <div className="flex items-center gap-2.5">
              <Avatar p={current.who} size="size-9" />
              <div>
                <p className="leading-tight font-semibold text-slate-900">{current.title}</p>
                <p className="text-xs text-slate-500">
                  as {current.who.name} · {current.who.job}
                </p>
              </div>
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-[13px] leading-snug">
              {current.doThis.map((line) => (
                <li key={line}>
                  <Rich text={line} />
                </li>
              ))}
            </ol>
            {!rightPerson ? (
              <div className="space-y-1.5">
                <p className="text-xs text-slate-500">
                  {user ? (
                    <>
                      You're logged in as <b>{user.name.split(" ")[0]}</b>. This step is for <b>{current.who.name}</b>.
                    </>
                  ) : (
                    <>Start by logging in as {current.who.name}.</>
                  )}
                </p>
                <Button className="w-full" disabled={busy} onClick={() => switchTo(current.who, current.path)}>
                  <LogIn /> Log in as {current.who.name} and go there
                </Button>
              </div>
            ) : !onTheSpot ? (
              <Button className="w-full" onClick={() => navigate(current.path)}>
                Take me there <ArrowRight />
              </Button>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-emerald-700">
                <Check className="size-3.5" /> You're on the right page — follow the steps above. This box ticks itself off.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2 border-b bg-emerald-50 p-4 text-center">
            <PartyPopper className="mx-auto size-7 text-emerald-600" />
            <p className="font-semibold text-slate-900">All done!</p>
            <p className="text-[13px]">
              You followed one batch of meters through all three offices. The warehouse now has <b>{meterStock(db)}</b> meters.
            </p>
          </div>
        )}

        <ol className="p-2">
          {GUIDE_STEPS.map((s, i) => (
            <li key={s.id} className={cn("flex items-center gap-2.5 rounded-md px-2 py-1.5", i === currentIdx && "bg-slate-100")}>
              {done[i] ? (
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Check className="size-3" />
                </span>
              ) : (
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold",
                    i === currentIdx ? "border-slate-900 text-slate-900" : "border-slate-300 text-slate-400",
                  )}
                >
                  {i + 1}
                </span>
              )}
              <span className={cn("flex-1 text-[13px] leading-tight", done[i] ? "text-slate-400 line-through" : i === currentIdx ? "font-medium text-slate-900" : "text-slate-500")}>
                {s.title}
              </span>
              <Avatar p={s.who} size="size-5" />
            </li>
          ))}
        </ol>
      </div>

      <div className="flex items-center justify-between border-t bg-slate-50 px-3 py-2 text-xs">
        <span className="text-slate-500">Meters in warehouse: <b className="text-slate-900 tabular-nums">{meterStock(db) ?? "—"}</b></span>
        <div className="flex gap-1">
          <Button size="xs" variant="ghost" onClick={() => setResetOpen(true)}>
            <RotateCcw /> Start over
          </Button>
          <Button size="icon-xs" variant="ghost" onClick={() => setState((s) => ({ ...s, open: false }))} aria-label="Hide guide">
            <X />
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Start the demo over?"
        description="All demo data goes back to the beginning (500 meters, no new requests) and the guide restarts from step 1."
        confirmLabel="Start over"
        onConfirm={startOver}
      />
    </div>
  )
}
