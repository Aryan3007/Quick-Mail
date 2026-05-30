import { useAuth } from '../hooks/useAuth'

export function SignIn() {
  const { signingIn, error, signInWithGoogle } = useAuth()

  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden bg-surface text-fg">
      <div className="pointer-events-none absolute inset-0 opacity-60 bg-[radial-gradient(circle_at_top_left,var(--color-accent-soft),transparent_45%),radial-gradient(circle_at_bottom_right,var(--color-surface-muted),transparent_55%)]" />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-surface-elevated p-8">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-white">
            Q
          </span>
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-fg-subtle">
            QuikMail
          </span>
        </div>

        <h1 className="font-serif-display text-[28px] leading-tight font-semibold tracking-tight text-fg">
          A calmer inbox,
          <br />
          with an assistant that drafts.
        </h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-fg-muted">
          Connect your Google account to triage, summarise, and reply with one keystroke.
        </p>

        <button
          type="button"
          disabled={signingIn}
          onClick={signInWithGoogle}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-lg bg-fg px-4 py-2.5 text-sm font-medium text-surface-elevated transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <GoogleMark />
          {signingIn ? 'Opening browser…' : 'Continue with Google'}
        </button>

        <p className="mt-4 text-[11px] leading-relaxed text-fg-subtle">
          By continuing, you agree to grant QuikMail read &amp; send access to your Gmail account.
          Tokens stay encrypted on this device.
        </p>

        {error ? (
          <p className="mt-4 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-xs text-accent">
            {error}
          </p>
        ) : null}
      </div>

      <p className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-[11px] text-fg-subtle">
        Local-first · Encrypted credentials · Audit log on every agent action
      </p>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58Z"
      />
    </svg>
  )
}
